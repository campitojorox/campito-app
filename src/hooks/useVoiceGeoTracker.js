// src/hooks/useVoiceGeoTracker.js
// Hook de React para captura simultánea y sincronizada de audio y telemetría GPS
// con respaldo automático en IndexedDB para funcionamiento offline en campo.

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── IndexedDB Helper para soporte offline ─────────────────────────────────────
const DB_NAME = 'campito_voice_geo_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_voice_tracks';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTrackOffline(record) {
  try {
    const db = await openIndexedDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(record.id);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[VoiceGeoTracker] Error guardando offline en IndexedDB:', err);
    return null;
  }
}

export async function getPendingOfflineTracks() {
  try {
    const db = await openIndexedDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[VoiceGeoTracker] Error leyendo tracks offline:', err);
    return [];
  }
}

export async function removeOfflineTrack(id) {
  try {
    const db = await openIndexedDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[VoiceGeoTracker] Error eliminando track offline:', err);
  }
}

// ─── Stream de audio persistente compartido (evita pedir permisos en cada audio) ─
let globalAudioStream = null;

async function getOrCreateAudioStream() {
  if (globalAudioStream) {
    const tracks = globalAudioStream.getAudioTracks();
    const allLive = tracks.length > 0 && tracks.every((t) => t.readyState === 'live');
    if (allLive) {
      // Reactivar el micrófono silenciado para comenzar la grabación
      tracks.forEach((t) => {
        t.enabled = true;
      });
      return globalAudioStream;
    }
    // Si alguna pista murió (ej: llamada entrante o suspensión del SO), limpiar
    tracks.forEach((t) => {
      try { t.stop(); } catch {}
    });
    globalAudioStream = null;
  }

  // Primera solicitud de permisos: el navegador pedirá confirmación solo esta primera vez
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  globalAudioStream = stream;
  return stream;
}

function muteAudioStream() {
  if (globalAudioStream) {
    // Silencia la captura de audio sin destruir el stream para que iOS y Android
    // NO vuelvan a mostrar el diálogo de confirmación de permisos en el siguiente audio
    globalAudioStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (globalAudioStream) {
      globalAudioStream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      globalAudioStream = null;
    }
  });
}

// ─── Hook useVoiceGeoTracker ──────────────────────────────────────────────────
export function useVoiceGeoTracker({
  gpsSampleIntervalMs = 1500, // Muestreo GPS cada 1.5s
  maxAccuracyThreshold = 6.0,  // Advertencia si la precisión supera los 6 metros
  autoPersistOffline = true,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentGps, setCurrentGps] = useState(null);
  const [gpsPointsCount, setGpsPointsCount] = useState(0);
  const [accuracyWarning, setAccuracyWarning] = useState(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [error, setError] = useState(null);

  // Referencias mutables para sincronización de audio y telemetría
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const watchIdRef = useRef(null);
  const t0Ref = useRef(0);
  const gpsTrackRef = useRef([]);
  const lastSampleTimeRef = useRef(0);
  const timerIntervalRef = useRef(null);

  // Actualizar conteo de tracks pendientes al montar
  useEffect(() => {
    getPendingOfflineTracks().then((tracks) => {
      setPendingOfflineCount(tracks.length);
    });
  }, []);

  // ── Iniciar grabación sincronizada de audio + GPS ───────────────────────────
  const startTracking = useCallback(async (options = {}) => {
    const { initialGps = null } = options;
    setError(null);
    audioChunksRef.current = [];
    gpsTrackRef.current = [];
    setGpsPointsCount(0);
    setElapsedSeconds(0);
    setAccuracyWarning(false);

    // 1. Verificar soporte de APIs
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('El navegador no admite grabación de audio (getUserMedia)');
      setError(err.message);
      throw err;
    }

    if (!navigator.geolocation) {
      const err = new Error('El dispositivo no admite geolocalización GPS');
      setError(err.message);
      throw err;
    }

    try {
      // 2. Obtener stream de micrófono (reutiliza el autorizado sin pedir permisos)
      const stream = await getOrCreateAudioStream();
      streamRef.current = stream;

      // 3. Seleccionar mejor codec soportado
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 4. Marca temporal t0 exacta de inicio
      const t0 = Date.now();
      t0Ref.current = t0;
      lastSampleTimeRef.current = 0;

      // Sembrar inmediatamente la posición GPS inicial si ya se dispone de ella
      if (initialGps && typeof initialGps.lat === 'number' && typeof initialGps.lng === 'number') {
        const seedReading = {
          timestamp: t0,
          relativeTimeMs: 0,
          lat: initialGps.lat,
          lng: initialGps.lng,
          accuracy: initialGps.accuracy || 3.0,
          altitude: initialGps.altitude || null,
          speed: initialGps.speed || null,
          heading: initialGps.heading || null,
        };
        gpsTrackRef.current.push(seedReading);
        setCurrentGps(seedReading);
        setGpsPointsCount(1);
      }

      // 5. Iniciar MediaRecorder en intervalos de 500ms
      mediaRecorder.start(500);

      // 6. Iniciar seguimiento GPS continuo en tiempo real
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          const timeSinceLastSample = now - lastSampleTimeRef.current;

          // Muestrear cada gpsSampleIntervalMs (1-2s)
          if (timeSinceLastSample >= gpsSampleIntervalMs) {
            lastSampleTimeRef.current = now;

            const reading = {
              timestamp: now,
              relativeTimeMs: now - t0,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude || null,
              speed: position.coords.speed || null,
              heading: position.coords.heading || null,
            };

            gpsTrackRef.current.push(reading);
            setCurrentGps(reading);
            setGpsPointsCount(gpsTrackRef.current.length);

            // Alerta si la precisión es baja (error > 6m)
            const isDegraded = position.coords.accuracy > maxAccuracyThreshold;
            setAccuracyWarning(isDegraded);
          }
        },
        (geoErr) => {
          console.warn('[VoiceGeoTracker] Error en geolocalización:', geoErr.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 8000,
        }
      );
      watchIdRef.current = watchId;

      // 7. Contador de tiempo transcurrido
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - t0) / 1000));
      }, 1000);

      setIsRecording(true);
    } catch (err) {
      console.error('[VoiceGeoTracker] Error iniciando captura:', err);
      setError(err.message || 'Error al iniciar captura de voz y GPS');
      throw err;
    }
  }, [gpsSampleIntervalMs, maxAccuracyThreshold]);

  // ── Detener grabación y retornar paquete sincronizado ───────────────────────
  const stopTracking = useCallback(async () => {
    if (!isRecording && !mediaRecorderRef.current) {
      return null;
    }

    // 1. Limpiar GPS y reloj
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // 2. Esperar finalización del MediaRecorder antes de silenciar el stream
    const audioBlob = await new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const mime = recorder?.mimeType || 'audio/webm';
        resolve(new Blob(audioChunksRef.current, { type: mime }));
        return;
      }

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        resolve(blob);
      };
      recorder.stop();
    });

    // 3. Silenciar stream de audio sin destruirlo (evita volver a pedir permisos)
    muteAudioStream();
    streamRef.current = null;

    const t0 = t0Ref.current;
    const tEnd = Date.now();
    const durationSeconds = (tEnd - t0) / 1000;
    const finalGpsTrack = [...gpsTrackRef.current];

    // Convertir audio a dataUrl inmediatamente para reproductores de preview y APIs
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(audioBlob);
    });

    const result = {
      id: `voice_track_${t0}_${Math.random().toString(36).substring(7)}`,
      t0,
      tEnd,
      durationSeconds,
      duration: Math.max(1, Math.round(durationSeconds)),
      audioBlob,
      dataUrl,
      mimeType: audioBlob.type || 'audio/webm',
      gpsTrack: finalGpsTrack,
      totalGpsSamples: finalGpsTrack.length,
      averageAccuracy: finalGpsTrack.length > 0
        ? finalGpsTrack.reduce((sum, p) => sum + p.accuracy, 0) / finalGpsTrack.length
        : null,
      syncStatus: navigator.onLine ? 'ready' : 'pending_offline',
    };

    // 4. Si estamos offline o configurado para auto-persistir
    if (autoPersistOffline || !navigator.onLine) {
      await saveTrackOffline(result);
      const tracks = await getPendingOfflineTracks();
      setPendingOfflineCount(tracks.length);
    }

    setIsRecording(false);
    return result;
  }, [isRecording, autoPersistOffline]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      muteAudioStream();
    };
  }, []);

  return {
    isRecording,
    elapsedSeconds,
    currentGps,
    gpsPointsCount,
    accuracyWarning,
    pendingOfflineCount,
    error,
    startTracking,
    stopTracking,
  };
}

