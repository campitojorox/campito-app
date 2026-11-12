// src/pages/chat/ChatInfoModal.jsx
import {
  Info,
  X,
  Lock,
  ShieldCheck,
  Zap,
  Brain,
  MapPin,
  Map,
  FileSpreadsheet,
  Download,
  Layers,
} from 'lucide-react';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
} from '../../utils/exportTools';
import { styles } from './chatIaStyles';

export default function ChatInfoModal({
  isOpen,
  onClose,
  farmKnowledge,
  farmInventory,
  setIsInventoryMapOpen,
  setMessages,
  activeServer,
}) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={18} color="#00979d" />
            <p style={styles.modalTitle}>Confidencialidad y Uso del Asistente</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            aria-label="Cerrar modal de información"
          >
            <X size={18} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f0fdfa',
              borderRadius: 10,
              border: '1px solid #ccfbf1',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0f766e', fontWeight: 700, fontSize: '0.85rem' }}>
              <Lock size={15} color="#00979d" />
              <span>1. Confidencialidad Absoluta</span>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#134e4a', margin: 0, lineHeight: 1.45 }}>
              Toda la información subida a este chat (textos, facturas, transacciones, contabilidad, fotos de la finca, audios y documentos) es <b>estrictamente confidencial y privada</b> de los administradores de Campito Jorox.
            </p>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e293b', fontWeight: 700, fontSize: '0.85rem' }}>
              <ShieldCheck size={15} color="#00979d" />
              <span>2. Privacidad Blindada y Exportación Completa (PDF, Excel, KML)</span>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#475569', margin: 0, lineHeight: 1.45 }}>
              <b>Privacidad absoluta hacia el exterior:</b> Ningún dato, balance, foto o grabación se comparte ni sincroniza con redes públicas o terceros externos; el asistente opera en un circuito cerrado y seguro exclusivamente para Campito Jorox.
            </p>
            <p style={{ fontSize: '0.76rem', color: '#0f766e', margin: 0, lineHeight: 1.45, fontWeight: 600 }}>
              📥 <b>Exportación total para ti:</b> Tienes plena libertad para solicitar a la IA y descargar en cualquier momento tus inventarios, recopilaciones y balances en <b>PDF, EXCEL, KML (Google My Maps) y GeoJSON</b> con un solo clic.
            </p>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e293b', fontWeight: 700, fontSize: '0.85rem' }}>
              <Zap size={15} color="#f59e0b" />
              <span>3. Capacidades del Cerebro IA Unificado</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
              <li>
                <b>🛣️ Edición y Control de Caminos:</b> Puedes cambiar el trazado, color, nombre o coordenadas de cualquier pista o tubería de la sección Mapas directamente desde este chat.
              </li>
              <li>
                <b>📐 Planos Técnicos y Croquis Vectoriales (SVG):</b> Pídele planos acotados en metros de bancales o goteros y visualízalos con visor interactivo (zoom, descarga e impresión).
              </li>
              <li>
                <b>📊 Diagramas y Esquemas Mermaid:</b> Genera circuitos hidráulicos de riego, diagramas de flujo y calendarios de labores agrícolas.
              </li>
              <li>
                <b>👁️ Diagnóstico Fitosanitario y OCR:</b> Análisis visual de hojas y plagas en fotos, OCR de facturas de abono y lectura de contadores de agua.
              </li>
              <li>
                <b>🛠️ Creador de Nuevas Herramientas (Meta-Tool):</b> Pídele a la IA inventar herramientas de cálculo personalizadas; quedarán guardadas para todos los usuarios.
              </li>
              <li>
                <b>📅 Calendario y Riego en Vivo:</b> Consulta turnos (La Nana, El Moro), horarios y responsables con sincronización directa a la base de datos.
              </li>
              <li>
                <b>💰 Contabilidad y Balances Reales:</b> Consulta gastos, ventas, balance neto y liquidaciones individuales sin inventar cifras.
              </li>
              <li>
                <b>👥 Colaboración Multi-Usuario:</b> Todos los usuarios registrados tienen acceso total y equitativo con sincronización instantánea en tiempo real.
              </li>
              <li>
                <b>🎙️ Micrófono Unificado con GPS:</b> Dicta consultas o inventaría árboles y caminos mientras caminas con telemetría GPS continua.
              </li>
            </ul>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#f0fdf4',
              borderRadius: 10,
              border: '1px solid #bbf7d0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 700, fontSize: '0.85rem' }}>
                <Brain size={16} color="#16a34a" />
                <span>4. Memoria y Aprendizaje Permanente (Nativo)</span>
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 10 }}>
                {farmKnowledge.length} hechos grabados
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#14532d', margin: 0, lineHeight: 1.45 }}>
              La IA no requiere botones adicionales: aprende de forma completamente natural en el chat. Almacena cada regla en <b>memoria híbrida (local y base de datos permanente)</b>:
            </p>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #dcfce7', fontSize: '0.72rem', color: '#166534', fontFamily: 'monospace' }}>
              💡 <i>"Recuerda que la electroválvula del sector 2 riega 40 min los martes"</i>
              <br />
              💡 <i>"Aprende que la dosis de quelato de hierro es 50g por árbol en primavera"</i>
            </div>
            <p style={{ fontSize: '0.73rem', color: '#15803d', margin: 0, lineHeight: 1.4 }}>
              El asistente retendrá esa regla permanentemente y la aplicará en todas las sesiones. Puedes preguntarle en cualquier momento: <i>"¿Qué cosas recuerdas de la finca?"</i>.
            </p>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#f0f9ff',
              borderRadius: 10,
              border: '1px solid #bae6fd',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1', fontWeight: 700, fontSize: '0.85rem' }}>
                <MapPin size={16} color="#0284c7" />
                <span>5. Catastro Satélite GPS y Descargas (PDF / Excel / KML / GeoJSON)</span>
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0284c7', padding: '1px 8px', borderRadius: 10 }}>
                {farmInventory.length} puntos mapeados
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#075985', margin: 0, lineHeight: 1.45 }}>
              Mapea árboles, arquetas y tuberías caminando por la finca con el micrófono unificado, o visualiza y traza caminos interactivos con cálculo métrico en el mapa satélite:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
              <button
                onClick={() => {
                  onClose();
                  setIsInventoryMapOpen(true);
                }}
                style={{
                  padding: '7px 8px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Map size={13} />
                Ver Mapa / Catastro
              </button>

              <button
                onClick={() => exportInventoryToExcel(farmInventory)}
                disabled={farmInventory.length === 0}
                style={{
                  padding: '7px 8px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: farmInventory.length === 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <FileSpreadsheet size={13} />
                Descargar Excel
              </button>

              <button
                onClick={() => exportInventoryToPDF(farmInventory)}
                disabled={farmInventory.length === 0}
                style={{
                  padding: '7px 8px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: farmInventory.length === 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Download size={13} />
                Descargar PDF
              </button>

              <button
                onClick={() => exportInventoryToKML(farmInventory)}
                disabled={farmInventory.length === 0}
                style={{
                  padding: '7px 8px',
                  backgroundColor: '#475569',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: farmInventory.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: farmInventory.length === 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Layers size={13} />
                Capa KML (My Maps)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => {
                onClose();
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: `### 🌿 Guía Operativa, Privacidad y Capacidades del Asistente IA · Campito Jorox\n\n**1. 🔒 Privacidad y Confidencialidad Blindada:**\n- Todos los datos (contabilidad, calendario, facturas, audios, análisis de suelo y catastro) son estrictamente privados de los administradores de Campito Jorox.\n- No se comparten ni sincronizan con terceros ni redes externas.\n\n**2. 📅 Calendario y Riego en Vivo:**\n- Consulta en tiempo real turnos de riego (*La Nana*, *El Moro*), horas de inicio y fin, fechas y asignados.\n- Puedes pedirle directamente: *"¿Qué riego tenemos el sábado?"* o programar turnos: *"Crea un turno de riego para mañana de 8 a 10 con Carlos"*.\n\n**3. 💰 Contabilidad y Balances Reales:**\n- Consulta en vivo gastos, ventas, saldo neto y cuentas individuales de cada socio (*Ariel*, *Carlos*).\n- Apunta movimientos al vuelo: *"Apunta un gasto de 45€ en abono foliar"* y la IA lo registrará en la base de datos.\n\n**4. 🎙️ Micrófono Unificado con Telemetría GPS Continua:**\n- Un solo botón de micrófono para todo: hacer preguntas, dictar gastos o inventariar árboles mientras caminas por la finca.\n- Muestrea tu posición GPS cada 1.5s e interpola la ubicación exacta de cada árbol o arqueta descrita durante el paseo.\n\n**5. 🧠 Memoria y Aprendizaje Permanente Nativo:**\n- Enseña reglas sin botones ni menús: solo dile *"Recuerda que..."* o *"Aprende que..."*.\n- Se guarda de forma híbrida e instantánea en la memoria de tu dispositivo y en la base de datos permanente.\n- Pregunta en cualquier momento: *"¿Qué cosas recuerdas de la finca?"*.\n\n**6. 📎 Botón '+' Multiformato:**\n- Sube análisis de suelo o foliares en PDF, fotos de hojas con posibles plagas, albaranes o archivos Excel/CSV para alimentar el conocimiento del asistente.\n\n**7. 🗺️ Catastro Satélite y Descargas:**\n- Visualiza árboles geolocalizados por colores, traza caminos y calcula sus metros.\n- Descarga tus informes en **PDF**, **Excel**, **KML (Google My Maps)** y **GeoJSON** con un solo clic.\n\n**8. ⚡ Cascada Inteligente de Modelos IA:**\n- Conectado a los modelos más avanzados de Gemini (Pro y Flash) con conmutación automática ante saturación de cuota.`,
                    serverUsed: activeServer,
                  },
                ]);
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #00979d',
                backgroundColor: '#ffffff',
                color: '#00979d',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Pegar guía en el chat
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#00979d',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

