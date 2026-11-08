// src/services/farmInventoryStorage.js
// Servicio Local-First para inventario y caminos de Campito Jorox con sincronización resiliente a Supabase.
// Garantiza que los pines y trazados NUNCA queden invisibles ni se pierdan,
// funcionando inmediatamente en local mientras se sincroniza con Supabase en la nube.

import { supabase } from '../supabaseClient';

const INVENTORY_STORAGE_KEY = 'campito_farm_inventory_cache';
const PATHS_STORAGE_KEY = 'campito_farm_paths_cache';

// Elementos iniciales de referencia de la finca
const DEFAULT_INITIAL_INVENTORY = [
  {
    id: 'casita_cueva_principal',
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
    // Asegurar que Casita Cueva esté presente
    if (!parsed.some((i) => (i.name || '').toLowerCase().includes('cueva'))) {
      const updated = [DEFAULT_INITIAL_INVENTORY[0], ...parsed];
      setLocalInventory(updated);
      return updated;
    }
    return parsed;
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
    const raw = localStorage.getItem(PATHS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
 * Carga el inventario: consulta Supabase y, si la tabla existe, sincroniza con localStorage.
 * Si Supabase devuelve error (ej: tabla pendiente de crear en el SQL Editor) o está offline,
 * devuelve inmediatamente el inventario local sin fallar ni dejar el mapa en blanco.
 */
export async function loadFarmInventory() {
  const localItems = getLocalInventory();

  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const remoteIds = new Set(data.map((d) => d.id));
      const pendingLocals = localItems.filter((loc) => !remoteIds.has(loc.id));
      const merged = [...data, ...pendingLocals];
      setLocalInventory(merged);
      return merged;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Supabase no disponible o tabla no creada, usando inventario local:', err.message);
  }

  return localItems;
}

/**
 * Guarda o inserta un nuevo item de inventario.
 * Lo persiste inmediatamente en localStorage y luego intenta sincronizar con Supabase.
 */
export async function insertFarmInventoryItem(newItem) {
  const localItems = getLocalInventory();
  const id = newItem.id || `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = new Date().toISOString();

  const itemToSave = {
    ...newItem,
    id,
    created_at: newItem.created_at || now,
    updated_at: now,
    is_active: newItem.is_active !== false,
  };

  // 1. Guardar de inmediato en local (garantía de cero pérdida)
  const updatedLocal = [itemToSave, ...localItems.filter((i) => i.id !== id)];
  setLocalInventory(updatedLocal);

  // 2. Intentar guardar en Supabase
  try {
    const { data, error } = await supabase
      .from('farm_inventory')
      .insert([itemToSave])
      .select()
      .single();

    if (!error && data) {
      const synced = updatedLocal.map((i) => (i.id === id ? data : i));
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
  const updatedLocal = localItems.map((item) => {
    if (item.id === id) {
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

  return updatedLocal.find((i) => i.id === id) || null;
}

/**
 * Elimina un item de inventario.
 */
export async function deleteFarmInventoryItem(id) {
  const localItems = getLocalInventory();
  const filtered = localItems.filter((i) => i.id !== id);
  setLocalInventory(filtered);

  try {
    await supabase.from('farm_inventory').delete().eq('id', id);
  } catch (err) {
    console.warn('[InventoryStorage] Eliminado en local (Supabase pendiente):', err.message);
  }
}

/**
 * Carga de caminos con fallback a localStorage.
 */
export async function loadFarmPaths() {
  const localPaths = getLocalPaths();

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      setLocalPaths(data);
      return data;
    }
  } catch (err) {
    console.warn('[InventoryStorage] Supabase no disponible para caminos, usando local:', err.message);
  }

  return localPaths;
}

/**
 * Guarda o inserta un camino con fallback a localStorage.
 */
export async function insertFarmPath(newPath) {
  const localPaths = getLocalPaths();
  const id = newPath.id || `path_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = new Date().toISOString();

  const pathToSave = {
    ...newPath,
    id,
    created_at: newPath.created_at || now,
    updated_at: now,
    is_active: newPath.is_active !== false,
  };

  const updatedLocal = [pathToSave, ...localPaths.filter((p) => p.id !== id)];
  setLocalPaths(updatedLocal);

  try {
    const { data, error } = await supabase
      .from('farm_paths')
      .insert([pathToSave])
      .select()
      .single();

    if (!error && data) {
      const synced = updatedLocal.map((p) => (p.id === id ? data : p));
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
  const updatedLocal = localPaths.map((p) => {
    if (p.id === id) {
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

  return updatedLocal.find((p) => p.id === id) || null;
}

/**
 * Elimina un camino.
 */
export async function deleteFarmPath(id) {
  const localPaths = getLocalPaths();
  const filtered = localPaths.filter((p) => p.id !== id);
  setLocalPaths(filtered);

  try {
    await supabase.from('farm_paths').delete().eq('id', id);
  } catch (err) {
    console.warn('[InventoryStorage] Camino eliminado en local (Supabase pendiente):', err.message);
  }
}
