// src/pages/chat/ChatInfoModal.jsx
import { useState } from 'react';
import {
  Info,
  X,
  Lock,
  Zap,
  Brain,
  MapPin,
  Map,
  FileSpreadsheet,
  Download,
  Layers,
  Folder,
  Mic,
  Calendar,
  DollarSign,
  Camera,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
} from '../../utils/exportTools';

const featureBoxStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 10px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const featureTitleStyle = {
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#0f172a',
  display: 'block',
  marginBottom: 2,
};

const featureDescStyle = {
  fontSize: '0.72rem',
  color: '#475569',
  margin: 0,
  lineHeight: 1.35,
};

const actionBtnStyle = (bgColor, disabled = false) => ({
  padding: '7px 8px',
  backgroundColor: bgColor,
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
});

export default function ChatInfoModal({
  isOpen,
  onClose,
  inline = false,
  farmKnowledge = [],
  farmInventory = [],
  setIsInventoryMapOpen,
  setMessages,
  activeServer,
}) {
  const [copiedGuide, setCopiedGuide] = useState(false);

  if (!isOpen) return null;

  const handlePasteGuideToChat = () => {
    if (setMessages) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `### 🌿 Guía y Virtudes del Asistente IA · Campito Jorox

**1. 🔒 Privacidad Blindada:**
- Información confidencial y privada exclusiva de los administradores. Operación en circuito cerrado sin compartir datos con terceros.

**2. 📁 Explorador y Memoria de Archivos (RAG):**
- Sube y consulta KML, KMZ, GeoJSON, PDF, CSV, Excel y fotos centralizados y accesibles desde cualquier móvil u ordenador.

**3. 🎙️ Dictado de Campo con GPS:**
- Graba notas de voz caminando por la finca con telemetría GPS continua para georreferenciar árboles y arquetas al vuelo.

**4. 🗺️ Mapas:**
- Registra, edita, clasifica puntos, recorridos y categorías botánicas por lenguaje natural o dictado.

**5. 📅 Calendario:**
- Agenda, eventos, historial y turnos de riego (*La Nana*, *El Moro*) en tiempo real.

**6. 💰 Economía:**
- Apunta, consulta, saldos, gastos, ventas y balances entre socios de la finca.

**7. 👁️ Diagnóstico Botánico y OCR:**
- Análisis visual de fotos de hojas con plagas o clorosis, y OCR de facturas y contadores de agua.

**8. 📐 Croquis Técnicos y Esquemas:**
- Planos acotados en metros de bancales (SVG) y diagramas hidráulicos interactivos (Mermaid).

**9. 🧠 Memoria Permanente:**
- Aprende con frases directas (*"Recuerda que..."* o *"Aprende que..."*) y aplica las reglas en todas las sesiones.

**10. 📥 Exportación Instantánea:**
- Descarga inventarios y balances en **Excel**, **PDF**, **KML (Google My Maps)** y **GeoJSON**.`,
          serverUsed: activeServer,
        },
      ]);
      setCopiedGuide(true);
      setTimeout(() => setCopiedGuide(false), 2200);
      onClose();
    }
  };

  const content = (
    <div
      style={{
        width: '100%',
        maxWidth: inline ? '100%' : '740px',
        maxHeight: inline ? '100%' : '88vh',
        height: inline ? '100%' : undefined,
        backgroundColor: '#ffffff',
        borderRadius: inline ? 0 : '12px',
        boxShadow: inline ? 'none' : '0 20px 40px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: inline ? 'none' : '1px solid #e2e8f0',
        flex: inline ? 1 : undefined,
      }}
    >
      {/* Cabecera compacta */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <Info size={17} color="#00979d" />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
            Guía y Virtudes del Asistente
          </span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
            Campito Jorox
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handlePasteGuideToChat}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#00979d',
              color: '#ffffff',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Pegar resumen completo en el chat"
          >
            {copiedGuide ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedGuide ? 'Pegada' : 'Pegar en chat'}</span>
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={inline ? 'Volver a la conversación del chat' : 'Cerrar'}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Contenido scrolleable simplificado */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* 1. Privacidad */}
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: '#ffffff',
            borderRadius: 10,
            border: '1px solid #ccfbf1',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0f766e', fontWeight: 700, fontSize: '0.82rem' }}>
            <Lock size={15} color="#00979d" />
            <span>1. Privacidad y Confidencialidad Blindada</span>
          </div>
          <p style={{ fontSize: '0.74rem', color: '#134e4a', margin: 0, lineHeight: 1.45 }}>
            Toda la información (mensajes, facturas, contabilidad, fotos, audios y mapas) es <b>estrictamente privada</b> de los administradores de Campito Jorox. Funciona en circuito cerrado y seguro sin compartir datos con terceros.
          </p>
        </div>

        {/* 2. Virtudes y Capacidades */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0f172a', fontWeight: 700, fontSize: '0.83rem' }}>
            <Zap size={15} color="#f59e0b" />
            <span>2. Virtudes y Nuevas Capacidades</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 8,
            }}
          >
            {/* 1. Explorador Centralizado */}
            <div style={featureBoxStyle}>
              <Folder size={15} color="#00979d" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>📁 Explorador Centralizado de Archivos (RAG)</b>
                <p style={featureDescStyle}>Sube KML, KMZ, GeoJSON, PDF, CSV o Excel accesibles desde cualquier móvil u ordenador. La IA los analiza y consulta en tus preguntas.</p>
              </div>
            </div>

            {/* 2. Dictado de Campo con GPS */}
            <div style={featureBoxStyle}>
              <Mic size={15} color="#0284c7" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>🎙️ Dictado de Campo con Telemetría GPS</b>
                <p style={featureDescStyle}>Habla mientras caminas por la finca: el micrófono interpola tu posición GPS continua para situar árboles, arquetas o notas exactamente donde estás.</p>
              </div>
            </div>

            {/* 3. Control de Mapas */}
            <div style={featureBoxStyle}>
              <Map size={15} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>🗺️ Mapas: Registra, edita, clasifica...</b>
                <p style={featureDescStyle}>Crea y sitúa puntos de inventario, traza senderos con métricas y renombra o asigna categorías botánicas directamente por voz o texto.</p>
              </div>
            </div>

            {/* 4. Riego y Calendario */}
            <div style={featureBoxStyle}>
              <Calendar size={15} color="#0d9488" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>📅 Calendario: Agenda, eventos, historial...</b>
                <p style={featureDescStyle}>Consulta y agenda turnos de riego (*La Nana*, *El Moro*), fechas de labores y registro histórico de actividades agrícolas.</p>
              </div>
            </div>

            {/* 5. Finanzas y Balances */}
            <div style={featureBoxStyle}>
              <DollarSign size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>💰 Economía: Apunta, consulta, saldos...</b>
                <p style={featureDescStyle}>Apunta gastos o ventas al vuelo, consulta saldos netos y cuentas entre socios de la finca.</p>
              </div>
            </div>

            {/* 6. Diagnóstico Fitosanitario y OCR */}
            <div style={featureBoxStyle}>
              <Camera size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>👁️ Diagnóstico Botánico y Lectura OCR</b>
                <p style={featureDescStyle}>Envía fotografías de hojas para diagnosticar clorosis, plagas o podas, y escanea facturas o contadores de agua con OCR automático.</p>
              </div>
            </div>

            {/* 7. Croquis Vectoriales */}
            <div style={featureBoxStyle}>
              <FileCode size={15} color="#7c3aed" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>📐 Planos Técnicos SVG y Circuitos Mermaid</b>
                <p style={featureDescStyle}>Pídele croquis vectoriales acotados en metros de bancales y diagramas hidráulicos interactivos para tuberías y sectores de riego.</p>
              </div>
            </div>

            {/* 8. Exportaciones */}
            <div style={featureBoxStyle}>
              <Download size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={featureTitleStyle}>📥 Exportaciones Totales en 1 Clic</b>
                <p style={featureDescStyle}>Descarga en cualquier momento tus inventarios y balances en Excel, PDF, capas KML para Google My Maps y GeoJSON estándar.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Memoria Permanente */}
        <div
          style={{
            padding: '11px 13px',
            backgroundColor: '#ffffff',
            borderRadius: 10,
            border: '1px solid #bbf7d0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 700, fontSize: '0.82rem' }}>
              <Brain size={16} color="#16a34a" />
              <span>3. Memoria y Aprendizaje Permanente</span>
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 10 }}>
              {farmKnowledge.length} hechos aprendidos
            </span>
          </div>
          <p style={{ fontSize: '0.74rem', color: '#14532d', margin: 0, lineHeight: 1.45 }}>
            La IA aprende de manera natural durante el chat y almacena cada regla en la base de datos permanente:
          </p>
          <div style={{ backgroundColor: '#f0fdf4', padding: '7px 10px', borderRadius: 6, border: '1px solid #dcfce7', fontSize: '0.72rem', color: '#166534', fontFamily: 'monospace' }}>
            💡 <i>"Recuerda que la electroválvula del sector 2 riega 40 min los martes"</i>
            <br />
            💡 <i>"Aprende que la dosis de quelato de hierro es 50g por árbol en primavera"</i>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#15803d', margin: 0 }}>
            Puedes preguntarle en cualquier momento: <i>"¿Qué cosas recuerdas de la finca?"</i>.
          </p>
        </div>

        {/* 4. Catastro Satélite y Descargas */}
        <div
          style={{
            padding: '11px 13px',
            backgroundColor: '#ffffff',
            borderRadius: 10,
            border: '1px solid #bae6fd',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1', fontWeight: 700, fontSize: '0.82rem' }}>
              <MapPin size={16} color="#0284c7" />
              <span>4. Catastro Satélite y Descargas Directas</span>
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0284c7', padding: '1px 8px', borderRadius: 10 }}>
              {farmInventory.length} puntos mapeados
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
            <button
              onClick={() => {
                onClose();
                setIsInventoryMapOpen(true);
              }}
              style={actionBtnStyle('#0284c7')}
            >
              <Map size={13} />
              <span>Ver Mapa</span>
            </button>
            <button
              onClick={() => exportInventoryToExcel(farmInventory)}
              disabled={farmInventory.length === 0}
              style={actionBtnStyle('#059669', farmInventory.length === 0)}
            >
              <FileSpreadsheet size={13} />
              <span>Descargar Excel</span>
            </button>
            <button
              onClick={() => exportInventoryToPDF(farmInventory)}
              disabled={farmInventory.length === 0}
              style={actionBtnStyle('#dc2626', farmInventory.length === 0)}
            >
              <Download size={13} />
              <span>Descargar PDF</span>
            </button>
            <button
              onClick={() => exportInventoryToKML(farmInventory)}
              disabled={farmInventory.length === 0}
              style={actionBtnStyle('#475569', farmInventory.length === 0)}
            >
              <Layers size={13} />
              <span>KML My Maps</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '740px', display: 'flex', justifyContent: 'center' }}>
        {content}
      </div>
    </div>
  );
}
