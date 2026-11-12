// src/services/mapIaOrchestrator.js
// Orquestador Unificado de Inteligencia Artificial para Inventario y Cartografía
// Compartido entre FarmSatelliteMap y ChatIA.
//
// Responsabilidades:
// 1. Análisis multimodal de órdenes (Voz, Fotos, Documentos, Texto y Selección en Mapa).
// 2. Cascada de modelos Google Gemini con tolerancia a fallos.
// 3. Extracción e interpolación espacio-temporal con GPS (Puntos y Polilíneas).
// 4. Ejecución transaccional en Supabase y caché local con soporte completo para Deshacer (Undo).

import {
  insertFarmInventoryItem,
  updateFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  updateFarmPath,
  deleteFarmPath,
  getItemCategory,
} from './farmInventoryStorage';
import {
  interpolateGpsAtAudioTime,
  interpolateGpsTrackSegment,
  calculateTrackLengthMeters,
} from '../utils/geoAudioInterpolation';
import { normalizeAttachments, appendAttachmentsToGeminiParts } from '../utils/attachmentUtils';

const DEFAULT_CENTER = [36.72595, -4.89462];

const GEMINI_MODELS_CASCADE = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.1-flash-lite',
];

function parseLooseJson(rawJson) {
  const cleaned = rawJson.replace(/,\s*([\]}])/g, '$1').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Si venía escapado dentro de un string JSON (\"name\"...)
    if (cleaned.includes('\\"')) {
      const unescaped = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return JSON.parse(unescaped.replace(/,\s*([\]}])/g, '$1'));
    }
    throw new Error('JSON inválido');
  }
}

/**
 * Extrae payloads JSON balanceados ({...} o [...]) tras una etiqueta [[TAG: ...]].
 * Evita truncar cuando existen arrays u objetos anidados en el interior.
 */
function extractTagPayloads(rawText, tagNames) {
  const results = [];
  if (!rawText || typeof rawText !== 'string') return results;

  const tagRegex = new RegExp(`\\[\\[(?:${tagNames.join('|')}):\\s*`, 'gi');
  let match;
  while ((match = tagRegex.exec(rawText)) !== null) {
    const startIdx = match.index + match[0].length;
    const openChar = rawText[startIdx];
    if (openChar !== '[' && openChar !== '{') continue;
    const closeChar = openChar === '[' ? ']' : '}';

    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIdx = -1;

    for (let i = startIdx; i < rawText.length; i++) {
      const ch = rawText[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx > startIdx) {
      const jsonSlice = rawText.slice(startIdx, endIdx + 1);
      try {
        results.push(parseLooseJson(jsonSlice));
      } catch {
        // Fallback: extraer objetos individuales si es un array parcialmente malformado
        if (openChar === '[') {
          const objMatches = jsonSlice.match(/\{[^{}]*\}/g) || [];
          for (const om of objMatches) {
            try {
              results.push(parseLooseJson(om));
            } catch {
              // Ignorar objeto malformado
            }
          }
        }
      }
    }
  }
  return results;
}

/**
 * Analizador universal de comandos estructurados:
 * - [[REGISTRAR_PUNTOS: [ ... ] ]]
 * - [[REGISTRAR_PUNTO: { ... } ]]
 * - [[BORRAR_PUNTO: { ... } ]]
 * - [[REGISTRAR_CAMINO: { ... } ]]
 * - [[EDITAR_PUNTO: { ... } ]]
 */
export function parseStructuredCommands(rawText) {
  if (!rawText || typeof rawText !== 'string') return { points: [], deletions: [], paths: [], updates: [] };
  const points = [];
  const deletions = [];
  const paths = [];
  const updates = [];

  for (const payload of extractTagPayloads(rawText, ['REGISTRAR_PUNTOS', 'REGISTRAR_PUNTO'])) {
    if (Array.isArray(payload)) points.push(...payload.filter((p) => p && typeof p === 'object'));
    else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.points)) points.push(...payload.points);
      else if (Array.isArray(payload.puntos)) points.push(...payload.puntos);
      else points.push(payload);
    }
  }

  for (const payload of extractTagPayloads(rawText, ['BORRAR_PUNTO', 'ELIMINAR_PUNTO'])) {
    if (Array.isArray(payload)) deletions.push(...payload.filter((d) => d && typeof d === 'object'));
    else if (payload && typeof payload === 'object') deletions.push(payload);
  }

  for (const payload of extractTagPayloads(rawText, ['REGISTRAR_CAMINO', 'CREAR_CAMINO'])) {
    if (Array.isArray(payload)) paths.push(...payload.filter((p) => p && typeof p === 'object'));
    else if (payload && typeof payload === 'object') paths.push(payload);
  }

  for (const payload of extractTagPayloads(rawText, ['EDITAR_PUNTO', 'ACTUALIZAR_PUNTO'])) {
    if (Array.isArray(payload)) updates.push(...payload.filter((u) => u && typeof u === 'object'));
    else if (payload && typeof payload === 'object') updates.push(payload);
  }

  return { points, deletions, paths, updates };
}

/**
 * Consulta a Gemini mediante cascada de modelos para extraer acciones de inventario.
 */
export function buildMapSystemInstruction({
  selectedTarget = null,
  visibleInventory = [],
  visiblePaths = [],
  mapCenter = DEFAULT_CENTER,
  currentGps = null,
  audio = null,
}) {
  const inventoryContext = visibleInventory.slice(0, 80).map((i) => ({
    id: i.id,
    name: i.name || i.tipo,
    category: getItemCategory(i),
    variety: i.variety_type,
    status: i.status || i.estado || 'saludable',
    lat: i.latitude,
    lng: i.longitude,
    notes: i.notes || '',
  }));

  const pathsContext = visiblePaths.slice(0, 30).map((p) => ({
    id: p.id,
    name: p.name,
    path_type: p.path_type,
    color: p.color,
    length_m: p.length_meters,
    notes: p.notes || '',
  }));

  const centerLat = selectedTarget?.lat || (audio?.gpsTrack && audio.gpsTrack[0]?.lat) || currentGps?.lat || mapCenter?.[0] || DEFAULT_CENTER[0];
  const centerLng = selectedTarget?.lng || (audio?.gpsTrack && audio.gpsTrack[0]?.lng) || currentGps?.lng || mapCenter?.[1] || DEFAULT_CENTER[1];

  const targetInfoStr = selectedTarget ? `
🎯 ELEMENTO ACTUALMENTE SELECCIONADO EN EL MAPA:
- Tipo: ${selectedTarget.type} (punto de inventario o camino)
- ID: ${selectedTarget.id || 'N/A'}
- Nombre: ${selectedTarget.title || 'N/A'}
- Categoría / Variedad: ${selectedTarget.category || selectedTarget.variety || selectedTarget.path_type || 'N/A'}
- Estado: ${selectedTarget.status || 'N/A'}
- Notas: ${selectedTarget.notes || 'Ninguna'}
- Coordenadas: Lat ${selectedTarget.lat || centerLat}, Lng ${selectedTarget.lng || centerLng}
*REGLA*: Si el usuario pide cambios ("cámbialo a clorosis", "ponle nota de ...", "bórralo"), aplícalos a este elemento.` : '';

  return `Eres el Agente Topógrafo e Inteligencia Geoespacial de Campito Jorox (Parcelas 195 y 196).
Tu misión es interpretar órdenes de voz, fotos, documentos técnicos (KML, KMZ, GeoJSON, XML, CSV) y texto, y convertirlas en acciones de catastro e inventario sobre el mapa satelital.
${targetInfoStr}

🚨 CAPACIDAD TOTAL PARA PROCESAR ARCHIVOS KML, KMZ, GEOJSON Y CATASTRO:
- Tienes capacidad COMPLETA de leer, interpretar y extraer datos de archivos cartográficos KML, KMZ, GeoJSON y XML.
- Si el usuario adjunta o te proporciona un archivo KML o GeoJSON:
  * Para cada elemento puntual (<Point> o Placemark de punto), DEBES generar una acción "ADD_POINT" con su name, category (arbol|riego|edificio|hito), latitude y longitude extraídas de <coordinates> (recuerda que en KML viene lng,lat; debes asignarlas a latitude y longitude correctamente).
  * Para cada camino o trazado (<LineString> o <Polygon>), DEBES generar una acción "ADD_PATH" con su name, path_type (camino|linea_riego), color y el array de "coordinates" con los pares [[lat1, lng1], [lat2, lng2], ...].
- NUNCA digas que no puedes procesar archivos KML o KMZ. Extrae inmediatamente sus puntos y caminos en la lista "actions" para que la aplicación los pinte y guarde en el mapa.

Coordenadas de referencia:
- GPS Usuario: ${currentGps ? `${currentGps.lat.toFixed(6)}, ${currentGps.lng.toFixed(6)} (±${currentGps.accuracy?.toFixed(1) || '4'}m)` : 'No disponible'}
- Centro activo del mapa: ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}

Elementos visibles en la zona:
- Puntos (${inventoryContext.length}): ${JSON.stringify(inventoryContext)}
- Caminos (${pathsContext.length}): ${JSON.stringify(pathsContext)}

FORMATOS ADMITIDOS (RESPONDE SIEMPRE EN JSON VÁLIDO):
{
  "description": "Resumen conciso en español de lo registrado o modificado...",
  "transcription": "Texto literal transcrito del audio si hubo audio...",
  "actions": [
    {
      "type": "ADD_POINT",
      "data": {
        "name": "Nombre descriptivo (ej: 'Aguacate Hass 3', 'Arqueta Principal')",
        "category": "arbol|riego|edificio|planta|herramienta|hito|o categoría nueva",
        "variety_type": "variedad botánica o subtipo si aplica",
        "status": "saludable|clorosis|poda_requerida|enfermo|seco",
        "notes": "observaciones del agricultor",
        "latitude": null,
        "longitude": null,
        "timestamp_audio_s": 2.5
      }
    }
  ]
}
Tipos de acción soportados en "actions": "ADD_POINT" | "UPDATE_POINT" | "DELETE_POINT" | "ADD_PATH" | "UPDATE_PATH" | "DELETE_PATH" (incluye "target_id" para UPDATE/DELETE).
*REGLA CRÍTICA DE AUDIO Y REGISTRO*:
- Si el usuario menciona, describe, dicta o pide registrar cualquier árbol, planta, arqueta, llave de riego, tubería, herramienta, edificio o camino, DEBES incluir una entrada en "actions" para cada elemento. NUNCA devuelvas "actions": [] si el audio describe elementos para el inventario.
- Si el usuario habla mientras camina, deja latitude: null y longitude: null y asigna "timestamp_audio_s" con el segundo del audio donde mencionó cada elemento para interpolación GPS satelital.`;
}

function structuredCommandsToActions(parsedCmds) {
  const actions = [];
  for (const p of parsedCmds.points || []) {
    actions.push({
      type: 'ADD_POINT',
      data: {
        name: p.name || p.nombre || p.title || p.tipo || 'Punto registrado',
        category: p.category || p.categoria || p.tipo || 'arbol',
        variety_type: p.variedad || p.variety_type || p.variety || null,
        status: p.estado || p.status || 'saludable',
        notes: p.observaciones || p.notes || p.observacion || '',
        latitude: p.latitude !== undefined && p.latitude !== null ? Number(p.latitude) : undefined,
        longitude: p.longitude !== undefined && p.longitude !== null ? Number(p.longitude) : undefined,
        timestamp_audio_s: p.timestamp_audio_s !== undefined ? Number(p.timestamp_audio_s) : undefined,
      },
    });
  }
  for (const d of parsedCmds.deletions || []) {
    actions.push({
      type: 'DELETE_POINT',
      target: d.target || 'especifico',
      target_id: d.target_id || d.id,
      query: d.query || d.nombre || d.name || '',
    });
  }
  for (const pth of parsedCmds.paths || []) {
    actions.push({ type: 'ADD_PATH', data: pth });
  }
  for (const upd of parsedCmds.updates || []) {
    actions.push({ type: 'UPDATE_POINT', target_id: upd.target_id || upd.id, data: upd });
  }
  return actions;
}

function normalizeParsedMapObject(parsed, audio = null) {
  if (!parsed) return null;

  // Caso 1: Gemini devolvió un array raíz de puntos directamente
  if (Array.isArray(parsed)) {
    const actions = parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => (item.type ? item : { type: 'ADD_POINT', data: item }));
    return {
      description: `Procesados ${actions.length} elemento(s) en el inventario`,
      transcription: audio?.transcription || '',
      actions,
    };
  }

  if (typeof parsed !== 'object') return null;

  let actions = Array.isArray(parsed.actions) ? [...parsed.actions] : [];
  if (actions.length === 0 && parsed.action && typeof parsed.action === 'object') {
    actions.push(parsed.action);
  }

  // Caso 2: Claves alternativas en vez de "actions"
  const pointContainers = parsed.points || parsed.puntos || parsed.items || parsed.elements || parsed.elementos || parsed.inventory || parsed.registros;
  if (actions.length === 0 && Array.isArray(pointContainers)) {
    actions.push(...pointContainers.map((p) => ({ type: 'ADD_POINT', data: p })));
  }

  const pathContainers = parsed.paths || parsed.caminos || parsed.trazados;
  if (actions.length === 0 && Array.isArray(pathContainers)) {
    actions.push(...pathContainers.map((pth) => ({ type: 'ADD_PATH', data: pth })));
  }

  // Caso 3: Etiquetas [[REGISTRAR_PUNTOS]] embebidas dentro de description/summary tras JSON.parse
  if (actions.length === 0) {
    const textFields = [parsed.description, parsed.summary, parsed.message, parsed.respuesta]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');
    if (textFields) {
      const embeddedCmds = parseStructuredCommands(textFields);
      const embeddedActions = structuredCommandsToActions(embeddedCmds);
      if (embeddedActions.length > 0) {
        actions = embeddedActions;
      }
    }
  }

  // Caso 4: El objeto completo parece un único punto sin envoltorio "actions"
  if (actions.length === 0 && (parsed.name || parsed.nombre) && (parsed.category || parsed.categoria || parsed.timestamp_audio_s !== undefined)) {
    actions.push({ type: 'ADD_POINT', data: parsed });
  }

  return {
    ...parsed,
    description: parsed.description || parsed.summary || (actions.length > 0 ? `Procesados ${actions.length} cambio(s) en el inventario` : ''),
    transcription: parsed.transcription || audio?.transcription || '',
    actions,
  };
}

export function parseMapGeminiRawText(rawText, audio = null) {
  if (!rawText || typeof rawText !== 'string') {
    return { description: '', transcription: audio?.transcription || '', actions: [] };
  }

  const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Si es JSON completo (empieza por { o [), parsear primero para des-escapar strings correctamente
  if (cleanJson.startsWith('{') || cleanJson.startsWith('[')) {
    try {
      const parsed = JSON.parse(cleanJson);
      const normalized = normalizeParsedMapObject(parsed, audio);
      if (normalized && normalized.actions && normalized.actions.length > 0) {
        return normalized;
      }
      // Si el JSON no trajo acciones, probar comandos estructurados sobre el rawText completo
      const rawCmds = parseStructuredCommands(rawText);
      const rawActions = structuredCommandsToActions(rawCmds);
      if (rawActions.length > 0) {
        return {
          ...(normalized || {}),
          description: normalized?.description || `Procesados ${rawActions.length} cambio(s) en el inventario`,
          transcription: normalized?.transcription || audio?.transcription || '',
          actions: rawActions,
        };
      }
      if (normalized) return normalized;
    } catch {
      // Continuar con extractores tolerantes
    }
  }

  const parsedCmds = parseStructuredCommands(rawText);
  const cmdActions = structuredCommandsToActions(parsedCmds);
  if (cmdActions.length > 0) {
    const cleanDescription = rawText
      .replace(/\[\[(?:REGISTRAR_PUNTOS|REGISTRAR_PUNTO|BORRAR_PUNTO|ELIMINAR_PUNTO|REGISTRAR_CAMINO|CREAR_CAMINO|EDITAR_PUNTO|ACTUALIZAR_PUNTO):[\s\S]*?\]\]/gi, '')
      .trim();

    return {
      description: cleanDescription || `Procesados ${cmdActions.length} cambio(s) en el inventario`,
      transcription: audio?.transcription || '',
      actions: cmdActions,
    };
  }

  try {
    return normalizeParsedMapObject(JSON.parse(cleanJson), audio);
  } catch (e) {
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return normalizeParsedMapObject(JSON.parse(objMatch[0]), audio);
    }
    const arrMatch = rawText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      return normalizeParsedMapObject(JSON.parse(arrMatch[0]), audio);
    }
    throw e;
  }
}

export async function callGeminiForInventoryAction({
  prompt,
  audio,
  attachment,
  attachments,
  selectedTarget,
  visibleInventory = [],
  visiblePaths = [],
  mapCenter = DEFAULT_CENTER,
  currentGps = null,
  apiKey = import.meta.env.VITE_GEMINI_API_KEY,
}) {
  if (!apiKey) throw new Error('API Key de Gemini no configurada.');

  const attList = normalizeAttachments(attachments, attachment);
  const systemInstruction = buildMapSystemInstruction({
    selectedTarget,
    visibleInventory,
    visiblePaths,
    mapCenter,
    currentGps,
    audio,
  });

  const userParts = [];
  if (prompt) userParts.push({ text: prompt });

  if (attList.length > 0) {
    appendAttachmentsToGeminiParts(userParts, attList);
  }

  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
    if (match) {
      userParts.push({ inlineData: { mimeType: match[1].toLowerCase().trim(), data: match[2] } });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({ inlineData: { mimeType: cleanMime, data: cleanBase64 } });
    }

    if (audio.gpsTrack && audio.gpsTrack.length > 0) {
      userParts.push({
        text: `🛰️ **Telemetría GPS en movimiento (${audio.gpsTrack.length} lecturas satelitales vinculadas)**:
El agricultor caminaba por la finca mientras hablaba. Para cada árbol, arqueta o elemento descrito a lo largo de su recorrido, asigna "timestamp_audio_s" con el segundo del audio para posicionarlo con máxima precisión GPS.`,
      });
    }

    if (!prompt) {
      userParts.push({
        text: selectedTarget
          ? `Escucha atentamente este audio del agricultor para el elemento seleccionado "${selectedTarget.title}" (${selectedTarget.type} en lat ${selectedTarget.lat}, lng ${selectedTarget.lng}). Transcribe en "transcription", interpreta la orden (añadir pin, renombrar, cambiar estado, notas o borrar) y genera el JSON con la acción correspondiente.`
          : 'Escucha atentamente este audio de campo. Transcribe en "transcription", extrae los elementos descritos y genera las acciones correspondientes (ADD_POINT, ADD_PATH, etc.) indicando timestamp_audio_s para cada uno.',
      });
    }
  }

  const payload = {
    contents: [{ role: 'user', parts: userParts }],
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.1, response_mime_type: 'application/json' },
  };

  let lastError = null;
  for (const modelId of GEMINI_MODELS_CASCADE) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), audio || attList.length > 0 ? 45000 : 20000);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const resData = await res.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Respuesta vacía del modelo');

      return parseMapGeminiRawText(rawText, audio);
    } catch (err) {
      console.warn(`[MapAIOrchestrator] Falló ${modelId}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo procesar la orden con ningún modelo disponible.');
}

/**
 * Ejecuta una lista de acciones de inventario en la base de datos (puntos y caminos),
 * interpolando con GPS en movimiento y construyendo la estructura para Deshacer (Undo).
 */
export async function executeInventoryActions({
  actions = [],
  audio = null,
  liveGps = null,
  mapCenter = DEFAULT_CENTER,
  selectedTarget = null,
  currentInventory = [],
  currentPaths = [],
  uploadedPhotoUrl = null,
}) {
  const result = {
    addedItems: [],
    updatedItems: [],
    deletedItems: [],
    addedPaths: [],
    updatedPaths: [],
    deletedPaths: [],
    reverts: [],
  };

  const center = mapCenter || DEFAULT_CENTER;

  // Normalizar acciones que envuelvan arrays (ej: REGISTRAR_PUNTOS con data: [...])
  const ADD_POINT_TYPES = new Set([
    'ADD_POINT', 'CREATE_POINT', 'INSERT_POINT', 'NEW_POINT',
    'REGISTRAR_PUNTO', 'REGISTRAR_PUNTOS', 'CREAR_PUNTO',
    'ANADIR_PUNTO', 'AÑADIR_PUNTO', 'REGISTER_POINT', 'ADD', 'CREATE',
  ]);
  const DELETE_POINT_TYPES = new Set(['DELETE_POINT', 'REMOVE_POINT', 'BORRAR_PUNTO', 'ELIMINAR_PUNTO']);
  const UPDATE_POINT_TYPES = new Set(['UPDATE_POINT', 'EDIT_POINT', 'MODIFY_POINT', 'EDITAR_PUNTO', 'ACTUALIZAR_PUNTO']);
  const ADD_PATH_TYPES = new Set(['ADD_PATH', 'CREATE_PATH', 'INSERT_PATH', 'REGISTRAR_CAMINO', 'CREAR_CAMINO', 'DRAW_PATH']);
  const UPDATE_PATH_TYPES = new Set(['UPDATE_PATH', 'EDIT_PATH', 'EDITAR_CAMINO']);
  const DELETE_PATH_TYPES = new Set(['DELETE_PATH', 'REMOVE_PATH', 'BORRAR_CAMINO', 'ELIMINAR_CAMINO']);

  const normalizedActions = [];
  for (const act of actions) {
    if (!act || typeof act !== 'object') continue;
    const rawType = (act.type || '').toString().toUpperCase().trim();
    if (Array.isArray(act.data)) {
      act.data.forEach((item) => {
        if (item && typeof item === 'object') normalizedActions.push({ ...act, type: rawType || 'ADD_POINT', data: item });
      });
    } else if (Array.isArray(act.points) || Array.isArray(act.puntos)) {
      const arr = act.points || act.puntos;
      arr.forEach((item) => {
        if (item && typeof item === 'object') normalizedActions.push({ ...act, type: rawType || 'ADD_POINT', data: item });
      });
    } else {
      normalizedActions.push({ ...act, type: rawType || 'ADD_POINT' });
    }
  }

  for (const act of normalizedActions) {
    const actType = act.type;
    const actData = act.data || act;

    // ── BORRAR PUNTO ──────────────────────────────────────────────────────────
    if (DELETE_POINT_TYPES.has(actType)) {
      const rawIdCandidate = act.target_id || act.id || actData.id;
      let targetId = null;

      // Validar si el ID proporcionado existe exactamente en el inventario o en selectedTarget
      if (rawIdCandidate) {
        const exact = currentInventory.find((i) => String(i.id) === String(rawIdCandidate));
        if (exact) {
          targetId = exact.id;
        } else if (selectedTarget && String(selectedTarget.id) === String(rawIdCandidate)) {
          targetId = selectedTarget.id;
        }
      }

      // Si Gemini escribió el nombre en lugar del UUID o usó query/target
      const searchQ = (
        act.query ||
        actData.query ||
        (!targetId && rawIdCandidate ? String(rawIdCandidate) : '')
      )
        .toLowerCase()
        .trim();

      if (!targetId) {
        const isLast = act.target === 'ultimo' || actData.target === 'ultimo';
        let matched = null;
        if (isLast) {
          matched = currentInventory[0];
        } else if (searchQ) {
          matched = currentInventory.find(
            (i) =>
              (i.name && i.name.toLowerCase().includes(searchQ)) ||
              (i.variety_type && i.variety_type.toLowerCase().includes(searchQ)) ||
              (i.category && i.category.toLowerCase().includes(searchQ))
          );
        }
        if (matched) {
          targetId = matched.id;
        } else if (selectedTarget?.type === 'point' && selectedTarget.id) {
          targetId = selectedTarget.id;
        }
      }

      if (targetId) {
        const item = currentInventory.find((i) => String(i.id) === String(targetId)) || selectedTarget?.raw;
        await deleteFarmInventoryItem(targetId);
        result.deletedItems.push(targetId);
        if (item) {
          result.reverts.push({ type: 'RESTORE_POINT', itemData: item });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetId, deleted: true } }));
        }
      }
    }

    // ── BORRAR CAMINO ─────────────────────────────────────────────────────────
    else if (DELETE_PATH_TYPES.has(actType)) {
      const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
      if (targetId) {
        const path = currentPaths.find((p) => String(p.id) === String(targetId)) || selectedTarget?.raw;
        await deleteFarmPath(targetId);
        result.deletedPaths.push(targetId);
        if (path) {
          result.reverts.push({ type: 'RESTORE_PATH', pathData: path });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetId, deleted: true } }));
        }
      }
    }

    // ── EDITAR PUNTO ──────────────────────────────────────────────────────────
    else if (UPDATE_POINT_TYPES.has(actType)) {
      const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
      if (targetId && actData) {
        const item = currentInventory.find((i) => String(i.id) === String(targetId)) || selectedTarget?.raw;
        const updatePayload = { ...actData };
        delete updatePayload.type;
        delete updatePayload.target_id;
        delete updatePayload.id;
        if (uploadedPhotoUrl) updatePayload.photo_url = uploadedPhotoUrl;

        await updateFarmInventoryItem(targetId, updatePayload);
        result.updatedItems.push({ id: targetId, ...updatePayload });
        if (item) {
          const prevData = {};
          Object.keys(updatePayload).forEach((k) => {
            prevData[k] = item[k];
          });
          result.reverts.push({ type: 'UPDATE_POINT', target_id: targetId, prevData });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetId, ...updatePayload } }));
        }
      }
    }

    // ── EDITAR CAMINO ─────────────────────────────────────────────────────────
    else if (UPDATE_PATH_TYPES.has(actType)) {
      const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
      if (targetId && actData) {
        const path = currentPaths.find((p) => String(p.id) === String(targetId)) || selectedTarget?.raw;
        await updateFarmPath(targetId, actData);
        result.updatedPaths.push({ id: targetId, ...actData });
        if (path) {
          const prevData = {};
          Object.keys(actData).forEach((k) => {
            prevData[k] = path[k];
          });
          result.reverts.push({ type: 'UPDATE_PATH', target_id: targetId, prevData });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetId, ...actData } }));
        }
      }
    }

    // ── AÑADIR PUNTO (PIN) ────────────────────────────────────────────────────
    else if (ADD_POINT_TYPES.has(actType)) {
      let lat = actData.latitude !== undefined && actData.latitude !== null ? Number(actData.latitude) : undefined;
      let lng = actData.longitude !== undefined && actData.longitude !== null ? Number(actData.longitude) : undefined;

      // Interpolación espacio-temporal con GPS si provino de audio en movimiento
      if (audio?.gpsTrack && audio.gpsTrack.length > 0) {
        if (actData.timestamp_audio_s !== undefined && actData.timestamp_audio_s !== null) {
          const t0 = audio.t0 || Date.now() - (audio.duration || 1) * 1000;
          const interpolated = interpolateGpsAtAudioTime({
            t0,
            gpsTrack: audio.gpsTrack,
            timestampAudioSec: Number(actData.timestamp_audio_s) || 0,
          });
          if (interpolated && typeof interpolated.lat === 'number' && typeof interpolated.lng === 'number') {
            lat = interpolated.lat;
            lng = interpolated.lng;
          }
        } else if (isNaN(lat) || !lat || (!selectedTarget && Math.abs(lat - center[0]) < 0.0001)) {
          lat = audio.gpsTrack[0].lat;
          lng = audio.gpsTrack[0].lng;
        }
      } else if ((isNaN(lat) || !lat) && liveGps) {
        lat = liveGps.lat;
        lng = liveGps.lng;
      }

      lat = Number(lat || selectedTarget?.lat || audio?.gpsTrack?.[0]?.lat || liveGps?.lat || center[0] || DEFAULT_CENTER[0]);
      lng = Number(lng || selectedTarget?.lng || audio?.gpsTrack?.[0]?.lng || liveGps?.lng || center[1] || DEFAULT_CENTER[1]);

      const rawName = actData.name || actData.nombre || actData.title || actData.titulo || actData.tipo || 'Punto registrado';
      const formattedName = String(rawName).charAt(0).toUpperCase() + String(rawName).slice(1);
      let category = actData.category || actData.categoria || actData.tipo;
      if (!category || category === 'Otros' || category === 'otro') {
        category = getItemCategory({ name: formattedName, ...actData });
      }

      const notes = actData.notes || actData.observaciones || actData.observacion || actData.notas || '';

      const newItem = {
        name: formattedName,
        category,
        variety_type: actData.variety_type || actData.variety || actData.variedad || null,
        status: actData.status || actData.estado || 'saludable',
        latitude: lat,
        longitude: lng,
        notes,
        photo_url: uploadedPhotoUrl || actData.photo_url || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const inserted = await insertFarmInventoryItem(newItem);
      if (inserted) {
        result.addedItems.push(inserted);
        result.reverts.push({ type: 'DELETE_POINT', target_id: inserted.id });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: inserted }));
        }
      }
    }

    // ── AÑADIR CAMINO / LÍNEA DE RIEGO (POLILÍNEA) ────────────────────────────
    else if (ADD_PATH_TYPES.has(actType)) {
      let coords = actData.coordinates || actData.coords || [];

      // Si provino de audio continuo con recorrido GPS:
      if ((!coords || coords.length < 2) && audio?.gpsTrack && audio.gpsTrack.length >= 2) {
        const startSec = Number(actData.start_audio_s) || 0;
        const endSec = Number(actData.end_audio_s) || ((audio.gpsTrack[audio.gpsTrack.length - 1].timestamp - audio.t0) / 1000);
        coords = interpolateGpsTrackSegment({
          t0: audio.t0,
          gpsTrack: audio.gpsTrack,
          startAudioSec: startSec,
          endAudioSec: endSec,
        });
      }

      if (coords && coords.length >= 2) {
        const lengthMeters = calculateTrackLengthMeters(coords);
        const pathType = actData.path_type || actData.tipo || 'linea_riego';
        const color = actData.color || (pathType === 'linea_riego' ? '#0284c7' : '#f97316');

        const newPath = {
          name: actData.name || actData.nombre || `Trazado ${pathType}`,
          path_type: pathType,
          color,
          coordinates: coords,
          length_meters: lengthMeters,
          notes: actData.notes || actData.observaciones || 'Trazado con IA',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const insertedPath = await insertFarmPath(newPath);
        if (insertedPath) {
          result.addedPaths.push(insertedPath);
          result.reverts.push({ type: 'DELETE_PATH', target_id: insertedPath.id });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: insertedPath }));
          }
        }
      }
    }
  }

  return result;
}
