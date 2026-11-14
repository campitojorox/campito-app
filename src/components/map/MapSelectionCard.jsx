// src/components/map/MapSelectionCard.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { Undo2, Trash2, Check, X } from 'lucide-react';
import {
  getItemCategory,
  getPathCategory,
  getCategoryColor,
  getSubcategoryColor,
  getFarmCategories,
  getDeletedCategories,
  getLocalInventory,
  getSubcategoriesForParent,
  saveFarmCategory,
  sanitizeSubcategory,
} from '../../services/farmInventoryStorage';
import { PATH_TYPE_LABELS } from './mapUtils';
import { styles } from './mapStyles';

export default function MapSelectionCard({
  selectedTarget,
  setSelectedTarget,
  localPaths = [],
  allCategories = [],
  handleDirectFieldUpdate,
  handleDeleteTarget,
  handleDeleteNode,
  handleSaveTarget,
  undoStack = [],
  handleUndoMapAction,
}) {
  const [isCatMenuOpen, setIsCatMenuOpen] = useState(false);
  const [isSubcatMenuOpen, setIsSubcatMenuOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(() => !selectedTarget?.isNew);
  const [isSaving, setIsSaving] = useState(false);
  const prevTargetIdRef = useRef(selectedTarget?.id);

  useEffect(() => {
    if (selectedTarget?.id !== prevTargetIdRef.current) {
      prevTargetIdRef.current = selectedTarget?.id;
      setIsSaved(!selectedTarget?.isNew);
      setIsSaving(false);
    }
  }, [selectedTarget?.id, selectedTarget?.isNew]);

  // 1. Sugerencias de categorías raíz activas (estrictamente filtradas contra eliminadas)
  const categorySuggestions = useMemo(() => {
    const deleted = getDeletedCategories();
    const fromFarm = getFarmCategories()
      .map((c) => c.name)
      .filter((n) => n && n !== 'Otros' && !deleted.has(n) && !deleted.has(n.toLowerCase()));

    const merged = new Set(fromFarm);

    (allCategories || []).forEach((c) => {
      const clean = String(c || '').trim();
      const lower = clean.toLowerCase();
      if (
        clean &&
        clean !== 'Otros' &&
        clean !== 'Sin categoría' &&
        clean !== 'Sin clasificar' &&
        !deleted.has(clean) &&
        !deleted.has(lower)
      ) {
        merged.add(clean);
      }
    });

    return Array.from(merged).filter(Boolean);
  }, [allCategories]);

  const isPoint = selectedTarget?.type === 'point';
  const isPath = selectedTarget?.type === 'path';
  const isNode = selectedTarget?.type === 'node';
  const isCatastro = selectedTarget?.type === 'catastro';
  const isCoord = selectedTarget?.type === 'coord';
  const isNew = Boolean(selectedTarget?.isNew || isCoord);
  const isEditable = isPoint || isPath || isNode || isCoord || isNew;

  const isUnclassified = (cat) => {
    if (!cat) return true;
    const l = String(cat).trim().toLowerCase();
    return l === 'sin categoría' || l === 'sin categoria' || l === 'sin clasificar' || l === 'otros' || l === 'otro';
  };

  // Categoría raíz resuelta según tipo
  const resolvedRootCategory = isNew
    ? (selectedTarget?.category || '')
    : isPoint
      ? (isUnclassified(selectedTarget?.category)
          ? (isUnclassified(getItemCategory(selectedTarget)) ? '' : getItemCategory(selectedTarget))
          : selectedTarget?.category)
      : isPath
        ? (isUnclassified(selectedTarget?.category)
            ? (isUnclassified(getPathCategory(selectedTarget)) ? '' : getPathCategory(selectedTarget))
            : selectedTarget?.category)
        : isNode
          ? (isUnclassified(selectedTarget?.category)
              ? (isUnclassified(selectedTarget?.raw?.category)
                  ? (isUnclassified(getPathCategory(selectedTarget)) ? '' : getPathCategory(selectedTarget))
                  : selectedTarget?.raw?.category)
              : selectedTarget?.category)
          : isCatastro
            ? 'Catastro Oficial'
            : (selectedTarget?.category || '');

  const currentCategory = String(resolvedRootCategory || '');

  // 2. Sugerencias de subcategorías estrictamente pertenecientes a la categoría raíz actual
  const subcategorySuggestions = useMemo(() => {
    if (!selectedTarget || !currentCategory) return [];
    const rawInv = getLocalInventory();
    return getSubcategoriesForParent(rawInv, currentCategory);
  }, [selectedTarget, currentCategory]);

  // Si no hay target seleccionado, retornar null de forma segura tras evaluar todos los hooks
  if (!selectedTarget) return null;

  // 3. Subcategoría actual (si no tiene o no pertenece a la categoría raíz, dejar en blanco "")
  const rawSubcategory = isPoint
    ? String(selectedTarget.variety_type ?? selectedTarget.variety ?? '')
    : isPath
      ? String(
          selectedTarget.variety_type ??
            selectedTarget.subcategory ??
            (selectedTarget.path_type && !['otro', 'otro_trazado'].includes(selectedTarget.path_type)
              ? PATH_TYPE_LABELS[selectedTarget.path_type] || selectedTarget.path_type
              : '')
        )
      : isNode
        ? String(
            selectedTarget.raw?.variety_type ??
              selectedTarget.raw?.subcategory ??
              (selectedTarget.pathType && !['otro', 'otro_trazado'].includes(selectedTarget.pathType)
                ? PATH_TYPE_LABELS[selectedTarget.pathType] || selectedTarget.pathType
                : '')
          )
        : '';

  const currentSubcategory = sanitizeSubcategory(rawSubcategory, currentCategory);

  // 4. Colores oficiales: Categoría raíz + Subcategoría en la misma gama de color (tono pastel más claro)
  const categoryDotColor = currentCategory ? getCategoryColor(currentCategory) : '#00979d';
  const subcategoryDotColor = (currentCategory && currentSubcategory)
    ? getSubcategoryColor(currentCategory, currentSubcategory)
    : '#cbd5e1';

  const showBotanicalStatus =
    isPoint && (currentCategory === 'Árboles' || currentCategory === 'Plantas');

  // Filtrado de categorías para autocompletar
  const trimmedCat = currentCategory.trim().toLowerCase();
  const isExactSuggestion = categorySuggestions.some((c) => String(c).toLowerCase() === trimmedCat);
  const filteredCategorySuggestions =
    !trimmedCat || isExactSuggestion
      ? categorySuggestions
      : categorySuggestions.filter((c) => String(c).toLowerCase().includes(trimmedCat));

  // Filtrado de subcategorías para autocompletar
  const trimmedSub = currentSubcategory.trim().toLowerCase();
  const isExactSub = subcategorySuggestions.some((s) => String(s).toLowerCase() === trimmedSub);
  const filteredSubcatSuggestions =
    !trimmedSub || isExactSub
      ? subcategorySuggestions
      : subcategorySuggestions.filter((s) => String(s).toLowerCase().includes(trimmedSub));

  // Manejador al seleccionar o cambiar categoría
  const handleCategoryChange = (newCat, closeMenu = false) => {
    if (!isEditable) return;
    setIsSaved(false);
    const validSubs = getSubcategoriesForParent(getLocalInventory(), newCat);
    const stillValid = validSubs.some(
      (s) => s.toLowerCase() === (currentSubcategory || '').trim().toLowerCase()
    );

    handleDirectFieldUpdate('category', newCat);
    if (!stillValid && currentSubcategory) {
      handleDirectFieldUpdate('variety_type', '');
      handleDirectFieldUpdate('subcategory', '');
    }
    if (closeMenu) {
      setIsCatMenuOpen(false);
    }
  };

  // Manejador al seleccionar o cambiar subcategoría en el formulario (sin guardado automático al escribir)
  const handleSubcategoryChange = (newSub, closeMenu = false) => {
    if (!isEditable) return;
    setIsSaved(false);
    if (isPoint) {
      handleDirectFieldUpdate('variety_type', newSub);
    } else {
      handleDirectFieldUpdate('variety_type', newSub);
      handleDirectFieldUpdate('subcategory', newSub);
      handleDirectFieldUpdate('color', getSubcategoryColor(currentCategory, newSub));
    }
    if (closeMenu) {
      setIsSubcatMenuOpen(false);
    }
  };

  // Guardar cambios forzando transición a color claro (acción explícita del usuario)
  const onSaveClick = async () => {
    if (!handleSaveTarget || isSaving) return;
    setIsSaving(true);
    try {
      if (currentCategory && currentSubcategory) {
        saveFarmCategory(currentCategory, [currentSubcategory]);
      }
      await handleSaveTarget();
      setIsSaved(true);
    } catch (err) {
      console.error('Error guardando cambios:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Manejador de borrado unificado con confirmación para Nodos, Polilíneas y Pines
  const handleDeleteWithConfirm = (e) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    if (!selectedTarget) return;

    if (isNew) {
      setSelectedTarget(null);
      return;
    }

    if (isNode) {
      const nodeNum = (Number(selectedTarget.nodeIndex) || 0) + 1;
      const total = selectedTarget.totalNodes || '?';
      const pathName = selectedTarget.pathName || selectedTarget.title || 'este trazado';

      if (selectedTarget.totalNodes && selectedTarget.totalNodes <= 2) {
        alert(
          'Un recorrido debe tener al menos 2 nodos. Si deseas eliminar el recorrido completo, seleccionalo y elimínalo desde su ficha.'
        );
        return;
      }

      const confirmed = window.confirm(
        `¿Deseas eliminar el vértice ${nodeNum} de ${total} del trazado "${pathName}"?`
      );
      if (confirmed) {
        handleDeleteNode(selectedTarget.pathId, selectedTarget.nodeIndex, true);
      }
    } else if (isPath) {
      const title = selectedTarget.name || selectedTarget.title || 'este trazado';
      const confirmed = window.confirm(
        `¿Deseas eliminar el trazado completo "${title}" del mapa y la base de datos?`
      );
      if (confirmed) {
        handleDeleteTarget(null, true);
      }
    } else if (isPoint) {
      const title = selectedTarget.name || selectedTarget.title || 'este elemento';
      const confirmed = window.confirm(
        `¿Deseas eliminar "${title}" del inventario de la finca?`
      );
      if (confirmed) {
        handleDeleteTarget(null, true);
      }
    }
  };

  // Título e información del elemento para la segunda línea
  const itemTitle = isNew
    ? (selectedTarget.name ?? '')
    : isNode
      ? (selectedTarget.pathName ?? selectedTarget.name ?? selectedTarget.title ?? 'Recorrido')
      : (selectedTarget.name ?? selectedTarget.title ?? '');

  const coordAndLengthText = isPoint
    ? `📍 ${Number(selectedTarget.lat || 0).toFixed(5)}, ${Number(selectedTarget.lng || 0).toFixed(5)}${selectedTarget.accuracy ? ` · ±${Number(selectedTarget.accuracy || 0).toFixed(1)}m` : ''}`
    : isPath
      ? `📏 ${Math.round(selectedTarget.length_meters || 0)} m · ${selectedTarget.coordinates?.length || 0} nodos`
      : isNode
        ? `📍 ${Number(selectedTarget.lat || 0).toFixed(5)}, ${Number(selectedTarget.lng || 0).toFixed(5)} · Nodo ${(Number(selectedTarget.nodeIndex) || 0) + 1}/${selectedTarget.totalNodes || '?'}`
        : `📍 ${Number(selectedTarget.lat || 0).toFixed(5)}, ${Number(selectedTarget.lng || 0).toFixed(5)}`;

  const itemNotes = isNode
    ? (selectedTarget.notes ?? selectedTarget.raw?.notes ?? '')
    : (selectedTarget.notes ?? '');

  return (
    <div style={styles.cleanTargetCard}>
      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 1: CATEGORÍA RAÍZ (Arriba Izquierda) | SUBCATEGORÍA (Arriba Derecha) | [X]
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={styles.cardHeaderRow}>
        {/* Input Categoría Raíz (Izquierda) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 110 }}>
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
              width: '100%',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: categoryDotColor,
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              value={currentCategory}
              readOnly={!isEditable}
              onFocus={() => isEditable && setIsCatMenuOpen(true)}
              onBlur={() => setTimeout(() => setIsCatMenuOpen(false), 160)}
              onChange={(e) => {
                if (isEditable) {
                  handleCategoryChange(e.target.value);
                  setIsCatMenuOpen(true);
                }
              }}
              placeholder="Categoría"
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                color: '#1e293b',
                fontSize: '0.80rem',
                fontWeight: 600,
                width: '100%',
                minWidth: 0,
                padding: 0,
                fontFamily: 'inherit',
              }}
              autoComplete="off"
            />
          </div>

          {/* Menú desplegable de categorías raíz al hacer foco / escribir */}
          {isCatMenuOpen && filteredCategorySuggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.16)',
                zIndex: 70,
                maxHeight: 160,
                overflowY: 'auto',
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {filteredCategorySuggestions.map((cat) => {
                const isCurrent = cat.toLowerCase() === trimmedCat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCategoryChange(cat, true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      width: '100%',
                      padding: '5px 8px',
                      border: 'none',
                      borderRadius: 6,
                      backgroundColor: isCurrent ? 'rgba(0, 151, 157, 0.12)' : 'transparent',
                      color: isCurrent ? '#0f766e' : '#1e293b',
                      fontSize: '0.78rem',
                      fontWeight: isCurrent ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: getCategoryColor(cat),
                        flexShrink: 0,
                      }}
                    />
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Input Subcategoría (En la misma línea a la derecha, misma arquitectura) */}
        <div style={{ position: 'relative', flex: 1, minWidth: 110 }}>
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
              width: '100%',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: subcategoryDotColor,
                flexShrink: 0,
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
              }}
            />
            <input
              type="text"
              value={currentSubcategory}
              readOnly={!isEditable}
              onFocus={() => isEditable && setIsSubcatMenuOpen(true)}
              onBlur={() => setTimeout(() => setIsSubcatMenuOpen(false), 160)}
              onChange={(e) => {
                if (isEditable) {
                  handleSubcategoryChange(e.target.value);
                  setIsSubcatMenuOpen(true);
                }
              }}
              placeholder="Subcategoría"
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                color: '#1e293b',
                fontSize: '0.80rem',
                fontWeight: 600,
                width: '100%',
                minWidth: 0,
                padding: 0,
                fontFamily: 'inherit',
              }}
              autoComplete="off"
            />
          </div>

          {/* Menú desplegable de subcategorías estrictamente filtradas por la categoría raíz */}
          {isSubcatMenuOpen && filteredSubcatSuggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.16)',
                zIndex: 70,
                maxHeight: 160,
                overflowY: 'auto',
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {filteredSubcatSuggestions.map((sub) => {
                const isCurrent = sub.toLowerCase() === trimmedSub;
                const subColor = getSubcategoryColor(currentCategory, sub);
                return (
                  <button
                    key={sub}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSubcategoryChange(sub, true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      width: '100%',
                      padding: '5px 8px',
                      border: 'none',
                      borderRadius: 6,
                      backgroundColor: isCurrent ? 'rgba(0, 151, 157, 0.12)' : 'transparent',
                      color: isCurrent ? '#0f766e' : '#1e293b',
                      fontSize: '0.78rem',
                      fontWeight: isCurrent ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: subColor,
                        flexShrink: 0,
                        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
                      }}
                    />
                    <span>{sub}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grupo de 4 botones circulares verdes con icono blanco */}
        {/* Orden: Deshacer (activo en polilíneas), Borrar, Guardar (solo Check), Cerrar */}
        <div style={styles.cardActionGroup}>
          {/* 1. Deshacer (activo en polilíneas) */}
          <button
            type="button"
            className="map-circle-btn"
            style={(isPath || isNode) && undoStack && undoStack.length > 0 ? styles.circleBtn : styles.circleBtnDisabled}
            disabled={!((isPath || isNode) && undoStack && undoStack.length > 0)}
            onClick={() => {
              if (handleUndoMapAction) handleUndoMapAction();
            }}
            title={
              isPath || isNode
                ? undoStack && undoStack.length > 0
                  ? 'Deshacer último cambio de polilínea'
                  : 'Sin cambios que deshacer en polilínea'
                : 'Deshacer disponible en polilíneas'
            }
            aria-label="Deshacer"
          >
            <Undo2 size={15} color="#ffffff" strokeWidth={2.2} />
          </button>

          {/* 2. Borrar */}
          <button
            type="button"
            className="map-circle-btn"
            style={isEditable ? styles.circleBtn : styles.circleBtnDisabled}
            disabled={!isEditable}
            onClick={handleDeleteWithConfirm}
            title={
              isNew
                ? 'Descartar nuevo punto'
                : isNode
                  ? `Eliminar vértice ${(Number(selectedTarget.nodeIndex) || 0) + 1}`
                  : isPath
                    ? 'Eliminar este trazado'
                    : 'Eliminar este elemento'
            }
            aria-label="Borrar"
          >
            <Trash2 size={15} color="#ffffff" strokeWidth={2.2} />
          </button>

          {/* 3. Guardar (icono CHECK solamente - pasa a color claro si está guardado) */}
          <button
            type="button"
            className={`map-circle-btn ${isSaved ? 'map-circle-btn--light' : ''}`}
            style={
              !isEditable
                ? styles.circleBtnDisabled
                : isSaved
                  ? styles.circleBtnLight
                  : styles.circleBtn
            }
            disabled={!isEditable || isSaving}
            onClick={onSaveClick}
            title={isSaved ? 'Guardado (sin cambios pendientes)' : 'Guardar cambios'}
            aria-label={isSaved ? 'Guardado' : 'Guardar cambios'}
          >
            <Check size={16} color="#ffffff" strokeWidth={2.6} />
          </button>

          {/* 4. Cerrar */}
          <button
            type="button"
            className="map-circle-btn"
            style={styles.circleBtn}
            onClick={() => setSelectedTarget(null)}
            title="Cerrar ficha"
            aria-label="Cerrar ficha"
          >
            <X size={16} color="#ffffff" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 2: TÍTULO DEL ELEMENTO (Izquierda) | COORDENADAS / LONGITUD (Derecha)
          ────────────────────────────────────────────────────────────────────────── */}
      <div style={styles.cardFieldsRow}>
        <input
          type="text"
          value={itemTitle}
          readOnly={!isEditable}
          onChange={(e) => {
            if (isEditable) {
              handleDirectFieldUpdate('name', e.target.value);
              setIsSaved(false);
            }
          }}
          placeholder="Título"
          style={styles.cardTitleInput}
        />

        <div style={styles.cardBadge}>
          {coordAndLengthText}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 3: DESCRIPCIÓN O NOTAS DEL ELEMENTO
          ────────────────────────────────────────────────────────────────────────── */}
      <textarea
        rows={2}
        value={itemNotes}
        readOnly={!isEditable}
        onChange={(e) => {
          if (isEditable) {
            handleDirectFieldUpdate('notes', e.target.value);
            setIsSaved(false);
          }
        }}
        placeholder="Descripción..."
        style={styles.cleanFieldTextarea}
      />

      {/* ──────────────────────────────────────────────────────────────────────────
          LÍNEA 4 (PIE / METADATOS): ESTADO BOTÁNICO, FOTO Y NAVEGACIÓN
          ────────────────────────────────────────────────────────────────────────── */}
      {(showBotanicalStatus || selectedTarget.photo_url || isNode) && (
        <div style={styles.cardMetaRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {showBotanicalStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Estado:</span>
                <select
                  value={selectedTarget.status || 'saludable'}
                  onChange={(e) => {
                    handleDirectFieldUpdate('status', e.target.value);
                    setIsSaved(false);
                  }}
                  style={{ ...styles.cleanFieldSelect, padding: '3px 6px', fontSize: '0.74rem' }}
                >
                  <option value="saludable">🟢 Saludable</option>
                  <option value="clorosis">🟡 Clorosis</option>
                  <option value="poda_requerida">🟠 Requiere Poda</option>
                  <option value="enfermo">🔴 Enfermo</option>
                  <option value="seco">⚫ Seco / Muerto</option>
                </select>
              </div>
            )}

            {selectedTarget.photo_url && (
              <a
                href={selectedTarget.photo_url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.cardPhotoLink}
                title="Ver fotografía adjunta"
              >
                📷 Ver foto
              </a>
            )}

            {isNode && (
              <button
                type="button"
                onClick={() => {
                  const path = (localPaths || []).find((p) => String(p.id) === String(selectedTarget.pathId));
                  if (path) {
                    setSelectedTarget({
                      type: 'path',
                      id: path.id,
                      title: path.name,
                      category: path.category || PATH_TYPE_LABELS[path.path_type] || 'Caminos y Trazados',
                      path_type: path.path_type,
                      variety_type: path.variety_type,
                      color: path.color,
                      length_meters: path.length_meters,
                      notes: path.notes,
                      coordinates: path.coordinates,
                      raw: path,
                    });
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#00979d',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ⬅️ Ver recorrido completo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
