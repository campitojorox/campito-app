// src/components/map/MapFilterDrawer.jsx
import { useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import FilterDrawerShell from '../common/FilterDrawerShell';
import {
  getCategoryColor,
  getSubcategoryColor,
  getItemCategory,
  getSubcategoriesForParent,
  getPathCategory,
  getPathSubcategory,
  sanitizeSubcategory,
} from '../../services/farmInventoryStorage';

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
  allPathCategories = [],
  visiblePathCategories = new Set(),
  setVisiblePathCategories,
  togglePathCategory,
  expandedPathParents = new Set(),
  setExpandedPathParents,
  visiblePathSubcats = null,
  setVisiblePathSubcats,
  togglePathSubcat,
}) {
  // 1. Categorías no vacías de Puntos de Inventario
  const nonEmptyCategories = useMemo(() => {
    return (allCategories || [])
      .map((parent) => {
        const count = (localInventory || []).filter((i) => getItemCategory(i) === parent).length;
        if (count === 0) return null;
        const subcats = getSubcategoriesForParent(localInventory || [], parent)
          .map((sub) => ({
            sub,
            subCount: (localInventory || []).filter((i) => {
              if (getItemCategory(i) !== parent) return false;
              const itemSub = sanitizeSubcategory(i.variety_type || i.variety || i.category || i.tipo || '', parent);
              return itemSub.toLowerCase() === sub.toLowerCase();
            }).length,
          }))
          .filter((s) => s.subCount > 0);
        return { parent, count, subcats };
      })
      .filter(Boolean);
  }, [allCategories, localInventory]);

  // 2. Trazados que no son lindes catastrales
  const nonLindePaths = useMemo(
    () => (localPaths || []).filter((p) => (p.path_type || 'otro') !== 'linde'),
    [localPaths]
  );

  // 3. Agrupación de trazados por su categoría real (ej: Caminos y Trazados, Ríos / Arroyos, etc.)
  const pathCategoryGroups = useMemo(() => {
    const groups = new Map();
    (nonLindePaths || []).forEach((path) => {
      const cat = getPathCategory(path);
      if (!groups.has(cat)) {
        groups.set(cat, { cat, count: 0, subMap: new Map() });
      }
      const g = groups.get(cat);
      g.count += 1;
      const sub = getPathSubcategory(path);
      if (sub) {
        g.subMap.set(sub, (g.subMap.get(sub) || 0) + 1);
      }
    });

    return Array.from(groups.values()).map((g) => ({
      cat: g.cat,
      count: g.count,
      subcats: Array.from(g.subMap.entries()).map(([sub, subCount]) => ({ sub, subCount })),
    }));
  }, [nonLindePaths]);

  // Conteo de puntos visibles
  const visibleInventoryCount = (localInventory || []).filter((item) => {
    const parent = getItemCategory(item);
    if (!visibleCategories.has(parent)) return false;
    if (visibleSubcats !== null) {
      const cleanSub = sanitizeSubcategory(item.variety_type || item.variety || item.category || item.tipo || '', parent);
      if (cleanSub && !visibleSubcats.has(cleanSub) && !visibleSubcats.has(item.variety_type)) return false;
    }
    return true;
  }).length;

  // Conteo de trazados visibles
  const visiblePathsCount = showPaths
    ? nonLindePaths.filter((p) => {
        const cat = getPathCategory(p);
        if (visiblePathCategories && !visiblePathCategories.has(cat)) return false;
        if (visiblePathSubcats !== null) {
          const sub = getPathSubcategory(p);
          if (sub && !visiblePathSubcats.has(sub)) return false;
        }
        return true;
      }).length
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
      {/* SECCIÓN 1: PUNTOS DE INVENTARIO */}
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

      {/* SECCIÓN 2: TRAZADOS (POLILÍNEAS) */}
      {nonLindePaths.length > 0 && (
        <div id="map-filter-section-paths">
          <span className="filter-drawer-section-label">Trazados</span>
          <div className="filter-drawer-list">
            {/* Master checkbox: Todos los trazados */}
            <label className={`filter-drawer-option ${showPaths && visiblePathCategories.size > 0 ? 'is-active' : ''}`}>
              <span className="filter-drawer-option-label">
                <input
                  type="checkbox"
                  checked={showPaths && visiblePathCategories.size > 0}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowPaths(checked);
                    if (checked) {
                      setVisiblePathCategories(new Set(pathCategoryGroups.map((g) => g.cat)));
                      if (setVisiblePathSubcats) setVisiblePathSubcats(null);
                    } else {
                      setVisiblePathCategories(new Set());
                    }
                  }}
                  style={{ accentColor: '#f97316' }}
                />
                <span style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: '#f97316', flexShrink: 0 }} />
                <span>Todos los trazados</span>
              </span>
              <span className="filter-drawer-badge">{nonLindePaths.length}</span>
            </label>

            {/* Grupos de Categorías de Trazados (Caminos y Trazados, Ríos / Arroyos, etc.) */}
            {pathCategoryGroups.length > 0 && (
              <div className="filter-drawer-sublist">
                {pathCategoryGroups.map(({ cat, count, subcats }) => {
                  const isActive = showPaths && visiblePathCategories.has(cat);
                  const isExpanded = expandedPathParents.has(cat);
                  const color = getCategoryColor(cat);
                  return (
                    <div key={cat}>
                      <div className="filter-drawer-option-row">
                        <label className={`filter-drawer-option ${isActive ? 'is-active' : ''}`}>
                          <span className="filter-drawer-option-label">
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={() => {
                                if (!showPaths) setShowPaths(true);
                                togglePathCategory(cat);
                              }}
                              style={{ accentColor: '#00979d' }}
                            />
                            <span style={{ width: 12, height: 3, borderRadius: 1.5, backgroundColor: color, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                          </span>
                          <span className="filter-drawer-badge">{count}</span>
                        </label>
                        {subcats.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPathParents((prev) => {
                                const next = new Set(prev);
                                if (next.has(cat)) next.delete(cat);
                                else next.add(cat);
                                return next;
                              })
                            }
                            className="filter-drawer-expand-btn"
                            aria-label={isExpanded ? `Contraer ${cat}` : `Expandir ${cat}`}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>

                      {/* Subcategorías de la categoría de trazado */}
                      {isExpanded && subcats.length > 0 && (
                        <div className="filter-drawer-sublist">
                          {subcats.map(({ sub, subCount }) => {
                            const isSubActive = visiblePathSubcats === null || visiblePathSubcats.has(sub);
                            const subColor = getSubcategoryColor(cat, sub);
                            return (
                              <label key={sub} className={`filter-drawer-suboption ${isSubActive ? 'is-active' : ''}`}>
                                <span className="filter-drawer-option-label">
                                  <input
                                    type="checkbox"
                                    checked={isSubActive}
                                    onChange={() => {
                                      if (!showPaths) setShowPaths(true);
                                      togglePathSubcat(sub);
                                    }}
                                    style={{ accentColor: '#00979d' }}
                                  />
                                  <span style={{ width: 10, height: 2.5, borderRadius: 1, backgroundColor: subColor, flexShrink: 0 }} />
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
            )}
          </div>
        </div>
      )}
    </FilterDrawerShell>
  );
}
