// src/hooks/useVoiceGeoTracker.js
// Hook de React para captura simultánea y sincronizada de audio y telemetría GPS
// con apagado estricto del hardware de micrófono entre grabaciones (estilo WhatsApp)
// y respaldo automático en IndexedDB para funcionamiento offline en campo.

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

async function saveTrackOffline(record) {
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

async function getPendingOfflineTracks() {
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

// ─── Gestión de Hardware de Audio (Estilo WhatsApp) ───────────────────────────
// Para que el micrófono NO quede activado (punto naranja en iOS / icono verde en Android)
// entre grabaciones, las pistas de audio se detienen completamente (track.stop()) al finalizar
// o cancelar cada nota de voz. El navegador recuerda los permisos concedidos en la primera vez,
// por lo que las siguientes sesiones inician al instante sin volver a preguntar.

export function stopMediaStream(stream) {
  if (!stream) return;
  try {
    const tracks = stream.getTracks ? stream.getTracks() : [];
    tracks.forEach((track) => {
      try {
        track.stop();
      } catch (e) {
        console.warn('[VoiceGeoTracker] Error deteniendo track:', e);
      }
    });
  } catch (err) {
    console.warn('[VoiceGeoTracker] Error en stopMediaStream:', err);
  }
}

// Caché global del último punto GPS conocido para respuesta inmediata en frío
let moduleLastKnownGps = null;

export function setGlobalLastKnownGps(gpsInfo) {
  if (gpsInfo && typeof gpsInfo.lat === 'number' && typeof gpsInfo.lng === 'number') {
    moduleLastKnownGps = {
      ...gpsInfo,
      timestamp: gpsInfo.timestamp || Date.now(),
    };
  }
}

export function getGlobalLastKnownGps() {
  return moduleLastKnownGps;
}

// ─── Helpers Compartidos de Geolocalización Segura (iOS / Safari / PWA / HTTPS) ───
export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function checkGeolocationSupport() {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return { supported: false, secure: false };
  }
  const secure = window.isSecureContext !== false;
  return { supported: true, secure };
}

export async function queryGeolocationPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'unknown'; // 'granted' | 'prompt' | 'denied'
  } catch {
    return 'unknown';
  }
}

export function normalizeGeoPosition(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy || 10,
    altitude: pos.coords.altitude || null,
    heading: pos.coords.heading || null,
    speed: pos.coords.speed || null,
    timestamp: pos.timestamp || Date.now(),
  };
}

/**
 * Solicita posición actual intentando alta precisión (GPS) con fallback automático
 * a red/Wi-Fi si ocurre timeout o indisponibilidad temporal.
 */
export function requestCurrentPositionWithFallback() {
  return new Promise((resolve, reject) => {
    const { supported, secure } = checkGeolocationSupport();
    if (!supported) {
      reject(Object.assign(new Error('Geolocalización no soportada en este navegador.'), { code: 0 }));
      return;
    }
    if (!secure) {
      reject(Object.assign(new Error('Contexto no seguro (sin HTTPS).'), { code: 1, reason: 'insecure_context' }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(normalizeGeoPosition(pos)),
      (err) => {
        if (err && (err.code === 2 || err.code === 3)) {
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => resolve(normalizeGeoPosition(fallbackPos)),
            (fallbackErr) => reject(fallbackErr),
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
          );
          return;
        }
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  });
}

export function formatGeolocationErrorMessage(err) {
  const { supported, secure } = checkGeolocationSupport();
  if (!supported) {
    return 'Tu navegador o dispositivo no soporta geolocalización GPS.';
  }
  if (!secure || err?.reason === 'insecure_context') {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'HTTP';
    return `El móvil bloquea el GPS porque estás accediendo sin HTTPS (${origin}).\n\nPara usar el GPS desde el móvil debes abrir la app mediante HTTPS (por ejemplo, la URL de Vercel o un túnel HTTPS).`;
  }
  if (err?.code === 1) {
    if (isIosDevice()) {
      return (
        'Permiso de GPS bloqueado en iPhone/Safari.\n\n' +
        'Nota: la app web NO aparece con su propio nombre en Ajustes; comparte permisos con Safari:\n' +
        '1. Ve a Ajustes → Privacidad y seguridad → Localización → "Sitios web de Safari" y elige "Mientras se usa la app".\n' +
        '2. En Safari, pulsa el icono a la izquierda de la barra de dirección → Ajustes del sitio web → Ubicación → "Permitir".\n' +
        '3. Si abres la app desde el icono de Pantalla de inicio y sigue bloqueada, quítala de la pantalla de inicio, abre primero la web en Safari, concede el permiso y vuelve a añadirla.'
      );
    }
    return 'Permiso de GPS denegado. Activa el permiso de ubicación para este sitio en los ajustes del navegador (icono de candado junto a la URL).';
  }
  return `No se pudo obtener la posición GPS (${err?.message || 'tiempo agotado'}). Comprueba que la Localización esté activa en el teléfono e inténtalo al aire libre.`;
}

// ─── Hook useVoiceGeoTracker ──────────────────────────────────────────────────
export function useVoiceGeoTracker({
  gpsSampleIntervalMs = 1500, // Muestreo GPS cada 1.5s
  maxAccuracyThreshold = 8.0,  // Advertencia si la precisión supera los 8 metros
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
    // Si options es un SyntheticEvent de React (ej: onClick={startVoiceTracking}), ignorarlo
    const cleanOptions = (options && typeof options === 'object' && !('nativeEvent' in options)) ? options : {};
    const { initialGps = null } = cleanOptions;

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
      // 2. Solicitar y abrir el stream del micrófono para esta sesión
      // La primera vez que el usuario use la app, el navegador pedirá confirmación de permisos.
      // Una vez autorizado, el navegador lo recuerda permanentemente y en las
      // siguientes sesiones se activará de forma instantánea sin volver a preguntar (igual que WhatsApp).
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

      // Sembrar inmediatamente la posición GPS inicial si ya se dispone de ella o usar caché
      const seedPosition = (initialGps && typeof initialGps.lat === 'number' && typeof initialGps.lng === 'number')
        ? initialGps
        : (moduleLastKnownGps && typeof moduleLastKnownGps.lat === 'number' && typeof moduleLastKnownGps.lng === 'number' && (Date.now() - (moduleLastKnownGps.timestamp || 0) < 180000))
          ? moduleLastKnownGps
          : null;

      if (seedPosition) {
        const seedReading = {
          timestamp: t0,
          relativeTimeMs: 0,
          lat: seedPosition.lat,
          lng: seedPosition.lng,
          accuracy: seedPosition.accuracy || 3.0,
          altitude: seedPosition.altitude || null,
          speed: seedPosition.speed || null,
          heading: seedPosition.heading || null,
        };
        gpsTrackRef.current.push(seedReading);
        setCurrentGps(seedReading);
        setGpsPointsCount(1);
      } else {
        // Intento rápido no bloqueante de captura inmediata de posición
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const reading = {
              timestamp: Date.now(),
              relativeTimeMs: Date.now() - t0,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude || null,
              speed: pos.coords.speed || null,
              heading: pos.coords.heading || null,
            };
            moduleLastKnownGps = reading;
            if (gpsTrackRef.current.length === 0) {
              gpsTrackRef.current.push(reading);
              setCurrentGps(reading);
              setGpsPointsCount(1);
            }
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 3000 }
        );
      }

      // 5. Iniciar MediaRecorder en intervalos de 500ms
      mediaRecorder.start(500);

      // 6. Iniciar seguimiento GPS continuo en tiempo real (tolerante y adaptativo para móviles)
      const handleGpsSuccess = (position) => {
        const now = Date.now();
        const timeSinceLastSample = now - lastSampleTimeRef.current;
        const currentCount = gpsTrackRef.current.length;
        const lastReading = currentCount > 0 ? gpsTrackRef.current[currentCount - 1] : null;

        // Aceptar lectura si:
        // - Es la primera lectura de la sesión
        // - Ha transcurrido el intervalo configurado (1.5s)
        // - O la precisión es notablemente mejor que la lectura anterior (mejora > 2m)
        const isBetterAccuracy = lastReading && position.coords.accuracy < (lastReading.accuracy - 2.0);

        if (currentCount === 0 || timeSinceLastSample >= gpsSampleIntervalMs || isBetterAccuracy) {
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

          moduleLastKnownGps = reading;
          gpsTrackRef.current.push(reading);
          setCurrentGps(reading);
          setGpsPointsCount(gpsTrackRef.current.length);

          const isDegraded = position.coords.accuracy > maxAccuracyThreshold;
          setAccuracyWarning(isDegraded);
        }
      };

      const handleGpsError = (geoErr) => {
        console.warn('[VoiceGeoTracker] Error o advertencia GPS:', geoErr.message, 'Código:', geoErr.code);
        if (geoErr.code === 1) { // PERMISSION_DENIED
          setError('Permiso de GPS no concedido en el navegador.');
        } else if (geoErr.code === 3 || geoErr.code === 2) { // TIMEOUT o POSITION_UNAVAILABLE
          // Reintentar con menor exigencia de hardware para capturar antenas o WiFi
          try {
            navigator.geolocation.getCurrentPosition(
              handleGpsSuccess,
              () => {},
              { enableHighAccuracy: false, maximumAge: 15000, timeout: 6000 }
            );
          } catch {
            // Ignorar si falla lectura GPS de respaldo
          }
        }
      };

      const watchId = navigator.geolocation.watchPosition(
        handleGpsSuccess,
        handleGpsError,
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 15000,
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
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
      }
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

    // 2. Esperar finalización del MediaRecorder antes de destruir las pistas de audio
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

      try {
        recorder.stop();
      } catch (e) {
        console.warn('[VoiceGeoTracker] Error deteniendo recorder:', e);
        const mime = recorder.mimeType || 'audio/webm';
        resolve(new Blob(audioChunksRef.current, { type: mime }));
      }
    });

    // 3. APAGAR COMPLETAMENTE EL MICRÓFONO DEL TELÉFONO (estilo WhatsApp)
    // Detener todas las pistas del stream para que el indicador de micrófono
    // (punto naranja en iOS o icono verde en Android) se apague de inmediato.
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;

    const t0 = t0Ref.current;
    const tEnd = Date.now();
    const durationSeconds = (tEnd - t0) / 1000;
    const finalGpsTrack = [...gpsTrackRef.current];

    // Si por alguna razón el track quedó vacío pero teníamos posición inicial o última conocida,
    // garantizar que al menos se registre la posición donde se habló
    if (finalGpsTrack.length === 0) {
      const fallbackGps = currentGps || moduleLastKnownGps;
      if (fallbackGps && typeof fallbackGps.lat === 'number' && typeof fallbackGps.lng === 'number') {
        finalGpsTrack.push({
          timestamp: t0,
          relativeTimeMs: 0,
          lat: fallbackGps.lat,
          lng: fallbackGps.lng,
          accuracy: fallbackGps.accuracy || 4.0,
          altitude: fallbackGps.altitude || null,
          speed: fallbackGps.speed || null,
          heading: fallbackGps.heading || null,
        });
      }
    }

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
  }, [isRecording, autoPersistOffline, currentGps]);

  // ── Cancelar grabación y liberar micrófono de inmediato ─────────────────────
  const cancelTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // Ignorar si el recorder ya estaba detenido
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
    audioChunksRef.current = [];
    gpsTrackRef.current = [];
    setIsRecording(false);
    setElapsedSeconds(0);
  }, []);

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
        stopMediaStream(streamRef.current);
        streamRef.current = null;
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
    cancelTracking,
  };
}
