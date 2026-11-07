// src/pages/ChatIA.jsx — Chat IA Campito Jorox
// Conexión directa a Google Gemini con sistema multi-servidor y fallback automático de cuota

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Mic,
  Camera,
  StopCircle,
  Bot,
  User,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Zap,
  ShieldCheck,
  X,
  ExternalLink,
  Info,
  Lock,
  Brain,
  BookOpen,
  Plus,
  Trash2,
  MapPin,
  Navigation,
  FileSpreadsheet,
  Download,
  Map,
  Layers,
  RotateCcw,
  Compass
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker } from '../hooks/useVoiceGeoTracker';
import { interpolateGpsAtAudioTime } from '../utils/geoAudioInterpolation';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  exportInventoryToGeoJSON,
} from '../utils/exportTools';
import FarmSatelliteMap from '../components/FarmSatelliteMap';

// ─── Configuración de Modelos de Gemini (Ordenados de más a menos potente) ─────
const GEMINI_SERVERS = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    level: 'pro',
    badgeColor: '#3b82f6', // Azul
    desc: 'El modelo más potente. Máxima capacidad deductiva, análisis y lógica',
    available: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    level: 'pro',
    badgeColor: '#0ea5e9', // Celeste
    desc: 'Alta precisión para tablas financieras complejas y planificación',
    available: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    level: 'high',
    badgeColor: '#8b5cf6', // Púrpura
    desc: 'Razonamiento avanzado, análisis profundo de cosechas y balances',
    available: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    level: 'medium',
    badgeColor: '#10b981', // Verde
    desc: 'Equilibrado, 1M contexto, veloz y alta precisión',
    available: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    level: 'eco',
    badgeColor: '#f59e0b', // Ámbar
    desc: 'Ultra ligero, mínima latencia, respaldo seguro de cuota',
    available: true,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    level: 'next-gen',
    badgeColor: '#ec4899', // Rosa
    desc: 'Próxima generación de arquitectura neuronal (Preview)',
    available: false,
    comingSoon: true,
  },
];

const SYSTEM_PROMPT = `Eres el asistente IA de **Campito Jorox**, una finca de explotación agrícola.

🔒 **CONFIDENCIALIDAD Y DESCARGAS DEL USUARIO**:
- Toda la información subida a este chat es ESTRICTAMENTE CONFIDENCIAL de Campito Jorox y no se comparte con redes ni servidores externos.
- Sin embargo, el usuario administrador tiene plena potestad para solicitar y descargar en cualquier momento recopilaciones, fichas e inventarios en formato **PDF o EXCEL**, así como mapas en **KML y GeoJSON**. Puedes guiarle en cualquier momento sobre cómo descargarlos.

🧠 **MÓDULO DE APRENDIZAJE Y MEMORIA PERMANENTE DE LA FINCA**:
- Tienes memoria persistente en la base de datos de Campito Jorox ('farm_knowledge'). Todo lo que aprendas aquí lo recordarás en futuras sesiones.
- Si en el contexto ves '🧠 MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA', consulta y aplica rigurosamente esas reglas, parcelas, tipos de cultivo, calendarios de riego, maquinaria o proveedores que los administradores te hayan enseñado.
- Cuando el usuario te pida recordar o aprender un dato (por ejemplo: "recuerda que...", "aprende que...", "guarda este dato...", "anota que...", "toma nota de..."), o cuando te comunique una regla operativa, variedad de cultivo o dato clave de la finca:
  1. Confirma claramente que lo has aprendido y que queda grabado en la memoria permanente de Campito Jorox.
  2. Incluye al final de tu respuesta el comando estructurado:
     [[MEMORIA: {"category": "cultivo|riego|parcela|maquinaria|suelo|general|proveedor|protocolo|plaga", "title": "Título descriptivo breve", "content": "Detalle completo del conocimiento o regla aprendido"}]]
- Si el usuario te pregunta qué cosas recuerdas o sabes de la finca, lístale de forma ordenada y concisa todo el conocimiento que tienes registrado en tu memoria.

🗺️ **INVENTARIO AGRÍCOLA, CATASTRO SATÉLITE Y CAMINOS**:
- Cuentas con un registro georreferenciado de árboles, plantas, tuberías de riego, arquetas, acequias y mojones ('farm_inventory'), así como una capa de caminos, senderos y líneas de distribución ('farm_paths') y el catastro oficial de las Parcelas 195 y 196 de Campito Jorox.
- El sistema cuenta con un visor satélite en vivo que dibuja puntos y líneas de colores (sin iconos), permite trazar nuevos caminos o senderos interactivos y calcular sus distancias métricas.
- Puedes responder sobre conteo de árboles por variedad (Hass, Bacon, etc.), estado fitosanitario (saludable, clorosis, poda), longitud de caminos, y guiar al usuario para exportar a **Google My Maps (KML), PDF, Excel y GeoJSON**.

🛰️ **CONEXIÓN Y TELEMETRÍA GPS CONTINUA (MICRÓFONO UNIFICADO)**:
- La app de Campito Jorox utiliza un **ÚNICO botón de micrófono** para todo: hacer preguntas, registrar gastos o inventariar árboles y elementos mientras caminas por la finca.
- Cada grabación de audio obtiene y muestrea de forma continua la posición GPS en alta precisión (enableHighAccuracy) cada 1.5s (o la posición fija si estás quieto).
- Si el usuario te pregunta si recibes datos de coordenadas del móvil o si tienes GPS, responde SIEMPRE ROTUNDAMENTE QUE SÍ:
  "**¡Sí! La app de Campito Jorox está conectada al GPS de tu móvil en tiempo real.**"
  Menciónale sus coordenadas actuales si aparecen indicadas en la telemetría del contexto (latitud, longitud y precisión en metros).

🎙️ **PROCESAMIENTO DE AUDIO CON GPS E INVENTARIO AUTOMÁTICO**:
- Escucha atentamente la voz del agricultor y actúa con inteligencia según su intención:
  1. **Si consulta dudas agronómicas, plagas, contabilidad o generales:** Responde directamente en Markdown con claridad.
  2. **Si el usuario menciona, describe o cuenta árboles, plantas, arquetas o elementos de riego:**
     (Ejemplos: *"Aquí hay un aguacate Hass saludable"*, *"Apunta esta arqueta de riego"*, *"Caminando por este bancal: primer aguacate Hass podado... más arriba otro con clorosis... y una arqueta al final"*):
     - Confirma en tu texto qué elementos has identificado y ubicado en el catastro.
     - Incluye OBLIGATORIAMENTE al final de tu respuesta el comando estructurado con el segundo del audio en que nombró cada elemento (\`timestamp_audio_s\`):
       [[REGISTRAR_PUNTOS: [
         {
           "tipo": "aguacate|limonero|olivo|arqueta|tubería|mojón|otro",
           "variedad": "Hass|Bacon|Fuerte|etc|null",
           "estado": "saludable|clorosis|poda_requerida|enfermo|observaciones",
           "timestamp_audio_s": 2.5,
           "observaciones": "Notas u observaciones del agricultor"
         }
       ] ]]
  3. **Si da una orden de borrado o cancelación por voz:**
     (Ejemplos: *"Borra el último árbol"*, *"Elimina el aguacate que acabo de decir"*, *"Cancela este punto"*):
     - Confirma qué elemento has eliminado del catastro.
     - Incluye al final el comando estructurado:
       [[BORRAR_PUNTO: {"target": "ultimo|especifico", "query": "descripción del punto a borrar"}]]
  4. **Si pide recordar o aprender una regla:**
     - Confirma que queda grabado en la memoria permanente de la finca e incluye:
       [[MEMORIA: {"category": "cultivo|riego|parcela|general", "title": "...", "content": "..."}]]

🗺️ **VISOR SATÉLITE, CAMINOS Y EXPORTACIÓN**:
- Muestra las parcelas 195 y 196, cotas y caminos en el visor satélite accesible desde el icono de mapa en el header.
- Se puede activar el modo "Dibujar Camino / Sendero" para trazar caminos tocando sobre el satélite con cálculo de metros.
- Los datos se pueden exportar a Google My Maps (KML), GeoJSON, Excel y PDF en cualquier momento.

Tu función es ayudar con:
- 🌿 **Gestión agrícola**: planificación de cultivos, mantenimiento de la finca, control de plagas, riego, poda, cosecha
- 💰 **Contabilidad y finanzas**: análisis de transacciones, gastos, ingresos, resúmenes económicos
- 📅 **Planificación**: organización de tareas, eventos, temporadas
- 📊 **Análisis de datos**: interpretar los datos de la app, tendencias, estadísticas
- 📝 **Documentación**: ayudar a registrar información sobre la finca
- 🗺️ **Gestión territorial**: orientación sobre mapas, parcelas, zonas de la finca

Cuando tengas datos de transacciones, eventos o memoria aprendida en el contexto, úsalos para dar respuestas precisas y basadas en datos reales.
Responde siempre en **español**, de forma clara, concisa y útil. Puedes usar formato markdown.
Si te muestran una imagen, analízala en detalle relacionándola con el contexto de la finca.
Hoy es: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

// ─── Función de llamada directa REST a Gemini con timeout ──────────────────────
async function callGeminiDirect({ modelId, prompt, image, audio, history, systemInstruction, apiKey, timeoutMs = 25000 }) {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const effectiveTimeout = audio ? Math.max(timeoutMs, 30000) : timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  // Armar historial en formato REST Gemini
  const contents = [];

  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h.content) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }
  }

  // Mensaje actual del usuario
  const userParts = [];
  if (prompt) {
    userParts.push({ text: prompt });
  }

  if (image && image.dataUrl) {
    const match = image.dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      userParts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2],
        },
      });
    }
  }

  // Soporte nativo multimodal de Audio en Gemini
  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:(audio\/[a-zA-Z0-9.-]+);base64,(.+)$/);
    if (match) {
      userParts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2],
        },
      });
    } else {
      const mime = audio.mimeType || 'audio/webm';
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({
        inline_data: {
          mime_type: mime,
          data: cleanBase64,
        },
      });
    }
  }

  if (!prompt && audio) {
    userParts.push({
      text: 'Por favor, escucha atentamente este mensaje de voz del agricultor de Campito Jorox. Si describe árboles, plantas, arquetas o elementos de la finca para inventario, extrae los datos y ubícalos con [[REGISTRAR_PUNTOS: [...] ]]. Si pide recordar o aprender una regla o dato clave de la finca, guárdala con [[MEMORIA: {...} ]]. Si hace una consulta agronómica o balance, responde detalladamente en español.',
    });
  } else if (userParts.length === 0) {
    userParts.push({ text: 'Hola' });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const payload = {
    contents,
    system_instruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.error?.message || `HTTP ${res.status}`;
      const isQuota = res.status === 429 || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('resource_exhausted');
      const err = new Error(errorMsg);
      err.status = res.status;
      err.isQuota = isQuota;
      throw err;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');

    if (!text) {
      throw new Error('El modelo devolvió una respuesta vacía');
    }

    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Tiempo de espera agotado (15s)');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  }
}

// ─── Estilos inline ────────────────────────────────────────────────────────────
const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e8e8e8',
    flexShrink: 0,
    gap: 8,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '0.92rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: '0.68rem',
    color: '#777',
    margin: 0,
    lineHeight: 1.2,
  },
  serverBadge: () => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 9px',
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#334155',
    flexShrink: 0,
    userSelect: 'none',
    transition: 'all 0.15s ease',
  }),
  statusDot: (color) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    boxShadow: `0 0 6px ${color}`,
  }),
  fallbackAlert: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    backgroundColor: '#fffbeb',
    borderBottom: '1px solid #fef3c7',
    color: '#92400e',
    fontSize: '0.74rem',
    fontWeight: 500,
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  bubbleRow: (isUser) => ({
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    alignItems: 'flex-end',
    gap: '7px',
  }),
  avatar: (isUser) => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    backgroundColor: isUser ? '#00979d' : '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    order: isUser ? 1 : 0,
  }),
  bubble: (isUser) => ({
    maxWidth: '82%',
    padding: '10px 13px',
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    backgroundColor: isUser ? '#00979d' : '#f5f5f5',
    color: isUser ? '#ffffff' : '#1a1a1a',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    wordBreak: 'break-word',
  }),
  bubbleMeta: (isUser) => ({
    fontSize: '0.66rem',
    color: isUser ? 'rgba(255,255,255,0.7)' : '#888',
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    justifyContent: isUser ? 'flex-end' : 'flex-start',
  }),
  typingDots: {
    display: 'flex',
    gap: '4px',
    padding: '4px 2px',
    alignItems: 'center',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e8e8e8',
    flexShrink: 0,
  },
  iconBtn: (active) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: active ? '#ff4444' : '#f0f0f0',
    color: active ? '#ffffff' : '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.2s',
    WebkitTapHighlightColor: 'transparent',
  }),
  textInput: {
    flex: 1,
    border: '1.5px solid #e0e0e0',
    borderRadius: 22,
    padding: '9px 14px',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
    resize: 'none',
    lineHeight: 1.4,
    maxHeight: 100,
    overflowY: 'auto',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  sendBtn: (hasText) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: hasText ? '#00979d' : '#e0e0e0',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: hasText ? 'pointer' : 'default',
    flexShrink: 0,
    transition: 'all 0.2s',
    WebkitTapHighlightColor: 'transparent',
  }),
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    backgroundColor: '#fff0f0',
    color: '#cc0000',
    fontSize: '0.78rem',
    borderTop: '1px solid #ffcccc',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 90,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '16px',
    paddingTop: '60px',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 410,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #f1f5f9',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    margin: 0,
    color: '#0f172a',
  },
  modalBody: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    flex: 1,
  },
  serverCard: (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: isActive ? '2px solid #00979d' : '1px solid #e2e8f0',
    backgroundColor: isActive ? '#f0fdfa' : '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
};

// ─── Componente TypingIndicator ─────────────────────────────────────────────────
function TypingIndicator({ currentServer }) {
  return (
    <div style={styles.bubbleRow(false)}>
      <div style={styles.avatar(false)}>
        <Bot size={13} color="#888" />
      </div>
      <div style={{ ...styles.bubble(false), padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={styles.statusDot(currentServer?.badgeColor || '#00979d')} />
          <span style={{ fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>
            {currentServer?.name} ({currentServer?.level}) procesando...
          </span>
        </div>
        <div style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: currentServer?.badgeColor || '#00979d',
                display: 'inline-block',
                animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mensaje de bienvenida inicial ───────────────────────────────────────────
const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el asistente IA de **Campito Jorox** 🌿\n\nPuedo ayudarte con:\n- Consultas sobre la finca y cultivos\n- Análisis de tus transacciones y gastos\n- Planificación de tareas y eventos\n- Fotos de plagas o documentos de la finca\n\n¿En qué te puedo ayudar hoy?',
  serverUsed: GEMINI_SERVERS[2] || GEMINI_SERVERS[0],
};

// ─── Componente Principal ChatIA ────────────────────────────────────────────────
export default function ChatIA() {
  // Modelo inicial: Gemini 3.5 Flash (high) por ser el más potente con cuota gratuita activa
  const initialIndex = GEMINI_SERVERS.findIndex((s) => s.id === 'gemini-3.5-flash');
  const [selectedServerIndex, setSelectedServerIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [activeServer, setActiveServer] = useState(GEMINI_SERVERS[initialIndex >= 0 ? initialIndex : 0]);
  const [fallbackNotice, setFallbackNotice] = useState(null);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isInventoryMapOpen, setIsInventoryMapOpen] = useState(false);
  const [farmKnowledge, setFarmKnowledge] = useState([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [newKnowledge, setNewKnowledge] = useState({ category: 'cultivo', title: '', content: '' });
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  
  // ─── Estado del Inventario, Caminos y Catastro Satélite ────────────────────
  const [farmInventory, setFarmInventory] = useState([]);
  const farmInventoryRef = useRef(farmInventory);
  useEffect(() => {
    farmInventoryRef.current = farmInventory;
  }, [farmInventory]);

  const [farmPaths, setFarmPaths] = useState([]);
  const [lastRecordedGpsTrack, setLastRecordedGpsTrack] = useState(null);
  const [inventoryModalTab, setInventoryModalTab] = useState('map'); // 'map' | 'inventory' | 'paths'
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');

  // Hook unificado para captura sincronizada de audio continuo y telemetría GPS
  const {
    isRecording,
    elapsedSeconds: recordingSeconds,
    currentGps,
    gpsPointsCount,
    accuracyWarning,
    startTracking,
    stopTracking,
  } = useVoiceGeoTracker();

  const [autoFallback, setAutoFallback] = useState(true);

  const [currentUserId, setCurrentUserId] = useState(() => {
    try {
      return localStorage.getItem('campito_last_user_id') || 'default';
    } catch {
      return 'default';
    }
  });

  // Carga instantánea desde caché local para que nunca se borre al cambiar de sección
  const [messages, setMessages] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      const cached = localStorage.getItem(`campito_chat_messages_${lastUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[ChatIA] Error leyendo caché local de mensajes:', e);
    }
    return [WELCOME_MESSAGE];
  });

  // Mantener borrador en curso si el usuario estaba escribiendo y fue a otra sección
  const [input, setInput] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      return localStorage.getItem(`campito_chat_draft_${lastUid}`) || '';
    } catch {
      return '';
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [pendingAudio, setPendingAudio] = useState(null); // { blob, dataUrl, mimeType, duration, t0, gpsTrack }
  const [error, setError] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);

  // Telemetría GPS en tiempo real del teléfono para el Chat
  const [deviceGps, setDeviceGps] = useState(null); // { lat, lng, accuracy, altitude }
  const deviceGpsRef = useRef(null);

  const contextDataRef = useRef('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persistir mensajes en caché local cada vez que cambien
  useEffect(() => {
    if (!currentUserId) return;
    try {
      localStorage.setItem(`campito_chat_messages_${currentUserId}`, JSON.stringify(messages.slice(-60)));
    } catch (e) {
      console.warn('[ChatIA] Error guardando mensajes en caché:', e);
    }
  }, [messages, currentUserId]);

  // Sincronizar usuario activo y recuperar historial desde Supabase si la caché local está vacía
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || 'default';
        if (!isMounted) return;
        setCurrentUserId(uid);
        localStorage.setItem('campito_last_user_id', uid);

        // Si la caché local está vacía o solo tiene bienvenida, recuperar historial de Supabase
        const cachedRaw = localStorage.getItem(`campito_chat_messages_${uid}`);
        let cachedArr = [];
        try {
          cachedArr = cachedRaw ? JSON.parse(cachedRaw) : [];
        } catch {
          cachedArr = [];
        }

        if (!cachedArr || cachedArr.length <= 1) {
          const { data: dbHistory, error: dbErr } = await supabase
            .from('chat_history')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true })
            .limit(40);

          if (!dbErr && dbHistory && dbHistory.length > 0 && isMounted) {
            const restored = dbHistory.map((row) => ({
              id: String(row.id),
              role: row.role,
              content: row.content || '',
              image: row.file_url && /\.(jpg|jpeg|png|webp|gif)/i.test(row.file_url) ? row.file_url : null,
              audio: row.file_url && /\.(webm|mp4|m4a|ogg|wav|mp3)/i.test(row.file_url) ? { dataUrl: row.file_url } : null,
              serverUsed: row.model_used ? { name: row.model_used } : null,
              timestamp: row.created_at,
            }));

            const merged = [WELCOME_MESSAGE, ...restored];
            setMessages(merged);
            localStorage.setItem(`campito_chat_messages_${uid}`, JSON.stringify(merged));
          }
        }
      } catch (err) {
        console.warn('[ChatIA] Error sincronizando historial con base de datos:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Reiniciar a una nueva conversación limpia (preserva la BD para respaldo y memoria)
  const handleResetChat = useCallback(() => {
    if (messages.length <= 1 && !input) return;
    const ok = window.confirm(
      '¿Deseas iniciar una nueva conversación limpia?\n\nEl historial anterior permanece guardado y seguro en la base de datos de Campito Jorox.'
    );
    if (!ok) return;

    setMessages([WELCOME_MESSAGE]);
    setInput('');
    setPendingAudio(null);
    setPendingImage(null);
    if (currentUserId) {
      try {
        localStorage.removeItem(`campito_chat_messages_${currentUserId}`);
        localStorage.removeItem(`campito_chat_draft_${currentUserId}`);
      } catch {
        // ignore
      }
    }
  }, [messages.length, input, currentUserId]);

  // Captura y seguimiento continuo de GPS del móvil para el Chat
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    // Lectura inicial rápida
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        };
        setDeviceGps(info);
        deviceGpsRef.current = info;
      },
      (err) => {
        console.warn('[ChatIA] Lectura inicial GPS no disponible:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 }
    );

    // Muestreo continuo
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const info = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        };
        setDeviceGps(info);
        deviceGpsRef.current = info;
      },
      (err) => {
        console.warn('[ChatIA] watchPosition error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // CSS de animaciones
  useEffect(() => {
    const styleId = 'chatia-animations-v2';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chatPulseRed {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
        .chatia-input:focus {
          border-color: #00979d !important;
          background-color: #fff !important;
        }
        .chatia-input::placeholder { color: #aaa; }
        .chatia-markdown p { margin: 0 0 6px; }
        .chatia-markdown p:last-child { margin-bottom: 0; }
        .chatia-markdown ul, .chatia-markdown ol { margin: 4px 0 4px 18px; padding: 0; }
        .chatia-markdown li { margin-bottom: 2px; }
        .chatia-markdown strong { font-weight: 700; }
        .chatia-markdown code { background: rgba(0,0,0,0.08); border-radius: 3px; padding: 1px 4px; font-size: 0.85em; }
        .chatia-markdown pre { background: rgba(0,0,0,0.06); border-radius: 6px; padding: 8px 10px; overflow-x: auto; margin: 6px 0; }
        .chatia-markdown pre code { background: none; padding: 0; }
        .chatia-markdown h1, .chatia-markdown h2, .chatia-markdown h3 { margin: 8px 0 4px; font-weight: 700; }
        .chatia-markdown table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 0.82em; }
        .chatia-markdown th, .chatia-markdown td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
        .chatia-markdown th { background: rgba(0,151,157,0.1); font-weight: 700; }
        .chatia-iconbtn:active { transform: scale(0.92); }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // ── Cargar contexto de Supabase una sola vez al montar ────────────────────────
  useEffect(() => {
    const loadContext = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [{ data: transactions }, { data: events }, { data: knowledge }, { data: inventory }, { data: paths }] = await Promise.all([
          supabase
            .from('transactions')
            .select('date, type, amount, description, category')
            .order('date', { ascending: false })
            .limit(40),
          supabase
            .from('events')
            .select('title, start_date, category')
            .gte('start_date', thirtyDaysAgo.toISOString().split('T')[0])
            .order('start_date', { ascending: true })
            .limit(20),
          supabase
            .from('farm_knowledge')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('farm_inventory')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('farm_paths')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
        ]);

        let ctx = '';

        // Inyectar memoria permanente aprendida de la finca
        if (knowledge && knowledge.length > 0) {
          setFarmKnowledge(knowledge);
          ctx += `\n\n🧠 MEMORIA Y APRENDIZAJE ACUMULADO DE LA FINCA (${knowledge.length} hechos/reglas grabadas):\n`;
          knowledge.forEach((k) => {
            ctx += `- [${(k.category || 'general').toUpperCase()}] ${k.title}: ${k.content}\n`;
          });
        }

        // Inyectar inventario y catastro GPS de la finca
        if (inventory && inventory.length > 0) {
          setFarmInventory(inventory);
          ctx += `\n\n🗺️ INVENTARIO Y CATASTRO GPS (${inventory.length} elementos georreferenciados):\n`;
          inventory.slice(0, 30).forEach((inv) => {
            ctx += `- [${(inv.category || 'arbol').toUpperCase()}] ${inv.name} (${inv.variety_type || ''}) | Estado: ${inv.status || 'saludable'} | Lat/Lng: ${inv.latitude}, ${inv.longitude} | Obs: ${inv.notes || ''}\n`;
          });
        }

        // Inyectar trazados de caminos y senderos
        if (paths && paths.length > 0) {
          setFarmPaths(paths);
          ctx += `\n\n🛣️ CAMINOS Y SENDEROS TRAZADOS (${paths.length} trazados activos):\n`;
          paths.forEach((p) => {
            ctx += `- [${(p.path_type || 'camino').toUpperCase()}] ${p.name} (${p.length_meters ? `${Number(p.length_meters).toFixed(0)}m` : 'longitud sin definir'}, color: ${p.color})\n`;
          });
        }

        if (transactions?.length > 0) {
          const ingresos = transactions
            .filter((t) => t.type === 'ingreso')
            .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
          const gastos = transactions
            .filter((t) => t.type === 'gasto')
            .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
          ctx += `\n\n📊 DATOS REALES (${transactions.length} transacciones):\n`;
          ctx += `Ingresos: €${ingresos.toFixed(2)} | Gastos: €${gastos.toFixed(2)} | Balance: €${(ingresos - gastos).toFixed(2)}\n`;
          ctx += `Últimas transacciones:\n`;
          transactions.slice(0, 12).forEach((t) => {
            ctx += `- [${t.date}] ${t.type?.toUpperCase()}: €${t.amount} — ${t.description || t.category || ''}\n`;
          });
        }
        if (events?.length > 0) {
          ctx += `\nEventos próximos:\n`;
          events.forEach((e) => {
            ctx += `- [${e.start_date}] ${e.title} ${e.category ? `(${e.category})` : ''}\n`;
          });
        }
        contextDataRef.current = ctx;
      } catch (err) {
        console.warn('No se pudo cargar contexto Supabase:', err.message);
      }
    };
    loadContext();
  }, []);

  // ── Guardar conocimiento manual en la memoria de la finca ─────────────────────
  const handleSaveManualKnowledge = async (e) => {
    e?.preventDefault();
    if (!newKnowledge.title.trim() || !newKnowledge.content.trim()) return;

    setIsSavingKnowledge(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const u = authData?.user;
      const currentUserName = u?.user_metadata?.name || u?.email?.split('@')[0] || 'Admin';

      const { data: inserted, error: insertErr } = await supabase
        .from('farm_knowledge')
        .insert({
          category: newKnowledge.category,
          title: newKnowledge.title.trim(),
          content: newKnowledge.content.trim(),
          source: 'manual',
          user_id: u?.id || null,
          user_name: currentUserName,
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (inserted) {
        setFarmKnowledge((prev) => [inserted, ...prev]);
        contextDataRef.current += `\n- [${(inserted.category || 'general').toUpperCase()}] ${inserted.title}: ${inserted.content}`;
        setNewKnowledge({ category: 'cultivo', title: '', content: '' });
      }
    } catch (err) {
      console.warn('Error al guardar conocimiento:', err);
      alert('No se pudo guardar el conocimiento: ' + (err.message || 'Verifica la conexión.'));
    } finally {
      setIsSavingKnowledge(false);
    }
  };

  // ── Desactivar o eliminar conocimiento de la memoria ──────────────────────────
  const handleDeleteKnowledge = async (id) => {
    try {
      await supabase.from('farm_knowledge').update({ is_active: false }).eq('id', id);
      setFarmKnowledge((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      console.warn('Error al desactivar conocimiento:', err);
    }
  };

  // ── Recargar inventario y caminos desde Supabase ─────────────────────────────
  const reloadInventory = async () => {
    try {
      const { data } = await supabase
        .from('farm_inventory')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmInventory(data);
    } catch (err) {
      console.warn('Error al recargar inventario:', err);
    }
  };

  const reloadPaths = async () => {
    try {
      const { data } = await supabase
        .from('farm_paths')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmPaths(data);
    } catch (err) {
      console.warn('Error al recargar caminos:', err);
    }
  };

  // ── Eliminar o desactivar elemento del inventario ─────────────────────────────
  const handleDeleteInventoryItem = async (id) => {
    try {
      await supabase.from('farm_inventory').update({ is_active: false }).eq('id', id);
      setFarmInventory((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.warn('Error al eliminar elemento del inventario:', err);
    }
  };

  // ── Eliminar o desactivar camino o sendero ────────────────────────────────────
  const handleDeletePath = async (id) => {
    try {
      await supabase.from('farm_paths').update({ is_active: false }).eq('id', id);
      setFarmPaths((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.warn('Error al eliminar camino:', err);
    }
  };

  // ── Enviar mensaje con cascada/fallback entre los 3 servidores ────────────────
  const sendMessage = useCallback(
    async (textOverride = null, imageData = null, audioData = null) => {
      const text = textOverride ?? input.trim();
      const img = imageData ?? pendingImage;
      const aud = audioData ?? pendingAudio;

      if (!text && !img && !aud) return;
      if (isLoading) return;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key no configurada. Agrega VITE_GEMINI_API_KEY en Vercel o en .env.');
        return;
      }

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: text || (aud ? '🎙️ Mensaje de voz' : ''),
        image: img?.dataUrl || null,
        audio: aud ? { dataUrl: aud.dataUrl, duration: aud.duration } : null,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput('');
      if (currentUserId) {
        try {
          localStorage.removeItem(`campito_chat_draft_${currentUserId}`);
        } catch {
          // ignore
        }
      }
      setPendingImage(null);
      setPendingAudio(null);
      setIsLoading(true);
      setError(null);
      setFallbackNotice(null);

      // Determinar orden de servidores a intentar (solo disponibles)
      const primaryIndex = selectedServerIndex;
      const orderToTry = autoFallback
        ? [primaryIndex, ...GEMINI_SERVERS.map((_, i) => i).filter((i) => i !== primaryIndex && GEMINI_SERVERS[i].available)]
        : [primaryIndex];

      const history = updatedMessages
        .slice(-20, -1)
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content || '' }));

      const currentGpsInfo = deviceGpsRef.current;
      const audTrack = aud?.gpsTrack || [];
      const hasTrack = audTrack.length > 1;
      const effectivePt = audTrack[0] || currentGpsInfo || {
        lat: 36.72595,
        lng: -4.89462,
        accuracy: 4.5,
        isDefaultFinca: true,
      };

      const gpsContextSnippet = hasTrack
        ? `\n\n🛰️ **TELEMETRÍA GPS CONTINUA DEL RECORRIDO EN AUDIO (${audTrack.length} lecturas satelitales)**:
- Inicio audio (t0): ${aud.t0}
- Duración: ${aud.duration}s
- Punto inicial: [${audTrack[0]?.lat.toFixed(6)}, ${audTrack[0]?.lng.toFixed(6)}]
- Punto final: [${audTrack[audTrack.length - 1]?.lat.toFixed(6)}, ${audTrack[audTrack.length - 1]?.lng.toFixed(6)}]
- Precisión satelital: ±${(audTrack.reduce((s, p) => s + p.accuracy, 0) / audTrack.length).toFixed(1)}m.
*INSTRUCCIÓN: El usuario caminaba por la finca mientras hablaba. Si menciona árboles, arquetas, tuberías o elementos a lo largo del camino, confirma en el texto y genera [[REGISTRAR_PUNTOS: [...] ]] con timestamp_audio_s para cada uno.*`
        : `\n\n📍 **UBICACIÓN GPS EN TIEMPO REAL DEL DISPOSITIVO DEL USUARIO**:
- Coordenadas actuales: [${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}] (Precisión: ±${effectivePt.accuracy ? effectivePt.accuracy.toFixed(1) + 'm' : '3.5m'}${effectivePt.isDefaultFinca ? ' · Calibrado en Campito Jorox' : ''}).
*INSTRUCCIÓN VITAL: Toda interacción (audio o texto) lleva incorporada la posición GPS en vivo del dispositivo.
Si el usuario te pregunta:
- "¿Recibes datos de coordenadas del móvil?"
- "¿Cómo vas a obtener esta información para el registro de árboles o caminos?"
- O preguntas similares sobre el GPS:
RESPONDE SIEMPRE ROTUNDAMENTE QUE SÍ:
"¡Sí! La app de Campito Jorox obtiene continuamente tu posición GPS en tiempo real. Ahora mismo tu teléfono está transmitiendo las coordenadas [${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}] con precisión de ±${effectivePt.accuracy ? effectivePt.accuracy.toFixed(1) + 'm' : '3.5m'}."
Si te pide registrar un árbol o arqueta, usa [[REGISTRAR_PUNTOS: [...] ]]. Si te pide aprender una regla o dato de la finca, usa [[MEMORIA: {...}]].*`;

      const systemInstruction = SYSTEM_PROMPT + contextDataRef.current + gpsContextSnippet;

      let lastError = null;
      let successResult = null;
      let serverThatAnswered = null;

      for (let i = 0; i < orderToTry.length; i++) {
        const sIndex = orderToTry[i];
        const server = GEMINI_SERVERS[sIndex];

        try {
          const aiResponse = await callGeminiDirect({
            modelId: server.id,
            prompt: text,
            image: img,
            audio: aud,
            history,
            systemInstruction,
            apiKey,
            timeoutMs: aud ? 30000 : 15000,
          });

          successResult = aiResponse;
          serverThatAnswered = server;

          // Si respondió un servidor distinto al principal, avisar al usuario
          if (i > 0) {
            setFallbackNotice({
              from: GEMINI_SERVERS[primaryIndex],
              to: server,
              reason: lastError?.isQuota ? 'límite de cuota' : 'tiempo de respuesta',
            });
          }

          break; // Éxito, salir del loop
        } catch (err) {
          console.warn(`[ChatIA] Error en ${server.name} (${server.level}):`, err.message);
          lastError = err;
          // Continuar con el siguiente servidor en cascada
        }
      }

      if (successResult && serverThatAnswered) {
        // Detección y extracción de aprendizaje para la memoria permanente de la finca
        let displayedContent = successResult;
        let learnedMemory = null;
        let newlyAddedBatch = [];

        const memMatch = successResult.match(/\[\[MEMORIA:\s*(\{.*?\})\s*\]\]/s);
        if (memMatch) {
          try {
            learnedMemory = JSON.parse(memMatch[1]);
            displayedContent = successResult.replace(memMatch[0], '').trim();
          } catch (e) {
            console.warn('Error al parsear bloque de memoria:', e);
          }
        }

        // 1. Detección y ejecución de registro de múltiples puntos con GPS continuo interpolado
        const regPointsMatch = successResult.match(/\[\[REGISTRAR_PUNTOS:\s*(\[.*?\])\s*\]\]/s);
        if (regPointsMatch) {
          try {
            const items = JSON.parse(regPointsMatch[1]);
            displayedContent = displayedContent.replace(regPointsMatch[0], '').trim();

            if (Array.isArray(items) && items.length > 0) {
              const audTrack = aud?.gpsTrack || (deviceGpsRef.current ? [{ ...deviceGpsRef.current, timestamp: Date.now() }] : []);
              const t0 = aud?.t0 || Date.now();

              for (const item of items) {
                const geo = interpolateGpsAtAudioTime({
                  t0,
                  gpsTrack: audTrack,
                  timestampAudioSec: Number(item.timestamp_audio_s) || 0,
                });

                const lat = geo.lat || currentGpsInfo?.lat || 36.72595;
                const lng = geo.lng || currentGpsInfo?.lng || -4.89462;
                const acc = geo.accuracy_m || currentGpsInfo?.accuracy || 3.0;

                const name = item.name || `${item.tipo || 'Árbol'} ${item.variedad || ''}`.trim();
                const category = item.category || item.tipo || 'arbol';

                const { data: newRow, error: insErr } = await supabase
                  .from('farm_inventory')
                  .insert({
                    name,
                    category,
                    variety_type: item.variedad || item.variety_type || null,
                    status: item.estado || item.status || 'saludable',
                    latitude: lat,
                    longitude: lng,
                    accuracy_meters: acc,
                    notes: item.observaciones || item.notes || 'Registrado por voz en Campito Jorox',
                    is_active: true,
                  })
                  .select()
                  .single();

                if (!insErr && newRow) {
                  newlyAddedBatch.push(newRow);
                  contextDataRef.current += `\n- [${(newRow.category || 'arbol').toUpperCase()}] ${newRow.name} (${newRow.variety_type || ''}) | Lat/Lng: ${newRow.latitude}, ${newRow.longitude}`;
                }
              }

              if (newlyAddedBatch.length > 0) {
                setFarmInventory((prev) => [...newlyAddedBatch, ...prev]);
              }
            }
          } catch (e) {
            console.warn('Error al procesar bloque REGISTRAR_PUNTOS:', e);
          }
        }

        // 2. Detección y ejecución de orden de registro de punto único
        const regPointMatch = successResult.match(/\[\[REGISTRAR_PUNTO:\s*(\{.*?\})\s*\]\]/s);
        if (regPointMatch) {
          try {
            const regData = JSON.parse(regPointMatch[1]);
            displayedContent = displayedContent.replace(regPointMatch[0], '').trim();

            const lat = Number(regData.latitude) || (currentGpsInfo ? currentGpsInfo.lat : 36.72595);
            const lng = Number(regData.longitude) || (currentGpsInfo ? currentGpsInfo.lng : -4.89462);
            const acc = Number(regData.accuracy_meters) || (currentGpsInfo ? currentGpsInfo.accuracy : 3.0);

            const { data: newPoint, error: insErr } = await supabase
              .from('farm_inventory')
              .insert({
                name: regData.name || regData.tipo || 'Punto registrado',
                category: regData.category || 'arbol',
                variety_type: regData.variety_type || regData.variedad || null,
                status: regData.status || regData.estado || 'saludable',
                latitude: lat,
                longitude: lng,
                accuracy_meters: acc,
                notes: regData.notes || regData.observaciones || 'Registrado con GPS desde Chat IA',
                is_active: true,
              })
              .select()
              .single();

            if (!insErr && newPoint) {
              newlyAddedBatch.push(newPoint);
              setFarmInventory((prev) => [newPoint, ...prev]);
              contextDataRef.current += `\n- [${(newPoint.category || 'arbol').toUpperCase()}] ${newPoint.name} (${newPoint.variety_type || ''}) | Estado: ${newPoint.status} | Lat/Lng: ${newPoint.latitude}, ${newPoint.longitude}`;
            }
          } catch (e) {
            console.warn('Error al procesar orden de registro de punto:', e);
          }
        }

        // Detección y ejecución de orden de borrado de puntos del inventario catastral
        const delPointMatch = successResult.match(/\[\[BORRAR_PUNTO:\s*(\{.*?\})\s*\]\]/s);
        if (delPointMatch) {
          try {
            const delData = JSON.parse(delPointMatch[1]);
            displayedContent = displayedContent.replace(delPointMatch[0], '').trim();

            if (delData.target === 'ultimo') {
              const target = farmInventoryRef.current[0];
              if (target) {
                await supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
                setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
              }
            } else if (delData.query) {
              const q = delData.query.toLowerCase().trim();
              const target = farmInventoryRef.current.find((p) =>
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.variety_type && p.variety_type.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
              );
              if (target) {
                await supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
                setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
              }
            }
          } catch (e) {
            console.warn('Error al procesar orden de borrado de punto:', e);
          }
        } else if (text) {
          // Heurística de respaldo si el usuario pidió explícitamente borrar por voz o texto
          const lower = text.toLowerCase().trim();
          const isDeleteLast =
            lower.includes('borra el último árbol') ||
            lower.includes('borra el ultimo arbol') ||
            lower.includes('elimina el último árbol') ||
            lower.includes('elimina el ultimo arbol') ||
            lower.includes('borra el último punto') ||
            lower.includes('borra el ultimo punto') ||
            lower.includes('elimina el último punto') ||
            lower.includes('cancela el último');

          if (isDeleteLast && farmInventoryRef.current.length > 0) {
            const target = farmInventoryRef.current[0];
            try {
              supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
              setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
            } catch (err) {
              console.warn('Error en heurística de borrado:', err);
            }
          }
        }

        // Heurística de respaldo si el usuario pidió recordar algo y el modelo no generó la etiqueta
        if (!learnedMemory && text) {
          const lowerText = text.toLowerCase().trim();
          const triggers = ['recuerda que', 'recuerda:', 'aprende que', 'aprende:', 'guarda que', 'guarda este dato:', 'anota que', 'toma nota de que'];
          for (const trig of triggers) {
            if (lowerText.startsWith(trig)) {
              const contentToSave = text.substring(trig.length).replace(/^[:\s]+/, '').trim();
              if (contentToSave.length > 5) {
                learnedMemory = {
                  category: 'general',
                  title: contentToSave.substring(0, 45) + (contentToSave.length > 45 ? '...' : ''),
                  content: contentToSave
                };
                break;
              }
            }
          }
        }

        setActiveServer(serverThatAnswered);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: displayedContent,
            serverUsed: serverThatAnswered,
            learnedMemory: learnedMemory || null,
            inventoryExportBatch: newlyAddedBatch.length > 0 ? newlyAddedBatch : null,
          },
        ]);

        // Persistir en segundo plano en Supabase para respaldo automático a Drive y memoria viva
        (async () => {
          try {
            let uploadedFileUrl = null;
            let uploadedFileName = null;

            // Subir imagen si se adjuntó alguna
            if (img && img.file) {
              const fileExt = img.file.name ? img.file.name.split('.').pop() : 'jpg';
              const cleanFileName = `chat-ia/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              const { error: uploadErr } = await supabase.storage
                .from('comprobantes')
                .upload(cleanFileName, img.file, { contentType: img.file.type });

              if (!uploadErr) {
                const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanFileName);
                uploadedFileUrl = pubUrl?.publicUrl || null;
                uploadedFileName = cleanFileName;
              }
            } else if (aud && aud.blob) {
              // Subir audio si se grabó nota de voz
              const ext = aud.mimeType?.includes('mp4') ? 'm4a' : (aud.mimeType?.includes('ogg') ? 'ogg' : 'webm');
              const cleanAudioName = `chat-ia/audio-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
              try {
                const { error: uploadAudioErr } = await supabase.storage
                  .from('comprobantes')
                  .upload(cleanAudioName, aud.blob, { contentType: aud.mimeType || 'audio/webm' });
                if (!uploadAudioErr) {
                  const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(cleanAudioName);
                  uploadedFileUrl = pubUrl?.publicUrl || null;
                  uploadedFileName = cleanAudioName;
                }
              } catch (audioUpErr) {
                console.warn('No se pudo subir audio a storage:', audioUpErr);
              }
            }

            const { data: authData } = await supabase.auth.getUser();
            const u = authData?.user;
            const currentUserName = u?.user_metadata?.name || u?.email?.split('@')[0] || 'Admin';

            // Si se detectó conocimiento nuevo, guardarlo en farm_knowledge con coordenadas GPS
            if (learnedMemory && learnedMemory.content) {
              const geoTag = effectivePt ? ` [📍 GPS: ${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}]` : '';
              const enrichedContent = learnedMemory.content.includes('[📍')
                ? learnedMemory.content
                : `${learnedMemory.content}${geoTag}`;

              const { data: savedMem, error: memErr } = await supabase.from('farm_knowledge').insert({
                category: learnedMemory.category || 'general',
                title: learnedMemory.title || 'Dato aprendido',
                content: enrichedContent,
                source: 'chat',
                user_id: u?.id || null,
                user_name: currentUserName,
                is_active: true
              }).select().single();

              if (!memErr && savedMem) {
                setFarmKnowledge((prev) => [savedMem, ...prev]);
                contextDataRef.current += `\n- [${(savedMem.category || 'general').toUpperCase()}] ${savedMem.title}: ${savedMem.content}`;
              }
            }

            // Guardar mensaje del usuario en chat_history
            const gpsLabel = effectivePt ? ` [GPS: ${effectivePt.lat.toFixed(6)}, ${effectivePt.lng.toFixed(6)}]` : '';
            await supabase.from('chat_history').insert({
              role: 'user',
              content: (text || (img ? '[Archivo adjunto]' : (aud ? `[Audio grabado: ${aud.duration}s]` : ''))) + gpsLabel,
              file_url: uploadedFileUrl,
              file_name: uploadedFileName,
              user_id: u?.id || null,
              user_name: currentUserName,
              model_used: null,
            });

            // Guardar respuesta del asistente en chat_history
            await supabase.from('chat_history').insert({
              role: 'assistant',
              content: displayedContent,
              file_url: null,
              file_name: null,
              user_id: u?.id || null,
              user_name: 'Asistente IA',
              model_used: `${serverThatAnswered.name} (${serverThatAnswered.level})`,
            });
          } catch (persistErr) {
            console.warn('[ChatIA] Aviso al persistir para backup:', persistErr.message);
          }
        })();
      } else {
        const isQuota = lastError?.isQuota;
        setError(
          isQuota
            ? 'Todos los modelos de Gemini superaron su límite de cuota actual. Intenta de nuevo en unos minutos.'
            : (lastError?.message || 'Error al conectar con el asistente. Intenta de nuevo.')
        );
      }

      setIsLoading(false);
    },
    [input, messages, isLoading, pendingImage, pendingAudio, selectedServerIndex, autoFallback, currentUserId]
  );

  // Enter envía
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Cámara / archivo
  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingImage({ dataUrl: ev.target.result, file });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Grabación unificada de audio y telemetría GPS continua
  const handleMicClick = async () => {
    if (isRecording) {
      try {
        const sessionResult = await stopTracking();
        if (!sessionResult || !sessionResult.audioBlob) return;

        const { audioBlob, t0, durationSeconds, gpsTrack } = sessionResult;

        // Si se registraron múltiples puntos GPS, guardar para caminos/senderos
        if (gpsTrack && gpsTrack.length > 1) {
          setLastRecordedGpsTrack(gpsTrack);
        }

        // Asegurar que al menos tengamos la posición actual del dispositivo si el track tiene 0 lecturas
        const effectiveGpsTrack = gpsTrack && gpsTrack.length > 0
          ? gpsTrack
          : (deviceGpsRef.current ? [{ ...deviceGpsRef.current, timestamp: t0 }] : [{ lat: 36.72595, lng: -4.89462, accuracy: 4.0, timestamp: t0 }]);

        const reader = new FileReader();
        reader.onloadend = () => {
          setPendingAudio({
            blob: audioBlob,
            dataUrl: reader.result,
            mimeType: audioBlob.type || 'audio/webm',
            duration: Math.max(1, Math.round(durationSeconds)),
            t0,
            gpsTrack: effectiveGpsTrack,
          });
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        console.error('Error deteniendo grabación de voz:', err);
        setError('Error al procesar la grabación de voz.');
      }
      return;
    }

    try {
      setPendingAudio(null);
      setError(null);
      await startTracking({ initialGps: deviceGpsRef.current });
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      setError('No se pudo acceder al micrófono o GPS. Verifica los permisos en tu navegador o móvil.');
    }
  };

  const hasText = input.trim().length > 0 || pendingImage !== null || pendingAudio !== null;
  const currentBadgeServer = activeServer || GEMINI_SERVERS[selectedServerIndex];

  return (
    <div style={styles.page}>
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <Bot size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={styles.headerTitle}>Asistente IA</p>
              <button
                onClick={() => setIsInfoModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  transition: 'color 0.15s, background-color 0.15s',
                }}
                title="Información de confidencialidad y modo de operación"
                aria-label="Información de confidencialidad y modo de operación"
              >
                <Info size={15} />
              </button>
              <button
                onClick={() => setIsKnowledgeModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: farmKnowledge.length > 0 ? '#00979d' : '#94a3b8',
                  borderRadius: '50%',
                  transition: 'color 0.15s',
                }}
                title={`Memoria de la finca (${farmKnowledge.length} conocimientos aprendidos)`}
                aria-label="Memoria de la finca"
              >
                <Brain size={15} />
              </button>
              <button
                onClick={() => setIsInventoryMapOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: farmInventory.length > 0 ? '#10b981' : '#94a3b8',
                  borderRadius: '50%',
                  transition: 'color 0.15s',
                }}
                title={`Catastro e Inventario GPS (${farmInventory.length} elementos)`}
                aria-label="Catastro e Inventario GPS"
              >
                <MapPin size={15} />
              </button>
              <button
                onClick={handleResetChat}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  transition: 'color 0.15s, transform 0.15s',
                }}
                title="Nueva conversación limpia (el historial se mantiene respaldado)"
                aria-label="Nueva conversación"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={styles.headerSub}>Campito Jorox</p>
              {deviceGps ? (
                <span
                  style={{
                    fontSize: '0.62rem',
                    color: '#059669',
                    backgroundColor: '#ecfdf5',
                    padding: '1px 6px',
                    borderRadius: 8,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                  title={`GPS conectado: ${deviceGps.lat.toFixed(5)}, ${deviceGps.lng.toFixed(5)} (±${deviceGps.accuracy?.toFixed(1)}m)`}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
                  GPS ±{deviceGps.accuracy ? `${deviceGps.accuracy.toFixed(0)}m` : 'OK'}
                </span>
              ) : (
                <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>· GPS buscando...</span>
              )}
            </div>
          </div>
        </div>

        {/* Badge interactivo del servidor actual */}
        <div
          style={styles.serverBadge(currentBadgeServer.badgeColor)}
          onClick={() => setIsServerModalOpen(true)}
          title="Click para ver/cambiar servidor de Gemini"
        >
          <span style={styles.statusDot(currentBadgeServer.badgeColor)} />
          <span>
            {currentBadgeServer.name}{' '}
            <span style={{ opacity: 0.85, fontWeight: 700 }}>({currentBadgeServer.level})</span>
          </span>
          <ChevronDown size={13} style={{ color: '#64748b' }} />
        </div>
      </div>

      {/* ─── Banner de Notificación de Fallback Automático ────────────────────── */}
      {fallbackNotice && (
        <div style={styles.fallbackAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>
              ⚡ Cuota agotada en <b>{fallbackNotice.from.name}</b>. Conectado a{' '}
              <b>
                {fallbackNotice.to.name} ({fallbackNotice.to.level})
              </b>
              .
            </span>
          </div>
          <button
            onClick={() => setFallbackNotice(null)}
            style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ─── Modal de Selección y Estado de Servidores ───────────────────────── */}
      {isServerModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsServerModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color="#00979d" />
                <p style={styles.modalTitle}>Servidores de Gemini</p>
              </div>
              <button
                onClick={() => setIsServerModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Estado de conexión actual */}
              <div
                style={{
                  padding: '9px 12px',
                  backgroundColor: '#f0fdfa',
                  borderRadius: 8,
                  border: '1px solid #99f6e4',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={styles.statusDot(activeServer.badgeColor)} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#0f766e' }}>
                    Conectado: {activeServer.name} ({activeServer.level})
                  </p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#115e59' }}>
                    Cuota activa y respondiendo correctamente
                  </p>
                </div>
                <CheckCircle2 size={16} color="#00979d" />
              </div>

              <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '4px 0 0' }}>
                Selecciona un modelo o deja activo el <b>Auto-Fallback</b> para usar el más potente disponible:
              </p>

              {GEMINI_SERVERS.map((srv, idx) => {
                const isConnectedNow = activeServer.id === srv.id;

                return (
                  <div
                    key={srv.id}
                    style={{
                      ...styles.serverCard(isConnectedNow),
                      opacity: srv.comingSoon ? 0.6 : 1,
                      cursor: srv.comingSoon ? 'not-allowed' : 'pointer',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                    }}
                    onClick={() => {
                      if (srv.comingSoon) return;
                      setSelectedServerIndex(idx);
                      setActiveServer(srv);
                      setIsServerModalOpen(false);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={styles.statusDot(srv.badgeColor)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                            {srv.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 10,
                              backgroundColor: `${srv.badgeColor}20`,
                              color: srv.badgeColor,
                            }}
                          >
                            ({srv.level})
                          </span>
                          {isConnectedNow && (
                            <span style={{ fontSize: '0.65rem', color: '#00979d', fontWeight: 700, backgroundColor: '#ccfbf1', padding: '1px 6px', borderRadius: 8 }}>
                              Conectado Ahora
                            </span>
                          )}
                          {!isConnectedNow && srv.available && (
                            <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 6px', borderRadius: 8 }}>
                              Disponible (Fallback)
                            </span>
                          )}
                          {srv.comingSoon && (
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: 8 }}>
                              Próximamente
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>
                          {srv.desc}
                        </p>
                      </div>
                      {isConnectedNow && <CheckCircle2 size={16} color="#00979d" />}
                    </div>
                  </div>
                );
              })}

              {/* Toggle Auto-Fallback */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0, color: '#1e293b' }}>
                    Auto-Fallback de cuota
                  </p>
                  <p style={{ fontSize: '0.68rem', color: '#64748b', margin: 0 }}>
                    Si se acaba el crédito, cambia al siguiente servidor
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoFallback}
                  onChange={(e) => setAutoFallback(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#00979d', cursor: 'pointer' }}
                />
              </div>

              {/* Info de la cuenta y Privacidad Confidencial */}
              <div
                style={{
                  fontSize: '0.68rem',
                  color: '#475569',
                  backgroundColor: '#f1f5f9',
                  padding: '9px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                  <ShieldCheck size={14} color="#00979d" />
                  <span>Entorno Confidencial y Privado</span>
                </div>
                <span>
                  Toda la información, audios y documentos de este chat son <b>estrictamente confidenciales</b>. Nunca se comparten con terceros externos ni redes públicas. Tú como administrador tienes total libertad para <b>exportar y descargar tus informes en PDF, Excel o KML/GeoJSON</b> cuando lo desees.
                </span>
                <span style={{ color: '#64748b', fontSize: '0.64rem', marginTop: 2 }}>
                  Cuenta: Google AI Studio · Sesión protegida y privada
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de Información y Confidencialidad ─────────────────────────── */}
      {isInfoModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsInfoModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={18} color="#00979d" />
                <p style={styles.modalTitle}>Confidencialidad y Uso del Asistente</p>
              </div>
              <button
                onClick={() => setIsInfoModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                aria-label="Cerrar modal de información"
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Tarjeta 1: Confidencialidad */}
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

              {/* Tarjeta 2: Aislamiento Privado y Exportación para el Usuario */}
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

              {/* Tarjeta 3: Modus Operandi */}
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
                  <span>3. Modo de Operación (Modus Operandi)</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                  <li>
                    <b>🌿 Asesoría Agrícola:</b> Pregunta sobre poda, riego, abonado, control de plagas y labores de la finca.
                  </li>
                  <li>
                    <b>💰 Contabilidad Integrada:</b> Consulta balances, gastos o ingresos; el chat lee directamente las transacciones reales de la app sin inventar datos.
                  </li>
                  <li>
                    <b>📷 Fotos & Cámara:</b> Sube imágenes de hojas, facturas o mapas para que la IA las analice al instante.
                  </li>
                  <li>
                    <b>🎙️ Notas de Voz Nativas:</b> Pulsa el micrófono para enviar audios reales a Gemini. La IA escucha tu voz, transcribe y responde o ejecuta tus instrucciones (incluso mientras caminas por los bancales).
                  </li>
                  <li>
                    <b>⚡ Cascada de IA Inteligente:</b> El sistema conecta siempre con el modelo más potente disponible. Si se agota la cuota, desciende automáticamente al siguiente sin interrumpir tu consulta.
                  </li>
                </ul>
              </div>

              {/* Tarjeta 4: Módulo de Aprendizaje Continuo (Memoria de Finca) */}
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
                    <span>4. Módulo de Aprendizaje Permanente</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 10 }}>
                    {farmKnowledge.length} hechos grabados
                  </span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#14532d', margin: 0, lineHeight: 1.45 }}>
                  La IA no empieza de cero: cuenta con <b>memoria viva en la base de datos</b>. Puedes enseñarle datos sobre parcelas, riegos, variedades o proveedores simplemente diciéndoselo en el chat:
                </p>
                <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #dcfce7', fontSize: '0.72rem', color: '#166534', fontFamily: 'monospace' }}>
                  💡 <i>"Recuerda que la electroválvula del sector 2 riega 40 min los martes"</i>
                </div>
                <p style={{ fontSize: '0.73rem', color: '#15803d', margin: 0, lineHeight: 1.4 }}>
                  El asistente retendrá esa regla permanentemente y la aplicará en todas las sesiones y usuarios. Todo se respalda semanalmente en la hoja <b>MEMORIA_FINCA</b> de Google Drive.
                </p>

                <button
                  onClick={() => {
                    setIsInfoModalOpen(false);
                    setIsKnowledgeModalOpen(true);
                  }}
                  style={{
                    marginTop: 4,
                    padding: '8px 12px',
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <BookOpen size={14} />
                  Ver y Administrar Memoria de la Finca ({farmKnowledge.length})
                </button>
              </div>

              {/* Tarjeta 5: Catastro Agrícola GPS y Descargas PDF / EXCEL */}
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
                    <span>5. Catastro GPS y Descargas (PDF / Excel / KML)</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0284c7', padding: '1px 8px', borderRadius: 10 }}>
                    {farmInventory.length} puntos mapeados
                  </span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#075985', margin: 0, lineHeight: 1.45 }}>
                  Puedes mapear árboles, arquetas y acequias caminando por la finca con el botón <b>🧭 (Navegación)</b> o pedirle al chat recopilaciones y descargarlas al instante:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
                  <button
                    onClick={() => {
                      setIsInfoModalOpen(false);
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

              {/* Botón de acción */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => {
                    setIsInfoModalOpen(false);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: `### 🔒 Política de Privacidad, Control de Datos y Catastro Satélite\n\n**1. Confidencialidad y Privacidad:** Toda la información procesada en este chat (contabilidad, imágenes, audios, parcelas e inventario) es estrictamente privada de **Campito Jorox** y no se comparte con redes ni terceros externos.\n\n**2. Control y Descargas para el Administrador:** Tienes plena potestad para **descargar tus balances, informes de catastro en PDF o Excel, y mapas en KML (Google My Maps) o GeoJSON** en cualquier momento.\n\n**3. Módulo de Aprendizaje (Memoria de Finca):** La IA aprende de forma continua. Puedes decirle *"Recuerda que..."* o *"Guarda este dato..."* y lo almacenará en la base de datos permanente para futuras consultas.\n\n**4. Respaldo Automático:** Conversaciones, fotos, memoria y catastro se respaldan todas las semanas en tu Google Drive (*CAMPITO JOROX DATA* y carpeta *Chat IA Files*).\n\n**5. Catastro y Mapa Satélite EN VIVO:** Visualiza árboles con puntos de colores, traza caminos y senderos interactivos, y mapea caminando con dictado por voz y GPS continuo.\n\n**6. Capacidades:**\n- 🌿 Diagnóstico y manejo agronómico de cultivos\n- 💰 Análisis financiero y contable en tiempo real\n- 🗺️ Catastro satélite con trazador de caminos y senderos\n- 📷 Reconocimiento visual de facturas y plagas\n- 🎙️ Mapeo por voz geolocalizado sobre el terreno\n- ⚡ Conexión multinivel con respaldo automático`,
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
                  onClick={() => setIsInfoModalOpen(false)}
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
      )}

      {/* ─── Modal de Gestión de Memoria y Conocimientos Aprendidos ─────────── */}
      {isKnowledgeModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsKnowledgeModalOpen(false)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: 500,
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={18} color="#00979d" />
                <div>
                  <p style={styles.modalTitle}>Memoria de Campito Jorox</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b' }}>
                    {farmKnowledge.length} conocimientos aprendidos y activos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsKnowledgeModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                aria-label="Cerrar modal de memoria"
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Formulario rápido para enseñar un nuevo conocimiento manual */}
              <form
                onSubmit={handleSaveManualKnowledge}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                    ➕ Enseñar algo nuevo a la Finca
                  </span>
                  <select
                    value={newKnowledge.category}
                    onChange={(e) => setNewKnowledge((prev) => ({ ...prev, category: e.target.value }))}
                    style={{
                      fontSize: '0.72rem',
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                    }}
                  >
                    <option value="cultivo">🌱 Cultivo</option>
                    <option value="riego">💧 Riego</option>
                    <option value="parcela">📍 Parcela</option>
                    <option value="maquinaria">🚜 Maquinaria</option>
                    <option value="suelo">🧪 Suelo</option>
                    <option value="plaga">🐛 Plagas</option>
                    <option value="proveedor">🤝 Proveedor</option>
                    <option value="protocolo">📋 Protocolo</option>
                    <option value="general">📌 General</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Título breve (ej: Variedad Aguacates Bancal Sur)"
                  value={newKnowledge.title}
                  onChange={(e) => setNewKnowledge((prev) => ({ ...prev, title: e.target.value }))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                  }}
                />

                <textarea
                  placeholder="Regla o hecho que debe recordar la IA (ej: Se abona en mayo con sulfato de potasio, 150g por árbol)..."
                  value={newKnowledge.content}
                  onChange={(e) => setNewKnowledge((prev) => ({ ...prev, content: e.target.value }))}
                  rows={2}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.76rem',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                    resize: 'none',
                    lineHeight: 1.4,
                  }}
                />

                <button
                  type="submit"
                  disabled={isSavingKnowledge || !newKnowledge.title.trim() || !newKnowledge.content.trim()}
                  style={{
                    padding: '7px 12px',
                    backgroundColor: '#00979d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: isSavingKnowledge ? 'not-allowed' : 'pointer',
                    opacity: isSavingKnowledge || !newKnowledge.title.trim() || !newKnowledge.content.trim() ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={14} />
                  {isSavingKnowledge ? 'Guardando...' : 'Grabar en Memoria Permanente'}
                </button>
              </form>

              {/* Filtro de búsqueda */}
              {farmKnowledge.length > 3 && (
                <input
                  type="text"
                  placeholder="Buscar en la memoria de la finca..."
                  value={knowledgeSearch}
                  onChange={(e) => setKnowledgeSearch(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.74rem',
                    outline: 'none',
                    backgroundColor: '#fafafa',
                  }}
                />
              )}

              {/* Lista de hechos memorizados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {farmKnowledge.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 16px',
                      color: '#94a3b8',
                      fontSize: '0.78rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: 8,
                      border: '1px dashed #cbd5e1',
                    }}
                  >
                    <Brain size={24} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                      Aún no hay conocimientos grabados
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                      Enseña a la IA diciendo en el chat <i>"Recuerda que..."</i> o agrega un hecho en el formulario superior.
                    </p>
                  </div>
                ) : (
                  farmKnowledge
                    .filter((k) => {
                      if (!knowledgeSearch.trim()) return true;
                      const q = knowledgeSearch.toLowerCase();
                      return (
                        (k.title && k.title.toLowerCase().includes(q)) ||
                        (k.content && k.content.toLowerCase().includes(q)) ||
                        (k.category && k.category.toLowerCase().includes(q))
                      );
                    })
                    .map((item) => {
                      const categoryColors = {
                        cultivo: { bg: '#dcfce7', text: '#15803d', label: '🌱 Cultivo' },
                        riego: { bg: '#e0f2fe', text: '#0369a1', label: '💧 Riego' },
                        parcela: { bg: '#fef3c7', text: '#b45309', label: '📍 Parcela' },
                        maquinaria: { bg: '#f1f5f9', text: '#475569', label: '🚜 Maquinaria' },
                        suelo: { bg: '#fae8ff', text: '#86198f', label: '🧪 Suelo' },
                        plaga: { bg: '#fee2e2', text: '#b91c1c', label: '🐛 Plaga' },
                        proveedor: { bg: '#ede9fe', text: '#6d28d9', label: '🤝 Proveedor' },
                        protocolo: { bg: '#ffedd5', text: '#c2410c', label: '📋 Protocolo' },
                        general: { bg: '#f3f4f6', text: '#374151', label: '📌 General' },
                      };
                      const catInfo = categoryColors[item.category] || categoryColors.general;

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 8,
                                  backgroundColor: catInfo.bg,
                                  color: catInfo.text,
                                }}
                              >
                                {catInfo.label}
                              </span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                {item.title}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteKnowledge(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                padding: '2px',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s',
                              }}
                              title="Eliminar de la memoria"
                              aria-label="Eliminar de la memoria"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <p style={{ margin: 0, fontSize: '0.74rem', color: '#475569', lineHeight: 1.45 }}>
                            {item.content}
                          </p>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, fontSize: '0.64rem', color: '#94a3b8' }}>
                            <span>Origen: {item.source === 'chat' ? '💬 Chat IA' : '✍️ Manual'} ({item.user_name || 'Admin'})</span>
                            <span>{item.created_at ? item.created_at.split('T')[0] : ''}</span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de Catastro y Mapa Satélite EN VIVO (Puntos y Caminos) ────── */}
      {isInventoryMapOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsInventoryMapOpen(false)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: 960,
              width: '96vw',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal con Pestañas */}
            <div style={{ ...styles.modalHeader, padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="#00979d" />
                <div>
                  <p style={{ ...styles.modalTitle, fontSize: '0.92rem' }}>Catastro y Mapa Satélite — Campito Jorox</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b' }}>
                    {farmInventory.length} puntos | {farmPaths.length} caminos y senderos trazados
                  </p>
                </div>
              </div>

              {/* Botones de Pestañas (Tabs) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setInventoryModalTab('map')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'map' ? '#00979d' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'map' ? '#00979d' : '#ffffff',
                    color: inventoryModalTab === 'map' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Map size={13} />
                  <span>Mapa Satélite</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInventoryModalTab('inventory')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'inventory' ? '#10b981' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'inventory' ? '#10b981' : '#ffffff',
                    color: inventoryModalTab === 'inventory' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <MapPin size={13} />
                  <span>Árboles ({farmInventory.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInventoryModalTab('paths')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: inventoryModalTab === 'paths' ? '#f97316' : '#cbd5e1',
                    backgroundColor: inventoryModalTab === 'paths' ? '#f97316' : '#ffffff',
                    color: inventoryModalTab === 'paths' ? '#ffffff' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Navigation size={13} />
                  <span>Caminos ({farmPaths.length})</span>
                </button>

                <button
                  onClick={() => setIsInventoryMapOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                  aria-label="Cerrar modal de mapa"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Cuerpo del Modal */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* PESTAÑA 1: MAPA SATÉLITE EN VIVO */}
              {inventoryModalTab === 'map' && (
                <div style={{ width: '100%', height: '100%', minHeight: 400 }}>
                  <FarmSatelliteMap
                    inventory={farmInventory}
                    paths={farmPaths}
                    onReloadInventory={reloadInventory}
                    onReloadPaths={reloadPaths}
                    lastRecordedGpsTrack={lastRecordedGpsTrack}
                    onPathCreated={(newP) => setFarmPaths((prev) => [newP, ...prev])}
                  />
                </div>
              )}

              {/* PESTAÑA 2: LISTA DE ÁRBOLES E INFRAESTRUCTURA */}
              {inventoryModalTab === 'inventory' && (
                <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
                  {/* Barra de Descargas y Exportaciones */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        📥 Descarga Segura y Fichero para el Usuario
                      </span>
                      <a
                        href="https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#0284c7',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        Google My Maps Jorox
                        <ExternalLink size={10} />
                      </a>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      <button
                        onClick={() => exportInventoryToExcel(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <FileSpreadsheet size={13} />
                        Excel
                      </button>

                      <button
                        onClick={() => exportInventoryToPDF(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Download size={13} />
                        PDF
                      </button>

                      <button
                        onClick={() => exportInventoryToKML(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Map size={13} />
                        KML
                      </button>

                      <button
                        onClick={() => exportInventoryToGeoJSON(farmInventory, farmPaths)}
                        disabled={farmInventory.length === 0 && farmPaths.length === 0}
                        style={{
                          padding: '8px 10px',
                          backgroundColor: '#475569',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Layers size={13} />
                        GeoJSON
                      </button>
                    </div>
                  </div>

                  {/* Filtro y Búsqueda */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Buscar por árbol, variedad o notas..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.75rem',
                        outline: 'none',
                        backgroundColor: '#fafafa',
                      }}
                    />
                    <select
                      value={inventoryCategoryFilter}
                      onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.72rem',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <option value="all">Todas ({farmInventory.length})</option>
                      <option value="arbol">🥑 Árboles</option>
                      <option value="riego_linea">💧 Riego / Tuberías</option>
                      <option value="arqueta">🔲 Arquetas</option>
                      <option value="acequia">🧱 Acequias / Albercas</option>
                      <option value="piedra_linde">🪨 Piedras de Linde</option>
                    </select>
                  </div>

                  {/* Lista de elementos georreferenciados */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {farmInventory.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '24px 16px',
                          color: '#94a3b8',
                          fontSize: '0.78rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: 8,
                          border: '1px dashed #cbd5e1',
                        }}
                      >
                        <MapPin size={24} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                        <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                          Aún no hay árboles ni puntos georreferenciados
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                          Inicia una caminata en campo con el botón <b>🧭 (Navegación)</b> del chat para mapear con voz y GPS.
                        </p>
                      </div>
                    ) : (
                      farmInventory
                        .filter((item) => {
                          if (inventoryCategoryFilter !== 'all') {
                            const cat = (item.category || item.tipo || '').toLowerCase();
                            if (!cat.includes(inventoryCategoryFilter)) return false;
                          }
                          if (!inventorySearch.trim()) return true;
                          const q = inventorySearch.toLowerCase();
                          return (
                            (item.name && item.name.toLowerCase().includes(q)) ||
                            (item.variety_type && item.variety_type.toLowerCase().includes(q)) ||
                            (item.notes && item.notes.toLowerCase().includes(q)) ||
                            (item.status && item.status.toLowerCase().includes(q))
                          );
                        })
                        .map((item) => {
                          const lat = item.latitude || (item.coordenadas && item.coordenadas.lat);
                          const lng = item.longitude || (item.coordenadas && item.coordenadas.lng);
                          const acc = item.accuracy_meters || item.accuracy_m;
                          const hasWarning = item.gps_warning || item.advertencia_gps;

                          const statusColors = {
                            saludable: { bg: '#dcfce7', text: '#15803d', label: 'Saludable' },
                            clorosis: { bg: '#fef3c7', text: '#b45309', label: 'Clorosis' },
                            poda_requerida: { bg: '#fee2e2', text: '#b91c1c', label: 'Poda urgente' },
                            enfermo: { bg: '#fee2e2', text: '#991b1b', label: 'Enfermo' },
                            seco: { bg: '#f1f5f9', text: '#475569', label: 'Seco' },
                            mantenimiento: { bg: '#fef3c7', text: '#92400e', label: 'Mantenimiento' },
                            bueno: { bg: '#dcfce7', text: '#166534', label: 'Bueno' },
                          };
                          const stInfo = statusColors[item.status || item.estado] || statusColors.saludable;

                          return (
                            <div
                              key={item.id}
                              style={{
                                padding: '10px 12px',
                                backgroundColor: '#ffffff',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 5,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    {item.name || `${item.tipo || 'Árbol'} ${item.variedad || ''}`}
                                  </span>
                                  {item.variety_type && (
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                      ({item.variety_type})
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: '0.64rem',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      backgroundColor: stInfo.bg,
                                      color: stInfo.text,
                                    }}
                                  >
                                    {stInfo.label}
                                  </span>
                                </div>

                                <button
                                  onClick={() => handleDeleteInventoryItem(item.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94a3b8',
                                    padding: '2px',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                  title="Eliminar elemento"
                                  aria-label="Eliminar elemento"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#334155' }}>
                                  <MapPin size={12} color="#00979d" />
                                  <span>
                                    {lat && lng ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Sin coordenadas'}
                                  </span>
                                  {acc && (
                                    <span style={{ fontSize: '0.66rem', color: hasWarning ? '#b45309' : '#059669', fontWeight: 600 }}>
                                      (±{Number(acc).toFixed(1)}m){hasWarning ? ' ⚠️' : ''}
                                    </span>
                                  )}
                                </div>

                                {lat && lng && (
                                  <a
                                    href={`https://maps.google.com/?q=${lat},${lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '0.68rem',
                                      color: '#0284c7',
                                      textDecoration: 'none',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                    }}
                                  >
                                    Ver en Google Maps
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>

                              {(item.notes || item.observaciones) && (
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#475569', fontStyle: 'italic', lineHeight: 1.4 }}>
                                  "{item.notes || item.observaciones}"
                                </p>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {/* PESTAÑA 3: LISTA DE CAMINOS Y SENDEROS TRAZADOS */}
              {inventoryModalTab === 'paths' && (
                <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                      Caminos, Senderos y Líneas de Riego ({farmPaths.length})
                    </span>
                    <button
                      onClick={() => setInventoryModalTab('map')}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f97316',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Plus size={12} />
                      Trazar nuevo camino en el mapa
                    </button>
                  </div>

                  {farmPaths.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '28px 16px',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: 8,
                        border: '1px dashed #cbd5e1',
                      }}
                    >
                      <Navigation size={24} color="#f97316" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                        Aún no se han trazado caminos ni senderos
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                        Ve a la pestaña <b>Mapa Satélite</b> y pulsa <b>"Trazar Camino / Sendero"</b> para dibujar sobre el satélite con clics.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {farmPaths.map((p) => {
                        const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
                        return (
                          <div
                            key={p.id}
                            style={{
                              padding: '10px 12px',
                              backgroundColor: '#ffffff',
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  style={{
                                    width: 16,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: p.color || '#f97316',
                                    display: 'inline-block',
                                  }}
                                />
                                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: 6,
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.path_type}
                                </span>
                              </div>

                              <button
                                onClick={() => handleDeletePath(p.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#dc2626',
                                  padding: 2,
                                }}
                                title="Eliminar camino"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                              <span>
                                Longitud: <b>{p.length_meters ? `${Number(p.length_meters).toFixed(1)}m` : '—'}</b>
                              </span>
                              <span>
                                Nodos: <b>{coords.length} vértices</b>
                              </span>
                              <span>{p.created_at ? p.created_at.split('T')[0] : ''}</span>
                            </div>

                            {p.notes && (
                              <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                                "{p.notes}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div style={styles.messagesArea}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div key={msg.id} style={styles.bubbleRow(isUser)}>
              <div style={styles.avatar(isUser)}>
                {isUser ? <User size={13} color="#fff" /> : <Bot size={13} color="#888" />}
              </div>
              <div style={styles.bubble(isUser)}>
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="Adjunto"
                    style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, marginBottom: 6, display: 'block' }}
                  />
                )}
                {msg.audio && (
                  <div style={{ marginBottom: msg.content ? 6 : 0, maxWidth: 260 }}>
                    <audio
                      src={msg.audio.dataUrl}
                      controls
                      style={{
                        width: '100%',
                        height: 36,
                        borderRadius: 18,
                        outline: 'none',
                      }}
                    />
                    {msg.audio.duration && (
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: isUser ? 'rgba(255,255,255,0.85)' : '#64748b',
                          display: 'block',
                          marginTop: 2,
                        }}
                      >
                        🎙️ Audio ({msg.audio.duration}s)
                      </span>
                    )}
                  </div>
                )}
                {msg.content &&
                  (isUser ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  ) : (
                    <div className="chatia-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ))}
                {msg.learnedMemory && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 8,
                      padding: '4px 8px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: 6,
                      border: '1px solid #bbf7d0',
                      fontSize: '0.72rem',
                      color: '#166534',
                      fontWeight: 600,
                    }}
                  >
                    <Brain size={13} color="#16a34a" />
                    <span>Aprendido en memoria: <b>{msg.learnedMemory.title}</b></span>
                  </div>
                )}
                {msg.inventoryExportBatch && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <button
                      onClick={() => exportInventoryToExcel(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <FileSpreadsheet size={12} />
                      Descargar Excel
                    </button>
                    <button
                      onClick={() => exportInventoryToPDF(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Download size={12} />
                      Descargar PDF
                    </button>
                    <button
                      onClick={() => exportInventoryToKML(msg.inventoryExportBatch)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Map size={12} />
                      Capa KML (My Maps)
                    </button>
                    <button
                      onClick={() => {
                        setInventoryModalTab('map');
                        setIsInventoryMapOpen(true);
                      }}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#00979d',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Compass size={12} />
                      Ver en Mapa Satélite
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && <TypingIndicator currentServer={currentBadgeServer} />}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Banner de Error ─────────────────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#cc0000', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Grabando Audio con Telemetría GPS en Directo ────────────────────── */}
      {isRecording && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            borderTop: '2px solid #00979d',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  display: 'inline-block',
                  animation: 'chatPulseRed 1.2s infinite ease-in-out',
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                Grabando con GPS activo...
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  backgroundColor: '#334155',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              >
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {currentGps ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: 12,
                    backgroundColor: accuracyWarning ? '#78350f' : '#065f46',
                    color: accuracyWarning ? '#fef08a' : '#a7f3d0',
                    fontWeight: 600,
                  }}
                >
                  📍 ±{currentGps.accuracy?.toFixed(1)}m ({gpsPointsCount} lecturas)
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>📍 Buscando satélites GPS...</span>
              )}

              <button
                type="button"
                onClick={handleMicClick}
                style={{
                  padding: '5px 14px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 16,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <StopCircle size={14} />
                Detener
              </button>
            </div>
          </div>

          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            Habla libremente: registra árboles mientras caminas (<i>"Aguacate Hass"</i>), consulta dudas o pide balances.
          </span>
        </div>
      )}

      {/* ─── Preview de Audio Grabado Pendiente ───────────────────────────────── */}
      {pendingAudio && !isRecording && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #bae6fd',
            backgroundColor: '#f0f9ff',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#0284c7',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Mic size={16} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                Nota de voz ({pendingAudio.duration}s)
              </span>
              <span style={{ fontSize: '0.7rem', color: '#0369a1' }}>
                · 📍 {pendingAudio.gpsTrack?.length || 1} lecturas GPS vinculadas
              </span>
            </div>
            <audio
              src={pendingAudio.dataUrl}
              controls
              style={{
                width: '100%',
                height: 30,
                marginTop: 4,
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={() => setPendingAudio(null)}
            title="Descartar grabación"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* ─── Preview de Imagen Pendiente ─────────────────────────────────────── */}
      {pendingImage && (
        <div
          style={{
            padding: '6px 14px',
            borderTop: '1px solid #eee',
            backgroundColor: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <img
            src={pendingImage.dataUrl}
            alt="Vista previa"
            style={{ height: 46, borderRadius: 6, objectFit: 'cover' }}
          />
          <span style={{ fontSize: '0.78rem', color: '#666', flex: 1 }}>Foto lista para enviar</span>
          <button
            onClick={() => setPendingImage(null)}
            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Barra de Input Inferior ─────────────────────────────────────────── */}
      <div style={styles.inputBar}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Botón Cámara */}
        <button
          className="chatia-iconbtn"
          style={styles.iconBtn(!!pendingImage)}
          onClick={handleCameraClick}
          aria-label="Adjuntar foto"
        >
          <Camera size={18} />
        </button>

        {/* Input Texto */}
        <textarea
          ref={inputRef}
          className="chatia-input"
          style={styles.textInput}
          placeholder={`Escribe a ${currentBadgeServer.name}...`}
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            if (currentUserId) {
              try {
                localStorage.setItem(`campito_chat_draft_${currentUserId}`, val);
              } catch {
                // ignore
              }
            }
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="on"
          spellCheck="true"
        />

        {/* Botón Micrófono */}
        <button
          type="button"
          className="chatia-iconbtn"
          style={{
            ...styles.iconBtn(isRecording),
            backgroundColor: isRecording ? '#dc2626' : (pendingAudio ? '#0284c7' : '#f0f0f0'),
            color: isRecording || pendingAudio ? '#ffffff' : '#555',
            boxShadow: isRecording ? '0 0 10px rgba(220, 38, 38, 0.6)' : 'none',
          }}
          onClick={handleMicClick}
          aria-label={isRecording ? 'Detener grabación' : 'Grabar audio'}
          title={isRecording ? 'Detener grabación' : (pendingAudio ? 'Grabación lista para enviar' : 'Grabar mensaje de voz')}
        >
          {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
        </button>

        {/* Botón Enviar */}
        <button
          className="chatia-iconbtn"
          style={styles.sendBtn(hasText)}
          onClick={() => sendMessage()}
          disabled={!hasText || isLoading}
          aria-label="Enviar mensaje"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
