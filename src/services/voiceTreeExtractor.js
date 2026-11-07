// src/services/voiceTreeExtractor.js
// Servicio de extracción estructurada de entidades agrícolas a partir de audio continuo
// utilizando la API de Google Gemini con Structured Outputs (JSON Schema estricto).

import { interpolateTreeEntities, treesToGeoJSON } from '../utils/geoAudioInterpolation';
import { supabase } from '../supabaseClient';

/**
 * Esquema JSON estricto para Structured Outputs de Gemini
 */
const TREE_EXTRACTION_SCHEMA = {
  type: 'ARRAY',
  description: 'Lista ordenada de árboles y elementos de la finca detectados en la locución de voz',
  items: {
    type: 'OBJECT',
    properties: {
      id: {
        type: 'STRING',
        description: 'Identificador único temporal para el elemento (ej: tree_1, tree_2)',
      },
      tipo: {
        type: 'STRING',
        description: 'Especie vegetal o tipo de elemento: aguacate, limonero, naranjo, olivo, arqueta, acequia, piedra_linde, tubería, etc.',
      },
      variedad: {
        type: 'STRING',
        nullable: true,
        description: 'Variedad específica si se menciona: Hass, Bacon, Fuerte, Reed, Limón Eureka, o null si no se especifica',
      },
      estado: {
        type: 'STRING',
        enum: ['saludable', 'clorosis', 'poda_requerida', 'enfermo', 'seco', 'observaciones'],
        description: 'Diagnóstico o estado fitosanitario observado',
      },
      observaciones: {
        type: 'STRING',
        description: 'Notas o detalles hablados por el agricultor sobre el árbol o arqueta',
      },
      timestamp_audio_s: {
        type: 'NUMBER',
        description: 'Segundo exacto (en decimales) del audio en el que el agricultor comienza a describir este árbol o elemento específico',
      },
    },
    required: ['tipo', 'estado', 'timestamp_audio_s'],
  },
};

const EXTRACTION_SYSTEM_INSTRUCTION = `Eres un experto agrónomo y topógrafo especializado en catastro de fincas agrícolas para Campito Jorox.

Tu tarea es analizar la grabación de voz de un agricultor que camina por los bancales describiendo los árboles y elementos que encuentra en su trayecto.

INSTRUCCIONES CLAVE:
1. Escucha atentamente cada mención de un árbol, planta, arqueta o elemento de riego.
2. Determina con la máxima precisión el segundo del audio (\`timestamp_audio_s\`) en el que empieza a hablar de cada ejemplar.
3. Extrae:
   - \`tipo\`: Especie o tipo de elemento (ej: "aguacate", "limonero", "arqueta").
   - \`variedad\`: Variedad botánica si se menciona (ej: "Hass", "Bacon", "Fuerte", "4 estaciones") o null si no se indica.
   - \`estado\`: Uno de: 'saludable', 'clorosis', 'poda_requerida', 'enfermo', 'seco', 'observaciones'.
   - \`observaciones\`: Transcripción fiel de lo comentado por el agricultor (ej: "buen calibre, sin plagas", "falta hierro en hojas nuevas").
4. Genera una salida JSON estrictamente conforme al esquema especificado. No agregues texto introductorio ni explicaciones fuera del JSON.`;

/**
 * Convierte un Blob de audio a base64 string.
 */
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
 * Procesa la sesión de voz geolocalizada con Gemini y ejecuta la interpolación espacio-temporal.
 *
 * @param {Object} params
 * @param {Blob} params.audioBlob - Blob de audio capturado con MediaRecorder.
 * @param {number} params.t0 - Timestamp de inicio en milisegundos.
 * @param {Array<Object>} params.gpsTrack - Array de lecturas GPS [{ timestamp, lat, lng, accuracy, altitude }].
 * @param {string} [params.apiKey] - Clave de Google Gemini (opcional, fallback a env).
 * @param {string} [params.modelId='gemini-3.5-flash'] - Modelo multimodal a utilizar.
 * @param {boolean} [params.persistToDatabase=true] - Guardar automáticamente en Supabase `farm_inventory`.
 * @returns {Promise<Object>} { trees, geojson, totalDetected, savedToDatabase }
 */
export async function processVoiceGeoSession({
  audioBlob,
  t0,
  gpsTrack,
  apiKey = import.meta.env.VITE_GEMINI_API_KEY,
  modelId = 'gemini-3.5-flash',
  persistToDatabase = true,
}) {
  if (!audioBlob) throw new Error('Se requiere un Blob de audio válido');
  if (!t0) throw new Error('Se requiere el timestamp inicial t0');
  if (!Array.isArray(gpsTrack) || gpsTrack.length === 0) {
    throw new Error('Se requiere al menos un punto GPS en el track');
  }
  if (!apiKey) throw new Error('API Key de Gemini no configurada');

  // 1. Convertir audio a base64
  const audioBase64 = await blobToBase64(audioBlob);
  const mimeType = audioBlob.type || 'audio/webm';

  // 2. Preparar payload REST para Gemini con Structured Outputs
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const payload = {
    system_instruction: {
      parts: [{ text: EXTRACTION_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `A continuación tienes la grabación de audio de la ruta de campo. Extrae todos los árboles y elementos descritos con su segundo exacto de locución. La sesión tuvo una duración aproximada de ${((Date.now() - t0) / 1000).toFixed(0)} segundos.`,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generation_config: {
      response_mime_type: 'application/json',
      response_schema: TREE_EXTRACTION_SCHEMA,
      temperature: 0.1, // Baja temperatura para máxima precisión determinista
    },
  };

  // 3. Llamar a la API de Gemini
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

  // 4. Parsear JSON de salida garantizada
  let extractedEntities = [];
  try {
    extractedEntities = JSON.parse(rawJsonText);
  } catch (parseErr) {
    console.error('Error al parsear respuesta JSON de Gemini:', rawJsonText);
    throw new Error('El modelo no devolvió un JSON válido');
  }

  // 5. Asignar UUIDs definitivos
  const entitiesWithUUID = extractedEntities.map((item, idx) => ({
    ...item,
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tree_${Date.now()}_${idx}_${Math.random().toString(36).substring(7)}`,
  }));

  // 6. Aplicar la función de interpolación espacio-temporal
  const treesWithCoordinates = interpolateTreeEntities(entitiesWithUUID, t0, gpsTrack, {
    maxAccuracyThreshold: 6.0,
    maxTimeGapSec: 15.0,
  });

  // 7. Generar capa GeoJSON
  const geojsonLayer = treesToGeoJSON(treesWithCoordinates);

  // 8. Opcional: Persistir directamente en Supabase (farm_inventory)
  let savedCount = 0;
  if (persistToDatabase && supabase) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Admin';

      const rowsToInsert = treesWithCoordinates
        .filter((t) => t.coordenadas?.lat && t.coordenadas?.lng)
        .map((t) => ({
          name: `${t.tipo} ${t.variedad || ''}`.trim(),
          category: t.tipo.toLowerCase().includes('arqueta')
            ? 'arqueta'
            : t.tipo.toLowerCase().includes('acequia')
            ? 'acequia'
            : 'arbol',
          variety_type: t.variedad || null,
          latitude: t.coordenadas.lat,
          longitude: t.coordenadas.lng,
          accuracy_meters: t.accuracy_m,
          altitude_meters: t.altitude_m,
          audio_timestamp_s: t.timestamp_audio_s,
          gps_warning: t.advertencia_gps,
          status: t.estado,
          notes: t.observaciones || null,
          user_id: user?.id || null,
          user_name: userName,
          is_active: true,
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('farm_inventory')
          .insert(rowsToInsert);

        if (!insertErr) {
          savedCount = rowsToInsert.length;
        } else {
          console.warn('[VoiceTreeExtractor] Aviso guardando en Supabase:', insertErr.message);
        }
      }
    } catch (dbErr) {
      console.warn('[VoiceTreeExtractor] Error al persistir en Supabase:', dbErr.message);
    }
  }

  return {
    trees: treesWithCoordinates,
    geojson: geojsonLayer,
    totalDetected: treesWithCoordinates.length,
    savedToDatabase: savedCount,
    trackDurationSec: (Date.now() - t0) / 1000,
    gpsPointsProcessed: gpsTrack.length,
  };
}
