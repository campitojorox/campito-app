// src/components/map/MapTopToolbar.jsx
import { Filter, Route, Layers, X, Printer, Info } from 'lucide-react';
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
  handleExportVisiblePDF,
  setIsInfoModalOpen,
}) {
  return (
    <div style={styles.topBarClean}>
      {searchQuery && (
        <div
          style={{
            marginRight: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            color: '#00979d',
            fontWeight: 600,
            backgroundColor: 'rgba(0,151,157,0.08)',
            padding: '4px 9px',
            borderRadius: 12,
          }}
        >
          <span>🔍 {filteredCount} encontrados</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsFilterOpen((v) => !v);
          setIsLayersMenuOpen(false);
        }}
        style={{
          ...styles.topBarIconBtn,
          color: isFilterOpen ? '#00979d' : '#475569',
        }}
        title="Filtros por categoría y trazados"
        aria-label="Filtros"
      >
        <Filter size={18} />
      </button>

      <button
        type="button"
        onClick={handleToggleDraw}
        style={{
          ...styles.topBarIconBtn,
          color: isDrawing ? '#00979d' : '#475569',
          backgroundColor: isDrawing ? 'rgba(0, 151, 157, 0.14)' : 'transparent',
          borderRadius: 6,
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

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => {
            setIsLayersMenuOpen((v) => !v);
            setIsFilterOpen(false);
          }}
          style={{
            ...styles.topBarIconBtn,
            color: isLayersMenuOpen ? '#00979d' : '#475569',
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
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleExportVisiblePDF}
        disabled={filteredCount === 0}
        style={{
          ...styles.topBarIconBtn,
          color: '#dc2626',
          opacity: filteredCount === 0 ? 0.35 : 1,
          cursor: filteredCount === 0 ? 'not-allowed' : 'pointer',
        }}
        title="Exportar PDF de elementos visibles"
        aria-label="Exportar PDF"
      >
        <Printer size={18} />
      </button>

      <button
        type="button"
        onClick={() => setIsInfoModalOpen(true)}
        style={{
          ...styles.topBarIconBtn,
          color: '#00979d',
        }}
        title="¿Qué es este mapa y cómo interactuar con él mediante Chat IA?"
        aria-label="Información del mapa"
      >
        <Info size={18} />
      </button>
    </div>
  );
}

