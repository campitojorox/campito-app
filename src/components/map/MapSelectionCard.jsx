// src/components/map/MapSelectionCard.jsx
import { useState, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { getItemCategory, getCategoryColor, BASE_CATEGORY_MAP } from '../../services/farmInventoryStorage';
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

  const categorySuggestions = useMemo(() => {
    const merged = new Set([...Object.keys(BASE_CATEGORY_MAP), ...(allCategories || [])]);
    return Array.from(merged).filter(Boolean);
  }, [allCategories]);

  if (!selectedTarget) return null;

  const isPoint = selectedTarget.type === 'point';
  const isEditable = isPoint || selectedTarget.type === 'path';
  const currentCategory = String(selectedTarget.category ?? '');
  const resolvedRootCategory = isPoint ? getItemCategory(selectedTarget) : '';
  const categoryDotColor = getCategoryColor(resolvedRootCategory || currentCategory);
  const showBotanicalStatus =
    isPoint && (resolvedRootCategory === 'Árboles' || resolvedRootCategory === 'Plantas');

  const trimmedCat = currentCategory.trim().toLowerCase();
  const isExactSuggestion = categorySuggestions.some((c) => String(c).toLowerCase() === trimmedCat);
  const filteredCategorySuggestions =
    !trimmedCat || isExactSuggestion
      ? categorySuggestions
      : categorySuggestions.filter((c) => String(c).toLowerCase().includes(trimmedCat));

  return (
    <div style={styles.cleanTargetCard}>
      {isPoint ? (
        <div style={styles.cardHeaderRow}>
          <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
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
                onFocus={() => setIsCatMenuOpen(true)}
                onBlur={() => setTimeout(() => setIsCatMenuOpen(false), 120)}
                onChange={(e) => {
                  handleDirectFieldUpdate('category', e.target.value);
                  setIsCatMenuOpen(true);
                }}
                placeholder="Categoría (ej: Árboles, Plantas...)"
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  width: '100%',
                  minWidth: 0,
                  padding: 0,
                  fontFamily: 'inherit',
                }}
                autoComplete="off"
              />
            </div>
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
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.14)',
                  zIndex: 60,
                  maxHeight: 150,
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
                        handleDirectFieldUpdate('category', cat);
                        setIsCatMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
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

          <button
            type="button"
            onClick={() => setSelectedTarget(null)}
            style={styles.cardCloseBtn}
            title="Cerrar ficha"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div style={styles.cardHeaderRow}>
          <input
            type="text"
            value={selectedTarget.name ?? selectedTarget.title ?? ''}
            readOnly={!isEditable}
            onChange={(e) => {
              if (isEditable) handleDirectFieldUpdate('name', e.target.value);
            }}
            placeholder="Título..."
            style={
              isEditable
                ? styles.cardTitleInput
                : { ...styles.cardTitleInput, border: 'none', backgroundColor: 'transparent', padding: 0 }
            }
          />

          <div style={styles.cardHeaderRight}>
            <span style={styles.cardCategoryGray}>
              {selectedTarget.type === 'path'
                ? PATH_TYPE_LABELS[selectedTarget.path_type] || selectedTarget.path_type || 'Recorrido'
                : selectedTarget.type === 'node'
                  ? `Vértice · ${PATH_TYPE_LABELS[selectedTarget.pathType] || 'Recorrido'}`
                  : selectedTarget.type === 'catastro'
                    ? 'Catastro Oficial'
                    : 'Punto Satelital'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedTarget(null)}
              style={styles.cardCloseBtn}
              title="Cerrar ficha"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {isPoint && (
        <div style={styles.cardBodyColumn}>
          <div style={styles.cardFieldsRow}>
            <input
              type="text"
              value={selectedTarget.name ?? selectedTarget.title ?? ''}
              onChange={(e) => handleDirectFieldUpdate('name', e.target.value)}
              placeholder="Título..."
              style={styles.cardTitleInput}
            />

            <input
              type="text"
              value={selectedTarget.variety_type ?? selectedTarget.variety ?? ''}
              onChange={(e) => handleDirectFieldUpdate('variety_type', e.target.value)}
              placeholder="Subtipo / Variedad (ej: Hass, Gotero 4L, 16mm)..."
              style={styles.cleanFieldInput}
            />
          </div>

          {showBotanicalStatus && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 10,
                marginLeft: 4,
                borderLeft: `2px solid ${getCategoryColor(resolvedRootCategory)}`,
              }}
            >
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                Estado ({resolvedRootCategory}):
              </span>
              <select
                value={selectedTarget.status || 'saludable'}
                onChange={(e) => handleDirectFieldUpdate('status', e.target.value)}
                style={{ ...styles.cleanFieldSelect, flex: 1 }}
              >
                <option value="saludable">🟢 Saludable</option>
                <option value="clorosis">🟡 Clorosis</option>
                <option value="poda_requerida">🟠 Requiere Poda</option>
                <option value="enfermo">🔴 Enfermo</option>
                <option value="seco">⚫ Seco / Muerto</option>
              </select>
            </div>
          )}

          <textarea
            rows={2}
            value={selectedTarget.notes || ''}
            onChange={(e) => handleDirectFieldUpdate('notes', e.target.value)}
            placeholder="Definición, contenido o notas de inventario..."
            style={styles.cleanFieldTextarea}
          />

          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              📍 {Number(selectedTarget.lat || 0).toFixed(5)}, {Number(selectedTarget.lng || 0).toFixed(5)}
              {selectedTarget.accuracy ? ` · ±${Number(selectedTarget.accuracy || 0).toFixed(1)}m` : ''}
            </span>
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
            <button
              type="button"
              onClick={handleDeleteTarget}
              style={styles.cardTrashBtn}
              title="Eliminar este punto del inventario"
            >
              <Trash2 size={13} color="#94a3b8" />
            </button>
          </div>
        </div>
      )}

      {selectedTarget.type === 'path' && (
        <div style={styles.cardBodyColumn}>
          <div style={styles.cardFieldsRow}>
            <select
              value={selectedTarget.path_type || 'sendero'}
              onChange={(e) => handleDirectFieldUpdate('path_type', e.target.value)}
              style={{ ...styles.cleanFieldSelect, flex: 1 }}
            >
              <option value="sendero">Sendero peatonal</option>
              <option value="carril">Carril agrícola</option>
              <option value="camino">Camino principal</option>
              <option value="vereda">Vereda</option>
              <option value="acequia">Acequia / Canal</option>
              <option value="linea_riego">Línea de Riego</option>
              <option value="linde">Linde</option>
              <option value="otro">Otro trazado</option>
            </select>
            <span style={styles.cardLengthBadge}>
              📏 {Math.round(selectedTarget.length_meters || 0)} m
            </span>
          </div>

          <textarea
            rows={2}
            value={selectedTarget.notes || ''}
            onChange={(e) => handleDirectFieldUpdate('notes', e.target.value)}
            placeholder="Definición del recorrido, firme, acceso o contenido..."
            style={styles.cleanFieldTextarea}
          />

          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              📍 {selectedTarget.coordinates?.length || 0} nodos interactivos (arrástralos en el satélite)
            </span>
            <button
              type="button"
              onClick={handleDeleteTarget}
              style={styles.cardTrashBtn}
              title="Eliminar este recorrido"
            >
              <Trash2 size={13} color="#94a3b8" />
            </button>
          </div>
        </div>
      )}

      {selectedTarget.type === 'node' && (
        <div style={styles.cardBodyColumn}>
          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              Recorrido: <b>{selectedTarget.pathName || 'Sendero'}</b> (Nodo {Number(selectedTarget.nodeIndex ?? 0) + 1} de{' '}
              {selectedTarget.totalNodes || '?'})
            </span>
          </div>
          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              📍 Posición: {Number(selectedTarget.lat || 0).toFixed(5)}, {Number(selectedTarget.lng || 0).toFixed(5)}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#00979d', fontStyle: 'italic' }}>
              Arrastra el nodo en el satélite para ajustar el trazado
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                const path = (localPaths || []).find((p) => String(p.id) === String(selectedTarget.pathId));
                if (path) {
                  setSelectedTarget({
                    type: 'path',
                    id: path.id,
                    title: path.name,
                    path_type: path.path_type,
                    color: path.color,
                    length_meters: path.length_meters,
                    notes: path.notes,
                    coordinates: path.coordinates,
                    raw: path,
                  });
                }
              }}
              style={styles.cleanLinkBtn}
            >
              ⬅️ Ver recorrido completo
            </button>
            {selectedTarget.totalNodes > 2 && (
              <button
                type="button"
                onClick={() => handleDeleteNode(selectedTarget.pathId, selectedTarget.nodeIndex)}
                style={styles.cardTrashBtn}
                title="Eliminar este vértice"
              >
                <Trash2 size={13} color="#ef4444" />
                <span style={{ fontSize: '0.72rem', color: '#ef4444', marginLeft: 4 }}>Quitar nodo</span>
              </button>
            )}
          </div>
        </div>
      )}

      {selectedTarget.type === 'catastro' && (
        <div style={styles.cardBodyColumn}>
          <span style={styles.cardMetaText}>
            {selectedTarget.subtitle || 'Linde catastral oficial de Campito Jorox (Parcela 195/196)'}
          </span>
          {selectedTarget.notes && (
            <span style={{ fontSize: '0.76rem', color: '#64748b' }}>"{selectedTarget.notes}"</span>
          )}
          {selectedTarget.lat && selectedTarget.lng && (
            <span style={styles.cardMetaText}>
              📍 Coordenadas oficiales: {Number(selectedTarget.lat || 0).toFixed(5)},{' '}
              {Number(selectedTarget.lng || 0).toFixed(5)}
            </span>
          )}
        </div>
      )}

      {selectedTarget.type === 'coord' && (
        <div style={styles.cardBodyColumn}>
          <span style={styles.cardMetaText}>
            📍 Coordenada satelital: {Number(selectedTarget.lat || 0).toFixed(5)},{' '}
            {Number(selectedTarget.lng || 0).toFixed(5)}
          </span>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Habla por voz o escribe en el chat para registrar un nuevo árbol, arqueta o elemento en esta ubicación exacta.
          </span>
        </div>
      )}
    </div>
  );
}

