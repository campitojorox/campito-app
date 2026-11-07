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
  const startTracking = useCallback(async () => {
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
      // 2. Solicitar permisos de micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

    // 2. Detener stream de audio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // 3. Esperar finalización del MediaRecorder
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

    const t0 = t0Ref.current;
    const tEnd = Date.now();
    const durationSeconds = (tEnd - t0) / 1000;
    const finalGpsTrack = [...gpsTrackRef.current];

    const result = {
      id: `voice_track_${t0}_${Math.random().toString(36).substring(7)}`,
      t0,
      tEnd,
      durationSeconds,
      audioBlob,
      mimeType: audioBlob.type,
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
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

