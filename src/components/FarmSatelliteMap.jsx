// src/components/FarmSatelliteMap.jsx
// Orquestador del mapa satélite interactivo para Campito Jorox.

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../supabaseClient';
import {
  getLocalInventory,
  getLocalPaths,
  updateFarmInventoryItem,
  deleteFarmInventoryItem,
  insertFarmPath,
  updateFarmPath,
  deleteFarmPath,
  BASE_CATEGORY_MAP,
  PATH_TYPE_COLORS,
  getItemCategory,
} from '../services/farmInventoryStorage';
import { generateCustomPDF } from '../utils/exportTools';
import { syncTextareaHeight } from '../utils/helpers';
import {
  PATH_TYPES,
  PATH_TYPE_LABELS,
  MAP_SETTINGS_STORAGE_KEY,
  loadMapSettingsFromCache,
  calculatePathMeters,
} from './map/mapUtils';
import { styles, stylesPage } from './map/mapStyles';
import { useLeafletMapLayers } from '../hooks/useLeafletMapLayers';
import { useMapGpsTracker } from '../hooks/useMapGpsTracker';
import { useMapIaController } from '../hooks/useMapIaController';
import MapTopToolbar from './map/MapTopToolbar';
import MapOverlays from './map/MapOverlays';
import MapInfoModal from './map/MapInfoModal';
import MapFilterDrawer from './map/MapFilterDrawer';
import MapIaBottomBar from './map/MapIaBottomBar';
import MapSavePathModal from './map/MapSavePathModal';
import RagFileExplorerModal from './rag/RagFileExplorerModal';

export default function FarmSatelliteMap({
  inventory = [],
  paths = [],
  onReloadInventory,
  onReloadPaths,
  onPathCreated,
  isFullScreen = false,
  isPageMode = false,
  searchQuery: propSearchQuery,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const pathsLayerRef = useRef(null);
  const pathNodesLayerRef = useRef(null);
  const drawingLayerRef = useRef(null);
  const catastroLayerRef = useRef(null);
  const elevationLayerRef = useRef(null);
  const userLocationLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const lastLayerClickedTimeRef = useRef(0);

  // ─── Estados locales optimistas (0ms latency) ──────────────────────────────
  const [prevInventoryProp, setPrevInventoryProp] = useState(inventory);
  const [localInventory, setLocalInventory] = useState(() =>
    Array.isArray(inventory) && inventory.length > 0 ? inventory : getLocalInventory()
  );
  const [prevPathsProp, setPrevPathsProp] = useState(paths);
  const [localPaths, setLocalPaths] = useState(() =>
    Array.isArray(paths) && paths.length > 0 ? paths : getLocalPaths()
  );

  if (inventory !== prevInventoryProp) {
    setPrevInventoryProp(inventory);
    if (Array.isArray(inventory) && (inventory.length > 0 || onReloadInventory || isPageMode)) {
      setLocalInventory(inventory);
    } else {
      setLocalInventory(getLocalInventory());
    }
  }

  if (paths !== prevPathsProp) {
    setPrevPathsProp(paths);
    if (Array.isArray(paths) && (paths.length > 0 || onReloadPaths || isPageMode)) {
      setLocalPaths(paths);
    } else {
      setLocalPaths(getLocalPaths());
    }
  }

  useEffect(() => {
    const handleInvUpdated = (e) => {
      if (e?.detail) {
        if (e.detail.deleted && e.detail.id) {
          setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(e.detail.id)));
        } else {
          setLocalInventory((prev) => {
            const exists = prev.some((i) => String(i.id) === String(e.detail.id));
            if (exists) {
              return prev.map((i) =>
                String(i.id) === String(e.detail.id) ? { ...i, ...e.detail } : i
              );
            }
            return [e.detail, ...prev];
          });
        }
      } else {
        setLocalInventory(getLocalInventory());
      }
    };
    const handlePathsUpdated = (e) => {
      if (e?.detail) {
        if (e.detail.deleted) {
          setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(e.detail.id)));
        } else {
          setLocalPaths((prev) => {
            const exists = prev.some((p) => String(p.id) === String(e.detail.id));
            if (exists) {
              return prev.map((p) =>
                String(p.id) === String(e.detail.id) ? { ...p, ...e.detail } : p
              );
            }
            return [e.detail, ...prev];
          });
        }
      } else {
        setLocalPaths(getLocalPaths());
      }
    };

    window.addEventListener('farm-inventory-updated', handleInvUpdated);
    window.addEventListener('farm-paths-updated', handlePathsUpdated);

    // ─── Sincronización Multi-Usuario Realtime con Supabase ───
    const realtimeChannel = supabase
      .channel('public:map_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'farm_inventory' },
        (payload) => {
          if (payload.eventType === 'DELETE' || payload.new?.is_active === false) {
            const delId = payload.old?.id || payload.new?.id;
            if (delId) {
              setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(delId)));
            }
          } else if (payload.new) {
            setLocalInventory((prev) => {
              const exists = prev.some((i) => String(i.id) === String(payload.new.id));
              if (exists) {
                return prev.map((i) => (String(i.id) === String(payload.new.id) ? payload.new : i));
              }
              return [payload.new, ...prev];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'farm_paths' },
        (payload) => {
          if (payload.eventType === 'DELETE' || payload.new?.is_active === false) {
            const delId = payload.old?.id || payload.new?.id;
            if (delId) {
              setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(delId)));
            }
          } else if (payload.new) {
            setLocalPaths((prev) => {
              const exists = prev.some((p) => String(p.id) === String(payload.new.id));
              if (exists) {
                return prev.map((p) => (String(p.id) === String(payload.new.id) ? payload.new : p));
              }
              return [payload.new, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('farm-inventory-updated', handleInvUpdated);
      window.removeEventListener('farm-paths-updated', handlePathsUpdated);
      supabase.removeChannel(realtimeChannel);
    };
  }, []);

  // ─── Descubrimiento dinámico de categorías ─────────────────────────────────
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

  // ─── Capas y filtros persistidos ───────────────────────────────────────────
  const initialMapSettings = useMemo(() => loadMapSettingsFromCache(), []);
  const [showPoints] = useState(() =>
    initialMapSettings?.showPoints !== undefined ? Boolean(initialMapSettings.showPoints) : true
  );
  const [showPaths, setShowPaths] = useState(() =>
    initialMapSettings?.showPaths !== undefined ? Boolean(initialMapSettings.showPaths) : true
  );
  const [showCatastro, setShowCatastro] = useState(() =>
    initialMapSettings?.showCatastro !== undefined ? Boolean(initialMapSettings.showCatastro) : true
  );
  const [showElevationContours, setShowElevationContours] = useState(() =>
    initialMapSettings?.showElevationContours !== undefined ? Boolean(initialMapSettings.showElevationContours) : true
  );
  const [satelliteType] = useState(() => initialMapSettings?.satelliteType || 'esri');
  const [showLegend, setShowLegend] = useState(() =>
    initialMapSettings?.showLegend !== undefined ? Boolean(initialMapSettings.showLegend) : true
  );
  const [showNavControls, setShowNavControls] = useState(() =>
    initialMapSettings?.showNavControls !== undefined ? Boolean(initialMapSettings.showNavControls) : true
  );
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isRagExplorerOpen, setIsRagExplorerOpen] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [liveUserGps, setLiveUserGps] = useState(null);
  const liveUserGpsRef = useRef(null);
  const [gpsStatus, setGpsStatus] = useState('searching');

  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : '';
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState(() => {
    const base = new Set(Object.keys(BASE_CATEGORY_MAP));
    if (initialMapSettings?.visibleCategories && Array.isArray(initialMapSettings.visibleCategories)) {
      const saved = new Set(initialMapSettings.visibleCategories);
      if (saved.has('Edificios')) saved.add('Casas / Edificios');
      saved.add('Casas / Edificios');
      allCategories.forEach((cat) => {
        if (!Object.prototype.hasOwnProperty.call(BASE_CATEGORY_MAP, cat) && cat !== 'Otros') {
          saved.add(cat);
        }
      });
      return saved;
    }
    return new Set([...base, ...allCategories]);
  });
  const [knownCategories, setKnownCategories] = useState(() => allCategories);

  if (allCategories !== knownCategories) {
    const added = allCategories.filter((cat) => !knownCategories.includes(cat));
    setKnownCategories(allCategories);
    if (added.length > 0) {
      setVisibleCategories((prev) => {
        let changed = false;
        const next = new Set(prev);
        added.forEach((cat) => {
          if (!next.has(cat)) {
            next.add(cat);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }

  const [visibleSubcats, setVisibleSubcats] = useState(() =>
    initialMapSettings?.visibleSubcats && Array.isArray(initialMapSettings.visibleSubcats)
      ? new Set(initialMapSettings.visibleSubcats)
      : null
  );
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [visiblePathTypes, setVisiblePathTypes] = useState(() =>
    initialMapSettings?.visiblePathTypes && Array.isArray(initialMapSettings.visiblePathTypes)
      ? new Set(initialMapSettings.visiblePathTypes)
      : new Set(PATH_TYPES)
  );

  useEffect(() => {
    try {
      const payload = {
        showLegend,
        showNavControls,
        satelliteType,
        showCatastro,
        showElevationContours,
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
    showElevationContours,
    showPaths,
    showPoints,
    visibleCategories,
    visibleSubcats,
    visiblePathTypes,
  ]);

  // ─── Dibujo de caminos, selección y estado Chat IA ─────────────────────────
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPathData, setNewPathData] = useState({
    name: '',
    path_type: 'sendero',
    color: '#f97316',
    stroke_width: 4,
    notes: '',
  });
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [mapIaInput, setMapIaInput] = useState('');
  const [isProcessingIa, setIsProcessingIa] = useState(false);
  const [iaFeedback, setIaFeedback] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const mapIaTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    syncTextareaHeight(mapIaTextareaRef.current, mapIaInput);
  }, [mapIaInput]);

  const isDrawingRef = useRef(isDrawing);
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  const appendDrawPoint = useCallback((latlng) => {
    if (!latlng) return;
    setDrawPoints((prev) => [
      ...prev,
      { lat: Number(latlng.lat.toFixed(7)), lng: Number(latlng.lng.toFixed(7)) },
    ]);
  }, []);

  const interceptLayerClickForDraw = useCallback(
    (e) => {
      if (!isDrawingRef.current) return false;
      if (e) {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) e.originalEvent.stopPropagation();
      }
      lastLayerClickedTimeRef.current = Date.now();
      if (e?.latlng) appendDrawPoint(e.latlng);
      return true;
    },
    [appendDrawPoint]
  );

  const liveDrawDistance = useMemo(() => calculatePathMeters(drawPoints), [drawPoints]);

  // ─── Filtrado y auto-enfoque por búsqueda ──────────────────────────────────
  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return localInventory.filter((item) => {
      if (q) {
        const searchable = [item.name, item.category, item.tipo, item.variety_type, item.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      const parent = getItemCategory(item);
      if (!visibleCategories.has(parent)) return false;
      if (visibleSubcats !== null) {
        const rawSub = item.variety_type || item.category || item.tipo || '';
        if (!visibleSubcats.has(rawSub)) return false;
      }
      return true;
    });
  }, [localInventory, searchQuery, visibleCategories, visibleSubcats]);

  const filteredPaths = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return localPaths.filter((path) => {
      if (q) {
        const searchable = [path.name, path.path_type, path.notes].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      const pt = path.path_type || 'otro';
      if (pt === 'linde') return showCatastro;
      return showPaths && visiblePathTypes.has(pt);
    });
  }, [localPaths, searchQuery, showCatastro, showPaths, visiblePathTypes]);

  useEffect(() => {
    const q = (searchQuery || '').trim();
    if (!q || !mapInstanceRef.current) return;

    if (filteredInventory.length === 1) {
      const item = filteredInventory[0];
      const lat = item.latitude || item.coordenadas?.lat;
      const lng = item.longitude || item.coordenadas?.lng;
      if (lat && lng) mapInstanceRef.current.setView([lat, lng], 19, { animate: true });
    } else if (filteredInventory.length > 1) {
      const coords = filteredInventory
        .map((i) => [i.latitude || i.coordenadas?.lat, i.longitude || i.coordenadas?.lng])
        .filter(([lat, lng]) => lat && lng);
      if (coords.length > 0) {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: true });
      }
    } else if (filteredPaths.length === 1) {
      const coords = filteredPaths[0].coordinates;
      if (Array.isArray(coords) && coords.length > 0) {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: true });
      }
    }
  }, [searchQuery, filteredInventory, filteredPaths]);

  // ─── Capas Leaflet + GPS en vivo ───────────────────────────────────────────
  const { fitAllElements } = useLeafletMapLayers({
    mapContainerRef,
    mapInstanceRef,
    markersLayerRef,
    pathsLayerRef,
    pathNodesLayerRef,
    drawingLayerRef,
    catastroLayerRef,
    elevationLayerRef,
    userLocationLayerRef,
    highlightLayerRef,
    isDrawingRef,
    lastLayerClickedTimeRef,
    appendDrawPoint,
    interceptLayerClickForDraw,
    setIsLayersMenuOpen,
    setIsFilterOpen,
    setSelectedTarget,
    setLocalPaths,
    onReloadPaths,
    isFullScreen,
    selectedTarget,
    isDrawing,
    drawPoints,
    showPoints,
    filteredInventory,
    showPaths,
    filteredPaths,
    localPaths,
    showCatastro,
    showElevationContours,
    inventory,
    paths,
  });

  const { handleCenterOnUserLocation } = useMapGpsTracker({
    mapInstanceRef,
    userLocationLayerRef,
    liveUserGpsRef,
    setLiveUserGps,
    setGpsStatus,
    setIsLocatingUser,
    setIaFeedback,
  });

  // ─── Handlers de guardado, filtros, edición directa y borrado ─────────────
  const handleSaveDrawnPath = async () => {
    if (drawPoints.length < 2) {
      alert('Un camino o sendero debe tener al menos 2 puntos marcados en el mapa.');
      return;
    }

    const pathName = newPathData.name.trim() || `Sendero ${localPaths.length + 1}`;
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
      setIsDrawing(false);
      setDrawPoints([]);
      setShowSaveModal(false);
      setNewPathData({ name: '', path_type: 'sendero', color: '#f97316', stroke_width: 4, notes: '' });

      if (data) {
        setShowPaths(true);
        setLocalPaths((prev) => [data, ...prev.filter((p) => String(p.id) !== String(data.id))]);
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

  const handleExportVisiblePDF = () => {
    const dateStr = new Date().toLocaleDateString('es-ES');
    const rows = filteredInventory.map((item) => [
      item.name || item.tipo || '—',
      getItemCategory(item),
      item.category || item.tipo || '—',
      item.variety_type || '—',
      item.status || item.estado || 'saludable',
      item.notes || '—',
      `${(item.latitude || item.coordenadas?.lat || 0).toFixed(6)}, ${(item.longitude || item.coordenadas?.lng || 0).toFixed(6)}`,
    ]);

    const pathRows = filteredPaths.map((path) => [
      path.name || '—',
      'Trazado',
      PATH_TYPE_LABELS[path.path_type] || path.path_type || '—',
      '—',
      `${path.coordinates?.length || 0} nodos`,
      path.notes || '—',
      path.length_meters ? `${Number(path.length_meters).toFixed(0)} m` : '—',
    ]);

    generateCustomPDF({
      title: 'Inventario Campito Jorox',
      subtitle: `Generado el ${dateStr} · ${filteredInventory.length} puntos · ${filteredPaths.length} trazados`,
      content: '',
      table: {
        headers: ['Nombre', 'Categoría', 'Tipo', 'Variedad', 'Estado/Nodos', 'Notas', 'GPS/Metros'],
        rows: [...rows, ...pathRows],
      },
      filename: `CAMPITO_MAPA_VISIBLE_${new Date().toISOString().split('T')[0]}.pdf`,
    });
  };

  const toggleParentCategory = (parent) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(parent)) next.delete(parent);
      else next.add(parent);
      return next;
    });
    setVisibleSubcats(null);
  };

  const togglePathType = (pt) => {
    setVisiblePathTypes((prev) => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });
  };

  const selectAllFilters = () => {
    setVisibleCategories(new Set(allCategories));
    setVisibleSubcats(null);
    setVisiblePathTypes(new Set(PATH_TYPES.filter((pt) => pt !== 'linde')));
    setShowPaths(true);
  };

  const clearAllFilters = () => {
    setVisibleCategories(new Set());
    setVisibleSubcats(null);
    setVisiblePathTypes(new Set());
    setShowPaths(false);
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
        setLocalInventory((prev) => prev.filter((i) => String(i.id) !== String(targetId)));
        await deleteFarmInventoryItem(targetId);
        setIaFeedback({ type: 'success', text: `🗑️ Pin eliminado: ${targetTitle}` });
        setSelectedTarget(null);
        if (onReloadInventory) await onReloadInventory();
      } else if (targetType === 'path') {
        setLocalPaths((prev) => prev.filter((p) => String(p.id) !== String(targetId)));
        await deleteFarmPath(targetId);
        setIaFeedback({ type: 'success', text: `🗑️ Trazado eliminado: ${targetTitle}` });
        setSelectedTarget(null);
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

  const handleToggleDraw = () => {
    setIsLayersMenuOpen(false);
    setIsFilterOpen(false);
    if (isDrawing) {
      setIsDrawing(false);
      setDrawPoints([]);
      setIaFeedback(null);
    } else {
      setShowPaths(true);
      setIsDrawing(true);
      setDrawPoints([]);
      setSelectedTarget(null);
      setIaFeedback({
        type: 'info',
        text: '✏️ Toca puntos sobre el mapa para trazar la polilínea.',
      });
    }
  };

  const directSaveTimersRef = useRef({});
  const directSavePendingRef = useRef({});

  useEffect(() => {
    const timers = directSaveTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleDirectFieldUpdate = async (field, value) => {
    if (!selectedTarget) return;

    if (selectedTarget.type === 'point') {
      const targetId = selectedTarget.id;
      const updateObj = {};
      if (field === 'title' || field === 'name') updateObj.name = value;
      else if (field === 'category') updateObj.category = value;
      else if (field === 'variety_type' || field === 'variety') updateObj.variety_type = value;
      else if (field === 'status') updateObj.status = value;
      else if (field === 'notes') updateObj.notes = value;

      setSelectedTarget((prev) => {
        if (!prev || String(prev.id) !== String(targetId)) return prev;
        return {
          ...prev,
          ...updateObj,
          ...('name' in updateObj ? { title: updateObj.name } : {}),
          ...('variety_type' in updateObj ? { variety: updateObj.variety_type } : {}),
        };
      });
      setLocalInventory((prev) =>
        prev.map((item) => (String(item.id) === String(targetId) ? { ...item, ...updateObj } : item))
      );

      const saveKey = `point:${targetId}`;
      directSavePendingRef.current[saveKey] = {
        ...(directSavePendingRef.current[saveKey] || {}),
        ...updateObj,
      };
      if (directSaveTimersRef.current[saveKey]) {
        clearTimeout(directSaveTimersRef.current[saveKey]);
      }

      const flushPoint = async () => {
        const payload = directSavePendingRef.current[saveKey];
        if (!payload) return;
        delete directSavePendingRef.current[saveKey];
        try {
          await updateFarmInventoryItem(targetId, payload);
          window.dispatchEvent(
            new CustomEvent('farm-inventory-updated', { detail: { id: targetId, ...payload } })
          );
        } catch (err) {
          console.warn('Error guardando cambio directo en inventario:', err);
        }
      };

      if (field === 'status') {
        await flushPoint();
      } else {
        directSaveTimersRef.current[saveKey] = setTimeout(flushPoint, 450);
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

      setSelectedTarget((prev) => {
        if (!prev || String(prev.id) !== String(targetId)) return prev;
        return {
          ...prev,
          ...updateObj,
          ...('name' in updateObj ? { title: updateObj.name } : {}),
        };
      });
      setLocalPaths((prev) =>
        prev.map((p) => (String(p.id) === String(targetId) ? { ...p, ...updateObj } : p))
      );

      const saveKey = `path:${targetId}`;
      directSavePendingRef.current[saveKey] = {
        ...(directSavePendingRef.current[saveKey] || {}),
        ...updateObj,
      };
      if (directSaveTimersRef.current[saveKey]) {
        clearTimeout(directSaveTimersRef.current[saveKey]);
      }

      const flushPath = async () => {
        const payload = directSavePendingRef.current[saveKey];
        if (!payload) return;
        delete directSavePendingRef.current[saveKey];
        try {
          await updateFarmPath(targetId, payload);
        } catch (err) {
          console.warn('Error guardando cambio directo en camino:', err);
        }
      };

      if (field === 'path_type' || field === 'color') {
        await flushPath();
      } else {
        directSaveTimersRef.current[saveKey] = setTimeout(flushPath, 450);
      }
    }
  };

  const handleDeleteNode = async (pathId, nodeIndex) => {
    const path = localPaths.find((p) => String(p.id) === String(pathId));
    if (!path || !Array.isArray(path.coordinates) || path.coordinates.length <= 2) {
      alert(
        'Un recorrido debe tener al menos 2 nodos. Si deseas eliminar el recorrido completo, usa el botón de borrar recorrido.'
      );
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

  // ─── Controlador IA integrado (voz, cámara, archivos, fondo, deshacer) ─────
  const ia = useMapIaController({
    mapInstanceRef,
    liveUserGpsRef,
    selectedTarget,
    setSelectedTarget,
    localInventory,
    setLocalInventory,
    localPaths,
    setLocalPaths,
    filteredInventory,
    filteredPaths,
    setVisibleCategories,
    setVisibleSubcats,
    onReloadInventory,
    onReloadPaths,
    handleDeleteTarget,
    mapIaInput,
    setMapIaInput,
    isProcessingIa,
    setIsProcessingIa,
    iaFeedback,
    setIaFeedback,
    undoStack,
    setUndoStack,
    pendingAttachments,
    setPendingAttachments,
    mapIaTextareaRef,
    fileInputRef,
    docInputRef,
  });

  return (
    <div style={isPageMode ? stylesPage.wrapper : styles.wrapper}>
      <MapTopToolbar
        searchQuery={searchQuery}
        filteredCount={filteredInventory.length + filteredPaths.length}
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        isDrawing={isDrawing}
        handleToggleDraw={handleToggleDraw}
        isLayersMenuOpen={isLayersMenuOpen}
        setIsLayersMenuOpen={setIsLayersMenuOpen}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showNavControls={showNavControls}
        setShowNavControls={setShowNavControls}
        showElevationContours={showElevationContours}
        setShowElevationContours={setShowElevationContours}
        showCatastro={showCatastro}
        setShowCatastro={setShowCatastro}
        handleExportVisiblePDF={handleExportVisiblePDF}
        setIsInfoModalOpen={setIsInfoModalOpen}
        onOpenRagExplorer={() => setIsRagExplorerOpen(true)}
      />

      <div style={styles.mapContainer}>
        <div ref={mapContainerRef} style={styles.leafletMap} />

        <MapOverlays
          isDrawing={isDrawing}
          drawPoints={drawPoints}
          setDrawPoints={setDrawPoints}
          liveDrawDistance={liveDrawDistance}
          newPathData={newPathData}
          setNewPathData={setNewPathData}
          setIsDrawing={setIsDrawing}
          setShowSaveModal={setShowSaveModal}
          showLegend={showLegend}
          selectedTarget={selectedTarget}
          allCategories={allCategories}
          localInventory={localInventory}
          localPaths={localPaths}
          showPaths={showPaths}
          showCatastro={showCatastro}
          showElevationContours={showElevationContours}
          showNavControls={showNavControls}
          mapInstanceRef={mapInstanceRef}
          handleCenterOnUserLocation={handleCenterOnUserLocation}
          isLocatingUser={isLocatingUser}
          gpsStatus={gpsStatus}
          liveUserGps={liveUserGps}
          fitAllElements={fitAllElements}
        />

        <MapInfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />

        <MapFilterDrawer
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          selectAllFilters={selectAllFilters}
          clearAllFilters={clearAllFilters}
          allCategories={allCategories}
          localInventory={localInventory}
          visibleCategories={visibleCategories}
          toggleParentCategory={toggleParentCategory}
          expandedParents={expandedParents}
          setExpandedParents={setExpandedParents}
          visibleSubcats={visibleSubcats}
          setVisibleSubcats={setVisibleSubcats}
          localPaths={localPaths}
          showPaths={showPaths}
          setShowPaths={setShowPaths}
          visiblePathTypes={visiblePathTypes}
          setVisiblePathTypes={setVisiblePathTypes}
          togglePathType={togglePathType}
        />

        <MapIaBottomBar
          selectedTarget={selectedTarget}
          setSelectedTarget={setSelectedTarget}
          localPaths={localPaths}
          allCategories={allCategories}
          handleDirectFieldUpdate={handleDirectFieldUpdate}
          handleDeleteTarget={handleDeleteTarget}
          handleDeleteNode={handleDeleteNode}
          pendingAttachments={pendingAttachments}
          setPendingAttachments={setPendingAttachments}
          iaFeedback={iaFeedback}
          setIaFeedback={setIaFeedback}
          isProcessingIa={isProcessingIa}
          docInputRef={docInputRef}
          fileInputRef={fileInputRef}
          handleDocumentChange={ia.handleDocumentChange}
          handleCameraChange={ia.handleCameraChange}
          handleAttachClick={ia.handleAttachClick}
          handleCameraClick={ia.handleCameraClick}
          pendingVoiceAudio={ia.pendingVoiceAudio}
          isVoiceRecording={ia.isVoiceRecording}
          handleDiscardVoice={ia.handleDiscardVoice}
          togglePlayPreview={ia.togglePlayPreview}
          isPreviewPlaying={ia.isPreviewPlaying}
          setIsPreviewPlaying={ia.setIsPreviewPlaying}
          previewDuration={ia.previewDuration}
          setPreviewDuration={ia.setPreviewDuration}
          previewCurrentTime={ia.previewCurrentTime}
          setPreviewCurrentTime={ia.setPreviewCurrentTime}
          handleSeekPreview={ia.handleSeekPreview}
          previewAudioRef={ia.previewAudioRef}
          voiceRecordingSeconds={ia.voiceRecordingSeconds}
          wakeLockActive={ia.wakeLockActive}
          voiceCurrentGps={ia.voiceCurrentGps}
          liveUserGps={liveUserGps}
          handleCancelVoiceRecording={ia.handleCancelVoiceRecording}
          handleStopVoiceRecording={ia.handleStopVoiceRecording}
          handleStartVoiceRecording={ia.handleStartVoiceRecording}
          mapIaTextareaRef={mapIaTextareaRef}
          mapIaInput={mapIaInput}
          setMapIaInput={setMapIaInput}
          handleSendMapIaOrder={ia.handleSendMapIaOrder}
          undoStack={undoStack}
          handleUndoMapAction={ia.handleUndoMapAction}
        />
      </div>

      <MapSavePathModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        drawPoints={drawPoints}
        liveDrawDistance={liveDrawDistance}
        newPathData={newPathData}
        setNewPathData={setNewPathData}
        onSave={handleSaveDrawnPath}
      />

      <RagFileExplorerModal
        isOpen={isRagExplorerOpen}
        onClose={() => setIsRagExplorerOpen(false)}
      />
    </div>
  );
}
