// src/components/map/MapSelectionCard.jsx
import { useState, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
  getItemCategory,
  getCategoryColor,
  getSubcategoryColor,
  BASE_CATEGORY_MAP,
  getFarmCategories,
  getLocalInventory,
  getSubcategoriesForParent,
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
}) {
  const [isCatMenuOpen, setIsCatMenuOpen] = useState(false);
  const [isSubcatMenuOpen, setIsSubcatMenuOpen] = useState(false);

  // 1. Sugerencias de categorías raíz
  const categorySuggestions = useMemo(() => {
    const fromFarm = getFarmCategories().map((c) => c.name);
    const merged = new Set([
      ...Object.keys(BASE_CATEGORY_MAP),
      ...(fromFarm || []),
      ...(allCategories || []),
      'Caminos y Trazados',
      'Líneas de Riego',
      'Lindes y Límites',
    ]);
    return Array.from(merged).filter(Boolean);
  }, [allCategories]);

  const isPoint = selectedTarget?.type === 'point';
  const isPath = selectedTarget?.type === 'path';
  const isNode = selectedTarget?.type === 'node';
  const isCatastro = selectedTarget?.type === 'catastro';
  const isCoord = selectedTarget?.type === 'coord';
  const isEditable = isPoint || isPath || isNode;

  // Categoría raíz resuelta según tipo
  const resolvedRootCategory = isPoint
    ? (selectedTarget?.category || getItemCategory(selectedTarget) || 'Otros')
    : isPath
      ? (selectedTarget?.category || 'Caminos y Trazados')
      : isNode
        ? (selectedTarget?.category || selectedTarget?.raw?.category || 'Caminos y Trazados')
        : isCatastro
          ? 'Catastro Oficial'
          : 'Punto Satelital';

  const currentCategory = String(resolvedRootCategory || 'Otros');

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

  const isValidSubForCat = subcategorySuggestions.some(
    (s) => s.toLowerCase() === rawSubcategory.trim().toLowerCase()
  );
  const currentSubcategory = isValidSubForCat ? rawSubcategory.trim() : '';

  // 4. Colores oficiales: Categoría raíz + Subcategoría en la misma gama de color (tono pastel más claro)
  const categoryDotColor = getCategoryColor(currentCategory);
  const subcategoryDotColor = getSubcategoryColor(currentCategory, currentSubcategory);

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
  const handleCategoryChange = (newCat) => {
    if (!isEditable) return;
    const validSubs = getSubcategoriesForParent(getLocalInventory(), newCat);
    const stillValid = validSubs.some(
      (s) => s.toLowerCase() === (currentSubcategory || '').trim().toLowerCase()
    );

    handleDirectFieldUpdate('category', newCat);
    if (!stillValid) {
      if (isPoint) {
        handleDirectFieldUpdate('variety_type', '');
      } else {
        handleDirectFieldUpdate('path_type', '');
        handleDirectFieldUpdate('variety_type', '');
      }
    }
    setIsCatMenuOpen(false);
  };

  // Manejador al seleccionar o cambiar subcategoría
  const handleSubcategoryChange = (newSub) => {
    if (!isEditable) return;
    if (isPoint) {
      handleDirectFieldUpdate('variety_type', newSub);
    } else {
      handleDirectFieldUpdate('path_type', newSub);
      handleDirectFieldUpdate('variety_type', newSub);
      handleDirectFieldUpdate('color', getSubcategoryColor(currentCategory, newSub));
    }
    setIsSubcatMenuOpen(false);
  };

  // Manejador de borrado unificado con confirmación para Nodos, Polilíneas y Pines
  const handleDeleteWithConfirm = (e) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    if (!selectedTarget) return;

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
  const itemTitle = isNode
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
              placeholder="Categoría..."
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
                      handleCategoryChange(cat);
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
              placeholder="Subcategoría..."
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
                      handleSubcategoryChange(sub);
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

        {/* Grupo de Acciones: Borrar (a la izquierda de cerrar) + Espacio + Cerrar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 2 }}>
          {isEditable && (
            <button
              type="button"
              onClick={handleDeleteWithConfirm}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '3px 4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              title={
                isNode
                  ? `Eliminar vértice ${(Number(selectedTarget.nodeIndex) || 0) + 1}`
                  : isPath
                    ? 'Eliminar este trazado'
                    : 'Eliminar este elemento'
              }
            >
              <Trash2 size={16} />
            </button>
          )}

          {/* Botón Cerrar ficha */}
          <button
            type="button"
            onClick={() => setSelectedTarget(null)}
            style={{
              ...styles.cardCloseBtn,
              padding: '3px 4px',
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            title="Cerrar ficha"
          >
            <X size={16} />
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
            if (isEditable) handleDirectFieldUpdate('name', e.target.value);
          }}
          placeholder="Título del elemento..."
          style={{
            ...styles.cardTitleInput,
            flex: 1,
            minWidth: 120,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 8,
            backgroundColor: '#f1f5f9',
            border: '1px solid #e2e8f0',
            color: '#475569',
            fontSize: '0.74rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
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
          if (isEditable) handleDirectFieldUpdate('notes', e.target.value);
        }}
        placeholder="Descripción, contenido o notas de inventario..."
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
                  onChange={(e) => handleDirectFieldUpdate('status', e.target.value)}
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
