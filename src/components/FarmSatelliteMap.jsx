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
  Loader2,
  Route
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker, setGlobalLastKnownGps } from '../hooks/useVoiceGeoTracker';
import {
  getLocalInventory,
  getLocalPaths,
  insertFarmInventoryItem,
  updateFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  updateFarmPath,
  deleteFarmPath,
  BASE_CATEGORY_MAP,
  BASE_CATEGORY_COLORS,
  DYNAMIC_PALETTE,
  getCategoryColor,
  PATH_TYPE_COLORS,
  getItemCategory,
  getSubcategoriesForParent,
} from '../services/farmInventoryStorage';
import {
  callGeminiForInventoryAction,
  executeInventoryActions,
  parseStructuredCommands,
} from '../services/mapIaOrchestrator';
import { interpolateGpsAtAudioTime } from '../utils/geoAudioInterpolation';
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

// ─── Sistema Dinámico de Categorías y Filtros (Centralizado) ─────────────────
const CATEGORY_MAP = BASE_CATEGORY_MAP;
const CATEGORY_COLORS = BASE_CATEGORY_COLORS;

/**
 * Adaptador de compatibilidad para comandos estructurados
 */
export const parseRegisterPointsCommands = (rawText) => parseStructuredCommands(rawText).points;

// Tipos de camino para filtros
const PATH_TYPES = ['camino', 'carril', 'sendero', 'vereda', 'acequia', 'linea_riego', 'linde', 'otro'];
const PATH_TYPE_LABELS = {
  'camino': 'Caminos',
  'carril': 'Carriles',
  'sendero': 'Senderos',
  'vereda': 'Veredas',
  'acequia': 'Acequias',
  'linea_riego': 'Líneas de Riego',
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

// Determinación del color del punto (sin iconos) — usa sistema de categorías dinámico
function getPointColor(item) {
  const status = (item.status || item.estado || '').toLowerCase();
  if (status === 'enfermo' || status === 'seco' || status === 'muerto') return '#ef4444'; // Rojo
  if (status === 'clorosis') return '#eab308'; // Amarillo clorosis
  if (status === 'poda_requerida') return '#f97316'; // Naranja poda

  const parent = getItemCategory(item);
  return getCategoryColor(parent);
}

// ─── Arquitectura Familiar de Pines (Mismas Dimensiones y Comportamientos) ───
function getPinFamilySlug(item) {
  const parent = getItemCategory(item);
  switch (parent) {
    case 'Casas / Edificios':
    case 'Edificios':
      return 'edificio';
    case 'Árboles':
      return 'arbol';
    case 'Plantas':
      return 'planta';
    case 'Herramientas':
      return 'herramienta';
    case 'Riego / Agua':
      return 'riego';
    case 'Hitos':
      return 'hito';
    default:
      return 'otros';
  }
}

function getPinStatusSlug(item) {
  const status = (item.status || item.estado || '').toLowerCase().trim();
  if (['enfermo', 'seco', 'muerto'].includes(status)) return 'enfermo';
  if (status === 'clorosis') return 'clorosis';
  if (['poda_requerida', 'poda'].includes(status)) return 'poda_requerida';
  return 'saludable';
}

/**
 * Generador de Icono DivIcon para todos los puntos de inventario.
 * Garantiza idénticas dimensiones físicas (38px touch box, 20px cuerpo visible,
 * núcleo blanco reflectante de 6px y borde blanco de 2.5px),
 * con diferenciación cromática gestionada estrictamente mediante clases CSS y colores dinámicos por categoría.
 */
function createFamilyPinIcon({ item, isSelected = false, hasWarning = false }) {
  const parentCat = getItemCategory(item);
  const catColor = getCategoryColor(parentCat);
  const familySlug = getPinFamilySlug(item);
  const statusSlug = getPinStatusSlug(item);
  const selectedClass = isSelected ? 'is-selected' : '';
  const warningClass = hasWarning ? 'has-warning' : '';

  return L.divIcon({
    className: 'farm-pin-div-wrapper',
    html: `
      <div class="farm-pin-container ${selectedClass} ${warningClass}">
        <div class="farm-pin farm-pin--family-${familySlug} farm-pin--status-${statusSlug}">
          <div class="farm-pin__halo" style="background-color: ${catColor};"></div>
          <div class="farm-pin__body" style="background-color: ${catColor};">
            <div class="farm-pin__core"></div>
          </div>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    tooltipAnchor: [0, -16],
  });
}

/**
 * Generador de Icono DivIcon para Cotas Catastrales Oficiales.
 * Comparte exactamente las mismas dimensiones y estructura familiar que los demás pines.
 */
function createCotaPinIcon({ isSelected = false }) {
  const selectedClass = isSelected ? 'is-selected' : '';
  return L.divIcon({
    className: 'farm-pin-div-wrapper',
    html: `
      <div class="farm-pin-container ${selectedClass}">
        <div class="farm-pin farm-pin--family-hito farm-pin--cota">
          <div class="farm-pin__halo"></div>
          <div class="farm-pin__body">
            <div class="farm-pin__core"></div>
          </div>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    tooltipAnchor: [0, -16],
  });
}

/**
 * Detector robusto de intención de borrado en órdenes de voz o texto
 */
function isDeleteIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();
  const deleteKeywords = [
    'borrar', 'eliminar', 'quitar', 'suprimir', 'borra', 'elimina',
    'quita', 'borralo', 'bórralo', 'eliminalo', 'elimínalo', 'quitalo',
    'quítalo', 'delete', 'remove'
  ];
  return deleteKeywords.some((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(lower);
  });
}

/**
 * Conector unificado con el Orquestador IA de Cartografía e Inventario
 */
const callGeminiForMapAction = callGeminiForInventoryAction;

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
  searchQuery: propSearchQuery,
  onSearchChange,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const pathsLayerRef = useRef(null);
  const pathNodesLayerRef = useRef(null);
  const drawingLayerRef = useRef(null);
  const catastroLayerRef = useRef(null);
  const navigate = isPageMode ? useNavigate() : () => null;

  // ─── Estados locales optimistas (0ms latency, respuesta inmediata en mapa) ──
  const [localInventory, setLocalInventory] = useState(() => {
    if (Array.isArray(inventory) && inventory.length > 0) return inventory;
    return getLocalInventory();
  });
  const [localPaths, setLocalPaths] = useState(() => {
    if (Array.isArray(paths) && paths.length > 0) return paths;
    return getLocalPaths();
  });

  useEffect(() => {
    if (Array.isArray(inventory) && inventory.length > 0) {
      setLocalInventory(inventory);
    } else {
      setLocalInventory(getLocalInventory());
    }
  }, [inventory]);

  useEffect(() => {
    if (Array.isArray(paths) && paths.length > 0) {
      setLocalPaths(paths);
    } else {
      setLocalPaths(getLocalPaths());
    }
  }, [paths]);

  // Escucha activa de sincronización de inventario emitida por Chat IA o herramientas de voz
  useEffect(() => {
    const handleInvUpdated = (e) => {
      if (e?.detail) {
        if (e.detail.deleted && e.detail.id) {
          setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(e.detail.id)));
        } else {
          setLocalInventory((prev) => [e.detail, ...prev.filter((i) => String(i.id) !== String(e.detail.id))]);
        }
      } else {
        setLocalInventory(getLocalInventory());
      }
    };
    window.addEventListener('farm-inventory-updated', handleInvUpdated);
    return () => window.removeEventListener('farm-inventory-updated', handleInvUpdated);
  }, []);

  // ─── Descubrimiento Dinámico de Categorías (Base + Nuevas Creadas por IA/Usuario) ──
  const allCategories = useMemo(() => {
    const baseOrder = ['Árboles', 'Plantas', 'Riego / Agua', 'Casas / Edificios', 'Herramientas', 'Hitos'];
    const found = new Set(baseOrder);

    (localInventory || []).forEach((item) => {
      const cat = getItemCategory(item);
      if (cat && cat !== 'Otros') found.add(cat);
    });

    found.add('Otros');
    return Array.from(found);
  }, [localInventory]);

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
  const [liveUserGps, setLiveUserGps] = useState(null);
  const liveUserGpsRef = useRef(null);
  const [gpsStatus, setGpsStatus] = useState('searching'); // 'searching' | 'active' | 'denied' | 'weak' | 'unsupported'
  const userLocationLayerRef = useRef(null);

  // ─── Estados de búsqueda y filtros ───────────────────────────────────────────
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchChange || setInternalSearchQuery;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // visibleCategories: Set de categorías activas (base y dinámicas)
  const [visibleCategories, setVisibleCategories] = useState(() => {
    const all = new Set(Object.keys(BASE_CATEGORY_MAP));
    if (initialMapSettings?.visibleCategories && Array.isArray(initialMapSettings.visibleCategories)) {
      const saved = new Set(initialMapSettings.visibleCategories);
      if (saved.has('Edificios')) saved.add('Casas / Edificios');
      saved.add('Casas / Edificios');
      return saved;
    }
    return all;
  });

  // Auto-activar nuevas categorías dinámicas en visibleCategories para que NUNCA queden invisibles
  useEffect(() => {
    setVisibleCategories((prev) => {
      let changed = false;
      const next = new Set(prev);
      allCategories.forEach((cat) => {
        if (!next.has(cat)) {
          next.add(cat);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allCategories]);
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
    return localInventory.filter(item => {
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
  }, [localInventory, searchQuery, visibleCategories, visibleSubcats]);

  const filteredPaths = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return localPaths.filter(path => {
      if (q) {
        const searchable = [path.name, path.path_type, path.notes].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      const pt = path.path_type || 'otro';
      return visiblePathTypes.has(pt);
    });
  }, [localPaths, searchQuery, visiblePathTypes]);

  // Auto-enfocar en el mapa cuando hay una búsqueda activa
  useEffect(() => {
    const q = (searchQuery || '').trim();
    if (!q || !mapInstanceRef.current) return;

    if (filteredInventory.length === 1) {
      const item = filteredInventory[0];
      const lat = item.latitude || (item.coordenadas && item.coordenadas.lat);
      const lng = item.longitude || (item.coordenadas && item.coordenadas.lng);
      if (lat && lng) {
        mapInstanceRef.current.setView([lat, lng], 19, { animate: true });
      }
    } else if (filteredInventory.length > 1) {
      const coords = filteredInventory
        .map((i) => [i.latitude || i.coordenadas?.lat, i.longitude || i.coordenadas?.lng])
        .filter(([lat, lng]) => lat && lng);
      if (coords.length > 0) {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: true });
        }
      }
    } else if (filteredPaths.length === 1) {
      const coords = filteredPaths[0].coordinates;
      if (Array.isArray(coords) && coords.length > 0) {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: true });
        }
      }
    }
  }, [searchQuery, filteredInventory, filteredPaths]);

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

    // Crear paneles dedicados con z-index explícito para garantizar que los pines siempre queden sobre polígonos
    if (!map.getPane('highlightPane')) {
      const hlPane = map.createPane('highlightPane');
      hlPane.style.zIndex = '610';
      hlPane.style.pointerEvents = 'none';
    }
    if (!map.getPane('inventoryMarkersPane')) {
      const markersPane = map.createPane('inventoryMarkersPane');
      markersPane.style.zIndex = '620';
    }

    // Crear grupos de capas vectoriales
    catastroLayerRef.current = L.featureGroup().addTo(map);
    pathsLayerRef.current = L.featureGroup().addTo(map);
    pathNodesLayerRef.current = L.featureGroup().addTo(map);
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
        radius: 16,
        color: '#00d1da',
        weight: 3,
        fillColor: '#00979d',
        fillOpacity: 0.25,
        dashArray: '3, 4',
        pane: 'highlightPane',
        interactive: false,
      }).addTo(layer);

      // Círculo centro blanco
      L.circleMarker([selectedTarget.lat, selectedTarget.lng], {
        radius: 4,
        color: '#ffffff',
        weight: 2,
        fillColor: '#00d1da',
        fillOpacity: 1,
        pane: 'highlightPane',
        interactive: false,
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

  // ─── 4. Renderizado de Puntos de Inventario (Estructura Familiar Unificada y CSS) ─
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showPoints) return;

    filteredInventory.forEach((item) => {
      const lat = item.latitude || (item.coordenadas && item.coordenadas.lat);
      const lng = item.longitude || (item.coordenadas && item.coordenadas.lng);
      if (!lat || !lng) return;

      const hasWarning = Boolean(item.gps_warning || item.advertencia_gps);
      const isSelected = selectedTarget && String(selectedTarget.id) === String(item.id);
      const familySlug = getPinFamilySlug(item);
      const statusSlug = getPinStatusSlug(item);

      const onSelect = (e) => {
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
      };

      // Marcador unificado DivIcon (mismas dimensiones, estructura familiar y colores por CSS)
      const pinIcon = createFamilyPinIcon({ item, isSelected, hasWarning });
      const marker = L.marker([lat, lng], {
        icon: pinIcon,
        pane: 'inventoryMarkersPane',
        interactive: true,
        zIndexOffset: isSelected ? 1000 : 100,
      });

      marker.on('click', onSelect);

      // Tooltip informativo estructurado
      const parentCat = getItemCategory(item);
      const catColor = getCategoryColor(parentCat);
      const tooltipHtml = `
        <div class="farm-pin-tooltip">
          <span class="farm-pin-tooltip__badge farm-pin-tooltip__badge--${familySlug}" style="background-color: ${catColor}; color: #ffffff;">${parentCat}</span>
          <span class="farm-pin-tooltip__title">${item.name || item.tipo || 'Punto'}</span>
          ${item.variety_type ? `<span class="farm-pin-tooltip__sub">${item.variety_type}</span>` : ''}
          ${item.status ? `<span class="farm-pin-tooltip__status farm-pin-tooltip__status--${statusSlug}">${item.status}</span>` : ''}
        </div>
      `;
      marker.bindTooltip(tooltipHtml, {
        direction: 'top',
        offset: [0, -14],
        className: 'campito-map-tooltip',
      });

      marker.addTo(layer);
    });
  }, [filteredInventory, showPoints, selectedTarget]);

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

  // ─── 5a. Nodos Interactivos y Editables del Recorrido Seleccionado ────────────
  useEffect(() => {
    const layer = pathNodesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedTarget) return;

    let activePath = null;
    let selectedNodeIdx = null;

    if (selectedTarget.type === 'path') {
      activePath = localPaths.find((p) => String(p.id) === String(selectedTarget.id)) || selectedTarget.raw;
    } else if (selectedTarget.type === 'node') {
      activePath = localPaths.find((p) => String(p.id) === String(selectedTarget.pathId)) || selectedTarget.raw;
      selectedNodeIdx = selectedTarget.nodeIndex;
    }

    if (!activePath || !Array.isArray(activePath.coordinates) || activePath.coordinates.length < 2) {
      return;
    }

    const coords = activePath.coordinates;
    const pathColor = activePath.color || PATH_TYPE_COLORS[activePath.path_type] || '#f97316';

    coords.forEach((coord, idx) => {
      const isSelected = selectedNodeIdx === idx;
      const nodeIcon = L.divIcon({
        className: 'farm-path-node-marker',
        html: `<div style="
          width: ${isSelected ? 20 : 14}px;
          height: ${isSelected ? 20 : 14}px;
          border-radius: 50%;
          background-color: ${isSelected ? '#00979d' : '#ffffff'};
          border: 2.5px solid ${pathColor};
          box-shadow: 0 1px 6px rgba(0,0,0,0.4);
          cursor: grab;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${isSelected ? '#ffffff' : '#475569'};
          font-size: 8px;
          font-weight: 700;
          user-select: none;
        ">${idx + 1}</div>`,
        iconSize: [isSelected ? 20 : 14, isSelected ? 20 : 14],
        iconAnchor: [isSelected ? 10 : 7, isSelected ? 10 : 7],
      });

      const marker = L.marker([coord.lat, coord.lng], {
        icon: nodeIcon,
        draggable: true,
        zIndexOffset: isSelected ? 2000 : 800,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) e.originalEvent.stopPropagation();
        lastLayerClickedTimeRef.current = Date.now();
        setSelectedTarget({
          type: 'node',
          id: `${activePath.id}-node-${idx}`,
          pathId: activePath.id,
          pathName: activePath.name || 'Recorrido',
          pathType: activePath.path_type || 'sendero',
          nodeIndex: idx,
          totalNodes: coords.length,
          lat: coord.lat,
          lng: coord.lng,
          color: pathColor,
          raw: activePath,
        });
      });

      marker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        const updated = coords.map((c, i) =>
          i === idx ? { lat: Number(newPos.lat.toFixed(6)), lng: Number(newPos.lng.toFixed(6)) } : c
        );
        if (highlightLayerRef.current) {
          highlightLayerRef.current.clearLayers();
          L.polyline(updated.map((c) => [c.lat, c.lng]), {
            color: pathColor,
            weight: 5,
            opacity: 0.9,
            dashArray: '4, 4',
          }).addTo(highlightLayerRef.current);
        }
      });

      marker.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        const updated = coords.map((c, i) =>
          i === idx ? { lat: Number(newPos.lat.toFixed(6)), lng: Number(newPos.lng.toFixed(6)) } : c
        );
        const newLength = calculatePathMeters(updated);

        setLocalPaths((prev) =>
          prev.map((p) =>
            String(p.id) === String(activePath.id)
              ? { ...p, coordinates: updated, length_meters: newLength }
              : p
          )
        );
        await updateFarmPath(activePath.id, { coordinates: updated, length_meters: newLength });

        if (selectedTarget?.type === 'node' && selectedTarget.nodeIndex === idx) {
          setSelectedTarget((prev) => ({
            ...prev,
            lat: Number(newPos.lat.toFixed(6)),
            lng: Number(newPos.lng.toFixed(6)),
          }));
        } else if (selectedTarget?.type === 'path') {
          setSelectedTarget((prev) => ({
            ...prev,
            coordinates: updated,
            length_meters: newLength,
          }));
        }
        if (onReloadPaths) onReloadPaths();
      });

      marker.addTo(layer);
    });
  }, [selectedTarget, localPaths, onReloadPaths]);

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

    // 2. Cotas Catastrales (mojones y vértices oficiales en la misma arquitectura familiar)
    (catastroJorox.cotas || []).forEach((cota) => {
      const isSelected = selectedTarget && String(selectedTarget.id) === `cota-${cota.name}`;
      const onSelectCota = (e) => {
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
      };

      const cotaIcon = createCotaPinIcon({ isSelected });
      const marker = L.marker([cota.lat, cota.lng], {
        icon: cotaIcon,
        pane: 'inventoryMarkersPane',
        interactive: true,
        zIndexOffset: isSelected ? 1000 : 80,
      });

      marker.bindTooltip(
        `<div class="farm-pin-tooltip">
          <span class="farm-pin-tooltip__badge farm-pin-tooltip__badge--hito">Catastro Oficial</span>
          <span class="farm-pin-tooltip__title">Cota Catastral ${cota.name}</span>
          <span class="farm-pin-tooltip__sub">Mojón o linde oficial</span>
        </div>`,
        {
          direction: 'top',
          offset: [0, -14],
          className: 'campito-map-tooltip',
        }
      );

      marker.on('click', onSelectCota);
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
  }, [showCatastro, selectedTarget]);

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

      const data = await insertFarmPath(payload);

      // Limpiar estado de dibujo
      setIsDrawing(false);
      setDrawPoints([]);
      setShowSaveModal(false);
      setNewPathData({ name: '', path_type: 'sendero', color: '#f97316', stroke_width: 4, notes: '' });

      if (data) {
        setSelectedTarget({
          type: 'path',
          id: data.id,
          title: data.name,
          path_type: data.path_type,
          color: data.color,
          length_meters: data.length_meters,
          notes: data.notes,
          coordinates: data.coordinates,
          raw: data,
        });
        setIaFeedback({ type: 'success', text: `✨ Recorrido guardado: ${data.name}` });
      }

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
      await updateFarmPath(selectedPath.id, {
        name: editPathData.name,
        color: editPathData.color,
        stroke_width: Number(editPathData.stroke_width) || 4,
        notes: editPathData.notes,
      });

      setIsEditingPath(false);
      setSelectedPath(null);
      if (onReloadPaths) onReloadPaths();
    } catch (err) {
      alert(`Error al actualizar el camino: ${err.message}`);
    }
  };

  // ─── 10. Eliminar Camino ─────────────────────────────────────────────────────
  const handleDeletePath = async (id, e) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    if (!id) return;
    if (!window.confirm('¿Seguro que deseas eliminar este camino o sendero del mapa?')) return;

    try {
      setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(id)));
      await deleteFarmPath(id);
      if (selectedTarget && String(selectedTarget.id) === String(id)) {
        setSelectedTarget(null);
      }
      setSelectedPath(null);
      setIaFeedback({ type: 'success', text: '🗑️ Camino eliminado del mapa' });
      if (onReloadPaths) await onReloadPaths();
    } catch (err) {
      alert(`Error al eliminar camino: ${err.message}`);
    }
  };

  // ─── 11. Eliminar Punto de Inventario ────────────────────────────────────────
  const handleDeletePoint = async (id, e) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    if (!id) return;
    if (!window.confirm('¿Seguro que deseas eliminar este punto del inventario?')) return;

    try {
      setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(id)));
      await deleteFarmInventoryItem(id);
      if (selectedTarget && String(selectedTarget.id) === String(id)) {
        setSelectedTarget(null);
      }
      setSelectedPoint(null);
      setIaFeedback({ type: 'success', text: '🗑️ Punto eliminado del inventario' });
      if (onReloadInventory) await onReloadInventory();
    } catch (err) {
      alert(`Error al eliminar punto: ${err.message}`);
    }
  };

  // ─── 11b. Actualizar Punto de Inventario ──────────────────────────────────
  const handleUpdatePoint = async () => {
    if (!selectedPoint) return;

    try {
      const data = await updateFarmInventoryItem(selectedPoint.id, {
        name: editPointData.name,
        variety_type: editPointData.variety_type,
        status: editPointData.status,
        notes: editPointData.notes,
      });

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
    setVisibleCategories(new Set(allCategories));
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

  // ─── 13. Centrador y seguimiento continuo de ubicación del usuario con GPS ───
  const updateUserLocationMarker = useCallback((coords) => {
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
    const layer = userLocationLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    const { lat, lng, accuracy = 8 } = coords;

    // Círculo translúcido de precisión
    L.circle([lat, lng], {
      radius: Math.max(accuracy, 2),
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
      `<b>📍 Estás aquí</b><br/><span style="font-size:10px">Precisión: ±${accuracy.toFixed(1)} m</span>`,
      { permanent: true, direction: 'top', offset: [0, -8] }
    );

    marker.addTo(layer);
  }, []);

  // Seguimiento GPS continuo en el mapa para inventario en movimiento
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }

    // 1. Obtener primera posición rápida (permite caché de 60s para pintar el punto sin espera)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
          altitude: pos.coords.altitude || null,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
          timestamp: pos.timestamp || Date.now(),
        };
        setLiveUserGps(info);
        liveUserGpsRef.current = info;
        setGlobalLastKnownGps(info);
        setGpsStatus('active');
        updateUserLocationMarker(info);
      },
      (err) => {
        console.warn('[FarmMap] Lectura inicial rápida GPS no disponible:', err.message);
        if (err.code === 1) setGpsStatus('denied');
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 }
    );

    // 2. Rastreo GPS de alta precisión en tiempo real
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 5,
          altitude: pos.coords.altitude || null,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
          timestamp: pos.timestamp || Date.now(),
        };
        setLiveUserGps(info);
        liveUserGpsRef.current = info;
        setGlobalLastKnownGps(info);
        setGpsStatus('active');
        updateUserLocationMarker(info);
      },
      (err) => {
        console.warn('[FarmMap] Advertencia en watchPosition:', err.message);
        if (err.code === 1) {
          setGpsStatus('denied');
        } else if (err.code === 3 || err.code === 2) {
          setGpsStatus('weak');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [updateUserLocationMarker]);

  const handleCenterOnUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      alert('Tu dispositivo o navegador no soporta geolocalización GPS.');
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    // Si ya disponemos de la posición en vivo, centrar de inmediato sin latencia
    if (liveUserGpsRef.current) {
      map.setView([liveUserGpsRef.current.lat, liveUserGpsRef.current.lng], 19);
      updateUserLocationMarker(liveUserGpsRef.current);
      return;
    }

    setIsLocatingUser(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 10;
        const info = {
          lat,
          lng,
          accuracy: acc,
          altitude: pos.coords.altitude || null,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
          timestamp: pos.timestamp || Date.now(),
        };

        setLiveUserGps(info);
        liveUserGpsRef.current = info;
        setGlobalLastKnownGps(info);
        setGpsStatus('active');

        // Centrar mapa
        map.setView([lat, lng], 19);
        updateUserLocationMarker(info);
      },
      (err) => {
        setIsLocatingUser(false);
        console.warn('Error capturando GPS:', err);
        if (err.code === 1) {
          setGpsStatus('denied');
          alert('Permiso de GPS denegado. Por favor, activa los permisos de ubicación en tu navegador o teléfono.');
        } else {
          alert(`No se pudo obtener la posición GPS (${err.message}). Comprueba que la ubicación esté habilitada en tu móvil.`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [updateUserLocationMarker]);

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
        };
        setLocalInventory((prev) =>
          prev.map((i) => (String(i.id) === String(selectedTarget.id) ? { ...i, ...updatePayload } : i))
        );
        await updateFarmInventoryItem(selectedTarget.id, updatePayload);
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
        };
        setLocalPaths((prev) =>
          prev.map((p) => (String(p.id) === String(selectedTarget.id) ? { ...p, ...updatePayload } : p))
        );
        await updateFarmPath(selectedTarget.id, updatePayload);
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
        const cleanName = targetEditData.name.trim() || selectedTarget.title;
        const lower = cleanName.toLowerCase();
        let cat = selectedTarget.type === 'catastro' ? 'hito' : 'riego';
        if (lower.includes('casa') || lower.includes('casita') || lower.includes('cueva') || lower.includes('edificio') || lower.includes('caseta') || lower.includes('taller')) {
          cat = 'edificio';
        } else if (lower.includes('aguacate') || lower.includes('olivo') || lower.includes('limon') || lower.includes('arbol')) {
          cat = 'arbol';
        }

        const newItem = {
          name: cleanName,
          category: cat,
          variety_type: targetEditData.variety.trim() || (selectedTarget.type === 'catastro' ? 'Cota Catastral' : null),
          status: targetEditData.status || 'saludable',
          latitude: selectedTarget.lat,
          longitude: selectedTarget.lng,
          notes: targetEditData.notes.trim() || null,
          is_active: true,
        };
        const inserted = await insertFarmInventoryItem(newItem);
        setLocalInventory((prev) => [inserted, ...prev.filter((i) => String(i.id) !== String(inserted.id))]);
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

  const handleDeleteTarget = async (e) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    if (!selectedTarget) return;
    const targetTitle = selectedTarget.title || 'este elemento';
    if (!window.confirm(`¿Seguro que deseas eliminar "${targetTitle}"?`)) return;

    setIsProcessingIa(true);
    const targetId = selectedTarget.id;
    const targetType = selectedTarget.type;

    try {
      if (targetType === 'point') {
        // Actualización optimista inmediata (0ms)
        setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(targetId)));
        await deleteFarmInventoryItem(targetId);
        setIaFeedback({ type: 'success', text: `🗑️ Pin eliminado: ${targetTitle}` });
        setSelectedTarget(null);
        setSelectedPoint(null);
        if (onReloadInventory) await onReloadInventory();
      } else if (targetType === 'path') {
        setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(targetId)));
        await deleteFarmPath(targetId);
        setIaFeedback({ type: 'success', text: `🗑️ Trazado eliminado: ${targetTitle}` });
        setSelectedTarget(null);
        setSelectedPath(null);
        if (onReloadPaths) await onReloadPaths();
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

  // ─── Control de Trazado de Polilíneas ─────────────────────────────────────────
  const handleToggleDraw = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setDrawPoints([]);
    } else {
      setIsDrawing(true);
      setDrawPoints([]);
      setSelectedTarget(null);
      setSelectedPoint(null);
      setSelectedPath(null);
    }
  };

  // ─── Edición Directa de Campos en la Ficha del Elemento (0ms optimista) ─────
  const handleDirectFieldUpdate = async (field, value) => {
    if (!selectedTarget) return;

    if (selectedTarget.type === 'point') {
      const targetId = selectedTarget.id;
      const updateObj = {};
      if (field === 'title' || field === 'name') updateObj.name = value;
      else if (field === 'variety_type' || field === 'variety') updateObj.variety_type = value;
      else if (field === 'status') updateObj.status = value;
      else if (field === 'notes') updateObj.notes = value;

      setSelectedTarget((prev) => ({
        ...prev,
        ...updateObj,
        ...(updateObj.name ? { title: updateObj.name } : {}),
        ...(updateObj.variety_type ? { variety: updateObj.variety_type } : {}),
      }));

      setLocalInventory((prev) =>
        prev.map((item) =>
          String(item.id) === String(targetId) ? { ...item, ...updateObj } : item
        )
      );

      try {
        await updateFarmInventoryItem(targetId, updateObj);
        window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetId, ...updateObj } }));
      } catch (err) {
        console.warn('Error guardando cambio directo en inventario:', err);
      }
    } else if (selectedTarget.type === 'path') {
      const targetId = selectedTarget.id;
      const updateObj = {};
      if (field === 'title' || field === 'name') updateObj.name = value;
      else if (field === 'path_type') {
        updateObj.path_type = value;
        updateObj.color = PATH_TYPE_COLORS[value] || selectedTarget.color;
      } else if (field === 'color') updateObj.color = value;
      else if (field === 'notes') updateObj.notes = value;

      setSelectedTarget((prev) => ({
        ...prev,
        ...updateObj,
        ...(updateObj.name ? { title: updateObj.name } : {}),
      }));

      setLocalPaths((prev) =>
        prev.map((p) =>
          String(p.id) === String(targetId) ? { ...p, ...updateObj } : p
        )
      );

      try {
        await updateFarmPath(targetId, updateObj);
      } catch (err) {
        console.warn('Error guardando cambio directo en camino:', err);
      }
    }
  };

  // ─── Eliminación de un Nodo Individual de una Polilínea ──────────────────────
  const handleDeleteNode = async (pathId, nodeIndex) => {
    const path = localPaths.find((p) => String(p.id) === String(pathId));
    if (!path || !Array.isArray(path.coordinates) || path.coordinates.length <= 2) {
      alert('Un recorrido debe tener al menos 2 nodos. Si deseas eliminar el recorrido completo, usa el botón de borrar recorrido.');
      return;
    }
    const updatedCoords = path.coordinates.filter((_, i) => i !== nodeIndex);
    const newLength = calculatePathMeters(updatedCoords);

    setLocalPaths((prev) =>
      prev.map((p) =>
        String(p.id) === String(pathId)
          ? { ...p, coordinates: updatedCoords, length_meters: newLength }
          : p
      )
    );
    await updateFarmPath(pathId, { coordinates: updatedCoords, length_meters: newLength });

    setSelectedTarget({
      type: 'path',
      id: path.id,
      title: path.name,
      path_type: path.path_type,
      color: path.color,
      length_meters: newLength,
      notes: path.notes,
      coordinates: updatedCoords,
      raw: { ...path, coordinates: updatedCoords, length_meters: newLength },
    });
    setIaFeedback({ type: 'success', text: `🗑️ Nodo ${nodeIndex + 1} eliminado de ${path.name}` });
    if (onReloadPaths) onReloadPaths();
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
    cancelTracking: cancelVoiceTracking,
  } = useVoiceGeoTracker();

  // Iniciar grabación asociando inmediatamente la posición GPS en vivo del dispositivo
  const handleStartVoiceRecording = async () => {
    try {
      const initialGps = liveUserGpsRef.current || voiceCurrentGps || null;
      await startVoiceTracking({ initialGps });
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Permiso de micrófono denegado. Por favor, habilítalo en los ajustes de tu navegador o teléfono para poder grabar notas de voz.');
      } else {
        alert(`No se pudo iniciar el micrófono: ${err.message || 'Comprueba los permisos en tu navegador.'}`);
      }
    }
  };

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
      if (cancelVoiceTracking) {
        cancelVoiceTracking();
      } else {
        await stopVoiceTracking();
      }
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

    // ─── 0. Detección directa de orden de borrado sobre el elemento seleccionado ─
    if (selectedTarget && (isDeleteIntent(textOrder) || (audioOrder && isDeleteIntent(audioOrder.transcription)))) {
      setMapIaInput('');
      setPendingVoiceAudio(null);
      setPendingAttachment(null);
      await handleDeleteTarget();
      return;
    }

    // ─── 0b. Detección directa de comandos estructurados [[REGISTRAR_PUNTOS]] / [[BORRAR_PUNTO]] en texto ──
    const directParsed = parseStructuredCommands(textOrder);
    if (directParsed.points.length > 0 || directParsed.deletions.length > 0) {
      setMapIaInput('');
      setPendingVoiceAudio(null);
      setPendingAttachment(null);
      setIsPreviewPlaying(false);
      setIsProcessingIa(true);
      setIaFeedback({ type: 'info', text: `📍 Procesando comando estructurado (${directParsed.points.length} punto(s))...` });

      try {
        const center = mapInstanceRef.current ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng] : DEFAULT_CENTER;
        const gpsPos = liveUserGpsRef.current || voiceCurrentGps || null;

        const actions = [
          ...directParsed.points.map((p) => ({ type: 'ADD_POINT', data: p })),
          ...directParsed.deletions.map((d) => ({ type: 'DELETE_POINT', data: d })),
        ];

        const execResult = await executeInventoryActions({
          actions,
          liveGps: gpsPos,
          mapCenter: center,
          selectedTarget,
          currentInventory: localInventory,
          currentPaths: localPaths,
        });

        if (execResult.addedItems.length > 0) {
          setLocalInventory((prev) => [
            ...execResult.addedItems,
            ...prev.filter((i) => !execResult.addedItems.some((a) => String(a.id) === String(i.id))),
          ]);
          execResult.addedItems.forEach((it) => {
            const cat = getItemCategory(it);
            setVisibleCategories((prev) => new Set([...prev, cat]));
          });
          const lastOne = execResult.addedItems[execResult.addedItems.length - 1];
          if (mapInstanceRef.current && lastOne.latitude && lastOne.longitude) {
            mapInstanceRef.current.panTo([lastOne.latitude, lastOne.longitude]);
          }
          setSelectedTarget({
            type: 'point',
            id: lastOne.id,
            title: lastOne.name,
            category: getItemCategory(lastOne),
            variety: lastOne.variety_type,
            status: lastOne.status,
            notes: lastOne.notes,
            lat: lastOne.latitude,
            lng: lastOne.longitude,
            photo_url: lastOne.photo_url,
            raw: lastOne,
          });
        }

        if (execResult.deletedItems.length > 0) {
          setLocalInventory((prev) => prev.filter((i) => !execResult.deletedItems.includes(i.id)));
          if (selectedTarget && execResult.deletedItems.includes(selectedTarget.id)) {
            setSelectedTarget(null);
            setSelectedPoint(null);
          }
        }

        if (execResult.reverts.length > 0) {
          setUndoStack((prev) => [
            ...prev,
            {
              description: `Registrado(s) ${execResult.addedItems.length} punto(s)`,
              reverts: execResult.reverts,
              timestamp: Date.now(),
            },
          ]);
        }

        setIaFeedback({
          type: 'success',
          text: `✨ Registrado(s) ${execResult.addedItems.length} punto(s) en el mapa`,
        });
        if (onReloadInventory) await onReloadInventory();
      } catch (err) {
        setIaFeedback({ type: 'error', text: `Error registrando puntos: ${err.message}` });
      } finally {
        setIsProcessingIa(false);
      }
      return;
    }

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
      const gpsPos = (audioOrder?.gpsTrack && audioOrder.gpsTrack.length > 0)
        ? audioOrder.gpsTrack[0]
        : (liveUserGpsRef.current || voiceCurrentGps || null);

      const result = await callGeminiForInventoryAction({
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
          const prevItem = localInventory.find(i => String(i.id) === String(selectedTarget.id));
          const updatePayload = {
            updated_at: new Date().toISOString()
          };
          if (uploadedPhotoUrl) updatePayload.photo_url = uploadedPhotoUrl;
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevItem?.notes ? `${prevItem.notes}\n${noteToAdd}` : noteToAdd;
          }

          await updateFarmInventoryItem(selectedTarget.id, updatePayload);

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
          setLocalInventory((prev) =>
            prev.map((i) => (String(i.id) === String(selectedTarget.id) ? { ...i, ...updatePayload } : i))
          );
          setIaFeedback({ type: 'success', text: `✨ Datos guardados en ${selectedTarget.title}` });
          if (onReloadInventory) await onReloadInventory();
          setIsProcessingIa(false);
          return;
        }

        // 2. Si el usuario añadió una nota sobre una polilínea / camino seleccionado
        if (selectedTarget?.type === 'path' && (uploadedPhotoUrl || textOrder || audioOrder)) {
          const prevPath = localPaths.find(p => String(p.id) === String(selectedTarget.id));
          const updatePayload = {};
          const noteToAdd = textOrder || (result.transcription ? `Audio: "${result.transcription}"` : null);
          if (noteToAdd) {
            updatePayload.notes = prevPath?.notes ? `${prevPath.notes}\n${noteToAdd}` : noteToAdd;
          }

          await updateFarmPath(selectedTarget.id, updatePayload);
          setSelectedTarget((prev) => ({ ...prev, ...updatePayload }));
          setLocalPaths((prev) =>
            prev.map((p) => (String(p.id) === String(selectedTarget.id) ? { ...p, ...updatePayload } : p))
          );
          setSelectedTarget((prev) => ({ ...prev, ...updatePayload }));
          setIaFeedback({ type: 'success', text: `✨ Notas actualizadas en ${selectedTarget.title}` });
          if (onReloadPaths) await onReloadPaths();
          setIsProcessingIa(false);
          return;
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
          if (lowerName.includes('casa') || lowerName.includes('casita') || lowerName.includes('cueva') || lowerName.includes('edificio') || lowerName.includes('almacen') || lowerName.includes('caseta') || lowerName.includes('taller') || lowerName.includes('caravana')) {
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
          };
          const inserted = await insertFarmInventoryItem(newItem);
          if (inserted) {
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

      // ─── Ejecución de acciones con orquestador unificado (Puntos y Caminos) ─
      const execResult = await executeInventoryActions({
        actions: result.actions,
        audio: audioOrder,
        liveGps: gpsPos,
        mapCenter: center,
        selectedTarget,
        currentInventory: localInventory,
        currentPaths: localPaths,
        uploadedPhotoUrl,
      });

      // Reflejar cambios en el estado local de inventario y caminos
      if (execResult.deletedItems.length > 0) {
        setLocalInventory((prev) => prev.filter((i) => !execResult.deletedItems.includes(i.id)));
        if (selectedTarget && execResult.deletedItems.includes(selectedTarget.id)) {
          setSelectedTarget(null);
          setSelectedPoint(null);
        }
      }
      if (execResult.deletedPaths.length > 0) {
        setLocalPaths((prev) => prev.filter((p) => !execResult.deletedPaths.includes(p.id)));
        if (selectedTarget && execResult.deletedPaths.includes(selectedTarget.id)) {
          setSelectedTarget(null);
          setSelectedPath(null);
        }
      }
      if (execResult.updatedItems.length > 0) {
        setLocalInventory((prev) =>
          prev.map((i) => {
            const upd = execResult.updatedItems.find((u) => String(u.id) === String(i.id));
            return upd ? { ...i, ...upd } : i;
          })
        );
        if (selectedTarget && selectedTarget.type === 'point') {
          const upd = execResult.updatedItems.find((u) => String(u.id) === String(selectedTarget.id));
          if (upd) setSelectedTarget((prev) => ({ ...prev, ...upd }));
        }
      }
      if (execResult.updatedPaths.length > 0) {
        setLocalPaths((prev) =>
          prev.map((p) => {
            const upd = execResult.updatedPaths.find((u) => String(u.id) === String(p.id));
            return upd ? { ...p, ...upd } : p;
          })
        );
        if (selectedTarget && selectedTarget.type === 'path') {
          const upd = execResult.updatedPaths.find((u) => String(u.id) === String(selectedTarget.id));
          if (upd) setSelectedTarget((prev) => ({ ...prev, ...upd }));
        }
      }
      if (execResult.addedItems.length > 0) {
        setLocalInventory((prev) => [
          ...execResult.addedItems,
          ...prev.filter((i) => !execResult.addedItems.some((a) => String(a.id) === String(i.id))),
        ]);
        execResult.addedItems.forEach((it) => {
          const cat = getItemCategory(it);
          setVisibleCategories((prev) => new Set([...prev, cat]));
        });
        const lastOne = execResult.addedItems[execResult.addedItems.length - 1];
        if (mapInstanceRef.current && lastOne.latitude && lastOne.longitude) {
          mapInstanceRef.current.panTo([lastOne.latitude, lastOne.longitude]);
        }
        setSelectedTarget({
          type: 'point',
          id: lastOne.id,
          title: lastOne.name,
          category: getItemCategory(lastOne),
          variety: lastOne.variety_type,
          status: lastOne.status,
          notes: lastOne.notes,
          lat: lastOne.latitude,
          lng: lastOne.longitude,
          photo_url: lastOne.photo_url,
          raw: lastOne,
        });
      }
      if (execResult.addedPaths.length > 0) {
        setLocalPaths((prev) => [
          ...execResult.addedPaths,
          ...prev.filter((p) => !execResult.addedPaths.some((a) => String(a.id) === String(p.id))),
        ]);
        const lastPath = execResult.addedPaths[execResult.addedPaths.length - 1];
        if (mapInstanceRef.current && lastPath.coordinates && lastPath.coordinates.length > 0) {
          mapInstanceRef.current.panTo(lastPath.coordinates[0]);
        }
        setSelectedTarget({
          type: 'path',
          id: lastPath.id,
          title: lastPath.name,
          path_type: lastPath.path_type,
          color: lastPath.color,
          notes: lastPath.notes,
          coordinates: lastPath.coordinates,
          raw: lastPath,
        });
      }

      if (execResult.reverts.length > 0) {
        setUndoStack((prev) => [
          ...prev,
          {
            description: result.description || 'Cambios en el mapa',
            reverts: execResult.reverts,
            timestamp: Date.now(),
          },
        ]);
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
          await insertFarmInventoryItem(rev.itemData);
          setLocalInventory((prev) => [rev.itemData, ...prev.filter((i) => String(i.id) !== String(rev.itemData.id))]);
        } else if (rev.type === 'RESTORE_PATH') {
          await insertFarmPath(rev.pathData);
          setLocalPaths((prev) => [rev.pathData, ...prev.filter((p) => String(p.id) !== String(rev.pathData.id))]);
        } else if (rev.type === 'UPDATE_POINT') {
          await updateFarmInventoryItem(rev.target_id, rev.prevData);
          setLocalInventory((prev) =>
            prev.map((i) => (String(i.id) === String(rev.target_id) ? { ...i, ...rev.prevData } : i))
          );
        } else if (rev.type === 'UPDATE_PATH') {
          await updateFarmPath(rev.target_id, rev.prevData);
          setLocalPaths((prev) =>
            prev.map((p) => (String(p.id) === String(rev.target_id) ? { ...p, ...rev.prevData } : p))
          );
        } else if (rev.type === 'DELETE_POINT') {
          setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(rev.target_id)));
          await deleteFarmInventoryItem(rev.target_id);
        } else if (rev.type === 'DELETE_PATH') {
          setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(rev.target_id)));
          await deleteFarmPath(rev.target_id);
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
      {/* ── Barra Superior: Filtros, Trazado, Capas, PDF e Información alineados a la derecha ── */}
      <div style={styles.topBarClean}>
        {/* Indicador de búsqueda activa desde la barra principal */}
        {searchQuery && (
          <div style={{
            marginRight: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            color: '#00979d',
            fontWeight: 600,
            backgroundColor: 'rgba(0,151,157,0.08)',
            padding: '4px 9px',
            borderRadius: 12,
          }}>
            <span>🔍 {filteredInventory.length + filteredPaths.length} encontrados</span>
          </div>
        )}

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

        {/* 2b. Trazar Recorrido (Polilínea: Sendero, Carril, Camino, Vereda, Acequia) */}
        <button
          type="button"
          onClick={handleToggleDraw}
          style={{
            ...styles.topBarIconBtn,
            color: isDrawing ? '#00979d' : '#475569',
            backgroundColor: isDrawing ? 'rgba(0, 151, 157, 0.14)' : 'transparent',
            borderRadius: 6,
          }}
          title={isDrawing ? 'Salir del modo trazado' : 'Trazar nuevo recorrido (sendero, carril, camino, vereda, acequia)'}
          aria-label="Trazar recorrido"
        >
          <Route size={18} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={styles.pulseDot} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                  Modo Trazado Activo: Haz clic en el satélite para colocar nodos
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Nodos: <b>{drawPoints.length}</b> | Longitud: <b>{liveDrawDistance.toFixed(1)} m</b>
                </span>
              </div>

              {/* Selector directo de tipo de trazado */}
              <select
                value={newPathData.path_type}
                onChange={(e) => {
                  const pt = e.target.value;
                  setNewPathData((prev) => ({
                    ...prev,
                    path_type: pt,
                    color: PATH_TYPE_COLORS[pt] || '#f97316',
                  }));
                }}
                style={styles.drawTypeSelect}
              >
                <option value="sendero">Sendero</option>
                <option value="carril">Carril</option>
                <option value="camino">Camino</option>
                <option value="vereda">Vereda</option>
                <option value="acequia">Acequia</option>
                <option value="linea_riego">Línea de Riego</option>
                <option value="linde">Linde</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
                disabled={drawPoints.length === 0}
                style={{
                  ...styles.drawActionBtn,
                  opacity: drawPoints.length === 0 ? 0.5 : 1,
                  backgroundColor: '#ffffff',
                  color: '#475569',
                }}
                title="Deshacer último nodo"
              >
                <Undo2 size={13} />
                Deshacer nodo
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDrawing(false);
                  setDrawPoints([]);
                }}
                style={{
                  ...styles.drawActionBtn,
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
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
                Guardar Recorrido
              </button>
            </div>
          </div>
        )}

        {/* Leyenda de colores flotante (div de referencias dinámico - controlado por Capas) */}
        {showLegend && (
          <div style={{ ...styles.legendBox, bottom: selectedTarget ? 270 : 75 }}>
            <span style={styles.legendTitle}>Referencias (Puntos y Líneas)</span>
            <div style={styles.legendGrid}>
              {allCategories.filter(cat => cat !== 'Otros' || localInventory.some(i => getItemCategory(i) === 'Otros')).map(cat => (
                <div key={cat} style={styles.legendItem}>
                  <span style={{ ...styles.colorCircle, backgroundColor: getCategoryColor(cat) }} />
                  <span>{cat}</span>
                </div>
              ))}
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#ef4444' }} />
                <span>Poda/Seco</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#92400e' }} />
                <span>Camino</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#a16207' }} />
                <span>Carril</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#b45309' }} />
                <span>Sendero</span>
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#1d4ed8' }} />
                <span>Acequia</span>
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
          <div style={{ ...styles.navWidget, bottom: selectedTarget ? 270 : 75 }}>
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
                color: isLocatingUser
                  ? '#f59e0b'
                  : gpsStatus === 'active'
                    ? '#10b981'
                    : gpsStatus === 'denied'
                      ? '#ef4444'
                      : '#0284c7',
                backgroundColor: isLocatingUser ? '#f0f9ff' : '#ffffff',
                position: 'relative',
              }}
              title={
                gpsStatus === 'active'
                  ? `📍 GPS en vivo (±${liveUserGps?.accuracy?.toFixed(1) || '4'}m) - Centrar en mí`
                  : gpsStatus === 'denied'
                    ? '🔴 GPS sin permiso en el móvil'
                    : 'Centrar en mi ubicación actual GPS'
              }
            >
              <Crosshair size={16} />
              {gpsStatus === 'active' && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                  }}
                />
              )}
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

              {/* Categorías de puntos (Dinámicas y reactivas) */}
              <div style={stylesFilter.sectionLabel}>PUNTOS DE INVENTARIO</div>
              {allCategories.map(parent => {
                const subcats = getSubcategoriesForParent(localInventory, parent);
                const count = localInventory.filter(i => getItemCategory(i) === parent).length;
                const isActive = visibleCategories.has(parent);
                const isExpanded = expandedParents.has(parent);
                const color = getCategoryColor(parent);
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
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, display: 'inline-block', marginRight: 5 }} />
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
                      const subCount = localInventory.filter(i => (i.variety_type || i.category || i.tipo) === sub).length;
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
                                    const allSubs = new Set(localInventory.map(i => i.variety_type || i.category || i.tipo).filter(Boolean));
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
                  <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem' }}>Todos los caminos ({localPaths.length})</span>
                  <span style={stylesFilter.countBadge}>{localPaths.length}</span>
                </label>
              </div>
              {PATH_TYPES.map(pt => {
                const count = localPaths.filter(p => (p.path_type || 'otro') === pt).length;
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

        {/* ── MÓDULO FIJO CHAT IA INFERIOR SOBRE EL MENÚ DE LA APP (IDÉNTICO A CHAT IA) ── */}
        <div style={styles.fixedBottomChatWrapper}>
          {/* Ficha limpia del elemento seleccionado (PIN, NODO, LÍNEA o COORD) por encima de los inputs (con margen) */}
          {selectedTarget && (
            <div style={styles.cleanTargetCard}>
              {/* Fila Superior: Título a la izquierda, Categoría en gris claro a la derecha + Botón Cerrar (X) */}
              <div style={styles.cardHeaderRow}>
                <input
                  type="text"
                  value={selectedTarget.title || selectedTarget.name || ''}
                  onChange={(e) => handleDirectFieldUpdate('name', e.target.value)}
                  placeholder="Título..."
                  style={styles.cardTitleInput}
                />

                <div style={styles.cardHeaderRight}>
                  <span style={styles.cardCategoryGray}>
                    {selectedTarget.type === 'point'
                      ? (selectedTarget.category || 'Inventario')
                      : selectedTarget.type === 'path'
                      ? (PATH_TYPE_LABELS[selectedTarget.path_type] || selectedTarget.path_type || 'Recorrido')
                      : selectedTarget.type === 'node'
                      ? `Vértice · ${PATH_TYPE_LABELS[selectedTarget.pathType] || 'Recorrido'}`
                      : selectedTarget.type === 'catastro'
                      ? 'Catastro Oficial'
                      : 'Punto Satelital'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTarget(null);
                      setSelectedPoint(null);
                      setSelectedPath(null);
                    }}
                    style={styles.cardCloseBtn}
                    title="Cerrar ficha"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Contenido y definiciones con un orden lógico a su clasificación e información de inventario */}
              {selectedTarget.type === 'point' && (
                <div style={styles.cardBodyColumn}>
                  {/* Clasificación y Estado */}
                  <div style={styles.cardFieldsRow}>
                    <input
                      type="text"
                      value={selectedTarget.variety || selectedTarget.variety_type || ''}
                      onChange={(e) => handleDirectFieldUpdate('variety_type', e.target.value)}
                      placeholder="Subtipo / Variedad (ej: Hass, Gotero 4L, 16mm)..."
                      style={styles.cleanFieldInput}
                    />
                    <select
                      value={selectedTarget.status || 'saludable'}
                      onChange={(e) => handleDirectFieldUpdate('status', e.target.value)}
                      style={styles.cleanFieldSelect}
                    >
                      <option value="saludable">🟢 Saludable</option>
                      <option value="clorosis">🟡 Clorosis</option>
                      <option value="poda_requerida">🟠 Requiere Poda</option>
                      <option value="enfermo">🔴 Enfermo</option>
                      <option value="seco">⚫ Seco / Muerto</option>
                    </select>
                  </div>

                  {/* Contenido / Observaciones / Definición */}
                  <textarea
                    rows={2}
                    value={selectedTarget.notes || ''}
                    onChange={(e) => handleDirectFieldUpdate('notes', e.target.value)}
                    placeholder="Definición, contenido o notas de inventario..."
                    style={styles.cleanFieldTextarea}
                  />

                  {/* Información de inventario y metadatos */}
                  <div style={styles.cardMetaRow}>
                    <span style={styles.cardMetaText}>
                      📍 {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
                      {selectedTarget.accuracy ? ` · ±${Number(selectedTarget.accuracy).toFixed(1)}m` : ''}
                    </span>
                    {selectedTarget.photo_url && (
                      <a
                        href={selectedTarget.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.cardPhotoLink}
                        title="Ver fotografía adjunta"
                      >
                        📷 Ver foto
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteTarget}
                      style={styles.cardTrashBtn}
                      title="Eliminar este punto del inventario"
                    >
                      <Trash2 size={13} color="#94a3b8" />
                    </button>
                  </div>
                </div>
              )}

              {selectedTarget.type === 'path' && (
                <div style={styles.cardBodyColumn}>
                  {/* Clasificación de tipo de recorrido */}
                  <div style={styles.cardFieldsRow}>
                    <select
                      value={selectedTarget.path_type || 'sendero'}
                      onChange={(e) => handleDirectFieldUpdate('path_type', e.target.value)}
                      style={{ ...styles.cleanFieldSelect, flex: 1 }}
                    >
                      <option value="sendero">Sendero peatonal</option>
                      <option value="carril">Carril agrícola</option>
                      <option value="camino">Camino principal</option>
                      <option value="vereda">Vereda</option>
                      <option value="acequia">Acequia / Canal</option>
                      <option value="linea_riego">Línea de Riego</option>
                      <option value="linde">Linde</option>
                      <option value="otro">Otro trazado</option>
                    </select>
                    <span style={styles.cardLengthBadge}>
                      📏 {Math.round(selectedTarget.length_meters || 0)} m
                    </span>
                  </div>

                  {/* Contenido y Definición */}
                  <textarea
                    rows={2}
                    value={selectedTarget.notes || ''}
                    onChange={(e) => handleDirectFieldUpdate('notes', e.target.value)}
                    placeholder="Definición del recorrido, firme, acceso o contenido..."
                    style={styles.cleanFieldTextarea}
                  />

                  {/* Metadatos y Nodos */}
                  <div style={styles.cardMetaRow}>
                    <span style={styles.cardMetaText}>
                      📍 {selectedTarget.coordinates?.length || 0} nodos interactivos (arrástralos en el satélite)
                    </span>
                    <button
                      type="button"
                      onClick={handleDeleteTarget}
                      style={styles.cardTrashBtn}
                      title="Eliminar este recorrido"
                    >
                      <Trash2 size={13} color="#94a3b8" />
                    </button>
                  </div>
                </div>
              )}

              {selectedTarget.type === 'node' && (
                <div style={styles.cardBodyColumn}>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.cardMetaText}>
                      Recorrido: <b>{selectedTarget.pathName}</b> (Nodo {selectedTarget.nodeIndex + 1} de {selectedTarget.totalNodes})
                    </span>
                  </div>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.cardMetaText}>
                      📍 Posición: {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#00979d', fontStyle: 'italic' }}>
                      Arrastra el nodo en el satélite para ajustar el trazado
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const path = localPaths.find((p) => String(p.id) === String(selectedTarget.pathId));
                        if (path) {
                          setSelectedTarget({
                            type: 'path',
                            id: path.id,
                            title: path.name,
                            path_type: path.path_type,
                            color: path.color,
                            length_meters: path.length_meters,
                            notes: path.notes,
                            coordinates: path.coordinates,
                            raw: path,
                          });
                        }
                      }}
                      style={styles.cleanLinkBtn}
                    >
                      ⬅️ Ver recorrido completo
                    </button>
                    {selectedTarget.totalNodes > 2 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNode(selectedTarget.pathId, selectedTarget.nodeIndex)}
                        style={styles.cardTrashBtn}
                        title="Eliminar este vértice"
                      >
                        <Trash2 size={13} color="#ef4444" />
                        <span style={{ fontSize: '0.72rem', color: '#ef4444', marginLeft: 4 }}>Quitar nodo</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedTarget.type === 'catastro' && (
                <div style={styles.cardBodyColumn}>
                  <span style={styles.cardMetaText}>
                    {selectedTarget.subtitle || 'Linde catastral oficial de Campito Jorox (Parcela 195/196)'}
                  </span>
                  {selectedTarget.notes && (
                    <span style={{ fontSize: '0.76rem', color: '#64748b' }}>"{selectedTarget.notes}"</span>
                  )}
                  {selectedTarget.lat && selectedTarget.lng && (
                    <span style={styles.cardMetaText}>
                      📍 Coordenadas oficiales: {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
                    </span>
                  )}
                </div>
              )}

              {selectedTarget.type === 'coord' && (
                <div style={styles.cardBodyColumn}>
                  <span style={styles.cardMetaText}>
                    📍 Coordenada satelital: {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Habla por voz o escribe en el chat para registrar un nuevo árbol, arqueta o elemento en esta ubicación exacta.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Vista previa de archivo adjunto si hay uno */}
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

          {/* Banner de feedback si hay mensaje */}
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

          {/* Barra de Input Inferior Idéntica a la sección CHAT IA */}
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

            {/* 1. Botón (+) a la izquierda para adjuntar fotos o documentos */}
            <button
              type="button"
              style={{
                ...styles.chatIaAttachBtn,
                backgroundColor: pendingAttachment && !pendingAttachment.isImage ? '#00979d' : '#f0f0f0',
                color: pendingAttachment && !pendingAttachment.isImage ? '#ffffff' : '#555555',
              }}
              onClick={handleAttachClick}
              aria-label="Adjuntar archivo o documento (+)"
              title="Adjuntar archivo o documento (+)"
            >
              <Plus size={20} />
            </button>

            {/* 2. Cápsula central (Idéntica a Chat IA) */}
            {pendingVoiceAudio && !isVoiceRecording ? (
              <div style={styles.chatIaAudioPreviewCapsule}>
                <button
                  type="button"
                  onClick={handleDiscardVoice}
                  style={styles.previewTrashBtn}
                  title="Descartar nota de voz"
                  aria-label="Descartar nota de voz"
                >
                  <Trash2 size={18} color="#ef4444" />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPreview}
                  style={styles.previewPlayBtn}
                  title={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
                  aria-label={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
                >
                  {isPreviewPlaying ? (
                    <Pause size={15} color="#ffffff" />
                  ) : (
                    <Play size={15} color="#ffffff" style={{ marginLeft: 2 }} />
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
                ) : liveUserGps ? (
                  <span style={styles.previewGpsTagActive}>
                    📍 ±{liveUserGps.accuracy?.toFixed(1)}m
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
                  <Trash2 size={17} color="#64748b" />
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
                  placeholder="Mensaje..."
                  style={styles.chatIaTextInput}
                  disabled={isProcessingIa}
                  autoComplete="off"
                  autoCorrect="on"
                  spellCheck="true"
                />

                {/* Cámara dentro de la cápsula a la derecha */}
                <button
                  type="button"
                  style={{
                    ...styles.capsuleCameraBtn,
                    background: pendingAttachment?.isImage ? '#00979d' : 'transparent',
                    color: pendingAttachment?.isImage ? '#ffffff' : '#64748b',
                  }}
                  onClick={handleCameraClick}
                  aria-label="Tomar foto con la cámara"
                  title="Tomar foto con la cámara"
                >
                  <Camera size={19} />
                </button>
              </div>
            )}

            {/* 3. Botón de Acción a la derecha (estilo WhatsApp) */}
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
                <StopCircle size={20} />
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
                {isProcessingIa ? <div style={styles.miniWhiteSpinner} /> : <Send size={18} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartVoiceRecording}
                disabled={isProcessingIa}
                style={{
                  ...styles.chatIaActionBtn,
                  backgroundColor: '#00979d',
                  color: '#ffffff',
                }}
                title={
                  selectedTarget
                    ? `Hablar orden por voz para ${selectedTarget.title || 'elemento seleccionado'}`
                    : 'Hablar orden por voz con telemetría GPS'
                }
                aria-label="Grabar mensaje de voz"
              >
                <Mic size={20} />
              </button>
            )}

            {/* 4. Botón de Deshacer (Undo) si hay historial */}
            {undoStack.length > 0 && (
              <button
                type="button"
                onClick={handleUndoMapAction}
                disabled={isProcessingIa}
                style={styles.chatIaUndoBtn}
                title={`Retroceder cambios: ${undoStack[undoStack.length - 1].description}`}
                aria-label="Retroceder cambios en el mapa"
              >
                <Undo2 size={17} />
              </button>
            )}
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
                  <option value="carril">Carril / Camino de rodadura agrícola</option>
                  <option value="camino">Camino principal / tractor</option>
                  <option value="vereda">Vereda / Paso estrecho</option>
                  <option value="acequia">Acequia / Caudal de agua</option>
                  <option value="linea_riego">Línea de riego / Tubería</option>
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
    justifyContent: 'flex-end',
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

  // ─── Estilos del Módulo Fijo de Control por Chat IA en el Mapa ───
  fixedBottomChatWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 820,
    margin: '0 auto',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto',
  },
  mapIaFeedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    margin: '0 12px 8px 12px',
    borderRadius: 8,
    border: '1px solid',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(8px)',
  },
  cleanTargetCard: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    border: '1.5px solid #cbd5e1',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    padding: '12px 14px',
    margin: '0 12px 10px 12px',
    gap: 8,
    boxSizing: 'border-box',
    maxHeight: '45vh',
    overflowY: 'auto',
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  cardTitleInput: {
    fontWeight: 700,
    fontSize: '0.96rem',
    color: '#0f172a',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    flex: 1,
    minWidth: 100,
    padding: 0,
    fontFamily: 'inherit',
  },
  cardHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  cardCategoryGray: {
    fontSize: '0.76rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  cardCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBodyColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
  },
  cardFieldsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    flexWrap: 'wrap',
  },
  cleanFieldInput: {
    flex: 1,
    minWidth: 120,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  cleanFieldSelect: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '0.8rem',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  cleanFieldTextarea: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '0.8rem',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  cardMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  cardMetaText: {
    fontSize: '0.73rem',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  cardPhotoLink: {
    fontSize: '0.73rem',
    color: '#00979d',
    textDecoration: 'none',
    fontWeight: 600,
    marginLeft: 6,
  },
  cardTrashBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  cardLengthBadge: {
    fontSize: '0.76rem',
    fontWeight: 600,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    padding: '4px 8px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  },
  cleanLinkBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: '#00979d',
    fontWeight: 600,
    padding: 0,
  },
  drawTypeSelect: {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '0.74rem',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
  },
  pendingAttachmentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    margin: '0 12px 8px 12px',
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
    gap: '8px',
    padding: '10px 12px',
    paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e8e8e8',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
  },
  chatIaAttachBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#f0f0f0',
    color: '#555555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaInputCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: '#fafafa',
    borderRadius: 22,
    border: '1.5px solid #e0e0e0',
    padding: '0 6px 0 14px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  chatIaTextInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1a1a1a',
    resize: 'none',
    lineHeight: 1.4,
    fontSize: '0.9rem',
    maxHeight: 100,
    overflowY: 'auto',
    fontFamily: 'inherit',
    padding: '9px 0',
  },
  capsuleCameraBtn: {
    width: 34,
    height: 34,
    minWidth: 34,
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
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaUndoBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: '#334155',
    color: '#ffffff',
    flexShrink: 0,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
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

