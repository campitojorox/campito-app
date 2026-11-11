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

const DEFAULT_CENTER = [36.72595, -4.89462];

const GEMINI_MODELS_CASCADE = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.1-flash-lite',
];

/**
 * Analizador universal de comandos estructurados:
 * - [[REGISTRAR_PUNTOS: [ ... ] ]]
 * - [[REGISTRAR_PUNTO: { ... } ]]
 * - [[BORRAR_PUNTO: { ... } ]]
 */
export function parseStructuredCommands(rawText) {
  if (!rawText || typeof rawText !== 'string') return { points: [], deletions: [], paths: [], updates: [] };
  const points = [];
  const deletions = [];

  // 1. Bloques múltiples: [[REGISTRAR_PUNTOS: [...] ]]
  const batchRegex = /\[\[REGISTRAR_PUNTOS:\s*(\[[\s\S]*?\])\s*\]\]/gi;
  let batchMatch;
  while ((batchMatch = batchRegex.exec(rawText)) !== null) {
    try {
      const cleanJson = batchMatch[1].replace(/,\s*([\]}])/g, '$1');
      const items = JSON.parse(cleanJson);
      if (Array.isArray(items)) points.push(...items);
    } catch {
      const objMatches = batchMatch[1].match(/\{[\s\S]*?\}/g);
      if (objMatches) {
        for (const om of objMatches) {
          try {
            points.push(JSON.parse(om.replace(/,\s*([\]}])/g, '$1')));
          } catch {
            // Ignorar fragmentos JSON malformados individuales
          }
        }
      }
    }
  }

  // 2. Punto individual: [[REGISTRAR_PUNTO: {...} ]]
  const singleRegex = /\[\[REGISTRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi;
  let singleMatch;
  while ((singleMatch = singleRegex.exec(rawText)) !== null) {
    try {
      const cleanJson = singleMatch[1].replace(/,\s*([\]}])/g, '$1');
      const item = JSON.parse(cleanJson);
      if (item && typeof item === 'object') points.push(item);
    } catch {
      // Ignorar comando malformado
    }
  }

  // 3. Borrado: [[BORRAR_PUNTO: {...} ]]
  const delRegex = /\[\[BORRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi;
  let delMatch;
  while ((delMatch = delRegex.exec(rawText)) !== null) {
    try {
      const cleanJson = delMatch[1].replace(/,\s*([\]}])/g, '$1');
      const item = JSON.parse(cleanJson);
      if (item && typeof item === 'object') deletions.push(item);
    } catch {
      // Ignorar comando malformado
    }
  }

  // 4. Camino / Trazado / Línea de riego: [[REGISTRAR_CAMINO: {...} ]]
  const pathRegex = /\[\[REGISTRAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi;
  let pathMatch;
  const paths = [];
  while ((pathMatch = pathRegex.exec(rawText)) !== null) {
    try {
      const cleanJson = pathMatch[1].replace(/,\s*([\]}])/g, '$1');
      const item = JSON.parse(cleanJson);
      if (item && typeof item === 'object') paths.push(item);
    } catch {
      // Ignorar comando malformado
    }
  }

  // 5. Edición de punto: [[EDITAR_PUNTO: {...} ]]
  const editRegex = /\[\[EDITAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi;
  let editMatch;
  const updates = [];
  while ((editMatch = editRegex.exec(rawText)) !== null) {
    try {
      const cleanJson = editMatch[1].replace(/,\s*([\]}])/g, '$1');
      const item = JSON.parse(cleanJson);
      if (item && typeof item === 'object') updates.push(item);
    } catch {
      // Ignorar comando malformado
    }
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
Tu misión es interpretar órdenes de voz, fotos y texto y convertirlas en acciones de catastro e inventario sobre el mapa satelital.
${targetInfoStr}

Coordenadas de referencia:
- GPS Usuario: ${currentGps ? `${currentGps.lat.toFixed(6)}, ${currentGps.lng.toFixed(6)} (±${currentGps.accuracy?.toFixed(1) || '4'}m)` : 'No disponible'}
- Centro activo del mapa: ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}

Elementos visibles en la zona:
- Puntos (${inventoryContext.length}): ${JSON.stringify(inventoryContext)}
- Caminos (${pathsContext.length}): ${JSON.stringify(pathsContext)}

FORMATOS ADMITIDOS:
1. Puntos nuevos:
[[REGISTRAR_PUNTOS: [
  {
    "name": "Nombre descriptivo (ej: 'Aguacate Hass 3', 'Arqueta Principal')",
    "category": "arbol|riego|edificio|planta|herramienta|hito|o categoría nueva",
    "variedad": "variedad botánica o subtipo si aplica",
    "estado": "saludable|clorosis|poda_requerida|enfermo|seco",
    "observaciones": "notas del agricultor",
    "latitude": null,
    "longitude": null,
    "timestamp_audio_s": 0.0
  }
] ]]
*NOTA GPS*: Si el usuario habla mientras camina, no fijes lat/lng arbitrarias; deja latitude: null y asigna "timestamp_audio_s" con el segundo del audio para interpolación satelital.

2. Borrado:
[[BORRAR_PUNTO: { "target": "ultimo|especifico", "query": "nombre o descripción" } ]]

3. Esquema JSON estándar de acciones:
{
  "description": "Resumen conciso en español...",
  "transcription": "Texto transcrito del audio si lo hubo...",
  "actions": [
    {
      "type": "ADD_POINT" | "CREATE_POINT" | "UPDATE_POINT" | "DELETE_POINT" | "ADD_PATH" | "UPDATE_PATH" | "DELETE_PATH",
      "target_id": "uuid si es update/delete",
      "data": { ... }
    }
  ]
}`;
}

export function parseMapGeminiRawText(rawText, audio = null) {
  const parsedCmds = parseStructuredCommands(rawText);
  if (parsedCmds.points.length > 0 || parsedCmds.deletions.length > 0) {
    const actions = [];
    for (const p of parsedCmds.points) {
      actions.push({
        type: 'ADD_POINT',
        data: {
          name: p.name || p.nombre || p.tipo || 'Punto registrado',
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
    for (const d of parsedCmds.deletions) {
      actions.push({
        type: 'DELETE_POINT',
        target: d.target || 'especifico',
        query: d.query || d.nombre || '',
      });
    }

    const cleanDescription = rawText
      .replace(/\[\[REGISTRAR_PUNTOS:[\s\S]*?\]\]/gi, '')
      .replace(/\[\[REGISTRAR_PUNTO:[\s\S]*?\]\]/gi, '')
      .replace(/\[\[BORRAR_PUNTO:[\s\S]*?\]\]/gi, '')
      .trim();

    return {
      description: cleanDescription || `Procesados ${actions.length} cambio(s) en el inventario`,
      transcription: audio?.transcription || '',
      actions,
    };
  }

  const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

export async function callGeminiForInventoryAction({
  prompt,
  audio,
  attachment,
  selectedTarget,
  visibleInventory = [],
  visiblePaths = [],
  mapCenter = DEFAULT_CENTER,
  currentGps = null,
  apiKey = import.meta.env.VITE_GEMINI_API_KEY,
}) {
  if (!apiKey) throw new Error('API Key de Gemini no configurada.');

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

  if (attachment) {
    if (attachment.textContent) {
      userParts.push({ text: `\n\n📄 **CONTENIDO ADJUNTO ("${attachment.name || 'documento'}")**:\n\`\`\`\n${attachment.textContent}\n\`\`\`\n` });
    }
    if (attachment.dataUrl) {
      const match = attachment.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
      if (match) {
        const cleanMime = match[1].toLowerCase().split(';')[0].trim();
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({ inlineData: { mimeType: cleanMime, data: match[2] } });
        }
      }
    }
  }

  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (match) {
      userParts.push({ inlineData: { mimeType: match[1].split(';')[0].trim(), data: match[2] } });
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
      const timeoutId = setTimeout(() => controller.abort(), audio || attachment ? 35000 : 20000);
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

      const parsedCmds = parseStructuredCommands(rawText);
      if (parsedCmds.points.length > 0 || parsedCmds.deletions.length > 0) {
        const actions = [];
        for (const p of parsedCmds.points) {
          actions.push({
            type: 'ADD_POINT',
            data: {
              name: p.name || p.nombre || p.tipo || 'Punto registrado',
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
        for (const d of parsedCmds.deletions) {
          actions.push({
            type: 'DELETE_POINT',
            target: d.target || 'especifico',
            query: d.query || d.nombre || '',
          });
        }

        const cleanDescription = rawText
          .replace(/\[\[REGISTRAR_PUNTOS:[\s\S]*?\]\]/gi, '')
          .replace(/\[\[REGISTRAR_PUNTO:[\s\S]*?\]\]/gi, '')
          .replace(/\[\[BORRAR_PUNTO:[\s\S]*?\]\]/gi, '')
          .trim();

        return {
          description: cleanDescription || `Procesados ${actions.length} cambio(s) en el inventario`,
          transcription: audio?.transcription || '',
          actions,
        };
      }

      let parsed;
      try {
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw e;
      }
      return parsed;
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

  for (const act of actions) {
    const actType = (act.type || '').toUpperCase();
    const actData = act.data || act;

    // ── BORRAR PUNTO ──────────────────────────────────────────────────────────
    if (actType === 'DELETE_POINT' || actType === 'REMOVE_POINT') {
      let targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
      if (!targetId && (act.query || act.target === 'ultimo' || actData.query || actData.target === 'ultimo')) {
        const isLast = act.target === 'ultimo' || actData.target === 'ultimo';
        const q = (act.query || actData.query || '').toLowerCase().trim();
        let matched = null;
        if (isLast) {
          matched = currentInventory[0];
        } else if (q) {
          matched = currentInventory.find(
            (i) =>
              (i.name && i.name.toLowerCase().includes(q)) ||
              (i.variety_type && i.variety_type.toLowerCase().includes(q)) ||
              (i.category && i.category.toLowerCase().includes(q))
          );
        }
        if (matched) targetId = matched.id;
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
    else if (actType === 'DELETE_PATH' || actType === 'REMOVE_PATH') {
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
    else if (actType === 'UPDATE_POINT' || actType === 'EDIT_POINT' || actType === 'MODIFY_POINT') {
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
    else if (actType === 'UPDATE_PATH' || actType === 'EDIT_PATH') {
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
    else if (actType === 'ADD_POINT' || actType === 'CREATE_POINT' || actType === 'INSERT_POINT' || actType === 'NEW_POINT') {
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

      const rawName = actData.name || actData.title || actData.tipo || 'Punto registrado';
      const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      let category = actData.category || actData.categoria || actData.tipo;
      if (!category || category === 'Otros' || category === 'otro') {
        category = getItemCategory({ name: formattedName, ...actData });
      }

      const notes = actData.notes || actData.observaciones || actData.notas || '';

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
    else if (actType === 'ADD_PATH' || actType === 'CREATE_PATH' || actType === 'INSERT_PATH') {
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
        const pathType = actData.path_type || 'linea_riego';
        const color = actData.color || (pathType === 'linea_riego' ? '#0284c7' : '#f97316');

        const newPath = {
          name: actData.name || `Trazado ${pathType}`,
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
