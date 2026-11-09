// src/services/farmInventoryStorage.js
// Servicio Local-First para inventario y caminos de Campito Jorox con sincronización resiliente a Supabase.
// Garantiza que los pines y trazados NUNCA queden invisibles ni se pierdan,
// funcionando inmediatamente en local mientras se sincroniza con Supabase en la nube.

import { supabase } from '../supabaseClient';

const INVENTORY_STORAGE_KEY = 'campito_farm_inventory_cache';
const PATHS_STORAGE_KEY = 'campito_farm_paths_cache';
const DELETED_INVENTORY_KEY = 'campito_deleted_inventory_ids';
const DELETED_PATHS_KEY = 'campito_deleted_paths_ids';

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

// ─── Gestión de IDs eliminados para evitar resurrección por caché / polling ───
export function getDeletedInventoryIds() {
  try {
    const raw = localStorage.getItem(DELETED_INVENTORY_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch (e) {
    return new Set();
  }
}

export function addDeletedInventoryId(id) {
  if (!id) return;
  try {
    const current = getDeletedInventoryIds();
    current.add(String(id));
    localStorage.setItem(DELETED_INVENTORY_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando ID borrado:', e);
  }
}

export function removeDeletedInventoryId(id) {
  if (!id) return;
  try {
    const current = getDeletedInventoryIds();
    current.delete(String(id));
    localStorage.setItem(DELETED_INVENTORY_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error desmarcando ID borrado:', e);
  }
}

export function getDeletedPathIds() {
  try {
    const raw = localStorage.getItem(DELETED_PATHS_KEY);
    return raw ? new Set(JSON.parse(raw).map(String)) : new Set();
  } catch (e) {
    return new Set();
  }
}

export function addDeletedPathId(id) {
  if (!id) return;
  try {
    const current = getDeletedPathIds();
    current.add(String(id));
    localStorage.setItem(DELETED_PATHS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('[InventoryStorage] Error guardando ID de camino borrado:', e);
  }
}

export function removeDeletedPathId(id) {
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

    // Asegurar que Casita Cueva esté presente sólo si no fue borrada expresamente
    if (
      !deletedIds.has('00000000-0000-4000-8000-000000000001') &&
      !deletedIds.has('casita_cueva_principal') &&
      !activeItems.some((i) => (i.name || '').toLowerCase().includes('cueva'))
    ) {
      const updated = [DEFAULT_INITIAL_INVENTORY[0], ...activeItems];
      setLocalInventory(updated);
      return updated;
    }
    return activeItems;
  } catch (e) {
    console.warn('[InventoryStorage] Error leyendo inventario local:', e);
    return DEFAULT_INITIAL_INVENTORY;
  }
}

export function setLocalInventory(items) {
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

export function setLocalPaths(paths) {
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

      // Asegurar que Casita Cueva de referencia esté presente si no fue borrada expresamente
      if (
        !deletedIds.has('00000000-0000-4000-8000-000000000001') &&
        !deletedIds.has('casita_cueva_principal') &&
        !merged.some((i) => (i.name || '').toLowerCase().includes('cueva'))
      ) {
        merged = [DEFAULT_INITIAL_INVENTORY[0], ...merged];
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

  // 1. Registrar en lista negra de eliminados para que loadFarmInventory no lo restaure
  addDeletedInventoryId(targetIdStr);

  // 2. Eliminar del almacenamiento local
  const localItems = getLocalInventory();
  const filtered = localItems.filter((i) => String(i.id) !== targetIdStr);
  setLocalInventory(filtered);

  // 3. Persistir en Supabase (ambos métodos: soft-delete y hard-delete)
  try {
    const now = new Date().toISOString();
    // Soft delete: respeta políticas RLS de UPDATE
    await supabase
      .from('farm_inventory')
      .update({ is_active: false, updated_at: now })
      .eq('id', id);

    // Hard delete: si las políticas lo permiten, elimina la fila
    await supabase
      .from('farm_inventory')
      .delete()
      .eq('id', id);
  } catch (err) {
    console.warn('[InventoryStorage] Eliminado en local (Supabase pendiente):', err.message);
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
