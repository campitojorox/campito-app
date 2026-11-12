// src/components/map/MapFilterDrawer.jsx
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getCategoryColor,
  PATH_TYPE_COLORS,
  getItemCategory,
  getSubcategoriesForParent,
} from '../../services/farmInventoryStorage';
import catastroJorox from '../../data/catastroJorox.json';
import { PATH_TYPES, PATH_TYPE_LABELS } from './mapUtils';
import { stylesFilter } from './mapStyles';

export default function MapFilterDrawer({
  isOpen,
  onClose,
  selectAllFilters,
  clearAllFilters,
  allCategories,
  localInventory,
  visibleCategories,
  toggleParentCategory,
  expandedParents,
  setExpandedParents,
  visibleSubcats,
  setVisibleSubcats,
  localPaths,
  showPaths,
  setShowPaths,
  visiblePathTypes,
  setVisiblePathTypes,
  togglePathType,
  showCatastro,
  setShowCatastro,
}) {
  if (!isOpen) return null;

  return (
    <div style={stylesFilter.overlay} onClick={onClose}>
      <div style={stylesFilter.panel} onClick={(e) => e.stopPropagation()}>
        <div style={stylesFilter.panelHeader}>
          <span style={stylesFilter.panelTitle}>🔍 Filtros de Categoría</span>
          <button onClick={onClose} style={stylesFilter.panelClose}>
            <X size={16} />
          </button>
        </div>

        <div style={stylesFilter.panelActions}>
          <button onClick={selectAllFilters} style={stylesFilter.actionBtn}>✅ Todo</button>
          <button onClick={clearAllFilters} style={stylesFilter.actionBtn}>⬜ Ninguno</button>
        </div>

        <div style={stylesFilter.sectionLabel}>PUNTOS DE INVENTARIO</div>
        {allCategories.map((parent) => {
          const subcats = getSubcategoriesForParent(localInventory, parent);
          const count = localInventory.filter((i) => getItemCategory(i) === parent).length;
          const isActive = visibleCategories.has(parent);
          const isExpanded = expandedParents.has(parent);
          const color = getCategoryColor(parent);
          return (
            <div key={parent}>
              <div style={stylesFilter.catRow}>
                <label style={stylesFilter.catLabel}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleParentCategory(parent)}
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, display: 'inline-block', marginRight: 5 }} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.78rem' }}>{parent}</span>
                  <span style={stylesFilter.countBadge}>{count}</span>
                </label>
                {subcats.length > 0 && (
                  <button
                    onClick={() =>
                      setExpandedParents((prev) => {
                        const next = new Set(prev);
                        if (next.has(parent)) next.delete(parent);
                        else next.add(parent);
                        return next;
                      })
                    }
                    style={stylesFilter.expandBtn}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
              </div>
              {isExpanded &&
                subcats.map((sub) => {
                  const subCount = localInventory.filter(
                    (i) => (i.variety_type || i.category || i.tipo) === sub
                  ).length;
                  return (
                    <div key={sub} style={stylesFilter.subcatRow}>
                      <label style={stylesFilter.subcatLabel}>
                        <input
                          type="checkbox"
                          checked={visibleSubcats === null || visibleSubcats.has(sub)}
                          onChange={() => {
                            setVisibleSubcats((prev) => {
                              if (prev === null) {
                                const allSubs = new Set(
                                  localInventory.map((i) => i.variety_type || i.category || i.tipo).filter(Boolean)
                                );
                                allSubs.delete(sub);
                                return allSubs;
                              }
                              const next = new Set(prev);
                              if (next.has(sub)) next.delete(sub);
                              else next.add(sub);
                              return next;
                            });
                          }}
                          style={{ marginRight: 6 }}
                        />
                        <span style={{ flex: 1, fontSize: '0.75rem' }}>{sub}</span>
                        <span style={stylesFilter.countBadge}>{subCount}</span>
                      </label>
                    </div>
                  );
                })}
            </div>
          );
        })}

        <div style={{ ...stylesFilter.sectionLabel, marginTop: 12 }}>CAMINOS Y TRAZADOS</div>
        <div style={stylesFilter.catRow}>
          <label style={stylesFilter.catLabel}>
            <input
              type="checkbox"
              checked={showPaths && visiblePathTypes.size > 0}
              onChange={(e) => {
                const checked = e.target.checked;
                setShowPaths(checked);
                setVisiblePathTypes(checked ? new Set(PATH_TYPES) : new Set());
              }}
              style={{ marginRight: 6, accentColor: '#f97316' }}
            />
            <span style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: '#f97316', display: 'inline-block', marginRight: 5 }} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem' }}>
              Todos los caminos ({localPaths.length})
            </span>
            <span style={stylesFilter.countBadge}>{localPaths.length}</span>
          </label>
        </div>
        {PATH_TYPES.map((pt) => {
          const count = localPaths.filter((p) => (p.path_type || 'otro') === pt).length;
          const isChecked = showPaths && visiblePathTypes.has(pt);
          return (
            <div key={pt} style={stylesFilter.subcatRow}>
              <label style={stylesFilter.subcatLabel}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    if (!showPaths) setShowPaths(true);
                    togglePathType(pt);
                  }}
                  style={{ marginRight: 6 }}
                />
                <span style={{ width: 12, height: 3, borderRadius: 1, backgroundColor: PATH_TYPE_COLORS[pt] || '#64748b', display: 'inline-block', marginRight: 5 }} />
                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.75rem' }}>{PATH_TYPE_LABELS[pt]}</span>
                <span style={stylesFilter.countBadge}>{count}</span>
              </label>
            </div>
          );
        })}

        <div style={{ ...stylesFilter.sectionLabel, marginTop: 14 }}>CATASTRO OFICIAL</div>
        <div style={stylesFilter.catRow}>
          <label style={stylesFilter.catLabel}>
            <input
              type="checkbox"
              checked={showCatastro}
              onChange={(e) => setShowCatastro(e.target.checked)}
              style={{ marginRight: 6, accentColor: '#00979d' }}
            />
            <span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px dashed #00d1da', backgroundColor: 'rgba(0,151,157,0.18)', display: 'inline-block', marginRight: 6 }} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem' }}>Catastro (Parcelas 195 y 196)</span>
            <span style={stylesFilter.countBadge}>
              {(catastroJorox.parcels?.length || 0) + (catastroJorox.cotas?.length || 0)}
            </span>
          </label>
        </div>

        {showCatastro && (
          <>
            <div style={stylesFilter.subcatRow}>
              <label style={stylesFilter.subcatLabel}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#00d1da', display: 'inline-block', marginRight: 6 }} />
                <span style={{ flex: 1, fontSize: '0.74rem' }}>🏛️ Parcelas 195 y 196</span>
                <span style={stylesFilter.countBadge}>{catastroJorox.parcels?.length || 2}</span>
              </label>
            </div>
            <div style={stylesFilter.subcatRow}>
              <label style={stylesFilter.subcatLabel}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ffffff', border: '1.5px solid #00979d', display: 'inline-block', marginRight: 6 }} />
                <span style={{ flex: 1, fontSize: '0.74rem' }}>📍 Cotas catastrales</span>
                <span style={stylesFilter.countBadge}>{catastroJorox.cotas?.length || 19}</span>
              </label>
            </div>
            <div style={stylesFilter.subcatRow}>
              <label style={stylesFilter.subcatLabel}>
                <span style={{ width: 12, height: 2, borderTop: '2px dashed #94a3b8', display: 'inline-block', marginRight: 6 }} />
                <span style={{ flex: 1, fontSize: '0.74rem' }}>〰️ Pistas catastrales</span>
                <span style={stylesFilter.countBadge}>{catastroJorox.tracks?.length || 0}</span>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

