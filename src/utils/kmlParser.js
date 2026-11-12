// src/utils/kmlParser.js
// Parser universal de archivos KML, KMZ (XML) y GeoJSON para Campito Jorox.
// Extrae automáticamente Placemarks de tipo Punto (<Point>) y Camino (<LineString>/<Polygon>)
// para su importación directa y visualización satelital.

import { calculateTrackLengthMeters } from './geoAudioInterpolation';

export function parseKmlString(kmlText) {
  const result = {
    points: [],
    paths: [],
    errors: [],
  };

  if (!kmlText || typeof kmlText !== 'string') return result;

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      result.errors.push('El archivo XML/KML tiene errores de sintaxis.');
      return result;
    }

    const placemarks = xmlDoc.getElementsByTagName('Placemark');

    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const nameElem = pm.getElementsByTagName('name')[0];
      const descElem = pm.getElementsByTagName('description')[0];
      const name = nameElem?.textContent?.trim() || `Elemento ${i + 1}`;
      const notes = descElem?.textContent?.trim() || '';

      // 1. Extraer Punto (<Point>)
      const pointElem = pm.getElementsByTagName('Point')[0];
      if (pointElem) {
        const coordElem = pointElem.getElementsByTagName('coordinates')[0];
        if (coordElem && coordElem.textContent) {
          const raw = coordElem.textContent.trim().split(',');
          if (raw.length >= 2) {
            const lng = parseFloat(raw[0]);
            const lat = parseFloat(raw[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              // Deducción simple de categoría
              let category = 'arbol';
              const nameLower = name.toLowerCase();
              if (nameLower.includes('arqueta') || nameLower.includes('llave') || nameLower.includes('riego') || nameLower.includes('filtro') || nameLower.includes('bomba')) {
                category = 'riego_linea';
              } else if (nameLower.includes('caseta') || nameLower.includes('casa') || nameLower.includes('edificio') || nameLower.includes('taller')) {
                category = 'maquinaria';
              } else if (nameLower.includes('linda') || nameLower.includes('mojon') || nameLower.includes('hito')) {
                category = 'piedra_linde';
              }

              result.points.push({
                name,
                category,
                latitude: lat,
                longitude: lng,
                notes,
                status: 'saludable',
              });
              continue;
            }
          }
        }
      }

      // 2. Extraer todos los Caminos o Polilíneas (<LineString>, <LinearRing>, <Polygon>, <MultiGeometry>)
      const lineElements = Array.from(pm.getElementsByTagName('LineString'))
        .concat(Array.from(pm.getElementsByTagName('LinearRing')));

      lineElements.forEach((lineElem, lineIdx) => {
        const coordElem = lineElem.getElementsByTagName('coordinates')[0];
        if (!coordElem || !coordElem.textContent) return;
        const rawCoordStrings = coordElem.textContent.trim().split(/\s+/);
        const coordinates = [];

        for (const rawPoint of rawCoordStrings) {
          if (!rawPoint.includes(',')) continue;
          const parts = rawPoint.split(',');
          if (parts.length >= 2) {
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              coordinates.push({ lat, lng });
            }
          }
        }

        if (coordinates.length >= 2) {
          const lengthMeters = calculateTrackLengthMeters(coordinates);
          let path_type = 'camino';
          const nameLower = name.toLowerCase();
          if (nameLower.includes('riego') || nameLower.includes('tuber') || nameLower.includes('manguera')) {
            path_type = 'linea_riego';
          } else if (nameLower.includes('sendero') || nameLower.includes('paso')) {
            path_type = 'sendero';
          } else if (nameLower.includes('linde') || nameLower.includes('catastro')) {
            path_type = 'linde';
          }

          const pathTitle = lineElements.length > 1 ? `${name} (Tramo ${lineIdx + 1})` : name;
          result.paths.push({
            name: pathTitle,
            path_type,
            coordinates,
            length_meters: lengthMeters,
            color: path_type === 'linea_riego' ? '#00979d' : '#f97316',
            notes,
          });
        }
      });
    }
  } catch (err) {
    result.errors.push(`Error parseando KML: ${err.message}`);
  }

  return result;
}

export function parseGeoJsonString(geoJsonText) {
  const result = {
    points: [],
    paths: [],
    errors: [],
  };

  try {
    const data = JSON.parse(geoJsonText);
    const features = data.features || (data.type === 'Feature' ? [data] : []);

    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;
      const props = f.properties || {};
      const name = props.name || props.nombre || props.title || 'Elemento GeoJSON';

      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates;
        if (!isNaN(lat) && !isNaN(lng)) {
          result.points.push({
            name,
            category: props.category || 'arbol',
            latitude: Number(lat),
            longitude: Number(lng),
            notes: props.notes || props.descripcion || '',
            status: props.status || 'saludable',
          });
        }
      } else if ((geom.type === 'LineString' || geom.type === 'MultiLineString') && Array.isArray(geom.coordinates)) {
        const rawCoords = geom.type === 'MultiLineString' ? geom.coordinates[0] : geom.coordinates;
        const coordinates = rawCoords.map(([lng, lat]) => [Number(lat), Number(lng)]);
        if (coordinates.length >= 2) {
          result.paths.push({
            name,
            path_type: props.path_type || 'camino',
            coordinates,
            color: props.color || '#00979d',
            notes: props.notes || '',
          });
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error parseando GeoJSON: ${err.message}`);
  }

  return result;
}

export function parseGpxString(gpxText) {
  const result = {
    points: [],
    paths: [],
    errors: [],
  };

  if (!gpxText || typeof gpxText !== 'string') return result;

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');

    // 1. Waypoints (<wpt>)
    const waypoints = xmlDoc.getElementsByTagName('wpt');
    for (let i = 0; i < waypoints.length; i++) {
      const wpt = waypoints[i];
      const lat = parseFloat(wpt.getAttribute('lat'));
      const lon = parseFloat(wpt.getAttribute('lon'));
      const name = wpt.getElementsByTagName('name')[0]?.textContent?.trim() || `Punto GPS ${i + 1}`;
      const desc = wpt.getElementsByTagName('desc')[0]?.textContent?.trim() || '';

      if (!isNaN(lat) && !isNaN(lon)) {
        result.points.push({
          name,
          category: 'arbol',
          latitude: lat,
          longitude: lon,
          notes: desc,
          status: 'saludable',
        });
      }
    }

    // 2. Tracks (<trk>)
    const tracks = xmlDoc.getElementsByTagName('trk');
    for (let i = 0; i < tracks.length; i++) {
      const trk = tracks[i];
      const name = trk.getElementsByTagName('name')[0]?.textContent?.trim() || `Recorrido GPS ${i + 1}`;
      const trkpts = trk.getElementsByTagName('trkpt');
      const coordinates = [];

      for (let j = 0; j < trkpts.length; j++) {
        const pt = trkpts[j];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push([lat, lon]);
        }
      }

      if (coordinates.length >= 2) {
        const lengthM = calculateTrackLengthMeters(coordinates.map((c) => ({ lat: c[0], lng: c[1] })));
        result.paths.push({
          name,
          path_type: 'camino',
          coordinates,
          length_meters: lengthM,
          color: '#f97316',
          notes: 'Importado desde archivo GPX',
        });
      }
    }
  } catch (err) {
    result.errors.push(`Error parseando GPX: ${err.message}`);
  }

  return result;
}


