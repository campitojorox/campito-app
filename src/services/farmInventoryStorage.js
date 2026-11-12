// src/services/farmInventoryStorage.js
// Servicio Local-First para inventario y caminos de Campito Jorox con sincronización resiliente a Supabase.
// Garantiza que los pines y trazados NUNCA queden invisibles ni se pierdan,
// funcionando inmediatamente en local mientras se sincroniza con Supabase en la nube.

import { supabase } from '../supabaseClient';

const INVENTORY_STORAGE_KEY = 'campito_farm_inventory_cache';
const PATHS_STORAGE_KEY = 'campito_farm_paths_cache';
const DELETED_INVENTORY_KEY = 'campito_deleted_inventory_ids';
const DELETED_PATHS_KEY = 'campito_deleted_paths_ids';
const DEFAULT_SEEDED_KEY = 'campito_default_cueva_seeded';

/**
 * Validador de formato UUID v4
 */
function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Generador universal de UUID v4 compatible con navegadores y Node
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Gestión de IDs eliminados para evitar resurrección por caché / polling ───
function getDeletedInventoryIds() {
  try {
    const raw = localStorage.getItem(DELETED_INVENTORY_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedInventoryId(id) {
  if (!id) return;
  try {
    const current = getDeletedInventoryIds();
    current.add(String(id));
    localStorage.setItem(DELETED_INVENTORY_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando ID borrado:', e);
  }
}

function removeDeletedInventoryId(id) {
  if (!id) return;
  try {
    const current = getDeletedInventoryIds();
    current.delete(String(id));
    localStorage.setItem(DELETED_INVENTORY_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error desmarcando ID borrado:', e);
  }
}

function getDeletedPathIds() {
  try {
    const raw = localStorage.getItem(DELETED_PATHS_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedPathId(id) {
  if (!id) return;
  try {
    const current = getDeletedPathIds();
    current.add(String(id));
    localStorage.setItem(DELETED_PATHS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando ID de camino borrado:', e);
  }
}

function removeDeletedPathId(id) {
  if (!id) return;
  try {
    const current = getDeletedPathIds();
    current.delete(String(id));
    localStorage.setItem(DELETED_PATHS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error desmarcando ID de camino borrado:', e);
  }
}

// Elementos iniciales de referencia de la finca
const DEFAULT_INITIAL_INVENTORY = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Casita Cueva',
    category: 'edificio',
    variety_type: 'Vivienda / Cueva',
    status: 'saludable',
    latitude: 36.72595,
    longitude: -4.89462,
    notes: 'Vivienda y construcción tradicional de Campito Jorox',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function getLocalInventory() {
  try {
    const deletedIds = getDeletedInventoryIds();
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) {
      setLocalInventory(DEFAULT_INITIAL_INVENTORY);
      return DEFAULT_INITIAL_INVENTORY;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setLocalInventory(DEFAULT_INITIAL_INVENTORY);
      return DEFAULT_INITIAL_INVENTORY;
    }

    // Filtrar cualquier elemento que esté en la lista de eliminados
    const activeItems = parsed.filter((i) => !deletedIds.has(String(i.id)));

    // Sembrar Casita Cueva inicial únicamente la primera vez que arranca el almacenamiento
    const alreadySeeded = localStorage.getItem(DEFAULT_SEEDED_KEY) === '1';
    if (
      !alreadySeeded &&
      !deletedIds.has('00000000-0000-4000-8000-000000000001') &&
      !deletedIds.has('casita_cueva_principal') &&
      !activeItems.some((i) => (i.name || '').toLowerCase().includes('cueva'))
    ) {
      localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
      const updated = [DEFAULT_INITIAL_INVENTORY[0], ...activeItems];
      setLocalInventory(updated);
      return updated;
    }
    if (activeItems.some((i) => (i.name || '').toLowerCase().includes('cueva'))) {
      localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
    }
    return activeItems;
  } catch (e) {
    console.warn('[InventoryStorage] Error leyendo inventario local:', e);
    return DEFAULT_INITIAL_INVENTORY;
  }
}

function setLocalInventory(items) {
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando inventario local:', e);
  }
}

export function getLocalPaths() {
  try {
    const deletedIds = getDeletedPathIds();
    const raw = localStorage.getItem(PATHS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.filter((p) => !deletedIds.has(String(p.id)));
  } catch (e) {
    console.warn('[InventoryStorage] Error leyendo caminos locales:', e);
    return [];
  }
}

function setLocalPaths(paths) {
  try {
    localStorage.setItem(PATHS_STORAGE_KEY, JSON.stringify(paths));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando caminos locales:', e);
  }
}

/**
 * Carga el inventario: consulta Supabase y sincroniza con localStorage.
 * Si Supabase devuelve error o está offline, devuelve inmediatamente el inventario local.
 * Descarta automáticamente elementos eliminados previamente por el usuario.
 */
export async function loadFarmInventory() {
  const localItems = getLocalInventory();
  const deletedIds = getDeletedInventoryIds();

  // Filtrar local de inmediato para descartar cualquier remanente
  const cleanLocal = localItems.filter((loc) => !deletedIds.has(String(loc.id)));

  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Filtrar data remota excluyendo explícitamente los eliminados
      const cleanRemote = data.filter((d) => !deletedIds.has(String(d.id)));
      const remoteIds = new Set(cleanRemote.map((d) => String(d.id)));

      // Conservar locales que no estén todavía en remoto (modo local-first)
      const pendingLocals = cleanLocal.filter((loc) => !remoteIds.has(String(loc.id)));
      let merged = [...cleanRemote, ...pendingLocals];

      // Sembrar Casita Cueva únicamente la primera vez (nunca re-inyectar tras un borrado)
      const alreadySeeded = localStorage.getItem(DEFAULT_SEEDED_KEY) === '1';
      if (
        !alreadySeeded &&
        !deletedIds.has('00000000-0000-4000-8000-000000000001') &&
        !deletedIds.has('casita_cueva_principal') &&
        !merged.some((i) => (i.name || '').toLowerCase().includes('cueva'))
      ) {
        localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
        merged = [DEFAULT_INITIAL_INVENTORY[0], ...merged];
      } else if (merged.some((i) => (i.name || '').toLowerCase().includes('cueva'))) {
        localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
      }

      setLocalInventory(merged);
      return merged;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Supabase no disponible o tabla no creada, usando inventario local:', err.message);
  }

  setLocalInventory(cleanLocal);
  return cleanLocal;
}

/**
 * Guarda o inserta un nuevo item de inventario.
 * Asigna un UUID v4 válido garantizando compatibilidad con PostgreSQL y Supabase.
 */
export async function insertFarmInventoryItem(newItem) {
  const localItems = getLocalInventory();
  // Asignar UUID válido para la columna id UUID PRIMARY KEY de PostgreSQL
  const id = newItem.id && isValidUUID(newItem.id) ? newItem.id : generateUUID();
  const now = new Date().toISOString();

  // Si este ID estaba marcado como borrado, desmarcarlo (ej: al deshacer/revertir)
  removeDeletedInventoryId(id);

  const itemToSave = {
    ...newItem,
    id,
    created_at: newItem.created_at || now,
    updated_at: now,
    is_active: newItem.is_active !== false,
  };

  // 1. Guardar de inmediato en local (garantía de cero pérdida)
  const updatedLocal = [itemToSave, ...localItems.filter((i) => String(i.id) !== String(id))];
  setLocalInventory(updatedLocal);

  // 2. Intentar guardar en Supabase
  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .insert([itemToSave])
      .select()
      .single();

    if (!error && data) {
      const synced = updatedLocal.map((i) => (String(i.id) === String(id) ? data : i));
      setLocalInventory(synced);
      return data;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Guardado solo en local (Supabase pendiente):', err.message);
  }

  return itemToSave;
}

/**
 * Actualiza un item existente.
 */
export async function updateFarmInventoryItem(id, updatePayload) {
  const localItems = getLocalInventory();
  const now = new Date().toISOString();
  const targetIdStr = String(id);

  const updatedLocal = localItems.map((item) => {
    if (String(item.id) === targetIdStr) {
      return { ...item, ...updatePayload, updated_at: now };
    }
    return item;
  });
  setLocalInventory(updatedLocal);

  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .update({ ...updatePayload, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data;
  } catch (err) {
    console.warn('[InventoryStorage] Actualizado en local (Supabase pendiente):', err.message);
  }

  return updatedLocal.find((i) => String(i.id) === targetIdStr) || null;
}

/**
 * Elimina un item de inventario.
 * Aplica borrado local inmediato, registra en blacklist local anti-resurrección
 * y ejecuta soft-delete (is_active: false) + hard-delete en Supabase.
 */
export async function deleteFarmInventoryItem(id) {
  if (!id) return;
  const targetIdStr = String(id);
  const localItems = getLocalInventory();
  const targetItem = localItems.find((i) => String(i.id) === targetIdStr);
  const isCuevaDefault =
    targetIdStr === '00000000-0000-4000-8000-000000000001' ||
    targetIdStr === 'casita_cueva_principal' ||
    (targetItem?.name || '').toLowerCase().includes('cueva');

  // 1. Registrar en lista negra de eliminados para que loadFarmInventory no lo restaure
  addDeletedInventoryId(targetIdStr);
  if (isCuevaDefault) {
    addDeletedInventoryId('00000000-0000-4000-8000-000000000001');
    addDeletedInventoryId('casita_cueva_principal');
    try {
      localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
    } catch {
      // ignore
    }
  }

  // 2. Eliminar del almacenamiento local
  const filtered = localItems.filter((i) => String(i.id) !== targetIdStr);
  setLocalInventory(filtered);

  // 3. Persistir en Supabase (soft-delete + hard-delete si la política lo permite)
  if (isValidUUID(targetIdStr)) {
    try {
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('farm_inventory')
        .update({ is_active: false, updated_at: now })
        .eq('id', targetIdStr);
      if (updErr) {
        console.warn('[InventoryStorage] Error en soft-delete Supabase:', updErr.message);
      }

      const { error: delErr } = await supabase
        .from('farm_inventory')
        .delete()
        .eq('id', targetIdStr);
      if (delErr && !updErr) {
        // Si falló DELETE por falta de política RLS, el soft-delete (is_active: false) ya lo ocultó
        console.log('[InventoryStorage] Soft-delete aplicado en Supabase (DELETE bloqueado por RLS):', delErr.message);
      }
    } catch (err) {
      console.warn('[InventoryStorage] Eliminado en local (Supabase pendiente):', err.message);
    }
  }
}

/**
 * Carga de caminos con fallback a localStorage y exclusión de eliminados.
 */
export async function loadFarmPaths() {
  const localPaths = getLocalPaths();
  const deletedIds = getDeletedPathIds();
  const cleanLocal = localPaths.filter((loc) => !deletedIds.has(String(loc.id)));

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const cleanRemote = data.filter((d) => !deletedIds.has(String(d.id)));
      const remoteIds = new Set(cleanRemote.map((d) => String(d.id)));
      const pendingLocals = cleanLocal.filter((loc) => !remoteIds.has(String(loc.id)));
      const merged = [...cleanRemote, ...pendingLocals];
      setLocalPaths(merged);
      return merged;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Supabase no disponible para caminos, usando local:', err.message);
  }

  setLocalPaths(cleanLocal);
  return cleanLocal;
}

/**
 * Guarda o inserta un camino con fallback a localStorage y UUID válido.
 */
export async function insertFarmPath(newPath) {
  const localPaths = getLocalPaths();
  const id = newPath.id && isValidUUID(newPath.id) ? newPath.id : generateUUID();
  const now = new Date().toISOString();

  removeDeletedPathId(id);

  const pathToSave = {
    ...newPath,
    id,
    created_at: newPath.created_at || now,
    updated_at: now,
    is_active: newPath.is_active !== false,
  };

  const updatedLocal = [pathToSave, ...localPaths.filter((p) => String(p.id) !== String(id))];
  setLocalPaths(updatedLocal);

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .insert([pathToSave])
      .select()
      .single();

    if (!error && data) {
      const synced = updatedLocal.map((p) => (String(p.id) === String(id) ? data : p));
      setLocalPaths(synced);
      return data;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Camino guardado en local (Supabase pendiente):', err.message);
  }

  return pathToSave;
}

/**
 * Actualiza un camino existente con fallback a localStorage.
 */
export async function updateFarmPath(id, updatePayload) {
  const localPaths = getLocalPaths();
  const now = new Date().toISOString();
  const targetIdStr = String(id);

  const updatedLocal = localPaths.map((p) => {
    if (String(p.id) === targetIdStr) {
      return { ...p, ...updatePayload, updated_at: now };
    }
    return p;
  });
  setLocalPaths(updatedLocal);

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .update({ ...updatePayload, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data;
  } catch (err) {
    console.warn('[InventoryStorage] Camino actualizado en local (Supabase pendiente):', err.message);
  }

  return updatedLocal.find((p) => String(p.id) === targetIdStr) || null;
}

/**
 * Elimina un camino con soft-delete + hard-delete y blacklist local.
 */
export async function deleteFarmPath(id) {
  if (!id) return;
  const targetIdStr = String(id);

  addDeletedPathId(targetIdStr);

  const localPaths = getLocalPaths();
  const filtered = localPaths.filter((p) => String(p.id) !== targetIdStr);
  setLocalPaths(filtered);

  try {
    const now = new Date().toISOString();
    await supabase
      .from('farm_paths')
      .update({ is_active: false, updated_at: now })
      .eq('id', id);

    await supabase
      .from('farm_paths')
      .delete()
      .eq('id', id);
  } catch (err) {
    console.warn('[InventoryStorage] Camino eliminado en local (Supabase pendiente):', err.message);
  }
}

// ─── Taxonomía Unificada de Categorías y Subcategorías ────────────────────────
export const BASE_CATEGORY_MAP = {
  'Árboles': ['aguacate', 'olivo', 'limonero', 'naranjo', 'citrico', 'arbol', 'frutales', 'algarrobo', 'granado', 'mango', 'higuera', 'frutal'],
  'Plantas': ['planta', 'hierba', 'arbusto', 'herbaceo', 'vegetal', 'palmera', 'bambu', 'huerta'],
  'Riego / Agua': ['riego', 'llave', 'gotero', 'filtro', 'valvula', 'contador', 'arqueta', 'pozo', 'deposito', 'cisterna', 'grifo', 'tuberia', 'manguera', 'aspersor', 'bomba', 'caudal', 'acequia'],
  'Casas': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Casas / Edificios': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Herramientas': ['herramienta', 'maquina', 'tractor', 'moto', 'equipo', 'mobiliario', 'apero'],
  'Hitos': ['mojon', 'linde', 'piedra', 'marca', 'señal', 'cota', 'limite'],
  'Otros': [],
};

const BASE_CATEGORY_COLORS = {
  'Árboles': '#16a34a',           // Verde oscuro
  'Plantas': '#4ade80',           // Verde claro
  'Riego / Agua': '#0284c7',      // Azul
  'Casas': '#eab308',             // Amarillo
  'Casas / Edificios': '#eab308', // Amarillo (retrocompatibilidad)
  'Edificios': '#eab308',         // Amarillo (retrocompatibilidad)
  'Herramientas': '#f97316',      // Naranja
  'Hitos': '#8b5cf6',             // Púrpura
  'Otros': '#64748b',             // Pizarra
};

const DYNAMIC_PALETTE = [
  '#06b6d4', // Cian
  '#ec4899', // Rosa fucsia
  '#14b8a6', // Teal esmeralda
  '#f43f5e', // Coral
  '#a855f7', // Púrpura
  '#6366f1', // Índigo
  '#84cc16', // Lima
  '#d97706', // Ámbar tostado
  '#0d9488', // Verde azulado
  '#e11d48', // Rubí
];

export function getCategoryColor(categoryName) {
  if (!categoryName) return '#64748b';
  if (BASE_CATEGORY_COLORS[categoryName]) return BASE_CATEGORY_COLORS[categoryName];

  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DYNAMIC_PALETTE.length;
  return DYNAMIC_PALETTE[index];
}

export const PATH_TYPE_COLORS = {
  'camino': '#92400e',        // Marrón
  'carril': '#a16207',        // Ocre / tierra
  'sendero': '#b45309',       // Marrón claro
  'vereda': '#d97706',        // Ámbar
  'acequia': '#1d4ed8',       // Azul marino
  'linea_riego': '#38bdf8',   // Azul claro
  'linde': '#ef4444',         // Rojo
  'otro': '#64748b',          // Pizarra
};

/**
 * Determina la categoría de un elemento del inventario con promoción dinámica.
 */
export function getItemCategory(item) {
  if (!item) return 'Otros';

  const rawCat = (item.category || '').trim();
  if (rawCat === 'Casas / Edificios' || rawCat === 'Edificios') {
    return 'Casas';
  }
  if (rawCat && BASE_CATEGORY_MAP[rawCat]) {
    return rawCat;
  }

  const normCat = rawCat
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normCat) {
    if (normCat.includes('casa') || normCat.includes('cueva') || normCat.includes('edificio')) {
      return 'Casas';
    }
    for (const [parent, keywords] of Object.entries(BASE_CATEGORY_MAP)) {
      if (parent === 'Otros' || parent === 'Casas / Edificios') continue;
      if (keywords.some((k) => normCat.includes(k))) return parent;
    }
    if (normCat !== 'otros' && normCat !== 'otro' && normCat !== 'inventario') {
      return rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
    }
  }

  const text = [item.tipo, item.variety_type, item.name, item.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (text.includes('casa') || text.includes('cueva') || text.includes('edificio')) {
    return 'Casas';
  }

  for (const [parent, keywords] of Object.entries(BASE_CATEGORY_MAP)) {
    if (parent === 'Otros' || parent === 'Casas / Edificios') continue;
    if (keywords.some((k) => text.includes(k))) return parent;
  }

  const explicitTipo = (item.tipo || '').trim();
  if (explicitTipo && explicitTipo.toLowerCase() !== 'otros' && explicitTipo.toLowerCase() !== 'otro') {
    return explicitTipo.charAt(0).toUpperCase() + explicitTipo.slice(1);
  }

  return 'Otros';
}

/**
 * Obtiene las subcategorías presentes dentro de una categoría padre.
 */
export function getSubcategoriesForParent(inventory, parent) {
  const subs = new Set();
  (inventory || []).forEach((item) => {
    const itemParent = getItemCategory(item);
    if (itemParent === parent) {
      const subLabel = item.variety_type || item.tipo || item.name;
      if (subLabel && subLabel !== parent) {
        subs.add(subLabel);
      }
    }
  });
  return [...subs];
}
