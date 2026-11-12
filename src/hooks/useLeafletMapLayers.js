// src/hooks/useLeafletMapLayers.js
// Hook que encapsula la inicialización de Leaflet y todas las capas vectoriales del mapa.

import { useEffect, useCallback } from 'react';
import L from 'leaflet';
import {
  getCategoryColor,
  PATH_TYPE_COLORS,
  getItemCategory,
  updateFarmPath,
} from '../services/farmInventoryStorage';
import catastroJorox from '../data/catastroJorox.json';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  calculatePathMeters,
  getPinFamilySlug,
  getPinStatusSlug,
  createFamilyPinIcon,
  createCotaPinIcon,
} from '../components/map/mapUtils';

export function useLeafletMapLayers({
  mapContainerRef,
  mapInstanceRef,
  markersLayerRef,
  pathsLayerRef,
  pathNodesLayerRef,
  drawingLayerRef,
  catastroLayerRef,
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
  inventory,
  paths,
}) {
  // 1. Inicialización de Leaflet y capas base
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    const esriLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        subdomains: ['server', 'services'],
      }
    );

    esriLayer.addTo(map);
    map._esriLayer = esriLayer;

    if (!map.getPane('highlightPane')) {
      const hlPane = map.createPane('highlightPane');
      hlPane.style.zIndex = '610';
      hlPane.style.pointerEvents = 'none';
    }
    if (!map.getPane('inventoryMarkersPane')) {
      const markersPane = map.createPane('inventoryMarkersPane');
      markersPane.style.zIndex = '620';
    }

    catastroLayerRef.current = L.featureGroup().addTo(map);
    pathsLayerRef.current = L.featureGroup().addTo(map);
    pathNodesLayerRef.current = L.featureGroup().addTo(map);
    markersLayerRef.current = L.featureGroup().addTo(map);
    drawingLayerRef.current = L.featureGroup().addTo(map);
    userLocationLayerRef.current = L.featureGroup().addTo(map);
    highlightLayerRef.current = L.featureGroup().addTo(map);

    map.on('click', (e) => {
      setIsLayersMenuOpen(false);
      setIsFilterOpen(false);

      if (isDrawingRef.current) {
        if (Date.now() - lastLayerClickedTimeRef.current >= 50) {
          appendDrawPoint(e.latlng);
        }
        return;
      }

      if (Date.now() - lastLayerClickedTimeRef.current < 350) {
        return;
      }

      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      setSelectedTarget({
        type: 'coord',
        id: `coord-${lat}-${lng}`,
        title: 'Coordenada satelital / linde',
        subtitle: `Punto satelital en (${lat}, ${lng})`,
        lat,
        lng,
        notes: '',
      });
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [
    appendDrawPoint,
    catastroLayerRef,
    drawingLayerRef,
    highlightLayerRef,
    isDrawingRef,
    lastLayerClickedTimeRef,
    mapContainerRef,
    mapInstanceRef,
    markersLayerRef,
    pathNodesLayerRef,
    pathsLayerRef,
    setIsFilterOpen,
    setIsLayersMenuOpen,
    setSelectedTarget,
    userLocationLayerRef,
  ]);

  // Cambio de tamaño fullscreen
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 150);
    }
  }, [isFullScreen, mapInstanceRef]);

  // 1b. Anillo pulsante de realce sobre el elemento seleccionado
  useEffect(() => {
    const layer = highlightLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedTarget) return;

    if (selectedTarget.lat && selectedTarget.lng) {
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
  }, [selectedTarget, highlightLayerRef]);

  // 2. Cursor en modo dibujo
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.getContainer().style.cursor = isDrawing ? 'crosshair' : '';
    return () => {
      if (map.getContainer()) {
        map.getContainer().style.cursor = '';
      }
    };
  }, [isDrawing, mapInstanceRef]);

  // 3. Polilínea provisional en modo dibujo
  useEffect(() => {
    const layer = drawingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (drawPoints.length === 0) return;

    drawPoints.forEach((pt, idx) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: idx === drawPoints.length - 1 ? 5 : 4,
        fillColor: idx === 0 ? '#10b981' : idx === drawPoints.length - 1 ? '#ef4444' : '#f97316',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 1.5,
      }).addTo(layer);
    });

    if (drawPoints.length >= 2) {
      const latlngs = drawPoints.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, {
        color: '#f97316',
        weight: 4,
        dashArray: '6, 6',
        opacity: 0.9,
      }).addTo(layer);
    }
  }, [drawPoints, drawingLayerRef]);

  // 4. Marcadores de puntos de inventario
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
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();

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

      const pinIcon = createFamilyPinIcon({ item, isSelected, hasWarning });
      const marker = L.marker([lat, lng], {
        icon: pinIcon,
        pane: 'inventoryMarkersPane',
        interactive: true,
        zIndexOffset: isSelected ? 1000 : 100,
      });

      marker.on('click', onSelect);

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
        offset: [0, -10],
        className: 'campito-map-tooltip',
      });

      marker.addTo(layer);
    });
  }, [
    filteredInventory,
    showPoints,
    selectedTarget,
    interceptLayerClickForDraw,
    lastLayerClickedTimeRef,
    markersLayerRef,
    setSelectedTarget,
  ]);

  // 5. Renderizado de caminos y senderos
  useEffect(() => {
    const layer = pathsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showPaths) return;

    filteredPaths.forEach((path) => {
      const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
      if (coords.length < 2) return;

      const latlngs = coords.map((c) => [c.lat, c.lng]);
      const lineColor = path.color || PATH_TYPE_COLORS[path.path_type] || '#f97316';
      const poly = L.polyline(latlngs, {
        color: lineColor,
        weight: Number(path.stroke_width) || 4,
        opacity: 0.85,
        dashArray:
          path.path_type === 'linea_riego'
            ? '8, 6'
            : path.path_type === 'acequia'
              ? '4, 4'
              : path.path_type === 'linde'
                ? '10, 5'
                : null,
      });

      poly.on('click', (e) => {
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();

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

      const lengthText = path.length_meters ? ` (${Number(path.length_meters).toFixed(0)}m)` : '';
      poly.bindTooltip(`<b>${path.name}</b>${lengthText}`, {
        sticky: true,
        className: 'campito-map-tooltip',
      });

      poly.addTo(layer);
    });
  }, [
    filteredPaths,
    showPaths,
    interceptLayerClickForDraw,
    lastLayerClickedTimeRef,
    pathsLayerRef,
    setSelectedTarget,
  ]);

  // 5a. Nodos interactivos del recorrido seleccionado
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
        if (interceptLayerClickForDraw(e)) return;
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
          L.polyline(
            updated.map((c) => [c.lat, c.lng]),
            {
              color: pathColor,
              weight: 5,
              opacity: 0.9,
              dashArray: '4, 4',
            }
          ).addTo(highlightLayerRef.current);
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
  }, [
    selectedTarget,
    localPaths,
    onReloadPaths,
    interceptLayerClickForDraw,
    highlightLayerRef,
    lastLayerClickedTimeRef,
    pathNodesLayerRef,
    setLocalPaths,
    setSelectedTarget,
  ]);

  // 5b. Catastro Oficial Registrado (Parcelas 195 y 196)
  useEffect(() => {
    const layer = catastroLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showCatastro || !catastroJorox) return;

    (catastroJorox.parcels || []).forEach((parcel) => {
      const latlngs = parcel.polygon.map((c) => [c.lat, c.lng]);
      const is195 = parcel.number === '195';

      const poly = L.polygon(latlngs, {
        color: is195 ? '#00d1da' : '#38bdf8',
        weight: 3,
        dashArray: '6, 6',
        fillColor: '#00979d',
        fillOpacity: 0.12,
      });

      poly.bindTooltip(
        `<b>🏛️ ${parcel.name}</b><br/><span style="font-size: 10px; color: #00979d">Superficie Catastral Oficial (${parcel.polygon.length} vértices)</span>`,
        { sticky: true, className: 'campito-map-tooltip' }
      );

      poly.on('click', (e) => {
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
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
      });

      poly.addTo(layer);
    });

    (catastroJorox.cotas || []).forEach((cota) => {
      const isSelected = selectedTarget && String(selectedTarget.id) === `cota-${cota.name}`;
      const onSelectCota = (e) => {
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
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
          offset: [0, -10],
          className: 'campito-map-tooltip',
        }
      );

      marker.on('click', onSelectCota);
      marker.addTo(layer);
    });

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
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();
        setSelectedTarget({
          type: 'catastro_track',
          id: `catastro-track-${track.name}`,
          title: track.name,
          subtitle: 'Trazado o pista catastral registrada',
          notes: 'Trazado catastral oficial',
          raw: track,
        });
      });

      poly.addTo(layer);
    });
  }, [
    showCatastro,
    selectedTarget,
    interceptLayerClickForDraw,
    catastroLayerRef,
    lastLayerClickedTimeRef,
    setSelectedTarget,
  ]);

  // 6. Auto-ajuste de vista a todos los elementos
  const fitAllElements = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = L.latLngBounds([]);
    let count = 0;

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
  }, [inventory, paths, mapInstanceRef]);

  return { fitAllElements };
}

