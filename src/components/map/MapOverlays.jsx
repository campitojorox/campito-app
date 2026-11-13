// src/components/map/MapOverlays.jsx
import { Undo2, Check, X, Trash2, ZoomIn, ZoomOut, Crosshair, Compass } from 'lucide-react';
import {
  getCategoryColor,
  getSubcategoryColor,
  getSubcategoriesForParent,
  PATH_TYPE_COLORS,
  getItemCategory,
} from '../../services/farmInventoryStorage';
import catastroJorox from '../../data/catastroJorox.json';
import joroxElevationContours from '../../data/joroxElevationContours.json';
import { PATH_TYPE_LABELS } from './mapUtils';
import { styles } from './mapStyles';

export default function MapOverlays({
  isDrawing,
  drawPoints,
  setDrawPoints,
  liveDrawDistance,
  newPathData,
  setNewPathData,
  setIsDrawing,
  setShowSaveModal,
  onSaveDrawnPath,
  showLegend,
  selectedTarget,
  allCategories,
  localInventory,
  localPaths = [],
  showPaths = true,
  showCatastro = true,
  showElevationContours = true,
  showNavControls,
  mapInstanceRef,
  handleCenterOnUserLocation,
  isLocatingUser,
  gpsStatus,
  liveUserGps,
  fitAllElements,
}) {
  const activePointCategories = (allCategories || []).filter((cat) =>
    (localInventory || []).some((i) => getItemCategory(i) === cat)
  );

  const activeDrawCategory = newPathData?.category || 'Caminos y Trazados';
  const drawSubcategories = getSubcategoriesForParent(localInventory, activeDrawCategory);
  const hasAlertStatus = (localInventory || []).some((i) =>
    ['enfermo', 'seco', 'muerto', 'poda_requerida', 'poda', 'plaga'].includes(
      (i.status || i.estado || '').toLowerCase()
    )
  );
  const hasClorosisStatus = (localInventory || []).some(
    (i) => (i.status || i.estado || '').toLowerCase() === 'clorosis'
  );
  const activePathTypes = showPaths
    ? Array.from(
        new Set(
          (localPaths || [])
            .map((p) => p.path_type || 'otro')
            .filter((pt) => pt !== 'linde')
        )
      )
    : [];
  const hasCatastroTracks = showPaths && (catastroJorox?.tracks?.length || 0) > 0;
  const hasLindes =
    showCatastro &&
    ((catastroJorox?.parcels?.length || 0) > 0 ||
      (localPaths || []).some((p) => (p.path_type || 'otro') === 'linde'));
  const hasElevation = showElevationContours && (joroxElevationContours?.contours?.length || 0) > 0;
  const hasAnyLegendItems =
    activePointCategories.length > 0 ||
    hasAlertStatus ||
    hasClorosisStatus ||
    activePathTypes.length > 0 ||
    hasCatastroTracks ||
    hasLindes ||
    hasElevation;
  return (
    <>
      {isDrawing && (
        <div style={{ ...styles.drawingBanner, flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '8px 10px' }}>
          {/* ──────────────────────────────────────────────────────────────────────────
              LÍNEA 1: CATEGORÍA (Izq) | SUBCATEGORÍA (Der) | [X]
              ────────────────────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            {/* Categoría a la izquierda (con círculo de color) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                flex: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: getCategoryColor(newPathData.category || 'Caminos y Trazados'),
                  flexShrink: 0,
                }}
              />
              <select
                value={activeDrawCategory}
                onChange={(e) => {
                  const cat = e.target.value;
                  const validSubs = getSubcategoriesForParent(localInventory, cat);
                  const stillValid = validSubs.some(
                    (s) => s.toLowerCase() === (newPathData.path_type || '').trim().toLowerCase()
                  );
                  const nextSub = stillValid ? newPathData.path_type : '';
                  setNewPathData((prev) => ({
                    ...prev,
                    category: cat,
                    path_type: nextSub,
                    color: nextSub ? getSubcategoryColor(cat, nextSub) : getCategoryColor(cat),
                  }));
                }}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.80rem',
                  fontWeight: 600,
                  width: '100%',
                  minWidth: 0,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="Caminos y Trazados">Caminos y Trazados</option>
                <option value="Líneas de Riego">Líneas de Riego</option>
                <option value="Lindes y Límites">Lindes y Límites</option>
                {(allCategories || [])
                  .filter((c) => !['Caminos y Trazados', 'Líneas de Riego', 'Lindes y Límites'].includes(c))
                  .map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
              </select>
            </div>

            {/* Sub-categoría (con círculo de color en tono más claro dentro de la gama de la raíz) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                flex: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: getSubcategoryColor(
                    activeDrawCategory,
                    newPathData.path_type || ''
                  ),
                  flexShrink: 0,
                  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
                }}
              />
              <select
                value={newPathData.path_type || ''}
                onChange={(e) => {
                  const pt = e.target.value;
                  const subColor = pt ? getSubcategoryColor(activeDrawCategory, pt) : getCategoryColor(activeDrawCategory);
                  setNewPathData((prev) => ({
                    ...prev,
                    path_type: pt,
                    color: subColor,
                  }));
                }}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.80rem',
                  fontWeight: 600,
                  width: '100%',
                  minWidth: 0,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="">(Sin subcategoría)</option>
                {drawSubcategories.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            {/* Grupo de Acciones: Descartar (a la izquierda de cerrar) + Espacio + Cerrar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 2 }}>
              <button
                type="button"
                onClick={() => {
                  if (drawPoints.length > 0) {
                    if (window.confirm('¿Deseas descartar los nodos dibujados y cancelar el trazado?')) {
                      setIsDrawing(false);
                      setDrawPoints([]);
                    }
                  } else {
                    setIsDrawing(false);
                    setDrawPoints([]);
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '3px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                title="Descartar trazado en curso"
              >
                <Trash2 size={16} />
              </button>

              {/* Botón cerrar arriba a la derecha */}
              <button
                type="button"
                onClick={() => {
                  setIsDrawing(false);
                  setDrawPoints([]);
                }}
                style={{
                  ...styles.cardCloseBtn,
                  padding: '3px 4px',
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#1e293b')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                title="Cerrar trazado"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────────────────
              LÍNEA 2: TÍTULO EDITABLE DENTRO DE INPUT IGUAL QUE EN NODOS | LONGITUD DE LÍNEA
              ────────────────────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <input
              type="text"
              value={newPathData.name || ''}
              onChange={(e) => setNewPathData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Título del trazado..."
              style={{
                ...styles.cardTitleInput,
                flex: 1,
                minWidth: 100,
              }}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 8,
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#475569',
                fontSize: '0.74rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              📏 {liveDrawDistance.toFixed(1)} m · {drawPoints.length} nodos
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────────────────
              LÍNEA 3: DESCRIPCIÓN | DESHACER | GUARDAR
              ────────────────────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <input
              type="text"
              value={newPathData.notes || ''}
              onChange={(e) => setNewPathData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Descripción o notas del trazado..."
              style={{
                flex: 1,
                minWidth: 80,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                fontSize: '0.78rem',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <button
              type="button"
              onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
              disabled={drawPoints.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: drawPoints.length === 0 ? '#94a3b8' : '#334155',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: drawPoints.length === 0 ? 'not-allowed' : 'pointer',
                opacity: drawPoints.length === 0 ? 0.6 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title="Deshacer último nodo"
            >
              <Undo2 size={13} />
              <span>Deshacer</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onSaveDrawnPath) {
                  onSaveDrawnPath();
                } else {
                  setShowSaveModal(true);
                }
              }}
              disabled={drawPoints.length < 2}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: drawPoints.length < 2 ? '#94a3b8' : '#059669',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: drawPoints.length < 2 ? 'not-allowed' : 'pointer',
                opacity: drawPoints.length < 2 ? 0.6 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: drawPoints.length >= 2 ? '0 2px 6px rgba(5, 150, 105, 0.3)' : 'none',
              }}
              title="Guardar recorrido trazado"
            >
              <Check size={14} />
              <span>Guardar</span>
            </button>
          </div>
        </div>
      )}

      {showLegend && hasAnyLegendItems && (
        <div style={{ ...styles.legendBox, bottom: selectedTarget ? 270 : 75 }}>
          <span style={styles.legendTitle}>REFERENCIAS</span>
          <div style={styles.legendGrid}>
            {activePointCategories.map((cat) => (
              <div key={cat} style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: getCategoryColor(cat) }} />
                <span>{cat}</span>
              </div>
            ))}
            {hasAlertStatus && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#ef4444' }} />
                <span>Poda/Seco</span>
              </div>
            )}
            {hasClorosisStatus && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorCircle, backgroundColor: '#f59e0b' }} />
                <span>Clorosis</span>
              </div>
            )}
            {activePathTypes.map((pt) => {
              const color = PATH_TYPE_COLORS[pt] || '#64748b';
              const isDashed = pt === 'linea_riego' || pt === 'acequia';
              return (
                <div key={pt} style={styles.legendItem}>
                  <span
                    style={
                      isDashed
                        ? { ...styles.colorLine, borderTop: `2px dashed ${color}`, height: 0, backgroundColor: 'transparent' }
                        : { ...styles.colorLine, backgroundColor: color }
                    }
                  />
                  <span>{PATH_TYPE_LABELS[pt] || pt}</span>
                </div>
              );
            })}
            {hasCatastroTracks && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, borderTop: '2px dashed #94a3b8', height: 0, backgroundColor: 'transparent' }} />
                <span>Pistas</span>
              </div>
            )}
            {hasLindes && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, borderTop: '1.5px solid #00d1da', height: 0, backgroundColor: 'transparent' }} />
                <span>Lindes Campito</span>
              </div>
            )}
            {hasElevation && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.colorLine, backgroundColor: '#fbbf24' }} />
                <span>Cotas altura (20m)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {showNavControls && (
        <div style={{ ...styles.navWidget, bottom: selectedTarget ? 270 : 75 }}>
          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            style={styles.navWidgetBtn}
            title="Acercar mapa (+)"
          >
            <ZoomIn size={16} />
          </button>

          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            style={styles.navWidgetBtn}
            title="Alejar mapa (-)"
          >
            <ZoomOut size={16} />
          </button>

          <div style={styles.navWidgetDivider} />

          <button
            onClick={handleCenterOnUserLocation}
            disabled={isLocatingUser}
            style={{
              ...styles.navWidgetBtn,
              color: isLocatingUser
                ? '#f59e0b'
                : gpsStatus === 'active'
                  ? '#10b981'
                  : gpsStatus === 'denied' || gpsStatus === 'insecure'
                    ? '#ef4444'
                    : '#0284c7',
              backgroundColor: isLocatingUser ? '#f0f9ff' : '#ffffff',
              position: 'relative',
            }}
            title={
              gpsStatus === 'active'
                ? `📍 GPS en vivo (±${liveUserGps?.accuracy?.toFixed(1) || '4'}m) - Centrar en mí`
                : gpsStatus === 'insecure'
                  ? '🔴 GPS bloqueado: se requiere HTTPS en el móvil'
                  : gpsStatus === 'denied'
                    ? '🔴 GPS sin permiso en el móvil (pulsa para ver ayuda)'
                    : 'Centrar en mi ubicación actual GPS'
            }
          >
            <Crosshair size={16} />
            {gpsStatus === 'active' && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                }}
              />
            )}
          </button>

          <button
            onClick={fitAllElements}
            style={{ ...styles.navWidgetBtn, color: '#00979d' }}
            title="Centrar toda la finca (Parcelas 195 y 196)"
          >
            <Compass size={16} />
          </button>
        </div>
      )}
    </>
  );
}

