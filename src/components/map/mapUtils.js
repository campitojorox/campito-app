// src/components/map/mapUtils.js
// Constantes y utilidades cartográficas y de pines para FarmSatelliteMap

import L from 'leaflet';
import { getCategoryColor, getItemCategory } from '../../services/farmInventoryStorage';

// Coordenadas por defecto: Centroide exacto de las parcelas 195 y 196 de Campito Jorox
export const DEFAULT_CENTER = [36.72595, -4.89462];
export const DEFAULT_ZOOM = 18;

// Paleta de colores para trazados y puntos
export const COLOR_PALETTE = [
  { name: 'Naranja Finca', hex: '#f97316' },
  { name: 'Amarillo Sendero', hex: '#eab308' },
  { name: 'Verde Cultivo', hex: '#10b981' },
  { name: 'Azul Riego', hex: '#0284c7' },
  { name: 'Cian Acequia', hex: '#06b6d4' },
  { name: 'Rojo Linde / Alerta', hex: '#ef4444' },
  { name: 'Púrpura Especial', hex: '#8b5cf6' },
  { name: 'Gris Pizarra', hex: '#64748b' },
];

// Tipos de camino para filtros
export const PATH_TYPES = ['camino', 'carril', 'sendero', 'vereda', 'acequia', 'linea_riego', 'linde', 'otro'];
export const PATH_TYPE_LABELS = {
  camino: 'Caminos',
  carril: 'Carriles',
  sendero: 'Senderos',
  vereda: 'Veredas',
  acequia: 'Acequias',
  linea_riego: 'Líneas de Riego',
  linde: 'Lindes',
  otro: 'Otros trazados',
};

// ─── Clave y cargador de caché para capas y filtros visibles ────────────────
export const MAP_SETTINGS_STORAGE_KEY = 'campito_map_settings';

export function loadMapSettingsFromCache() {
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
export function haversineDistance(lat1, lon1, lat2, lon2) {
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

/**
 * Normaliza cualquier coordenada (array [lat, lng], objeto {lat, lng}, string JSON)
 * devolviendo siempre una tupla numérica [lat, lng] o null si es inválida.
 */
export function normalizeLatLng(c) {
  if (!c) return null;
  if (typeof c === 'string') {
    try {
      return normalizeLatLng(JSON.parse(c));
    } catch {
      return null;
    }
  }
  if (Array.isArray(c)) {
    if (c.length >= 2) {
      const lat = Number(c[0]);
      const lng = Number(c[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
        return [lat, lng];
      }
    }
    return null;
  }
  if (typeof c === 'object') {
    const lat = Number(c.lat ?? c.latitude);
    const lng = Number(c.lng ?? c.longitude ?? c.lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      return [lat, lng];
    }
  }
  return null;
}

/**
 * Normaliza cualquier coordenada a formato objeto { lat, lng } o null si no es válida.
 */
export function normalizeLatLngObj(c) {
  const arr = normalizeLatLng(c);
  if (!arr) return null;
  return { lat: arr[0], lng: arr[1] };
}

/**
 * Convierte cualquier lista o string de coordenadas en un array seguro de tuplas [[lat, lng], ...]
 * filtrando automáticamente elementos undefined, null o corruptos.
 */
export function normalizeCoordinatesArray(rawCoords) {
  if (!rawCoords) return [];
  let list = rawCoords;
  if (typeof rawCoords === 'string') {
    try {
      list = JSON.parse(rawCoords);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map(normalizeLatLng).filter(Boolean);
}

export function calculatePathMeters(coordinates) {
  const norm = normalizeCoordinatesArray(coordinates);
  if (norm.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < norm.length - 1; i++) {
    total += haversineDistance(
      norm[i][0],
      norm[i][1],
      norm[i + 1][0],
      norm[i + 1][1]
    );
  }
  return total;
}

// ─── Arquitectura Familiar de Pines (Mismas Dimensiones y Comportamientos) ───
export function getPinFamilySlug(item) {
  const parent = getItemCategory(item);
  switch (parent) {
    case 'Casas':
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
    case 'Sin clasificar':
    case 'Sin categoría':
    case 'Otros':
    default:
      return 'otros';
  }
}

export function getPinStatusSlug(item) {
  const status = (item.status || item.estado || '').toLowerCase().trim();
  if (['enfermo', 'seco', 'muerto'].includes(status)) return 'enfermo';
  if (status === 'clorosis') return 'clorosis';
  if (['poda_requerida', 'poda'].includes(status)) return 'poda_requerida';
  return 'saludable';
}

/**
 * Generador de Icono DivIcon para todos los puntos de inventario.
 */
export function createFamilyPinIcon({ item, isSelected = false, hasWarning = false }) {
  const parentCat = getItemCategory(item);
  const isUnclassified = parentCat === 'Sin clasificar' || parentCat === 'Sin categoría' || !parentCat;
  const catColor = isUnclassified ? '#00979d' : getCategoryColor(parentCat);
  const familySlug = isUnclassified ? 'otros' : getPinFamilySlug(item);
  const statusSlug = getPinStatusSlug(item);
  const selectedClass = isSelected ? 'is-selected' : '';
  const warningClass = hasWarning ? 'has-warning' : '';
  const unclassifiedClass = isUnclassified ? 'is-unclassified' : '';

  return L.divIcon({
    className: 'farm-pin-div-wrapper',
    html: `
      <div class="farm-pin-container ${selectedClass} ${warningClass} ${unclassifiedClass}">
        <div class="farm-pin farm-pin--family-${familySlug} farm-pin--status-${statusSlug}">
          <div class="farm-pin__halo" style="background-color: ${catColor};"></div>
          <div class="farm-pin__body" style="background-color: ${catColor};"></div>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
    tooltipAnchor: [0, -10],
  });
}

/**
 * Generador de Icono DivIcon para nodos de lindes / cotas del Campito.
 */
export function createCotaPinIcon({ isSelected = false, color = '#00d1da' }) {
  const selectedClass = isSelected ? 'is-selected' : '';
  return L.divIcon({
    className: 'farm-pin-div-wrapper',
    html: `
      <div class="farm-pin-container ${selectedClass}">
        <div class="farm-pin farm-pin--family-hito farm-pin--cota">
          <div class="farm-pin__halo" style="background-color: ${color};"></div>
          <div class="farm-pin__body" style="background-color: ${color};"></div>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
    tooltipAnchor: [0, -10],
  });
}

/**
 * Detector robusto de intención de borrado en órdenes de voz o texto
 */
export function isDeleteIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();
  const deleteKeywords = [
    'borrar', 'eliminar', 'quitar', 'suprimir', 'borra', 'elimina',
    'quita', 'borralo', 'bórralo', 'eliminalo', 'elimínalo', 'quitalo',
    'quítalo', 'delete', 'remove',
  ];
  return deleteKeywords.some((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(lower);
  });
}

