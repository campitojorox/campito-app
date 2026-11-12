// src/pages/ChatIA.jsx — Chat IA Campito Jorox
// Orquestador principal de conversación, historial, grabación GPS y acciones IA.

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Bot, Info, RotateCcw, ChevronDown, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  useVoiceGeoTracker,
  setGlobalLastKnownGps,
  getGlobalLastKnownGps,
  isIosDevice,
  checkGeolocationSupport,
  queryGeolocationPermissionState,
  normalizeGeoPosition,
} from '../hooks/useVoiceGeoTracker';
import { useAudioPreview } from '../hooks/useAudioRecorder';
import { getLocalInventory, getLocalPaths } from '../services/farmInventoryStorage';
import { syncTextareaHeight } from '../utils/helpers';
import {
  startAiBackgroundJob,
  subscribeSectionJobs,
  acknowledgeAiJob,
  markJobActionsApplied,
} from '../services/aiBackgroundJobManager';
import { SYSTEM_PROMPT, buildComprehensiveFincaContext } from '../services/fincaContextBuilder';
import { GEMINI_SERVERS, callGeminiDirect } from '../services/geminiDirectClient';
import { processChatResponseActions, persistChatTurnToHistory } from '../services/chatIaActions';
import { readFilesAsAttachments, normalizeAttachments } from '../utils/attachmentUtils';
import { styles } from './chat/chatIaStyles';
import ServerSelectorModal from './chat/ServerSelectorModal';
import ChatInfoModal from './chat/ChatInfoModal';
import ChatMessageList from './chat/ChatMessageList';
import ChatInputBar from './chat/ChatInputBar';

const CatastroLiveModal = lazy(() => import('./chat/CatastroLiveModal'));

const chatIaRuntimeContextMap = new globalThis.Map();

function stripLegacyGpsTag(text) {
  return (text || '').replace(/\s*\[GPS:\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\]$/i, '');
}

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el **Cerebro IA Unificado** de **Campito Jorox** 🌿\n\nTengo acceso completo en tiempo real y puedo ayudarte con:\n- 🗺️ **Catastro y Caminos:** Consultar o modificar trazados de pistas, mangueras, aguacates y arquetas de la sección Mapas.\n- 📐 **Planos Técnicos y Esquemas:** Dibujos vectoriales acotados (SVG) y diagramas hidráulicos (Mermaid) con descarga e impresión.\n- 👁️ **Fotos y Documentos:** Diagnóstico de plagas en hojas, OCR de facturas de abono o lectura de contadores de agua.\n- 📅 **Calendario y Riego:** Consultar y agendar turnos en La Nana o El Moro.\n- 💰 **Finanzas y Gastos:** Balances, gastos, ventas y liquidaciones.\n- 🛠️ **Crear Nuevas Herramientas:** Pídeme inventar herramientas dinámicas para el equipo.\n\n¿En qué te puedo ayudar hoy?',
  serverUsed: GEMINI_SERVERS.find((s) => s.id === 'gemini-2.5-flash') || GEMINI_SERVERS[0],
};

export default function ChatIA() {
  const outletContext = useOutletContext() || {};
  const {
    events: outletEvents = [],
    transactions: outletTransactions = [],
    users: outletUsers = [],
    searchQuery: outletSearchQuery = '',
    isSearchOpen = false,
    refetchEvents,
    refetchTransactions,
  } = outletContext;

  const [fincaEvents, setFincaEvents] = useState(() => outletEvents);
  const [fincaTransactions, setFincaTransactions] = useState(() => outletTransactions);
  const [fincaUsers, setFincaUsers] = useState(() => outletUsers);

  const initialIndex = GEMINI_SERVERS.findIndex((s) => s.id === 'gemini-2.5-flash');
  const [selectedServerIndex, setSelectedServerIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [activeServer, setActiveServer] = useState(GEMINI_SERVERS[initialIndex >= 0 ? initialIndex : 0]);
  const [fallbackNotice, setFallbackNotice] = useState(null);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isInventoryMapOpen, setIsInventoryMapOpen] = useState(false);
  const [farmKnowledge, setFarmKnowledge] = useState(() => {
    try {
      const raw = localStorage.getItem('campito_farm_knowledge_all');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[ChatIA] Error leyendo memoria local:', e);
    }
    return [];
  });

  const [farmInventory, setFarmInventory] = useState([]);
  const farmInventoryRef = useRef(farmInventory);
  useEffect(() => {
    farmInventoryRef.current = farmInventory;
  }, [farmInventory]);

  const [farmPaths, setFarmPaths] = useState([]);
  const farmPathsRef = useRef(farmPaths);
  useEffect(() => {
    farmPathsRef.current = farmPaths;
  }, [farmPaths]);

  const [lastRecordedGpsTrack, setLastRecordedGpsTrack] = useState(null);
  const [inventoryModalTab, setInventoryModalTab] = useState('map');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');

  const {
    isRecording,
    elapsedSeconds: recordingSeconds,
    currentGps,
    gpsPointsCount,
    accuracyWarning,
    wakeLockActive,
    startTracking,
    stopTracking,
    cancelTracking,
  } = useVoiceGeoTracker();

  const {
    pendingAudio,
    setPendingAudio: updatePendingAudio,
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardAudio,
  } = useAudioPreview();

  const [autoFallback, setAutoFallback] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(() => {
    try {
      return localStorage.getItem('campito_last_user_id') || 'default';
    } catch {
      return 'default';
    }
  });

  const [messages, setMessages] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      const cached = localStorage.getItem(`campito_chat_messages_${lastUid}`);
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
      console.warn('[ChatIA] Error leyendo caché local de mensajes:', e);
    }
    return [WELCOME_MESSAGE];
  });

  const displayedMessages = useMemo(() => {
    if (!isSearchOpen || !outletSearchQuery.trim()) return messages;
    const q = outletSearchQuery.toLowerCase().trim();
    return messages.filter(
      (m) =>
        (m.text && m.text.toLowerCase().includes(q)) ||
        (m.content && m.content.toLowerCase().includes(q))
    );
  }, [messages, isSearchOpen, outletSearchQuery]);

  const [input, setInput] = useState(() => {
    try {
      const lastUid = localStorage.getItem('campito_last_user_id') || 'default';
      return localStorage.getItem(`campito_chat_draft_${lastUid}`) || '';
    } catch {
      return '';
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);

  const deviceGpsRef = useRef(null);
  const contextDataRef = useRef('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    syncTextareaHeight(inputRef.current, input);
  }, [input]);

  const handleCancelRecording = async () => {
    try {
      if (cancelTracking) cancelTracking();
      else await stopTracking();
    } catch (e) {
      console.error('Error cancelando grabación:', e);
    }
    updatePendingAudio(null);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!currentUserId) return;
    try {
      localStorage.setItem(`campito_chat_messages_${currentUserId}`, JSON.stringify(messages.slice(-60)));
    } catch (e) {
      console.warn('[ChatIA] Error guardando mensajes en caché:', e);
    }
  }, [messages, currentUserId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id || 'default';
        if (!isMounted) return;
        setCurrentUserId(uid);
        localStorage.setItem('campito_last_user_id', uid);

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
            const restored = dbHistory.map((row) => {
              let fileUrls = [];
              if (row.file_url) {
                if (row.file_url.trim().startsWith('[')) {
                  try {
                    const parsed = JSON.parse(row.file_url);
                    if (Array.isArray(parsed)) fileUrls = parsed.filter(Boolean);
                  } catch {
                    fileUrls = [row.file_url];
                  }
                } else {
                  fileUrls = [row.file_url];
                }
              }
              const restoredAttachments = fileUrls
                .filter((u) => !/\.(webm|mp4|m4a|ogg|wav|mp3)(\?|$)/i.test(u))
                .map((u, idx) => {
                  const cleanName = decodeURIComponent(u.split('/').pop()?.split('?')[0] || `Archivo ${idx + 1}`);
                  const isImg = /\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(u);
                  const isPdf = /\.pdf(\?|$)/i.test(u);
                  const isSpreadsheet = /\.(xlsx|xls|csv)(\?|$)/i.test(u);
                  return {
                    name: cleanName,
                    isImage: isImg,
                    isPdf,
                    isSpreadsheet,
                    dataUrl: u,
                  };
                });
              const firstAudioUrl =
                fileUrls.find((u) => /\.(webm|mp4|m4a|ogg|wav|mp3)(\?|$)/i.test(u)) || null;

              return {
                id: String(row.id),
                role: row.role,
                content: stripLegacyGpsTag(row.content),
                attachments: restoredAttachments.length > 0 ? restoredAttachments : null,
                audio: firstAudioUrl ? { dataUrl: firstAudioUrl } : null,
                serverUsed: row.model_used ? { name: row.model_used } : null,
                timestamp: row.created_at,
              };
            });

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

  const handleResetChat = useCallback(() => {
    if (messages.length <= 1 && !input) return;
    const ok = window.confirm(
      '¿Deseas iniciar una nueva conversación limpia?\n\nEl historial anterior permanece guardado y seguro en la base de datos de Campito Jorox.'
    );
    if (!ok) return;

    setMessages([WELCOME_MESSAGE]);
    setInput('');
    updatePendingAudio(null);
    setPendingAttachments([]);
    if (currentUserId) {
      try {
        localStorage.removeItem(`campito_chat_messages_${currentUserId}`);
        localStorage.removeItem(`campito_chat_draft_${currentUserId}`);
      } catch {
        // ignore
      }
    }
  }, [messages.length, input, currentUserId, updatePendingAudio]);

  useEffect(() => {
    const { supported, secure } = checkGeolocationSupport();
    if (!supported || !secure) return;

    let cancelled = false;
    let watchId = null;

    queryGeolocationPermissionState().then((permState) => {
      if (cancelled || permState === 'denied') return;
      if (permState !== 'granted' && isIosDevice()) return;

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const info = normalizeGeoPosition(pos);
          deviceGpsRef.current = info;
          setGlobalLastKnownGps(info);
        },
        (err) => {
          console.warn('[ChatIA] watchPosition error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
      );
    });

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

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

  useEffect(() => {
    let isMounted = true;
    const loadContext = async () => {
      try {
        const [transRes, eventsRes, knwRes, invRes, pathRes, usersRes] = await Promise.allSettled([
          supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(60),
          supabase.from('events').select('*').order('date', { ascending: true }),
          supabase.from('farm_knowledge').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_inventory').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_paths').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').order('name'),
        ]);

        if (!isMounted) return;

        const liveEvents = eventsRes.status === 'fulfilled' && eventsRes.value.data ? eventsRes.value.data : outletEvents;
        const liveTransactions =
          transRes.status === 'fulfilled' && transRes.value.data ? transRes.value.data : outletTransactions;
        const liveInventory =
          invRes.status === 'fulfilled' && Array.isArray(invRes.value.data) && invRes.value.data.length > 0
            ? invRes.value.data
            : getLocalInventory();
        const livePaths =
          pathRes.status === 'fulfilled' && Array.isArray(pathRes.value.data) && pathRes.value.data.length > 0
            ? pathRes.value.data
            : getLocalPaths();
        const liveUsers = usersRes.status === 'fulfilled' && usersRes.value.data ? usersRes.value.data : outletUsers;

        let combinedKnowledge = [];
        try {
          const localRaw = localStorage.getItem('campito_farm_knowledge_all');
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (Array.isArray(parsed)) combinedKnowledge = [...parsed];
          }
        } catch (e) {
          console.warn('[ChatIA] Error leyendo memoria local:', e);
        }

        if (knwRes.status === 'fulfilled' && Array.isArray(knwRes.value.data) && knwRes.value.data.length > 0) {
          knwRes.value.data.forEach((remoteItem) => {
            const alreadyIn = combinedKnowledge.some(
              (k) => k.id === remoteItem.id || (k.title === remoteItem.title && k.content === remoteItem.content)
            );
            if (!alreadyIn) combinedKnowledge.push(remoteItem);
          });
        }

        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('campito_chat_messages_')) {
              const msgsRaw = localStorage.getItem(key);
              if (msgsRaw) {
                const parsedMsgs = JSON.parse(msgsRaw);
                if (Array.isArray(parsedMsgs)) {
                  parsedMsgs.forEach((m) => {
                    if (m.learnedMemory && m.learnedMemory.content) {
                      const exists = combinedKnowledge.some(
                        (k) => k.title === m.learnedMemory.title || k.content === m.learnedMemory.content
                      );
                      if (!exists) {
                        combinedKnowledge.push({
                          id: 'recovered-' + Math.random().toString(36).substring(7),
                          category: m.learnedMemory.category || 'general',
                          title: m.learnedMemory.title || 'Dato aprendido',
                          content: m.learnedMemory.content,
                          source: 'chat',
                          created_at: m.timestamp || new Date().toISOString(),
                          is_active: true,
                        });
                      }
                    }
                  });
                }
              }
            }
          }
        } catch (scanErr) {
          console.warn('[ChatIA] Error escaneando mensajes locales:', scanErr);
        }

        try {
          localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(combinedKnowledge));
        } catch {
          // ignore
        }

        setFincaEvents(liveEvents);
        setFincaTransactions(liveTransactions);
        setFarmKnowledge(combinedKnowledge);
        setFarmInventory(liveInventory);
        setFarmPaths(livePaths);
        setFincaUsers(liveUsers);

        contextDataRef.current = buildComprehensiveFincaContext({
          events: liveEvents,
          transactions: liveTransactions,
          users: liveUsers,
          knowledge: combinedKnowledge,
          inventory: liveInventory,
          paths: livePaths,
        });
      } catch (err) {
        console.warn('[ChatIA] Error cargando contexto inicial:', err);
      }
    };
    loadContext();
    return () => {
      isMounted = false;
    };
  }, [outletEvents, outletTransactions, outletUsers]);

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

  useEffect(() => {
    const handleInvUpdated = () => reloadInventory();
    const handlePathsUpdated = () => reloadPaths();
    window.addEventListener('farm-inventory-updated', handleInvUpdated);
    window.addEventListener('farm-paths-updated', handlePathsUpdated);
    return () => {
      window.removeEventListener('farm-inventory-updated', handleInvUpdated);
      window.removeEventListener('farm-paths-updated', handlePathsUpdated);
    };
  }, []);

  const handleDeleteInventoryItem = async (id) => {
    try {
      await supabase.from('farm_inventory').update({ is_active: false }).eq('id', id);
      setFarmInventory((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.warn('Error al eliminar elemento del inventario:', err);
    }
  };

  const handleDeletePath = async (id) => {
    try {
      await supabase.from('farm_paths').update({ is_active: false }).eq('id', id);
      setFarmPaths((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.warn('Error al eliminar camino:', err);
    }
  };

  const consumedChatJobsRef = useRef(new Set());
  const activeServerRef = useRef(activeServer);
  useEffect(() => {
    activeServerRef.current = activeServer;
  }, [activeServer]);

  const processCompletedChatJob = useCallback(
    async (job) => {
      if (!job || consumedChatJobsRef.current.has(job.jobId)) return;
      consumedChatJobsRef.current.add(job.jobId);
      acknowledgeAiJob(job.jobId);

      const runtimeCtx = chatIaRuntimeContextMap.get(job.jobId) || {};
      chatIaRuntimeContextMap.delete(job.jobId);

      const text = runtimeCtx.text ?? job.uiMeta?.text ?? '';
      const atts = runtimeCtx.atts || (runtimeCtx.att ? [runtimeCtx.att] : []);
      const aud = runtimeCtx.aud || job.uiMeta?.audioMeta || null;
      const effectivePt = runtimeCtx.effectivePt || job.uiMeta?.effectivePt || deviceGpsRef.current || null;
      const currentEvents = runtimeCtx.currentEvents || (fincaEvents.length > 0 ? fincaEvents : outletEvents);

      const successResult = job.result?.rawText || job.result?.displayedContent || '';
      const modelUsed = job.result?.modelUsed;
      const serverThatAnswered =
        GEMINI_SERVERS.find((s) => s.id === modelUsed) || activeServerRef.current;

      if (!successResult) return;

      const primaryIdx = job.uiMeta?.primaryIndex ?? selectedServerIndex;
      if (modelUsed && GEMINI_SERVERS[primaryIdx] && GEMINI_SERVERS[primaryIdx].id !== modelUsed) {
        setFallbackNotice({
          from: GEMINI_SERVERS[primaryIdx],
          to: serverThatAnswered,
          reason: 'disponibilidad o tiempo de respuesta',
        });
      }

      if (job.actionsApplied) {
        if (job.result?.eventsChanged && refetchEvents) refetchEvents();
        if (job.result?.txChanged && refetchTransactions) refetchTransactions();
      }

      const { displayedContent, learnedMemory, newlyAddedBatch, exportFiles } =
        await processChatResponseActions({
          successResult,
          initialDisplayedContent: job.result?.displayedContent,
          initialLearnedMemory: job.result?.learnedMemory,
          initialExportFiles: job.result?.exportFiles || [],
          userText: text,
          aud,
          effectivePt,
          currentEvents,
          currentInventory: farmInventoryRef.current,
          currentPaths: farmPathsRef.current,
          activeUsers: fincaUsers.length > 0 ? fincaUsers : outletUsers,
          currentUserId,
          actionsAlreadyApplied: Boolean(job.actionsApplied),
          refetchEvents,
          refetchTransactions,
          onInventoryAdded: (added) => {
            setFarmInventory((prev) => [
              ...added,
              ...prev.filter((i) => !added.some((a) => String(a.id) === String(i.id))),
            ]);
            added.forEach((newRow) => {
              contextDataRef.current += `\n- [${(newRow.category || 'arbol').toUpperCase()}] ${newRow.name} (${newRow.variety_type || ''}) | Lat/Lng: ${newRow.latitude}, ${newRow.longitude}`;
            });
          },
          onInventoryDeleted: (ids) => {
            const deletedSet = new Set(ids.map((id) => String(id)));
            setFarmInventory((prev) => prev.filter((i) => !deletedSet.has(String(i.id))));
          },
          onInventoryUpdated: (updated) => {
            setFarmInventory((prev) =>
              prev.map((i) => {
                const upd = updated.find((u) => String(u.id) === String(i.id));
                return upd ? { ...i, ...upd } : i;
              })
            );
          },
          onPathAdded: (added) => {
            setFarmPaths((prev) => [
              ...added,
              ...prev.filter((p) => !added.some((a) => String(a.id) === String(p.id))),
            ]);
          },
          onPathDeleted: (ids) => {
            const deletedPathSet = new Set(ids.map((id) => String(id)));
            setFarmPaths((prev) => prev.filter((p) => !deletedPathSet.has(String(p.id))));
          },
          onPathUpdated: (updated) => {
            setFarmPaths((prev) =>
              prev.map((p) => {
                const upd = updated.find((u) => String(u.id) === String(p.id));
                return upd ? { ...p, ...upd } : p;
              })
            );
          },
          onEventAdded: (newEvRow) => setFincaEvents((prev) => [...prev, newEvRow]),
          onEventDeleted: (deletedId) =>
            setFincaEvents((prev) => prev.filter((ev) => ev.id?.toString() !== deletedId.toString())),
          onTransactionAdded: (newTxRow) => setFincaTransactions((prev) => [newTxRow, ...prev]),
          onKnowledgeAdded: (memoryEntry) => {
            setFarmKnowledge((prev) => {
              const updated = [
                memoryEntry,
                ...prev.filter((p) => p.title !== memoryEntry.title || p.content !== memoryEntry.content),
              ];
              try {
                localStorage.setItem('campito_farm_knowledge_all', JSON.stringify(updated));
              } catch {
                // ignore
              }
              return updated;
            });
            contextDataRef.current += `\n- [${(memoryEntry.category || 'general').toUpperCase()}] ${memoryEntry.title}: ${memoryEntry.content}`;
          },
        });

      if (!job.actionsApplied) {
        markJobActionsApplied(job.jobId);
      }

      setActiveServer(serverThatAnswered);
      const assistantMsgId = `ast_${job.jobId}`;
      setMessages((prev) => {
        if (prev.some((m) => m.id === assistantMsgId)) return prev;
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === displayedContent) return prev;
        const nextList = [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: displayedContent,
            serverUsed: serverThatAnswered,
            learnedMemory: learnedMemory || null,
            inventoryExportBatch: newlyAddedBatch.length > 0 ? newlyAddedBatch : null,
            exportFiles: exportFiles.length > 0 ? exportFiles : null,
          },
        ];
        if (currentUserId) {
          try {
            localStorage.setItem(`campito_chat_messages_${currentUserId}`, JSON.stringify(nextList.slice(-60)));
          } catch {
            // ignore
          }
        }
        return nextList;
      });

      if (!job.persistedToDb) {
        persistChatTurnToHistory({
          userText: text,
          atts,
          aud,
          displayedContent,
          serverThatAnswered,
        });
      }
    },
    [currentUserId, fincaEvents, fincaUsers, outletEvents, outletUsers, refetchEvents, refetchTransactions, selectedServerIndex]
  );

  const processCompletedChatJobRef = useRef(processCompletedChatJob);
  useEffect(() => {
    processCompletedChatJobRef.current = processCompletedChatJob;
  }, [processCompletedChatJob]);

  useEffect(() => {
    const unsubscribe = subscribeSectionJobs('chat-ia', (snap) => {
      setIsLoading(snap.isProcessing);
      if (snap.errorUnacked.length > 0) {
        const errJob = snap.errorUnacked[0];
        if (!consumedChatJobsRef.current.has(errJob.jobId)) {
          consumedChatJobsRef.current.add(errJob.jobId);
          acknowledgeAiJob(errJob.jobId);
          setError(errJob.error || 'Error al conectar con el asistente. Intenta de nuevo.');
        }
      }
      for (const finishedJob of snap.completedUnacked) {
        processCompletedChatJobRef.current(finishedJob);
      }
    });
    return unsubscribe;
  }, []);

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

      const userMsg = {
        id: Date.now().toString(),
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
                dataUrl: a.dataUrl,
              }))
            : null,
        audio: aud ? { dataUrl: aud.dataUrl, duration: aud.duration } : null,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      const uidForCache = currentUserId || localStorage.getItem('campito_last_user_id');
      if (uidForCache) {
        try {
          localStorage.setItem(`campito_chat_messages_${uidForCache}`, JSON.stringify(updatedMessages.slice(-60)));
          localStorage.removeItem(`campito_chat_draft_${uidForCache}`);
        } catch {
          // ignore
        }
      }

      setInput('');
      syncTextareaHeight(inputRef.current, '');
      setPendingAttachments([]);
      updatePendingAudio(null);
      setIsLoading(true);
      setError(null);
      setFallbackNotice(null);

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
      const modelsList = orderToTry.map((idx) => GEMINI_SERVERS[idx].id);

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
Si te pide registrar un árbol o arqueta, usa [[REGISTRAR_PUNTOS: [...] ]]. Si te pide aprender una regla o dato de la finca, usa [[MEMORIA: {...}]]. Si te pide programar un turno, usa [[CREAR_EVENTO: {...}]]. Si te pide borrar o cancelar un evento del calendario, usa [[BORRAR_EVENTO: {"date": "YYYY-MM-DD", "query": "...", "event_id": "..."}]] o [[ELIMINAR_EVENTO: {"event_id": "..."}]].*`;

      let currentEvents = fincaEvents.length > 0 ? fincaEvents : outletEvents;
      let currentTransactions = fincaTransactions.length > 0 ? fincaTransactions : outletTransactions;
      let currentUsers = fincaUsers.length > 0 ? fincaUsers : outletUsers;
      let currentKnowledge = farmKnowledge;
      let currentInventory = farmInventory;
      let currentPaths = farmPaths;

      try {
        const [eRes, tRes, kRes, iRes, pRes] = await Promise.allSettled([
          supabase.from('events').select('*').order('date', { ascending: true }),
          supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(60),
          supabase.from('farm_knowledge').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_inventory').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('farm_paths').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        ]);

        if (eRes.status === 'fulfilled' && eRes.value.data && eRes.value.data.length > 0) {
          currentEvents = eRes.value.data;
          setFincaEvents(eRes.value.data);
        }
        if (tRes.status === 'fulfilled' && tRes.value.data && tRes.value.data.length > 0) {
          currentTransactions = tRes.value.data;
          setFincaTransactions(tRes.value.data);
        }
        if (kRes.status === 'fulfilled' && kRes.value.data) {
          currentKnowledge = kRes.value.data;
          setFarmKnowledge(kRes.value.data);
        }
        if (iRes.status === 'fulfilled' && Array.isArray(iRes.value.data) && iRes.value.data.length > 0) {
          currentInventory = iRes.value.data;
          setFarmInventory(iRes.value.data);
        } else if (!currentInventory || currentInventory.length === 0) {
          currentInventory = getLocalInventory();
          setFarmInventory(currentInventory);
        }
        if (pRes.status === 'fulfilled' && Array.isArray(pRes.value.data) && pRes.value.data.length > 0) {
          currentPaths = pRes.value.data;
          setFarmPaths(pRes.value.data);
        } else if (!currentPaths || currentPaths.length === 0) {
          currentPaths = getLocalPaths();
          setFarmPaths(currentPaths);
        }
      } catch (fErr) {
        console.warn('[ChatIA] Contexto en memoria utilizado:', fErr);
      }

      const freshFincaContext = buildComprehensiveFincaContext({
        events: currentEvents,
        transactions: currentTransactions,
        users: currentUsers,
        knowledge: currentKnowledge,
        inventory: currentInventory,
        paths: currentPaths,
      });
      contextDataRef.current = freshFincaContext;

      const systemInstruction = SYSTEM_PROMPT + '\n' + freshFincaContext + '\n' + gpsContextSnippet;

      let effectivePrompt = text;
      if (!effectivePrompt && aud) {
        effectivePrompt =
          'Por favor, escucha atentamente este mensaje de voz del agricultor de Campito Jorox. Transcribe o interpreta lo que dice y responde a su consulta o petición. Si consulta sobre el calendario o turnos de riego, revisa el calendario inyectado y responde con el horario exacto. Si pide programar un turno o evento, usa [[CREAR_EVENTO: {...}]]. Si pide borrar o cancelar un evento del calendario, usa [[BORRAR_EVENTO: {"date": "YYYY-MM-DD", "query": "...", "event_id": "..."}]] o [[ELIMINAR_EVENTO: {"event_id": "..."}]]. Si consulta sobre la contabilidad, responde con los balances reales. Si describe árboles, plantas, arquetas o elementos de la finca para inventario, extrae los datos y ubícalos con [[REGISTRAR_PUNTOS: [...] ]]. Si pide recordar o aprender una regla de la finca, guárdala con [[MEMORIA: {...} ]]. Si pide borrar un punto, usa [[BORRAR_PUNTO: {...}]]. Responde detalladamente en español.';
      } else if (!effectivePrompt && atts.length > 0) {
        const namesLabel = atts.map((a) => `"${a.name || 'documento'}"`).join(', ');
        effectivePrompt = `Por favor analiza detalladamente ${atts.length > 1 ? 'los archivos adjuntos' : 'el archivo adjunto'} (${namesLabel}) para Campito Jorox. Sintetiza la información relevante y, si contiene pautas o reglas para alimentar el conocimiento de la finca, guárdalas con [[MEMORIA: {"category": "suelo|cultivo|riego|fertilizacion|general", "title": "...", "content": "..."}]]. Si contiene árboles o parcelas, regístralos con [[REGISTRAR_PUNTOS: [...] ]].`;
      }

      const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: {} }));
      const authUser = authData?.user;
      const currentUserName = authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Admin';

      const slimAudioMeta = aud
        ? {
            t0: aud.t0,
            duration: aud.duration || 1,
            gpsTrack: Array.isArray(aud.gpsTrack)
              ? aud.gpsTrack.slice(0, 200).map((p) => ({
                  timestamp: p.timestamp,
                  lat: p.lat,
                  lng: p.lng,
                  accuracy: p.accuracy,
                  altitude: p.altitude ?? null,
                }))
              : [],
          }
        : null;

      const { jobId } = startAiBackgroundJob({
        section: 'chat-ia',
        prompt: effectivePrompt,
        systemInstruction,
        history,
        attachments: atts,
        audio: aud,
        models: modelsList,
        userMeta: { userId: authUser?.id || currentUserId || null, userName: currentUserName },
        persistToChatHistory: true,
        uiMeta: {
          text: text || '',
          primaryIndex,
          userMsgId: userMsg.id,
          audioMeta: slimAudioMeta,
          effectivePt: effectivePt || null,
        },
        directFallbackFn: async () => {
          let lastError = null;
          for (let i = 0; i < orderToTry.length; i++) {
            const sIndex = orderToTry[i];
            const server = GEMINI_SERVERS[sIndex];
            try {
              const aiResponse = await callGeminiDirect({
                modelId: server.id,
                prompt: text,
                attachments: atts,
                audio: aud,
                history,
                systemInstruction,
                apiKey,
                timeoutMs: aud || atts.length > 0 ? 35000 : 18000,
              });
              return { rawText: aiResponse, modelUsed: server.id };
            } catch (err) {
              console.warn(`[ChatIA] Error en ${server.name} (${server.level}):`, err.message);
              lastError = err;
            }
          }
          throw lastError || new Error('Error al conectar con el asistente.');
        },
      });

      chatIaRuntimeContextMap.set(jobId, { text, atts, aud, effectivePt, currentEvents });
    },
    [
      input,
      messages,
      isLoading,
      pendingAttachments,
      pendingAudio,
      selectedServerIndex,
      autoFallback,
      currentUserId,
      fincaEvents,
      fincaTransactions,
      fincaUsers,
      farmKnowledge,
      farmInventory,
      farmPaths,
      outletEvents,
      outletTransactions,
      outletUsers,
      updatePendingAudio,
    ]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCameraClick = () => fileInputRef.current?.click();

  const handleCameraChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files, { forceImage: true });
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  const handleAttachClick = () => docInputRef.current?.click();

  const handleDocumentChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files);
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  const handleMicClick = async () => {
    if (isRecording) {
      try {
        const sessionResult = await stopTracking();
        if (!sessionResult || !sessionResult.audioBlob) return;
        const { audioBlob, t0, durationSeconds, gpsTrack } = sessionResult;
        if (gpsTrack && gpsTrack.length > 1) setLastRecordedGpsTrack(gpsTrack);

        const effectiveGpsTrack =
          gpsTrack && gpsTrack.length > 0
            ? gpsTrack
            : deviceGpsRef.current
              ? [{ ...deviceGpsRef.current, timestamp: t0 }]
              : [{ lat: 36.72595, lng: -4.89462, accuracy: 4.0, timestamp: t0 }];

        const reader = new FileReader();
        reader.onloadend = () => {
          updatePendingAudio({
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
      updatePendingAudio(null);
      setError(null);
      const seedGps = deviceGpsRef.current || getGlobalLastKnownGps() || null;
      await startTracking({ initialGps: seedGps });
    } catch (err) {
      console.error('Error iniciando grabación:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError(
          'Permiso de micrófono denegado. Por favor, habilítalo en los ajustes de tu navegador o móvil para grabar audios.'
        );
      } else {
        setError('No se pudo acceder al micrófono o GPS. Verifica los permisos en tu navegador o móvil.');
      }
    }
  };

  const hasText = input.trim().length > 0 || pendingAttachments.length > 0 || pendingAudio !== null;
  const currentBadgeServer = activeServer || GEMINI_SERVERS[selectedServerIndex];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <Bot size={18} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <p style={styles.headerTitle}>CHAT IA</p>
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
                flexShrink: 0,
              }}
              title="Información de confidencialidad y modo de operación"
              aria-label="Información de confidencialidad y modo de operación"
            >
              <Info size={15} />
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
                flexShrink: 0,
              }}
              title="Nueva conversación limpia (el historial se mantiene respaldado)"
              aria-label="Nueva conversación"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div
          style={styles.serverBadge(currentBadgeServer.badgeColor)}
          onClick={() => setIsServerModalOpen(true)}
          title={`Click para ver/cambiar servidor de Gemini (${currentBadgeServer.name})`}
        >
          <span style={styles.statusDot(currentBadgeServer.badgeColor)} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              display: 'inline-block',
            }}
          >
            {currentBadgeServer.name}
          </span>
          <ChevronDown size={13} style={{ color: '#64748b', flexShrink: 0 }} />
        </div>
      </div>

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

      <ServerSelectorModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        activeServer={activeServer}
        setSelectedServerIndex={setSelectedServerIndex}
        setActiveServer={setActiveServer}
        autoFallback={autoFallback}
        setAutoFallback={setAutoFallback}
      />

      <ChatInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        farmKnowledge={farmKnowledge}
        farmInventory={farmInventory}
        setIsInventoryMapOpen={setIsInventoryMapOpen}
        setMessages={setMessages}
        activeServer={activeServer}
      />

      {isInventoryMapOpen && (
        <Suspense fallback={<div style={styles.modalOverlay}>Cargando mapa...</div>}>
          <CatastroLiveModal
            isOpen={isInventoryMapOpen}
            onClose={() => setIsInventoryMapOpen(false)}
            farmInventory={farmInventory}
            farmPaths={farmPaths}
            setFarmPaths={setFarmPaths}
            inventoryModalTab={inventoryModalTab}
            setInventoryModalTab={setInventoryModalTab}
            reloadInventory={reloadInventory}
            reloadPaths={reloadPaths}
            lastRecordedGpsTrack={lastRecordedGpsTrack}
            inventorySearch={inventorySearch}
            setInventorySearch={setInventorySearch}
            inventoryCategoryFilter={inventoryCategoryFilter}
            setInventoryCategoryFilter={setInventoryCategoryFilter}
            handleDeleteInventoryItem={handleDeleteInventoryItem}
            handleDeletePath={handleDeletePath}
          />
        </Suspense>
      )}

      <ChatMessageList
        isSearchOpen={isSearchOpen}
        outletSearchQuery={outletSearchQuery}
        displayedMessages={displayedMessages}
        isLoading={isLoading}
        currentBadgeServer={currentBadgeServer}
        messagesEndRef={messagesEndRef}
        setInventoryModalTab={setInventoryModalTab}
        setIsInventoryMapOpen={setIsInventoryMapOpen}
      />

      <ChatInputBar
        error={error}
        setError={setError}
        isRecording={isRecording}
        recordingSeconds={recordingSeconds}
        currentGps={currentGps}
        accuracyWarning={accuracyWarning}
        gpsPointsCount={gpsPointsCount}
        handleMicClick={handleMicClick}
        pendingAttachments={pendingAttachments}
        setPendingAttachments={setPendingAttachments}
        docInputRef={docInputRef}
        fileInputRef={fileInputRef}
        handleDocumentChange={handleDocumentChange}
        handleCameraChange={handleCameraChange}
        handleAttachClick={handleAttachClick}
        handleCameraClick={handleCameraClick}
        pendingAudio={pendingAudio}
        handleDiscardAudio={handleDiscardAudio}
        togglePlayPreview={togglePlayPreview}
        isPreviewPlaying={isPreviewPlaying}
        setIsPreviewPlaying={setIsPreviewPlaying}
        previewDuration={previewDuration}
        setPreviewDuration={setPreviewDuration}
        previewCurrentTime={previewCurrentTime}
        setPreviewCurrentTime={setPreviewCurrentTime}
        handleSeekPreview={handleSeekPreview}
        previewAudioRef={previewAudioRef}
        wakeLockActive={wakeLockActive}
        handleCancelRecording={handleCancelRecording}
        inputRef={inputRef}
        input={input}
        setInput={setInput}
        currentUserId={currentUserId}
        handleKeyDown={handleKeyDown}
        isLoading={isLoading}
        hasText={hasText}
        sendMessage={sendMessage}
      />
    </div>
  );
}
