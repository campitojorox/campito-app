// src/services/documentChunker.js
// Segmentador semántico inteligente para archivos de Campito Jorox (KML, KMZ, GeoJSON, GPX, CSV, Excel, PDF, TXT).
// Produce fragmentos enriquecidos con metadatos específicos (coordenadas, nombres, tipo de archivo)
// listos para indexación vectorial y búsqueda por similitud (RAG).

import { parseKmlString, parseGeoJsonString, parseGpxString } from '../utils/kmlParser';

/**
 * Fragmenta un archivo KML o KMZ descomprimido extrayendo cada Placemark (punto o camino)
 * como un fragmento semántico autosuficiente.
 */
export function chunkKmlOrGeoContent(kmlText, documentName = 'mapa.kml', fileType = 'kml') {
  const isGeoJson = fileType === 'geojson' || documentName.toLowerCase().endsWith('.geojson');
  const isGpx = fileType === 'gpx' || documentName.toLowerCase().endsWith('.gpx');

  const parsed = isGeoJson
    ? parseGeoJsonString(kmlText)
    : isGpx
      ? parseGpxString(kmlText)
      : parseKmlString(kmlText);

  const chunks = [];
  let chunkIndex = 0;

  // 1. Resumen global del archivo cartográfico
  const summaryText = `Archivo cartográfico "${documentName}" (${fileType.toUpperCase()}): Contiene ${parsed.points.length} puntos de interés y ${parsed.paths.length} caminos/trazados de la finca Campito Jorox.`;
  chunks.push({
    chunkIndex: chunkIndex++,
    content: summaryText,
    metadata: {
      type: 'summary',
      pointsCount: parsed.points.length,
      pathsCount: parsed.paths.length,
    },
  });

  // 2. Chunks para cada Punto / Placemark
  for (const pt of parsed.points) {
    const ptText = `Punto de interés en "${documentName}": ${pt.name} | Categoría: ${pt.category || 'arbol'} | Coordenadas: [${pt.latitude.toFixed(6)}, ${pt.longitude.toFixed(6)}] | Estado: ${pt.status || 'saludable'} ${pt.notes ? '| Notas: ' + pt.notes : ''}`;
    chunks.push({
      chunkIndex: chunkIndex++,
      content: ptText,
      metadata: {
        type: 'point',
        name: pt.name,
        category: pt.category,
        latitude: pt.latitude,
        longitude: pt.longitude,
        notes: pt.notes || '',
      },
    });
  }

  // 3. Chunks para cada Camino / Polilínea / Trazado
  for (const pth of parsed.paths) {
    const coordsSample = Array.isArray(pth.coordinates)
      ? pth.coordinates.slice(0, 4).map((c) => `[${Number(c[0]).toFixed(6)}, ${Number(c[1]).toFixed(6)}]`).join(', ') +
        (pth.coordinates.length > 4 ? ` ... (${pth.coordinates.length} puntos en total)` : '')
      : '';
    const pthText = `Trazado/Camino en "${documentName}": ${pth.name} | Tipo de trazado: ${pth.path_type || 'camino'} | Longitud: ${pth.length_meters ? pth.length_meters.toFixed(1) + 'm' : 'calculada'} | Vértices: ${coordsSample} ${pth.notes ? '| Notas: ' + pth.notes : ''}`;
    chunks.push({
      chunkIndex: chunkIndex++,
      content: pthText,
      metadata: {
        type: 'path',
        name: pth.name,
        path_type: pth.path_type,
        length_meters: pth.length_meters || null,
        coordinates: pth.coordinates,
      },
    });
  }

  return {
    chunks,
    pointsCount: parsed.points.length,
    pathsCount: parsed.paths.length,
    parsed,
  };
}

/**
 * Segmenta texto plano, Markdown o contenido extraído de PDFs / TXT en ventanas deslizantes.
 */
export function chunkPlainText(text, documentName = 'documento.txt', { chunkSize = 750, overlap = 100 } = {}) {
  const clean = (text || '').trim();
  if (!clean) return { chunks: [], pointsCount: 0, pathsCount: 0 };

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    const slice = clean.substring(start, end).trim();

    if (slice.length > 20) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: `Documento "${documentName}" [Parte ${chunkIndex}]:\n${slice}`,
        metadata: {
          type: 'text',
          startOffset: start,
          endOffset: end,
        },
      });
    }

    if (end >= clean.length) break;
    start += chunkSize - overlap;
  }

  return { chunks, pointsCount: 0, pathsCount: 0 };
}

/**
 * Segmenta filas de un archivo CSV o de hoja de cálculo en bloques legibles semánticamente.
 */
export function chunkCsvContent(csvText, documentName = 'datos.csv') {
  const lines = (csvText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { chunks: [], pointsCount: 0, pathsCount: 0 };

  const header = lines[0];
  const rows = lines.slice(1);
  const chunks = [];
  let chunkIndex = 0;

  // Lotes de 8 a 12 filas por chunk para preservar contexto tabular
  const rowsPerChunk = 10;
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const sliceRows = rows.slice(i, i + rowsPerChunk);
    const chunkContent = `Hoja de cálculo / CSV "${documentName}" (Filas ${i + 1} a ${i + sliceRows.length}):\nCabeceras: ${header}\n` + sliceRows.join('\n');
    chunks.push({
      chunkIndex: chunkIndex++,
      content: chunkContent,
      metadata: {
        type: 'tabular',
        header,
        rowStart: i + 1,
        rowEnd: i + sliceRows.length,
      },
    });
  }

  return { chunks, pointsCount: 0, pathsCount: 0 };
}

/**
 * Función enrutadora principal que selecciona el método de segmentación según el tipo de archivo.
 */
export function chunkDocumentContent({ textContent, documentName = 'archivo', fileType = 'txt' }) {
  const ext = (documentName.split('.').pop() || fileType).toLowerCase();

  if (ext === 'kml' || ext === 'kmz' || ext === 'geojson' || ext === 'gpx') {
    return chunkKmlOrGeoContent(textContent, documentName, ext);
  }

  if (ext === 'csv') {
    return chunkCsvContent(textContent, documentName);
  }

  return chunkPlainText(textContent, documentName);
}

