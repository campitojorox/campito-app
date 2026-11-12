// src/components/map/MapInfoModal.jsx
import { Info, X, Compass, Sparkles, Bot, Layers } from 'lucide-react';
import { styles } from './mapStyles';

export default function MapInfoModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.infoModalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.infoModalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={styles.infoModalIconBadge}>
              <Info size={18} color="#ffffff" />
            </div>
            <div>
              <h3 style={styles.infoModalTitle}>Mapa Satelital de Campito Jorox</h3>
              <p style={styles.infoModalSubtitle}>Catastro georreferenciado e interacción con Chat IA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={styles.infoModalBody}>
          <div style={styles.infoBlock}>
            <div style={styles.infoBlockTitle}>
              <Compass size={15} color="#00979d" />
              <span>¿Qué es este mapa?</span>
            </div>
            <p style={styles.infoBlockText}>
              Es el visor satelital georreferenciado oficial de <b>Campito Jorox</b> (Parcelas 195 y 196). Muestra en tiempo real todos los árboles, plantas, infraestructura hídrica (arquetas, llaves de agua, goteros, filtros, tuberías), edificios y caminos registrados en la base de datos de la finca.
            </p>
          </div>

          <div style={styles.infoBlockHighlight}>
            <div style={{ ...styles.infoBlockTitle, color: '#0f766e' }}>
              <Sparkles size={16} color="#00979d" />
              <span>Edición y Creación de Elementos con Agente IA</span>
            </div>
            <p style={styles.infoBlockText}>
              Puedes interactuar y ordenar acciones directamente al agente IA tocando cualquier coordenada o elemento en el satélite:
            </p>
            <ul style={styles.infoList}>
              <li>
                <b>📍 Crear nuevos puntos tocando el mapa:</b> Haz clic en cualquier lugar de la finca para fijar una coordenada. En el módulo inferior integrado, escribe o dicta por voz qué elemento es:
                <div style={styles.exampleBubble}>
                  "Aquí tenemos un aguacate Hass" · "Añade una arqueta con llave de 25mm" · "Coloca una caseta de aperos"
                </div>
                El agente IA interpretará automáticamente la categoría, variedad y propiedades técnicas y creará el nuevo punto georreferenciado.
              </li>
              <li>
                <b>✏️ Editar y redefinir elementos existentes:</b> Toca cualquier árbol, arqueta, mojón de cota catastral o linde para seleccionarlo. En su módulo inferior de IA puedes ordenar cambios directos:
                <div style={styles.exampleBubble}>
                  "Cambia su estado a poda requerida" · "Renombra a Olivo Picual 4" · "Añade nota: gotero reparado con manguera de 16mm"
                </div>
              </li>
              <li>
                <b>📷 Vincular fotos o documentos:</b> Pulsa el botón <b>(+)</b> o el icono de <b>cámara</b> en la barra del elemento para adjuntar una imagen o documento PDF y pídele a la IA:
                <div style={styles.exampleBubble}>
                  "Vincula esta foto del árbol y anota que muestra la floración"
                </div>
              </li>
              <li>
                <b>↩️ Deshacer cambios al instante:</b> Si te equivocas o deseas revertir una orden, pulsa el botón de retroceso <b>(↩️)</b> para restaurar el estado anterior al momento.
              </li>
            </ul>
          </div>

          <div style={styles.infoBlock}>
            <div style={styles.infoBlockTitle}>
              <Bot size={15} color="#00979d" />
              <span>Registro en Terreno con GPS (Chat IA)</span>
            </div>
            <p style={styles.infoBlockText}>
              También puedes abrir la sección <b>Chat IA</b> mientras caminas por la finca: al dictar por voz con el micrófono, la app captura automáticamente tu posición satelital y ubica el objeto en sus coordenadas reales.
            </p>
          </div>

          <div style={styles.infoBlock}>
            <div style={styles.infoBlockTitle}>
              <Layers size={15} color="#00979d" />
              <span>Herramientas del Visor</span>
            </div>
            <ul style={styles.infoList}>
              <li><b>🔍 Buscador:</b> Localiza al instante cualquier árbol, arqueta, llave o nota técnica.</li>
              <li><b>⚙️ Filtros:</b> Activa o desactiva categorías completas, subcategorías, trazados y el catastro oficial.</li>
              <li><b>📑 Capas:</b> Activa o desactiva la leyenda y referencias, así como los controles de navegación y centrado GPS.</li>
              <li><b>🖨️ PDF:</b> Genera un informe descargable e imprimible con exactamente lo que tienes visible en pantalla.</li>
            </ul>
          </div>
        </div>

        <div style={styles.infoModalFooter}>
          <button onClick={onClose} style={styles.infoModalBtn}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

