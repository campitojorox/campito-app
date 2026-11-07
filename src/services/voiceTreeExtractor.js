// src/services/voiceTreeExtractor.js
// Servicio de extracción estructurada de entidades agrícolas a partir de audio continuo
// con soporte para:
// 1. Detección y adición de árboles, plantas y elementos de infraestructura georreferenciados.
// 2. Detección y ejecución de ÓRDENES DE BORRADO POR VOZ ("borra el último árbol", "elimina el anterior", etc.).
// 3. Interpolación espacio-temporal continua con telemetría GPS.

import { interpolateTreeEntities, treesToGeoJSON } from '../utils/geoAudioInterpolation';
import { supabase } from '../supabaseClient';

/**
 * Esquema JSON estricto para Structured Outputs de Gemini
 * Permite capturar tanto adiciones como órdenes de borrado en la misma locución de audio.
 */
const TREE_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    trees_to_add: {
      type: 'ARRAY',
      description: 'Lista ordenada de árboles y elementos de la finca descritos para agregar al catastro',
      items: {
        type: 'OBJECT',
        properties: {
          id: {
            type: 'STRING',
            description: 'Identificador temporal único (ej: tree_1, tree_2)',
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
    },
    voice_deletions: {
      type: 'ARRAY',
      description: 'Órdenes explícitas del usuario pidiendo borrar, cancelar o eliminar un árbol o punto (ej: "borra el último árbol", "cancela el aguacate anterior", "elimina la arqueta de hace un momento", "borra el punto aquí")',
      items: {
        type: 'OBJECT',
        properties: {
          target: {
            type: 'STRING',
            enum: ['ultimo', 'especifico', 'cercano'],
            description: 'Tipo de objetivo a borrar: "ultimo" (el último árbol o punto mencionado), "especifico" (un tipo o variedad concreta mencionada para borrar), o "cercano" (un punto preexistente en esta coordenada)',
          },
          target_description: {
            type: 'STRING',
            description: 'Frase o descripción de lo que el usuario ordenó borrar (ej: "el último aguacate", "el aguacate Hass con clorosis", "la arqueta")',
          },
          timestamp_audio_s: {
            type: 'NUMBER',
            description: 'Segundo exacto del audio donde el usuario ordenó borrar',
          },
        },
        required: ['target', 'target_description', 'timestamp_audio_s'],
      },
    },
  },
  required: ['trees_to_add', 'voice_deletions'],
};

const EXTRACTION_SYSTEM_INSTRUCTION = `Eres un experto agrónomo y topógrafo especializado en catastro de fincas agrícolas para Campito Jorox.

Tu tarea es analizar la grabación de voz de un agricultor que camina por los bancales describiendo árboles y elementos que encuentra en su trayecto, así como posibles correcciones u órdenes de borrado por voz.

INSTRUCCIONES CLAVE:
1. DETECCIÓN DE ELEMENTOS A AGREGAR (trees_to_add):
   - Escucha atentamente cada mención de un árbol, planta, arqueta o elemento de riego.
   - Determina con la máxima precisión el segundo del audio (\`timestamp_audio_s\`) en el que empieza a hablar de cada ejemplar.
   - Extrae:
     * \`tipo\`: Especie o elemento (ej: "aguacate", "limonero", "arqueta").
     * \`variedad\`: Variedad botánica si se menciona (ej: "Hass", "Bacon", "Fuerte") o null.
     * \`estado\`: Uno de: 'saludable', 'clorosis', 'poda_requerida', 'enfermo', 'seco', 'observaciones'.
     * \`observaciones\`: Transcripción de comentarios del agricultor.

2. DETECCIÓN DE ÓRDENES DE BORRADO POR VOZ (voice_deletions):
   - Si el agricultor dice frases como:
     * "Espera, borra el último árbol"
     * "Elimina el aguacate anterior / que acabo de decir"
     * "Cancela este punto"
     * "Borra el árbol de aquí / el punto anterior"
     * "Quita la arqueta que dije hace un momento"
   - Regístralo en \`voice_deletions\` con su segundo exacto (\`timestamp_audio_s\`), el tipo de objetivo (\`ultimo\`, \`especifico\`, \`cercano\`) y la descripción del elemento a cancelar.

3. Genera una salida JSON estrictamente conforme al esquema especificado. No agregues texto fuera del JSON.`;

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
 * Procesa la sesión de voz geolocalizada con Gemini y ejecuta:
 * 1. Extracción de árboles y órdenes de borrado.
 * 2. Aplicación de las órdenes de borrado por voz (descartando adiciones canceladas o borrando de la BD).
 * 3. Interpolación espacio-temporal con el track GPS.
 * 4. Persistencia en Supabase (`farm_inventory`).
 *
 * @param {Object} params
 * @param {Blob} params.audioBlob - Blob de audio capturado con MediaRecorder.
 * @param {number} params.t0 - Timestamp de inicio en milisegundos.
 * @param {Array<Object>} params.gpsTrack - Array de lecturas GPS [{ timestamp, lat, lng, accuracy, altitude }].
 * @param {string} [params.apiKey] - Clave de Google Gemini (opcional, fallback a env).
 * @param {string} [params.modelId='gemini-3.5-flash'] - Modelo multimodal a utilizar.
 * @param {boolean} [params.persistToDatabase=true] - Guardar automáticamente en Supabase `farm_inventory`.
 * @returns {Promise<Object>} { trees, deletedEntities, geojson, totalDetected, totalDeleted, savedToDatabase }
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
            text: `A continuación tienes la grabación de audio de la ruta de campo. Extrae los árboles descritos y cualquier orden de borrado por voz que el usuario haya pronunciado ("borra el último", "cancela el anterior", etc.). La sesión duró aproximadamente ${((Date.now() - t0) / 1000).toFixed(0)} segundos.`,
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
      temperature: 0.1,
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
  let parsedOutput = { trees_to_add: [], voice_deletions: [] };
  try {
    const data = JSON.parse(rawJsonText);
    if (Array.isArray(data)) {
      // Manejo de compatibilidad en caso de que devuelva array plano
      parsedOutput.trees_to_add = data;
    } else {
      parsedOutput.trees_to_add = data.trees_to_add || [];
      parsedOutput.voice_deletions = data.voice_deletions || [];
    }
  } catch (parseErr) {
    console.error('Error al parsear respuesta JSON de Gemini:', rawJsonText);
    throw new Error('El modelo no devolvió un JSON válido');
  }

  // 5. Procesar Órdenes de Borrado por Voz
  let finalEntitiesToAdd = [...parsedOutput.trees_to_add];
  const deletedEntities = [];

  for (const del of parsedOutput.voice_deletions) {
    const delTime = Number(del.timestamp_audio_s) || 0;

    if (del.target === 'ultimo') {
      // Borrar el último elemento que se mencionó antes del comando de borrado
      let candidateIdx = -1;
      for (let i = finalEntitiesToAdd.length - 1; i >= 0; i--) {
        if (Number(finalEntitiesToAdd[i].timestamp_audio_s) <= delTime) {
          candidateIdx = i;
          break;
        }
      }

      if (candidateIdx >= 0) {
        const removed = finalEntitiesToAdd.splice(candidateIdx, 1)[0];
        deletedEntities.push({
          source: 'batch_cancel',
          description: del.target_description,
          item: removed,
        });
      } else {
        // Si no había ninguno previo en este lote, marcar para borrar el último en la base de datos
        deletedEntities.push({
          source: 'db_last',
          description: del.target_description,
          timestamp_audio_s: delTime,
        });
      }
    } else {
      // Borrado específico por tipo o variedad
      const query = (del.target_description || '').toLowerCase();
      const matchIdx = finalEntitiesToAdd.findIndex((e) => {
        const fullDesc = `${e.tipo || ''} ${e.variedad || ''}`.toLowerCase();
        return query.includes((e.tipo || '').toLowerCase()) || fullDesc.includes(query);
      });

      if (matchIdx >= 0) {
        const removed = finalEntitiesToAdd.splice(matchIdx, 1)[0];
        deletedEntities.push({
          source: 'batch_cancel',
          description: del.target_description,
          item: removed,
        });
      } else {
        deletedEntities.push({
          source: 'db_query',
          description: del.target_description,
          timestamp_audio_s: delTime,
        });
      }
    }
  }

  // Si hay órdenes de borrado que apuntan a elementos ya guardados en Supabase:
  if (persistToDatabase && supabase) {
    for (const del of deletedEntities) {
      if (del.source === 'db_last') {
        try {
          const { data: lastItems } = await supabase
            .from('farm_inventory')
            .select('id, name')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

          if (lastItems && lastItems.length > 0) {
            await supabase
              .from('farm_inventory')
              .update({ is_active: false })
              .eq('id', lastItems[0].id);
            del.deletedDatabaseId = lastItems[0].id;
            del.deletedDatabaseName = lastItems[0].name;
          }
        } catch (dbDelErr) {
          console.warn('[VoiceTreeExtractor] Error al borrar último en Supabase:', dbDelErr.message);
        }
      }
    }
  }

  // 6. Asignar UUIDs a los elementos que sobrevivieron
  const entitiesWithUUID = finalEntitiesToAdd.map((item, idx) => ({
    ...item,
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tree_${Date.now()}_${idx}_${Math.random().toString(36).substring(7)}`,
  }));

  // 7. Aplicar interpolación espacio-temporal
  const treesWithCoordinates = interpolateTreeEntities(entitiesWithUUID, t0, gpsTrack, {
    maxAccuracyThreshold: 6.0,
    maxTimeGapSec: 15.0,
  });

  // 8. Generar capa GeoJSON
  const geojsonLayer = treesToGeoJSON(treesWithCoordinates);

  // 9. Persistir nuevos elementos en Supabase (`farm_inventory`)
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
            : t.tipo.toLowerCase().includes('riego') || t.tipo.toLowerCase().includes('tuberia')
            ? 'riego_linea'
            : t.tipo.toLowerCase().includes('piedra') || t.tipo.toLowerCase().includes('linde')
            ? 'piedra_linde'
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
    deletedEntities,
    totalDeleted: deletedEntities.length,
    geojson: geojsonLayer,
    totalDetected: treesWithCoordinates.length,
    savedToDatabase: savedCount,
    trackDurationSec: (Date.now() - t0) / 1000,
    gpsPointsProcessed: gpsTrack.length,
  };
}
