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
  let interpolatedAltitude = null;
  if (p1.altitude !== null && p2.altitude !== null) {
    interpolatedAltitude = p1.altitude + alpha * (p2.altitude - p1.altitude);
  } else {
    interpolatedAltitude = p1.altitude ?? p2.altitude ?? null;
  }

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
 * Asocia un lote de árboles/elementos extraídos con su telemetría GPS interpolada.
 *
 * @param {Array<Object>} entities - Lista de entidades extraídas por el LLM [{ id, tipo, variedad, estado, timestamp_audio_s, ... }]
 * @param {number} t0 - Timestamp inicial de la sesión.
 * @param {Array<Object>} gpsTrack - Array cronológico de puntos GPS.
 * @param {Object} [options] - Parámetros de precisión y umbrales.
 * @returns {Array<Object>} Entidades completas con coordenadas e indicadores de calidad GPS.
 */
export function interpolateTreeEntities(entities, t0, gpsTrack, options = {}) {
  if (!Array.isArray(entities)) return [];

  return entities.map((entity) => {
    const audioSec = Number(entity.timestamp_audio_s) || 0;
    const geo = interpolateGpsAtAudioTime({
      t0,
      gpsTrack,
      timestampAudioSec: audioSec,
      options,
    });

    return {
      ...entity,
      coordenadas: {
        lat: geo.lat,
        lng: geo.lng,
      },
      accuracy_m: geo.accuracy_m,
      altitude_m: geo.altitude_m,
      advertencia_gps: geo.advertencia_gps,
      calidad_posicion: geo.advertencia_gps
        ? 'baja_dispersion_gps'
        : 'alta_precision_metrica',
    };
  });
}

/**
 * Convierte un array de árboles mapeados a un formato GeoJSON FeatureCollection estándar.
 *
 * @param {Array<Object>} trees - Lista de árboles con coordenadas.
 * @returns {Object} Objeto GeoJSON válido.
 */
export function treesToGeoJSON(trees) {
  const validTrees = (trees || []).filter(
    (t) => t.coordenadas && t.coordenadas.lat && t.coordenadas.lng
  );

  return {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      farm: 'Campito Jorox',
      total_features: validTrees.length,
    },
    features: validTrees.map((t) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [t.coordenadas.lng, t.coordenadas.lat], // GeoJSON standard: [lng, lat]
      },
      properties: {
        id: t.id,
        name: `${t.tipo} ${t.variedad || ''}`.trim(),
        tipo: t.tipo,
        variedad: t.variedad || null,
        estado: t.estado || 'saludable',
        observaciones: t.observaciones || '',
        accuracy_m: t.accuracy_m || null,
        advertencia_gps: Boolean(t.advertencia_gps),
        audio_sec: t.timestamp_audio_s || null,
      },
    })),
  };
}
