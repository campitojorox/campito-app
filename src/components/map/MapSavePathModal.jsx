// src/components/map/MapSavePathModal.jsx
import { X } from 'lucide-react';
import { COLOR_PALETTE } from './mapUtils';
import { styles } from './mapStyles';

export default function MapSavePathModal({
  isOpen,
  onClose,
  drawPoints,
  liveDrawDistance,
  newPathData,
  setNewPathData,
  onSave,
}) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: newPathData.color }} />
            <h3 style={styles.modalTitle}>Guardar Camino / Sendero</h3>
          </div>
          <button onClick={onClose} style={styles.modalCloseBtn}>
            <X size={15} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.metricsBox}>
            <span>
              Vértices marcados: <b>{drawPoints.length}</b>
            </span>
            <span>
              Longitud calculada: <b>{liveDrawDistance.toFixed(1)} metros</b>
            </span>
          </div>

          <div>
            <label style={styles.fieldLabel}>Nombre del camino o sendero *</label>
            <input
              type="text"
              placeholder="Ej: Sendero del Aguacate, Camino Entrada..."
              value={newPathData.name}
              onChange={(e) => setNewPathData({ ...newPathData, name: e.target.value })}
              style={styles.inputField}
              autoFocus
            />
          </div>

          <div>
            <label style={styles.fieldLabel}>Tipo de trazado</label>
            <select
              value={newPathData.path_type}
              onChange={(e) => setNewPathData({ ...newPathData, path_type: e.target.value })}
              style={styles.selectField}
            >
              <option value="sendero">Sendero peatonal / de a pie</option>
              <option value="carril">Carril / Camino de rodadura agrícola</option>
              <option value="camino">Camino principal / tractor</option>
              <option value="vereda">Vereda / Paso estrecho</option>
              <option value="acequia">Acequia / Caudal de agua</option>
              <option value="linea_riego">Línea de riego / Tubería</option>
              <option value="linde">Linde o delimitación</option>
              <option value="otro">Otro trazado</option>
            </select>
          </div>

          <div>
            <label style={styles.fieldLabel}>Color de visualización en el mapa</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setNewPathData({ ...newPathData, color: c.hex })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: c.hex,
                    border: newPathData.color === c.hex ? '2.5px solid #0f172a' : '2px solid #ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div>
            <label style={styles.fieldLabel}>Grosor de línea ({newPathData.stroke_width}px)</label>
            <input
              type="range"
              min="2"
              max="8"
              value={newPathData.stroke_width}
              onChange={(e) => setNewPathData({ ...newPathData, stroke_width: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div>
            <label style={styles.fieldLabel}>Notas u observaciones</label>
            <textarea
              placeholder="Detalles sobre firme, pendiente, tipo de manguera..."
              value={newPathData.notes}
              onChange={(e) => setNewPathData({ ...newPathData, notes: e.target.value })}
              style={{ ...styles.inputField, height: 60, resize: 'none' }}
            />
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button onClick={onClose} style={styles.cancelBtn}>
            Cancelar
          </button>
          <button onClick={onSave} style={styles.submitBtn}>
            Guardar en Campito Jorox
          </button>
        </div>
      </div>
    </div>
  );
}

