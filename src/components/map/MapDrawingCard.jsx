// src/components/map/MapDrawingCard.jsx
import { useState } from 'react';
import { Undo2, Trash2, Check, X } from 'lucide-react';
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
  activeDrawCategory = 'Caminos y Trazados',
  localInventory = [],
}) {
  const [isSaving, setIsSaving] = useState(false);
  const resolvedCategory = newPathData.category || activeDrawCategory || 'Caminos y Trazados';
  const categoryColor = getCategoryColor(resolvedCategory);
  const subcategoriesList =
    drawSubcategories && drawSubcategories.length > 0
      ? drawSubcategories
      : getSubcategoriesForParent(localInventory, resolvedCategory);
  const subcategoryColor = getSubcategoryColor(resolvedCategory, newPathData.path_type || '');

  const handleCategoryChange = (e) => {
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
  };

  const handleSubcategoryChange = (e) => {
    const pt = e.target.value;
    const subColor = pt ? getSubcategoryColor(resolvedCategory, pt) : getCategoryColor(resolvedCategory);
    setNewPathData((prev) => ({
      ...prev,
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
          LÍNEA 1: CATEGORÍA | SUBCATEGORÍA | 4 BOTONES ACCIÓN
          Orden: Deshacer (activo en polilíneas), Borrar, Guardar (solo Check), Cerrar
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={styles.cardHeaderRow}>
        {/* Selector de Categoría (Izquierda) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
          <div style={styles.cardInputPill}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: categoryColor,
                flexShrink: 0,
              }}
            />
            <select
              value={resolvedCategory}
              onChange={handleCategoryChange}
              style={styles.cardHeaderSelect}
            >
              <option value="Caminos y Trazados">Caminos y Trazados</option>
              <option value="Líneas de Riego">Líneas de Riego</option>
              <option value="Lindes y Límites">Lindes y Límites</option>
              {(allCategories || [])
                .filter(
                  (c) =>
                    c &&
                    ![
                      'Caminos y Trazados',
                      'Líneas de Riego',
                      'Lindes y Límites',
                      'Sin clasificar',
                      'Sin categoría',
                      'Otros',
                    ].includes(c)
                )
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Selector de Subcategoría (Centro) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
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

        {/* Grupo de 4 botones circulares verdes con icono blanco */}
        <div style={styles.cardActionGroup}>
          {/* 1. Deshacer (activo en polilíneas) */}
          <button
            type="button"
            className="map-circle-btn"
            style={drawPoints.length === 0 ? styles.circleBtnDisabled : styles.circleBtn}
            disabled={drawPoints.length === 0}
            onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
            title="Deshacer último vértice"
            aria-label="Deshacer último vértice"
          >
            <Undo2 size={15} color="#ffffff" strokeWidth={2.2} />
          </button>

          {/* 2. Borrar */}
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

          {/* 3. Guardar (icono CHECK solamente - pasa a color claro al guardar) */}
          <button
            type="button"
            className={`map-circle-btn ${drawPoints.length >= 2 && isSaving ? 'map-circle-btn--light' : ''}`}
            style={
              drawPoints.length < 2
                ? styles.circleBtnDisabled
                : isSaving
                  ? styles.circleBtnLight
                  : styles.circleBtn
            }
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
            <Check size={16} color="#ffffff" strokeWidth={2.6} />
          </button>

          {/* 4. Cerrar */}
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
          LÍNEA 3: DESCRIPCIÓN O NOTAS DEL TRAZADO
          ────────────────────────────────────────────────────────────────────────── */}
      <textarea
        rows={2}
        value={newPathData.notes || ''}
        onChange={(e) => setNewPathData((prev) => ({ ...prev, notes: e.target.value }))}
        placeholder="Descripción..."
        style={styles.cleanFieldTextarea}
      />
    </div>
  );
}

