// src/pages/ChatIA.jsx — Chat IA Campito Jorox
// Interfaz de chat con Gemini 2.0 Flash — llamada directa desde el navegador
// La API key se expone solo con VITE_ prefix (cliente). Para producción usar api/chat.js en Vercel.

import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Mic, Camera, StopCircle, Bot, User, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';

// ─── Cliente Gemini ────────────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const SYSTEM_PROMPT = `Eres el asistente IA de **Campito Jorox**, una finca de explotación agrícola.

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

// ─── Estilos inline ────────────────────────────────────────────────────────────
const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e8e8e8',
    flexShrink: 0,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
  },
  headerSub: {
    fontSize: '0.72rem',
    color: '#888',
    margin: 0,
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  // Burbuja de mensaje
  bubbleRow: (isUser) => ({
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    alignItems: 'flex-end',
    gap: '7px',
  }),
  avatar: (isUser) => ({
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: isUser ? '#00979d' : '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    order: isUser ? 1 : 0,
  }),
  bubble: (isUser) => ({
    maxWidth: '78%',
    padding: '10px 13px',
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    backgroundColor: isUser ? '#00979d' : '#f5f5f5',
    color: isUser ? '#ffffff' : '#1a1a1a',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    wordBreak: 'break-word',
  }),
  // Indicador de escritura
  typingDots: {
    display: 'flex',
    gap: '4px',
    padding: '4px 2px',
    alignItems: 'center',
  },
  // Barra de input inferior
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
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: '#fff0f0',
    color: '#cc0000',
    fontSize: '0.8rem',
    borderTop: '1px solid #ffcccc',
  },
  imagePreview: {
    maxWidth: 200,
    maxHeight: 150,
    borderRadius: 8,
    marginTop: 4,
    display: 'block',
  },
};

// ─── Componente TypingIndicator ─────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={styles.bubbleRow(false)}>
      <div style={styles.avatar(false)}>
        <Bot size={14} color="#888" />
      </div>
      <div style={{ ...styles.bubble(false), padding: '12px 16px' }}>
        <div style={styles.typingDots}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#00979d',
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

// ─── Componente principal ChatIA ────────────────────────────────────────────────
export default function ChatIA() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy el asistente IA de **Campito Jorox** 🌿\n\nPuedo ayudarte con:\n- Consultas sobre la finca y cultivos\n- Análisis de tus transacciones y gastos\n- Planificación de tareas y eventos\n- Fotos de plagas o documentos de la finca\n\n¿En qué te puedo ayudar hoy?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  // Contexto de Supabase cargado UNA SOLA VEZ al montar el componente
  const contextDataRef = useRef('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // ── Cargar contexto Supabase al abrir el chat (una vez, en paralelo) ──────────
  useEffect(() => {
    const loadContext = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Ambas consultas en paralelo para máxima velocidad
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
          const ingresos = transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
          const gastos = transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
          ctx += `\n\n📊 DATOS REALES (${transactions.length} transacciones):\n`;
          ctx += `Ingresos: €${ingresos.toFixed(2)} | Gastos: €${gastos.toFixed(2)} | Balance: €${(ingresos - gastos).toFixed(2)}\n`;
          ctx += `Últimas transacciones:\n`;
          transactions.slice(0, 12).forEach(t => {
            ctx += `- [${t.date}] ${t.type?.toUpperCase()}: €${t.amount} — ${t.description || t.category || ''}\n`;
          });
        }
        if (events?.length > 0) {
          ctx += `\nEventos próximos:\n`;
          events.forEach(e => { ctx += `- [${e.start_date}] ${e.title} ${e.category ? `(${e.category})` : ''}\n`; });
        }
        contextDataRef.current = ctx;
      } catch (err) {
        console.warn('No se pudo cargar contexto Supabase:', err.message);
      }
    };
    loadContext();
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // CSS de animación para los puntos
  useEffect(() => {
    const styleId = 'chatia-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-6px); opacity: 1; }
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

  // ── Enviar mensaje ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (textOverride = null, imageData = null) => {
    const text = textOverride ?? input.trim();
    const img = imageData ?? pendingImage;

    if (!text && !img) return;
    if (isLoading) return;

    if (!genAI) {
      setError('API key de Gemini no configurada. Revisa el archivo .env (VITE_GEMINI_API_KEY).');
      return;
    }

    // Construir mensaje del usuario
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

    try {
      // Usar contexto ya cargado al inicio (sin volver a consultar Supabase)
      const contextData = contextDataRef.current;

      // Preparar historial para Gemini (excluyendo mensaje de bienvenida)
      const history = updatedMessages
        .slice(0, -1) // sin el último (que ya lo enviamos aparte)
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content || '' }],
        }));

      const model = genAI.getGenerativeModel({
        model: 'gemini-3.8-flash',
        systemInstruction: SYSTEM_PROMPT + contextData,
      });

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(text || '(imagen adjunta)');
      const response = await result.response;
      const aiText = response.text();

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: aiText,
        },
      ]);
    } catch (err) {
      console.error('Error Gemini:', err);
      setError(err.message?.includes('API_KEY') 
        ? 'API key inválida. Verifica VITE_GEMINI_API_KEY en .env'
        : 'Error al conectar con el asistente. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, isLoading, pendingImage]);

  // ── Tecla Enter (sin Shift) envía ─────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Cámara / imagen ───────────────────────────────────────────────────────────
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
    // Reset para permitir seleccionar la misma imagen de nuevo
    e.target.value = '';
  };

  // ── Audio / micrófono ─────────────────────────────────────────────────────────
  const handleMicClick = async () => {
    if (isRecording) {
      // Detener grabación
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

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        // Por ahora: indicar al usuario que el audio se envía como texto
        // (Phase 2 implementará transcripción real via Gemini multimodal)
        const duration = Math.round(audioChunksRef.current.length * 0.1);
        setInput(prev => prev + (prev ? ' ' : '') + `[Audio ${duration}s — transcripción próximamente]`);
        inputRef.current?.focus();
      };

      mediaRecorder.start(100); // chunks de 100ms
      setIsRecording(true);
    } catch (err) {
      setError('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const hasText = input.trim().length > 0 || pendingImage !== null;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Bot size={18} color="#ffffff" />
        </div>
        <div>
          <p style={styles.headerTitle}>Asistente IA</p>
          <p style={styles.headerSub}>Campito Jorox · Gemini 3.8</p>
        </div>
      </div>

      {/* Área de mensajes */}
      <div style={styles.messagesArea}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} style={styles.bubbleRow(isUser)}>
              <div style={styles.avatar(isUser)}>
                {isUser
                  ? <User size={14} color="#fff" />
                  : <Bot size={14} color="#888" />
                }
              </div>
              <div style={styles.bubble(isUser)}>
                {msg.image && (
                  <img src={msg.image} alt="Imagen adjunta" style={styles.imagePreview} />
                )}
                {msg.content && (
                  isUser
                    ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    : (
                      <div className="chatia-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )
                )}
              </div>
            </div>
          );
        })}

        {/* Indicador de carga */}
        {isLoading && <TypingIndicator />}

        {/* Referencia para auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Banner de error */}
      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Preview de imagen pendiente */}
      {pendingImage && (
        <div style={{ padding: '6px 14px', borderTop: '1px solid #eee', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={pendingImage.dataUrl} alt="Vista previa" style={{ height: 48, borderRadius: 6, objectFit: 'cover' }} />
          <span style={{ fontSize: '0.78rem', color: '#666', flex: 1 }}>Imagen lista para enviar</span>
          <button onClick={() => setPendingImage(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Barra de input */}
      <div style={styles.inputBar}>
        {/* Input oculto para cámara */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Botón cámara */}
        <button
          className="chatia-iconbtn"
          style={styles.iconBtn(!!pendingImage)}
          onClick={handleCameraClick}
          aria-label="Adjuntar foto"
        >
          <Camera size={18} />
        </button>

        {/* Campo de texto */}
        <textarea
          ref={inputRef}
          className="chatia-input"
          style={styles.textInput}
          placeholder="Escribe tu pregunta..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
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

        {/* Botón micrófono */}
        <button
          className="chatia-iconbtn"
          style={styles.iconBtn(isRecording)}
          onClick={handleMicClick}
          aria-label={isRecording ? 'Detener grabación' : 'Grabar audio'}
        >
          {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
        </button>

        {/* Botón enviar */}
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

