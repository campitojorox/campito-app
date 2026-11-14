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

  const VALID_DB_PATH_TYPES = new Set(['camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'manguera', 'otro']);
  let pathType = path.path_type || path.tipo || 'camino';
  const norm = String(path.category || pathType).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('riego') || norm.includes('tuberia') || norm.includes('manguera')) pathType = 'linea_riego';
  else if (norm.includes('acequia')) pathType = 'acequia';
  else if (norm.includes('sendero')) pathType = 'sendero';
  else if (norm.includes('linde')) pathType = 'linde';
  else if (norm.includes('camino') || norm.includes('pista')) pathType = 'camino';

  if (!VALID_DB_PATH_TYPES.has(pathType)) {
    pathType = 'otro';
  }

  const cat = path.category || getPathCategory(path);
  const sub = path.variety_type || path.subcategory || '';
  let zoneVal = path.zone || null;
  if (cat || sub) {
    try {
      const existingZone = zoneVal && typeof zoneVal === 'string' && zoneVal.startsWith('{') ? JSON.parse(zoneVal) : {};
      zoneVal = JSON.stringify({
        ...existingZone,
        cat,
        sub,
        label: sub ? `${cat} · ${sub}` : cat,
      });
    } catch (e) {
      zoneVal = JSON.stringify({ cat, sub, label: sub ? `${cat} · ${sub}` : cat });
    }
  }

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
    zone: zoneVal,
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
        dbPayload.variety_type = sanitizeSubcategory(item.variety_type, item.category);
        dbPayload.zone = JSON.stringify({ cat: item.category, sub: dbPayload.variety_type });
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

  // Filtrar local de inmediato para descartar cualquier remanente borrado y sanear subcategorías
  const cleanLocal = localItems
    .filter((loc) => !deletedIds.has(String(loc.id)))
    .map((item) => {
      let cat = item.category;
      let sub = item.variety_type || '';
      if (typeof sub === 'string' && sub.includes('·')) {
        const parts = sub.split('·');
        const prefix = parts[0].trim();
        const suffix = parts.pop().trim();
        if (prefix && (!cat || cat === 'otro' || cat === 'Otros' || cat === 'Sin categoría')) {
          cat = prefix;
        }
        sub = suffix;
      }
      return { ...item, category: cat, variety_type: sub };
    });

  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Filtrar data remota excluyendo cualquier borrado pendiente local y sanear prefijos corruptos
      const cleanRemote = data
        .filter((d) => !deletedIds.has(String(d.id)))
        .map((d) => {
          let resolvedCat = d.category;
          let rawSub = d.variety_type || '';
          if (rawSub && typeof rawSub === 'string' && rawSub.includes('·')) {
            const parts = rawSub.split('·');
            const candidateCat = parts[0].trim();
            const candidateSub = parts[parts.length - 1].trim();
            if (candidateCat && (!resolvedCat || resolvedCat === 'otro' || resolvedCat === 'Otros')) {
              resolvedCat = candidateCat;
            }
            rawSub = candidateSub;
          }
          if (d.zone && typeof d.zone === 'string' && d.zone.startsWith('{')) {
            try {
              const z = JSON.parse(d.zone);
              if (z.cat) resolvedCat = z.cat;
              if (z.sub !== undefined) rawSub = z.sub;
            } catch {}
          }
          return {
            ...d,
            category: resolvedCat,
            variety_type: rawSub,
            _synced: true,
          };
        });
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
      dbPayload.variety_type = sanitizeSubcategory(itemToSave.variety_type, itemToSave.category);
      dbPayload.zone = JSON.stringify({ cat: itemToSave.category, sub: dbPayload.variety_type });
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
      cleanPayload.variety_type = sanitizeSubcategory(updatePayload.variety_type, updatePayload.category);
      cleanPayload.zone = JSON.stringify({ cat: updatePayload.category, sub: cleanPayload.variety_type });
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
      const localMap = new Map(cleanLocal.map((p) => [String(p.id), p]));
      const cleanRemote = data
        .filter((d) => !deletedIds.has(String(d.id)))
        .map((d) => {
          const loc = localMap.get(String(d.id));
          const merged = {
            ...(loc || {}),
            ...d,
            _synced: true,
          };
          // Extraer cat y sub desde d.zone si existe como JSON
          let zoneCat = null;
          let zoneSub = null;
          if (d.zone && typeof d.zone === 'string' && d.zone.startsWith('{')) {
            try {
              const parsed = JSON.parse(d.zone);
              if (parsed && typeof parsed === 'object') {
                zoneCat = parsed.cat || parsed.category || null;
                zoneSub = parsed.sub || parsed.subcategory || null;
              }
            } catch (e) {}
          }
          // Preservar o resolver category y variety_type para no perderlos en recarga
          merged.category = d.category || zoneCat || loc?.category || getPathCategory(merged);
          merged.variety_type = d.variety_type || zoneSub || loc?.variety_type || getPathSubcategory(merged) || undefined;
          return merged;
        });
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

  const existingPath = localPaths.find((p) => String(p.id) === targetIdStr) || {};
  const mergedCategory = updatePayload.category || existingPath.category || getPathCategory(existingPath);
  const mergedSubcategory = updatePayload.variety_type !== undefined
    ? updatePayload.variety_type
    : (updatePayload.subcategory !== undefined
        ? updatePayload.subcategory
        : (existingPath.variety_type || existingPath.subcategory || ''));

  const updatedLocal = localPaths.map((p) => {
    if (String(p.id) === targetIdStr) {
      return {
        ...p,
        ...updatePayload,
        category: mergedCategory,
        variety_type: mergedSubcategory,
        updated_at: now,
      };
    }
    return p;
  });
  setLocalPaths(updatedLocal);

  broadcastMapSync('PATHS_CHANGED', targetIdStr, {
    path: { id: targetIdStr, ...updatePayload, category: mergedCategory, variety_type: mergedSubcategory },
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('farm-paths-updated', {
        detail: { id: targetIdStr, ...updatePayload, category: mergedCategory, variety_type: mergedSubcategory },
      })
    );
  }

  // Registrar en taxonomía si hay categoría y subcategoría para mantener sugerencias
  if (mergedCategory && mergedSubcategory) {
    saveFarmCategory(mergedCategory, [mergedSubcategory]);
  }

  // Sanitizar path_type para la restricción CHECK de PostgreSQL en Supabase
  const VALID_DB_PATH_TYPES = new Set(['camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'manguera', 'otro']);
  let dbPathType = 'camino';
  const rawPt = (updatePayload.path_type || existingPath.path_type || '').toLowerCase().trim();
  const rawSub = String(mergedSubcategory || '').toLowerCase().trim();
  const rawCat = String(mergedCategory || '').toLowerCase().trim();
  const combined = `${rawPt} ${rawSub} ${rawCat}`;

  if (VALID_DB_PATH_TYPES.has(rawPt)) {
    dbPathType = rawPt;
  } else if (combined.includes('riego') || combined.includes('tuberia')) {
    dbPathType = 'linea_riego';
  } else if (combined.includes('manguera')) {
    dbPathType = 'manguera';
  } else if (combined.includes('acequia') || combined.includes('canal')) {
    dbPathType = 'acequia';
  } else if (combined.includes('sendero') || combined.includes('peatonal')) {
    dbPathType = 'sendero';
  } else if (combined.includes('linde') || combined.includes('limite') || combined.includes('catastro')) {
    dbPathType = 'linde';
  } else if (combined.includes('camino') || combined.includes('pista')) {
    dbPathType = 'camino';
  } else {
    dbPathType = 'otro';
  }

  // Persistir categoría y subcategoría en zone como JSON seguro
  let dbZone = existingPath.zone || null;
  try {
    const existingZoneObj = dbZone && typeof dbZone === 'string' && dbZone.startsWith('{') ? JSON.parse(dbZone) : {};
    dbZone = JSON.stringify({
      ...existingZoneObj,
      cat: mergedCategory,
      sub: mergedSubcategory,
      label: mergedSubcategory ? `${mergedCategory} · ${mergedSubcategory}` : mergedCategory,
    });
  } catch (e) {
    dbZone = JSON.stringify({
      cat: mergedCategory,
      sub: mergedSubcategory,
      label: mergedSubcategory ? `${mergedCategory} · ${mergedSubcategory}` : mergedCategory,
    });
  }

  // Solo enviar columnas estrictamente válidas en la tabla farm_paths de Supabase
  const cleanPayload = {
    updated_at: now,
    path_type: dbPathType,
    zone: dbZone,
  };
  if (updatePayload.name !== undefined) cleanPayload.name = String(updatePayload.name).trim();
  if (updatePayload.coordinates !== undefined) cleanPayload.coordinates = normalizeCoordinatesArray(updatePayload.coordinates);
  if (updatePayload.color !== undefined) cleanPayload.color = updatePayload.color;
  if (updatePayload.stroke_width !== undefined) cleanPayload.stroke_width = Number(updatePayload.stroke_width);
  if (updatePayload.stroke_style !== undefined) cleanPayload.stroke_style = updatePayload.stroke_style;
  if (updatePayload.length_meters !== undefined) cleanPayload.length_meters = updatePayload.length_meters;
  if (updatePayload.notes !== undefined) cleanPayload.notes = updatePayload.notes;
  if (updatePayload.is_active !== undefined) cleanPayload.is_active = updatePayload.is_active;

  try {
    let { data, error } = await supabase
      .from('farm_paths')
      .update(cleanPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('[InventoryStorage] Error directo Supabase en updateFarmPath, usando proxy:', error.message);
      const proxyRes = await callFarmSyncProxy('UPDATE_PATH', { id, payload: cleanPayload });
      if (proxyRes?.data) data = proxyRes.data;
    }

    if (data) {
      const synced = updatedLocal.map((p) =>
        String(p.id) === targetIdStr
          ? { ...p, ...data, category: mergedCategory, variety_type: mergedSubcategory, _synced: true }
          : p
      );
      setLocalPaths(synced);
      return { ...data, category: mergedCategory, variety_type: mergedSubcategory, _synced: true };
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
  'Casas': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Casas / Edificios': ['casa', 'casita', 'cueva', 'edificio', 'vivienda', 'cortijo', 'caseta', 'caravana', 'taller', 'almacen', 'nave', 'cobertizo', 'cabana', 'choza', 'domo', 'habitacion', 'construccion'],
  'Trazados': ['camino', 'sendero', 'carril', 'vereda', 'acequia', 'linea_riego', 'trazado', 'pista', 'senda', 'linde', 'calle', 'mtb', 'rio', 'arroyo', 'cauce', 'torrente', 'barranco', 'riachuelo', 'rambla', 'vado', 'cascada', 'nacimiento'],
  'Caminos y Trazados': ['camino', 'sendero', 'carril', 'vereda', 'acequia', 'linea_riego', 'trazado', 'pista', 'senda', 'linde', 'calle', 'mtb'],
  'Ríos / Arroyos': ['rio', 'arroyo', 'cauce', 'torrente', 'barranco', 'riachuelo', 'rambla', 'vado', 'cascada', 'nacimiento'],
  'Rios / Arroyos': ['rio', 'arroyo', 'cauce', 'torrente', 'barranco', 'riachuelo', 'rambla', 'vado', 'cascada', 'nacimiento'],
  'Herramientas': ['herramienta', 'maquina', 'tractor', 'moto', 'equipo', 'mobiliario', 'apero'],
  'Hitos': ['mojon', 'linde', 'piedra', 'marca', 'señal', 'cota', 'limite'],
  'Otros': [],
};

export const BASE_CATEGORY_COLORS = {
  'Sin clasificar': '#00979d',    // Azulado característico Jorox para elementos sin clasificar
  'Sin categoría': '#00979d',     // Alias retrocompatible
  'Árboles': '#16a34a',           // Verde oscuro
  'Plantas': '#4ade80',           // Verde claro
  'Riego / Agua': '#0284c7',      // Azul
  'Trazados': '#f97316',          // Naranja trazados
  'Caminos y Trazados': '#f97316',// Naranja (alias)
  'Caminos': '#f97316',           // Naranja (alias)
  'Casas': '#eab308',             // Amarillo
  'Casas / Edificios': '#eab308', // Amarillo (retrocompatibilidad)
  'Edificios': '#eab308',         // Amarillo (retrocompatibilidad)
  'Ríos / Arroyos': '#06b6d4',    // Cian acuático
  'Rios / Arroyos': '#06b6d4',    // Cian acuático
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
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    const set = new Set();
    (arr || []).forEach((item) => {
      if (item && typeof item === 'string') {
        set.add(item.trim());
        set.add(item.trim().toLowerCase());
      }
    });
    return set;
  } catch {
    return new Set();
  }
}

export function setDeletedCategories(setOrArray) {
  try {
    const arr = Array.from(setOrArray || []);
    localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando categorías eliminadas:', e);
  }
}

export function sanitizeSubcategory(sub, parentCategory = '') {
  if (!sub || typeof sub !== 'string') return '';
  let cleaned = sub.trim();
  if (cleaned.includes('·')) {
    cleaned = cleaned.split('·').pop().trim();
  }
  const pNorm = parentCategory ? String(parentCategory).toLowerCase().trim() : '';
  if (pNorm && cleaned.toLowerCase() === pNorm) {
    return '';
  }
  return cleaned;
}

export function pruneSubcategoryPrefixes(subs = [], parentCategory = '') {
  if (!Array.isArray(subs)) return [];
  const pNorm = parentCategory ? String(parentCategory).toLowerCase().trim() : '';
  const clean = Array.from(
    new Set(
      subs
        .map((s) => {
          if (!s || typeof s !== 'string') return '';
          let t = s.trim();
          if (t.includes('·')) {
            t = t.split('·').pop().trim();
          }
          if (pNorm && t.toLowerCase() === pNorm) return '';
          return t;
        })
        .filter(Boolean)
    )
  );

  return clean.filter((item) => {
    if (item.includes('·')) return false;
    // Si un fragmento corto (1 o 2 letras) es prefijo de otro término más largo en la misma lista,
    // descartarlo ya que fue un residuo de escritura intermedia en el teclado (ej: 'M', 'MT' ante 'MTB').
    if (item.length < 3) {
      const isPrefixOfLonger = clean.some(
        (other) => other.length > item.length && other.toLowerCase().startsWith(item.toLowerCase())
      );
      if (isPrefixOfLonger) return false;
    }
    return true;
  });
}

export function getCustomCategories() {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((cat) => {
      if (Array.isArray(cat.subcategories)) {
        return {
          ...cat,
          subcategories: pruneSubcategoryPrefixes(cat.subcategories),
        };
      }
      return cat;
    });
  } catch {
    return [];
  }
}

export function setCustomCategories(cats) {
  try {
    const sanitized = Array.isArray(cats)
      ? cats.map((cat) => ({
          ...cat,
          subcategories: pruneSubcategoryPrefixes(cat.subcategories || []),
        }))
      : [];
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(sanitized));
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
      name: 'Casas',
      subcategories: ['Casita Cueva', 'Almacén', 'Taller', 'Caseta', 'Caravana'],
      color: BASE_CATEGORY_COLORS['Casas'],
      isDefault: true,
    },
    {
      name: 'Trazados',
      subcategories: [
        'Camino',
        'Carril agrícola',
        'Sendero',
        'MTB',
        'Ríos / Arroyos',
        'Arroyo',
        'Cauce natural',
        'Torrente',
        'Barranco',
        'Vado',
        'Nacimiento',
        'Línea de Riego',
        'Acequia',
        'Otro trazado',
      ],
      color: BASE_CATEGORY_COLORS['Trazados'],
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
    if (!deleted.has(c.name) && !deleted.has(c.name.toLowerCase())) {
      map.set(c.name.toLowerCase(), c);
    }
  });

  custom.forEach((c) => {
    if (!c.name || deleted.has(c.name) || deleted.has(c.name.toLowerCase())) return;
    const key = c.name.toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key);
      const subs = Array.isArray(c.subcategories) && c.subcategories.length > 0
        ? pruneSubcategoryPrefixes(c.subcategories)
        : existing.subcategories;
      map.set(key, { ...existing, ...c, subcategories: subs });
    } else {
      map.set(key, {
        name: c.name,
        subcategories: pruneSubcategoryPrefixes(Array.isArray(c.subcategories) ? c.subcategories : []),
        color: c.color || getCategoryColor(c.name),
        isDefault: false,
      });
    }
  });

  return Array.from(map.values());
}

/**
 * Carga las categorías desde Supabase (tabla farm_categories o farm_knowledge)
 * y actualiza la taxonomía local activa.
 */
export async function loadFarmCategories() {
  const deleted = getDeletedCategories();
  try {
    const { data, error } = await supabase
      .from('farm_categories')
      .select('*')
      .order('is_default', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const activeFromDb = data
        .filter((d) => d.is_active !== false && !deleted.has(d.name) && !deleted.has((d.name || '').toLowerCase()))
        .map((d) => ({
          id: d.id,
          name: d.name,
          subcategories: pruneSubcategoryPrefixes(Array.isArray(d.subcategories) ? d.subcategories : []),
          color: d.color || getCategoryColor(d.name),
          icon: d.icon || null,
          isDefault: Boolean(d.is_default),
        }));

      setCustomCategories(activeFromDb.filter((c) => !c.isDefault));
      return getFarmCategories();
    }
  } catch (err) {
    // Si la tabla farm_categories aún no existe en Supabase, intentar leer farm_knowledge
    try {
      const { data: knowData } = await supabase
        .from('farm_knowledge')
        .select('content')
        .eq('title', 'TAXONOMIA_CATEGORIAS_CAMPITO')
        .single();
      if (knowData?.content) {
        const parsed = JSON.parse(knowData.content);
        if (Array.isArray(parsed)) {
          setCustomCategories(parsed.filter((c) => !c.isDefault && !deleted.has(c.name) && !deleted.has((c.name || '').toLowerCase())));
        }
      }
    } catch {}
  }
  return getFarmCategories();
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
    const updatedSubs = pruneSubcategoryPrefixes([...(existing.subcategories || []), ...subArray]);
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
 * Actualiza o reemplaza masivamente la lista de categorías y subcategorías de la finca.
 */
export function updateAllFarmCategories(categoriesList) {
  if (!Array.isArray(categoriesList) || categoriesList.length === 0) return [];

  const currentCustom = getCustomCategories();
  const customMap = new Map(currentCustom.map((c) => [c.name.toLowerCase(), c]));

  const updatedCategories = [];

  for (const item of categoriesList) {
    if (!item) continue;
    const rawName = typeof item === 'string' ? item : (item.name || item.category || item.categoria);
    if (!rawName || typeof rawName !== 'string') continue;
    const cleanName = rawName.trim().charAt(0).toUpperCase() + rawName.trim().slice(1);
    if (!cleanName) continue;

    const rawSubs = Array.isArray(item.subcategories)
      ? item.subcategories
      : (Array.isArray(item.subcategorias)
          ? item.subcategorias
          : (item.subcategory ? [item.subcategory] : []));

    const cleanSubs = pruneSubcategoryPrefixes(
      rawSubs.map((s) => String(s || '').trim()).filter(Boolean)
    );

    const existing = customMap.get(cleanName.toLowerCase()) || {};
    const catObj = {
      ...existing,
      id: existing.id || generateUUID(),
      name: cleanName,
      subcategories: cleanSubs,
      color: item.color || existing.color || getCategoryColor(cleanName),
      icon: item.icon || existing.icon || null,
      isDefault: false,
      updated_at: new Date().toISOString(),
    };

    customMap.set(cleanName.toLowerCase(), catObj);
    updatedCategories.push(catObj);
  }

  const finalCustom = Array.from(customMap.values());
  setCustomCategories(finalCustom);
  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', 'all', { categories: getFarmCategories() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('farm-categories-updated', { detail: { categories: getFarmCategories() } })
    );
  }

  return updatedCategories;
}

/**
 * Analizador resiliente para extraer categorías y subcategorías desde texto libre o markdown.
 */
export function extractCategoriesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n');
  const categories = [];
  for (const line of lines) {
    const match = line.match(/^[\s*•-]*\**([a-zA-ZáéíóúÁÉÍÓÚñÑ\s/]+)\**\s*:\s*(.+)$/);
    if (match) {
      const name = match[1].trim();
      const subsRaw = match[2].trim();
      const subs = subsRaw
        .split(/[,|•]/)
        .map((s) => s.replace(/^[*\s-]+|[*\s-]+$/g, '').trim())
        .filter(Boolean);
      if (name && subs.length > 0 && !name.toLowerCase().startsWith('nota') && !name.toLowerCase().startsWith('resumen')) {
        categories.push({ name, subcategories: subs });
      }
    }
  }
  return categories;
}

/**
 * Elimina una categoría. REGLA ESTRICTA: NUNCA se borran los nodos, puntos o trazados del mapa.
 * Únicamente se borra su clasificación (quedando como 'Sin clasificar') para permitir que el usuario
 * les asigne una nueva categoría desde su ficha en el mapa.
 */
export async function deleteFarmCategory({ name, deleteItems = false, reassignTo = 'Sin clasificar' }) {
  if (!name) return { success: false, reason: 'Nombre de categoría no proporcionado' };
  const cleanName = name.trim();
  const lowerName = cleanName.toLowerCase();

  const deleted = getDeletedCategories();
  deleted.add(cleanName);
  deleted.add(lowerName);

  const allCurrent = getFarmCategories();
  const match = allCurrent.find((c) => c.name.toLowerCase() === lowerName);
  const actualName = match?.name || cleanName;
  deleted.add(actualName);
  deleted.add(actualName.toLowerCase());
  setDeletedCategories(deleted);

  const custom = getCustomCategories().filter((c) => c.name.toLowerCase() !== lowerName);
  setCustomCategories(custom);

  // Marcar inactiva en Supabase (si farm_categories existe)
  try {
    await supabase
      .from('farm_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .ilike('name', actualName);
  } catch (e) {
    console.warn('[InventoryStorage] Error desactivando categoría en Supabase:', e);
  }

  let affectedCount = 0;

  // 1. Desclasificar puntos de inventario asociados (NUNCA borrar)
  const localItems = getLocalInventory();
  const matchingItems = localItems.filter((i) => {
    const parent = getItemCategory(i);
    return (
      parent.toLowerCase() === actualName.toLowerCase() ||
      (i.category || '').toLowerCase() === actualName.toLowerCase()
    );
  });

  if (matchingItems.length > 0) {
    const updatedItems = localItems.map((item) => {
      const parent = getItemCategory(item);
      if (
        parent.toLowerCase() === actualName.toLowerCase() ||
        (item.category || '').toLowerCase() === actualName.toLowerCase()
      ) {
        affectedCount++;
        return {
          ...item,
          category: 'Sin clasificar',
          variety_type: null,
          updated_at: new Date().toISOString(),
        };
      }
      return item;
    });
    setLocalInventory(updatedItems);
    for (const item of matchingItems) {
      await updateFarmInventoryItem(item.id, { category: 'Sin clasificar', variety_type: null });
    }
  }

  // 2. Desclasificar trazados y polilíneas asociados (NUNCA borrar)
  const localPaths = getLocalPaths();
  const matchingPaths = localPaths.filter((p) => {
    const parent = getPathCategory(p);
    return (
      parent.toLowerCase() === actualName.toLowerCase() ||
      (p.category || '').toLowerCase() === actualName.toLowerCase()
    );
  });

  if (matchingPaths.length > 0) {
    const updatedPaths = localPaths.map((p) => {
      const parent = getPathCategory(p);
      if (
        parent.toLowerCase() === actualName.toLowerCase() ||
        (p.category || '').toLowerCase() === actualName.toLowerCase()
      ) {
        affectedCount++;
        return {
          ...p,
          category: 'Sin clasificar',
          variety_type: '',
          subcategory: '',
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });
    setLocalPaths(updatedPaths);
    for (const p of matchingPaths) {
      await updateFarmPath(p.id, { category: 'Sin clasificar', variety_type: '', subcategory: '' });
    }
  }

  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', actualName, { deleted: true, affectedCount });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('farm-categories-updated', { detail: { name: actualName, deleted: true } })
    );
    window.dispatchEvent(new CustomEvent('farm-paths-updated'));
    window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
  }

  return { success: true, name: actualName, affectedCount, deletedItems: false };
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
 * Renombra una categoría y migra atómicamente todos los caminos, inventario y taxonomía.
 */
export async function renameFarmCategory({ oldName, newName, subcategories = null }) {
  if (!oldName || !newName) return { success: false, reason: 'Parámetros insuficientes' };
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();

  // 1. Taxonomía viva
  const deleted = getDeletedCategories();
  deleted.add(cleanOld);
  deleted.delete(cleanNew);
  setDeletedCategories(deleted);

  const custom = getCustomCategories();
  const existingOld = custom.find((c) => c.name.toLowerCase() === cleanOld.toLowerCase());
  const otherCustom = custom.filter(
    (c) => c.name.toLowerCase() !== cleanOld.toLowerCase() && c.name.toLowerCase() !== cleanNew.toLowerCase()
  );

  const newSubs = Array.isArray(subcategories) && subcategories.length > 0
    ? subcategories
    : (existingOld?.subcategories || []);

  const updatedCategoryObj = {
    name: cleanNew,
    subcategories: pruneSubcategoryPrefixes(newSubs),
    color: BASE_CATEGORY_COLORS[cleanNew] || existingOld?.color || getCategoryColor(cleanNew),
  };
  otherCustom.push(updatedCategoryObj);
  setCustomCategories(otherCustom);
  syncCategoriesToSupabase(getFarmCategories());

  // 2. Migrar caminos asociados en local y Supabase
  let pathsMigrated = 0;
  const localPaths = getLocalPaths();
  const updatedPaths = localPaths.map((p) => {
    const curCat = getPathCategory(p);
    if (curCat.toLowerCase() === cleanOld.toLowerCase() || (p.category || '').toLowerCase() === cleanOld.toLowerCase()) {
      pathsMigrated++;
      return {
        ...p,
        category: cleanNew,
        updated_at: new Date().toISOString(),
      };
    }
    return p;
  });
  if (pathsMigrated > 0) {
    setLocalPaths(updatedPaths);
    for (const p of updatedPaths) {
      if (p.category === cleanNew) {
        updateFarmPath(p.id, { category: cleanNew }).catch(() => {});
      }
    }
  }

  // 3. Migrar puntos de inventario asociados
  let itemsMigrated = 0;
  const localInv = getLocalInventory();
  const updatedInv = localInv.map((item) => {
    const curCat = getItemCategory(item);
    if (curCat.toLowerCase() === cleanOld.toLowerCase() || (item.category || '').toLowerCase() === cleanOld.toLowerCase()) {
      itemsMigrated++;
      return {
        ...item,
        category: cleanNew,
        updated_at: new Date().toISOString(),
      };
    }
    return item;
  });
  if (itemsMigrated > 0) {
    setLocalInventory(updatedInv);
    for (const item of updatedInv) {
      if (item.category === cleanNew) {
        updateFarmInventoryItem(item.id, { category: cleanNew }).catch(() => {});
      }
    }
  }

  // 4. Notificar a toda la aplicación
  broadcastMapSync('CATEGORIES_CHANGED', cleanNew, { oldName: cleanOld, newName: cleanNew, pathsMigrated, itemsMigrated });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: { oldName: cleanOld, newName: cleanNew } }));
    window.dispatchEvent(new CustomEvent('farm-paths-updated'));
    window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
  }

  return { success: true, oldName: cleanOld, newName: cleanNew, pathsMigrated, itemsMigrated };
}

/**
 * Integra / fusiona una categoría raíz existente dentro de otra categoría padre como subcategoría.
 */
export async function integrateCategoryIntoParent({
  sourceCategory,
  targetParentCategory,
  subcategoriesToKeep = [],
  subcategoriesToRemove = [],
}) {
  if (!sourceCategory || !targetParentCategory) return { success: false };
  const sName = sourceCategory.trim();
  const tName = targetParentCategory.trim();

  // 1. Marcar sourceCategory como eliminada de la raíz
  const deleted = getDeletedCategories();
  deleted.add(sName);
  deleted.delete(tName);
  setDeletedCategories(deleted);

  // 2. Extraer subcategorías existentes de la fuente
  const allCurrent = getFarmCategories();
  const sourceCatObj = allCurrent.find((c) => c.name.toLowerCase() === sName.toLowerCase());
  const existingSourceSubs = sourceCatObj?.subcategories || [];

  const toRemoveSet = new Set((subcategoriesToRemove || []).map((s) => s.toLowerCase().trim()));
  const mergedSubsSet = new Set(
    existingSourceSubs
      .concat(subcategoriesToKeep || [])
      .concat([sName])
      .filter((s) => s && !toRemoveSet.has(s.toLowerCase().trim()))
  );

  // 3. Añadir a targetParentCategory
  const custom = getCustomCategories();
  const targetCustom = custom.find((c) => c.name.toLowerCase() === tName.toLowerCase());
  const otherCustom = custom.filter(
    (c) => c.name.toLowerCase() !== sName.toLowerCase() && c.name.toLowerCase() !== tName.toLowerCase()
  );

  const targetSubs = targetCustom?.subcategories || [
    'Camino',
    'Carril agrícola',
    'Sendero',
    'MTB',
    'Línea de Riego',
    'Acequia',
    'Otro trazado',
  ];
  const finalSubs = Array.from(new Set([...targetSubs, ...Array.from(mergedSubsSet)]));

  otherCustom.push({
    name: tName,
    subcategories: pruneSubcategoryPrefixes(finalSubs),
    color: BASE_CATEGORY_COLORS[tName] || targetCustom?.color || getCategoryColor(tName),
  });
  setCustomCategories(otherCustom);
  syncCategoriesToSupabase(getFarmCategories());

  // 4. Migrar caminos asociados
  const localPaths = getLocalPaths();
  let pathsMigrated = 0;
  const updatedPaths = localPaths.map((p) => {
    const curCat = getPathCategory(p);
    if (curCat.toLowerCase() === sName.toLowerCase() || (p.category || '').toLowerCase() === sName.toLowerCase()) {
      pathsMigrated++;
      let curSub = getPathSubcategory(p) || sName;
      if (toRemoveSet.has(curSub.toLowerCase())) {
        curSub = sName;
      }
      return {
        ...p,
        category: tName,
        variety_type: curSub,
        subcategory: curSub,
        updated_at: new Date().toISOString(),
      };
    }
    return p;
  });

  if (pathsMigrated > 0) {
    setLocalPaths(updatedPaths);
    for (const p of updatedPaths) {
      if (p.category === tName) {
        updateFarmPath(p.id, { category: tName, variety_type: p.variety_type }).catch(() => {});
      }
    }
  }

  // 5. Notificar
  broadcastMapSync('CATEGORIES_CHANGED', tName, { integrated: sName, target: tName, pathsMigrated });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated'));
    window.dispatchEvent(new CustomEvent('farm-paths-updated'));
  }

  return { success: true, source: sName, targetParent: tName, pathsMigrated };
}

/**
 * Elimina una subcategoría de una categoría padre y actualiza puntos y trazados asociados.
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

  const localPaths = getLocalPaths();
  const matchingPaths = localPaths.filter((p) => {
    const parent = getPathCategory(p).toLowerCase();
    const sub = getPathSubcategory(p).toLowerCase();
    return parent === pName && (sub === sName.toLowerCase() || sub.includes(sName.toLowerCase()));
  });

  if (matchingPaths.length > 0) {
    const updatedPaths = localPaths.map((p) => {
      const parent = getPathCategory(p).toLowerCase();
      const sub = getPathSubcategory(p).toLowerCase();
      if (parent === pName && (sub === sName.toLowerCase() || sub.includes(sName.toLowerCase()))) {
        affectedCount++;
        return { ...p, variety_type: parentCategory, subcategory: parentCategory, updated_at: new Date().toISOString() };
      }
      return p;
    });
    setLocalPaths(updatedPaths);
    for (const p of matchingPaths) {
      updateFarmPath(p.id, { variety_type: parentCategory, subcategory: parentCategory }).catch(() => {});
    }
  }

  syncCategoriesToSupabase(getFarmCategories());

  broadcastMapSync('CATEGORIES_CHANGED', parentCategory, { subcategoryDeleted: sName });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-categories-updated', { detail: { parentCategory, subcategory: sName, deleted: true } }));
    window.dispatchEvent(new CustomEvent('farm-paths-updated'));
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
    if (!Array.isArray(categoriesList) || categoriesList.length === 0) return;

    // 1. Sincronizar con tabla relacional farm_categories si está disponible
    try {
      const rows = categoriesList.map((c) => ({
        name: c.name,
        subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
        color: c.color || getCategoryColor(c.name),
        icon: c.icon || null,
        is_default: Boolean(c.isDefault),
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('farm_categories').upsert(rows, { onConflict: 'name' });
    } catch {}

    // 2. Respaldo en farm_knowledge
    const payload = {
      category: 'general',
      title: 'TAXONOMIA_CATEGORIAS_CAMPITO',
      content: JSON.stringify(categoriesList),
      metadata: { updated_at: new Date().toISOString(), version: 2 },
      is_active: true,
    };
    await supabase.from('farm_knowledge').upsert([payload], { onConflict: 'title' });
  } catch {
    // Silencioso si no hay red o tabla
  }
}

export function getCategoryColor(categoryName) {
  if (!categoryName) return '#00979d';
  const norm = String(categoryName).trim().toLowerCase();
  if (norm === 'sin clasificar' || norm === 'sin categoría' || norm === 'sin categoria') {
    return '#00979d';
  }
  const activeCats = getFarmCategories();
  const match = activeCats.find((c) => c.name.toLowerCase() === norm);
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
 * Determina la categoría de un elemento del inventario con soporte taxonómico.
 * Si no tiene categoría o su categoría fue borrada, devuelve estrictamente 'Sin clasificar'
 * para que no se oculte ni se clasifique falsamente en 'Casas' u otra categoría.
 */
export function getItemCategory(item) {
  if (!item) return 'Sin clasificar';

  const rawCat = (item.category || '').trim();
  const lowerCat = rawCat.toLowerCase();
  if (
    lowerCat === 'sin categoria' ||
    lowerCat === 'sin categoría' ||
    lowerCat === 'sin clasificar' ||
    lowerCat === 'otros' ||
    lowerCat === 'otro' ||
    !rawCat
  ) {
    return 'Sin clasificar';
  }

  const deleted = getDeletedCategories();
  if (deleted.has(rawCat) || deleted.has(lowerCat) || Array.from(deleted).some((d) => d.toLowerCase() === lowerCat)) {
    return 'Sin clasificar';
  }

  const activeCats = getFarmCategories();
  const catNamesMap = new Map(activeCats.map((c) => [c.name.toLowerCase(), c.name]));

  // 1. Chequeo exacto de categoría asignada activa
  if (rawCat && catNamesMap.has(lowerCat)) {
    return catNamesMap.get(lowerCat);
  }

  // 2. Chequeo por variedad / subcategoría activa
  if (item.variety_type) {
    const vt = String(item.variety_type).split('·')[0].trim().toLowerCase();
    if (catNamesMap.has(vt)) return catNamesMap.get(vt);
    for (const c of activeCats) {
      if (c.subcategories?.some((s) => s.toLowerCase() === vt)) {
        return c.name;
      }
    }
  }

  // 3. Si no pertenece a ninguna categoría activa de la finca, queda 'Sin clasificar'
  return 'Sin clasificar';
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
      const cleanSub = sanitizeSubcategory(s, cleanParent);
      if (cleanSub && cleanSub.toLowerCase() !== cleanParent) subs.add(cleanSub);
    });
  }

  // Variedades o subtipos reales ya registrados en el inventario para esta categoría padre
  (inventory || []).forEach((item) => {
    const itemParent = getItemCategory(item).toLowerCase();
    const assignedCat = (item.category || '').toLowerCase();
    if (itemParent === cleanParent || assignedCat === cleanParent) {
      const rawSub = item.variety_type || item.variety || '';
      const subLabel = sanitizeSubcategory(rawSub, cleanParent);
      if (subLabel && subLabel.toLowerCase() !== cleanParent) {
        subs.add(subLabel);
      }
    }
  });

  // Trazados y polilíneas locales registrados para esta categoría
  try {
    const paths = getLocalPaths();
    (paths || []).forEach((path) => {
      const pathParent = getPathCategory(path).toLowerCase();
      const assignedCat = (path.category || '').toLowerCase();
      if (pathParent === cleanParent || assignedCat === cleanParent) {
        const rawSub = getPathSubcategory(path);
        const subLabel = sanitizeSubcategory(rawSub, cleanParent);
        if (subLabel && subLabel.toLowerCase() !== cleanParent) {
          subs.add(subLabel);
        }
      }
    });
  } catch (e) {}

  return pruneSubcategoryPrefixes(Array.from(subs), cleanParent);
}

/**
 * Obtiene la categoría normalizada para una polilínea o camino.
 * Si no tiene categoría o fue borrada, devuelve 'Sin clasificar'.
 */
export function getPathCategory(path) {
  if (!path) return 'Sin clasificar';

  const raw = String(path.category || '').trim();
  const lowerCat = raw.toLowerCase();
  if (
    lowerCat === 'sin categoria' ||
    lowerCat === 'sin categoría' ||
    lowerCat === 'sin clasificar' ||
    lowerCat === 'otros' ||
    lowerCat === 'otro' ||
    !raw
  ) {
    return 'Sin clasificar';
  }

  const deleted = getDeletedCategories();
  if (deleted.has(raw) || deleted.has(lowerCat) || Array.from(deleted).some((d) => d.toLowerCase() === lowerCat)) {
    return 'Sin clasificar';
  }

  const activeCats = getFarmCategories();
  const catNamesMap = new Map(activeCats.map((c) => [c.name.toLowerCase(), c.name]));

  // 1. Normalización de alias históricos si Trazados está activa
  const normRaw = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (
    (normRaw === 'caminos y trazados' ||
      normRaw === 'caminos' ||
      normRaw === 'trazados' ||
      normRaw === 'trazado' ||
      normRaw === 'rio / arroyos' ||
      normRaw === 'rios / arroyos' ||
      normRaw === 'rio' ||
      normRaw === 'rios' ||
      normRaw === 'arroyos' ||
      normRaw === 'arroyo') &&
    catNamesMap.has('trazados') &&
    !deleted.has('trazados')
  ) {
    return catNamesMap.get('trazados') || 'Trazados';
  }

  // 2. Coincidencia directa con una categoría activa en la taxonomía
  if (raw && catNamesMap.has(lowerCat)) {
    return catNamesMap.get(lowerCat);
  }

  // 3. Chequeo de zone (si la categoría se almacenó en zone de Supabase)
  const zoneStr = String(path.zone || '').trim();
  if (zoneStr && zoneStr.toLowerCase() !== 'otros' && zoneStr.toLowerCase() !== 'otro') {
    try {
      const zObj = zoneStr.startsWith('{') ? JSON.parse(zoneStr) : null;
      if (zObj?.cat) {
        const normZ = zObj.cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normZ === 'caminos y trazados' || normZ === 'trazados') {
          if (catNamesMap.has('trazados')) return catNamesMap.get('trazados');
        }
        if (catNamesMap.has(normZ) && !deleted.has(normZ)) return catNamesMap.get(normZ);
      }
    } catch {}
  }

  // 4. Si la categoría no está en la taxonomía activa de la finca, es 'Sin clasificar'
  return 'Sin clasificar';
}

/**
 * Obtiene el subtipo o subcategoría legible para una polilínea o camino.
 */
export function getPathSubcategory(path) {
  if (!path) return '';
  let sub = String(path.variety_type || path.subcategory || '').trim();
  if (sub.includes('·')) {
    sub = sub.split('·').pop().trim();
  }
  const normSub = sub.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normSub === 'rio' || normSub === 'rios') {
    return 'Ríos / Arroyos';
  }
  if (sub && normSub !== 'otro' && normSub !== 'otros') {
    return sub;
  }
  const rawCat = String(path.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (rawCat.includes('rio') || rawCat.includes('arroyo')) {
    return 'Ríos / Arroyos';
  }
  const pt = String(path.path_type || '').trim();
  const normPt = pt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normPt === 'rio' || normPt === 'rios') return 'Ríos / Arroyos';
  if (normPt === 'arroyo') return 'Arroyo';
  if (normPt === 'cauce') return 'Cauce natural';
  if (pt && !['otro', 'otro_trazado', 'camino'].includes(normPt)) {
    return pt.charAt(0).toUpperCase() + pt.slice(1);
  }
  return '';
}

/**
 * Purga de forma exhaustiva subcategorías concatenadas o corruptas (ej: "Casas · Caravana"),
 * limpia la lista de categorías personalizadas, sanea el inventario local y unifica trazados.
 */
export function purgeCorruptedSubcategories() {
  try {
    let changed = false;

    // 1. Limpiar customCategories
    const custom = getCustomCategories();
    const cleanedCustom = custom
      .filter((c) => {
        const n = (c.name || '').toLowerCase();
        return n !== 'caminos y trazados' && n !== 'ríos / arroyos' && n !== 'rios / arroyos';
      })
      .map((cat) => {
        const catName = cat.name.trim();
        const validSubs = new Set();
        (cat.subcategories || []).forEach((s) => {
          if (!s || typeof s !== 'string') return;
          const cleanSub = sanitizeSubcategory(s, catName);
          if (cleanSub && cleanSub.toLowerCase() !== catName.toLowerCase()) {
            validSubs.add(cleanSub);
          }
        });
        return {
          ...cat,
          name: catName,
          subcategories: pruneSubcategoryPrefixes(Array.from(validSubs), catName),
        };
      });

    if (JSON.stringify(custom) !== JSON.stringify(cleanedCustom)) {
      setCustomCategories(cleanedCustom);
      changed = true;
    }

    // 2. Limpiar inventario local
    const inv = getLocalInventory();
    let invChanged = false;
    const cleanedInv = inv.map((item) => {
      let sub = item.variety_type || item.variety || '';
      let cat = item.category || getItemCategory(item);
      if (typeof sub === 'string' && sub.includes('·')) {
        const parts = sub.split('·');
        const prefix = parts[0].trim();
        const suffix = parts.pop().trim();
        if (prefix && (!cat || cat === 'otro' || cat === 'Otros' || cat === 'Sin categoría')) {
          cat = prefix;
        }
        sub = suffix;
        invChanged = true;
        return { ...item, category: cat, variety_type: sub };
      }
      return item;
    });

    if (invChanged) {
      setLocalInventory(cleanedInv);
      changed = true;
    }

    // 3. Limpiar caminos locales
    const paths = getLocalPaths();
    let pathsChanged = false;
    const cleanedPaths = paths.map((path) => {
      let cat = path.category || getPathCategory(path);
      let sub = path.variety_type || path.subcategory || '';
      let pChanged = false;

      const normCat = (cat || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normCat === 'caminos y trazados' || normCat === 'caminos') {
        cat = 'Trazados';
        pChanged = true;
      } else if (normCat.includes('rio') || normCat.includes('arroyo')) {
        cat = 'Trazados';
        if (!sub || sub.toLowerCase().includes('rio')) {
          sub = 'Ríos / Arroyos';
        }
        pChanged = true;
      }

      if (typeof sub === 'string' && sub.includes('·')) {
        sub = sub.split('·').pop().trim();
        pChanged = true;
      }

      const normSub = (sub || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normSub === 'rio' || normSub === 'rios') {
        sub = 'Ríos / Arroyos';
        pChanged = true;
      }

      if (pChanged) {
        pathsChanged = true;
        return { ...path, category: cat, variety_type: sub, subcategory: sub };
      }
      return path;
    });

    if (pathsChanged) {
      setLocalPaths(cleanedPaths);
      changed = true;
    }

    // 4. Asegurar que las viejas categorías queden en deletedCategories
    const deleted = getDeletedCategories();
    if (!deleted.has('Caminos y Trazados') || !deleted.has('Ríos / Arroyos') || deleted.has('Trazados')) {
      deleted.add('Caminos y Trazados');
      deleted.add('Ríos / Arroyos');
      deleted.add('Rios / Arroyos');
      deleted.delete('Trazados');
      setDeletedCategories(deleted);
      changed = true;
    }

    return changed;
  } catch (e) {
    console.warn('[InventoryStorage] Error en purgeCorruptedSubcategories:', e);
    return false;
  }
}

/**
 * Migración inicial automática para unificar 'Trazados', integrar 'Ríos / Arroyos' y eliminar 'Río'.
 */
export function runInitialCategoryMigrations() {
  try {
    purgeCorruptedSubcategories();

    const deleted = getDeletedCategories();
    const custom = getCustomCategories();
    const paths = getLocalPaths();

    const hasOldCat = paths.some((p) => {
      const c = (p.category || '').toLowerCase();
      const s = (p.variety_type || p.subcategory || '').toLowerCase();
      return (
        c === 'caminos y trazados' ||
        c === 'rios / arroyos' ||
        c === 'ríos / arroyos' ||
        s === 'rio' ||
        s === 'río'
      );
    });

    const customHasOld = custom.some(
      (c) =>
        c.name.toLowerCase() === 'caminos y trazados' ||
        c.name.toLowerCase() === 'ríos / arroyos' ||
        c.name.toLowerCase() === 'rios / arroyos'
    );

    if (hasOldCat || customHasOld || !deleted.has('Caminos y Trazados') || !deleted.has('Ríos / Arroyos')) {
      deleted.add('Caminos y Trazados');
      deleted.add('Ríos / Arroyos');
      deleted.add('Rios / Arroyos');
      deleted.delete('Trazados');
      setDeletedCategories(deleted);

      const trazadosSubs = [
        'Camino',
        'Carril agrícola',
        'Sendero',
        'MTB',
        'Ríos / Arroyos',
        'Arroyo',
        'Cauce natural',
        'Torrente',
        'Barranco',
        'Vado',
        'Nacimiento',
        'Línea de Riego',
        'Acequia',
        'Otro trazado',
      ];

      const cleanedCustom = custom.filter(
        (c) =>
          c.name.toLowerCase() !== 'caminos y trazados' &&
          c.name.toLowerCase() !== 'ríos / arroyos' &&
          c.name.toLowerCase() !== 'rios / arroyos' &&
          c.name.toLowerCase() !== 'trazados'
      );

      cleanedCustom.push({
        name: 'Trazados',
        subcategories: trazadosSubs,
        color: '#f97316',
      });
      setCustomCategories(cleanedCustom);

      let migratedAny = false;
      const newPaths = paths.map((p) => {
        let changed = false;
        let cat = p.category;
        let sub = p.variety_type || p.subcategory || '';

        const normCat = (cat || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normCat === 'caminos y trazados' || normCat === 'caminos') {
          cat = 'Trazados';
          changed = true;
        } else if (
          normCat === 'rio / arroyos' ||
          normCat === 'rios / arroyos' ||
          normCat === 'rio' ||
          normCat === 'arroyo'
        ) {
          cat = 'Trazados';
          sub = 'Ríos / Arroyos';
          changed = true;
        }

        const normSub = (sub || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normSub === 'rio' || normSub === 'rios') {
          sub = 'Ríos / Arroyos';
          changed = true;
        }

        if (changed) {
          migratedAny = true;
          const updatedP = {
            ...p,
            category: cat,
            variety_type: sub,
            subcategory: sub,
            updated_at: new Date().toISOString(),
          };
          updateFarmPath(p.id, { category: cat, variety_type: sub, subcategory: sub }).catch(() => {});
          return updatedP;
        }
        return p;
      });

      if (migratedAny) {
        setLocalPaths(newPaths);
      }
      syncCategoriesToSupabase(getFarmCategories());
    }
  } catch (err) {
    console.warn('[InventoryStorage] Error en runInitialCategoryMigrations:', err);
  }
}

// Ejecutar migración al importar el módulo
if (typeof window !== 'undefined') {
  setTimeout(() => {
    runInitialCategoryMigrations();
  }, 100);
}

