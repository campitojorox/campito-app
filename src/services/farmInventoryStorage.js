// src/services/farmInventoryStorage.js
// Servicio Local-First para inventario y caminos de Campito Jorox con sincronización resiliente a Supabase.
// Garantiza que los pines y trazados NUNCA queden invisibles ni se pierdan,
// funcionando inmediatamente en local mientras se sincroniza con Supabase en la nube.

import { supabase } from '../supabaseClient';
import { normalizeCoordinatesArray } from '../components/map/mapUtils';

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
    category: 'Casas',
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

export const DB_ALLOWED_CATEGORIES = new Set([
  'arbol',
  'planta',
  'riego_linea',
  'arqueta',
  'acequia',
  'piedra_linde',
  'pozo_deposito',
  'maquinaria',
  'otro',
]);

export function toDbCategory(uiCategory) {
  if (!uiCategory) return 'otro';
  const norm = String(uiCategory).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (norm.includes('arbol') || norm.includes('frutal') || norm.includes('aguacate') || norm.includes('olivo') || norm.includes('citrico')) return 'arbol';
  if (norm.includes('planta') || norm.includes('hierba') || norm.includes('huerta')) return 'planta';
  if (norm.includes('arqueta')) return 'arqueta';
  if (norm.includes('acequia')) return 'acequia';
  if (norm.includes('riego') || norm.includes('tuberia') || norm.includes('manguera')) return 'riego_linea';
  if (norm.includes('linde') || norm.includes('mojon') || norm.includes('cota') || norm.includes('hito')) return 'piedra_linde';
  if (norm.includes('pozo') || norm.includes('deposito')) return 'pozo_deposito';
  if (norm.includes('herramienta') || norm.includes('maquin') || norm.includes('tractor')) return 'maquinaria';
  return 'otro';
}

export function sanitizeInventoryForDb(item) {
  if (!item) return null;
  const id = item.id && isValidUUID(item.id) ? item.id : generateUUID();
  const lat = Number(item.latitude ?? item.lat ?? item.coordenadas?.lat);
  const lng = Number(item.longitude ?? item.lng ?? item.coordenadas?.lng);

  return {
    id,
    created_at: item.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: item.user_id || null,
    user_name: item.user_name || null,
    name: String(item.name || item.title || item.tipo || 'Punto registrado').trim(),
    category: item.category || 'otro',
    variety_type: item.variety_type || item.variedad || item.variety || null,
    latitude: !isNaN(lat) ? lat : 36.72595,
    longitude: !isNaN(lng) ? lng : -4.89462,
    accuracy_meters: item.accuracy_meters !== undefined && item.accuracy_meters !== null ? Number(item.accuracy_meters) : null,
    altitude_meters: item.altitude_meters !== undefined && item.altitude_meters !== null ? Number(item.altitude_meters) : null,
    zone: item.zone || null,
    audio_timestamp_s: item.audio_timestamp_s !== undefined && item.audio_timestamp_s !== null ? Number(item.audio_timestamp_s) : null,
    gps_warning: Boolean(item.gps_warning),
    status: item.status || item.estado || 'saludable',
    image_url: item.image_url || item.photo_url || item.foto_url || null,
    notes: item.notes || item.observaciones || item.notas || '',
    is_active: item.is_active !== false,
  };
}

export function sanitizePathForDb(path) {
  if (!path) return null;
  const id = path.id && isValidUUID(path.id) ? path.id : generateUUID();
  const rawCoords = path.coordinates || path.coords || [];
  const coords = normalizeCoordinatesArray(rawCoords);

  let pathType = path.path_type || path.tipo || 'camino';
  const norm = String(path.category || pathType).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('riego') || norm.includes('tuberia') || norm.includes('manguera')) pathType = 'linea_riego';
  else if (norm.includes('acequia')) pathType = 'acequia';
  else if (norm.includes('sendero')) pathType = 'sendero';
  else if (norm.includes('linde')) pathType = 'linde';
  else if (norm.includes('camino') || norm.includes('pista')) pathType = 'camino';

  return {
    id,
    created_at: path.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: path.user_id || null,
    user_name: path.user_name || null,
    name: String(path.name || path.title || 'Recorrido registrado').trim(),
    path_type: pathType,
    coordinates: coords,
    color: path.color || PATH_TYPE_COLORS[pathType] || '#f97316',
    stroke_width: Number(path.stroke_width) || 4,
    stroke_style: path.stroke_style || 'solid',
    length_meters: path.length_meters !== undefined && path.length_meters !== null ? Number(path.length_meters) : null,
    zone: path.zone || null,
    notes: path.notes || '',
    is_active: path.is_active !== false,
  };
}

async function callFarmSyncProxy(action, body) {
  try {
    const res = await fetch('/api/farm-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[InventoryStorage] Fallback proxy error (${action}):`, err.message);
    return null;
  }
}

let isSyncingPendingInv = false;
async function syncPendingLocalsToRemote(pendingItems) {
  if (isSyncingPendingInv || !Array.isArray(pendingItems) || pendingItems.length === 0) return;
  isSyncingPendingInv = true;
  try {
    for (const item of pendingItems) {
      if (item.id === '00000000-0000-4000-8000-000000000001') continue;
      const dbPayload = sanitizeInventoryForDb(item);
      let { error } = await supabase.from('farm_inventory').upsert([dbPayload]);
      if (error && (error.code === '23514' || error.message?.includes('category_check'))) {
        dbPayload.category = toDbCategory(item.category);
        dbPayload.variety_type = `${item.category}${item.variety_type ? ` · ${item.variety_type}` : ''}`;
        const retry = await supabase.from('farm_inventory').upsert([dbPayload]);
        error = retry.error;
      }
      if (error) {
        await callFarmSyncProxy('INSERT_INVENTORY', { payload: dbPayload });
      }
    }
  } catch (e) {
    console.warn('[InventoryStorage] Error sincronizando inventario local pendiente:', e);
  } finally {
    isSyncingPendingInv = false;
  }
}

let isSyncingPendingPaths = false;
async function syncPendingPathsToRemote(pendingPaths) {
  if (isSyncingPendingPaths || !Array.isArray(pendingPaths) || pendingPaths.length === 0) return;
  isSyncingPendingPaths = true;
  try {
    for (const path of pendingPaths) {
      const dbPayload = sanitizePathForDb(path);
      let { error } = await supabase.from('farm_paths').upsert([dbPayload]);
      if (error) {
        await callFarmSyncProxy('INSERT_PATH', { payload: dbPayload });
      }
    }
  } catch (e) {
    console.warn('[InventoryStorage] Error sincronizando caminos locales pendientes:', e);
  } finally {
    isSyncingPendingPaths = false;
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

      // Sincronizar en segundo plano los pendientes locales para que Safari / otros dispositivos los vean
      if (pendingLocals.length > 0) {
        syncPendingLocalsToRemote(pendingLocals);
      }

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
 * Guarda o inserta un nuevo item de inventario con sincronización resiliente y proxy de rescate.
 */
export async function insertFarmInventoryItem(newItem) {
  const localItems = getLocalInventory();
  const id = newItem.id && isValidUUID(newItem.id) ? newItem.id : generateUUID();
  const now = new Date().toISOString();

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

  // 2. Preparar payload sanitizado para PostgreSQL
  const dbPayload = sanitizeInventoryForDb(itemToSave);

  // 3. Intentar guardar en Supabase directamente
  try {
    let { data, error } = await supabase
      .from('farm_inventory')
      .insert([dbPayload])
      .select()
      .single();

    if (error && (error.code === '23514' || error.message?.includes('category_check'))) {
      console.warn('[InventoryStorage] Categoría rechazada por constraint, reintentando con fallback...');
      dbPayload.category = toDbCategory(itemToSave.category);
      dbPayload.variety_type = `${itemToSave.category}${itemToSave.variety_type ? ` · ${itemToSave.variety_type}` : ''}`;
      const retry = await supabase.from('farm_inventory').insert([dbPayload]).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('[InventoryStorage] Inserción directa falló (' + error.code + '), llamando proxy /api/farm-sync...', error.message);
      const proxyRes = await callFarmSyncProxy('INSERT_INVENTORY', { payload: dbPayload });
      if (proxyRes?.data) {
        data = proxyRes.data;
        error = null;
      }
    }

    if (!error && data) {
      const synced = updatedLocal.map((i) => (String(i.id) === String(id) ? { ...itemToSave, ...data } : i));
      setLocalInventory(synced);
      return { ...itemToSave, ...data };
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error en llamada Supabase, intentando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('INSERT_INVENTORY', { payload: dbPayload });
    if (proxyRes?.data) {
      const synced = updatedLocal.map((i) => (String(i.id) === String(id) ? { ...itemToSave, ...proxyRes.data } : i));
      setLocalInventory(synced);
      return { ...itemToSave, ...proxyRes.data };
    }
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

  const cleanPayload = { ...updatePayload, updated_at: now };
  if (cleanPayload.category && !DB_ALLOWED_CATEGORIES.has(cleanPayload.category)) {
    // Si viene una categoría fuera del constraint, adaptar limpiamente
    cleanPayload.category = toDbCategory(cleanPayload.category);
  }
  if (cleanPayload.photo_url && !cleanPayload.image_url) {
    cleanPayload.image_url = cleanPayload.photo_url;
    delete cleanPayload.photo_url;
  }
  delete cleanPayload.raw;
  delete cleanPayload.tipo;
  delete cleanPayload.title;

  try {
    let { data, error } = await supabase
      .from('farm_inventory')
      .update(cleanPayload)
      .eq('id', id)
      .select()
      .single();

    if (error && (error.code === '23514' || error.message?.includes('category_check'))) {
      cleanPayload.category = 'otro';
      const retry = await supabase.from('farm_inventory').update(cleanPayload).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const proxyRes = await callFarmSyncProxy('UPDATE_INVENTORY', { id, payload: cleanPayload });
      if (proxyRes?.data) data = proxyRes.data;
    }

    if (data) return data;
  } catch (err) {
    console.warn('[InventoryStorage] Error actualizando en Supabase, usando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('UPDATE_INVENTORY', { id, payload: cleanPayload });
    if (proxyRes?.data) return proxyRes.data;
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

  // 3. Persistir en Supabase (soft-delete + hard-delete)
  if (isValidUUID(targetIdStr)) {
    try {
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('farm_inventory')
        .update({ is_active: false, updated_at: now })
        .eq('id', targetIdStr);

      const { error: delErr } = await supabase
        .from('farm_inventory')
        .delete()
        .eq('id', targetIdStr);

      if (delErr || updErr) {
        await callFarmSyncProxy('DELETE_INVENTORY', { id: targetIdStr });
      }
    } catch (err) {
      console.warn('[InventoryStorage] Error borrando en Supabase, usando proxy:', err.message);
      await callFarmSyncProxy('DELETE_INVENTORY', { id: targetIdStr });
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

      if (pendingLocals.length > 0) {
        syncPendingPathsToRemote(pendingLocals);
      }

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

  const dbPayload = sanitizePathForDb(pathToSave);

  try {
    let { data, error } = await supabase
      .from('farm_paths')
      .insert([dbPayload])
      .select()
      .single();

    if (error) {
      console.warn('[InventoryStorage] Inserción directa camino falló, llamando proxy /api/farm-sync...', error.message);
      const proxyRes = await callFarmSyncProxy('INSERT_PATH', { payload: dbPayload });
      if (proxyRes?.data) {
        data = proxyRes.data;
        error = null;
      }
    }

    if (!error && data) {
      const synced = updatedLocal.map((p) => (String(p.id) === String(id) ? { ...pathToSave, ...data } : p));
      setLocalPaths(synced);
      return { ...pathToSave, ...data };
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error en insertFarmPath, intentando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('INSERT_PATH', { payload: dbPayload });
    if (proxyRes?.data) {
      const synced = updatedLocal.map((p) => (String(p.id) === String(id) ? { ...pathToSave, ...proxyRes.data } : p));
      setLocalPaths(synced);
      return { ...pathToSave, ...proxyRes.data };
    }
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

  const cleanPayload = { ...updatePayload, updated_at: now };
  if (cleanPayload.category && !cleanPayload.path_type) {
    let pt = 'camino';
    const norm = String(cleanPayload.category).toLowerCase();
    if (norm.includes('riego')) pt = 'linea_riego';
    else if (norm.includes('acequia')) pt = 'acequia';
    else if (norm.includes('sendero')) pt = 'sendero';
    else if (norm.includes('linde')) pt = 'linde';
    cleanPayload.path_type = pt;
  }
  delete cleanPayload.category;
  delete cleanPayload.title;
  delete cleanPayload.raw;

  try {
    let { data, error } = await supabase
      .from('farm_paths')
      .update(cleanPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      const proxyRes = await callFarmSyncProxy('UPDATE_PATH', { id, payload: cleanPayload });
      if (proxyRes?.data) data = proxyRes.data;
    }

    if (data) return data;
  } catch (err) {
    console.warn('[InventoryStorage] Error actualizando camino en Supabase, usando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('UPDATE_PATH', { id, payload: cleanPayload });
    if (proxyRes?.data) return proxyRes.data;
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
    const { error: updErr } = await supabase
      .from('farm_paths')
      .update({ is_active: false, updated_at: now })
      .eq('id', id);

    const { error: delErr } = await supabase
      .from('farm_paths')
      .delete()
      .eq('id', id);

    if (delErr || updErr) {
      await callFarmSyncProxy('DELETE_PATH', { id });
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error eliminando camino en Supabase, usando proxy:', err.message);
    await callFarmSyncProxy('DELETE_PATH', { id });
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

  if (item.variety_type) {
    const vt = String(item.variety_type).split('·')[0].trim();
    if (vt === 'Casas / Edificios' || vt === 'Edificios' || vt === 'Casas') {
      return 'Casas';
    }
    if (BASE_CATEGORY_MAP[vt]) {
      return vt;
    }
  }

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
