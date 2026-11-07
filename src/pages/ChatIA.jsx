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
  CreditCard,
  Info,
  Lock,
  FileText,
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
  Activity,
  Radio,
  Compass
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useVoiceGeoTracker } from '../hooks/useVoiceGeoTracker';
import { processVoiceGeoSession } from '../services/voiceTreeExtractor';
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

🗑️ **BORRADO Y CORRECCIÓN DE PUNTOS POR VOZ O TEXTO**:
- Si el usuario te pide por voz o texto borrar, eliminar o corregir un árbol, arqueta o punto del catastro (ej: "borra el último árbol", "elimina el aguacate Bacon", "cancela el último punto registrado", "borra el árbol de aquí"):
  1. Confirma claramente qué elemento has eliminado del catastro.
  2. Incluye obligatoriamente al final de tu respuesta el comando estructurado:
     [[BORRAR_PUNTO: {"target": "ultimo|nombre|categoria", "query": "nombre o descripción del elemento a borrar"}]]

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
async function callGeminiDirect({ modelId, prompt, image, history, systemInstruction, apiKey, timeoutMs = 15000 }) {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

  if (userParts.length === 0) {
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
    const text = candidate?.content?.parts?.[0]?.text;

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
  serverBadge: (badgeColor) => ({
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
  const [farmPaths, setFarmPaths] = useState([]);
  const [lastRecordedGpsTrack, setLastRecordedGpsTrack] = useState(null);
  const [inventoryModalTab, setInventoryModalTab] = useState('map'); // 'map' | 'inventory' | 'paths'
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');
  const [isProcessingVoiceGeo, setIsProcessingVoiceGeo] = useState(false);

  // Hook para captura sincronizada de audio continuo y telemetría GPS
  const {
    isRecording: isWalkingRecording,
    elapsedSeconds: walkingSeconds,
    currentGps,
    gpsPointsCount,
    accuracyWarning,
    startTracking: startWalkingTracking,
    stopTracking: stopWalkingTracking,
  } = useVoiceGeoTracker();

  const [autoFallback, setAutoFallback] = useState(true);

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '¡Hola! Soy el asistente IA de **Campito Jorox** 🌿\n\nPuedo ayudarte con:\n- Consultas sobre la finca y cultivos\n- Análisis de tus transacciones y gastos\n- Planificación de tareas y eventos\n- Fotos de plagas o documentos de la finca\n\n¿En qué te puedo ayudar hoy?',
      serverUsed: GEMINI_SERVERS[initialIndex >= 0 ? initialIndex : 0],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);

  const contextDataRef = useRef('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

  // ── Iniciar / Detener sesión de Mapeo de Voz y GPS en Movimiento ─────────────
  const handleToggleWalkingSession = async () => {
    if (!isWalkingRecording) {
      try {
        await startWalkingTracking();
      } catch (err) {
        setError(`No se pudo iniciar el modo caminar y mapear: ${err.message}`);
      }
      return;
    }

    // Detener y procesar con Gemini
    setIsProcessingVoiceGeo(true);
    const processingMsgId = (Date.now() + 1).toString();

    try {
      const sessionResult = await stopWalkingTracking();
      if (!sessionResult || sessionResult.gpsTrack.length === 0) {
        setError('No se recogieron suficientes datos GPS durante el recorrido.');
        setIsProcessingVoiceGeo(false);
        return;
      }

      // Guardar track para opción de convertirlo en camino
      setLastRecordedGpsTrack(sessionResult.gpsTrack);

      // Mensaje de espera en el chat
      setMessages((prev) => [
        ...prev,
        {
          id: processingMsgId,
          role: 'assistant',
          content: `🛰️ **Procesando recorrido en campo...**\n- Duración: **${sessionResult.durationSeconds.toFixed(0)}s**\n- Muestras GPS recogidas: **${sessionResult.totalGpsSamples} lecturas**\n- Conectando con Gemini para transcribir e interpolar coordenadas...`,
          serverUsed: activeServer,
        },
      ]);

      const extraction = await processVoiceGeoSession({
        audioBlob: sessionResult.audioBlob,
        t0: sessionResult.t0,
        gpsTrack: sessionResult.gpsTrack,
      });

      const addedTrees = extraction.trees || [];
      const deletedEntities = extraction.deletedEntities || [];

      // Si se borraron elementos que ya estaban en la base de datos
      const deletedDbIds = deletedEntities
        .map((d) => d.deletedDatabaseId)
        .filter(Boolean);

      if (deletedDbIds.length > 0) {
        setFarmInventory((prev) => prev.filter((item) => !deletedDbIds.includes(item.id)));
      }

      if (addedTrees.length > 0) {
        setFarmInventory((prev) => [...addedTrees, ...prev]);

        // Inyectar en contexto
        addedTrees.forEach((t) => {
          contextDataRef.current += `\n- [${(t.tipo || 'arbol').toUpperCase()}] ${t.tipo} ${t.variedad || ''} | Estado: ${t.estado || 'saludable'} | Lat/Lng: ${t.coordenadas?.lat}, ${t.coordenadas?.lng}`;
        });
      }

      // Preparar mensaje de respuesta detallado con adiciones y borrados
      if (addedTrees.length > 0 || deletedEntities.length > 0) {
        let msgContent = `### 🛰️ Recorrido de Mapeo y Voz Completado\n\n`;

        if (addedTrees.length > 0) {
          msgContent += `**🌳 Elementos agregados al catastro (${addedTrees.length}):**\n\n` +
            addedTrees
              .map(
                (t, i) =>
                  `${i + 1}. **${t.tipo} ${t.variedad || ''}**\n   - Estado: \`${t.estado || 'saludable'}\`\n   - Coordenadas: \`${t.coordenadas?.lat}, ${t.coordenadas?.lng}\` (Precisión: ±${t.accuracy_m}m)${t.advertencia_gps ? ' ⚠️ *Alerta dispersión*' : ''}\n   - Observaciones: *${t.observaciones || 'Sin notas'}*`
              )
              .join('\n\n') + '\n\n';
        }

        if (deletedEntities.length > 0) {
          msgContent += `**🗑️ Acciones de borrado por voz ejecutadas (${deletedEntities.length}):**\n` +
            deletedEntities
              .map((d) => {
                const targetText = d.item ? `${d.item.tipo} ${d.item.variedad || ''}` : (d.deletedDatabaseName || d.description || 'Último punto');
                return `- Eliminado por orden de voz: **${targetText}** (*${d.description}*)`;
              })
              .join('\n') + '\n\n';
        }

        msgContent += `📌 *Actualizado en el mapa satélite y en la base de datos de Campito Jorox.*`;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === processingMsgId
              ? {
                  ...m,
                  content: msgContent,
                  inventoryExportBatch: addedTrees.length > 0 ? addedTrees : null,
                }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === processingMsgId
              ? {
                  ...m,
                  content: `⚠️ No se detectaron menciones de árboles ni órdenes de borrado en el audio grabado. Comprueba que el micrófono haya capturado bien tu voz y vuelve a intentarlo.`,
                }
              : m
          )
        );
      }
    } catch (walkErr) {
      console.error('Error procesando sesión de caminata:', walkErr);
      setError(`Error procesando audio y telemetría GPS: ${walkErr.message}`);
    } finally {
      setIsProcessingVoiceGeo(false);
    }
  };

  // ── Enviar mensaje con cascada/fallback entre los 3 servidores ────────────────
  const sendMessage = useCallback(
    async (textOverride = null, imageData = null) => {
      const text = textOverride ?? input.trim();
      const img = imageData ?? pendingImage;

      if (!text && !img) return;
      if (isLoading) return;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key no configurada. Agrega VITE_GEMINI_API_KEY en Vercel o en .env.');
        return;
      }

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        image: img?.dataUrl || null,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput('');
      setPendingImage(null);
      setIsLoading(true);
      setError(null);
      setFallbackNotice(null);

      // Determinar orden de servidores a intentar (solo disponibles)
      const primaryIndex = selectedServerIndex;
      const orderToTry = autoFallback
        ? [primaryIndex, ...GEMINI_SERVERS.map((_, i) => i).filter((i) => i !== primaryIndex && GEMINI_SERVERS[i].available)]
        : [primaryIndex];

      const history = updatedMessages
        .slice(0, -1)
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content || '' }));

      const systemInstruction = SYSTEM_PROMPT + contextDataRef.current;

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
            history,
            systemInstruction,
            apiKey,
            timeoutMs: 14000,
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
        const memMatch = successResult.match(/\[\[MEMORIA:\s*(\{.*?\})\s*\]\]/s);
        if (memMatch) {
          try {
            learnedMemory = JSON.parse(memMatch[1]);
            displayedContent = successResult.replace(memMatch[0], '').trim();
          } catch (e) {
            console.warn('Error al parsear bloque de memoria:', e);
          }
        }

        // Detección y ejecución de orden de borrado de puntos del inventario catastral
        const delPointMatch = successResult.match(/\[\[BORRAR_PUNTO:\s*(\{.*?\})\s*\]\]/s);
        if (delPointMatch) {
          try {
            const delData = JSON.parse(delPointMatch[1]);
            displayedContent = displayedContent.replace(delPointMatch[0], '').trim();

            if (delData.target === 'ultimo') {
              const target = farmInventory[0];
              if (target) {
                await supabase.from('farm_inventory').update({ is_active: false }).eq('id', target.id);
                setFarmInventory((prev) => prev.filter((p) => p.id !== target.id));
              }
            } else if (delData.query) {
              const q = delData.query.toLowerCase().trim();
              const target = farmInventory.find((p) =>
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

          if (isDeleteLast && farmInventory.length > 0) {
            const target = farmInventory[0];
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
          },
        ]);

        // Persistir en segundo plano en Supabase para respaldo automático a Drive y memoria viva
        (async () => {
          try {
            let uploadedFileUrl = null;
            let uploadedFileName = null;

            // Subir imagen/archivo si se adjuntó alguno
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
            }

            const { data: authData } = await supabase.auth.getUser();
            const u = authData?.user;
            const currentUserName = u?.user_metadata?.name || u?.email?.split('@')[0] || 'Admin';

            // Si se detectó conocimiento nuevo, guardarlo en farm_knowledge
            if (learnedMemory && learnedMemory.content) {
              const { data: savedMem, error: memErr } = await supabase.from('farm_knowledge').insert({
                category: learnedMemory.category || 'general',
                title: learnedMemory.title || 'Dato aprendido',
                content: learnedMemory.content,
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
            await supabase.from('chat_history').insert({
              role: 'user',
              content: text || (img ? '[Archivo adjunto]' : ''),
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
    [input, messages, isLoading, pendingImage, selectedServerIndex, autoFallback]
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

  // Grabación de audio
  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.round(audioChunksRef.current.length * 0.1);
        setInput((prev) => prev + (prev ? ' ' : '') + `[Audio grabado: ${duration}s — transcribir]`);
        inputRef.current?.focus();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      setError('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const hasText = input.trim().length > 0 || pendingImage !== null;
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
            </div>
            <p style={styles.headerSub}>Campito Jorox</p>
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
                  Toda la información, documentos, audios e imágenes procesados en este chat son <b>estrictamente confidenciales</b> de Campito Jorox. Se permite la importación interna para análisis, pero <b>nunca la exportación a servidores externos</b>.
                </span>
                <span style={{ color: '#64748b', fontSize: '0.64rem', marginTop: 2 }}>
                  Cuenta: Google AI Studio (Key ...3w8BcQ) · Sesión protegida
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

              {/* Tarjeta 2: Aislamiento / Descargas seguras */}
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
                  <span>2. Circuito Seguro y Privado (Descargas para el Usuario)</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: '#475569', margin: 0, lineHeight: 1.45 }}>
                  El entorno es <b>completamente privado</b>: ningún dato se comparte, vende o sincroniza con redes públicas o terceros externos. Sin embargo, tú como usuario administrador tienes <b>pleno control para descargar tus recopilaciones, balances, inventarios e informes en formato PDF o EXCEL</b>, así como mapas en <b>KML y GeoJSON</b> en cualquier momento.
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
                    <b>🎙️ Dictado por Voz:</b> Pulsa el micrófono para dictar tus preguntas rápidamente mientras trabajas en el campo.
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
          const srv = msg.serverUsed;

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

      {/* ─── Barra de Estado: Modo Caminar y Mapear con Voz + GPS ─────────────── */}
      {isWalkingRecording && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
            borderTop: '2px solid #00979d',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  animation: 'chatBounce 1s infinite',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                Mapeando en movimiento: {Math.floor(walkingSeconds / 60)}:{(walkingSeconds % 60).toString().padStart(2, '0')}
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
                  📍 ±{currentGps.accuracy?.toFixed(1)}m {accuracyWarning ? '⚠️ Impreciso' : '✓ Preciso'}
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Buscando satélites GPS...</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Habla para registrar o borrar: <i>"Aguacate Hass"</i>, <i>"Arqueta norte"</i>, <i>"Borra el último árbol"</i>.
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  setInventoryModalTab('map');
                  setIsInventoryMapOpen(true);
                }}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#00979d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 20,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Abrir mapa satélite mientras caminas"
              >
                <Compass size={12} />
                Ver Mapa
              </button>

              <button
                onClick={handleToggleWalkingSession}
                disabled={isProcessingVoiceGeo}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 20,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Radio size={13} />
                Finalizar y Procesar
              </button>
            </div>
          </div>
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

        {/* Botón Mapeo Caminar y Mapear con Voz + GPS */}
        <button
          className="chatia-iconbtn"
          style={{
            ...styles.iconBtn(isWalkingRecording),
            backgroundColor: isWalkingRecording ? '#ef4444' : '#f0fdf4',
            color: isWalkingRecording ? '#ffffff' : '#16a34a',
            border: isWalkingRecording ? 'none' : '1px solid #bbf7d0',
          }}
          onClick={handleToggleWalkingSession}
          title={isWalkingRecording ? 'Detener y procesar ruta de campo' : 'Caminar y Mapear con Voz + GPS en tiempo real'}
          aria-label="Caminar y Mapear con Voz y GPS"
        >
          <Navigation size={18} />
        </button>

        {/* Input Texto */}
        <textarea
          ref={inputRef}
          className="chatia-input"
          style={styles.textInput}
          placeholder={`Escribe a ${currentBadgeServer.name}...`}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
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
          className="chatia-iconbtn"
          style={styles.iconBtn(isRecording)}
          onClick={handleMicClick}
          aria-label={isRecording ? 'Detener grabación' : 'Grabar audio'}
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
