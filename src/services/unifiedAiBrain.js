// src/services/unifiedAiBrain.js
// CEREBRO IA UNIFICADO — CAMPITO JOROX
// Orquestador central multimodal (Texto, Voz GPS, Fotos, Documentos).
// Provee inteligencia 360°, herramientas globales, persistencia SSOT en Supabase
// y adaptadores para Chat General, Mapas, Calendario y Finanzas.

import { supabase } from '../supabaseClient';
import {
  insertFarmInventoryItem,
  updateFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  updateFarmPath,
  deleteFarmPath,
} from './farmInventoryStorage';
import {
  interpolateGpsAtAudioTime,
  calculateTrackLengthMeters,
} from '../utils/geoAudioInterpolation';
import { normalizeAttachments, appendAttachmentsToGeminiParts } from '../utils/attachmentUtils';
import { createCalendarEvent, deleteCalendarEvent } from './calendarService';

export const GEMINI_CASCADE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.1-flash-lite',
];

const DEFAULT_CENTER = [36.72595, -4.89462];

// ─────────────────────────────────────────────────────────────────────────────
// 1. CARGA DE METADATOS Y HERRAMIENTAS DINÁMICAS (farm_custom_tools)
// ─────────────────────────────────────────────────────────────────────────────
export async function loadActiveCustomTools() {
  try {
    const { data, error } = await supabase
      .from('farm_custom_tools')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) return data;
  } catch (e) {
    console.warn('[unifiedAiBrain] Supabase farm_custom_tools no disponible:', e.message);
  }
  return [];
}

export async function saveNewCustomTool(toolPayload, userMeta = null) {
  const newRow = {
    name: (toolPayload.name || 'herramienta_' + Date.now()).toLowerCase().trim().replace(/\s+/g, '_'),
    display_name: toolPayload.display_name || toolPayload.name || 'Nueva Herramienta',
    description: toolPayload.description || '',
    category: toolPayload.category || 'agronomia',
    parameters: Array.isArray(toolPayload.parameters) ? toolPayload.parameters : [],
    execution_recipe: toolPayload.execution_recipe || toolPayload.recipe || '',
    output_format: toolPayload.output_format || 'markdown',
    created_by_user: userMeta?.userId || null,
    created_by_name: userMeta?.userName || null,
    is_active: true,
  };

  try {
    const { data, error } = await supabase
      .from('farm_custom_tools')
      .insert([newRow])
      .select()
      .single();
    if (!error && data) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-tools-updated', { detail: data }));
      }
      return data;
    }
  } catch (e) {
    console.warn('[unifiedAiBrain] Error guardando herramienta dinámica:', e.message);
  }
  return newRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GESTIÓN UNIFICADA DE DOCUMENTOS (farm_documents y Storage /farm-assets/)
// ─────────────────────────────────────────────────────────────────────────────
export async function registerUnifiedDocument({
  file,
  dataUrl,
  name,
  fileType,
  fileSize,
  sectionOrigin = 'chat',
  category = 'general',
  inventoryId = null,
  pathId = null,
  userMeta = null,
  metadata = {},
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const cleanExt = name ? name.split('.').pop() : 'bin';
  const cleanBase = (name ? name.replace(/\.[^/.]+$/, '') : 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .substring(0, 30);
  const storagePath = `farm-assets/${year}/${month}/${Date.now()}_${cleanBase}.${cleanExt}`;

  let publicUrl = dataUrl || '';

  if (file) {
    try {
      const { error: upErr } = await supabase.storage
        .from('comprobantes')
        .upload(storagePath, file, { contentType: fileType || 'application/octet-stream' });
      if (!upErr) {
        const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(storagePath);
        if (pubData?.publicUrl) publicUrl = pubData.publicUrl;
      }
    } catch (e) {
      console.warn('[unifiedAiBrain] Error subiendo archivo a Storage:', e.message);
    }
  }

  const docRow = {
    name: name || 'Documento sin nombre',
    storage_path: storagePath,
    public_url: publicUrl,
    file_type: fileType || 'application/octet-stream',
    file_size: fileSize || 0,
    section_origin: sectionOrigin,
    category,
    inventory_id: inventoryId,
    path_id: pathId,
    metadata,
    user_id: userMeta?.userId || null,
    user_name: userMeta?.userName || null,
    is_active: true,
  };

  try {
    const { data: inserted, error: dbErr } = await supabase
      .from('farm_documents')
      .insert([docRow])
      .select()
      .single();
    if (!dbErr && inserted) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-documents-updated', { detail: inserted }));
      }
      return inserted;
    }
  } catch (e) {
    console.warn('[unifiedAiBrain] Error guardando registro en farm_documents:', e.message);
  }

  return docRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONSTRUCTOR DE CONTEXTO UNIVERSAL 360°
// ─────────────────────────────────────────────────────────────────────────────
export function buildUnifiedSystemPrompt({
  section = 'chat',
  selectedTarget = null,
  visibleInventory = [],
  visiblePaths = [],
  events = [],
  transactions = [],
  knowledge = [],
  customTools = [],
  mapCenter = DEFAULT_CENTER,
  currentGps = null,
}) {
  const centerLat = selectedTarget?.lat || currentGps?.lat || mapCenter?.[0] || DEFAULT_CENTER[0];
  const centerLng = selectedTarget?.lng || currentGps?.lng || mapCenter?.[1] || DEFAULT_CENTER[1];

  const pathsSummary = (visiblePaths || []).slice(0, 40).map((p) => {
    const coordsSample = Array.isArray(p.coordinates)
      ? `(${p.coordinates.length} puntos/vértices)`
      : '';
    return `- [ID: ${p.id}] "${p.name}" (${p.path_type || 'camino'}, ${Number(p.length_meters || 0).toFixed(0)}m, color: ${p.color || '#3b82f6'}) ${coordsSample}`;
  });

  const inventorySummary = (visibleInventory || []).slice(0, 60).map((i) => {
    const lat = typeof i.latitude === 'number' ? i.latitude.toFixed(6) : i.latitude;
    const lng = typeof i.longitude === 'number' ? i.longitude.toFixed(6) : i.longitude;
    return `- [ID: ${i.id}] [${(i.category || 'arbol').toUpperCase()}] "${i.name}" (${i.variety_type || 's/v'}) | Est: ${i.status || 'saludable'} | [${lat}, ${lng}]`;
  });

  const knowledgeSummary = (knowledge || []).slice(0, 30).map((k) => `- [${(k.category || 'general').toUpperCase()}] ${k.title}: ${k.content}`);

  const toolsSummary = (customTools || []).map((t) => `- 🛠️ [${t.name}] "${t.display_name}": ${t.description} (Parámetros: ${JSON.stringify(t.parameters)})`);

  const eventsSummary = (events || []).slice(0, 20).map((e) => `- [${e.date ? e.date.split('T')[0] : 'Fecha s/d'}] ${e.category || 'Evento'}: ${e.info || 'Sin notas'} (${(e.responsibles || []).join(', ')})`);

  const transactionsSummary = (transactions || []).slice(0, 20).map((t) => `- [${t.date ? t.date.split('T')[0] : ''}] ${t.type}: ${t.amount}€ (${t.description || ''})`);

  const selectedTargetInfo = selectedTarget ? `
🎯 ELEMENTO SELECCIONADO EN EL MAPA:
- Tipo: ${selectedTarget.type} (ID: ${selectedTarget.id || 'N/A'})
- Título: ${selectedTarget.title || 'N/A'} | Categoría: ${selectedTarget.category || selectedTarget.path_type || 'N/A'}
- Estado: ${selectedTarget.status || 'N/A'} | Coords: [${selectedTarget.lat}, ${selectedTarget.lng}]
*REGLA*: Si el usuario pide cambios ("cámbialo a clorosis", "muévelo", "bórralo", "cámbiale el color a azul"), aplícalos a este elemento.` : '';

  return `Eres el CEREBRO IA UNIFICADO de Campito Jorox (Tolox, Parcela 195 y 196).
Tienes acceso COMPLETO y SIMÉTRICO a toda la finca: Catastro Satelital, Caminos y Líneas de Riego, Calendario, Finanzas, Memoria permanente, Archivos y Herramientas dinámicas.

SECCIÓN ACTIVA DEL USUARIO: "${section.toUpperCase()}"
Coordenadas de referencia: Lat ${centerLat.toFixed(6)}, Lng ${centerLng.toFixed(6)} ${currentGps ? `(GPS ±${currentGps.accuracy?.toFixed(1) || '4'}m)` : ''}
${selectedTargetInfo}

🗺️ INVENTARIO GEOESPACIAL ACTIVO (${inventorySummary.length} puntos visibles):
${inventorySummary.join('\n') || 'Ninguno en foco'}

🛣️ CAMINOS Y LÍNEAS DE RIEGO (${pathsSummary.length} trazados activos):
${pathsSummary.join('\n') || 'Ninguno en foco'}

🧠 APRENDIZAJE Y MEMORIA PERMANENTE:
${knowledgeSummary.join('\n') || 'No hay reglas aprendidas todavía'}

🛠️ HERRAMIENTAS DINÁMICAS REGISTRADAS:
${toolsSummary.join('\n') || 'Ninguna herramienta personalizada registrada aún'}

📅 CALENDARIO PRÓXIMO:
${eventsSummary.join('\n') || 'Sin eventos'}

💰 TRANSACCIONES RECIENTES:
${transactionsSummary.join('\n') || 'Sin transacciones'}

🚨 REGLAS UNIVERSALES DE COMANDOS ESTRUCTURADOS (Úsalos al final de tu respuesta según la intención):
1. Puntos de Inventario:
   - Añadir: [[REGISTRAR_PUNTOS: [ {"name": "Aguacate Hass 3", "category": "arbol|riego|edificio|planta|hito", "variety_type": "Hass", "status": "saludable|clorosis|enfermo", "latitude": 36.72..., "longitude": -4.89..., "timestamp_audio_s": 2.5} ] ]]
   - Modificar: [[EDITAR_PUNTO: {"target_id": "UUID_O_ID", "status": "clorosis", "notes": "Falta de hierro"}]]
   - Borrar: [[BORRAR_PUNTO: {"target_id": "UUID", "query": "nombre"}]]
2. Caminos y Trazados de Riego:
   - Crear: [[REGISTRAR_CAMINO: {"name": "Línea Riego Sector 1", "path_type": "linea_riego|camino|sendero", "color": "#00979d", "coordinates": [[36.7259, -4.8946], [36.7262, -4.8948]] }]]
   - Modificar Línea/Ruta: [[EDITAR_CAMINO: {"target_id": "UUID", "name": "Nuevo Nombre", "color": "#f97316", "coordinates": [[36.72..., -4.89...]] }]]
   - Borrar: [[BORRAR_CAMINO: {"target_id": "UUID", "query": "nombre"}]]
3. Calendario:
   - [[CREAR_EVENTO: {"date": "YYYY-MM-DD", "start_time": "09:00", "end_time": "11:30", "category": "RIEGO - La Nana", "responsibles": ["Nombre"], "info": "Notas"}]]
   - [[BORRAR_EVENTO: {"event_id": "ID", "query": "Riego sábado"}]]
4. Finanzas:
   - [[CREAR_TRANSACCION: {"type": "Gasto|Retiro|Venta", "amount": 45.0, "description": "Detalle"}]]
5. Memoria / Aprendizaje:
   - [[MEMORIA: {"category": "cultivo|riego|parcela|maquinaria|suelo|general", "title": "Título", "content": "Contenido a recordar"}]]
6. Creador Dinámico de Nuevas Herramientas (Meta-Tool):
   - Si el usuario te pide crear/inventar una nueva herramienta para el equipo:
     [[REGISTRAR_HERRAMIENTA: {"name": "calculo_abono_ce", "display_name": "Calculadora de Abono por CE", "description": "Calcula abono según conductividad", "category": "agronomia", "parameters": [{"name": "ce_actual", "type": "number"}], "execution_recipe": "Fórmula matemática...", "output_format": "markdown|table|card"}]]
7. Salidas Visuales Especiales:
   - Diagramas Mermaid: Inserta bloques \`\`\`mermaid ... \`\`\`
   - Dibujos Técnicos y Croquis Acotados: Inserta bloques \`\`\`svg ... \`\`\` con medidas acotadas en metros (|← 4.0m →|), escalas y leyendas claras.
   - Exportables: [[EXPORTAR_ARCHIVO: {"type": "pdf|excel|txt|xml|kml", "filename": "archivo.ext", "title": "Título", "content": "..."}]]

ADAPTACIÓN DEL FORMATO SEGÚN LA SECCIÓN ACTIVA:
- Si sección === "mapas": Mantén la explicación corta en 1 o 2 frases concisas para el banner flotante + incluye los comandos estructurados de mapa.
- Si sección === "chat": Explica con detalle, genera tablas Markdown, diagramas Mermaid o planos SVG si aplica.
- Si sección === "calendario" o "finanzas": Resumen directo y profesional adaptado a la tarjeta de resultado.
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PARSER UNIVERSAL DE COMANDOS ESTRUCTURADOS
// ─────────────────────────────────────────────────────────────────────────────
function extractPayloads(rawText, tagNames) {
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
      const slice = rawText.slice(startIdx, endIdx + 1);
      try {
        const cleaned = slice.replace(/,\s*([\]}])/g, '$1').trim();
        results.push(JSON.parse(cleaned));
      } catch {
        // Fallback
      }
    }
  }
  return results;
}

export function parseAllStructuredCommands(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      points: [],
      pointDeletions: [],
      pointUpdates: [],
      paths: [],
      pathDeletions: [],
      pathUpdates: [],
      events: [],
      eventDeletions: [],
      transactions: [],
      memories: [],
      customTools: [],
      exportFiles: [],
      categories: [],
      categoryDeletions: [],
      subcategories: [],
      subcategoryDeletions: [],
    };
  }

  const points = [];
  for (const payload of extractPayloads(rawText, ['REGISTRAR_PUNTOS', 'REGISTRAR_PUNTO'])) {
    if (Array.isArray(payload)) points.push(...payload);
    else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.points || payload.puntos)) points.push(...(payload.points || payload.puntos));
      else points.push(payload);
    }
  }

  const pointDeletions = extractPayloads(rawText, ['BORRAR_PUNTO', 'ELIMINAR_PUNTO']);
  const pointUpdates = extractPayloads(rawText, ['EDITAR_PUNTO', 'ACTUALIZAR_PUNTO']);

  const paths = extractPayloads(rawText, ['REGISTRAR_CAMINO', 'CREAR_CAMINO']);
  const pathUpdates = extractPayloads(rawText, ['EDITAR_CAMINO', 'ACTUALIZAR_CAMINO', 'MODIFICAR_CAMINO']);
  const pathDeletions = extractPayloads(rawText, ['BORRAR_CAMINO', 'ELIMINAR_CAMINO']);

  const events = extractPayloads(rawText, ['CREAR_EVENTO']);
  const eventDeletions = extractPayloads(rawText, ['BORRAR_EVENTO', 'ELIMINAR_EVENTO']);

  const transactions = extractPayloads(rawText, ['CREAR_TRANSACCION']);
  const memories = extractPayloads(rawText, ['MEMORIA', 'APRENDER']);
  const customTools = extractPayloads(rawText, ['REGISTRAR_HERRAMIENTA', 'CREAR_HERRAMIENTA']);
  const exportFiles = extractPayloads(rawText, ['EXPORTAR_ARCHIVO']);

  const categories = extractPayloads(rawText, ['CREAR_CATEGORIA', 'REGISTRAR_CATEGORIA']);
  const categoryDeletions = extractPayloads(rawText, ['BORRAR_CATEGORIA', 'ELIMINAR_CATEGORIA']);
  const subcategories = extractPayloads(rawText, ['CREAR_SUBCATEGORIA', 'REGISTRAR_SUBCATEGORIA']);
  const subcategoryDeletions = extractPayloads(rawText, ['BORRAR_SUBCATEGORIA', 'ELIMINAR_SUBCATEGORIA']);

  return {
    points,
    pointDeletions,
    pointUpdates,
    paths,
    pathDeletions,
    pathUpdates,
    events,
    eventDeletions,
    transactions,
    memories,
    customTools,
    exportFiles,
    categories,
    categoryDeletions,
    subcategories,
    subcategoryDeletions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EJECUTOR TRANSACCIONAL DE ACCIONES UNIVERSALES
// ─────────────────────────────────────────────────────────────────────────────
export async function executeUnifiedActions({
  parsedCommands,
  audio = null,
  liveGps = null,
  mapCenter = DEFAULT_CENTER,
  selectedTarget = null,
  currentInventory = [],
  currentPaths = [],
  userMeta = null,
  onInventoryAdded,
  onInventoryDeleted,
  onInventoryUpdated,
  onPathAdded,
  onPathDeleted,
  onPathUpdated,
  onEventAdded,
  onEventDeleted,
  onTransactionAdded,
  onKnowledgeAdded,
  onToolAdded,
}) {
  const result = {
    addedPoints: [],
    updatedPoints: [],
    deletedPoints: [],
    addedPaths: [],
    updatedPaths: [],
    deletedPaths: [],
    addedEvents: [],
    deletedEvents: [],
    addedTransactions: [],
    addedMemories: [],
    addedTools: [],
    reverts: [],
  };

  const center = mapCenter || DEFAULT_CENTER;

  // 1. PUNTOS: BORRAR
  for (const del of parsedCommands.pointDeletions || []) {
    const rawId = del.target_id || del.id || (del.target === 'ultimo' ? currentInventory[0]?.id : null);
    let targetId = rawId;
    if (!targetId && del.query) {
      const q = String(del.query).toLowerCase().trim();
      const match = currentInventory.find((i) => (i.name && i.name.toLowerCase().includes(q)) || (i.variety_type && i.variety_type.toLowerCase().includes(q)));
      if (match) targetId = match.id;
    }
    if (!targetId && selectedTarget?.type === 'point') targetId = selectedTarget.id;

    if (targetId) {
      const item = currentInventory.find((i) => String(i.id) === String(targetId));
      await deleteFarmInventoryItem(targetId);
      result.deletedPoints.push(targetId);
      if (item) result.reverts.push({ type: 'RESTORE_POINT', itemData: item });
      onInventoryDeleted?.([targetId]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetId, deleted: true } }));
      }
    }
  }

  // 2. PUNTOS: EDITAR
  for (const upd of parsedCommands.pointUpdates || []) {
    const targetId = upd.target_id || upd.id || selectedTarget?.id;
    if (targetId) {
      const item = currentInventory.find((i) => String(i.id) === String(targetId)) || selectedTarget?.raw;
      const payload = { ...upd };
      delete payload.target_id;
      delete payload.id;
      await updateFarmInventoryItem(targetId, payload);
      result.updatedPoints.push({ id: targetId, ...payload });
      if (item) {
        const prevData = {};
        Object.keys(payload).forEach((k) => (prevData[k] = item[k]));
        result.reverts.push({ type: 'UPDATE_POINT', target_id: targetId, prevData });
      }
      onInventoryUpdated?.([{ id: targetId, ...payload }]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetId, ...payload } }));
      }
    }
  }

  // 3. PUNTOS: AÑADIR
  for (const p of parsedCommands.points || []) {
    let lat = p.latitude != null ? Number(p.latitude) : undefined;
    let lng = p.longitude != null ? Number(p.longitude) : undefined;

    if (audio?.gpsTrack && audio.gpsTrack.length > 0 && p.timestamp_audio_s != null) {
      const t0 = audio.t0 || Date.now() - (audio.duration || 1) * 1000;
      const interp = interpolateGpsAtAudioTime({
        t0,
        gpsTrack: audio.gpsTrack,
        timestampAudioSec: Number(p.timestamp_audio_s) || 0,
      });
      if (interp?.lat && interp?.lng) {
        lat = interp.lat;
        lng = interp.lng;
      }
    }
    if ((isNaN(lat) || !lat) && liveGps) {
      lat = liveGps.lat;
      lng = liveGps.lng;
    }
    if (isNaN(lat) || !lat) {
      lat = center[0];
      lng = center[1];
    }

    const newItem = {
      name: p.name || 'Punto de Inventario',
      category: p.category || 'arbol',
      variety_type: p.variety_type || p.variedad || null,
      status: p.status || p.estado || 'saludable',
      latitude: lat,
      longitude: lng,
      notes: p.notes || p.observaciones || '',
      image_url: p.image_url || p.photo_url || null,
      user_id: userMeta?.userId || null,
      user_name: userMeta?.userName || null,
      is_active: true,
    };

    const saved = await insertFarmInventoryItem(newItem);
    result.addedPoints.push(saved);
    result.reverts.push({ type: 'DELETE_POINT', target_id: saved.id });
    onInventoryAdded?.([saved]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: saved }));
    }
  }

  // 4. CAMINOS: BORRAR
  for (const del of parsedCommands.pathDeletions || []) {
    if (del.target === 'all' || del.target === 'todos' || del.all) {
      for (const path of [...currentPaths]) {
        await deleteFarmPath(path.id);
        result.deletedPaths.push(path.id);
        result.reverts.push({ type: 'RESTORE_PATH', pathData: path });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: path.id, deleted: true } }));
        }
      }
      continue;
    }
    const rawId = del.target_id || del.id || selectedTarget?.id;
    let targetId = rawId;
    if (!targetId && (del.query || del.name)) {
      const q = String(del.query || del.name).toLowerCase().trim();
      const match = currentPaths.find((p) => p.name && p.name.toLowerCase().includes(q));
      if (match) targetId = match.id;
    }
    if (targetId) {
      const path = currentPaths.find((p) => String(p.id) === String(targetId)) || selectedTarget?.raw;
      await deleteFarmPath(targetId);
      result.deletedPaths.push(targetId);
      if (path) result.reverts.push({ type: 'RESTORE_PATH', pathData: path });
      onPathDeleted?.([targetId]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetId, deleted: true } }));
      }
    }
  }

  // 5. CAMINOS: EDITAR (Actualizar nombre, color o coordenadas)
  for (const upd of parsedCommands.pathUpdates || []) {
    const targetId = upd.target_id || upd.id || selectedTarget?.id;
    if (targetId) {
      const path = currentPaths.find((p) => String(p.id) === String(targetId)) || selectedTarget?.raw;
      const payload = { ...upd };
      delete payload.target_id;
      delete payload.id;
      if (Array.isArray(payload.coordinates)) {
        payload.coordinates = payload.coordinates
          .map((c) => {
            if (!c) return null;
            if (Array.isArray(c) && c.length >= 2) {
              const lat = Number(c[0]);
              const lng = Number(c[1]);
              return !Number.isNaN(lat) && !Number.isNaN(lng) ? { lat, lng } : null;
            }
            if (typeof c === 'object') {
              const lat = Number(c.lat ?? c.latitude);
              const lng = Number(c.lng ?? c.longitude);
              return !Number.isNaN(lat) && !Number.isNaN(lng) ? { lat, lng } : null;
            }
            return null;
          })
          .filter(Boolean);
        payload.length_meters = calculateTrackLengthMeters(payload.coordinates);
      }
      await updateFarmPath(targetId, payload);
      result.updatedPaths.push({ id: targetId, ...payload });
      if (path) {
        const prevData = {};
        Object.keys(payload).forEach((k) => (prevData[k] = path[k]));
        result.reverts.push({ type: 'UPDATE_PATH', target_id: targetId, prevData });
      }
      onPathUpdated?.([{ id: targetId, ...payload }]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetId, ...payload } }));
      }
    }
  }

  // 6. CAMINOS: CREAR
  for (const p of parsedCommands.paths || []) {
    const rawCoords = Array.isArray(p.coordinates) ? p.coordinates : [];
    const normalizedCoords = rawCoords
      .map((c) => {
        if (!c) return null;
        if (Array.isArray(c) && c.length >= 2) {
          const lat = Number(c[0]);
          const lng = Number(c[1]);
          return !Number.isNaN(lat) && !Number.isNaN(lng) ? { lat, lng } : null;
        }
        if (typeof c === 'object') {
          const lat = Number(c.lat ?? c.latitude);
          const lng = Number(c.lng ?? c.longitude);
          return !Number.isNaN(lat) && !Number.isNaN(lng) ? { lat, lng } : null;
        }
        return null;
      })
      .filter(Boolean);
    const lengthM = p.length_meters || calculateTrackLengthMeters(normalizedCoords);

    const newPath = {
      name: p.name || 'Nuevo Camino',
      path_type: p.path_type || 'camino',
      coordinates: normalizedCoords,
      color: p.color || '#f97316',
      stroke_width: p.stroke_width || 4,
      stroke_style: p.stroke_style || 'solid',
      length_meters: lengthM,
      notes: p.notes || '',
      user_id: userMeta?.userId || null,
      user_name: userMeta?.userName || null,
      is_active: true,
    };

    const saved = await insertFarmPath(newPath);
    result.addedPaths.push(saved);
    result.reverts.push({ type: 'DELETE_PATH', target_id: saved.id });
    onPathAdded?.([saved]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: saved }));
    }
  }

  // 7. CALENDARIO: CREAR Y BORRAR
  for (const ev of parsedCommands.events || []) {
    try {
      const saved = await createCalendarEvent({
        date: ev.date || new Date().toISOString().split('T')[0],
        startTime: ev.start_time || '09:00',
        endTime: ev.end_time || '11:00',
        category: ev.category || 'MANTENIMIENTO',
        responsibles: Array.isArray(ev.responsibles) ? ev.responsibles : [ev.responsible || 'Equipo'],
        info: ev.info || ev.notes || '',
      });
      if (saved) {
        result.addedEvents.push(saved);
        onEventAdded?.(saved);
      }
    } catch (e) {
      console.warn('[unifiedAiBrain] Error creando evento:', e.message);
    }
  }

  for (const del of parsedCommands.eventDeletions || []) {
    try {
      const eventId = del.event_id || del.id;
      if (eventId) {
        await deleteCalendarEvent(eventId);
        result.deletedEvents.push(eventId);
        onEventDeleted?.(eventId);
      }
    } catch (e) {
      console.warn('[unifiedAiBrain] Error borrando evento:', e.message);
    }
  }

  // 8. FINANZAS: CREAR TRANSACCIÓN
  for (const tx of parsedCommands.transactions || []) {
    try {
      const amt = Math.abs(parseFloat(tx.amount || 0));
      if (amt > 0) {
        const isRetiro = ['retiro', 'venta', 'ingreso'].includes((tx.type || '').toLowerCase());
        const { data: newTx, error: txErr } = await supabase
          .from('transactions')
          .insert([
            {
              date: new Date().toISOString(),
              user_id: userMeta?.userId || null,
              type: isRetiro ? 'Retiro' : 'Gasto',
              amount: isRetiro ? -amt : amt,
              description: tx.description || 'Registrado por IA',
              status: 'ACTIVE',
            },
          ])
          .select('*, profiles(name)')
          .single();
        if (!txErr && newTx) {
          result.addedTransactions.push(newTx);
          onTransactionAdded?.(newTx);
        }
      }
    } catch (e) {
      console.warn('[unifiedAiBrain] Error creando transacción:', e.message);
    }
  }

  // 9. MEMORIA: REGISTRAR EN farm_knowledge
  for (const mem of parsedCommands.memories || []) {
    try {
      const newMem = {
        category: mem.category || 'general',
        title: mem.title || 'Dato aprendido',
        content: mem.content || JSON.stringify(mem),
        source: 'chat',
        user_id: userMeta?.userId || null,
        user_name: userMeta?.userName || null,
        is_active: true,
      };
      const { data: savedMem, error: memErr } = await supabase
        .from('farm_knowledge')
        .insert([newMem])
        .select()
        .single();
      if (!memErr && savedMem) {
        result.addedMemories.push(savedMem);
        onKnowledgeAdded?.(savedMem);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('farm-knowledge-updated', { detail: savedMem }));
        }
      }
    } catch (e) {
      console.warn('[unifiedAiBrain] Error guardando conocimiento:', e.message);
    }
  }

  // 10. META-TOOL: REGISTRAR NUEVA HERRAMIENTA EN farm_custom_tools
  for (const tool of parsedCommands.customTools || []) {
    try {
      const savedTool = await saveNewCustomTool(tool, userMeta);
      result.addedTools.push(savedTool);
      onToolAdded?.(savedTool);
    } catch (e) {
      console.warn('[unifiedAiBrain] Error guardando herramienta personalizada:', e.message);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. INVOCACIÓN CENTRAL A GEMINI (CASCADA RESILIENTE MULTIMODAL)
// ─────────────────────────────────────────────────────────────────────────────
export async function callUnifiedAiBrain({
  prompt = '',
  section = 'chat',
  audio = null,
  attachments = [],
  attachment = null,
  history = [],
  selectedTarget = null,
  visibleInventory = [],
  visiblePaths = [],
  events = [],
  transactions = [],
  users = [],
  knowledge = [],
  documents = [],
  customTools = [],
  mapCenter = DEFAULT_CENTER,
  currentGps = null,
  userMeta = null,
  apiKey = null,
  responseMimeType = null,
  timeoutMs = 40000,
}) {
  const activeKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!activeKey) {
    throw new Error('API Key de Gemini no configurada.');
  }

  const attList = normalizeAttachments(attachments, attachment);

  // Subir adjuntos automáticamente al almacén central farm_documents si tienen File
  for (const att of attList) {
    if (att?.file && !att._alreadyPersisted) {
      registerUnifiedDocument({
        file: att.file,
        dataUrl: att.dataUrl,
        name: att.name,
        fileType: att.type,
        fileSize: att.size,
        sectionOrigin: section,
        category: att.isImage ? 'foto_terreno' : att.isPdf ? 'documento' : 'general',
        inventoryId: selectedTarget?.type === 'point' ? selectedTarget.id : null,
        pathId: selectedTarget?.type === 'path' ? selectedTarget.id : null,
        userMeta,
      }).catch((e) => console.warn('[unifiedAiBrain] Auto-registro de doc en background:', e));
      att._alreadyPersisted = true;
    }
  }

  const systemInstruction = buildUnifiedSystemPrompt({
    section,
    selectedTarget,
    visibleInventory,
    visiblePaths,
    events,
    transactions,
    users,
    knowledge,
    documents,
    customTools,
    mapCenter,
    currentGps,
    audio,
  });

  const userParts = [];

  // Agregar adjuntos (imágenes, documentos, fotos)
  appendAttachmentsToGeminiParts(userParts, attList);

  // Agregar audio si existe
  if (audio?.dataUrl) {
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
El usuario se desplazaba por la finca mientras hablaba. Asigna "timestamp_audio_s" con el segundo del audio para posicionar cualquier punto o traza con precisión satelital.`,
      });
    }
  }

  if (prompt) {
    userParts.push({ text: prompt });
  } else if (audio) {
    userParts.push({ text: 'Interpreta la orden de este audio de campo y ejecuta las acciones correspondientes.' });
  }

  const contents = [];
  if (Array.isArray(history) && history.length > 0) {
    contents.push(...history);
  }
  contents.push({ role: 'user', parts: userParts });

  const payload = {
    contents,
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.15,
      ...(responseMimeType ? { response_mime_type: responseMimeType } : {}),
    },
  };

  let lastError = null;
  for (const modelId of GEMINI_CASCADE_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${activeKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}`);
      }

      const resJson = await res.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Respuesta vacía del modelo Gemini');

      const parsedCommands = parseAllStructuredCommands(rawText);

      return {
        rawText,
        modelUsed: modelId,
        parsedCommands,
      };
    } catch (err) {
      console.warn(`[unifiedAiBrain] Falló modelo ${modelId}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo procesar la solicitud con ninguno de los modelos disponibles.');
}

