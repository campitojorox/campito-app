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
  CreditCard
} from 'lucide-react';
import { supabase } from '../supabaseClient';

// ─── Configuración de Modelos de Gemini (Ordenados de más a menos potente) ─────
const GEMINI_SERVERS = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    level: 'pro',
    badgeColor: '#3b82f6', // Azul
    desc: 'El modelo más potente. Máxima capacidad deductiva, análisis y lógica',
    recommended: true,
    available: true,
    hasCreditsLink: true,
    actionUrl: 'https://aistudio.google.com/plan_information',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    level: 'pro',
    badgeColor: '#0ea5e9', // Celeste
    desc: 'Alta precisión para tablas financieras complejas y planificación',
    recommended: false,
    available: true,
    hasCreditsLink: true,
    actionUrl: 'https://aistudio.google.com/plan_information',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    level: 'high',
    badgeColor: '#8b5cf6', // Púrpura
    desc: 'Razonamiento avanzado, análisis profundo de cosechas y balances',
    recommended: false,
    available: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    level: 'medium',
    badgeColor: '#10b981', // Verde
    desc: 'Equilibrado, 1M contexto, veloz y alta precisión',
    recommended: false,
    available: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    level: 'eco',
    badgeColor: '#f59e0b', // Ámbar
    desc: 'Ultra ligero, mínima latencia, respaldo seguro de cuota',
    recommended: false,
    available: true,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    level: 'next-gen',
    badgeColor: '#ec4899', // Rosa
    desc: 'Próxima generación de arquitectura neuronal (Preview)',
    recommended: false,
    available: false,
    comingSoon: true,
  },
];

const SYSTEM_PROMPT = `Eres el asistente IA de **Campito Jorox**, una finca de explotación agrícola.

🔒 **CONFIDENCIALIDAD ESTRICTA (ENTORNO PRIVADO Y CERRADO)**:
- Toda la información subida a este chat (textos, documentos, imágenes, audios, fotos de plagas, facturas, transacciones y contabilidad) es ESTRICTAMENTE CONFIDENCIAL de Campito Jorox.
- Se permite la importación y análisis interno de información para la gestión de la finca, pero NUNCA su exportación, divulgación o compartición con servidores o entidades externas.
- Toda la información permanece bajo custodia exclusiva de los administradores de Campito Jorox.

Tu función es ayudar con:
- 🌿 **Gestión agrícola**: planificación de cultivos, mantenimiento de la finca, control de plagas, riego, poda, cosecha
- 💰 **Contabilidad y finanzas**: análisis de transacciones, gastos, ingresos, resúmenes económicos
- 📅 **Planificación**: organización de tareas, eventos, temporadas
- 📊 **Análisis de datos**: interpretar los datos de la app, tendencias, estadísticas
- 📝 **Documentación**: ayudar a registrar información sobre la finca
- 🗺️ **Gestión territorial**: orientación sobre mapas, parcelas, zonas de la finca

Cuando tengas datos de transacciones o eventos del contexto, úsalos para dar respuestas precisas y basadas en datos reales.
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

        const [{ data: transactions }, { data: events }] = await Promise.all([
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
        ]);

        let ctx = '';
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
        setActiveServer(serverThatAnswered);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: successResult,
            serverUsed: serverThatAnswered,
          },
        ]);
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
            <p style={styles.headerTitle}>Asistente IA</p>
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
            {fallbackNotice.from.hasCreditsLink && (
              <a
                href={fallbackNotice.from.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#92400e',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  marginLeft: 4,
                }}
              >
                Recargar créditos
                <ExternalLink size={10} />
              </a>
            )}
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
                          {!isConnectedNow && srv.available && !srv.hasCreditsLink && (
                            <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 600 }}>
                              Cuota Activa
                            </span>
                          )}
                          {!isConnectedNow && srv.hasCreditsLink && (
                            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500 }}>
                              Requiere Plan Pro
                            </span>
                          )}
                          {srv.comingSoon && (
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
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

                    {/* Enlace discreto solo para Pro no conectado si el usuario quiere activarlo */}
                    {srv.hasCreditsLink && !isConnectedNow && (
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: '#64748b',
                          paddingTop: 4,
                          borderTop: '1px solid #f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>Para usar Pro activa facturación en AI Studio</span>
                        <a
                          href={srv.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#0284c7',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          Ver planes
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
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

      {/* ─── Área de Mensajes ────────────────────────────────────────────────── */}
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
