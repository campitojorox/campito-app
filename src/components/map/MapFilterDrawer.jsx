// src/components/map/MapFilterDrawer.jsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import FilterDrawerShell from '../common/FilterDrawerShell';
import {
  getCategoryColor,
  PATH_TYPE_COLORS,
  getItemCategory,
  getSubcategoriesForParent,
} from '../../services/farmInventoryStorage';
import { PATH_TYPES, PATH_TYPE_LABELS } from './mapUtils';

const FILTERABLE_PATH_TYPES = PATH_TYPES.filter((pt) => pt !== 'linde');

export default function MapFilterDrawer({
  isOpen,
  onClose,
  selectAllFilters,
  clearAllFilters,
  allCategories = [],
  localInventory = [],
  visibleCategories = new Set(),
  toggleParentCategory,
  expandedParents = new Set(),
  setExpandedParents,
  visibleSubcats,
  setVisibleSubcats,
  localPaths = [],
  showPaths = true,
  setShowPaths,
  visiblePathTypes = new Set(),
  setVisiblePathTypes,
  togglePathType,
}) {
  const nonEmptyCategories = (allCategories || [])
    .map((parent) => {
      const count = (localInventory || []).filter((i) => getItemCategory(i) === parent).length;
      if (count === 0) return null;
      const subcats = getSubcategoriesForParent(localInventory || [], parent)
        .map((sub) => ({
          sub,
          subCount: (localInventory || []).filter(
            (i) => getItemCategory(i) === parent && (i.variety_type || i.category || i.tipo) === sub
          ).length,
        }))
        .filter((s) => s.subCount > 0);
      return { parent, count, subcats };
    })
    .filter(Boolean);

  const nonLindePaths = (localPaths || []).filter((p) => (p.path_type || 'otro') !== 'linde');

  const nonEmptyPathTypes = FILTERABLE_PATH_TYPES
    .map((pt) => ({
      pt,
      count: nonLindePaths.filter((p) => (p.path_type || 'otro') === pt).length,
    }))
    .filter((item) => item.count > 0);

  const visibleInventoryCount = localInventory.filter((item) => {
    const parent = getItemCategory(item);
    if (!visibleCategories.has(parent)) return false;
    if (visibleSubcats !== null) {
      const rawSub = item.variety_type || item.category || item.tipo || '';
      if (!visibleSubcats.has(rawSub)) return false;
    }
    return true;
  }).length;

  const visiblePathsCount = showPaths
    ? nonLindePaths.filter((p) => visiblePathTypes.has(p.path_type || 'otro')).length
    : 0;

  const totalVisibleElements = visibleInventoryCount + visiblePathsCount;

  return (
    <FilterDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      drawerId="map-filter-drawer"
      title="Filtros"
      actions={
        <>
          <button type="button" onClick={selectAllFilters} className="filter-drawer-action-btn">
            Todo
          </button>
          <button type="button" onClick={clearAllFilters} className="filter-drawer-action-btn">
            Ninguno
          </button>
        </>
      }
      footer={`${totalVisibleElements} ${totalVisibleElements === 1 ? 'elemento' : 'elementos'}`}
    >
      {nonEmptyCategories.length > 0 && (
        <div id="map-filter-section-inventory">
          <span className="filter-drawer-section-label">Puntos de inventario</span>
          <div className="filter-drawer-list">
            {nonEmptyCategories.map(({ parent, count, subcats }) => {
              const isActive = visibleCategories.has(parent);
              const isExpanded = expandedParents.has(parent);
              const color = getCategoryColor(parent);
              return (
                <div key={parent}>
                  <div className="filter-drawer-option-row">
                    <label className={`filter-drawer-option ${isActive ? 'is-active' : ''}`}>
                      <span className="filter-drawer-option-label">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => toggleParentCategory(parent)}
                          style={{ accentColor: '#00979d' }}
                        />
                        <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parent}</span>
                      </span>
                      <span className="filter-drawer-badge">{count}</span>
                    </label>
                    {subcats.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedParents((prev) => {
                            const next = new Set(prev);
                            if (next.has(parent)) next.delete(parent);
                            else next.add(parent);
                            return next;
                          })
                        }
                        className="filter-drawer-expand-btn"
                        aria-label={isExpanded ? `Contraer ${parent}` : `Expandir ${parent}`}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>

                  {isExpanded && subcats.length > 0 && (
                    <div className="filter-drawer-sublist">
                      {subcats.map(({ sub, subCount }) => {
                        const isSubActive = visibleSubcats === null || visibleSubcats.has(sub);
                        return (
                          <label key={sub} className={`filter-drawer-suboption ${isSubActive ? 'is-active' : ''}`}>
                            <span className="filter-drawer-option-label">
                              <input
                                type="checkbox"
                                checked={isSubActive}
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
                                style={{ accentColor: '#00979d' }}
                              />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
                            </span>
                            <span className="filter-drawer-badge">{subCount}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nonLindePaths.length > 0 && (
        <div id="map-filter-section-paths">
          <span className="filter-drawer-section-label">Caminos y trazados</span>
          <div className="filter-drawer-list">
            <label className={`filter-drawer-option ${showPaths && visiblePathTypes.size > 0 ? 'is-active' : ''}`}>
              <span className="filter-drawer-option-label">
                <input
                  type="checkbox"
                  checked={showPaths && visiblePathTypes.size > 0}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowPaths(checked);
                    setVisiblePathTypes(checked ? new Set(FILTERABLE_PATH_TYPES) : new Set());
                  }}
                  style={{ accentColor: '#f97316' }}
                />
                <span style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: '#f97316', flexShrink: 0 }} />
                <span>Todos los caminos</span>
              </span>
              <span className="filter-drawer-badge">{nonLindePaths.length}</span>
            </label>

            {nonEmptyPathTypes.length > 0 && (
              <div className="filter-drawer-sublist">
                {nonEmptyPathTypes.map(({ pt, count }) => {
                  const isChecked = showPaths && visiblePathTypes.has(pt);
                  return (
                    <label key={pt} className={`filter-drawer-suboption ${isChecked ? 'is-active' : ''}`}>
                      <span className="filter-drawer-option-label">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (!showPaths) setShowPaths(true);
                            togglePathType(pt);
                          }}
                          style={{ accentColor: '#00979d' }}
                        />
                        <span style={{ width: 12, height: 3, borderRadius: 1, backgroundColor: PATH_TYPE_COLORS[pt] || '#64748b', flexShrink: 0 }} />
                        <span>{PATH_TYPE_LABELS[pt]}</span>
                      </span>
                      <span className="filter-drawer-badge">{count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </FilterDrawerShell>
  );
}
