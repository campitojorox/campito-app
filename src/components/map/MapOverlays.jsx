// src/components/map/MapOverlays.jsx
import { Undo2, Check, ZoomIn, ZoomOut, Crosshair, Compass } from 'lucide-react';
import { getCategoryColor, PATH_TYPE_COLORS, getItemCategory } from '../../services/farmInventoryStorage';
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
  showLegend,
  selectedTarget,
  allCategories,
  localInventory,
  showNavControls,
  mapInstanceRef,
  handleCenterOnUserLocation,
  isLocatingUser,
  gpsStatus,
  liveUserGps,
  fitAllElements,
}) {
  return (
    <>
      {isDrawing && (
        <div style={styles.drawingBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={styles.pulseDot} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                Modo Trazado Activo: Haz clic en el satélite para colocar nodos
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                Nodos: <b>{drawPoints.length}</b> | Longitud: <b>{liveDrawDistance.toFixed(1)} m</b>
              </span>
            </div>

            <select
              value={newPathData.path_type}
              onChange={(e) => {
                const pt = e.target.value;
                setNewPathData((prev) => ({
                  ...prev,
                  path_type: pt,
                  color: PATH_TYPE_COLORS[pt] || '#f97316',
                }));
              }}
              style={styles.drawTypeSelect}
            >
              <option value="sendero">Sendero</option>
              <option value="carril">Carril</option>
              <option value="camino">Camino</option>
              <option value="vereda">Vereda</option>
              <option value="acequia">Acequia</option>
              <option value="linea_riego">Línea de Riego</option>
              <option value="linde">Linde</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
              disabled={drawPoints.length === 0}
              style={{
                ...styles.drawActionBtn,
                opacity: drawPoints.length === 0 ? 0.5 : 1,
                backgroundColor: '#ffffff',
                color: '#475569',
              }}
              title="Deshacer último nodo"
            >
              <Undo2 size={13} />
              Deshacer nodo
            </button>

            <button
              type="button"
              onClick={() => {
                setIsDrawing(false);
                setDrawPoints([]);
              }}
              style={{
                ...styles.drawActionBtn,
                backgroundColor: '#f1f5f9',
                color: '#64748b',
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
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
              Guardar Recorrido
            </button>
          </div>
        </div>
      )}

      {showLegend && (
        <div style={{ ...styles.legendBox, bottom: selectedTarget ? 270 : 75 }}>
          <span style={styles.legendTitle}>Referencias (Puntos y Líneas)</span>
          <div style={styles.legendGrid}>
            {allCategories
              .filter((cat) => cat !== 'Otros' || localInventory.some((i) => getItemCategory(i) === 'Otros'))
              .map((cat) => (
                <div key={cat} style={styles.legendItem}>
                  <span style={{ ...styles.colorCircle, backgroundColor: getCategoryColor(cat) }} />
                  <span>{cat}</span>
                </div>
              ))}
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorCircle, backgroundColor: '#ef4444' }} />
              <span>Poda/Seco</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#92400e' }} />
              <span>Camino</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#a16207' }} />
              <span>Carril</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#b45309' }} />
              <span>Sendero</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#1d4ed8' }} />
              <span>Acequia</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#38bdf8', borderTop: '2px dashed #38bdf8', height: 0 }} />
              <span>Riego</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, borderTop: '2px dashed #00d1da', height: 0 }} />
              <span>Parcela 195/196</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.colorLine, backgroundColor: '#fbbf24' }} />
              <span>Cotas altura (20m)</span>
            </div>
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

