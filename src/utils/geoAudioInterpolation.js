// src/utils/geoAudioInterpolation.js
// Motor de Interpolación Espacio-Temporal para asociar marcas de tiempo
// de audio con telemetría GPS continua de campo.

/**
 * Interpola las coordenadas GPS exactas para un instante específico del audio.
 *
 * @param {Object} params
 * @param {number} params.t0 - Timestamp de inicio de la grabación (epoch en milisegundos).
 * @param {Array<Object>} params.gpsTrack - Array de lecturas GPS ordenadas cronológicamente:
 *                                          [{ timestamp, relativeTimeMs, lat, lng, accuracy, altitude }]
 * @param {number} params.timestampAudioSec - Segundo del audio donde se mencionó el árbol (ej: 14.5).
 * @param {Object} [options]
 * @param {number} [options.maxAccuracyThreshold=6.0] - Umbral máximo admisible de error en metros.
 * @param {number} [options.maxTimeGapSec=12.0] - Máximo salto temporal admisible sin señal GPS.
 * @returns {Object} { lat, lng, accuracy_m, altitude_m, advertencia_gps, interpolated, time_delta_s }
 */
export function interpolateGpsAtAudioTime({
  t0,
  gpsTrack,
  timestampAudioSec,
  options = {},
}) {
  const maxAccuracy = options.maxAccuracyThreshold ?? 6.0;
  const maxTimeGapSec = options.maxTimeGapSec ?? 12.0;

  if (!Array.isArray(gpsTrack) || gpsTrack.length === 0) {
    return {
      lat: null,
      lng: null,
      accuracy_m: null,
      altitude_m: null,
      advertencia_gps: true,
      error: 'NO_GPS_DATA',
    };
  }

  // Si solo hay un punto de GPS, usar ese punto
  if (gpsTrack.length === 1) {
    const p = gpsTrack[0];
    return {
      lat: Number(p.lat.toFixed(7)),
      lng: Number(p.lng.toFixed(7)),
      accuracy_m: Number(p.accuracy.toFixed(1)),
      altitude_m: p.altitude ? Number(p.altitude.toFixed(1)) : null,
      advertencia_gps: p.accuracy > maxAccuracy,
      interpolated: false,
      time_delta_s: Math.abs((p.timestamp - (t0 + timestampAudioSec * 1000)) / 1000),
    };
  }

  // Momento objetivo en tiempo absoluto (epoch ms)
  const targetTimeMs = t0 + timestampAudioSec * 1000;

  // 1. Caso: El audio es anterior al primer punto GPS registrado
  const firstPoint = gpsTrack[0];
  if (targetTimeMs <= firstPoint.timestamp) {
    const deltaSec = (firstPoint.timestamp - targetTimeMs) / 1000;
    return {
      lat: Number(firstPoint.lat.toFixed(7)),
      lng: Number(firstPoint.lng.toFixed(7)),
      accuracy_m: Number(firstPoint.accuracy.toFixed(1)),
      altitude_m: firstPoint.altitude ? Number(firstPoint.altitude.toFixed(1)) : null,
      advertencia_gps: firstPoint.accuracy > maxAccuracy || deltaSec > maxTimeGapSec,
      interpolated: false,
      time_delta_s: Number(deltaSec.toFixed(2)),
    };
  }

  // 2. Caso: El audio es posterior al último punto GPS registrado
  const lastPoint = gpsTrack[gpsTrack.length - 1];
  if (targetTimeMs >= lastPoint.timestamp) {
    const deltaSec = (targetTimeMs - lastPoint.timestamp) / 1000;
    return {
      lat: Number(lastPoint.lat.toFixed(7)),
      lng: Number(lastPoint.lng.toFixed(7)),
      accuracy_m: Number(lastPoint.accuracy.toFixed(1)),
      altitude_m: lastPoint.altitude ? Number(lastPoint.altitude.toFixed(1)) : null,
      advertencia_gps: lastPoint.accuracy > maxAccuracy || deltaSec > maxTimeGapSec,
      interpolated: false,
      time_delta_s: Number(deltaSec.toFixed(2)),
    };
  }

  // 3. Búsqueda binaria para encontrar los dos puntos adyacentes P1 (<= target) y P2 (>= target)
  let low = 0;
  let high = gpsTrack.length - 1;
  let idx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (gpsTrack[mid].timestamp <= targetTimeMs) {
      idx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const p1 = gpsTrack[idx];
  const p2 = gpsTrack[Math.min(idx + 1, gpsTrack.length - 1)];

  // Si coinciden exactamente en el tiempo
  if (p1.timestamp === p2.timestamp || p1.timestamp === targetTimeMs) {
    return {
      lat: Number(p1.lat.toFixed(7)),
      lng: Number(p1.lng.toFixed(7)),
      accuracy_m: Number(p1.accuracy.toFixed(1)),
      altitude_m: p1.altitude ? Number(p1.altitude.toFixed(1)) : null,
      advertencia_gps: p1.accuracy > maxAccuracy,
      interpolated: false,
      time_delta_s: 0,
    };
  }

  // 4. Factor de interpolación lineal alfa en el intervalo [0, 1]
  const timeSpan = p2.timestamp - p1.timestamp;
  const timeSpanSec = timeSpan / 1000;
  const alpha = (targetTimeMs - p1.timestamp) / timeSpan;

  // Coordenadas calculadas por interpolación lineal
  const interpolatedLat = p1.lat + alpha * (p2.lat - p1.lat);
  const interpolatedLng = p1.lng + alpha * (p2.lng - p1.lng);

  // Estimación conservadora de la precisión (el peor error entre p1 y p2)
  const interpolatedAccuracy = Math.max(p1.accuracy, p2.accuracy);

  // Interpolación de altitud si ambos puntos la tienen
  const interpolatedAltitude =
    p1.altitude !== null && p2.altitude !== null
      ? p1.altitude + alpha * (p2.altitude - p1.altitude)
      : p1.altitude ?? p2.altitude ?? null;

  // Verificar si la precisión excede el umbral o el intervalo entre puntos fue excesivo
  const hasAccuracyWarning =
    interpolatedAccuracy > maxAccuracy || timeSpanSec > maxTimeGapSec;

  return {
    lat: Number(interpolatedLat.toFixed(7)),
    lng: Number(interpolatedLng.toFixed(7)),
    accuracy_m: Number(interpolatedAccuracy.toFixed(1)),
    altitude_m: interpolatedAltitude ? Number(interpolatedAltitude.toFixed(1)) : null,
    advertencia_gps: hasAccuracyWarning,
    interpolated: true,
    time_delta_s: Number((Math.min(targetTimeMs - p1.timestamp, p2.timestamp - targetTimeMs) / 1000).toFixed(2)),
  };
}

/**
 * Calcula la distancia haversiana en metros entre dos coordenadas geográficas.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula la longitud total acumulada en metros de un array de coordenadas [[lat, lng], ...].
 */
export function calculateTrackLengthMeters(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const lat1 = Array.isArray(p1) ? p1[0] : p1.lat;
    const lon1 = Array.isArray(p1) ? p1[1] : p1.lng;
    const lat2 = Array.isArray(p2) ? p2[0] : p2.lat;
    const lon2 = Array.isArray(p2) ? p2[1] : p2.lng;
    total += calculateDistanceMeters(lat1, lon1, lat2, lon2);
  }
  return Number(total.toFixed(1));
}

/**
 * Extrae un tramo de coordenadas (polilínea) interpolado entre dos instantes de audio (en segundos).
 * Ideal para trazar mangueras, líneas de riego, caminos o lindes dictados por voz en movimiento.
 */
export function interpolateGpsTrackSegment({
  t0,
  gpsTrack,
  startAudioSec = 0,
  endAudioSec = null,
}) {
  if (!Array.isArray(gpsTrack) || gpsTrack.length === 0) return [];

  const startPt = interpolateGpsAtAudioTime({
    t0,
    gpsTrack,
    timestampAudioSec: startAudioSec,
  });

  const durationSec = (gpsTrack[gpsTrack.length - 1].timestamp - t0) / 1000;
  const targetEndSec = endAudioSec !== null && !isNaN(endAudioSec) ? endAudioSec : durationSec;

  const endPt = interpolateGpsAtAudioTime({
    t0,
    gpsTrack,
    timestampAudioSec: targetEndSec,
  });

  const startTimeMs = t0 + startAudioSec * 1000;
  const endTimeMs = t0 + targetEndSec * 1000;

  const middlePoints = gpsTrack
    .filter((p) => p.timestamp > startTimeMs && p.timestamp < endTimeMs)
    .map((p) => [Number(p.lat.toFixed(7)), Number(p.lng.toFixed(7))]);

  const result = [];
  if (startPt && startPt.lat && startPt.lng) {
    result.push([startPt.lat, startPt.lng]);
  }
  result.push(...middlePoints);
  if (endPt && endPt.lat && endPt.lng) {
    const last = result[result.length - 1];
    if (!last || Math.abs(last[0] - endPt.lat) > 0.000001 || Math.abs(last[1] - endPt.lng) > 0.000001) {
      result.push([endPt.lat, endPt.lng]);
    }
  }

  // Si no hay suficientes puntos en el subrango, usar todos los disponibles en el track
  if (result.length < 2 && gpsTrack.length >= 2) {
    return gpsTrack.map((p) => [Number(p.lat.toFixed(7)), Number(p.lng.toFixed(7))]);
  }

  return result;
}

