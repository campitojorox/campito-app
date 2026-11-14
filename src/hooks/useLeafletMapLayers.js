// src/hooks/useLeafletMapLayers.js
// Hook que encapsula la inicialización de Leaflet y todas las capas vectoriales del mapa.

import { useEffect, useCallback } from 'react';
import L from 'leaflet';
import {
  PATH_TYPE_COLORS,
  getItemCategory,
  getPathCategory,
  getPathSubcategory,
  getCategoryColor,
  updateFarmPath,
} from '../services/farmInventoryStorage';
import catastroJorox from '../data/catastroJorox.json';
import joroxElevationContours from '../data/joroxElevationContours.json';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  calculatePathMeters,
  createFamilyPinIcon,
  createCotaPinIcon,
  normalizeLatLng,
  normalizeLatLngObj,
  normalizeCoordinatesArray,
} from '../components/map/mapUtils';

export function useLeafletMapLayers({
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
  showElevationContours = true,
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

    if (!map.getPane('elevationPane')) {
      const elevPane = map.createPane('elevationPane');
      elevPane.style.zIndex = '410';
      elevPane.style.pointerEvents = 'none';
    }
    if (!map.getPane('highlightPane')) {
      const hlPane = map.createPane('highlightPane');
      hlPane.style.zIndex = '610';
      hlPane.style.pointerEvents = 'none';
    }
    if (!map.getPane('inventoryMarkersPane')) {
      const markersPane = map.createPane('inventoryMarkersPane');
      markersPane.style.zIndex = '620';
    }

    elevationLayerRef.current = L.featureGroup().addTo(map);
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
        type: 'point',
        isNew: true,
        id: `new-${Date.now()}`,
        name: '',
        title: '',
        category: '',
        variety_type: '',
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        notes: '',
        status: 'saludable',
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
    elevationLayerRef,
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

  // 1b. Anillo pulsante de realce sobre el elemento seleccionado o pin en creación
  useEffect(() => {
    const layer = highlightLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedTarget) return;

    const isNewPoint = Boolean(
      selectedTarget.isNew ||
      selectedTarget.type === 'coord' ||
      (selectedTarget.type === 'point' && (selectedTarget.isNew || String(selectedTarget.id).startsWith('new-')))
    );

    if (isNewPoint && selectedTarget.lat && selectedTarget.lng) {
      const pinColor = selectedTarget.category ? getCategoryColor(selectedTarget.category) : '#00979d';
      const marker = L.marker([selectedTarget.lat, selectedTarget.lng], {
        icon: L.divIcon({
          className: 'farm-pin-div-wrapper',
          html: `
            <div class="farm-pin-container is-selected">
              <div class="farm-pin">
                <div class="farm-pin__halo" style="background-color: ${pinColor};"></div>
                <div class="farm-pin__body" style="background-color: ${pinColor};"></div>
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        pane: 'inventoryMarkersPane',
        zIndexOffset: 3000,
        draggable: true,
      });

      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        const lat = Number(newPos.lat.toFixed(6));
        const lng = Number(newPos.lng.toFixed(6));
        setSelectedTarget((prev) => (prev ? {
          ...prev,
          lat,
          lng,
          latitude: lat,
          longitude: lng,
        } : prev));
      });

      marker.addTo(layer);
    } else if (selectedTarget.type === 'node' && selectedTarget.lat && selectedTarget.lng) {
      L.circleMarker([selectedTarget.lat, selectedTarget.lng], {
        radius: 12,
        color: '#00d1da',
        weight: 3,
        opacity: 0.85,
        fillColor: '#00d1da',
        fillOpacity: 0.25,
        pane: 'highlightPane',
        interactive: false,
      }).addTo(layer);
    } else if (selectedTarget.type === 'path' && (selectedTarget.coordinates || selectedTarget.raw?.coordinates)) {
      const rawCoords = selectedTarget.coordinates || selectedTarget.raw?.coordinates;
      const coords = normalizeCoordinatesArray(rawCoords);
      if (coords.length >= 2) {
        L.polyline(coords, {
          color: '#00d1da',
          weight: (Number(selectedTarget.raw?.stroke_width) || 4) + 6,
          opacity: 0.45,
          dashArray: '5, 5',
        }).addTo(layer);
      }
    }
  }, [selectedTarget, highlightLayerRef, setSelectedTarget]);

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

    const validDrawPoints = (drawPoints || []).map(normalizeLatLngObj).filter(Boolean);
    if (validDrawPoints.length === 0) return;

    validDrawPoints.forEach((pt, idx) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: idx === validDrawPoints.length - 1 ? 5 : 4,
        fillColor: idx === 0 ? '#10b981' : idx === validDrawPoints.length - 1 ? '#ef4444' : '#f97316',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 1.5,
      }).addTo(layer);
    });

    if (validDrawPoints.length >= 2) {
      const latlngs = validDrawPoints.map((p) => [p.lat, p.lng]);
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

    (filteredPaths || []).forEach((path) => {
      const latlngs = normalizeCoordinatesArray(path?.coordinates);
      if (latlngs.length < 2) return;

      const isLinde = path.path_type === 'linde';
      const resolvedPathCat = path.category || getPathCategory(path);
      const isUnclassifiedPath = resolvedPathCat === 'Sin clasificar' || resolvedPathCat === 'Sin categoría';
      const lineColor = isUnclassifiedPath
        ? '#00979d'
        : (path.color || (path.category ? getCategoryColor(path.category) : PATH_TYPE_COLORS[path.path_type]) || '#f97316');
      const poly = L.polyline(latlngs, {
        color: lineColor,
        weight: isLinde ? 1.5 : Number(path.stroke_width) || 4,
        opacity: isUnclassifiedPath ? 0.8 : 0.9,
        dashArray:
          isUnclassifiedPath
            ? '6, 6'
            : path.path_type === 'linea_riego'
              ? '8, 6'
              : path.path_type === 'acequia'
                ? '4, 4'
                : null,
      });

      poly.on('click', (e) => {
        if (interceptLayerClickForDraw(e)) return;
        if (e) {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) e.originalEvent.stopPropagation();
        }
        lastLayerClickedTimeRef.current = Date.now();

        const pathCat = path.category || getPathCategory(path);
        const pathSub = path.variety_type || path.subcategory || getPathSubcategory(path) || '';

        setSelectedTarget({
          type: 'path',
          id: path.id,
          name: path.name || path.title || 'Camino / Trazado',
          title: path.name || path.title || 'Camino / Trazado',
          category: pathCat,
          variety_type: pathSub,
          subcategory: pathSub,
          path_type: path.path_type || 'sendero',
          color: path.color || PATH_TYPE_COLORS[path.path_type] || '#f97316',
          length_meters: path.length_meters,
          stroke_width: path.stroke_width,
          notes: path.notes || '',
          coordinates: latlngs,
          raw: path,
        });
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
      const resolvedPathId = selectedTarget.pathId ?? (selectedTarget.id ? String(selectedTarget.id).split('-node-')[0] : null);
      activePath = localPaths.find((p) => String(p.id) === String(resolvedPathId)) || selectedTarget.raw;
      selectedNodeIdx = selectedTarget.nodeIndex;
    }

    if (!activePath || !activePath.coordinates) {
      return;
    }

    const coords = (Array.isArray(activePath.coordinates) ? activePath.coordinates : [])
      .map(normalizeLatLngObj)
      .filter(Boolean);
    if (coords.length < 2) return;

    const resolvedActiveCat = activePath.category || getPathCategory(activePath);
    const isUnclassifiedPath = resolvedActiveCat === 'Sin clasificar' || resolvedActiveCat === 'Sin categoría';
    const pathColor = isUnclassifiedPath
      ? '#00979d'
      : (activePath.color || (activePath.category ? getCategoryColor(activePath.category) : PATH_TYPE_COLORS[activePath.path_type]) || '#f97316');

    coords.forEach((coord, idx) => {
      const isLindePath = activePath.path_type === 'linde';
      const isSelected = selectedNodeIdx === idx;
      const nodeSize = isLindePath ? (isSelected ? 8 : 6) : (isSelected ? 20 : 14);
      const unclassifiedNodeClass = isUnclassifiedPath ? 'is-unclassified-node' : '';
      const nodeIcon = L.divIcon({
        className: `farm-path-node-marker farm-pin-div-wrapper ${unclassifiedNodeClass}`,
        html: `
          <div class="farm-pin-container ${isSelected ? 'is-selected' : ''}" style="width: ${nodeSize}px; height: ${nodeSize}px;">
            ${isSelected ? `<div class="farm-pin__halo" style="background-color: ${pathColor}; top: ${isLindePath ? -10 : -4}px; left: ${isLindePath ? -10 : -4}px; width: 28px; height: 28px;"></div>` : ''}
            <div style="
              position: relative;
              width: ${nodeSize}px;
              height: ${nodeSize}px;
              border-radius: 50%;
              background-color: ${isLindePath ? pathColor : isSelected ? '#00979d' : isUnclassifiedPath ? '#00979d' : '#ffffff'};
              border: ${isLindePath ? 'none' : `2.5px solid ${pathColor}`};
              box-shadow: ${isLindePath ? 'none' : '0 1px 6px rgba(0,0,0,0.4)'};
              cursor: grab;
              display: flex;
              align-items: center;
              justify-content: center;
              color: ${isSelected || isUnclassifiedPath ? '#ffffff' : '#475569'};
              font-size: 8px;
              font-weight: 700;
              user-select: none;
            ">${isLindePath ? '' : idx + 1}</div>
          </div>
        `,
        iconSize: [nodeSize, nodeSize],
        iconAnchor: [nodeSize / 2, nodeSize / 2],
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
        const nodeCat = activePath.category || getPathCategory(activePath);
        const nodeSub = activePath.variety_type || activePath.subcategory || getPathSubcategory(activePath) || '';

        setSelectedTarget({
          type: 'node',
          id: `${activePath.id}-node-${idx}`,
          pathId: activePath.id,
          name: activePath.name || 'Recorrido',
          pathName: activePath.name || 'Recorrido',
          title: activePath.name || 'Recorrido',
          category: nodeCat,
          variety_type: nodeSub,
          subcategory: nodeSub,
          pathType: activePath.path_type || 'sendero',
          path_type: activePath.path_type || 'sendero',
          nodeIndex: idx,
          totalNodes: coords.length,
          lat: coord.lat,
          lng: coord.lng,
          color: pathColor,
          notes: activePath.notes || '',
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
          const validUpdated = updated.map((c) => [c.lat, c.lng]);
          L.polyline(
            validUpdated,
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

  // 5b. Capa Lindes del Campito (Parcelas 195 y 196 + nodos de linde) y Pistas catastrales
  useEffect(() => {
    const layer = catastroLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!catastroJorox) return;

    const parcel196Set = new Set(
      (catastroJorox.parcels?.find((p) => p.number === '196')?.polygon || []).map(
        (c) => `${Number(c.lat).toFixed(4)},${Number(c.lng).toFixed(4)}`
      )
    );
    const parcel195Set = new Set(
      (catastroJorox.parcels?.find((p) => p.number === '195')?.polygon || []).map(
        (c) => `${Number(c.lat).toFixed(4)},${Number(c.lng).toFixed(4)}`
      )
    );

    if (showCatastro) {
      (catastroJorox.parcels || []).forEach((parcel) => {
        const latlngs = normalizeCoordinatesArray(parcel.polygon);
        if (latlngs.length < 3) return;
        const is195 = parcel.number === '195';

        const poly = L.polygon(latlngs, {
          color: is195 ? '#00d1da' : '#38bdf8',
          weight: 1.5,
          fillColor: '#00979d',
          fillOpacity: 0.08,
          interactive: false,
        });

        poly.addTo(layer);
      });

      (catastroJorox.cotas || []).forEach((cota) => {
        const isSelected = selectedTarget && String(selectedTarget.id) === `cota-${cota.name}`;
        const key = `${Number(cota.lat).toFixed(4)},${Number(cota.lng).toFixed(4)}`;
        const cotaColor = parcel195Set.has(key) ? '#00d1da' : parcel196Set.has(key) ? '#38bdf8' : '#00d1da';

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

        const cotaIcon = createCotaPinIcon({ isSelected, color: cotaColor });
        const marker = L.marker([cota.lat, cota.lng], {
          icon: cotaIcon,
          pane: 'inventoryMarkersPane',
          interactive: true,
          zIndexOffset: isSelected ? 1000 : 80,
        });

        marker.on('click', onSelectCota);
        marker.addTo(layer);
      });
    }

    if (showPaths) {
      (catastroJorox.tracks || []).forEach((track) => {
        const latlngs = normalizeCoordinatesArray(track?.coordinates);
        if (latlngs.length < 2) return;

        const poly = L.polyline(latlngs, {
          color: '#94a3b8',
          weight: 3,
          opacity: 0.8,
          dashArray: '5, 5',
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
    }
  }, [
    showCatastro,
    showPaths,
    selectedTarget,
    interceptLayerClickForDraw,
    catastroLayerRef,
    lastLayerClickedTimeRef,
    setSelectedTarget,
  ]);

  // 5c. Cotas de altura y curvas de nivel (IGN 5m) sobre la vista satelital
  useEffect(() => {
    const layer = elevationLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!showElevationContours || !joroxElevationContours?.contours) return;

    const placedLabels = [];
    const minLabelDistSq = 0.00038 * 0.00038;

    const tryPlaceLabel = (pt, elevation, major) => {
      if (!pt || !Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') return;
      const tooClose = placedLabels.some((existing) => {
        if (!existing || !Array.isArray(existing) || existing.length < 2) return false;
        const dLat = existing[0] - pt[0];
        const dLng = existing[1] - pt[1];
        return dLat * dLat + dLng * dLng < minLabelDistSq;
      });
      if (tooClose) return;
      placedLabels.push(pt);
      const cls = major ? 'campito-elevation-label campito-elevation-label--major' : 'campito-elevation-label';
      L.marker(pt, {
        icon: L.divIcon({
          className: 'campito-elevation-label-wrapper',
          html: `<span class="${cls}">${elevation} m</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        pane: 'elevationPane',
        interactive: false,
      }).addTo(layer);
    };

    const sortedContours = [...joroxElevationContours.contours].sort((a, b) => Number(b.major) - Number(a.major));

    sortedContours.forEach(({ elevation, major, lines }) => {
      (lines || []).forEach((line) => {
        if (!Array.isArray(line) || line.length < 2) return;
        L.polyline(line, {
          color: major ? '#fbbf24' : '#fcd34d',
          weight: major ? 2 : 1.15,
          opacity: major ? 0.78 : 0.48,
          dashArray: major ? undefined : '4, 4',
          pane: 'elevationPane',
          interactive: false,
        }).addTo(layer);

        if (line.length >= 3) {
          const step = Math.max(10, Math.floor(line.length / 4));
          for (let idx = Math.floor(step / 2); idx < line.length; idx += step) {
            tryPlaceLabel(line[idx], elevation, major);
          }
        }
      });
    });
  }, [showElevationContours, elevationLayerRef]);

  // 6. Auto-ajuste de vista a todos los elementos
  const fitAllElements = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = L.latLngBounds([]);
    let count = 0;

    if (catastroJorox && catastroJorox.parcels) {
      catastroJorox.parcels.forEach((p) => {
        normalizeCoordinatesArray(p?.polygon).forEach(([lat, lng]) => {
          bounds.extend([lat, lng]);
          count++;
        });
      });
    }

    (inventory || []).forEach((i) => {
      const pt = normalizeLatLng(i.latitude ? [i.latitude, i.longitude] : (i.coordenadas ? [i.coordenadas.lat, i.coordenadas.lng] : null));
      if (pt) {
        bounds.extend(pt);
        count++;
      }
    });

    (paths || []).forEach((p) => {
      normalizeCoordinatesArray(p?.coordinates).forEach((pt) => {
        bounds.extend(pt);
        count++;
      });
    });

    if (count > 0 && bounds.isValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [inventory, paths, mapInstanceRef]);

  return { fitAllElements };
}

