// src/components/FarmSatelliteMap.jsx
// Mapa satélite interactivo para Campito Jorox con soporte para:
// - Puntos de inventario (árboles, plantas, arquetas) representados ÚNICAMENTE mediante puntos de colores (sin iconos).
// - Caminos, senderos y líneas de riego representados mediante líneas de colores (trazados polilíneas).
// - Herramienta para trazar/dibujar nuevos caminos haciendo clic sobre el mapa satélite y guardarlos en Supabase.
// - Edición de caminos existentes (renombrar, cambiar color, eliminar).
// - Módulo inferior de acceso a Chat IA integrado para órdenes directas al mapa por voz y texto con botón de deshacer.

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Compass,
  Layers,
  Trash2,
  Edit2,
  Plus,
  Check,
  X,
  Undo2,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Printer,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Info,
  Bot,
  Mic,
  Camera,
  Send,
  StopCircle,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Loader2
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker } from '../hooks/useVoiceGeoTracker';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  exportInventoryToGeoJSON,
  generateCustomPDF,
} from '../utils/exportTools';
import catastroJorox from '../data/catastroJorox.json';
import { useNavigate } from 'react-router-dom';

// Coordenadas por defecto: Centroide exacto de las parcelas 195 y 196 de Campito Jorox
const DEFAULT_CENTER = [36.72595, -4.89462];
const DEFAULT_ZOOM = 18;

// Paleta de colores para trazados y puntos
const COLOR_PALETTE = [
  { name: 'Naranja Finca', hex: '#f97316' },
  { name: 'Amarillo Sendero', hex: '#eab308' },
  { name: 'Verde Cultivo', hex: '#10b981' },
  { name: 'Azul Riego', hex: '#0284c7' },
  { name: 'Cian Acequia', hex: '#06b6d4' },
  { name: 'Rojo Linde / Alerta', hex: '#ef4444' },
  { name: 'Púrpura Especial', hex: '#8b5cf6' },
  { name: 'Gris Pizarra', hex: '#64748b' },
];

// ─── Sistema de categorías para filtros ──────────────────────────────────────
// Mapa: categoría padre → array de subcategorías (keywords)
const CATEGORY_MAP = {
  'Árboles': ['aguacate', 'olivo', 'limonero', 'naranjo', 'citrico', 'arbol', 'frutales', 'algarrobo', 'granado'],
  'Plantas': ['planta', 'hierba', 'arbusto', 'herbaceo', 'vegetal', 'palmera', 'bambu'],
  'Edificios': ['casa', 'caravana', 'taller', 'almacen', 'edificio', 'nave', 'cobertizo', 'caseta'],
  'Herramientas': ['herramienta', 'maquina', 'tractor', 'moto', 'equipo', 'mobiliario'],
  'Riego / Agua': ['riego', 'llave', 'gotero', 'filtro', 'valvula', 'contador', 'arqueta', 'pozo', 'deposito', 'cisterna', 'grifo', 'tuberia', 'manguera', 'aspersor', 'bomba', 'caudal'],
  'Hitos': ['mojon', 'linde', 'piedra', 'marca', 'señal', 'cota', 'limite'],
  'Otros': [],
};

// Color por categoría padre para los markers
const CATEGORY_COLORS = {
  'Árboles': '#16a34a',       // Verde oscuro
  'Plantas': '#4ade80',       // Verde claro
  'Edificios': '#eab308',     // Amarillo
  'Herramientas': '#f97316',  // Naranja
  'Riego / Agua': '#0284c7',  // Azul
  'Hitos': '#64748b',         // Pizarra
  'Otros': '#94a3b8',         // Gris
};

// Color de línea por tipo de camino
const PATH_TYPE_COLORS = {
  'camino': '#92400e',        // Marrón
  'sendero': '#b45309',       // Marrón claro
  'linea_riego': '#38bdf8',   // Azul claro
  'acequia': '#1d4ed8',       // Azul marino
  'linde': '#ef4444',         // Rojo
  'otro': '#64748b',          // Pizarra
};

/**
 * Determina la categoría padre de un item del inventario
 */
function getItemCategory(item) {
  const cat = (item.category || item.tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [parent, keywords] of Object.entries(CATEGORY_MAP)) {
    if (parent === 'Otros') continue;
    if (keywords.some(k => cat.includes(k))) return parent;
  }
  return 'Otros';
}

/**
 * Genera lista de subcategorías únicas dentro de una categoría padre,
 * extrayendo del campo category/tipo de los items reales.
 */
function getSubcategoriesForParent(inventory, parent) {
  const keywords = CATEGORY_MAP[parent] || [];
  const subs = new Set();
  inventory.forEach(item => {
    const cat = (item.category || item.tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const subLabel = item.variety_type || item.category || item.tipo || parent;
    if (parent === 'Otros') {
      const isOther = !Object.entries(CATEGORY_MAP).some(([p, kws]) =>
        p !== 'Otros' && kws.some(k => cat.includes(k))
      );
      if (isOther) {
        subs.add(subLabel);
      }
    } else if (keywords.some(k => cat.includes(k))) {
      subs.add(subLabel);
    }
  });
  return [...subs];
}

// Tipos de camino para filtros
const PATH_TYPES = ['camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'otro'];
const PATH_TYPE_LABELS = {
  'camino': 'Caminos',
  'sendero': 'Senderos',
  'linea_riego': 'Líneas de Riego',
  'acequia': 'Acequias',
  'linde': 'Lindes',
  'otro': 'Otros trazados',
};

// ─── Clave y cargador de caché para capas y filtros visibles ────────────────
const MAP_SETTINGS_STORAGE_KEY = 'campito_map_settings';

function loadMapSettingsFromCache() {
  try {
    const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[FarmSatelliteMap] Error leyendo configuración de capas/filtros del caché:', err);
    return null;
  }
}

// Cálculo de distancia métrica (Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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

function calculatePathMeters(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += haversineDistance(
      coordinates[i].lat,
      coordinates[i].lng,
      coordinates[i + 1].lat,
      coordinates[i + 1].lng
    );
  }
  return total;
}

// Determinación del color del punto (sin iconos) — usa sistema de categorías unificado
function getPointColor(item) {
  const status = (item.status || item.estado || '').toLowerCase();
  if (status === 'enfermo' || status === 'seco' || status === 'muerto') return '#ef4444'; // Rojo
  if (status === 'clorosis') return '#eab308'; // Amarillo clorosis
  if (status === 'poda_requerida') return '#f97316'; // Naranja poda

  const parent = getItemCategory(item);
  return CATEGORY_COLORS[parent] || '#94a3b8';
}

/**
 * Motor IA directo de Campito Jorox para ejecutar órdenes sobre el mapa satelital
 * mediante modelos Google Gemini con fallback automático de cuotas y soporte multimodal
 * (audio de voz, fotografías con cámara, documentos adjuntos y selección precisa de pines/lindes).
 */
async function callGeminiForMapAction({
  prompt,
  audio,
  attachment,
  selectedTarget,
  visibleInventory = [],
  visiblePaths = [],
  mapCenter,
  currentGps,
  apiKey,
}) {
  const inventoryContext = visibleInventory.slice(0, 80).map((i) => ({
    id: i.id,
    name: i.name || i.tipo,
    category: getItemCategory(i),
    variety: i.variety_type,
    status: i.status || i.estado || 'saludable',
    lat: i.latitude || i.coordenadas?.lat,
    lng: i.longitude || i.coordenadas?.lng,
    notes: i.notes || '',
    photo_url: i.photo_url || i.foto_url || null,
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
🎯 ELEMENTO ACTUALMENTE SELECCIONADO / PINCHADO EN EL MAPA:
- Tipo: ${selectedTarget.type} (punto de inventario, trazado o coordenada de linde)
- ID: ${selectedTarget.id || 'N/A'}
- Nombre/Título: ${selectedTarget.title || 'N/A'}
- Categoría/Variedad: ${selectedTarget.category || selectedTarget.variety || selectedTarget.path_type || 'N/A'}
- Estado fitosanitario actual: ${selectedTarget.status || 'N/A'}
- Notas actuales: ${selectedTarget.notes || 'Ninguna'}
- Coordenadas exactas: Lat ${selectedTarget.lat || centerLat}, Lng ${selectedTarget.lng || centerLng}
${selectedTarget.photo_url ? `- Foto previa: ${selectedTarget.photo_url}` : ''}

REGLAS CRÍTICAS DE ELEMENTO SELECCIONADO:
1. El usuario tiene SELECCIONADO este pin o coordenada. Cualquier orden de voz, texto o foto enviada está DIRIGIDA A ESTE ELEMENTO.
2. Si el usuario pide cambios como:
   - "cámbialo a clorosis / seco / enfermo / poda requerida / saludable" -> UPDATE_POINT con {"status": "clorosis"|"enfermo"|"poda_requerida"|"saludable"}
   - "ponle nota de ...", "añade que ...", "apunta observación ..." -> UPDATE_POINT o UPDATE_PATH agregando la nota técnica
   - "renómbralo como ...", "cambia su nombre a ..." -> UPDATE_POINT o UPDATE_PATH con {"name": "..."}
   - "cambia su color a ..." -> UPDATE_PATH o UPDATE_POINT con {"color": "#hex"}
   - "elimínalo / bórralo" -> DELETE_POINT o DELETE_PATH con su target_id '${selectedTarget.id}'
3. Si el elemento seleccionado es de tipo 'coord' o 'catastro' (una coordenada del mapa o linde de parcela) y el usuario dice o describe cualquier elemento (ej: "mi casa", "casa", "llave", "arqueta", "aguacate", "gotero", "mojón", "depósito", "taller", "edificio"):
   - Genera acción "ADD_POINT" en esas coordenadas exactas (lat: ${selectedTarget.lat}, lng: ${selectedTarget.lng}).
   - Asigna como "name" el nombre indicado (ej: "Mi Casa", "Casa", "Arqueta de Riego").
   - Asigna "category": 'edificio' (para casa, almacén, caravana, nave, caseta), 'arbol', 'planta', 'riego', 'herramienta' o 'hito'.
4. Si el usuario adjunta una foto, asocia los hallazgos en las notas de este elemento.` : '';

  const systemInstruction = `Eres el motor de control IA del mapa satelital de Campito Jorox (Parcelas 195 y 196).
Tu misión es interpretar órdenes de voz, fotos adjuntas y texto del agricultor y ejecutar acciones directas sobre los puntos de inventario y trazados del mapa.
${targetInfoStr}

Coordenadas de referencia actuales:
- GPS Usuario: ${currentGps ? `${currentGps.lat.toFixed(6)}, ${currentGps.lng.toFixed(6)} (precisión: ±${currentGps.accuracy}m)` : 'No disponible'}
- Centro del mapa / Coordenada activa: ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}

Elementos actualmente visibles en el mapa:
PUNTOS DE INVENTARIO (${inventoryContext.length}):
${JSON.stringify(inventoryContext)}

TRAZADOS Y CAMINOS (${pathsContext.length}):
${JSON.stringify(pathsContext)}

INSTRUCCIONES SUPREMAS:
- Devuelve ÚNICAMENTE un JSON válido sin texto Markdown adicional, sin comillas triples \`\`\`json, sin saludos ni explicaciones.
- Estructura JSON requerida:
{
  "description": "Resumen conciso en español de la acción ejecutada (ej: 'Registrada Mi Casa en las coordenadas indicadas' o 'Actualizado estado...')",
  "transcription": "Texto transcrito del mensaje de voz del agricultor si hubo grabación de audio",
  "actions": [
    {
      "type": "ADD_POINT" | "CREATE_POINT" | "DELETE_POINT" | "DELETE_PATH" | "UPDATE_POINT" | "UPDATE_PATH",
      "target_id": "uuid del elemento afectado si es delete o update",
      "data": { ... }
    }
  ]
}

Reglas generales:
1. "borrar / eliminar / quitar": Encuentra los elementos coincidentes o usa el elemento seleccionado y genera DELETE_POINT o DELETE_PATH.
2. "editar / cambiar estado / cambiar nota": Actualiza el pin con UPDATE_POINT (status, variety_type, notes, name).
3. "cambiar color": Genera UPDATE_PATH o UPDATE_POINT con {"color": "#hex"}.
4. "añadir / colocar / poner / registrar / guardar / nuevo / o mención de un elemento (ej: 'mi casa', 'casa', 'arqueta', 'limonero', 'depósito')": Genera "ADD_POINT" con:
   {
     "name": "Nombre claro del elemento (ej: 'Mi Casa', 'Arqueta Principal', 'Aguacate Hass')",
     "category": "edificio"|"arbol"|"planta"|"riego"|"herramienta"|"hito",
     "variety_type": "variedad o subtipo si aplica",
     "status": "saludable",
     "latitude": ${centerLat},
     "longitude": ${centerLng},
     "notes": "observaciones del agricultor o transcripción"
   }
   * Si el usuario dice "mi casa" o "casa", category DEBE ser "edificio".
   * Si dice "aguacate", "limonero", "olivo", category DEBE ser "arbol".
   * Si dice "arqueta", "llave", "gotero", "pozo", category DEBE ser "riego".
5. Si no hay elementos coincidentes ni órdenes claras, devuelve:
   {"description": "No se encontraron elementos coincidentes con la orden", "transcription": "", "actions": []}
`;

  const userParts = [];
  if (prompt) {
    userParts.push({ text: prompt });
  }

  // Soporte multimodal para fotos y documentos
  if (attachment) {
    if (attachment.textContent) {
      userParts.push({
        text: `\n\n📄 **CONTENIDO DEL ARCHIVO ADJUNTO ("${attachment.name || 'documento'}")**:\n\`\`\`\n${attachment.textContent}\n\`\`\`\n`,
      });
    }

    if (attachment.dataUrl) {
      const match = attachment.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
      if (match) {
        const cleanMime = match[1].toLowerCase().split(';')[0].trim();
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({
            inlineData: {
              mimeType: cleanMime,
              data: match[2],
            },
          });
        }
      }
    }
  }

  // Soporte multimodal de audio de voz con telemetría GPS
  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (match) {
      userParts.push({
        inlineData: {
          mimeType: match[1].split(';')[0].trim(),
          data: match[2],
        },
      });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({
        inlineData: {
          mimeType: cleanMime,
          data: cleanBase64,
        },
      });
    }
  }

  // Si se envió un audio sin texto de prompt, añadir instrucción explícita a Gemini
  if (!prompt && audio) {
    userParts.push({
      text: selectedTarget
        ? `Por favor escucha atentamente este mensaje de voz del agricultor para el elemento seleccionado "${selectedTarget.title}" (${selectedTarget.type} en lat ${selectedTarget.lat}, lng ${selectedTarget.lng}). Transcribe lo que dice en "transcription", interpreta la orden (añadir pin, renombrar, cambiar estado, notas o borrar) y genera el JSON con la acción correspondiente (ej: ADD_POINT si pide registrar un elemento como 'mi casa', 'arqueta', etc.).`
        : `Por favor escucha atentamente este mensaje de voz del agricultor para el mapa de Campito Jorox. Transcribe lo que dice en "transcription", interpreta la orden y devuelve el JSON con la acción requerida (ej: "ADD_POINT" en lat ${centerLat}, lng ${centerLng} si nombra un elemento como 'mi casa', 'árbol', 'arqueta', etc.).`,
    });
  } else if (userParts.length === 0) {
    userParts.push({ text: selectedTarget ? `Analizar y actualizar elemento seleccionado: ${selectedTarget.title}` : 'Interpretar orden del mapa' });
  }

  const payload = {
    contents: [{ role: 'user', parts: userParts }],
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  const MAP_GEMINI_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.1-flash-lite',
  ];

  let lastError = null;
  for (const modelId of MAP_GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ((audio || attachment) ? 35000 : 20000));
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

      let parsed;
      try {
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw parseErr;
        }
      }
      return parsed;
    } catch (err) {
      console.warn(`[MapAI] Falló ${modelId}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo procesar la orden con ningún modelo disponible.');
}

export default function FarmSatelliteMap({
  inventory = [],
  paths = [],
  onReloadInventory,
  onReloadPaths,
  lastRecordedGpsTrack = null,
  onPathCreated,
  isFullScreen = false,
  onToggleFullScreen,
  isPageMode = false,   // true cuando se usa como página completa (/mapas)
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const pathsLayerRef = useRef(null);
  const drawingLayerRef = useRef(null);
  const catastroLayerRef = useRef(null);
  const navigate = isPageMode ? useNavigate() : () => null;

  // ─── Inicialización de Capas y Filtros desde caché local (localStorage) ───
  const initialMapSettings = useMemo(() => loadMapSettingsFromCache(), []);

  // Estados de capas visibles
  const [showPoints, setShowPoints] = useState(() => {
    return initialMapSettings?.showPoints !== undefined ? Boolean(initialMapSettings.showPoints) : true;
  });
  const [showPaths, setShowPaths] = useState(() => {
    return initialMapSettings?.showPaths !== undefined ? Boolean(initialMapSettings.showPaths) : true;
  });
  const [showCatastro, setShowCatastro] = useState(() => {
    return initialMapSettings?.showCatastro !== undefined ? Boolean(initialMapSettings.showCatastro) : true;
  });
  const [satelliteType, setSatelliteType] = useState(() => {
    return initialMapSettings?.satelliteType || 'esri';
  });
  const [showLegend, setShowLegend] = useState(() => {
    return initialMapSettings?.showLegend !== undefined ? Boolean(initialMapSettings.showLegend) : true;
  });
  const [showNavControls, setShowNavControls] = useState(() => {
    return initialMapSettings?.showNavControls !== undefined ? Boolean(initialMapSettings.showNavControls) : true;
  });
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const userLocationLayerRef = useRef(null);

  // ─── Estados de búsqueda y filtros ───────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // visibleCategories: Set de categorías padre activas
  const [visibleCategories, setVisibleCategories] = useState(() => {
    if (initialMapSettings?.visibleCategories && Array.isArray(initialMapSettings.visibleCategories)) {
      return new Set(initialMapSettings.visibleCategories);
    }
    return new Set(Object.keys(CATEGORY_MAP));
  });
  // visibleSubcats: Set de subcategorías (valores reales de item.category) activas
  const [visibleSubcats, setVisibleSubcats] = useState(() => {
    if (initialMapSettings?.visibleSubcats && Array.isArray(initialMapSettings.visibleSubcats)) {
      return new Set(initialMapSettings.visibleSubcats);
    }
    return null; // null = todas activas
  });
  // expandedParents: qué categorías tienen el acordeón abierto en el panel
  const [expandedParents, setExpandedParents] = useState(new Set());
  // visiblePathTypes: Set de tipos de camino visibles
  const [visiblePathTypes, setVisiblePathTypes] = useState(() => {
    if (initialMapSettings?.visiblePathTypes && Array.isArray(initialMapSettings.visiblePathTypes)) {
      return new Set(initialMapSettings.visiblePathTypes);
    }
    return new Set(PATH_TYPES);
  });

  // ─── Guardar configuración de Capas y Filtros en caché local (localStorage) ──
  useEffect(() => {
    try {
      const payload = {
        showLegend,
        showNavControls,
        satelliteType,
        showCatastro,
        showPaths,
        showPoints,
        visibleCategories: Array.from(visibleCategories),
        visibleSubcats: visibleSubcats ? Array.from(visibleSubcats) : null,
        visiblePathTypes: Array.from(visiblePathTypes),
      };
      localStorage.setItem(MAP_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[FarmSatelliteMap] Error guardando configuración en caché:', err);
    }
  }, [
    showLegend,
    showNavControls,
    satelliteType,
    showCatastro,
    showPaths,
    showPoints,
    visibleCategories,
    visibleSubcats,
    visiblePathTypes,
  ]);

  // Estados de dibujo interactivo de caminos
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]); // [{ lat, lng }]
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPathData, setNewPathData] = useState({
    name: '',
    path_type: 'sendero',
    color: '#f97316',
    stroke_width: 4,
    notes: '',
  });

  // Estado para camino seleccionado (para ver/editar)
  const [selectedPath, setSelectedPath] = useState(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editPathData, setEditPathData] = useState({ name: '', color: '#f97316', stroke_width: 4, notes: '' });

  // Estado para punto seleccionado
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isEditingPoint, setIsEditingPoint] = useState(false);
  const [editPointData, setEditPointData] = useState({ name: '', variety_type: '', status: 'saludable', notes: '' });

  // ─── Elemento actualmente seleccionado (pin, camino, cota o coordenada) ────
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetEditData, setTargetEditData] = useState({
    name: '',
    variety: '',
    status: 'saludable',
    path_type: 'sendero',
    color: '#f97316',
    notes: '',
  });
  const highlightLayerRef = useRef(null);
  const lastLayerClickedTimeRef = useRef(0);

  // Inputs y estados para adjuntar fotos de cámara y documentos (+ / 📷)
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [pendingAttachment, setPendingAttachment] = useState(null);

  const isDrawingRef = useRef(isDrawing);
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  // Distancia calculada en vivo del camino en dibujo
  const liveDrawDistance = useMemo(() => calculatePathMeters(drawPoints), [drawPoints]);

  // ─── Inventario y paths filtrados (búsqueda + categorías) ───────────────────
  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inventory.filter(item => {
      // Filtro de búsqueda
      if (q) {
        const searchable = [item.name, item.category, item.tipo, item.variety_type, item.notes]
          .filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      // Filtro de categoría padre
      const parent = getItemCategory(item);
      if (!visibleCategories.has(parent)) return false;
      // Filtro de subcategoría (si hay selección específica)
      if (visibleSubcats !== null) {
        const rawSub = item.variety_type || item.category || item.tipo || '';
        if (!visibleSubcats.has(rawSub)) return false;
      }
      return true;
    });
  }, [inventory, searchQuery, visibleCategories, visibleSubcats]);

  const filteredPaths = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return paths.filter(path => {
      if (q) {
        const searchable = [path.name, path.path_type, path.notes].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      const pt = path.path_type || 'otro';
      return visiblePathTypes.has(pt);
    });
  }, [paths, searchQuery, visiblePathTypes]);

  // ─── 1. Inicialización de Leaflet y capas base ──────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Evitar reinicialización doble

    // Crear mapa Leaflet
    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    // Grupo de capas satelitales
    const esriLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        subdomains: ['server', 'services'],
      }
    );

    esriLayer.addTo(map);
    map._esriLayer = esriLayer;

    // Crear grupos de capas vectoriales
    catastroLayerRef.current = L.featureGroup().addTo(map);
    pathsLayerRef.current = L.featureGroup().addTo(map);
    markersLayerRef.current = L.featureGroup().addTo(map);
    drawingLayerRef.current = L.featureGroup().addTo(map);
    userLocationLayerRef.current = L.featureGroup().addTo(map);
    highlightLayerRef.current = L.featureGroup().addTo(map);

    // Click sobre el satélite: si no se está dibujando camino, seleccionar la coordenada o linde
    map.on('click', (e) => {
      setIsLayersMenuOpen(false);
      setIsFilterOpen(false);

      // Si el click provino de un pin, cota, camino o polígono, ignorar el evento en el mapa
      if (Date.now() - lastLayerClickedTimeRef.current < 350) {
        return;
      }

      if (!isDrawingRef.current) {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        setIsEditingTarget(false);
        setSelectedPoint(null);
        setSelectedPath(null);
        setSelectedTarget({
          type: 'coord',
          id: `coord-${lat}-${lng}`,
          title: 'Coordenada satelital / linde',
          subtitle: `Punto satelital en (${lat}, ${lng})`,
          lat,
          lng,
          notes: '',
        });
      }
    });

    mapInstanceRef.current = map;

    // Forzar redibujo tras renderizado inicial
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Manejo de cambio de tamaño de mapa
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 150);
    }
  }, [isFullScreen]);

  // ─── 1b. Anillo pulsante de realce sobre el elemento o coordenada seleccionado ─
  useEffect(() => {
    const layer = highlightLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedTarget) return;

    if (selectedTarget.lat && selectedTarget.lng) {
      // Círculo exterior pulsante cyan
      L.circleMarker([selectedTarget.lat, selectedTarget.lng], {
        radius: 14,
        color: '#00d1da',
        weight: 3,
        fillColor: '#00979d',
        fillOpacity: 0.25,
        dashArray: '3, 4',
      }).addTo(layer);

      // Círculo centro blanco
      L.circleMarker([selectedTarget.lat, selectedTarget.lng], {
        radius: 4,
        color: '#ffffff',
        weight: 2,
        fillColor: '#00d1da',
        fillOpacity: 1,
      }).addTo(layer);
    } else if (selectedTarget.type === 'path' && selectedTarget.raw?.coordinates) {
      const coords = selectedTarget.raw.coordinates.map((c) => [c.lat, c.lng]);
      L.polyline(coords, {
        color: '#00d1da',
        weight: (Number(selectedTarget.raw.stroke_width) || 4) + 6,
        opacity: 0.45,
        dashArray: '5, 5',
      }).addTo(layer);
    }
  }, [selectedTarget]);

  // ─── 2. Manejo de clicks durante el modo de dibujo de caminos ────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    function handleMapClick(e) {
      if (!isDrawing) return;
      const { lat, lng } = e.latlng;
      setDrawPoints((prev) => [...prev, { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) }]);
    }

    if (isDrawing) {
      map.on('click', handleMapClick);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
    }

    return () => {
      map.off('click', handleMapClick);
    };
  }, [isDrawing]);

  // ─── 3. Renderizado de la línea en dibujo ────────────────────────────────────
  useEffect(() => {
    const layer = drawingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (drawPoints.length === 0) return;

    // Dibujar vértices como pequeños puntos blancos con borde naranja
    drawPoints.forEach((pt, idx) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: idx === drawPoints.length - 1 ? 6 : 4,
        fillColor: idx === 0 ? '#10b981' : idx === drawPoints.length - 1 ? '#ef4444' : '#ffffff',
        fillOpacity: 1,
        color: '#f97316',
        weight: 2,
      }).addTo(layer);
    });

    // Dibujar polilínea provisional
    if (drawPoints.length >= 2) {
      const latlngs = drawPoints.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, {
        color: '#f97316',
        weight: 4,
        dashArray: '6, 6',
        opacity: 0.9,
      }).addTo(layer);
    }
  }, [drawPoints]);

  // ─── 4. Renderizado de Puntos de Inventario (SOLO PUNTOS DE COLOR, SIN ICONOS) ─
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showPoints) return;

    filteredInventory.forEach((item) => {
      const lat = item.latitude || (item.coordenadas && item.coordenadas.lat);
      const lng = item.longitude || (item.coordenadas && item.coordenadas.lng);
      if (!lat || !lng) return;

      const color = getPointColor(item);
      const hasWarning = Boolean(item.gps_warning || item.advertencia_gps);

      // Usamos L.circleMarker (vector puro, ligero, nítido y sin iconos)
      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        fillColor: color,
        fillOpacity: 0.92,
        color: hasWarning ? '#facc15' : '#ffffff', // Borde amarillo si hubo dispersión GPS > 6m
        weight: hasWarning ? 2.5 : 1.8,
      });

      marker.on('click', (e) => {
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setIsEditingTarget(false);
        setSelectedPoint(item);
        setSelectedPath(null);

        // Seleccionar como elemento activo en el preview con Chat IA
        setSelectedTarget({
          type: 'point',
          id: item.id,
          title: item.name || item.tipo || 'Punto de inventario',
          category: getItemCategory(item),
          variety: item.variety_type,
          status: item.status || item.estado || 'saludable',
          notes: item.notes || '',
          lat,
          lng,
          photo_url: item.photo_url || item.foto_url || null,
          accuracy: item.accuracy_meters || item.accuracy_m || null,
          raw: item,
        });
      });

      // Tooltip rápido al pasar el ratón
      marker.bindTooltip(
        `<b>${item.name || item.tipo}</b> ${item.variety_type ? `(${item.variety_type})` : ''}`,
        { direction: 'top', offset: [0, -6], className: 'campito-map-tooltip' }
      );

      marker.addTo(layer);
    });
  }, [filteredInventory, showPoints]);

  // ─── 5. Renderizado de Caminos y Senderos (LÍNEAS DE COLOR) ───────────────────
  useEffect(() => {
    const layer = pathsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showPaths) return;

    filteredPaths.forEach((path) => {
      const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
      if (coords.length < 2) return;

      const latlngs = coords.map((c) => [c.lat, c.lng]);
      // Usar color del PATH_TYPE_COLORS si no tiene color propio
      const lineColor = path.color || PATH_TYPE_COLORS[path.path_type] || '#f97316';
      const poly = L.polyline(latlngs, {
        color: lineColor,
        weight: Number(path.stroke_width) || 4,
        opacity: 0.85,
        dashArray: path.path_type === 'linea_riego' ? '8, 6' : path.path_type === 'acequia' ? '4, 4' : path.path_type === 'linde' ? '10, 5' : null,
      });

      poly.on('click', (e) => {
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setIsEditingTarget(false);
        setSelectedPath(path);
        setSelectedPoint(null);

        setSelectedTarget({
          type: 'path',
          id: path.id,
          title: path.name || 'Camino / Trazado',
          path_type: path.path_type || 'sendero',
          color: path.color || PATH_TYPE_COLORS[path.path_type] || '#f97316',
          length_meters: path.length_meters,
          stroke_width: path.stroke_width,
          notes: path.notes || '',
          coordinates: coords,
          raw: path,
        });
      });

      // Tooltip informativo
      const lengthText = path.length_meters ? ` (${Number(path.length_meters).toFixed(0)}m)` : '';
      poly.bindTooltip(`<b>${path.name}</b>${lengthText}`, {
        sticky: true,
        className: 'campito-map-tooltip',
      });

      poly.addTo(layer);
    });
  }, [filteredPaths, showPaths]);

  // ─── 5b. Renderizado del Catastro Oficial Registrado (Parcelas 195 y 196) ───
  useEffect(() => {
    const layer = catastroLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showCatastro || !catastroJorox) return;

    // 1. Polígonos de Superficie de Parcelas
    (catastroJorox.parcels || []).forEach((parcel) => {
      const latlngs = parcel.polygon.map((c) => [c.lat, c.lng]);
      const is195 = parcel.number === '195';

      const poly = L.polygon(latlngs, {
        color: is195 ? '#00d1da' : '#38bdf8', // Cyan brillante para 195, Celeste para 196
        weight: 3,
        dashArray: '6, 6',
        fillColor: '#00979d',
        fillOpacity: 0.12, // Translúcido para ver la ortofoto satelital debajo
      });

      poly.bindTooltip(
        `<b>🏛️ ${parcel.name}</b><br/><span style="font-size: 10px; color: #00979d">Superficie Catastral Oficial (${parcel.polygon.length} vértices)</span>`,
        { sticky: true, className: 'campito-map-tooltip' }
      );

      poly.on('click', (e) => {
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setIsEditingTarget(false);
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        setSelectedTarget({
          type: 'catastro',
          id: `parcel-${parcel.number}`,
          title: parcel.name,
          subtitle: `Linde Catastral Oficial (Parcela ${parcel.number})`,
          lat,
          lng,
          notes: `Linde catastral con ${parcel.polygon.length} vértices`,
          raw: parcel,
        });
        setSelectedPoint(null);
        setSelectedPath(null);
      });

      poly.addTo(layer);
    });

    // 2. Cotas Catastrales (mojones y vértices oficiales)
    (catastroJorox.cotas || []).forEach((cota) => {
      const marker = L.circleMarker([cota.lat, cota.lng], {
        radius: 6.5,
        fillColor: '#ffffff',
        fillOpacity: 0.95,
        color: '#00979d',
        weight: 2,
      });

      marker.bindTooltip(`<b>Cota Catastral ${cota.name}</b>`, {
        direction: 'top',
        offset: [0, -6],
        className: 'campito-map-tooltip',
      });

      marker.on('click', (e) => {
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setIsEditingTarget(false);
        setSelectedTarget({
          type: 'catastro',
          id: `cota-${cota.name}`,
          title: `Cota Catastral ${cota.name}`,
          subtitle: 'Mojón o punto de cota oficial',
          lat: cota.lat,
          lng: cota.lng,
          notes: 'Vértice oficial registrado en Catastro',
          raw: cota,
        });
        setSelectedPoint(null);
        setSelectedPath(null);
      });

      marker.addTo(layer);
    });

    // 3. Trazados y pistas catastrales registradas
    (catastroJorox.tracks || []).forEach((track) => {
      const latlngs = (track.coordinates || []).map((c) => [c.lat, c.lng]);
      if (latlngs.length < 2) return;

      const poly = L.polyline(latlngs, {
        color: '#94a3b8',
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5',
      });

      poly.bindTooltip(`<b>${track.name}</b> <span style="font-size:10px">(Catastro)</span>`, {
        sticky: true,
        className: 'campito-map-tooltip',
      });

      poly.on('click', (e) => {
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setIsEditingTarget(false);
        setSelectedTarget({
          type: 'catastro_track',
          id: `catastro-track-${track.name}`,
          title: track.name,
          subtitle: 'Trazado o pista catastral registrada',
          notes: 'Trazado catastral oficial',
          raw: track,
        });
        setSelectedPoint(null);
        setSelectedPath(null);
      });

      poly.addTo(layer);
    });
  }, [showCatastro]);

  // ─── 6. Auto-ajuste de vista a todos los elementos al cargar ────────────────
  const fitAllElements = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = L.latLngBounds([]);
    let count = 0;

    // Incluir límites de las parcelas catastrales oficiales
    if (catastroJorox && catastroJorox.parcels) {
      catastroJorox.parcels.forEach((p) => {
        p.polygon.forEach((c) => {
          bounds.extend([c.lat, c.lng]);
          count++;
        });
      });
    }

    inventory.forEach((i) => {
      const lat = i.latitude || (i.coordenadas && i.coordenadas.lat);
      const lng = i.longitude || (i.coordenadas && i.coordenadas.lng);
      if (lat && lng) {
        bounds.extend([lat, lng]);
        count++;
      }
    });

    paths.forEach((p) => {
      const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
      coords.forEach((c) => {
        if (c.lat && c.lng) {
          bounds.extend([c.lat, c.lng]);
          count++;
        }
      });
    });

    if (count > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  };

  // ─── 7. Guardar Nuevo Camino en Supabase ─────────────────────────────────────
  const handleSaveDrawnPath = async () => {
    if (drawPoints.length < 2) {
      alert('Un camino o sendero debe tener al menos 2 puntos marcados en el mapa.');
      return;
    }

    const pathName = newPathData.name.trim() || `Sendero ${paths.length + 1}`;
    const lengthMeters = calculatePathMeters(drawPoints);

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Admin';

      const payload = {
        name: pathName,
        path_type: newPathData.path_type,
        coordinates: drawPoints,
        color: newPathData.color,
        stroke_width: Number(newPathData.stroke_width) || 4,
        length_meters: Number(lengthMeters.toFixed(2)),
        notes: newPathData.notes.trim() || null,
        user_id: user?.id || null,
        user_name: userName,
        is_active: true,
      };

      const { data, error } = await supabase.from('farm_paths').insert(payload).select().single();

      if (error) {
        console.error('Error insertando en farm_paths:', error);
        alert(`Error al guardar en base de datos: ${error.message}`);
        return;
      }

      // Limpiar estado
      setIsDrawing(false);
      setDrawPoints([]);
      setShowSaveModal(false);
      setNewPathData({ name: '', path_type: 'sendero', color: '#f97316', stroke_width: 4, notes: '' });

      if (onReloadPaths) onReloadPaths();
      if (onPathCreated) onPathCreated(data);
    } catch (err) {
      console.error('Error guardando camino:', err);
      alert(`Error al guardar camino: ${err.message}`);
    }
  };

  // ─── 8. Guardar Última Caminata GPS como Camino ──────────────────────────────
  const handleConvertGpsTrackToPath = () => {
    if (!lastRecordedGpsTrack || lastRecordedGpsTrack.length < 2) {
      alert('No hay una sesión de caminata GPS registrada recientemente.');
      return;
    }

    const pts = lastRecordedGpsTrack.map((t) => ({
      lat: Number(t.lat.toFixed(7)),
      lng: Number(t.lng.toFixed(7)),
      alt: t.altitude || null,
    }));

    setDrawPoints(pts);
    setNewPathData({
      name: `Ruta GPS ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      path_type: 'sendero',
      color: '#eab308',
      stroke_width: 4,
      notes: `Mapeado por voz y GPS continuo (${pts.length} puntos)`,
    });
    setShowSaveModal(true);
  };

  // ─── 9. Actualizar Camino Existente ──────────────────────────────────────────
  const handleUpdatePath = async () => {
    if (!selectedPath) return;

    try {
      const { error } = await supabase
        .from('farm_paths')
        .update({
          name: editPathData.name,
          color: editPathData.color,
          stroke_width: Number(editPathData.stroke_width) || 4,
          notes: editPathData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPath.id);

      if (error) throw error;

      setIsEditingPath(false);
      setSelectedPath(null);
      if (onReloadPaths) onReloadPaths();
    } catch (err) {
      alert(`Error al actualizar el camino: ${err.message}`);
    }
  };

  // ─── 10. Eliminar Camino ─────────────────────────────────────────────────────
  const handleDeletePath = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este camino o sendero del mapa?')) return;

    try {
      const { error } = await supabase.from('farm_paths').delete().eq('id', id);
      if (error) throw error;
      setSelectedPath(null);
      if (onReloadPaths) onReloadPaths();
    } catch (err) {
      alert(`Error al eliminar camino: ${err.message}`);
    }
  };

  // ─── 11. Eliminar Punto de Inventario ────────────────────────────────────────
  const handleDeletePoint = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este punto del inventario?')) return;

    try {
      const { error } = await supabase.from('farm_inventory').delete().eq('id', id);
      if (error) throw error;
      setSelectedPoint(null);
      if (onReloadInventory) onReloadInventory();
    } catch (err) {
      alert(`Error al eliminar punto: ${err.message}`);
    }
  };

  // ─── 11b. Actualizar Punto de Inventario ──────────────────────────────────
  const handleUpdatePoint = async () => {
    if (!selectedPoint) return;

    try {
      const { data, error } = await supabase
        .from('farm_inventory')
        .update({
          name: editPointData.name,
          variety_type: editPointData.variety_type,
          status: editPointData.status,
          notes: editPointData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPoint.id)
        .select()
        .single();

      if (error) throw error;

      setIsEditingPoint(false);
      setSelectedPoint(data || { ...selectedPoint, ...editPointData });
      if (onReloadInventory) onReloadInventory();
    } catch (err) {
      alert(`Error al actualizar el punto: ${err.message}`);
    }
  };

  // ─── 12. Exportar PDF de elementos visibles ───────────────────────────────────
  const handleExportVisiblePDF = () => {
    const dateStr = new Date().toLocaleDateString('es-ES');
    const rows = filteredInventory.map(item => [
      item.name || item.tipo || '—',
      getItemCategory(item),
      item.category || item.tipo || '—',
      item.variety_type || '—',
      item.status || item.estado || 'saludable',
      item.notes || '—',
      `${(item.latitude || item.coordenadas?.lat || 0).toFixed(6)}, ${(item.longitude || item.coordenadas?.lng || 0).toFixed(6)}`,
    ]);

    const pathRows = filteredPaths.map(path => [
      path.name || '—',
      'Trazado',
      PATH_TYPE_LABELS[path.path_type] || path.path_type || '—',
      '—',
      `${path.coordinates?.length || 0} nodos`,
      path.notes || '—',
      path.length_meters ? `${Number(path.length_meters).toFixed(0)} m` : '—',
    ]);

    const allRows = [...rows, ...pathRows];

    generateCustomPDF({
      title: 'Inventario Campito Jorox',
      subtitle: `Generado el ${dateStr} · ${filteredInventory.length} puntos · ${filteredPaths.length} trazados`,
      content: '',
      table: {
        headers: ['Nombre', 'Categoría', 'Tipo', 'Variedad', 'Estado/Nodos', 'Notas', 'GPS/Metros'],
        rows: allRows,
      },
      filename: `CAMPITO_MAPA_VISIBLE_${new Date().toISOString().split('T')[0]}.pdf`,
    });
  };

  // ─── Helpers de filtros ───────────────────────────────────────────────────────
  const toggleParentCategory = (parent) => {
    setVisibleCategories(prev => {
      const next = new Set(prev);
      if (next.has(parent)) next.delete(parent);
      else next.add(parent);
      return next;
    });
    // Al desactivar padre, limpiar subcategorías de ese padre
    setVisibleSubcats(null);
  };

  const togglePathType = (pt) => {
    setVisiblePathTypes(prev => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });
  };

  const selectAllFilters = () => {
    setVisibleCategories(new Set(Object.keys(CATEGORY_MAP)));
    setVisibleSubcats(null);
    setVisiblePathTypes(new Set(PATH_TYPES));
    setShowCatastro(true);
    setShowPaths(true);
  };

  const clearAllFilters = () => {
    setVisibleCategories(new Set());
    setVisibleSubcats(null);
    setVisiblePathTypes(new Set());
    setShowCatastro(false);
    setShowPaths(false);
  };

  // ─── 13. Centrador de ubicación actual del usuario con GPS ────────────────
  const handleCenterOnUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      alert('Tu dispositivo o navegador no soporta geolocalización GPS.');
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    setIsLocatingUser(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 10;

        // Centrar mapa
        map.setView([lat, lng], 19);

        // Actualizar capa de usuario
        const layer = userLocationLayerRef.current;
        if (layer) {
          layer.clearLayers();

          // Círculo translúcido de precisión
          L.circle([lat, lng], {
            radius: acc,
            color: '#0284c7',
            fillColor: '#38bdf8',
            fillOpacity: 0.2,
            weight: 1.5,
            dashArray: '3, 4',
          }).addTo(layer);

          // Marcador pulsante
          const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#0284c7',
            fillOpacity: 1,
            color: '#ffffff',
            weight: 2.5,
          });

          marker.bindTooltip(
            `<b>📍 Estás aquí</b><br/><span style="font-size:10px">Precisión: ±${acc.toFixed(1)} m</span>`,
            { permanent: true, direction: 'top', offset: [0, -8] }
          );

          marker.addTo(layer);
        }
      },
      (err) => {
        setIsLocatingUser(false);
        console.warn('Error capturando GPS:', err);
        alert(`No se pudo obtener la posición GPS (${err.message}). Comprueba que los permisos de ubicación estén habilitados.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  // ─── Control y edición de elemento seleccionado en el Mapa ────────────────
  const handleStartEditTarget = () => {
    if (!selectedTarget) return;
    setIsEditingTarget(true);
    setTargetEditData({
      name: selectedTarget.title || '',
      variety: selectedTarget.variety || '',
      status: selectedTarget.status || 'saludable',
      path_type: selectedTarget.path_type || 'sendero',
      color: selectedTarget.color || '#f97316',
      notes: selectedTarget.notes || '',
    });
  };

  const handleSaveTargetEdit = async () => {
    if (!selectedTarget) return;
    setIsProcessingIa(true);
    try {
      if (selectedTarget.type === 'point') {
        const updatePayload = {
          name: targetEditData.name.trim() || selectedTarget.title,
          variety_type: targetEditData.variety.trim() || null,
          status: targetEditData.status || 'saludable',
          notes: targetEditData.notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('farm_inventory').update(updatePayload).eq('id', selectedTarget.id);
        if (error) throw error;
        setSelectedTarget((prev) => ({
          ...prev,
          title: updatePayload.name,
          variety: updatePayload.variety_type,
          status: updatePayload.status,
          notes: updatePayload.notes,
        }));
        setIsEditingTarget(false);
        setIaFeedback({ type: 'success', text: `✨ Punto actualizado: ${updatePayload.name}` });
        if (onReloadInventory) onReloadInventory();
      } else if (selectedTarget.type === 'path') {
        const updatePayload = {
          name: targetEditData.name.trim() || selectedTarget.title,
          path_type: targetEditData.path_type || 'sendero',
          color: targetEditData.color || '#f97316',
          notes: targetEditData.notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('farm_paths').update(updatePayload).eq('id', selectedTarget.id);
        if (error) throw error;
        setSelectedTarget((prev) => ({
          ...prev,
          title: updatePayload.name,
          path_type: updatePayload.path_type,
          color: updatePayload.color,
          notes: updatePayload.notes,
        }));
        setIsEditingTarget(false);
        setIaFeedback({ type: 'success', text: `✨ Trazado actualizado: ${updatePayload.name}` });
        if (onReloadPaths) onReloadPaths();
      } else if (selectedTarget.type === 'catastro' || selectedTarget.type === 'coord') {
        // Guardar cota catastral o coordenada libre en farm_inventory
        const newItem = {
          name: targetEditData.name.trim() || selectedTarget.title,
          category: selectedTarget.type === 'catastro' ? 'hito' : 'riego',
          variety_type: targetEditData.variety.trim() || (selectedTarget.type === 'catastro' ? 'Cota Catastral' : null),
          status: targetEditData.status || 'saludable',
          latitude: selectedTarget.lat,
          longitude: selectedTarget.lng,
          notes: targetEditData.notes.trim() || null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: inserted, error } = await supabase.from('farm_inventory').insert([newItem]).select().single();
        if (error) throw error;
        setSelectedTarget({
          type: 'point',
          id: inserted.id,
          title: inserted.name,
          category: inserted.category,
          variety: inserted.variety_type,
          status: inserted.status,
          notes: inserted.notes,
          lat: inserted.latitude,
          lng: inserted.longitude,
          raw: inserted,
        });
        setIsEditingTarget(false);
        setIaFeedback({ type: 'success', text: `✨ Registrado en inventario: ${inserted.name}` });
        if (onReloadInventory) onReloadInventory();
      }
    } catch (err) {
      console.error('Error guardando edición:', err);
      setIaFeedback({ type: 'error', text: `Error al guardar: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  const handleDeleteTarget = async () => {
    if (!selectedTarget) return;
    if (!window.confirm(`¿Seguro que deseas eliminar "${selectedTarget.title}"?`)) return;
    setIsProcessingIa(true);
    try {
      if (selectedTarget.type === 'point') {
        const { error } = await supabase.from('farm_inventory').delete().eq('id', selectedTarget.id);
        if (error) throw error;
        setIaFeedback({ type: 'success', text: `🗑️ Elemento eliminado: ${selectedTarget.title}` });
        setSelectedTarget(null);
        if (onReloadInventory) onReloadInventory();
      } else if (selectedTarget.type === 'path') {
        const { error } = await supabase.from('farm_paths').delete().eq('id', selectedTarget.id);
        if (error) throw error;
        setIaFeedback({ type: 'success', text: `🗑️ Trazado eliminado: ${selectedTarget.title}` });
        setSelectedTarget(null);
        if (onReloadPaths) onReloadPaths();
      } else {
        setSelectedTarget(null);
      }
    } catch (err) {
      console.error('Error eliminando elemento:', err);
      setIaFeedback({ type: 'error', text: `Error al eliminar: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  const [mapIaInput, setMapIaInput] = useState('');
  const [isProcessingIa, setIsProcessingIa] = useState(false);
  const [iaFeedback, setIaFeedback] = useState(null); // { type: 'success'|'error'|'info', text: string }
  const [undoStack, setUndoStack] = useState([]); // Historial de acciones para retroceder cambios
  const [pendingVoiceAudio, setPendingVoiceAudio] = useState(null);

  // Hook de telemetría de voz y GPS en tiempo real
  const {
    isRecording: isVoiceRecording,
    elapsedSeconds: voiceRecordingSeconds,
    currentGps: voiceCurrentGps,
    accuracyWarning: voiceAccuracyWarning,
    startTracking: startVoiceTracking,
    stopTracking: stopVoiceTracking,
  } = useVoiceGeoTracker();

  // Reproductor preview audio estilo WhatsApp
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef(null);

  const formatAudioTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlayPreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play().then(() => {
        setIsPreviewPlaying(true);
      }).catch((err) => {
        console.error('Error reproduciendo preview audio:', err);
      });
    }
  };

  const handleSeekPreview = (e) => {
    const time = parseFloat(e.target.value);
    setPreviewCurrentTime(time);
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = time;
    }
  };

  const handleDiscardVoice = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPendingVoiceAudio(null);
  };

  const handleCancelVoiceRecording = async () => {
    try {
      await stopVoiceTracking();
    } catch (e) {
      console.error('Error cancelando grabación:', e);
    }
    setPendingVoiceAudio(null);
    setIsPreviewPlaying(false);
  };

  const handleStopVoiceRecording = async () => {
    try {
      const audioResult = await stopVoiceTracking();
      if (audioResult) {
        let dataUrl = audioResult.dataUrl;
        if (!dataUrl && audioResult.audioBlob) {
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(audioResult.audioBlob);
          });
        }
        const voiceObj = {
          ...audioResult,
          dataUrl,
          duration: Math.max(1, Math.round(audioResult.durationSeconds || audioResult.duration || 0)),
        };
        setPendingVoiceAudio(voiceObj);
        setPreviewDuration(voiceObj.duration);
      }
    } catch (err) {
      console.error('Error deteniendo grabación:', err);
      setIaFeedback({ type: 'error', text: 'Error al procesar la grabación de voz.' });
    }
  };

  // Cámara directa para foto de campo
  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingAttachment({
        file,
        name: file.name || `foto-${Date.now()}.jpg`,
        size: file.size,
        type: file.type || 'image/jpeg',
        dataUrl: ev.target.result,
        textContent: null,
        isImage: true,
        isPdf: false,
        isSpreadsheet: false,
        isText: false,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Botón (+) para adjuntar archivos o documentos
  const handleAttachClick = () => {
    docInputRef.current?.click();
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const nameLower = file.name.toLowerCase();
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    const isSpreadsheet =
      nameLower.endsWith('.xlsx') ||
      nameLower.endsWith('.xls') ||
      nameLower.endsWith('.csv');
    const isText =
      file.type.startsWith('text/') ||
      nameLower.endsWith('.txt') ||
      nameLower.endsWith('.csv') ||
      nameLower.endsWith('.json') ||
      nameLower.endsWith('.geojson') ||
      nameLower.endsWith('.kml') ||
      nameLower.endsWith('.md');

    if (isText) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          textContent: ev.target.result,
          dataUrl: null,
          isImage: false,
          isPdf: false,
          isSpreadsheet,
          isText: true,
        });
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          textContent: null,
          dataUrl: ev.target.result,
          isImage: isImg,
          isPdf,
          isSpreadsheet,
          isText: false,
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Auto-cierre de banner de feedback
  useEffect(() => {
    if (!iaFeedback) return;
    const timer = setTimeout(() => {
      setIaFeedback(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [iaFeedback]);

  // Ejecutar orden del agricultor con Gemini y aplicar cambios inmediatos al mapa
  const handleSendMapIaOrder = async () => {
    const textOrder = mapIaInput.trim();
    const audioOrder = pendingVoiceAudio;
    const attOrder = pendingAttachment;

    if (!textOrder && !audioOrder && !attOrder) return;
    if (isProcessingIa) return;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setIaFeedback({ type: 'error', text: 'API Key de Gemini no configurada en las variables de entorno.' });
      return;
    }

    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: '🤖 Analizando orden y ejecutando cambios en el mapa...' });

    // Si hay una foto adjunta, intentar subirla a Supabase Storage
    let uploadedPhotoUrl = null;
    if (attOrder?.file && attOrder.isImage) {
      try {
        const fileExt = attOrder.name ? attOrder.name.split('.').pop() : 'jpg';
        const cleanFileName = `map-photos/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: upErr } = await supabase.storage
          .from('comprobantes')
          .upload(cleanFileName, attOrder.file, { contentType: attOrder.type || 'image/jpeg' });
        if (!upErr) {
          const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(cleanFileName);
          uploadedPhotoUrl = pubData?.publicUrl || null;
        }
      } catch (upEx) {
        console.warn('[MapAI] Error subiendo foto a Supabase storage:', upEx);
      }
      if (!uploadedPhotoUrl && attOrder.dataUrl) {
        uploadedPhotoUrl = attOrder.dataUrl;
      }
    }

    try {
      const center = mapInstanceRef.current ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng] : DEFAULT_CENTER;
      const gpsPos = voiceCurrentGps || null;

      const result = await callGeminiForMapAction({
        prompt: textOrder,
        audio: audioOrder,
        attachment: attOrder,
        selectedTarget,
        visibleInventory: filteredInventory,
        visiblePaths: filteredPaths,
        mapCenter: center,
        currentGps: gpsPos,
        apiKey,
      });

      // Limpiar entrada y archivos
      setMapIaInput('');
      setPendingVoiceAudio(null);
      setPendingAttachment(null);
      setIsPreviewPlaying(false);

      if (!result.actions || result.actions.length === 0) {
        // 1. Si el usuario adjuntó una foto, nota o audio sobre un punto de inventario seleccionado
        if (selectedTarget?.type === 'point' && (uploadedPhotoUrl || textOrder || audioOrder)) {
          const prevItem = inventory.find(i => i.id === selectedTarget.id);
          const updatePayload = {
            updated_at: new Date().toISOString()
          };
          if (uploadedPhotoUrl) updatePayload.photo_url = uploadedPhotoUrl;
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevItem?.notes ? `${prevItem.notes}\n${noteToAdd}` : noteToAdd;
          }

          const { error: directUpdErr } = await supabase
            .from('farm_inventory')
            .update(updatePayload)
            .eq('id', selectedTarget.id);

          if (!directUpdErr) {
            setUndoStack((prev) => [
              ...prev,
              {
                description: `Actualizado ${selectedTarget.title}`,
                reverts: [
                  {
                    type: 'UPDATE_POINT',
                    target_id: selectedTarget.id,
                    prevData: {
                      photo_url: prevItem?.photo_url || null,
                      notes: prevItem?.notes || '',
                    },
                  },
                ],
                timestamp: Date.now(),
              },
            ]);
            setSelectedTarget((prev) => ({ ...prev, ...updatePayload }));
            setIaFeedback({ type: 'success', text: `✨ Datos guardados en ${selectedTarget.title}` });
            if (onReloadInventory) await onReloadInventory();
            setIsProcessingIa(false);
            return;
          }
        }

        // 2. Si el usuario añadió una nota sobre una polilínea / camino seleccionado
        if (selectedTarget?.type === 'path' && (uploadedPhotoUrl || textOrder || audioOrder)) {
          const prevPath = paths.find(p => p.id === selectedTarget.id);
          const updatePayload = {
            updated_at: new Date().toISOString()
          };
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevPath?.notes ? `${prevPath.notes}\n${noteToAdd}` : noteToAdd;
          }

          const { error: directUpdErr } = await supabase
            .from('farm_paths')
            .update(updatePayload)
            .eq('id', selectedTarget.id);

          if (!directUpdErr) {
            setSelectedTarget((prev) => ({ ...prev, ...updatePayload }));
            setIaFeedback({ type: 'success', text: `✨ Notas actualizadas en ${selectedTarget.title}` });
            if (onReloadPaths) await onReloadPaths();
            setIsProcessingIa(false);
            return;
          }
        }

        // 3. Si el usuario pinchó en una coordenada del mapa o cota catastral
        if ((selectedTarget?.type === 'catastro' || selectedTarget?.type === 'coord') && (uploadedPhotoUrl || textOrder || audioOrder)) {
          let rawName = textOrder;
          if (!rawName && result.transcription) {
            rawName = result.transcription;
          }
          if (!rawName && result.description && !result.description.toLowerCase().includes('no se')) {
            rawName = result.description;
          }
          if (!rawName) {
            rawName = selectedTarget.title || 'Punto registrado';
          }
          if (rawName.length > 35) {
            rawName = rawName.slice(0, 32) + '...';
          }
          const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

          let category = selectedTarget.type === 'catastro' ? 'hito' : 'riego';
          const lowerName = formattedName.toLowerCase();
          if (lowerName.includes('casa') || lowerName.includes('edificio') || lowerName.includes('almacen') || lowerName.includes('caseta') || lowerName.includes('taller') || lowerName.includes('caravana')) {
            category = 'edificio';
          } else if (lowerName.includes('arbol') || lowerName.includes('aguacate') || lowerName.includes('olivo') || lowerName.includes('limon') || lowerName.includes('naranjo')) {
            category = 'arbol';
          } else if (lowerName.includes('riego') || lowerName.includes('llave') || lowerName.includes('arqueta') || lowerName.includes('pozo') || lowerName.includes('deposito')) {
            category = 'riego';
          }

          const notes = textOrder
            ? (selectedTarget.notes ? `${selectedTarget.notes}\n${textOrder}` : textOrder)
            : (result.transcription ? `Audio: "${result.transcription}"` : (selectedTarget.notes || 'Registrado con Agente IA'));

          const newItem = {
            name: formattedName,
            category,
            variety_type: selectedTarget.type === 'catastro' ? 'Cota Catastral' : null,
            status: 'saludable',
            latitude: selectedTarget.lat,
            longitude: selectedTarget.lng,
            notes,
            photo_url: uploadedPhotoUrl || null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error: insErr } = await supabase.from('farm_inventory').insert([newItem]).select().single();
          if (!insErr && inserted) {
            setSelectedTarget({
              type: 'point',
              id: inserted.id,
              title: inserted.name,
              category: getItemCategory(inserted),
              variety: inserted.variety_type,
              status: inserted.status,
              notes: inserted.notes,
              lat: inserted.latitude,
              lng: inserted.longitude,
              photo_url: inserted.photo_url,
              raw: inserted,
            });
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo([inserted.latitude, inserted.longitude]);
            }
            setIaFeedback({ type: 'success', text: `✨ Registrado en inventario: ${inserted.name}` });
            if (onReloadInventory) await onReloadInventory();
            setIsProcessingIa(false);
            return;
          }
        }

        setIaFeedback({ type: 'info', text: result.description || 'No se requirieron cambios en el mapa.' });
        setIsProcessingIa(false);
        return;
      }

      // Preparar estructura para deshacer
      const undoAction = {
        description: result.description || 'Cambios en el mapa',
        reverts: [],
        timestamp: Date.now(),
      };

      for (const act of result.actions) {
        const actType = (act.type || '').toUpperCase();
        const actData = act.data || act;

        if (actType === 'DELETE_POINT' || actType === 'REMOVE_POINT') {
          const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
          const item = inventory.find((i) => i.id === targetId);
          if (item) {
            const { error: delErr } = await supabase.from('farm_inventory').delete().eq('id', targetId);
            if (!delErr) {
              undoAction.reverts.push({ type: 'RESTORE_POINT', itemData: item });
              if (selectedTarget?.id === targetId) {
                setSelectedTarget(null);
              }
            }
          }
        } else if (actType === 'DELETE_PATH' || actType === 'REMOVE_PATH') {
          const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
          const path = paths.find((p) => p.id === targetId);
          if (path) {
            const { error: delErr } = await supabase.from('farm_paths').delete().eq('id', targetId);
            if (!delErr) {
              undoAction.reverts.push({ type: 'RESTORE_PATH', pathData: path });
              if (selectedTarget?.id === targetId) {
                setSelectedTarget(null);
              }
            }
          }
        } else if (actType === 'UPDATE_POINT' || actType === 'EDIT_POINT' || actType === 'MODIFY_POINT') {
          const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
          const item = inventory.find((i) => i.id === targetId);
          if (item && actData) {
            const updatePayload = { ...actData };
            delete updatePayload.type;
            delete updatePayload.target_id;
            delete updatePayload.id;
            if (uploadedPhotoUrl) {
              updatePayload.photo_url = uploadedPhotoUrl;
            }
            const prevData = {};
            Object.keys(updatePayload).forEach((k) => { prevData[k] = item[k]; });
            const { error: updErr } = await supabase
              .from('farm_inventory')
              .update({ ...updatePayload, updated_at: new Date().toISOString() })
              .eq('id', targetId);
            if (!updErr) {
              undoAction.reverts.push({ type: 'UPDATE_POINT', target_id: targetId, prevData });
              if (selectedTarget?.id === targetId) {
                setSelectedTarget((prev) => ({ ...prev, ...updatePayload }));
              }
            }
          }
        } else if (actType === 'UPDATE_PATH' || actType === 'EDIT_PATH') {
          const targetId = act.target_id || act.id || actData.id || selectedTarget?.id;
          const path = paths.find((p) => p.id === targetId);
          if (path && actData) {
            const prevData = {};
            Object.keys(actData).forEach((k) => { prevData[k] = path[k]; });
            const { error: updErr } = await supabase
              .from('farm_paths')
              .update({ ...actData, updated_at: new Date().toISOString() })
              .eq('id', targetId);
            if (!updErr) {
              undoAction.reverts.push({ type: 'UPDATE_PATH', target_id: targetId, prevData });
              if (selectedTarget?.id === targetId) {
                setSelectedTarget((prev) => ({ ...prev, ...actData }));
              }
            }
          }
        } else if (actType === 'ADD_POINT' || actType === 'CREATE_POINT' || actType === 'INSERT_POINT' || actType === 'NEW_POINT') {
          const lat = Number(
            actData.latitude ?? actData.lat ?? act.latitude ?? act.lat ??
            selectedTarget?.lat ??
            audioOrder?.gpsTrack?.[0]?.lat ??
            voiceCurrentGps?.lat ??
            center[0]
          );
          const lng = Number(
            actData.longitude ?? actData.lng ?? act.longitude ?? act.lng ??
            selectedTarget?.lng ??
            audioOrder?.gpsTrack?.[0]?.lng ??
            voiceCurrentGps?.lng ??
            center[1]
          );
          const rawName = actData.name || actData.title || act.title || (result.transcription && result.transcription.length < 35 ? result.transcription : 'Punto registrado');
          const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

          let category = actData.category || act.category;
          if (!category || category === 'Otros') {
            const lowerName = formattedName.toLowerCase();
            if (lowerName.includes('casa') || lowerName.includes('edificio') || lowerName.includes('almacen') || lowerName.includes('taller') || lowerName.includes('caseta') || lowerName.includes('caravana')) {
              category = 'edificio';
            } else if (lowerName.includes('aguacate') || lowerName.includes('limon') || lowerName.includes('olivo') || lowerName.includes('arbol') || lowerName.includes('naranjo')) {
              category = 'arbol';
            } else if (lowerName.includes('riego') || lowerName.includes('llave') || lowerName.includes('arqueta') || lowerName.includes('pozo') || lowerName.includes('deposito')) {
              category = 'riego';
            } else {
              category = 'edificio';
            }
          }

          const notes = actData.notes || act.notes || (textOrder ? textOrder : (result.transcription ? `Audio: "${result.transcription}"` : (result.description || 'Registrado con Agente IA')));

          const newItem = {
            name: formattedName,
            category,
            variety_type: actData.variety_type || actData.variety || null,
            status: actData.status || 'saludable',
            latitude: lat,
            longitude: lng,
            notes,
            photo_url: uploadedPhotoUrl || null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: inserted, error: insErr } = await supabase.from('farm_inventory').insert([newItem]).select().single();
          if (insErr) {
            console.error('[MapAI] Error insertando punto en Supabase:', insErr);
            setIaFeedback({ type: 'error', text: `Error al guardar en inventario: ${insErr.message}` });
          } else if (inserted) {
            undoAction.reverts.push({ type: 'DELETE_POINT', target_id: inserted.id });
            setSelectedTarget({
              type: 'point',
              id: inserted.id,
              title: inserted.name,
              category: getItemCategory(inserted),
              variety: inserted.variety_type,
              status: inserted.status,
              notes: inserted.notes,
              lat: inserted.latitude,
              lng: inserted.longitude,
              photo_url: inserted.photo_url,
              raw: inserted,
            });
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo([inserted.latitude, inserted.longitude]);
            }
          }
        }
      }

      if (undoAction.reverts.length > 0) {
        setUndoStack((prev) => [...prev, undoAction]);
        setIaFeedback({
          type: 'success',
          text: `✨ ${result.description || 'Cambios aplicados en el mapa'} (Pulsa ↩️ para revertir)`,
        });
      } else {
        setIaFeedback({ type: 'info', text: result.description || 'No se realizaron modificaciones.' });
      }

      if (onReloadInventory) await onReloadInventory();
      if (onReloadPaths) await onReloadPaths();
    } catch (err) {
      console.error('[MapAI] Error procesando orden:', err);
      setIaFeedback({ type: 'error', text: `Error al ejecutar: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  // Deshacer el último cambio realizado por la IA
  const handleUndoMapAction = async () => {
    if (undoStack.length === 0 || isProcessingIa) return;
    const lastAction = undoStack[undoStack.length - 1];

    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: `↩️ Revirtiendo: "${lastAction.description}"...` });

    try {
      for (const rev of lastAction.reverts) {
        if (rev.type === 'RESTORE_POINT') {
          await supabase.from('farm_inventory').insert([rev.itemData]);
        } else if (rev.type === 'RESTORE_PATH') {
          await supabase.from('farm_paths').insert([rev.pathData]);
        } else if (rev.type === 'UPDATE_POINT') {
          await supabase.from('farm_inventory').update({ ...rev.prevData, updated_at: new Date().toISOString() }).eq('id', rev.target_id);
        } else if (rev.type === 'UPDATE_PATH') {
          await supabase.from('farm_paths').update({ ...rev.prevData, updated_at: new Date().toISOString() }).eq('id', rev.target_id);
        } else if (rev.type === 'DELETE_POINT') {
          await supabase.from('farm_inventory').delete().eq('id', rev.target_id);
        } else if (rev.type === 'DELETE_PATH') {
          await supabase.from('farm_paths').delete().eq('id', rev.target_id);
        }
      }

      setUndoStack((prev) => prev.slice(0, -1));
      setIaFeedback({ type: 'success', text: `↩️ Acción deshecha con éxito: ${lastAction.description}` });
      if (onReloadInventory) onReloadInventory();
      if (onReloadPaths) onReloadPaths();
    } catch (err) {
      console.error('Error deshaciendo acción:', err);
      setIaFeedback({ type: 'error', text: `Error al deshacer: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  return (
    <div style={isPageMode ? stylesPage.wrapper : styles.wrapper}>
      {/* ── Barra Superior Limpia: Buscar, Filtros, PDF, Capas e Información ── */}
      <div style={styles.topBarClean}>
        {/* 1. Buscador */}
        <div style={stylesFilter.searchBox}>
          <Search size={14} color="#64748b" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={stylesFilter.searchInput}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={12} color="#94a3b8" />
            </button>
          )}
        </div>

        {/* 2. Filtros (Solo icono, sin recuadro exterior) */}
        <button
          type="button"
          onClick={() => {
            setIsFilterOpen((v) => !v);
            setIsLayersMenuOpen(false);
          }}
          style={{
            ...styles.topBarIconBtn,
            color: isFilterOpen ? '#00979d' : '#475569',
          }}
          title="Filtros por categoría y trazados"
          aria-label="Filtros"
        >
          <Filter size={18} />
        </button>

        {/* 3. Capas (Solo icono, sin recuadro exterior, con dropdown) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsLayersMenuOpen((v) => !v);
              setIsFilterOpen(false);
            }}
            style={{
              ...styles.topBarIconBtn,
              color: isLayersMenuOpen ? '#00979d' : '#475569',
            }}
            title="Capas del mapa y visualización"
            aria-label="Capas del mapa"
          >
            <Layers size={18} />
          </button>

          {/* Menú Dropdown de Capas */}
          {isLayersMenuOpen && (
            <div style={styles.layersDropdown}>
              <div style={styles.layersDropdownHeader}>
                <span style={styles.layersDropdownTitle}>Capas del Mapa</span>
                <button
                  type="button"
                  onClick={() => setIsLayersMenuOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2, display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Opciones de Capas */}
              <label style={styles.layerCheckboxItem}>
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                  style={{ accentColor: '#00979d', cursor: 'pointer' }}
                />
                <span style={styles.layerCheckboxLabel}>Referencias y Leyenda</span>
              </label>

              <label style={styles.layerCheckboxItem}>
                <input
                  type="checkbox"
                  checked={showNavControls}
                  onChange={(e) => setShowNavControls(e.target.checked)}
                  style={{ accentColor: '#00979d', cursor: 'pointer' }}
                />
                <span style={styles.layerCheckboxLabel}>Navegación, Zoom y GPS</span>
              </label>
            </div>
          )}
        </div>

        {/* 4. PDF (Solo icono, sin recuadro exterior) */}
        <button
          type="button"
          onClick={handleExportVisiblePDF}
          disabled={filteredInventory.length === 0 && filteredPaths.length === 0}
          style={{
            ...styles.topBarIconBtn,
            color: '#dc2626',
            opacity: filteredInventory.length === 0 && filteredPaths.length === 0 ? 0.35 : 1,
            cursor: filteredInventory.length === 0 && filteredPaths.length === 0 ? 'not-allowed' : 'pointer',
          }}
          title="Exportar PDF de elementos visibles"
          aria-label="Exportar PDF"
        >
          <Printer size={18} />
        </button>

        {/* 5. Información (Solo icono, sin recuadro exterior) */}
        <button
          type="button"
          onClick={() => setIsInfoModalOpen(true)}
          style={{
            ...styles.topBarIconBtn,
            color: '#00979d',
          }}
          title="¿Qué es este mapa y cómo interactuar con él mediante Chat IA?"
          aria-label="Información del mapa"
        >
          <Info size={18} />
        </button>
      </div>

      {/* ── Contenedor del Mapa Leaflet ──────────────────────────────────────── */}
      <div style={styles.mapContainer}>
        <div ref={mapContainerRef} style={styles.leafletMap} />

        {/* Banner flotante de dibujo activo */}
        {isDrawing && (
          <div style={styles.drawingBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={styles.pulseDot} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                  Modo Trazado Activo: Haz clic en el satélite para colocar puntos
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Vértices: <b>{drawPoints.length}</b> | Distancia acumulada: <b>{liveDrawDistance.toFixed(1)} m</b>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
                disabled={drawPoints.length === 0}
                style={{
                  ...styles.drawActionBtn,
                  opacity: drawPoints.length === 0 ? 0.5 : 1,
                  backgroundColor: '#ffffff',
                  color: '#475569',
                }}
                title="Deshacer último punto"
              >
                <Undo2 size={13} />
                Deshacer
              </button>

              <button
                onClick={() => setShowSaveModal(true)}
                disabled={drawPoints.length < 2}
                style={{
                  ...styles.drawActionBtn,
                  opacity: drawPoints.length < 2 ? 0.5 : 1,
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              >
                <Check size={13} />
                Finalizar y Guardar
              </button>
            </div>
          </div>
        )}

        {/* Leyenda de colores flotante (div de referencias - controlado por Capas) */}
        {showLegend && (
          <div style={{ ...styles.legendBox, bottom: selectedTarget ? 150 : 76 }}>
            <span style={styles.legendTitle}>Referencias (Puntos y Líneas)</span>
            <div style={styles.legendGrid}>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#16a34a' }} />
                <span>Árboles</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#4ade80' }} />
                <span>Plantas</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#eab308' }} />
                <span>Edificios</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#0284c7' }} />
                <span>Riego / Agua</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#ef4444' }} />
                <span>Poda/Seco</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#92400e' }} />
                <span>Camino</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#38bdf8', borderTop: '2px dashed #38bdf8', height: 0 }} />
                <span>Riego</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, borderTop: '2px dashed #00d1da', height: 0 }} />
                <span>Parcela 195/196</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Widget Flotante de Navegación, Zoom y Centrador GPS ──────────── */}
        {showNavControls && (
          <div style={{ ...styles.navWidget, bottom: selectedTarget ? 150 : 76 }}>
            <button
              onClick={() => mapInstanceRef.current?.zoomIn()}
              style={styles.navWidgetBtn}
              title="Acercar mapa (+)"
            >
              <ZoomIn size={16} />
            </button>

            <button
              onClick={() => mapInstanceRef.current?.zoomOut()}
              style={styles.navWidgetBtn}
              title="Alejar mapa (-)"
            >
              <ZoomOut size={16} />
            </button>

            <div style={styles.navWidgetDivider} />

            <button
              onClick={handleCenterOnUserLocation}
              disabled={isLocatingUser}
              style={{
                ...styles.navWidgetBtn,
                color: isLocatingUser ? '#f59e0b' : '#0284c7',
                backgroundColor: isLocatingUser ? '#f0f9ff' : '#ffffff',
              }}
              title="Centrar en mi ubicación actual GPS"
            >
              <Crosshair size={16} />
            </button>

            <button
              onClick={fitAllElements}
              style={{ ...styles.navWidgetBtn, color: '#00979d' }}
              title="Centrar toda la finca (Parcelas 195 y 196)"
            >
              <Compass size={16} />
            </button>
          </div>
        )}

        {/* ── Modal de Información y Guía de Interacción con Chat IA ───────── */}
        {isInfoModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setIsInfoModalOpen(false)}>
            <div style={styles.infoModalCard} onClick={(e) => e.stopPropagation()}>
              <div style={styles.infoModalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={styles.infoModalIconBadge}>
                    <Info size={18} color="#ffffff" />
                  </div>
                  <div>
                    <h3 style={styles.infoModalTitle}>Mapa Satelital de Campito Jorox</h3>
                    <p style={styles.infoModalSubtitle}>Catastro georreferenciado e interacción con Chat IA</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={styles.infoModalBody}>
                {/* Bloque 1: Qué es el mapa */}
                <div style={styles.infoBlock}>
                  <div style={styles.infoBlockTitle}>
                    <Compass size={15} color="#00979d" />
                    <span>¿Qué es este mapa?</span>
                  </div>
                  <p style={styles.infoBlockText}>
                    Es el visor satelital georreferenciado oficial de <b>Campito Jorox</b> (Parcelas 195 y 196). Muestra en tiempo real todos los árboles, plantas, infraestructura hídrica (arquetas, llaves de agua, goteros, filtros, tuberías), edificios y caminos registrados en la base de datos de la finca.
                  </p>
                </div>

                {/* Bloque 2: Edición y Creación de Elementos mediante Agente IA */}
                <div style={styles.infoBlockHighlight}>
                  <div style={{ ...styles.infoBlockTitle, color: '#0f766e' }}>
                    <Sparkles size={16} color="#00979d" />
                    <span>Edición y Creación de Elementos con Agente IA</span>
                  </div>
                  <p style={styles.infoBlockText}>
                    Puedes interactuar y ordenar acciones directamente al agente IA tocando cualquier coordenada o elemento en el satélite:
                  </p>
                  <ul style={styles.infoList}>
                    <li>
                      <b>📍 Crear nuevos puntos tocando el mapa:</b> Haz clic en cualquier lugar de la finca para fijar una coordenada. En el módulo inferior integrado, escribe o dicta por voz qué elemento es:
                      <div style={styles.exampleBubble}>
                        "Aquí tenemos un aguacate Hass" · "Añade una arqueta con llave de 25mm" · "Coloca una caseta de aperos"
                      </div>
                      El agente IA interpretará automáticamente la categoría, variedad y propiedades técnicas y creará el nuevo punto georreferenciado.
                    </li>
                    <li>
                      <b>✏️ Editar y redefinir elementos existentes:</b> Toca cualquier árbol, arqueta, mojón de cota catastral o linde para seleccionarlo. En su módulo inferior de IA puedes ordenar cambios directos:
                      <div style={styles.exampleBubble}>
                        "Cambia su estado a poda requerida" · "Renombra a Olivo Picual 4" · "Añade nota: gotero reparado con manguera de 16mm"
                      </div>
                    </li>
                    <li>
                      <b>📷 Vincular fotos o documentos:</b> Pulsa el botón <b>(+)</b> o el icono de <b>cámara</b> en la barra del elemento para adjuntar una imagen o documento PDF y pídele a la IA:
                      <div style={styles.exampleBubble}>
                        "Vincula esta foto del árbol y anota que muestra la floración"
                      </div>
                    </li>
                    <li>
                      <b>↩️ Deshacer cambios al instante:</b> Si te equivocas o deseas revertir una orden, pulsa el botón de retroceso <b>(↩️)</b> para restaurar el estado anterior al momento.
                    </li>
                  </ul>
                </div>

                {/* Bloque 3: Registro en Movimiento por Voz (Chat IA Global) */}
                <div style={styles.infoBlock}>
                  <div style={styles.infoBlockTitle}>
                    <Bot size={15} color="#00979d" />
                    <span>Registro en Terreno con GPS (Chat IA)</span>
                  </div>
                  <p style={styles.infoBlockText}>
                    También puedes abrir la sección <b>Chat IA</b> mientras caminas por la finca: al dictar por voz con el micrófono, la app captura automáticamente tu posición satelital y ubica el objeto en sus coordenadas reales.
                  </p>
                </div>

                {/* Bloque 4: Herramientas del visor */}
                <div style={styles.infoBlock}>
                  <div style={styles.infoBlockTitle}>
                    <Layers size={15} color="#00979d" />
                    <span>Herramientas del Visor</span>
                  </div>
                  <ul style={styles.infoList}>
                    <li><b>🔍 Buscador:</b> Localiza al instante cualquier árbol, arqueta, llave o nota técnica.</li>
                    <li><b>⚙️ Filtros:</b> Activa o desactiva categorías completas, subcategorías, trazados y el catastro oficial.</li>
                    <li><b>📑 Capas:</b> Activa o desactiva la leyenda y referencias, así como los controles de navegación y centrado GPS.</li>
                    <li><b>🖨️ PDF:</b> Genera un informe descargable e imprimible con exactamente lo que tienes visible en pantalla.</li>
                  </ul>
                </div>
              </div>

              <div style={styles.infoModalFooter}>
                <button onClick={() => setIsInfoModalOpen(false)} style={styles.infoModalBtn}>
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Panel de Filtros (slide-in desde la izquierda) */}
        {isFilterOpen && (
          <div style={stylesFilter.overlay} onClick={() => setIsFilterOpen(false)}>
            <div style={stylesFilter.panel} onClick={e => e.stopPropagation()}>
              {/* Cabecera panel */}
              <div style={stylesFilter.panelHeader}>
                <span style={stylesFilter.panelTitle}>🔍 Filtros de Categoría</span>
                <button onClick={() => setIsFilterOpen(false)} style={stylesFilter.panelClose}>
                  <X size={16} />
                </button>
              </div>

              {/* Botones todo/ninguno */}
              <div style={stylesFilter.panelActions}>
                <button onClick={selectAllFilters} style={stylesFilter.actionBtn}>✅ Todo</button>
                <button onClick={clearAllFilters} style={stylesFilter.actionBtn}>⬜ Ninguno</button>
              </div>

              {/* Categorías de puntos */}
              <div style={stylesFilter.sectionLabel}>PUNTOS DE INVENTARIO</div>
              {Object.keys(CATEGORY_MAP).map(parent => {
                const subcats = getSubcategoriesForParent(inventory, parent);
                const count = inventory.filter(i => getItemCategory(i) === parent).length;
                const isActive = visibleCategories.has(parent);
                const isExpanded = expandedParents.has(parent);
                return (
                  <div key={parent}>
                    <div style={stylesFilter.catRow}>
                      <label style={stylesFilter.catLabel}>
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => toggleParentCategory(parent)}
                          style={{ marginRight: 6 }}
                        />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: CATEGORY_COLORS[parent], display: 'inline-block', marginRight: 5 }} />
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.78rem' }}>{parent}</span>
                        <span style={stylesFilter.countBadge}>{count}</span>
                      </label>
                      {subcats.length > 0 && (
                        <button
                          onClick={() => setExpandedParents(prev => {
                            const next = new Set(prev);
                            if (next.has(parent)) next.delete(parent); else next.add(parent);
                            return next;
                          })}
                          style={stylesFilter.expandBtn}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      )}
                    </div>
                    {isExpanded && subcats.map(sub => {
                      const subCount = inventory.filter(i => (i.variety_type || i.category || i.tipo) === sub).length;
                      return (
                        <div key={sub} style={stylesFilter.subcatRow}>
                          <label style={stylesFilter.subcatLabel}>
                            <input
                              type="checkbox"
                              checked={visibleSubcats === null || visibleSubcats.has(sub)}
                              onChange={() => {
                                setVisibleSubcats(prev => {
                                  if (prev === null) {
                                    // Iniciamos selección explícita: todas menos esta
                                    const allSubs = new Set(inventory.map(i => i.variety_type || i.category || i.tipo).filter(Boolean));
                                    allSubs.delete(sub);
                                    return allSubs;
                                  }
                                  const next = new Set(prev);
                                  if (next.has(sub)) next.delete(sub); else next.add(sub);
                                  return next;
                                });
                              }}
                              style={{ marginRight: 6 }}
                            />
                            <span style={{ flex: 1, fontSize: '0.75rem' }}>{sub}</span>
                            <span style={stylesFilter.countBadge}>{subCount}</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Categorías de caminos y trazados */}
              <div style={{ ...stylesFilter.sectionLabel, marginTop: 12 }}>CAMINOS Y TRAZADOS</div>
              <div style={stylesFilter.catRow}>
                <label style={stylesFilter.catLabel}>
                  <input
                    type="checkbox"
                    checked={showPaths && visiblePathTypes.size > 0}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setShowPaths(checked);
                      if (checked) {
                        setVisiblePathTypes(new Set(PATH_TYPES));
                      } else {
                        setVisiblePathTypes(new Set());
                      }
                    }}
                    style={{ marginRight: 6, accentColor: '#f97316' }}
                  />
                  <span style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: '#f97316', display: 'inline-block', marginRight: 5 }} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem' }}>Todos los caminos ({paths.length})</span>
                  <span style={stylesFilter.countBadge}>{paths.length}</span>
                </label>
              </div>
              {PATH_TYPES.map(pt => {
                const count = paths.filter(p => (p.path_type || 'otro') === pt).length;
                const isChecked = showPaths && visiblePathTypes.has(pt);
                return (
                  <div key={pt} style={stylesFilter.subcatRow}>
                    <label style={stylesFilter.subcatLabel}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (!showPaths) setShowPaths(true);
                          togglePathType(pt);
                        }}
                        style={{ marginRight: 6 }}
                      />
                      <span style={{ width: 12, height: 3, borderRadius: 1, backgroundColor: PATH_TYPE_COLORS[pt] || '#64748b', display: 'inline-block', marginRight: 5 }} />
                      <span style={{ flex: 1, fontWeight: 500, fontSize: '0.75rem' }}>{PATH_TYPE_LABELS[pt]}</span>
                      <span style={stylesFilter.countBadge}>{count}</span>
                    </label>
                  </div>
                );
              })}

              {/* Categorías de Catastro Oficial */}
              <div style={{ ...stylesFilter.sectionLabel, marginTop: 14 }}>CATASTRO OFICIAL</div>
              <div style={stylesFilter.catRow}>
                <label style={stylesFilter.catLabel}>
                  <input
                    type="checkbox"
                    checked={showCatastro}
                    onChange={(e) => setShowCatastro(e.target.checked)}
                    style={{ marginRight: 6, accentColor: '#00979d' }}
                  />
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px dashed #00d1da', backgroundColor: 'rgba(0,151,157,0.18)', display: 'inline-block', marginRight: 6 }} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem' }}>Catastro (Parcelas 195 y 196)</span>
                  <span style={stylesFilter.countBadge}>
                    {(catastroJorox.parcels?.length || 0) + (catastroJorox.cotas?.length || 0)}
                  </span>
                </label>
              </div>

              {/* Sub-elementos informativos de Catastro */}
              {showCatastro && (
                <>
                  <div style={stylesFilter.subcatRow}>
                    <label style={stylesFilter.subcatLabel}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#00d1da', display: 'inline-block', marginRight: 6 }} />
                      <span style={{ flex: 1, fontSize: '0.74rem' }}>🏛️ Parcelas 195 y 196</span>
                      <span style={stylesFilter.countBadge}>{catastroJorox.parcels?.length || 2}</span>
                    </label>
                  </div>
                  <div style={stylesFilter.subcatRow}>
                    <label style={stylesFilter.subcatLabel}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ffffff', border: '1.5px solid #00979d', display: 'inline-block', marginRight: 6 }} />
                      <span style={{ flex: 1, fontSize: '0.74rem' }}>📍 Cotas catastrales</span>
                      <span style={stylesFilter.countBadge}>{catastroJorox.cotas?.length || 19}</span>
                    </label>
                  </div>
                  <div style={stylesFilter.subcatRow}>
                    <label style={stylesFilter.subcatLabel}>
                      <span style={{ width: 12, height: 2, borderTop: '2px dashed #94a3b8', display: 'inline-block', marginRight: 6 }} />
                      <span style={{ flex: 1, fontSize: '0.74rem' }}>〰️ Pistas catastrales</span>
                      <span style={stylesFilter.countBadge}>{catastroJorox.tracks?.length || 0}</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Módulo de Control por Chat IA Integrado en el Preview de Coordenada / Pin / Línea ── */}
        <div style={styles.mapIaControlWrapper}>
          {/* Contenedor único unificado: Información del pin + Módulo Chat IA abajo */}
          <div style={styles.selectedTargetCard}>
            {/* Fila Superior: Info del Pin y Botón Cerrar ✕ (solo si hay elemento seleccionado) */}
            {selectedTarget && (
              <>
                <div style={styles.targetHeaderRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {selectedTarget.photo_url ? (
                      <img
                        src={selectedTarget.photo_url}
                        alt="Foto pin"
                        style={styles.targetThumbnail}
                        onClick={() => window.open(selectedTarget.photo_url, '_blank')}
                        title="Ver foto completa"
                      />
                    ) : (
                      <div
                        style={{
                          ...styles.targetIconCircle,
                          backgroundColor:
                            selectedTarget.type === 'point'
                              ? (CATEGORY_COLORS[selectedTarget.category] || '#16a34a')
                              : selectedTarget.type === 'path'
                              ? (selectedTarget.color || '#f97316')
                              : '#00979d',
                        }}
                      >
                        {selectedTarget.type === 'point' ? (
                          <MapPin size={16} color="#ffffff" />
                        ) : selectedTarget.type === 'path' ? (
                          <Navigation size={15} color="#ffffff" />
                        ) : (
                          <Compass size={15} color="#ffffff" />
                        )}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={styles.targetTitle}>{selectedTarget.title}</span>
                        {selectedTarget.status && (
                          <span
                            style={{
                              ...styles.targetBadge,
                              backgroundColor:
                                selectedTarget.status === 'enfermo' || selectedTarget.status === 'seco'
                                  ? '#fee2e2'
                                  : selectedTarget.status === 'clorosis'
                                  ? '#fef3c7'
                                  : selectedTarget.status === 'poda_requerida'
                                  ? '#ffedd5'
                                  : '#dcfce7',
                              color:
                                selectedTarget.status === 'enfermo' || selectedTarget.status === 'seco'
                                  ? '#dc2626'
                                  : selectedTarget.status === 'clorosis'
                                  ? '#b45309'
                                  : selectedTarget.status === 'poda_requerida'
                                  ? '#c2410c'
                                  : '#15803d',
                            }}
                          >
                            {selectedTarget.status}
                          </span>
                        )}
                        {selectedTarget.variety && (
                          <span style={styles.targetSubtypeBadge}>{selectedTarget.variety}</span>
                        )}
                        {selectedTarget.subtitle && (
                          <span style={styles.targetSubtypeBadge}>{selectedTarget.subtitle}</span>
                        )}
                      </div>

                      <div style={styles.targetMetaRow}>
                        {selectedTarget.lat && selectedTarget.lng && (
                          <span>📍 {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}</span>
                        )}
                        {selectedTarget.length_meters && (
                          <span>📏 {Number(selectedTarget.length_meters).toFixed(0)} m</span>
                        )}
                        {selectedTarget.notes && (
                          <span style={styles.targetNotesText}>"{selectedTarget.notes}"</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Único botón superior derecho: Cerrar ✕ */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTarget(null);
                      setIsEditingTarget(false);
                    }}
                    style={styles.targetCloseBtn}
                    title="Cerrar ficha"
                    aria-label="Cerrar ficha"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Separador sutil */}
                <div style={{ height: 1, backgroundColor: '#f1f5f9', width: '100%', margin: '1px 0' }} />
              </>
            )}

              {/* Vista previa de fotografía o documento adjunto */}
              {pendingAttachment && (
                <div style={styles.pendingAttachmentCard}>
                  {pendingAttachment.isImage && pendingAttachment.dataUrl ? (
                    <img
                      src={pendingAttachment.dataUrl}
                      alt="Foto adjunta"
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={styles.pendingDocIcon}>
                      <FileText size={20} color="#00979d" />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={styles.pendingAttachmentName}>{pendingAttachment.name}</p>
                    <p style={styles.pendingAttachmentMeta}>
                      {(pendingAttachment.size / 1024).toFixed(1)} KB · {pendingAttachment.isImage ? 'Fotografía lista para vincular' : 'Documento listo'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    style={styles.targetCloseBtn}
                    title="Quitar archivo adjunto"
                    aria-label="Quitar archivo"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Banner de feedback de acciones ejecutadas */}
              {iaFeedback && (
                <div
                  style={{
                    ...styles.mapIaFeedbackBanner,
                    backgroundColor: iaFeedback.type === 'error' ? '#fef2f2' : iaFeedback.type === 'info' ? '#eff6ff' : '#f0fdf4',
                    borderColor: iaFeedback.type === 'error' ? '#fca5a5' : iaFeedback.type === 'info' ? '#93c5fd' : '#86efac',
                    color: iaFeedback.type === 'error' ? '#991b1b' : iaFeedback.type === 'info' ? '#1e40af' : '#166534',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    {isProcessingIa && <div style={styles.miniSpinner} />}
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{iaFeedback.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIaFeedback(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'inherit' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Módulo Chat IA integrado abajo */}
              <div style={styles.chatIaInputBar}>
                {/* Inputs ocultos para cámara y documentos */}
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,image/*,application/pdf"
                  onChange={handleDocumentChange}
                  style={{ display: 'none' }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraChange}
                  style={{ display: 'none' }}
                />

                {/* Botón (+) a la izquierda para adjuntar fotos o documentos */}
                <button
                  type="button"
                  style={{
                    ...styles.chatIaAttachBtn,
                    backgroundColor: pendingAttachment && !pendingAttachment.isImage ? '#00979d' : '#f1f5f9',
                    color: pendingAttachment && !pendingAttachment.isImage ? '#ffffff' : '#555555',
                  }}
                  onClick={handleAttachClick}
                  aria-label="Adjuntar archivo o documento (+)"
                  title="Adjuntar archivo o documento (+)"
                >
                  <Plus size={19} />
                </button>

                {/* Cápsula central (Idéntica a Chat IA) */}
                {pendingVoiceAudio && !isVoiceRecording ? (
                  <div style={styles.chatIaAudioPreviewCapsule}>
                    <button
                      type="button"
                      onClick={handleDiscardVoice}
                      style={styles.previewTrashBtn}
                      title="Descartar nota de voz"
                      aria-label="Descartar nota de voz"
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </button>

                    <button
                      type="button"
                      onClick={togglePlayPreview}
                      style={styles.previewPlayBtn}
                      title={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
                      aria-label={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
                    >
                      {isPreviewPlaying ? (
                        <Pause size={14} color="#ffffff" />
                      ) : (
                        <Play size={14} color="#ffffff" style={{ marginLeft: 2 }} />
                      )}
                    </button>

                    <div style={styles.previewTrackContainer}>
                      <input
                        type="range"
                        min={0}
                        max={previewDuration || pendingVoiceAudio.duration || 1}
                        step="0.05"
                        value={previewCurrentTime}
                        onChange={handleSeekPreview}
                        style={styles.previewSlider}
                        aria-label="Progreso del audio"
                      />
                      <div style={styles.previewTimeRow}>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                          {formatAudioTime(previewCurrentTime > 0 ? previewCurrentTime : (previewDuration || pendingVoiceAudio.duration))}
                        </span>
                        {pendingVoiceAudio.gpsTrack?.length > 0 && (
                          <span style={styles.previewGpsTag} title={`${pendingVoiceAudio.gpsTrack.length} lecturas GPS vinculadas`}>
                            📍 {pendingVoiceAudio.gpsTrack.length} pts GPS
                          </span>
                        )}
                      </div>
                    </div>

                    <audio
                      ref={previewAudioRef}
                      src={pendingVoiceAudio.dataUrl}
                      onTimeUpdate={(e) => setPreviewCurrentTime(e.target.currentTime)}
                      onLoadedMetadata={(e) => {
                        if (e.target.duration && !isNaN(e.target.duration) && isFinite(e.target.duration)) {
                          setPreviewDuration(Math.round(e.target.duration));
                        }
                      }}
                      onEnded={() => {
                        setIsPreviewPlaying(false);
                        setPreviewCurrentTime(0);
                      }}
                      style={{ display: 'none' }}
                    />
                  </div>
                ) : isVoiceRecording ? (
                  <div style={styles.chatIaRecordingCapsule}>
                    <span style={styles.pulsingRedDot} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                      {formatAudioTime(voiceRecordingSeconds)}
                    </span>
                    {voiceCurrentGps ? (
                      <span style={styles.previewGpsTagActive}>
                        📍 ±{voiceCurrentGps.accuracy?.toFixed(1)}m
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                        📍 Conectando GPS...
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleCancelVoiceRecording}
                      style={styles.previewTrashBtn}
                      title="Cancelar grabación"
                      aria-label="Cancelar grabación"
                    >
                      <Trash2 size={16} color="#64748b" />
                    </button>
                  </div>
                ) : (
                  <div style={styles.chatIaInputCapsule}>
                    <textarea
                      rows={1}
                      value={mapIaInput}
                      onChange={(e) => {
                        setMapIaInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMapIaOrder();
                        }
                      }}
                      placeholder={
                        selectedTarget?.type === 'coord'
                          ? 'Nombrar punto o hablar con IA (ej: "Mi casa", "Arqueta")...'
                          : selectedTarget?.type === 'point'
                          ? `Nota o cambio para ${selectedTarget.title}...`
                          : selectedTarget?.type === 'path'
                          ? `Nota o cambio para ${selectedTarget.title}...`
                          : 'Toca el mapa para ubicar o habla aquí con IA...'
                      }
                      style={styles.chatIaTextInput}
                      disabled={isProcessingIa}
                    />

                    {/* Icono de Cámara dentro de la cápsula a la derecha */}
                    <button
                      type="button"
                      style={{
                        ...styles.capsuleCameraBtn,
                        backgroundColor: pendingAttachment?.isImage ? '#00979d' : 'transparent',
                        color: pendingAttachment?.isImage ? '#ffffff' : '#64748b',
                      }}
                      onClick={handleCameraClick}
                      aria-label="Tomar foto con la cámara"
                      title="Tomar foto con la cámara"
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                )}

                {/* Botón de Acción a la derecha (estilo WhatsApp) */}
                {isVoiceRecording ? (
                  <button
                    type="button"
                    onClick={handleStopVoiceRecording}
                    style={{
                      ...styles.chatIaActionBtn,
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
                    }}
                    title="Detener grabación y revisar audio"
                    aria-label="Detener grabación"
                  >
                    <StopCircle size={19} />
                  </button>
                ) : (mapIaInput.trim() || pendingVoiceAudio || pendingAttachment) ? (
                  <button
                    type="button"
                    onClick={handleSendMapIaOrder}
                    disabled={isProcessingIa}
                    style={{
                      ...styles.chatIaActionBtn,
                      backgroundColor: '#00979d',
                      color: '#ffffff',
                      opacity: isProcessingIa ? 0.7 : 1,
                    }}
                    title="Enviar orden a la IA"
                    aria-label="Enviar orden"
                  >
                    {isProcessingIa ? <div style={styles.miniWhiteSpinner} /> : <Send size={17} />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceTracking}
                    disabled={isProcessingIa}
                    style={{
                      ...styles.chatIaActionBtn,
                      backgroundColor: '#00979d',
                      color: '#ffffff',
                    }}
                    title={
                      selectedTarget
                        ? `Hablar orden por voz para ${selectedTarget.title}`
                        : 'Hablar orden por voz con telemetría GPS'
                    }
                    aria-label="Hablar orden por voz"
                  >
                    <Mic size={19} />
                  </button>
                )}

                {/* Botón de Retroceder Cambios (Deshacer) */}
                <button
                  type="button"
                  onClick={handleUndoMapAction}
                  disabled={undoStack.length === 0 || isProcessingIa}
                  style={{
                    ...styles.chatIaActionBtn,
                    backgroundColor: undoStack.length > 0 ? '#334155' : '#f1f5f9',
                    color: undoStack.length > 0 ? '#ffffff' : '#94a3b8',
                    cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: undoStack.length === 0 ? 0.45 : 1,
                  }}
                  title={
                    undoStack.length > 0
                      ? `Retroceder cambios: ${undoStack[undoStack.length - 1].description} (${undoStack.length} en historial)`
                      : 'No hay cambios recientes para retroceder'
                  }
                  aria-label="Retroceder cambios en el mapa"
                >
                  <Undo2 size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* ── Modal para Guardar Nuevo Camino Trazado ──────────────────────────── */}
      {showSaveModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: newPathData.color }} />
                <h3 style={styles.modalTitle}>Guardar Camino / Sendero</h3>
              </div>
              <button onClick={() => setShowSaveModal(false)} style={styles.modalCloseBtn}>
                <X size={15} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.metricsBox}>
                <span>
                  Vértices marcados: <b>{drawPoints.length}</b>
                </span>
                <span>
                  Longitud calculada: <b>{liveDrawDistance.toFixed(1)} metros</b>
                </span>
              </div>

              <div>
                <label style={styles.fieldLabel}>Nombre del camino o sendero *</label>
                <input
                  type="text"
                  placeholder="Ej: Sendero del Aguacate, Camino Entrada..."
                  value={newPathData.name}
                  onChange={(e) => setNewPathData({ ...newPathData, name: e.target.value })}
                  style={styles.inputField}
                  autoFocus
                />
              </div>

              <div>
                <label style={styles.fieldLabel}>Tipo de trazado</label>
                <select
                  value={newPathData.path_type}
                  onChange={(e) => setNewPathData({ ...newPathData, path_type: e.target.value })}
                  style={styles.selectField}
                >
                  <option value="sendero">Sendero peatonal / de a pie</option>
                  <option value="camino">Camino principal / tractor</option>
                  <option value="linea_riego">Línea de riego / Tubería</option>
                  <option value="acequia">Acequia / Caudal de agua</option>
                  <option value="linde">Linde o delimitación</option>
                  <option value="otro">Otro trazado</option>
                </select>
              </div>

              <div>
                <label style={styles.fieldLabel}>Color de visualización en el mapa</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewPathData({ ...newPathData, color: c.hex })}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        backgroundColor: c.hex,
                        border: newPathData.color === c.hex ? '2.5px solid #0f172a' : '2px solid #ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label style={styles.fieldLabel}>Grosor de línea ({newPathData.stroke_width}px)</label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={newPathData.stroke_width}
                  onChange={(e) => setNewPathData({ ...newPathData, stroke_width: Number(e.target.value) })}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={styles.fieldLabel}>Notas u observaciones</label>
                <textarea
                  placeholder="Detalles sobre firme, pendiente, tipo de manguera..."
                  value={newPathData.notes}
                  onChange={(e) => setNewPathData({ ...newPathData, notes: e.target.value })}
                  style={{ ...styles.inputField, height: 60, resize: 'none' }}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowSaveModal(false)} style={styles.cancelBtn}>
                Cancelar
              </button>
              <button onClick={handleSaveDrawnPath} style={styles.submitBtn}>
                Guardar en Campito Jorox
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Estilos en línea limpios y adaptables ─────────────────────────────────────
const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: 460,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
    position: 'relative',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: 8,
    zIndex: 10,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  titleBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  iconBtn: {
    padding: '6px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  drawStartBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    backgroundColor: '#f97316',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(249, 115, 22, 0.3)',
  },
  drawCancelBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  gpsConvertBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  mapContainer: {
    position: 'relative',
    flex: 1,
    minHeight: 380,
    width: '100%',
    backgroundColor: '#0f172a',
  },
  leafletMap: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  drawingBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(6px)',
    border: '1px solid #f97316',
    borderRadius: 8,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    flexWrap: 'wrap',
    gap: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#f97316',
    boxShadow: '0 0 0 4px rgba(249, 115, 22, 0.3)',
  },
  drawActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 9px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    fontSize: '0.73rem',
    cursor: 'pointer',
  },
  legendBox: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(4px)',
    borderRadius: 8,
    padding: '6px 10px',
    zIndex: 900,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    border: '1px solid #e2e8f0',
    maxWidth: 260,
  },
  legendTitle: {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: '#475569',
    display: 'block',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  legendGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '3px 8px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: '0.68rem',
    color: '#1e293b',
    fontWeight: 500,
  },
  colorCircle: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    border: '1px solid #ffffff',
  },
  colorLine: {
    width: 12,
    height: 3,
    borderRadius: 1,
  },
  infoCard: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 270,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
    border: '1px solid #cbd5e1',
    zIndex: 1000,
    overflow: 'hidden',
  },
  infoCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  cardCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 2,
    display: 'flex',
  },
  infoCardBody: {
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.73rem',
    gap: 8,
  },
  infoLabel: {
    color: '#64748b',
    fontWeight: 500,
  },
  infoVal: {
    color: '#1e293b',
    textAlign: 'right',
  },
  infoCardFooter: {
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  cardLinkBtn: {
    fontSize: '0.7rem',
    color: '#00979d',
    textDecoration: 'none',
    fontWeight: 600,
  },
  cardEditBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: 5,
    fontSize: '0.68rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  cardDeleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: 5,
    fontSize: '0.68rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  bottomBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: 6,
    zIndex: 10,
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: '0.71rem',
    fontWeight: 600,
    color: '#1e293b',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 2000,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  modalTitle: {
    margin: 0,
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  modalBody: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  metricsBox: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    fontSize: '0.76rem',
    color: '#166534',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#334155',
    marginBottom: 4,
  },
  inputField: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    fontSize: '0.8rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  selectField: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    fontSize: '0.8rem',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
  },
  cancelBtn: {
    padding: '8px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '8px 16px',
    backgroundColor: '#00979d',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#ffffff',
    cursor: 'pointer',
  },
  cancelSmallBtn: {
    flex: 1,
    padding: '6px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 5,
    fontSize: '0.72rem',
    cursor: 'pointer',
  },
  saveSmallBtn: {
    flex: 1,
    padding: '6px',
    backgroundColor: '#00979d',
    color: '#ffffff',
    border: 'none',
    borderRadius: 5,
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  topBarClean: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 10px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    gap: 8,
    zIndex: 10,
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  topBarIconBtn: {
    background: 'none',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#475569',
    borderRadius: '50%',
    transition: 'color 0.15s ease, transform 0.1s ease',
  },
  iconTextBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    fontSize: '0.74rem',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    color: '#334155',
  },
  layersDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 250,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 1500,
  },
  layersDropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottom: '1px solid #e2e8f0',
  },
  layersDropdownTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  layerCheckboxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.76rem',
    color: '#1e293b',
    cursor: 'pointer',
    userSelect: 'none',
  },
  layerCheckboxLabel: {
    fontWeight: 500,
    fontSize: '0.75rem',
  },
  navWidget: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
    border: '1px solid #cbd5e1',
    zIndex: 850,
    overflow: 'hidden',
  },
  navWidgetBtn: {
    width: 38,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ffffff',
    border: 'none',
    color: '#334155',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  navWidgetDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    width: '100%',
  },
  infoModalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  infoModalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  infoModalIconBadge: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoModalTitle: {
    margin: 0,
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  infoModalSubtitle: {
    margin: 0,
    fontSize: '0.72rem',
    color: '#64748b',
  },
  infoModalBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflowY: 'auto',
  },
  infoBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  infoBlockHighlight: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    backgroundColor: '#f0fdfa',
    border: '1px solid #99f6e4',
    borderRadius: 8,
  },
  infoBlockTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 700,
    fontSize: '0.82rem',
    color: '#0f172a',
  },
  infoBlockText: {
    margin: 0,
    fontSize: '0.76rem',
    color: '#334155',
    lineHeight: 1.5,
  },
  infoList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: '0.75rem',
    color: '#334155',
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  exampleBubble: {
    margin: '3px 0 2px 0',
    padding: '4px 8px',
    backgroundColor: '#ffffff',
    border: '1px dashed #00979d',
    borderRadius: 4,
    fontSize: '0.72rem',
    color: '#0f766e',
    fontStyle: 'italic',
  },
  infoModalFooter: {
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  infoModalBtn: {
    padding: '8px 20px',
    backgroundColor: '#00979d',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  },

  // ─── Estilos del Módulo de Control por Chat IA en el Mapa ───
  mapIaControlWrapper: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    maxWidth: 820,
    margin: '0 auto',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'auto',
  },
  mapIaFeedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(8px)',
  },
  selectedTargetCard: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(12px)',
    borderRadius: 16,
    border: '1.5px solid #00979d',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
    gap: 10,
  },
  targetHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  targetThumbnail: {
    width: 44,
    height: 44,
    minWidth: 44,
    borderRadius: 8,
    objectFit: 'cover',
    border: '1px solid #cbd5e1',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  targetIconCircle: {
    width: 38,
    height: 38,
    minWidth: 38,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
  },
  targetTitle: {
    fontWeight: 700,
    fontSize: '0.85rem',
    color: '#0f172a',
  },
  targetBadge: {
    fontSize: '0.67rem',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  targetSubtypeBadge: {
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
  },
  targetMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.71rem',
    color: '#64748b',
    flexWrap: 'wrap',
  },
  targetNotesText: {
    fontStyle: 'italic',
    color: '#475569',
    maxWidth: 240,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  targetCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'color 0.15s ease',
  },
  pendingAttachmentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    backgroundColor: 'rgba(240, 253, 250, 0.98)',
    backdropFilter: 'blur(8px)',
    borderRadius: 12,
    border: '1px solid #99f6e4',
    boxShadow: '0 4px 12px rgba(0, 151, 157, 0.12)',
  },
  pendingDocIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingAttachmentName: {
    margin: 0,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#0f172a',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
  },
  pendingAttachmentMeta: {
    margin: 0,
    fontSize: '0.68rem',
    color: '#0f766e',
  },
  chatIaInputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    position: 'relative',
  },
  chatIaAttachBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: '50%',
    border: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaInputCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    border: '1px solid #cbd5e1',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    padding: '0 8px 0 16px',
    overflow: 'hidden',
    transition: 'border-color 0.15s ease',
  },
  chatIaTextInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontSize: '0.88rem',
    color: '#1e293b',
    resize: 'none',
    padding: '10px 0',
    fontFamily: 'inherit',
    lineHeight: '20px',
    maxHeight: 80,
  },
  capsuleCameraBtn: {
    width: 32,
    height: 32,
    minWidth: 32,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaActionBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 151, 157, 0.35)',
    flexShrink: 0,
    transition: 'transform 0.1s ease',
  },
  chatIaAudioPreviewCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    border: '1px solid #00979d',
    padding: '0 12px',
    gap: 10,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
  previewTrashBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  previewTrackContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 2,
  },
  previewSlider: {
    width: '100%',
    height: 4,
    cursor: 'pointer',
    accentColor: '#00979d',
  },
  previewTimeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewGpsTag: {
    fontSize: '0.65rem',
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    padding: '1px 6px',
    borderRadius: 8,
    fontWeight: 600,
  },
  chatIaRecordingCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    border: '1.5px solid #ef4444',
    padding: '0 14px',
    gap: 10,
    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
  },
  previewGpsTagActive: {
    fontSize: '0.7rem',
    color: '#047857',
    backgroundColor: '#d1fae5',
    padding: '2px 8px',
    borderRadius: 12,
    fontWeight: 600,
    marginLeft: 'auto',
  },
  pulsingRedDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    display: 'inline-block',
  },
  miniSpinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid rgba(0,151,157,0.2)',
    borderTop: '2px solid #00979d',
    animation: 'spin 1s linear infinite',
  },
  miniWhiteSpinner: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #ffffff',
    animation: 'spin 1s linear infinite',
  },
};

// ─── Estilos para modo página fullscreen ───────────────────────────────────────
const stylesPage = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    position: 'relative',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    backgroundColor: 'rgba(248,250,252,0.97)',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: 6,
    zIndex: 10,
  },
};

// ─── Estilos para buscador y panel de filtros ──────────────────────────────────
const stylesFilter = {
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    flex: 1,
    minWidth: 100,
    maxWidth: 240,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '0.76rem',
    flex: 1,
    backgroundColor: 'transparent',
    color: '#1e293b',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 1500,
    display: 'flex',
    alignItems: 'stretch',
  },
  panel: {
    width: 260,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    boxShadow: '4px 0 20px rgba(0,0,0,0.25)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  panelTitle: {
    fontWeight: 700,
    fontSize: '0.82rem',
    color: '#0f172a',
  },
  panelClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#64748b',
    display: 'flex',
  },
  panelActions: {
    display: 'flex',
    gap: 6,
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
  },
  actionBtn: {
    flex: 1,
    padding: '5px 6px',
    fontSize: '0.72rem',
    fontWeight: 600,
    border: '1px solid #cbd5e1',
    borderRadius: 5,
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    color: '#475569',
  },
  sectionLabel: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.08em',
    padding: '8px 12px 4px',
    textTransform: 'uppercase',
  },
  catRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px',
  },
  catLabel: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    cursor: 'pointer',
    gap: 0,
    fontSize: '0.78rem',
    color: '#1e293b',
  },
  subcatRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 12px 3px 28px',
    backgroundColor: '#f8fafc',
    borderLeft: '2px solid #e2e8f0',
    marginLeft: 12,
  },
  subcatLabel: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    cursor: 'pointer',
    gap: 0,
    fontSize: '0.74rem',
    color: '#475569',
  },
  countBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: '1px 6px',
    marginLeft: 4,
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#64748b',
    padding: 2,
    display: 'flex',
  },
};

