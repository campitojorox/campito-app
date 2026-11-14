// src/components/map/MapTopToolbar.jsx
import { Filter, Route, Layers, X, Info } from 'lucide-react';
import { styles } from './mapStyles';

export default function MapTopToolbar({
  searchQuery,
  filteredCount,
  isFilterOpen,
  setIsFilterOpen,
  isDrawing,
  handleToggleDraw,
  isLayersMenuOpen,
  setIsLayersMenuOpen,
  showLegend,
  setShowLegend,
  showNavControls,
  setShowNavControls,
  showElevationContours = true,
  setShowElevationContours,
  showCatastro = true,
  setShowCatastro,
  setIsInfoModalOpen,
}) {
  return (
    <>
      {searchQuery && (
        <div style={styles.searchBadgeFloating}>
          <span>🔍 {filteredCount} encontrados</span>
        </div>
      )}

      {/* Menú de iconos superior derecho: widget horizontal flotante idéntico al de navegación y referencias */}
      <div style={styles.topNavWidget}>
        {/* 1. Trazados */}
        <button
          type="button"
          onClick={handleToggleDraw}
          style={{
            ...styles.topNavWidgetBtn,
            color: isDrawing ? '#00979d' : '#334155',
            backgroundColor: isDrawing ? 'rgba(0, 151, 157, 0.14)' : '#ffffff',
            borderTopLeftRadius: 7,
            borderBottomLeftRadius: 7,
          }}
          title={
            isDrawing
              ? 'Salir del modo trazado'
              : 'Trazar nuevo recorrido (sendero, carril, camino, vereda, acequia)'
          }
          aria-label="Trazar recorrido"
        >
          <Route size={18} />
        </button>

        <div style={styles.topNavWidgetDivider} />

        {/* 2. Filtros */}
        <button
          type="button"
          onClick={() => {
            setIsFilterOpen((v) => !v);
            setIsLayersMenuOpen(false);
          }}
          style={{
            ...styles.topNavWidgetBtn,
            color: isFilterOpen ? '#00979d' : '#334155',
            backgroundColor: isFilterOpen ? 'rgba(0, 151, 157, 0.12)' : '#ffffff',
          }}
          title="Filtros por categoría y trazados"
          aria-label="Filtros"
        >
          <Filter size={18} />
        </button>

        <div style={styles.topNavWidgetDivider} />

        {/* 3. Capas */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsLayersMenuOpen((v) => !v);
              setIsFilterOpen(false);
            }}
            style={{
              ...styles.topNavWidgetBtn,
              color: isLayersMenuOpen ? '#00979d' : '#334155',
              backgroundColor: isLayersMenuOpen ? 'rgba(0, 151, 157, 0.12)' : '#ffffff',
            }}
            title="Capas del mapa y visualización"
            aria-label="Capas del mapa"
          >
            <Layers size={18} />
          </button>

          {isLayersMenuOpen && (
            <div style={styles.layersDropdown}>
              <div style={styles.layersDropdownHeader}>
                <span style={styles.layersDropdownTitle}>Capas del Mapa</span>
                <button
                  type="button"
                  onClick={() => setIsLayersMenuOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <label style={styles.layerCheckboxItem}>
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                  style={{ accentColor: '#00979d', cursor: 'pointer' }}
                />
                <span style={styles.layerCheckboxLabel}>Referencias y Leyenda</span>
              </label>

              <label style={styles.layerCheckboxItem}>
                <input
                  type="checkbox"
                  checked={showNavControls}
                  onChange={(e) => setShowNavControls(e.target.checked)}
                  style={{ accentColor: '#00979d', cursor: 'pointer' }}
                />
                <span style={styles.layerCheckboxLabel}>Navegación, Zoom y GPS</span>
              </label>

              {typeof setShowElevationContours === 'function' && (
                <label style={styles.layerCheckboxItem}>
                  <input
                    type="checkbox"
                    checked={showElevationContours}
                    onChange={(e) => setShowElevationContours(e.target.checked)}
                    style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
                  />
                  <span style={styles.layerCheckboxLabel}>Cotas de altura (20m)</span>
                </label>
              )}

              {typeof setShowCatastro === 'function' && (
                <label style={styles.layerCheckboxItem}>
                  <input
                    type="checkbox"
                    checked={showCatastro}
                    onChange={(e) => setShowCatastro(e.target.checked)}
                    style={{ accentColor: '#00d1da', cursor: 'pointer' }}
                  />
                  <span style={styles.layerCheckboxLabel}>Lindes del Campito</span>
                </label>
              )}
            </div>
          )}
        </div>

        <div style={styles.topNavWidgetDivider} />

        {/* 4. Información */}
        <button
          type="button"
          onClick={() => setIsInfoModalOpen(true)}
          style={{
            ...styles.topNavWidgetBtn,
            color: '#334155',
            borderTopRightRadius: 7,
            borderBottomRightRadius: 7,
          }}
          title="Información y guía de uso del mapa"
          aria-label="Información del mapa"
        >
          <Info size={18} />
        </button>
      </div>
    </>
  );
}

