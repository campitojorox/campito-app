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
const PENDING_INVENTORY_CREATIONS_KEY = 'campito_pending_inventory_creations';
const PENDING_PATHS_CREATIONS_KEY = 'campito_pending_paths_creations';

// ─── Canal de difusión universal para sincronizar pestañas y ventanas activas ───
const mapSyncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('campito_map_sync_channel')
  : null;

if (mapSyncBroadcast) {
  mapSyncBroadcast.onmessage = (event) => {
    const { type, id, deleted, item, path } = event.data || {};
    if (typeof window === 'undefined') return;
    if (type === 'INVENTORY_CHANGED') {
      window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id, deleted, ...item } }));
    } else if (type === 'PATHS_CHANGED') {
      window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id, deleted, ...path } }));
    } else if (type === 'CATEGORIES_CHANGED') {
      window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: event.data }));
    }
  };
}

export function broadcastMapSync(type, id, extra = {}) {
  try {
    mapSyncBroadcast?.postMessage({ type, id, ...extra });
  } catch (err) {
    console.warn('[InventoryStorage] Error en broadcastMapSync:', err);
  }
}

/**
 * Validador de formato UUID v4
 */
export function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Generador universal de UUID v4 compatible con navegadores y Node
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Buzón Outbox para creaciones offline pendientes de sincronizar ───────────
function getPendingInventoryCreations() {
  try {
    const raw = localStorage.getItem(PENDING_INVENTORY_CREATIONS_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function addPendingInventoryCreation(id) {
  if (!id) return;
  try {
    const current = getPendingInventoryCreations();
    current.add(String(id));
    localStorage.setItem(PENDING_INVENTORY_CREATIONS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando creación pendiente de inventario:', e);
  }
}

function removePendingInventoryCreation(id) {
  if (!id) return;
  try {
    const current = getPendingInventoryCreations();
    current.delete(String(id));
    localStorage.setItem(PENDING_INVENTORY_CREATIONS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error removiendo creación pendiente de inventario:', e);
  }
}

function getPendingPathCreations() {
  try {
    const raw = localStorage.getItem(PENDING_PATHS_CREATIONS_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function addPendingPathCreation(id) {
  if (!id) return;
  try {
    const current = getPendingPathCreations();
    current.add(String(id));
    localStorage.setItem(PENDING_PATHS_CREATIONS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando creación pendiente de camino:', e);
  }
}

function removePendingPathCreation(id) {
  if (!id) return;
  try {
    const current = getPendingPathCreations();
    current.delete(String(id));
    localStorage.setItem(PENDING_PATHS_CREATIONS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error removiendo creación pendiente de camino:', e);
  }
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
  const pendingCreations = getPendingInventoryCreations();

  // Filtrar local de inmediato para descartar cualquier remanente borrado
  const cleanLocal = localItems.filter((loc) => !deletedIds.has(String(loc.id)));

  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Filtrar data remota excluyendo cualquier borrado pendiente local
      const cleanRemote = data
        .filter((d) => !deletedIds.has(String(d.id)))
        .map((d) => ({ ...d, _synced: true }));
      const remoteIds = new Set(cleanRemote.map((d) => String(d.id)));

      // ─── REGLA OUTBOX DISTRIBUIDA (CERO RESURRECCIONES ZOMBIE) ───
      // Un elemento local solo se conserva como pendiente si está explícitamente en pendingCreations.
      // Si un elemento ya estaba sincronizado y Supabase ya no lo devuelve, SIGNIFICA QUE FUE BORRADO
      // en otro dispositivo (por ejemplo, iPhone). Se elimina de la caché local de inmediato.
      const trulyPendingLocals = cleanLocal.filter(
        (loc) => !remoteIds.has(String(loc.id)) && pendingCreations.has(String(loc.id))
      );

      let merged = [...cleanRemote, ...trulyPendingLocals];

      // Sincronizar en segundo plano únicamente las creaciones offline pendientes reales
      if (trulyPendingLocals.length > 0) {
        syncPendingLocalsToRemote(trulyPendingLocals);
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
  addPendingInventoryCreation(id);

  const itemToSave = {
    ...newItem,
    id,
    created_at: newItem.created_at || now,
    updated_at: now,
    is_active: newItem.is_active !== false,
    _synced: false,
  };

  // 1. Guardar de inmediato en local (garantía de cero latencia)
  const updatedLocal = [itemToSave, ...localItems.filter((i) => String(i.id) !== String(id))];
  setLocalInventory(updatedLocal);

  broadcastMapSync('INVENTORY_CHANGED', id, { item: itemToSave });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: itemToSave }));
  }

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
      removePendingInventoryCreation(id);
      const synced = updatedLocal.map((i) => (String(i.id) === String(id) ? { ...itemToSave, ...data, _synced: true } : i));
      setLocalInventory(synced);
      return { ...itemToSave, ...data, _synced: true };
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error en llamada Supabase, intentando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('INSERT_INVENTORY', { payload: dbPayload });
    if (proxyRes?.data) {
      removePendingInventoryCreation(id);
      const synced = updatedLocal.map((i) => (String(i.id) === String(id) ? { ...itemToSave, ...proxyRes.data, _synced: true } : i));
      setLocalInventory(synced);
      return { ...itemToSave, ...proxyRes.data, _synced: true };
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

  broadcastMapSync('INVENTORY_CHANGED', targetIdStr, { item: { id: targetIdStr, ...updatePayload } });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetIdStr, ...updatePayload } }));
  }

  const cleanPayload = { ...updatePayload, updated_at: now };
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
      cleanPayload.category = toDbCategory(updatePayload.category);
      cleanPayload.variety_type = `${updatePayload.category || ''}${updatePayload.variety_type ? ` · ${updatePayload.variety_type}` : ''}`;
      const retry = await supabase.from('farm_inventory').update(cleanPayload).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const proxyRes = await callFarmSyncProxy('UPDATE_INVENTORY', { id, payload: cleanPayload });
      if (proxyRes?.data) data = proxyRes.data;
    }

    if (data) {
      const synced = updatedLocal.map((i) => (String(i.id) === targetIdStr ? { ...i, ...data, _synced: true } : i));
      setLocalInventory(synced);
      return data;
    }
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

  // 1. Registrar en lista negra de eliminados y limpiar outbox de creación
  addDeletedInventoryId(targetIdStr);
  removePendingInventoryCreation(targetIdStr);

  if (isCuevaDefault) {
    addDeletedInventoryId('00000000-0000-4000-8000-000000000001');
    addDeletedInventoryId('casita_cueva_principal');
    try {
      localStorage.setItem(DEFAULT_SEEDED_KEY, '1');
    } catch {
      // ignore
    }
  }

  // 2. Eliminar del almacenamiento local de inmediato
  const filtered = localItems.filter((i) => String(i.id) !== targetIdStr);
  setLocalInventory(filtered);

  // 3. Notificar inmediatamente a todas las pestañas y vistas
  broadcastMapSync('INVENTORY_CHANGED', targetIdStr, { deleted: true });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-inventory-updated', { detail: { id: targetIdStr, deleted: true } }));
  }

  // 4. Persistir en Supabase (soft-delete + hard-delete)
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
      removeDeletedInventoryId(targetIdStr);
    } catch (err) {
      console.warn('[InventoryStorage] Error borrando en Supabase, usando proxy:', err.message);
      const res = await callFarmSyncProxy('DELETE_INVENTORY', { id: targetIdStr });
      if (res?.success) removeDeletedInventoryId(targetIdStr);
    }
  }
}

/**
 * Carga de caminos con fallback a localStorage y exclusión de eliminados.
 */
export async function loadFarmPaths() {
  const localPaths = getLocalPaths();
  const deletedIds = getDeletedPathIds();
  const pendingCreations = getPendingPathCreations();
  const cleanLocal = localPaths.filter((loc) => !deletedIds.has(String(loc.id)));

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const cleanRemote = data
        .filter((d) => !deletedIds.has(String(d.id)))
        .map((d) => ({ ...d, _synced: true }));
      const remoteIds = new Set(cleanRemote.map((d) => String(d.id)));

      // ─── REGLA OUTBOX DISTRIBUIDA (CERO RESURRECCIONES ZOMBIE EN CAMINOS) ───
      const trulyPendingLocals = cleanLocal.filter(
        (loc) => !remoteIds.has(String(loc.id)) && pendingCreations.has(String(loc.id))
      );
      const merged = [...cleanRemote, ...trulyPendingLocals];

      if (trulyPendingLocals.length > 0) {
        syncPendingPathsToRemote(trulyPendingLocals);
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
  addPendingPathCreation(id);

  const pathToSave = {
    ...newPath,
    id,
    created_at: newPath.created_at || now,
    updated_at: now,
    is_active: newPath.is_active !== false,
    _synced: false,
  };

  const updatedLocal = [pathToSave, ...localPaths.filter((p) => String(p.id) !== String(id))];
  setLocalPaths(updatedLocal);

  broadcastMapSync('PATHS_CHANGED', id, { path: pathToSave });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: pathToSave }));
  }

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
      removePendingPathCreation(id);
      const synced = updatedLocal.map((p) => (String(p.id) === String(id) ? { ...pathToSave, ...data, _synced: true } : p));
      setLocalPaths(synced);
      return { ...pathToSave, ...data, _synced: true };
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error en insertFarmPath, intentando proxy:', err.message);
    const proxyRes = await callFarmSyncProxy('INSERT_PATH', { payload: dbPayload });
    if (proxyRes?.data) {
      removePendingPathCreation(id);
      const synced = updatedLocal.map((p) => (String(p.id) === String(id) ? { ...pathToSave, ...proxyRes.data, _synced: true } : p));
      setLocalPaths(synced);
      return { ...pathToSave, ...proxyRes.data, _synced: true };
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

  broadcastMapSync('PATHS_CHANGED', targetIdStr, { path: { id: targetIdStr, ...updatePayload } });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetIdStr, ...updatePayload } }));
  }

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

    if (data) {
      const synced = updatedLocal.map((p) => (String(p.id) === targetIdStr ? { ...p, ...data, _synced: true } : p));
      setLocalPaths(synced);
      return data;
    }
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
  removePendingPathCreation(targetIdStr);

  const localPaths = getLocalPaths();
  const filtered = localPaths.filter((p) => String(p.id) !== targetIdStr);
  setLocalPaths(filtered);

  broadcastMapSync('PATHS_CHANGED', targetIdStr, { deleted: true });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-paths-updated', { detail: { id: targetIdStr, deleted: true } }));
  }

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
    removeDeletedPathId(targetIdStr);
  } catch (err) {
    console.warn('[InventoryStorage] Error eliminando camino en Supabase, usando proxy:', err.message);
    const res = await callFarmSyncProxy('DELETE_PATH', { id });
    if (res?.success) removeDeletedPathId(targetIdStr);
  }
}

// ─── Taxonomía Unificada de Categorías y Subcategorías ────────────────────────
export const BASE_CATEGORY_MAP = {
  'Árboles': ['aguacate', 'olivo', 'limonero', 'naranjo', 'citrico', 'arbol', 'frutales', 'algarrobo', 'granado', 'mango', 'higuera', 'frutal'],
  'Plantas': ['planta', 'hierba', 'arbusto', 'herbaceo', 'vegetal', 'palmera', 'bambu', 'huerta'],
  'Riego / Agua': ['riego', 'llave', 'gotero', 'filtro', 'valvula', 'contador', 'arqueta', 'pozo', 'deposito', 'cisterna', 'grifo', 'tuberia', 'manguera', 'aspersor', 'bomba', 'caudal', 'acequia'],
  'Ríos / Arroyos': ['rio', 'arroyo', 'cauce', 'torrente', 'barranco', 'riachuelo', 'rambla', 'vado', 'cascada', 'nacimiento'],
  'Rios / Arroyos': ['rio', 'arroyo', 'cauce', 'torrente', 'barranco', 'riachuelo', 'rambla', 'vado', 'cascada', 'nacimiento'],
  'Casas': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Casas / Edificios': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Caminos y Trazados': ['camino', 'sendero', 'carril', 'vereda', 'acequia', 'linea_riego', 'trazado', 'pista', 'senda', 'linde', 'calle'],
  'Herramientas': ['herramienta', 'maquina', 'tractor', 'moto', 'equipo', 'mobiliario', 'apero'],
  'Hitos': ['mojon', 'linde', 'piedra', 'marca', 'señal', 'cota', 'limite'],
  'Otros': [],
};

export const BASE_CATEGORY_COLORS = {
  'Árboles': '#16a34a',           // Verde oscuro
  'Plantas': '#4ade80',           // Verde claro
  'Riego / Agua': '#0284c7',      // Azul
  'Ríos / Arroyos': '#06b6d4',    // Cian acuático
  'Rios / Arroyos': '#06b6d4',    // Cian acuático
  'Casas': '#eab308',             // Amarillo
  'Casas / Edificios': '#eab308', // Amarillo (retrocompatibilidad)
  'Edificios': '#eab308',         // Amarillo (retrocompatibilidad)
  'Caminos y Trazados': '#f97316',// Naranja
  'Caminos': '#f97316',           // Naranja
  'Herramientas': '#ea580c',      // Naranja rojizo
  'Hitos': '#8b5cf6',             // Púrpura
  'Otros': '#64748b',             // Pizarra
};

export const DYNAMIC_PALETTE = [
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

const CUSTOM_CATEGORIES_KEY = 'campito_custom_categories_cache';
const DELETED_CATEGORIES_KEY = 'campito_deleted_categories_cache';

export function getDeletedCategories() {
  try {
    const raw = localStorage.getItem(DELETED_CATEGORIES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function setDeletedCategories(setOrArray) {
  try {
    localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(setOrArray)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando categorías eliminadas:', e);
  }
}

export function getCustomCategories() {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCustomCategories(cats) {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando categorías personalizadas:', e);
  }
}

/**
 * Obtiene la lista completa y viva de categorías de la finca (nativas + personalizadas no eliminadas).
 */
export function getFarmCategories() {
  const deleted = getDeletedCategories();
  const custom = getCustomCategories();

  const defaultList = [
    {
      name: 'Árboles',
      subcategories: ['Aguacate Hass', 'Aguacate Bacon', 'Olivo', 'Limonero', 'Naranjo', 'Algarrobo', 'Higuera', 'Frutales'],
      color: BASE_CATEGORY_COLORS['Árboles'],
      isDefault: true,
    },
    {
      name: 'Plantas',
      subcategories: ['Huerta', 'Arbusto', 'Hierba', 'Palmera', 'Bambú'],
      color: BASE_CATEGORY_COLORS['Plantas'],
      isDefault: true,
    },
    {
      name: 'Riego / Agua',
      subcategories: ['Llave de paso', 'Gotero', 'Filtro', 'Válvula', 'Arqueta', 'Pozo', 'Depósito', 'Tubería', 'Bomba', 'Acequia'],
      color: BASE_CATEGORY_COLORS['Riego / Agua'],
      isDefault: true,
    },
    {
      name: 'Ríos / Arroyos',
      subcategories: ['Río', 'Arroyo', 'Cauce natural', 'Torrente', 'Barranco', 'Vado', 'Nacimiento'],
      color: BASE_CATEGORY_COLORS['Ríos / Arroyos'],
      isDefault: true,
    },
    {
      name: 'Casas',
      subcategories: ['Casita Cueva', 'Almacén', 'Taller', 'Caseta', 'Caravana'],
      color: BASE_CATEGORY_COLORS['Casas'],
      isDefault: true,
    },
    {
      name: 'Caminos y Trazados',
      subcategories: ['Sendero', 'Carril agrícola', 'Camino principal', 'Vereda', 'Acequia', 'Línea de Riego', 'Linde', 'Otro trazado'],
      color: BASE_CATEGORY_COLORS['Caminos y Trazados'],
      isDefault: true,
    },
    {
      name: 'Herramientas',
      subcategories: ['Tractor', 'Maquinaria', 'Apero', 'Mobiliario', 'Equipo'],
      color: BASE_CATEGORY_COLORS['Herramientas'],
      isDefault: true,
    },
    {
      name: 'Hitos',
      subcategories: ['Mojón', 'Linde', 'Piedra', 'Cota catastral'],
      color: BASE_CATEGORY_COLORS['Hitos'],
      isDefault: true,
    },
  ];

  const map = new Map();

  defaultList.forEach((c) => {
    if (!deleted.has(c.name)) {
      map.set(c.name.toLowerCase(), c);
    }
  });

  custom.forEach((c) => {
    if (!c.name || deleted.has(c.name)) return;
    const key = c.name.toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key);
      const mergedSubs = Array.from(new Set([...(existing.subcategories || []), ...(c.subcategories || [])]));
      map.set(key, { ...existing, ...c, subcategories: mergedSubs });
    } else {
      map.set(key, {
        name: c.name,
        subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
        color: c.color || getCategoryColor(c.name),
        isDefault: false,
      });
    }
  });

  const list = Array.from(map.values());
  if (!deleted.has('Otros')) {
    list.push({
      name: 'Otros',
      subcategories: ['Sin clasificar'],
      color: BASE_CATEGORY_COLORS['Otros'],
      isDefault: true,
    });
  }
  return list;
}

/**
 * Crea una nueva categoría o expande una existente con nuevas subcategorías.
 */
export function createFarmCategory({ name, subcategories = [], color = null, icon = null }) {
  if (!name || typeof name !== 'string') return null;
  const cleanName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
  if (!cleanName) return null;

  const deleted = getDeletedCategories();
  if (deleted.has(cleanName)) {
    deleted.delete(cleanName);
    setDeletedCategories(deleted);
  }

  const custom = getCustomCategories();
  const existingIdx = custom.findIndex((c) => c.name.toLowerCase() === cleanName.toLowerCase());

  const subArray = Array.isArray(subcategories)
    ? subcategories.map((s) => String(s).trim()).filter(Boolean)
    : [];

  let savedCat;
  if (existingIdx >= 0) {
    const existing = custom[existingIdx];
    const updatedSubs = Array.from(new Set([...(existing.subcategories || []), ...subArray]));
    savedCat = {
      ...existing,
      color: color || existing.color || getCategoryColor(cleanName),
      subcategories: updatedSubs,
      updated_at: new Date().toISOString(),
    };
    custom[existingIdx] = savedCat;
  } else {
    savedCat = {
      id: generateUUID(),
      name: cleanName,
      color: color || getCategoryColor(cleanName),
      subcategories: subArray,
      icon: icon || null,
      isDefault: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    custom.push(savedCat);
  }

  setCustomCategories(custom);

  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', cleanName, { category: savedCat });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: { category: savedCat } }));
  }

  return savedCat;
}

export function saveFarmCategory(name, subcategories = [], color = null) {
  return createFarmCategory({ name, subcategories, color });
}

/**
 * Elimina una categoría. Puede opcionalmente borrar sus puntos asociados en el mapa
 * o reasignarlos a otra categoría (por defecto 'Otros').
 */
export async function deleteFarmCategory({ name, deleteItems = true, reassignTo = 'Otros' }) {
  if (!name) return { success: false, reason: 'Nombre de categoría no proporcionado' };
  const cleanName = name.trim();

  const deleted = getDeletedCategories();
  deleted.add(cleanName);
  const allCurrent = getFarmCategories();
  const match = allCurrent.find((c) => c.name.toLowerCase() === cleanName.toLowerCase());
  const actualName = match?.name || cleanName;
  deleted.add(actualName);
  setDeletedCategories(deleted);

  const custom = getCustomCategories().filter((c) => c.name.toLowerCase() !== cleanName.toLowerCase());
  setCustomCategories(custom);

  let affectedCount = 0;
  const localItems = getLocalInventory();
  const matchingItems = localItems.filter((i) => {
    const parent = getItemCategory(i);
    return parent.toLowerCase() === actualName.toLowerCase() || (i.category || '').toLowerCase() === actualName.toLowerCase();
  });

  if (deleteItems) {
    for (const item of matchingItems) {
      await deleteFarmInventoryItem(item.id);
      affectedCount++;
    }
  } else if (matchingItems.length > 0) {
    for (const item of matchingItems) {
      await updateFarmInventoryItem(item.id, { category: reassignTo });
      affectedCount++;
    }
  }

  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', actualName, { deleted: true, affectedCount });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: { name: actualName, deleted: true } }));
    window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
  }

  return { success: true, name: actualName, affectedCount, deletedItems: deleteItems };
}

/**
 * Crea una subcategoría dentro de una categoría padre.
 */
export function createFarmSubcategory({ parentCategory, name }) {
  if (!parentCategory || !name) return null;
  const pName = parentCategory.trim();
  const sName = name.trim();
  return createFarmCategory({ name: pName, subcategories: [sName] });
}

/**
 * Elimina una subcategoría de una categoría padre.
 */
export async function deleteFarmSubcategory({ parentCategory, name, deleteItems = false }) {
  if (!parentCategory || !name) return { success: false };
  const pName = parentCategory.trim().toLowerCase();
  const sName = name.trim();

  const custom = getCustomCategories();
  let modified = false;
  custom.forEach((c) => {
    if (c.name.toLowerCase() === pName && Array.isArray(c.subcategories)) {
      c.subcategories = c.subcategories.filter((s) => s.toLowerCase() !== sName.toLowerCase());
      modified = true;
    }
  });
  if (modified) setCustomCategories(custom);

  let affectedCount = 0;
  const localItems = getLocalInventory();
  const matching = localItems.filter((i) => {
    const parent = getItemCategory(i).toLowerCase();
    const sub = (i.variety_type || i.tipo || '').toLowerCase();
    return parent === pName && sub.includes(sName.toLowerCase());
  });

  if (deleteItems) {
    for (const item of matching) {
      await deleteFarmInventoryItem(item.id);
      affectedCount++;
    }
  } else if (matching.length > 0) {
    for (const item of matching) {
      await updateFarmInventoryItem(item.id, { variety_type: null });
      affectedCount++;
    }
  }

  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', parentCategory, { subcategoryDeleted: sName });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: { parentCategory, subcategory: sName, deleted: true } }));
  }

  return { success: true, parentCategory, subcategory: sName, affectedCount };
}

/**
 * Identifica si un elemento nuevo encaja en alguna categoría existente.
 * Si NO existe, la crea dinámicamente y la registra en la taxonomía viva de la finca.
 */
export function ensureCategoryExistsForElement(item = {}) {
  const activeCats = getFarmCategories();
  const rawCat = (item.category || item.categoria || '').trim();
  const rawSub = (item.variety_type || item.variedad || item.tipo || '').trim();
  const rawName = (item.name || item.nombre || '').trim();

  // 1. Si el item ya traía una categoría explícita, verificar si existe
  if (rawCat && rawCat !== 'Otros' && rawCat !== 'otro') {
    const match = activeCats.find((c) => c.name.toLowerCase() === rawCat.toLowerCase());
    if (match) {
      if (rawSub && !match.subcategories?.some((s) => s.toLowerCase() === rawSub.toLowerCase())) {
        createFarmSubcategory({ parentCategory: match.name, name: rawSub });
      }
      return { category: match.name, created: false };
    }
    // La categoría explícita no existía en el catálogo -> CREARLA NUEVA
    const createdCat = createFarmCategory({
      name: rawCat,
      subcategories: rawSub ? [rawSub] : [],
    });
    return { category: createdCat ? createdCat.name : rawCat, created: true };
  }

  // 2. Si no traía categoría explícita, intentar clasificar según palabras clave y taxonomía
  const fullText = [rawName, rawSub, rawCat].filter(Boolean).join(' ').toLowerCase();

  for (const cat of activeCats) {
    if (cat.name === 'Otros') continue;
    if (fullText.includes(cat.name.toLowerCase())) {
      if (rawSub) createFarmSubcategory({ parentCategory: cat.name, name: rawSub });
      return { category: cat.name, created: false };
    }
    if (cat.subcategories?.some((sub) => fullText.includes(sub.toLowerCase()))) {
      return { category: cat.name, created: false };
    }
    const baseKeywords = BASE_CATEGORY_MAP[cat.name] || [];
    if (baseKeywords.some((kw) => fullText.includes(kw))) {
      if (rawSub) createFarmSubcategory({ parentCategory: cat.name, name: rawSub });
      return { category: cat.name, created: false };
    }
  }

  // 3. Si no encaja en ninguna categoría existente:
  // Deducir un nombre de categoría representativo y CREARLA NUEVA
  let smartCatName = 'Instalaciones';
  if (fullText.includes('panel') || fullText.includes('solar') || fullText.includes('bateria') || fullText.includes('inversor')) {
    smartCatName = 'Energía';
  } else if (fullText.includes('gallin') || fullText.includes('colmena') || fullText.includes('pato') || fullText.includes('oveja') || fullText.includes('perro') || fullText.includes('animal') || fullText.includes('abeja')) {
    smartCatName = 'Animales';
  } else if (fullText.includes('valla') || fullText.includes('puerta') || fullText.includes('cancela') || fullText.includes('cerramiento') || fullText.includes('cercado')) {
    smartCatName = 'Cercados';
  } else if (fullText.includes('estacion') || fullText.includes('sensor') || fullText.includes('sonda') || fullText.includes('camara') || fullText.includes('vigilancia')) {
    smartCatName = 'Monitoreo';
  } else if (fullText.includes('abono') || fullText.includes('compost') || fullText.includes('fertilizante') || fullText.includes('sustrato')) {
    smartCatName = 'Nutrición / Suelo';
  } else if (rawName) {
    const firstWord = rawName.split(' ')[0];
    smartCatName = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  }

  const newCat = createFarmCategory({
    name: smartCatName,
    subcategories: [rawSub || rawName].filter(Boolean),
  });

  return { category: newCat ? newCat.name : smartCatName, created: true };
}

async function syncCategoriesToSupabase(categoriesList) {
  try {
    const payload = {
      category: 'general',
      title: 'TAXONOMIA_CATEGORIAS_CAMPITO',
      content: JSON.stringify(categoriesList),
      metadata: { updated_at: new Date().toISOString(), version: 1 },
      is_active: true,
    };
    await supabase.from('farm_knowledge').upsert([payload], { onConflict: 'title' });
  } catch {
    // Silencioso si no hay red o tabla
  }
}

export function getCategoryColor(categoryName) {
  if (!categoryName) return '#64748b';
  const activeCats = getFarmCategories();
  const match = activeCats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (match?.color) return match.color;
  if (BASE_CATEGORY_COLORS[categoryName]) return BASE_CATEGORY_COLORS[categoryName];

  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DYNAMIC_PALETTE.length;
  return DYNAMIC_PALETTE[index];
}

/**
 * Convierte un código HEX a [Hue (0-360), Saturation (0-100), Lightness (0-100)].
 */
export function hexToHsl(hex) {
  if (!hex || typeof hex !== 'string') return [200, 60, 50];
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6) return [200, 60, 50];
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return [200, 60, 50];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Convierte HSL a código hexadecimal (#rrggbb).
 */
export function hslToHex(h, s, l) {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.min(100, Math.max(0, s)) / 100;
  const normL = Math.min(100, Math.max(0, l)) / 100;
  const a = normS * Math.min(normL, 1 - normL);
  const f = (n, k = (n + normH / 30) % 12) =>
    normL - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  const toHex = (x) => {
    const hex = Math.round(Math.min(255, Math.max(0, x * 255))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * Genera el color para una subcategoría perteneciente a la gama de su categoría raíz,
 * pero en un tono más claro/pastel armónico (ej: Casas amarillo -> Pérgolas amarillo claro).
 */
export function getSubcategoryColor(parentCategory, subcategoryName) {
  const rootColor = getCategoryColor(parentCategory);
  const [h, s] = hexToHsl(rootColor);

  if (!subcategoryName) {
    return hslToHex(h, Math.max(40, Math.round(s * 0.8)), 75);
  }

  // Hash determinista del nombre de la subcategoría
  let hash = 0;
  const str = String(subcategoryName).trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Mantener el matiz (Hue) en la gama exacta de la categoría raíz con variación armoniosa (±5°)
  const hueShift = (Math.abs(hash) % 11) - 5;
  const finalHue = (h + hueShift + 360) % 360;

  // Subcategoría notablemente más clara (gama pastel luminosa: 72% a 80% de luminosidad)
  const lightnessOffset = Math.abs(hash >> 3) % 9;
  const finalLightness = Math.min(84, Math.max(72, 73 + lightnessOffset));
  const finalSaturation = Math.min(95, Math.max(50, Math.round(s * 0.88)));

  return hslToHex(finalHue, finalSaturation, finalLightness);
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
 * Determina la categoría de un elemento del inventario con promoción dinámica y soporte taxonómico.
 */
export function getItemCategory(item) {
  if (!item) return 'Otros';

  const activeCats = getFarmCategories();
  const catNamesMap = new Map(activeCats.map((c) => [c.name.toLowerCase(), c.name]));

  // 1. Chequeo por variedad / subcategoría
  if (item.variety_type) {
    const vt = String(item.variety_type).split('·')[0].trim().toLowerCase();
    if (catNamesMap.has(vt)) return catNamesMap.get(vt);
    for (const c of activeCats) {
      if (c.subcategories?.some((s) => s.toLowerCase() === vt)) {
        return c.name;
      }
    }
  }

  // 2. Chequeo exacto de categoría asignada
  const rawCat = (item.category || '').trim().toLowerCase();
  if (rawCat && catNamesMap.has(rawCat)) {
    return catNamesMap.get(rawCat);
  }

  // 3. Chequeo de texto normalizado contra palabras clave y subcategorías
  const text = [item.tipo, item.variety_type, item.name, item.title, item.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (text.includes('casa') || text.includes('cueva') || text.includes('edificio')) {
    if (catNamesMap.has('casas')) return catNamesMap.get('casas');
  }

  for (const cat of activeCats) {
    if (cat.name === 'Otros') continue;
    if (text.includes(cat.name.toLowerCase())) return cat.name;
    if (cat.subcategories?.some((s) => text.includes(s.toLowerCase()))) return cat.name;
    const baseKeywords = BASE_CATEGORY_MAP[cat.name] || [];
    if (baseKeywords.some((k) => text.includes(k))) return cat.name;
  }

  const explicitTipo = (item.tipo || '').trim();
  if (explicitTipo && explicitTipo.toLowerCase() !== 'otros' && explicitTipo.toLowerCase() !== 'otro') {
    return explicitTipo.charAt(0).toUpperCase() + explicitTipo.slice(1);
  }

  if (rawCat && rawCat !== 'otros' && rawCat !== 'otro' && rawCat !== 'inventario') {
    return rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
  }

  return 'Otros';
}

/**
 * Obtiene las subcategorías presentes estrictamente dentro de una categoría padre (taxonomía + inventario vivo).
 */
export function getSubcategoriesForParent(inventory, parent) {
  if (!parent) return [];
  const cleanParent = String(parent).trim().toLowerCase();
  const subs = new Set();
  const activeCats = getFarmCategories();
  const match = activeCats.find((c) => c.name.toLowerCase() === cleanParent);
  if (match && Array.isArray(match.subcategories)) {
    match.subcategories.forEach((s) => {
      if (s && typeof s === 'string' && s.trim()) subs.add(s.trim());
    });
  }

  // Variedades o subtipos reales ya registrados en el inventario para esta categoría padre
  (inventory || []).forEach((item) => {
    const itemParent = getItemCategory(item).toLowerCase();
    const assignedCat = (item.category || '').toLowerCase();
    if (itemParent === cleanParent || assignedCat === cleanParent) {
      const subLabel = (item.variety_type || item.variety || '').trim();
      if (subLabel && subLabel.toLowerCase() !== cleanParent) {
        subs.add(subLabel);
      }
    }
  });
  return Array.from(subs);
}

/**
 * Obtiene la categoría normalizada para una polilínea o camino.
 */
export function getPathCategory(path) {
  if (!path) return 'Caminos y Trazados';
  const raw = String(path.category || '').trim();
  if (raw && raw.toLowerCase() !== 'otros' && raw.toLowerCase() !== 'otro') {
    return raw;
  }
  const pt = String(path.path_type || '').toLowerCase();
  if (pt === 'linea_riego' || pt === 'riego') return 'Líneas de Riego';
  if (pt === 'acequia') return 'Riego / Agua';
  if (pt === 'linde') return 'Lindes y Límites';
  return 'Caminos y Trazados';
}

/**
 * Obtiene el subtipo o subcategoría legible para una polilínea o camino.
 */
export function getPathSubcategory(path) {
  if (!path) return '';
  const sub = String(path.variety_type || path.subcategory || '').trim();
  if (sub && sub.toLowerCase() !== 'otro' && sub.toLowerCase() !== 'otros') {
    return sub;
  }
  const pt = String(path.path_type || '').trim().toLowerCase();
  if (pt && pt !== 'otro' && pt !== 'otro_trazado') {
    return pt.charAt(0).toUpperCase() + pt.slice(1);
  }
  return '';
}

