// src/components/map/MapDrawingCard.jsx
import { useState, useMemo } from 'react';
import { Trash2, Check, X } from 'lucide-react';
import {
  getCategoryColor,
  getSubcategoryColor,
  getSubcategoriesForParent,
} from '../../services/farmInventoryStorage';
import { styles } from './mapStyles';

export default function MapDrawingCard({
  drawPoints = [],
  setDrawPoints,
  liveDrawDistance = 0,
  newPathData = {},
  setNewPathData,
  setIsDrawing,
  onSaveDrawnPath,
  allCategories = [],
  drawSubcategories = [],
  activeDrawCategory = 'Trazados',
  localInventory = [],
}) {
  const [isSaving, setIsSaving] = useState(false);
  const resolvedCategory = 'Trazados';
  const categoryColor = getCategoryColor(resolvedCategory);

  const subcategoriesList = useMemo(() => {
    const fromInventory =
      drawSubcategories && drawSubcategories.length > 0
        ? drawSubcategories
        : getSubcategoriesForParent(localInventory, 'Trazados');
    const defaultSubs = [
      'Sendero',
      'Camino',
      'Carril',
      'Pista',
      'Vereda',
      'Acequia',
      'Línea de Riego',
      'Senda',
      'Linde',
    ];
    const set = new Set([...fromInventory, ...defaultSubs]);
    return Array.from(set).filter(Boolean);
  }, [drawSubcategories, localInventory]);

  const subcategoryColor = getSubcategoryColor(resolvedCategory, newPathData.path_type || '');

  const handleSubcategoryChange = (e) => {
    const pt = e.target.value;
    const subColor = pt ? getSubcategoryColor('Trazados', pt) : getCategoryColor('Trazados');
    setNewPathData((prev) => ({
      ...prev,
      category: 'Trazados',
      path_type: pt,
      color: subColor,
    }));
  };

  const handleDiscard = () => {
    if (drawPoints.length > 0) {
      if (window.confirm('¿Deseas descartar los nodos dibujados y cancelar el trazado?')) {
        setIsDrawing(false);
        setDrawPoints([]);
      }
    } else {
      setIsDrawing(false);
      setDrawPoints([]);
    }
  };

  const handleClose = () => {
    setIsDrawing(false);
    setDrawPoints([]);
  };

  return (
    <div style={styles.cleanTargetCard}>
      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 1: CATEGORÍA RAÍZ ("Trazados" fija) | SUBCATEGORÍA | ACCIONES
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={styles.cardHeaderRow}>
        {/* Categoría Raíz Fija: "Trazados" (sin opción de cambiar) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 95 }}>
          <div
            style={{
              ...styles.cardInputPill,
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              cursor: 'default',
              userSelect: 'none',
            }}
            title="Categoría raíz fija: Trazados"
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: categoryColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '0.80rem',
                fontWeight: 600,
                color: '#1e293b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Trazados
            </span>
          </div>
        </div>

        {/* Selector de Subcategoría (Centro) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 110 }}>
          <div style={styles.cardInputPill}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: subcategoryColor,
                flexShrink: 0,
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
              }}
            />
            <select
              value={newPathData.path_type || ''}
              onChange={handleSubcategoryChange}
              style={styles.cardHeaderSelect}
            >
              <option value="">Subcategoría</option>
              {subcategoriesList.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grupo de botones de acción: Borrar a la izquierda y Cerrar a la derecha */}
        <div style={styles.cardActionGroup}>
          {/* 1. Borrar */}
          <button
            type="button"
            className="map-circle-btn"
            style={styles.circleBtn}
            onClick={handleDiscard}
            title="Descartar trazado en curso"
            aria-label="Descartar trazado en curso"
          >
            <Trash2 size={15} color="#ffffff" strokeWidth={2.2} />
          </button>

          {/* 2. Cerrar */}
          <button
            type="button"
            className="map-circle-btn"
            style={styles.circleBtn}
            onClick={handleClose}
            title="Cerrar modo dibujo"
            aria-label="Cerrar modo dibujo"
          >
            <X size={16} color="#ffffff" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 2: TÍTULO DEL TRAZADO | METROS Y NODOS
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={styles.cardFieldsRow}>
        <input
          type="text"
          value={newPathData.name || ''}
          onChange={(e) => setNewPathData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Título"
          style={styles.cardTitleInput}
        />

        <div style={styles.cardBadge}>
          📏 {liveDrawDistance.toFixed(1)} m · {drawPoints.length} nodos
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 3: DESCRIPCIÓN O NOTAS (Izquierda) + BOTÓN GUARDAR (Esquina derecha abajo)
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, width: '100%' }}>
        <textarea
          rows={2}
          value={newPathData.notes || ''}
          onChange={(e) => setNewPathData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Descripción..."
          style={{ ...styles.cleanFieldTextarea, flex: 1, minWidth: 0, margin: 0 }}
        />

        {/* Guardar (icono CHECK solamente - pasa a color claro al guardar) */}
        <button
          type="button"
          className={`map-circle-btn map-circle-btn--save ${drawPoints.length >= 2 && isSaving ? 'map-circle-btn--light' : ''}`}
          style={{
            ...(drawPoints.length < 2
              ? styles.circleBtnSaveDisabled
              : isSaving
                ? styles.circleBtnSaveLight
                : styles.circleBtnSave),
            flexShrink: 0,
            marginBottom: 2,
          }}
          disabled={drawPoints.length < 2 || isSaving}
          onClick={async () => {
            if (onSaveDrawnPath && !isSaving) {
              setIsSaving(true);
              try {
                await onSaveDrawnPath();
              } finally {
                setIsSaving(false);
              }
            }
          }}
          title={drawPoints.length < 2 ? 'Traza al menos 2 vértices' : isSaving ? 'Guardando...' : 'Guardar recorrido trazado'}
          aria-label="Guardar recorrido trazado"
        >
          <Check size={20} color="#ffffff" strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

