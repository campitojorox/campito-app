// src/services/voiceInventoryExtractor.js
// Motor universal de extracción estructurada de entidades e infraestructura agrícola
// a partir de audio continuo con sincronización y telemetría GPS de campo.
//
// Capacidades:
// 1. Pines / Puntos: Árboles, plantas, arquetas, llaves de paso, goteros, hidrantes, construcciones, hitos.
// 2. Líneas / Polilíneas: Mangueras de riego, tuberías maestras, caminos, carriles, acequias, lindes.
// 3. Taxonomía dinámica: Categoría principal y subcategoría botánica/técnica automática.
// 4. Interpolación espacio-temporal continua (calzado de audio y GPS a 1.5s).
// 5. Detección y ejecución de órdenes de borrado y corrección por voz.

import {
  interpolateGpsAtAudioTime,
  interpolateGpsTrackSegment,
  calculateTrackLengthMeters,
} from '../utils/geoAudioInterpolation';
import {
  insertFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  deleteFarmPath,
} from './farmInventoryStorage';
import { getGlobalLastKnownGps } from '../hooks/useVoiceGeoTracker';

/**
 * Esquema JSON estricto para Structured Outputs de Google Gemini
 * Captura puntos (árboles, arquetas, hitos), polilíneas (riego, caminos) y cancelaciones.
 */
const INVENTORY_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    entities_to_add: {
      type: 'ARRAY',
      description: 'Puntos y elementos singulares descritos (árboles, arquetas, plantas, edificios, llaves)',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'ID temporal único (ej: pt_1, pt_2)' },
          name: { type: 'STRING', description: 'Nombre descriptivo del elemento (ej: "Aguacate Hass 4", "Arqueta Sector 2")' },
          category: {
            type: 'STRING',
            description: 'Categoría principal: "arbol", "riego", "edificio", "planta", "herramienta", "hito" o categoría nueva si es diferente',
          },
          subcategory: {
            type: 'STRING',
            nullable: true,
            description: 'Subcategoría o tipo específico (ej: "aguacate", "limonero", "valvula_retencion", "cueva", "arqueta")',
          },
          variety: {
            type: 'STRING',
            nullable: true,
            description: 'Variedad botánica o subtipo técnico si se menciona (ej: "Hass", "Bacon", "Eureka", "32mm")',
          },
          status: {
            type: 'STRING',
            enum: ['saludable', 'clorosis', 'poda_requerida', 'enfermo', 'seco', 'observaciones'],
            description: 'Diagnóstico o estado fitosanitario observado',
          },
          observations: {
            type: 'STRING',
            description: 'Observaciones técnicas o comentarios dictados por el agricultor',
          },
          timestamp_audio_s: {
            type: 'NUMBER',
            description: 'Segundo exacto (en decimales) del audio donde el agricultor empieza a describir este punto específico',
          },
        },
        required: ['name', 'category', 'status', 'timestamp_audio_s'],
      },
    },
    paths_to_add: {
      type: 'ARRAY',
      description: 'Trazados continuos o polilíneas recorridos durante el audio (mangueras de riego, tuberías, caminos, acequias)',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'ID temporal único (ej: path_1)' },
          name: { type: 'STRING', description: 'Nombre del trazado (ej: "Línea goteo bancal 2", "Manguera 32mm")' },
          path_type: {
            type: 'STRING',
            enum: ['linea_riego', 'camino', 'carril', 'sendero', 'vereda', 'acequia', 'linde', 'otro'],
            description: 'Tipo de trazado',
          },
          color: { type: 'STRING', description: 'Color hexadecimal para el mapa (ej: #0284c7 para riego, #f97316 para camino)' },
          observations: { type: 'STRING', description: 'Notas o descripción del recorrido' },
          start_audio_s: { type: 'NUMBER', description: 'Segundo del audio donde empieza el recorrido del trazado' },
          end_audio_s: { type: 'NUMBER', description: 'Segundo del audio donde termina el recorrido del trazado' },
        },
        required: ['name', 'path_type', 'start_audio_s', 'end_audio_s'],
      },
    },
    voice_deletions: {
      type: 'ARRAY',
      description: 'Órdenes de borrado habladas por el usuario (ej: "borra el último árbol", "cancela la arqueta de hace un momento")',
      items: {
        type: 'OBJECT',
        properties: {
          target_type: {
            type: 'STRING',
            enum: ['point', 'path', 'ultimo', 'especifico'],
            description: 'Tipo de elemento que el agricultor ordenó borrar',
          },
          target_description: {
            type: 'STRING',
            description: 'Descripción textual de lo que se ordenó borrar (ej: "el último aguacate", "la manguera")',
          },
          timestamp_audio_s: {
            type: 'NUMBER',
            description: 'Segundo del audio donde el usuario ordenó la cancelación',
          },
        },
        required: ['target_type', 'target_description', 'timestamp_audio_s'],
      },
    },
  },
  required: ['entities_to_add', 'paths_to_add', 'voice_deletions'],
};

const SYSTEM_INSTRUCTION = `Eres el Agente Topógrafo y Agrónomo de precisión para Campito Jorox (Parcelas 195 y 196).

Tu misión es analizar la locución de audio y telemetría de un agricultor que camina por la finca y extraer:
1. PUNTOS / PINES (entities_to_add): Cada árbol, arqueta, gotero, hidrante, caseta o elemento singular.
   - Determina el segundo exacto ("timestamp_audio_s") del audio en el que comienza a hablar de cada elemento.
   - Clasifica la categoría ("arbol", "riego", "edificio", "planta", "herramienta", "hito" o nueva si es distinta).
   - Extrae variedad ("Hass", "Bacon", "Eureka", "32mm", etc.) y estado fitosanitario ("saludable", "clorosis", "poda_requerida", "enfermo", "seco").

2. POLILÍNEAS / LÍNEAS (paths_to_add): Si el agricultor indica que está recorriendo un camino, manguera, tubería o linde:
   - Extrae "start_audio_s" y "end_audio_s" indicando el tramo de audio durante el cual se desplazó a lo largo de esa línea.
   - Asigna path_type: "linea_riego", "camino", "carril", "sendero", "vereda", "acequia", "linde" u "otro".

3. ÓRDENES DE BORRADO (voice_deletions):
   - Frases como "borra el último", "cancela el aguacate anterior", "elimina este punto".

Genera exclusivamente un JSON conforme al esquema establecido.`;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Procesa una sesión continua de voz y GPS con Gemini.
 * Interpola coordenadas reales, resuelve polilíneas y persiste en Supabase/local-first.
 *
 * @param {Object} params
 * @param {Blob} params.audioBlob
 * @param {number} params.t0 - Epoch timestamp inicial (ms)
 * @param {Array<Object>} params.gpsTrack - Array de lecturas GPS [{ timestamp, lat, lng, accuracy }]
 * @param {string} [params.apiKey]
 * @param {string} [params.modelId='gemini-3.5-flash']
 * @param {boolean} [params.persistToDatabase=true]
 * @returns {Promise<Object>} Resultado con puntos agregados, caminos trazados y borrados ejecutados.
 */
export async function processVoiceInventorySession({
  audioBlob,
  t0,
  gpsTrack,
  apiKey = import.meta.env.VITE_GEMINI_API_KEY,
  modelId = 'gemini-3.5-flash',
  persistToDatabase = true,
}) {
  if (!audioBlob) throw new Error('Se requiere un Blob de audio válido');
  if (!t0) throw new Error('Se requiere el timestamp inicial t0');

  let effectiveGpsTrack = Array.isArray(gpsTrack) ? [...gpsTrack] : [];
  if (effectiveGpsTrack.length === 0) {
    const fallback = getGlobalLastKnownGps();
    if (fallback && typeof fallback.lat === 'number' && typeof fallback.lng === 'number') {
      effectiveGpsTrack.push({ ...fallback, timestamp: t0, relativeTimeMs: 0 });
    } else {
      effectiveGpsTrack.push({ lat: 36.72595, lng: -4.89462, accuracy: 5.0, timestamp: t0, relativeTimeMs: 0 });
    }
  }

  if (!apiKey) throw new Error('API Key de Gemini no configurada');

  // 1. Audio a Base64
  const audioBase64 = await blobToBase64(audioBlob);
  const cleanMime = (audioBlob.type || 'audio/webm').split(';')[0].trim();

  // 2. Llamada a Gemini con Structured Outputs
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Sesión de inventario agrícola en movimiento de Campito Jorox. Duración aproximada: ${((Date.now() - t0) / 1000).toFixed(1)} segundos. Hay ${effectiveGpsTrack.length} lecturas de telemetría GPS sincronizadas con este audio. Extrae los puntos singulares (árboles, arquetas), las líneas recorridas (riego, caminos) y cualquier orden de borrado hablada.`,
          },
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generation_config: {
      response_mime_type: 'application/json',
      response_schema: INVENTORY_EXTRACTION_SCHEMA,
      temperature: 0.1,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const resultData = await response.json();
  const rawJsonText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJsonText) {
    throw new Error('No se recibió contenido estructurado de Gemini');
  }

  let parsed = { entities_to_add: [], paths_to_add: [], voice_deletions: [] };
  try {
    const cleanJson = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleanJson);
  } catch (parseErr) {
    console.error('Error parseando JSON de Gemini:', rawJsonText);
    throw new Error('El modelo devolvió un formato no válido');
  }

  const entitiesToAdd = parsed.entities_to_add || [];
  const pathsToAdd = parsed.paths_to_add || [];
  const deletions = parsed.voice_deletions || [];

  // 3. Procesar borrados intra-lote si el agricultor canceló algo antes de guardar
  let finalEntities = [...entitiesToAdd];
  let finalPaths = [...pathsToAdd];
  const executedDeletions = [];

  for (const del of deletions) {
    const delSec = Number(del.timestamp_audio_s) || 0;
    if (del.target_type === 'ultimo' || del.target_type === 'point') {
      const idx = finalEntities.findIndex((e) => Number(e.timestamp_audio_s) <= delSec);
      if (idx >= 0) {
        const removed = finalEntities.splice(idx, 1)[0];
        executedDeletions.push({ type: 'point', item: removed });
      }
    } else if (del.target_type === 'path') {
      const pIdx = finalPaths.findIndex((p) => Number(p.end_audio_s) <= delSec);
      if (pIdx >= 0) {
        const removed = finalPaths.splice(pIdx, 1)[0];
        executedDeletions.push({ type: 'path', item: removed });
      }
    }
  }

  // 4. Interpolar coordenadas para cada punto singular
  const resolvedPoints = finalEntities.map((ent) => {
    const audioSec = Number(ent.timestamp_audio_s) || 0;
    const geo = interpolateGpsAtAudioTime({
      t0,
      gpsTrack: effectiveGpsTrack,
      timestampAudioSec: audioSec,
    });

    const fallbackPt = effectiveGpsTrack[0] || { lat: 36.72595, lng: -4.89462, accuracy: 5.0 };
    const lat = geo.lat || fallbackPt.lat;
    const lng = geo.lng || fallbackPt.lng;

    return {
      name: ent.name || `${ent.category} ${ent.variety || ''}`.trim(),
      category: ent.category || 'arbol',
      variety_type: ent.variety || ent.subcategory || null,
      status: ent.status || 'saludable',
      latitude: lat,
      longitude: lng,
      accuracy_meters: geo.accuracy_m || fallbackPt.accuracy || 4.0,
      notes: ent.observations || `Registrado por voz en segundo ${audioSec.toFixed(1)}s`,
      is_active: true,
      audio_timestamp_s: audioSec,
    };
  });

  // 5. Interpolar coordenadas para cada trazado / polilínea
  const resolvedPaths = finalPaths.map((p) => {
    const startSec = Number(p.start_audio_s) || 0;
    const endSec = Number(p.end_audio_s) || ((Date.now() - t0) / 1000);
    const coordinates = interpolateGpsTrackSegment({
      t0,
      gpsTrack: effectiveGpsTrack,
      startAudioSec: startSec,
      endAudioSec: endSec,
    });

    const lengthMeters = calculateTrackLengthMeters(coordinates);
    const defaultColor = p.path_type === 'linea_riego' ? '#0284c7' : '#f97316';

    return {
      name: p.name || `Trazado ${p.path_type}`,
      path_type: p.path_type || 'linea_riego',
      color: p.color || defaultColor,
      coordinates,
      length_meters: lengthMeters,
      notes: p.observations || `Grabado por voz en movimiento (${startSec}s - ${endSec}s)`,
      is_active: true,
    };
  });

  // 6. Persistencia automática Local-First / Supabase si persistToDatabase = true
  const savedPoints = [];
  const savedPaths = [];

  if (persistToDatabase) {
    for (const pt of resolvedPoints) {
      try {
        const saved = await insertFarmInventoryItem(pt);
        if (saved) {
          savedPoints.push(saved);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: saved }));
          }
        }
      } catch (e) {
        console.warn('[VoiceInventoryExtractor] Error insertando punto:', e);
      }
    }

    for (const path of resolvedPaths) {
      try {
        const savedP = await insertFarmPath(path);
        if (savedP) {
          savedPaths.push(savedP);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: savedP }));
          }
        }
      } catch (e) {
        console.warn('[VoiceInventoryExtractor] Error insertando camino:', e);
      }
    }
  }

  return {
    rawExtraction: parsed,
    points: persistToDatabase ? savedPoints : resolvedPoints,
    paths: persistToDatabase ? savedPaths : resolvedPaths,
    deletions: executedDeletions,
    totalPoints: (persistToDatabase ? savedPoints : resolvedPoints).length,
    totalPaths: (persistToDatabase ? savedPaths : resolvedPaths).length,
    gpsTrackLength: effectiveGpsTrack.length,
  };
}

