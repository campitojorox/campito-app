// src/hooks/useMapGpsTracker.js
// Seguimiento GPS continuo en el mapa satélite y centrado en la posición del usuario.

import { useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import {
  setGlobalLastKnownGps,
  isIosDevice,
  checkGeolocationSupport,
  queryGeolocationPermissionState,
  normalizeGeoPosition,
  requestCurrentPositionWithFallback,
  formatGeolocationErrorMessage,
} from './useVoiceGeoTracker';

export function useMapGpsTracker({
  mapInstanceRef,
  userLocationLayerRef,
  liveUserGpsRef,
  setLiveUserGps,
  setGpsStatus,
  setIsLocatingUser,
  setIaFeedback,
}) {
  const gpsWatchIdRef = useRef(null);

  const updateUserLocationMarker = useCallback(
    (coords) => {
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
      const layer = userLocationLayerRef.current;
      if (!layer) return;

      layer.clearLayers();

      const { lat, lng, accuracy = 8 } = coords;

      L.circle([lat, lng], {
        radius: Math.max(accuracy, 2),
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.2,
        weight: 1.5,
        dashArray: '3, 4',
      }).addTo(layer);

      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#0284c7',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 2.5,
      });

      marker.bindTooltip(
        `<b>📍 Estás aquí</b><br/><span style="font-size:10px">Precisión: ±${accuracy.toFixed(1)} m</span>`,
        { permanent: true, direction: 'top', offset: [0, -8] }
      );

      marker.addTo(layer);
    },
    [userLocationLayerRef]
  );

  const startGpsWatch = useCallback(() => {
    const { supported, secure } = checkGeolocationSupport();
    if (!supported || !secure) return;
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const info = normalizeGeoPosition(pos);
        setLiveUserGps(info);
        liveUserGpsRef.current = info;
        setGlobalLastKnownGps(info);
        setGpsStatus('active');
        updateUserLocationMarker(info);
      },
      (err) => {
        console.warn('[FarmMap] Advertencia en watchPosition:', err.message);
        if (err.code === 1) {
          setGpsStatus('denied');
        } else if (err.code === 3 || err.code === 2) {
          setGpsStatus('weak');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, [liveUserGpsRef, setGpsStatus, setLiveUserGps, updateUserLocationMarker]);

  useEffect(() => {
    let cancelled = false;
    const { supported, secure } = checkGeolocationSupport();

    if (!supported) {
      Promise.resolve().then(() => {
        if (!cancelled) setGpsStatus('unsupported');
      });
      return () => {
        cancelled = true;
      };
    }

    if (!secure) {
      Promise.resolve().then(() => {
        if (!cancelled) setGpsStatus('insecure');
      });
      return () => {
        cancelled = true;
      };
    }

    queryGeolocationPermissionState().then((permState) => {
      if (cancelled) return;
      if (permState === 'denied') {
        setGpsStatus('denied');
        return;
      }
      if (permState === 'granted' || !isIosDevice()) {
        startGpsWatch();
      } else {
        setGpsStatus('prompt');
      }
    });

    return () => {
      cancelled = true;
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, [setGpsStatus, startGpsWatch]);

  const handleCenterOnUserLocation = useCallback(async () => {
    const { supported, secure } = checkGeolocationSupport();
    if (!supported || !secure) {
      const msg = formatGeolocationErrorMessage(null);
      setGpsStatus(!supported ? 'unsupported' : 'insecure');
      setIaFeedback({ type: 'error', text: msg.split('\n')[0] });
      alert(msg);
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    if (liveUserGpsRef.current) {
      map.setView([liveUserGpsRef.current.lat, liveUserGpsRef.current.lng], 19);
      updateUserLocationMarker(liveUserGpsRef.current);
      return;
    }

    setIsLocatingUser(true);
    try {
      const info = await requestCurrentPositionWithFallback();
      setLiveUserGps(info);
      liveUserGpsRef.current = info;
      setGlobalLastKnownGps(info);
      setGpsStatus('active');

      map.setView([info.lat, info.lng], 19);
      updateUserLocationMarker(info);
      startGpsWatch();
    } catch (err) {
      console.warn('Error capturando GPS:', err);
      const isDenied = err?.code === 1;
      setGpsStatus(isDenied ? 'denied' : 'weak');
      const msg = formatGeolocationErrorMessage(err);
      setIaFeedback({
        type: 'error',
        text: isDenied ? 'GPS sin permiso en el navegador móvil.' : 'Señal GPS no disponible.',
      });
      alert(msg);
    } finally {
      setIsLocatingUser(false);
    }
  }, [
    liveUserGpsRef,
    mapInstanceRef,
    setGpsStatus,
    setIaFeedback,
    setIsLocatingUser,
    setLiveUserGps,
    startGpsWatch,
    updateUserLocationMarker,
  ]);

  return { handleCenterOnUserLocation };
}

