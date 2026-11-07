// src/components/FarmSatelliteMap.jsx
// Mapa satélite interactivo para Campito Jorox con soporte para:
// - Puntos de inventario (árboles, plantas, arquetas) representados ÚNICAMENTE mediante puntos de colores (sin iconos).
// - Caminos, senderos y líneas de riego representados mediante líneas de colores (trazados polilíneas).
// - Herramienta para trazar/dibujar nuevos caminos haciendo clic sobre el mapa satélite y guardarlos en Supabase.
// - Edición de caminos existentes (renombrar, cambiar color, eliminar).

import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  FileText
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  exportInventoryToGeoJSON,
} from '../utils/exportTools';

// Coordenadas por defecto: Jorox (Alozaina, Málaga)
const DEFAULT_CENTER = [36.7344, -4.8883];
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

// Determinación del color del punto (sin iconos)
function getPointColor(item) {
  const cat = (item.category || item.tipo || '').toLowerCase();
  const status = (item.status || item.estado || '').toLowerCase();

  if (status === 'enfermo' || status === 'seco') return '#ef4444'; // Rojo
  if (status === 'clorosis') return '#eab308'; // Amarillo clorosis
  if (status === 'poda_requerida') return '#f97316'; // Naranja poda

  if (cat.includes('arbol') || cat.includes('planta') || cat.includes('aguacate')) {
    return '#10b981'; // Verde esmeralda
  }
  if (cat.includes('arqueta') || cat.includes('pozo') || cat.includes('deposito')) {
    return '#0284c7'; // Azul cielo
  }
  if (cat.includes('acequia') || cat.includes('riego')) {
    return '#06b6d4'; // Cian
  }
  if (cat.includes('piedra') || cat.includes('linde')) {
    return '#8b5cf6'; // Púrpura
  }
  return '#64748b'; // Pizarra
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
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const pathsLayerRef = useRef(null);
  const drawingLayerRef = useRef(null);

  // Estados de capas visibles
  const [showPoints, setShowPoints] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [satelliteType, setSatelliteType] = useState('esri'); // 'esri' | 'google'

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

  // Distancia calculada en vivo del camino en dibujo
  const liveDrawDistance = useMemo(() => calculatePathMeters(drawPoints), [drawPoints]);

  // ─── 1. Inicialización de Leaflet y capas base ──────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Evitar reinicialización doble

    // Crear mapa Leaflet
    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false, // Lo añadimos en posición cómoda
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

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
    markersLayerRef.current = L.featureGroup().addTo(map);
    pathsLayerRef.current = L.featureGroup().addTo(map);
    drawingLayerRef.current = L.featureGroup().addTo(map);

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

    inventory.forEach((item) => {
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

      marker.on('click', () => {
        setSelectedPoint(item);
        setSelectedPath(null);
      });

      // Tooltip rápido al pasar el ratón
      marker.bindTooltip(
        `<b>${item.name || item.tipo}</b> ${item.variety_type ? `(${item.variety_type})` : ''}`,
        { direction: 'top', offset: [0, -6], className: 'campito-map-tooltip' }
      );

      marker.addTo(layer);
    });
  }, [inventory, showPoints]);

  // ─── 5. Renderizado de Caminos y Senderos (LÍNEAS DE COLOR) ───────────────────
  useEffect(() => {
    const layer = pathsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showPaths) return;

    paths.forEach((path) => {
      const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
      if (coords.length < 2) return;

      const latlngs = coords.map((c) => [c.lat, c.lng]);
      const poly = L.polyline(latlngs, {
        color: path.color || '#f97316',
        weight: Number(path.stroke_width) || 4,
        opacity: 0.85,
        dashArray: path.path_type === 'linea_riego' ? '8, 6' : path.path_type === 'acequia' ? '4, 4' : null,
      });

      poly.on('click', () => {
        setSelectedPath(path);
        setSelectedPoint(null);
        setEditPathData({
          name: path.name,
          color: path.color || '#f97316',
          stroke_width: path.stroke_width || 4,
          notes: path.notes || '',
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
  }, [paths, showPaths]);

  // ─── 6. Auto-ajuste de vista a todos los elementos al cargar ────────────────
  const fitAllElements = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = L.latLngBounds([]);
    let count = 0;

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

  return (
    <div style={styles.wrapper}>
      {/* ── Barra Superior de Controles y Herramientas ───────────────────────── */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <div style={styles.titleBadge}>
            <Compass size={14} color="#00979d" />
            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>
              Mapa Satélite Campito Jorox
            </span>
          </div>

          {/* Toggle de visibilidad de capas */}
          <button
            onClick={() => setShowPoints(!showPoints)}
            style={{
              ...styles.toggleBtn,
              backgroundColor: showPoints ? '#ecfdf5' : '#f1f5f9',
              color: showPoints ? '#047857' : '#64748b',
              borderColor: showPoints ? '#a7f3d0' : '#cbd5e1',
            }}
            title="Mostrar u ocultar puntos de árboles y riego"
          >
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', marginRight: 4 }} />
            {showPoints ? <Eye size={12} /> : <EyeOff size={12} />}
            <span>Árboles ({inventory.length})</span>
          </button>

          <button
            onClick={() => setShowPaths(!showPaths)}
            style={{
              ...styles.toggleBtn,
              backgroundColor: showPaths ? '#fff7ed' : '#f1f5f9',
              color: showPaths ? '#c2410c' : '#64748b',
              borderColor: showPaths ? '#fed7aa' : '#cbd5e1',
            }}
            title="Mostrar u ocultar caminos y senderos"
          >
            <span style={{ display: 'inline-block', width: 12, height: 2, backgroundColor: '#f97316', marginRight: 4 }} />
            {showPaths ? <Eye size={12} /> : <EyeOff size={12} />}
            <span>Caminos ({paths.length})</span>
          </button>
        </div>

        <div style={styles.topBarRight}>
          {/* Botón para centrar todo */}
          <button onClick={fitAllElements} style={styles.iconBtn} title="Enfocar todos los elementos">
            <Layers size={14} color="#475569" />
          </button>

          {/* Botón para activar trazado interactivo */}
          {!isDrawing ? (
            <button
              onClick={() => {
                setIsDrawing(true);
                setDrawPoints([]);
                setSelectedPath(null);
                setSelectedPoint(null);
              }}
              style={styles.drawStartBtn}
              title="Haz clic sobre el mapa para trazar un camino o sendero"
            >
              <Plus size={13} />
              <span>Trazar Camino / Sendero</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsDrawing(false);
                setDrawPoints([]);
              }}
              style={styles.drawCancelBtn}
            >
              <X size={13} />
              <span>Cancelar trazo</span>
            </button>
          )}

          {/* Si hay un paseo GPS reciente, botón rápido para guardarlo como camino */}
          {lastRecordedGpsTrack && lastRecordedGpsTrack.length >= 2 && !isDrawing && (
            <button
              onClick={handleConvertGpsTrackToPath}
              style={styles.gpsConvertBtn}
              title="Guardar la ruta de tu última caminata como sendero permanente"
            >
              <Navigation size={13} />
              <span>Guardar Paseo GPS</span>
            </button>
          )}

          {/* Toggle Fullscreen si se pasa la función */}
          {onToggleFullScreen && (
            <button onClick={onToggleFullScreen} style={styles.iconBtn} title="Pantalla completa">
              {isFullScreen ? <Minimize2 size={14} color="#475569" /> : <Maximize2 size={14} color="#475569" />}
            </button>
          )}
        </div>
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

        {/* Leyenda de colores flotante (NO ICONOS) */}
        <div style={styles.legendBox}>
          <span style={styles.legendTitle}>Referencias (Puntos y Líneas)</span>
          <div style={styles.legendGrid}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorCircle, backgroundColor: '#10b981' }} />
              <span>Árbol Sano</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorCircle, backgroundColor: '#eab308' }} />
              <span>Clorosis</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorCircle, backgroundColor: '#ef4444' }} />
              <span>Poda/Seco</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorCircle, backgroundColor: '#0284c7' }} />
              <span>Arqueta/Pozo</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#f97316' }} />
              <span>Camino</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#eab308' }} />
              <span>Sendero</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#0284c7', borderTop: '2px dashed #0284c7', height: 0 }} />
              <span>Línea Riego</span>
            </div>
          </div>
        </div>

        {/* Tarjeta flotante de punto seleccionado */}
        {selectedPoint && (
          <div style={styles.infoCard}>
            <div style={styles.infoCardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: getPointColor(selectedPoint),
                    border: '1.5px solid #ffffff',
                  }}
                />
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                  {selectedPoint.name || selectedPoint.tipo}
                </span>
              </div>
              <button onClick={() => setSelectedPoint(null)} style={styles.cardCloseBtn}>
                <X size={13} />
              </button>
            </div>

            <div style={styles.infoCardBody}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Categoría:</span>
                <span style={styles.infoVal}>{selectedPoint.category || selectedPoint.tipo}</span>
              </div>
              {selectedPoint.variety_type && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Variedad:</span>
                  <span style={styles.infoVal}>{selectedPoint.variety_type}</span>
                </div>
              )}
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Estado:</span>
                <span style={{ ...styles.infoVal, fontWeight: 700 }}>
                  {(selectedPoint.status || selectedPoint.estado || 'saludable').toUpperCase()}
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Coordenadas:</span>
                <span style={styles.infoVal}>
                  {(selectedPoint.latitude || selectedPoint.coordenadas?.lat)?.toFixed(6)},{' '}
                  {(selectedPoint.longitude || selectedPoint.coordenadas?.lng)?.toFixed(6)}
                </span>
              </div>
              {(selectedPoint.accuracy_meters || selectedPoint.accuracy_m) && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Precisión GPS:</span>
                  <span style={styles.infoVal}>
                    ±{Number(selectedPoint.accuracy_meters || selectedPoint.accuracy_m).toFixed(1)}m{' '}
                    {(selectedPoint.gps_warning || selectedPoint.advertencia_gps) && '⚠️ (>6m)'}
                  </span>
                </div>
              )}
              {selectedPoint.notes && (
                <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                  "{selectedPoint.notes}"
                </div>
              )}
            </div>

            <div style={styles.infoCardFooter}>
              <a
                href={`https://maps.google.com/?q=${selectedPoint.latitude || selectedPoint.coordenadas?.lat},${selectedPoint.longitude || selectedPoint.coordenadas?.lng}`}
                target="_blank"
                rel="noreferrer"
                style={styles.cardLinkBtn}
              >
                Abrir en Google Maps
              </a>
              <button onClick={() => handleDeletePoint(selectedPoint.id)} style={styles.cardDeleteBtn}>
                <Trash2 size={12} />
                Eliminar
              </button>
            </div>
          </div>
        )}

        {/* Tarjeta flotante de camino seleccionado */}
        {selectedPath && (
          <div style={styles.infoCard}>
            <div style={styles.infoCardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: selectedPath.color || '#f97316' }} />
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                  {selectedPath.name}
                </span>
              </div>
              <button onClick={() => setSelectedPath(null)} style={styles.cardCloseBtn}>
                <X size={13} />
              </button>
            </div>

            {!isEditingPath ? (
              <>
                <div style={styles.infoCardBody}>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Tipo de trazado:</span>
                    <span style={styles.infoVal}>{selectedPath.path_type}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Longitud estimada:</span>
                    <span style={{ ...styles.infoVal, fontWeight: 700, color: '#00979d' }}>
                      {selectedPath.length_meters ? `${Number(selectedPath.length_meters).toFixed(1)} metros` : '—'}
                    </span>
                  </div>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Vértices / Nodos:</span>
                    <span style={styles.infoVal}>{selectedPath.coordinates?.length || 0} puntos</span>
                  </div>
                  {selectedPath.notes && (
                    <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                      "{selectedPath.notes}"
                    </div>
                  )}
                </div>

                <div style={styles.infoCardFooter}>
                  <button onClick={() => setIsEditingPath(true)} style={styles.cardEditBtn}>
                    <Edit2 size={12} />
                    Editar trazado
                  </button>
                  <button onClick={() => handleDeletePath(selectedPath.id)} style={styles.cardDeleteBtn}>
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '8px 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={styles.fieldLabel}>Nombre:</label>
                  <input
                    type="text"
                    value={editPathData.name}
                    onChange={(e) => setEditPathData({ ...editPathData, name: e.target.value })}
                    style={styles.inputField}
                  />
                </div>
                <div>
                  <label style={styles.fieldLabel}>Color de línea:</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setEditPathData({ ...editPathData, color: c.hex })}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          backgroundColor: c.hex,
                          border: editPathData.color === c.hex ? '2px solid #0f172a' : '2px solid #ffffff',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label style={styles.fieldLabel}>Notas:</label>
                  <input
                    type="text"
                    value={editPathData.notes}
                    onChange={(e) => setEditPathData({ ...editPathData, notes: e.target.value })}
                    style={styles.inputField}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => setIsEditingPath(false)} style={styles.cancelSmallBtn}>
                    Cancelar
                  </button>
                  <button onClick={handleUpdatePath} style={styles.saveSmallBtn}>
                    Guardar Cambios
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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

      {/* ── Barra Inferior con Acciones de Descarga ─────────────────────────── */}
      <div style={styles.bottomBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#64748b' }}>
          <span>
            Total: <b>{inventory.length}</b> puntos | <b>{paths.length}</b> caminos trazados
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => exportInventoryToExcel(inventory, paths)}
            disabled={inventory.length === 0 && paths.length === 0}
            style={styles.exportBtn}
            title="Descargar archivo Excel con coordenadas y enlaces a Google Maps"
          >
            <FileSpreadsheet size={12} color="#059669" />
            <span>Excel</span>
          </button>

          <button
            onClick={() => exportInventoryToPDF(inventory, paths)}
            disabled={inventory.length === 0 && paths.length === 0}
            style={styles.exportBtn}
            title="Descargar Catastro oficial en PDF"
          >
            <FileText size={12} color="#dc2626" />
            <span>PDF</span>
          </button>

          <button
            onClick={() => exportInventoryToKML(inventory, paths)}
            disabled={inventory.length === 0 && paths.length === 0}
            style={styles.exportBtn}
            title="Descargar capa KML para Google My Maps y Google Earth"
          >
            <Download size={12} color="#00979d" />
            <span>KML (My Maps)</span>
          </button>

          <button
            onClick={() => exportInventoryToGeoJSON(inventory, paths)}
            disabled={inventory.length === 0 && paths.length === 0}
            style={styles.exportBtn}
            title="Descargar GeoJSON estándar para SIG / GIS"
          >
            <Layers size={12} color="#475569" />
            <span>GeoJSON</span>
          </button>
        </div>
      </div>
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
};
