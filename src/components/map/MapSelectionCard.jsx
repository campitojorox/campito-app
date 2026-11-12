// src/components/map/MapSelectionCard.jsx
import { X, Trash2 } from 'lucide-react';
import { PATH_TYPE_LABELS } from './mapUtils';
import { styles } from './mapStyles';

export default function MapSelectionCard({
  selectedTarget,
  setSelectedTarget,
  localPaths,
  handleDirectFieldUpdate,
  handleDeleteTarget,
  handleDeleteNode,
}) {
  if (!selectedTarget) return null;

  return (
    <div style={styles.cleanTargetCard}>
      <div style={styles.cardHeaderRow}>
        <input
          type="text"
          value={selectedTarget.title || selectedTarget.name || ''}
          onChange={(e) => handleDirectFieldUpdate('name', e.target.value)}
          placeholder="Título..."
          style={styles.cardTitleInput}
        />

        <div style={styles.cardHeaderRight}>
          <span style={styles.cardCategoryGray}>
            {selectedTarget.type === 'point'
              ? selectedTarget.category || 'Inventario'
              : selectedTarget.type === 'path'
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

      {selectedTarget.type === 'point' && (
        <div style={styles.cardBodyColumn}>
          <div style={styles.cardFieldsRow}>
            <input
              type="text"
              value={selectedTarget.variety || selectedTarget.variety_type || ''}
              onChange={(e) => handleDirectFieldUpdate('variety_type', e.target.value)}
              placeholder="Subtipo / Variedad (ej: Hass, Gotero 4L, 16mm)..."
              style={styles.cleanFieldInput}
            />
            <select
              value={selectedTarget.status || 'saludable'}
              onChange={(e) => handleDirectFieldUpdate('status', e.target.value)}
              style={styles.cleanFieldSelect}
            >
              <option value="saludable">🟢 Saludable</option>
              <option value="clorosis">🟡 Clorosis</option>
              <option value="poda_requerida">🟠 Requiere Poda</option>
              <option value="enfermo">🔴 Enfermo</option>
              <option value="seco">⚫ Seco / Muerto</option>
            </select>
          </div>

          <textarea
            rows={2}
            value={selectedTarget.notes || ''}
            onChange={(e) => handleDirectFieldUpdate('notes', e.target.value)}
            placeholder="Definición, contenido o notas de inventario..."
            style={styles.cleanFieldTextarea}
          />

          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              📍 {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
              {selectedTarget.accuracy ? ` · ±${Number(selectedTarget.accuracy).toFixed(1)}m` : ''}
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
              Recorrido: <b>{selectedTarget.pathName}</b> (Nodo {selectedTarget.nodeIndex + 1} de{' '}
              {selectedTarget.totalNodes})
            </span>
          </div>
          <div style={styles.cardMetaRow}>
            <span style={styles.cardMetaText}>
              📍 Posición: {Number(selectedTarget.lat).toFixed(5)}, {Number(selectedTarget.lng).toFixed(5)}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#00979d', fontStyle: 'italic' }}>
              Arrastra el nodo en el satélite para ajustar el trazado
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                const path = localPaths.find((p) => String(p.id) === String(selectedTarget.pathId));
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
              📍 Coordenadas oficiales: {Number(selectedTarget.lat).toFixed(5)},{' '}
              {Number(selectedTarget.lng).toFixed(5)}
            </span>
          )}
        </div>
      )}

      {selectedTarget.type === 'coord' && (
        <div style={styles.cardBodyColumn}>
          <span style={styles.cardMetaText}>
            📍 Coordenada satelital: {Number(selectedTarget.lat).toFixed(5)},{' '}
            {Number(selectedTarget.lng).toFixed(5)}
          </span>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Habla por voz o escribe en el chat para registrar un nuevo árbol, arqueta o elemento en esta ubicación exacta.
          </span>
        </div>
      )}
    </div>
  );
}

