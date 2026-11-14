// src/components/map/MapOverlays.jsx
import { useMemo } from 'react';
import { ZoomIn, ZoomOut, Crosshair, Compass } from 'lucide-react';
import {
  getCategoryColor,
  getSubcategoryColor,
  getPathCategory,
  getPathSubcategory,
  getItemCategory,
} from '../../services/farmInventoryStorage';
import catastroJorox from '../../data/catastroJorox.json';
import joroxElevationContours from '../../data/joroxElevationContours.json';
import { styles } from './mapStyles';

export default function MapOverlays({
  isDrawing = false,
  showLegend,
  selectedTarget,
  allCategories = [],
  localInventory = [],
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
  // 1. Grupos de categorías y subcategorías activas para Puntos
  const activePointGroups = useMemo(() => {
    const groups = new Map();
    (localInventory || []).forEach((item) => {
      const cat = getItemCategory(item);
      if (!cat) return;
      if (!groups.has(cat)) {
        groups.set(cat, {
          cat,
          color: getCategoryColor(cat),
          subs: new Map(),
        });
      }
      const g = groups.get(cat);
      const sub = item.variety_type || item.subcategory;
      if (sub && String(sub).trim()) {
        const subName = String(sub).trim();
        g.subs.set(subName, getSubcategoryColor(cat, subName));
      }
    });
    return Array.from(groups.values());
  }, [localInventory]);

  // 2. Grupos de categorías y subcategorías activas para Polilíneas / Trazados (incluye Ríos / Arroyos, etc.)
  const activePathGroups = useMemo(() => {
    if (!showPaths) return [];
    const groups = new Map();
    (localPaths || []).forEach((path) => {
      if ((path.path_type || '') === 'linde') return;
      const cat = getPathCategory(path);
      if (!cat) return;
      if (!groups.has(cat)) {
        groups.set(cat, {
          cat,
          color: path.color || getCategoryColor(cat),
          subs: new Map(),
        });
      }
      const g = groups.get(cat);
      const sub = getPathSubcategory(path);
      if (sub && String(sub).trim()) {
        const subName = String(sub).trim();
        g.subs.set(subName, getSubcategoryColor(cat, subName));
      }
    });
    return Array.from(groups.values());
  }, [localPaths, showPaths]);

  const hasAlertStatus = (localInventory || []).some((i) =>
    ['enfermo', 'seco', 'muerto', 'poda_requerida', 'poda', 'plaga'].includes(
      (i.status || i.estado || '').toLowerCase()
    )
  );
  const hasClorosisStatus = (localInventory || []).some(
    (i) => (i.status || i.estado || '').toLowerCase() === 'clorosis'
  );
  const hasCatastroTracks = showPaths && (catastroJorox?.tracks?.length || 0) > 0;
  const hasLindes =
    showCatastro &&
    ((catastroJorox?.parcels?.length || 0) > 0 ||
      (localPaths || []).some((p) => (p.path_type || 'otro') === 'linde'));
  const hasElevation = showElevationContours && (joroxElevationContours?.contours?.length || 0) > 0;

  const hasAnyLegendItems =
    activePointGroups.length > 0 ||
    activePathGroups.length > 0 ||
    hasAlertStatus ||
    hasClorosisStatus ||
    hasCatastroTracks ||
    hasLindes ||
    hasElevation;

  const overlayBottom = (selectedTarget || isDrawing) ? 270 : 75;

  return (
    <>
      {showLegend && hasAnyLegendItems && (
        <div style={{ ...styles.legendBox, bottom: overlayBottom, maxWidth: 300, maxHeight: 240, overflowY: 'auto' }}>
          <span style={styles.legendTitle}>REFERENCIAS</span>
          <div style={styles.legendGrid}>
            {/* 1. Categorías y subcategorías de puntos */}
            {activePointGroups.map(({ cat, color, subs }) => (
              <div key={cat} style={{ display: 'contents' }}>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.colorCircle, backgroundColor: color }} />
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                </div>
                {Array.from(subs.entries()).map(([sub, subColor]) => (
                  <div key={`${cat}-${sub}`} style={{ ...styles.legendItem, paddingLeft: 6 }}>
                    <span style={{ ...styles.colorCircle, backgroundColor: subColor, width: 7, height: 7 }} />
                    <span style={{ color: '#475569', fontSize: '0.65rem' }}>{sub}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* 2. Categorías y subcategorías de polilíneas (ej: Ríos / Arroyos, Caminos...) */}
            {activePathGroups.map(({ cat, color, subs }) => (
              <div key={cat} style={{ display: 'contents' }}>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.colorLine, backgroundColor: color }} />
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                </div>
                {Array.from(subs.entries()).map(([sub, subColor]) => (
                  <div key={`${cat}-${sub}`} style={{ ...styles.legendItem, paddingLeft: 6 }}>
                    <span style={{ ...styles.colorLine, backgroundColor: subColor, width: 10, height: 2 }} />
                    <span style={{ color: '#475569', fontSize: '0.65rem' }}>{sub}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* 3. Alertas fitosanitarias */}
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

            {/* 4. Capas y cartografía */}
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
        <div style={{ ...styles.navWidget, bottom: overlayBottom }}>
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

