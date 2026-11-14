// src/context/ChatContext.jsx
// Contexto Global de Chat IA para Campito Jorox (Arquitectura de Estado Global en SPA)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { GEMINI_SERVERS, callGeminiDirect } from '../services/geminiDirectClient';
import { SYSTEM_PROMPT, buildComprehensiveFincaContext } from '../services/fincaContextBuilder';
import { processChatResponseActions, persistChatTurnToHistory } from '../services/chatIaActions';
import { normalizeAttachments } from '../utils/attachmentUtils';
import { indexDocumentForRag, searchRagKnowledge, formatRagContextForPrompt, callFarmSyncProxy } from '../services/ragDocumentService';
import { getLocalInventory, getLocalPaths, getFarmCategories } from '../services/farmInventoryStorage';
import { getGlobalLastKnownGps } from '../hooks/useVoiceGeoTracker';
import { WELCOME_MESSAGE, stripLegacyGpsTag } from './chatConstants';
import { ChatContext } from './chatInstance';

function formatRemoteChatRowToMessage(row) {
  let attachments = null;
  if (row.file_url) {
    let urls = [];
    try {
      urls = row.file_url.startsWith('[') ? JSON.parse(row.file_url) : [row.file_url];
    } catch {
      urls = [row.file_url];
    }
    let names = [];
    try {
      names = row.file_name && row.file_name.startsWith('[') ? JSON.parse(row.file_name) : [row.file_name || 'archivo'];
    } catch {
      names = [row.file_name || 'archivo'];
    }

    attachments = urls.map((url, idx) => {
      if (!url || typeof url !== 'string') return null;
      const name = names[idx] || url.split('/').pop().split('?')[0] || `archivo-${idx + 1}`;
      const nameLower = name.toLowerCase();
      const isImg =
        /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(nameLower) ||
        (url.toLowerCase().includes('/chat-ia/') && /\.(jpg|jpeg|png|webp|gif)/i.test(url));
      const isPdf = nameLower.endsWith('.pdf') || url.toLowerCase().includes('.pdf');
      const isSpreadsheet = /\.(xlsx|xls|csv)$/i.test(nameLower);
      const isGeo = /\.(kml|kmz|geojson|gpx)$/i.test(nameLower);

      return {
        id: `att_${row.id}_${idx}`,
        name,
        file_url: url,
        public_url: url,
        url,
        isImage: isImg,
        isPdf,
        isSpreadsheet,
        isGeo,
      };
    }).filter(Boolean);
  }

  return {
    id: row.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    role: row.role,
    content: row.content || '',
    attachments: attachments && attachments.length > 0 ? attachments : null,
    serverUsed: row.model_used ? { name: row.model_used } : null,
    created_at: row.created_at,
  };
}

export function ChatProvider({ children, session }) {
  const initialIndex = GEMINI_SERVERS.findIndex((s) => s.id === 'gemini-2.5-flash');
  const [selectedServerIndex, setSelectedServerIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [activeServer, setActiveServer] = useState(GEMINI_SERVERS[initialIndex >= 0 ? initialIndex : 0]);
  const [autoFallback, setAutoFallback] = useState(true);
  const [fallbackNotice, setFallbackNotice] = useState(null);

  const currentUserId = session?.user?.id || 'default';

  // Sincronizar campito_last_user_id
  useEffect(() => {
    if (session?.user?.id) {
      try {
        localStorage.setItem('campito_last_user_id', session.user.id);
      } catch {
        // ignore
      }
    }
  }, [session]);

  // Estado de mensajes en memoria global (nunca se destruye al navegar en la app)
  const [messages, setMessages] = useState(() => {
    try {
      const uid = session?.user?.id || localStorage.getItem('campito_last_user_id') || 'default';
      const cached = localStorage.getItem(`campito_chat_messages_${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m) =>
            m?.role === 'user' && typeof m.content === 'string'
              ? { ...m, content: stripLegacyGpsTag(m.content) }
              : m
          );
        }
      }
    } catch (e) {
      console.warn('[ChatContext] Error leyendo caché local inicial:', e);
    }
    return [WELCOME_MESSAGE];
  });

  const [input, setInput] = useState(() => {
    try {
      const uid = session?.user?.id || localStorage.getItem('campito_last_user_id') || 'default';
      return localStorage.getItem(`campito_chat_draft_${uid}`) || '';
    } catch {
      return '';
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasUnreadReply, setHasUnreadReply] = useState(false);

  // Adjuntos pendientes
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingAudio, setPendingAudio] = useState(null);

  // Datos de finca para contexto IA en caliente
  const [farmKnowledge, setFarmKnowledge] = useState(() => {
    try {
      const raw = localStorage.getItem('campito_farm_knowledge_all');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [farmInventory, setFarmInventory] = useState([]);
  const [farmPaths, setFarmPaths] = useState([]);

  const farmInventoryRef = useRef(farmInventory);
  useEffect(() => {
    farmInventoryRef.current = farmInventory;
  }, [farmInventory]);

  const farmPathsRef = useRef(farmPaths);
  useEffect(() => {
    farmPathsRef.current = farmPaths;
  }, [farmPaths]);

  // Cargar contexto inicial de finca (inventario, caminos, conocimiento)
  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      supabase.from('farm_knowledge').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('farm_inventory').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('farm_paths').select('*').eq('is_active', true).order('created_at', { ascending: false }),
    ]).then(([knwRes, invRes, pathRes]) => {
      if (cancelled) return;

      const liveInventory =
        invRes.status === 'fulfilled' && Array.isArray(invRes.value.data) && invRes.value.data.length > 0
          ? invRes.value.data
          : getLocalInventory();
      setFarmInventory(liveInventory);

      const livePaths =
        pathRes.status === 'fulfilled' && Array.isArray(pathRes.value.data) && pathRes.value.data.length > 0
          ? pathRes.value.data
          : getLocalPaths();
      setFarmPaths(livePaths);

      let combinedKnowledge = [];
      try {
        const localRaw = localStorage.getItem('campito_farm_knowledge_all');
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed)) combinedKnowledge = [...parsed];
        }
      } catch {
        // ignore
      }

      if (knwRes.status === 'fulfilled' && Array.isArray(knwRes.value.data) && knwRes.value.data.length > 0) {
        knwRes.value.data.forEach((remoteItem) => {
          const exists = combinedKnowledge.some(
            (k) => k.id === remoteItem.id || (k.title === remoteItem.title && k.content === remoteItem.content)
          );
          if (!exists) combinedKnowledge.push(remoteItem);
        });
      }
      setFarmKnowledge(combinedKnowledge);
      try {
        localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(combinedKnowledge));
      } catch {
        // ignore
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Recargar inventario y caminos al recibir eventos globales
  const reloadInventory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('farm_inventory')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmInventory(data);
    } catch (err) {
      console.warn('[ChatContext] Error recargando inventario:', err);
    }
  }, []);

  const reloadPaths = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('farm_paths')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setFarmPaths(data);
    } catch (err) {
      console.warn('[ChatContext] Error recargando caminos:', err);
    }
  }, []);

  useEffect(() => {
    const handleInv = () => reloadInventory();
    const handlePaths = () => reloadPaths();
    window.addEventListener('farm-inventory-updated', handleInv);
    window.addEventListener('farm-paths-updated', handlePaths);
    return () => {
      window.removeEventListener('farm-inventory-updated', handleInv);
      window.removeEventListener('farm-paths-updated', handlePaths);
    };
  }, [reloadInventory, reloadPaths]);

  const handleDeleteInventoryItem = useCallback(async (id) => {
    try {
      await supabase.from('farm_inventory').update({ is_active: false }).eq('id', id);
      setFarmInventory((prev) => prev.filter((item) => item.id !== id));
      window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
    } catch (err) {
      console.warn('[ChatContext] Error eliminando elemento inventario:', err);
    }
  }, []);

  const handleDeletePath = useCallback(async (id) => {
    try {
      await supabase.from('farm_paths').update({ is_active: false }).eq('id', id);
      setFarmPaths((prev) => prev.filter((p) => p.id !== id));
      window.dispatchEvent(new CustomEvent('farm-paths-updated'));
    } catch (err) {
      console.warn('[ChatContext] Error eliminando camino:', err);
    }
  }, []);

  // ─── Sincronización bidireccional de historial con Supabase (Móvil <-> PC) ─────
  const syncChatHistoryFromRemote = useCallback(async () => {
    try {
      let remoteRows = [];
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(60);

      if (!error && Array.isArray(data) && data.length > 0) {
        remoteRows = data;
      } else {
        const proxyRes = await callFarmSyncProxy('FETCH_CHAT_HISTORY', { limit: 60 });
        if (proxyRes?.data && Array.isArray(proxyRes.data)) {
          remoteRows = proxyRes.data;
        }
      }

      if (remoteRows.length > 0) {
        const convertedMessages = remoteRows.map(formatRemoteChatRowToMessage);

        setMessages((prev) => {
          // Si el chat local solo tiene el welcome message, inicializar con el historial remoto
          if (prev.length <= 1 && prev[0]?.id === 'welcome') {
            return convertedMessages;
          }

          // Combinar y deduplicar por id o por huella de contenido
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = convertedMessages.filter((m) => !existingIds.has(m.id));

          if (toAdd.length === 0) return prev;

          const merged = [...prev, ...toAdd];
          merged.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

          const uid = currentUserId || localStorage.getItem('campito_last_user_id') || 'default';
          try {
            localStorage.setItem(`campito_chat_messages_${uid}`, JSON.stringify(merged.slice(-60)));
          } catch {
            // ignore
          }

          return merged.slice(-60);
        });
      }
    } catch (err) {
      console.warn('[ChatContext] Aviso sincronizando historial remoto:', err.message);
    }
  }, [currentUserId]);

  useEffect(() => {
    // Sincronización inicial
    syncChatHistoryFromRemote();

    // Suscripción Realtime a nuevos mensajes insertados desde móvil u ordenador
    const channel = supabase
      .channel('chat_history_realtime_sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_history' }, (payload) => {
        if (payload?.new) {
          const newMsg = formatRemoteChatRowToMessage(payload.new);
          setMessages((prev) => {
            const alreadyExists = prev.some(
              (m) =>
                m.id === newMsg.id ||
                (m.role === newMsg.role &&
                  m.content === newMsg.content &&
                  Math.abs(new Date(m.created_at || Date.now()) - new Date(newMsg.created_at || Date.now())) < 4000)
            );
            if (alreadyExists) return prev;
            const nextList = [...prev, newMsg];
            const uid = currentUserId || localStorage.getItem('campito_last_user_id') || 'default';
            try {
              localStorage.setItem(`campito_chat_messages_${uid}`, JSON.stringify(nextList.slice(-60)));
            } catch {
              // ignore
            }
            return nextList;
          });
        }
      })
      .subscribe();

    // Al volver a la pestaña o abrir la app en el móvil
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncChatHistoryFromRemote();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncChatHistoryFromRemote, currentUserId]);

  // ─── Enviar Mensaje (Se ejecuta de forma continua sin importar la pestaña) ─────
  const sendMessage = useCallback(
    async (textOverride = null, attachmentData = null, audioData = null) => {
      const text = textOverride ?? input.trim();
      const atts = attachmentData ? normalizeAttachments(attachmentData, attachmentData) : pendingAttachments;
      const aud = audioData ?? pendingAudio;

      if (!text && atts.length === 0 && !aud) return;
      if (isLoading) return;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key no configurada. Agrega VITE_GEMINI_API_KEY en Vercel o en .env.');
        return;
      }

      const fallbackAttText =
        atts.length > 1
          ? `📎 ${atts.length} archivos (${atts.map((a) => a.name).join(', ')})`
          : atts.length === 1
            ? `📎 ${atts[0].name}`
            : '';

      const tempUserMsgId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const userMsg = {
        id: tempUserMsgId,
        role: 'user',
        content: text || fallbackAttText || (aud ? '🎙️ Mensaje de voz' : ''),
        attachments:
          atts.length > 0
            ? atts.map((a) => ({
                name: a.name,
                size: a.size,
                type: a.type,
                isImage: a.isImage,
                isPdf: a.isPdf,
                isSpreadsheet: a.isSpreadsheet,
                isGeo: a.isGeo || /\.(kml|kmz|geojson|gpx)$/i.test(a.name || ''),
                dataUrl: a.dataUrl,
                file_url: a.file_url || a.public_url || null,
                public_url: a.public_url || a.file_url || null,
              }))
            : null,
        audio: aud ? { dataUrl: aud.dataUrl, duration: aud.duration } : null,
      };

      // Registrar inmediatamente el mensaje del usuario en memoria y en localStorage
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      const uidForCache = currentUserId || localStorage.getItem('campito_last_user_id') || 'default';
      try {
        localStorage.setItem(`campito_chat_messages_${uidForCache}`, JSON.stringify(updatedMessages.slice(-60)));
        localStorage.removeItem(`campito_chat_draft_${uidForCache}`);
      } catch {
        // ignore
      }

      setInput('');
      setPendingAttachments([]);
      setPendingAudio(null);
      setIsLoading(true);
      setError(null);
      setFallbackNotice(null);

      // Iniciar el procesamiento asíncrono
      (async () => {
        try {
          const primaryIndex = selectedServerIndex;
          const isComplexRequest = Boolean(
            atts.some((a) => Boolean(a?.dataUrl)) ||
              (aud?.dataUrl && ((aud?.duration || 0) >= 45 || aud.dataUrl.length > 600000))
          );
          const fallbackPriority = isComplexRequest
            ? ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']
            : ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];
          const availableFallbackIndices = fallbackPriority
            .map((id) => GEMINI_SERVERS.findIndex((s) => s.id === id && s.available))
            .filter((i) => i !== -1 && i !== primaryIndex);
          const orderToTry = autoFallback ? [primaryIndex, ...availableFallbackIndices] : [primaryIndex];

          const history = updatedMessages
            .slice(-20, -1)
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, content: m.content || '' }));

          // Telemetría GPS
          const audTrack = aud?.gpsTrack || [];
          const hasTrack = audTrack.length > 1;
          const effectivePt = audTrack[0] || getGlobalLastKnownGps() || {
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
Si te pide registrar un árbol o arqueta, usa [[REGISTRAR_PUNTOS: [...] ]]. Si te pide aprender una regla o dato de la finca, usa [[MEMORIA: {...}]]. Si te pide programar un turno, usa [[CREAR_EVENTO: {...}]]. Si te pide borrar o cancelar un evento del calendario, usa [[BORRAR_EVENTO: {"date": "YYYY-MM-DD", "query": "...", "event_id": "..."}]] o [[ELIMINAR_EVENTO: {"event_id": "..."}]].*`;

          // Obtener datos frescos de contexto
          let liveEvents = [];
          let liveTransactions = [];
          let liveUsers = [];
          try {
            const [eRes, tRes, uRes] = await Promise.allSettled([
              supabase.from('events').select('*').order('date', { ascending: true }),
              supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(60),
              supabase.from('profiles').select('*').order('name'),
            ]);
            if (eRes.status === 'fulfilled' && eRes.value.data) liveEvents = eRes.value.data;
            if (tRes.status === 'fulfilled' && tRes.value.data) liveTransactions = tRes.value.data;
            if (uRes.status === 'fulfilled' && uRes.value.data) liveUsers = uRes.value.data;
          } catch (ctxErr) {
            console.warn('[ChatContext] Aviso leyendo contexto Supabase:', ctxErr);
          }

          const freshFincaContext = buildComprehensiveFincaContext({
            events: liveEvents,
            transactions: liveTransactions,
            users: liveUsers,
            knowledge: farmKnowledge,
            inventory: farmInventoryRef.current,
            paths: farmPathsRef.current,
            categories: getFarmCategories(),
          });

          // Indexación RAG para nuevos adjuntos
          const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: {} }));
          const authUser = authData?.user;
          const currentUserName = authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Admin';

          if (atts.length > 0) {
            for (const attItem of atts) {
              indexDocumentForRag({
                file: attItem.file,
                name: attItem.name,
                textContent: attItem.textContent,
                dataUrl: attItem.dataUrl,
                userName: currentUserName,
                userId: authUser?.id || currentUserId || null,
                apiKey,
              }).catch((e) => console.warn('[ChatContext] Aviso indexando archivo en RAG:', e.message));
            }
          }

          // Búsqueda RAG
          let ragSnippet = '';
          try {
            const ragQuery = text || (aud ? 'resumen agronómico de la finca y archivos' : '');
            if (ragQuery) {
              const ragMatches = await searchRagKnowledge(ragQuery, {
                matchThreshold: 0.30,
                matchCount: 6,
                apiKey,
              });
              if (ragMatches.length > 0) {
                ragSnippet = formatRagContextForPrompt(ragMatches);
              }
            }
          } catch (ragErr) {
            console.warn('[ChatContext] Aviso en búsqueda RAG:', ragErr.message);
          }

          const systemInstruction =
            SYSTEM_PROMPT + '\n' + freshFincaContext + '\n' + gpsContextSnippet + (ragSnippet ? '\n\n' + ragSnippet : '');

          let effectivePrompt = text;
          if (!effectivePrompt && aud) {
            effectivePrompt =
              'Por favor, escucha atentamente este mensaje de voz del agricultor de Campito Jorox. Transcribe o interpreta lo que dice y responde a su consulta o petición. Si consulta sobre el calendario o turnos de riego, revisa el calendario inyectado y responde con el horario exacto. Si pide programar un turno o evento, usa [[CREAR_EVENTO: {...}]]. Si pide borrar o cancelar un evento del calendario, usa [[BORRAR_EVENTO: {"date": "YYYY-MM-DD", "query": "...", "event_id": "..."}]] o [[ELIMINAR_EVENTO: {"event_id": "..."}]]. Si consulta sobre la contabilidad, responde con los balances reales. Si describe árboles, plantas, arquetas o elementos de la finca para inventario, extrae los datos y ubícalos con [[REGISTRAR_PUNTOS: [...] ]]. Si pide recordar o aprender una regla de la finca, guárdala con [[MEMORIA: {...} ]]. Si pide borrar un punto, usa [[BORRAR_PUNTO: {...}]]. Responde detalladamente en español.';
          } else if (!effectivePrompt && atts.length > 0) {
            const namesLabel = atts.map((a) => `"${a.name || 'documento'}"`).join(', ');
            effectivePrompt = `Por favor analiza detalladamente ${atts.length > 1 ? 'los archivos adjuntos' : 'el archivo adjunto'} (${namesLabel}) para Campito Jorox. Sintetiza la información relevante y, si contiene pautas o reglas para alimentar el conocimiento de la finca, guárdalas con [[MEMORIA: {"category": "suelo|cultivo|riego|fertilizacion|general", "title": "...", "content": "..."}]]. Si contiene árboles o parcelas, regístralos con [[REGISTRAR_PUNTOS: [...] ]].`;
          }

          // Ejecución con Cascada en Cliente (permanece viva en el Contexto Global)
          let rawText = null;
          let modelUsed = null;
          let lastError = null;

          for (let i = 0; i < orderToTry.length; i++) {
            const sIndex = orderToTry[i];
            const server = GEMINI_SERVERS[sIndex];
            try {
              const aiResponse = await callGeminiDirect({
                modelId: server.id,
                prompt: effectivePrompt,
                attachments: atts,
                audio: aud,
                history,
                systemInstruction,
                apiKey,
                timeoutMs: aud || atts.length > 0 ? 35000 : 18000,
              });
              rawText = aiResponse;
              modelUsed = server.id;
              break;
            } catch (err) {
              console.warn(`[ChatContext] Falló ${server.name}:`, err.message);
              lastError = err;
            }
          }

          if (!rawText) {
            throw lastError || new Error('No se pudo obtener respuesta del asistente.');
          }

          const serverThatAnswered =
            GEMINI_SERVERS.find((s) => s.id === modelUsed) || GEMINI_SERVERS[primaryIndex];
          if (modelUsed && GEMINI_SERVERS[primaryIndex] && GEMINI_SERVERS[primaryIndex].id !== modelUsed) {
            setFallbackNotice({
              from: GEMINI_SERVERS[primaryIndex],
              to: serverThatAnswered,
              reason: 'disponibilidad o tiempo de respuesta',
            });
          }
          setActiveServer(serverThatAnswered);

          // Procesar acciones estructuradas devueltas por Gemini
          const { displayedContent, learnedMemory, newlyAddedBatch, exportFiles } =
            await processChatResponseActions({
              successResult: rawText,
              userText: text,
              aud,
              effectivePt,
              currentEvents: liveEvents,
              currentInventory: farmInventoryRef.current,
              currentPaths: farmPathsRef.current,
              activeUsers: liveUsers,
              currentUserId,
              actionsAlreadyApplied: false,
              onInventoryAdded: (added) => {
                setFarmInventory((prev) => [
                  ...added,
                  ...prev.filter((i) => !added.some((a) => String(a.id) === String(i.id))),
                ]);
                window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
              },
              onInventoryDeleted: (ids) => {
                const deletedSet = new Set(ids.map((id) => String(id)));
                setFarmInventory((prev) => prev.filter((i) => !deletedSet.has(String(i.id))));
                window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
              },
              onInventoryUpdated: (updated) => {
                setFarmInventory((prev) =>
                  prev.map((i) => {
                    const upd = updated.find((u) => String(u.id) === String(i.id));
                    return upd ? { ...i, ...upd } : i;
                  })
                );
                window.dispatchEvent(new CustomEvent('farm-inventory-updated'));
              },
              onPathAdded: (added) => {
                setFarmPaths((prev) => [
                  ...added,
                  ...prev.filter((p) => !added.some((a) => String(a.id) === String(p.id))),
                ]);
                window.dispatchEvent(new CustomEvent('farm-paths-updated'));
              },
              onPathDeleted: (ids) => {
                const deletedPathSet = new Set(ids.map((id) => String(id)));
                setFarmPaths((prev) => prev.filter((p) => !deletedPathSet.has(String(p.id))));
                window.dispatchEvent(new CustomEvent('farm-paths-updated'));
              },
              onPathUpdated: (updated) => {
                setFarmPaths((prev) =>
                  prev.map((p) => {
                    const upd = updated.find((u) => String(u.id) === String(p.id));
                    return upd ? { ...p, ...upd } : p;
                  })
                );
                window.dispatchEvent(new CustomEvent('farm-paths-updated'));
              },
              onCategoryAdded: () => {
                window.dispatchEvent(new CustomEvent('farm-categories-updated'));
              },
              onCategoryDeleted: () => {
                window.dispatchEvent(new CustomEvent('farm-categories-updated'));
              },
              onKnowledgeAdded: (entry) => {
                setFarmKnowledge((prev) => {
                  const updated = [
                    entry,
                    ...prev.filter((p) => p.title !== entry.title || p.content !== entry.content),
                  ];
                  try {
                    localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(updated));
                  } catch {
                    // ignore
                  }
                  return updated;
                });
              },
            });

          // Consolidar respuesta en el estado global
          const assistantMsg = {
            id: `ast_${Date.now()}`,
            role: 'assistant',
            content: displayedContent,
            serverUsed: serverThatAnswered,
            learnedMemory: learnedMemory || null,
            inventoryExportBatch: newlyAddedBatch.length > 0 ? newlyAddedBatch : null,
            exportFiles: exportFiles.length > 0 ? exportFiles : null,
          };

          setMessages((prev) => {
            const nextList = [...prev, assistantMsg];
            try {
              localStorage.setItem(`campito_chat_messages_${uidForCache}`, JSON.stringify(nextList.slice(-60)));
            } catch {
              // ignore
            }
            return nextList;
          });

          // Persistir en Supabase Storage y chat_history
          const persistResult = await persistChatTurnToHistory({
            userText: text,
            atts,
            aud,
            displayedContent,
            serverThatAnswered,
          }).catch((e) => {
            console.warn('[ChatContext] Aviso persistiendo en chat_history:', e);
            return null;
          });

          // Actualizar las URLs públicas remotas en el mensaje local para que persistan en cualquier dispositivo
          if (persistResult?.uploadedUrls && persistResult.uploadedUrls.length > 0) {
            setMessages((prev) => {
              const nextList = prev.map((m) => {
                if (m.id === tempUserMsgId && Array.isArray(m.attachments)) {
                  return {
                    ...m,
                    attachments: m.attachments.map((att, idx) => ({
                      ...att,
                      file_url: persistResult.uploadedUrls[idx] || att.file_url,
                      public_url: persistResult.uploadedUrls[idx] || att.public_url,
                      url: persistResult.uploadedUrls[idx] || att.url,
                    })),
                  };
                }
                return m;
              });
              try {
                localStorage.setItem(`campito_chat_messages_${uidForCache}`, JSON.stringify(nextList.slice(-60)));
              } catch {
                // ignore
              }
              return nextList;
            });
          }

          // Si el usuario navegó a otra pestaña mientras se procesaba, activar badge verde
          if (window.location.pathname !== '/chat-ia') {
            setHasUnreadReply(true);
          }
        } catch (err) {
          console.error('[ChatContext] Error en procesamiento IA:', err);
          setError(err.message || 'Error al conectar con el asistente. Intenta de nuevo.');
        } finally {
          setIsLoading(false);
        }
      })();
    },
    [
      input,
      pendingAttachments,
      pendingAudio,
      isLoading,
      messages,
      currentUserId,
      selectedServerIndex,
      autoFallback,
      farmKnowledge,
    ]
  );

  const clearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    const uid = currentUserId || localStorage.getItem('campito_last_user_id') || 'default';
    try {
      localStorage.setItem(`campito_chat_messages_${uid}`, JSON.stringify([WELCOME_MESSAGE]));
    } catch {
      // ignore
    }
  }, [currentUserId]);

  const value = useMemo(
    () => ({
      messages,
      setMessages,
      input,
      setInput,
      isLoading,
      error,
      setError,
      hasUnreadReply,
      setHasUnreadReply,
      pendingAttachments,
      setPendingAttachments,
      pendingAudio,
      setPendingAudio,
      selectedServerIndex,
      setSelectedServerIndex,
      activeServer,
      setActiveServer,
      autoFallback,
      setAutoFallback,
      fallbackNotice,
      setFallbackNotice,
      sendMessage,
      clearChat,
      currentUserId,
      farmKnowledge,
      setFarmKnowledge,
      farmInventory,
      setFarmInventory,
      farmPaths,
      setFarmPaths,
      reloadInventory,
      reloadPaths,
      handleDeleteInventoryItem,
      handleDeletePath,
    }),
    [
      messages,
      input,
      isLoading,
      error,
      hasUnreadReply,
      pendingAttachments,
      pendingAudio,
      selectedServerIndex,
      activeServer,
      autoFallback,
      fallbackNotice,
      sendMessage,
      clearChat,
      currentUserId,
      farmKnowledge,
      farmInventory,
      farmPaths,
      reloadInventory,
      reloadPaths,
      handleDeleteInventoryItem,
      handleDeletePath,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
