// src/components/SectionChatIA.jsx
// Barra fija inferior de Chat IA compartida para las secciones Calendario y Gasto-Venta.
// Misma estética, controles (adjuntos +, cápsula con robotito, cámara, audio WhatsApp, enviar/mic y Undo)
// y visualización de respuestas por encima del div de Chat IA en tablas blancas con bordes redondeados
// adaptadas al formato exacto de la sección activa.

import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Plus,
  Camera,
  Mic,
  Send,
  StopCircle,
  Trash2,
  Play,
  Pause,
  X,
  FileText,
  Undo2,
} from 'lucide-react';
import { stopMediaStream } from '../hooks/useVoiceGeoTracker';
import { formatCurrency } from '../utils/helpers';
import {
  buildSectionSystemInstruction,
  loadFarmKnowledgeSafe,
  callSectionGemini,
  executeCalendarIaActions,
  revertCalendarIaActions,
  executeFinanceIaActions,
  revertFinanceIaActions,
} from '../services/sectionIaService';
import {
  startAiBackgroundJob,
  subscribeSectionJobs,
  acknowledgeAiJob,
  markJobActionsApplied,
} from '../services/aiBackgroundJobManager';

const DEFAULT_CALENDAR_COLORS = {
  RIEGO: '#38bdf8',
  MANTENIMIENTO: '#10b981',
  OTRO: '#8884d8',
};

function formatAudioTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatDateDDMMYY(dateStr) {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0].split(' ')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
  }
  return datePart;
}

export default function SectionChatIA({
  section, // 'calendario' | 'gasto-ingreso'
  contextData = {},
  onRefresh,
  onSelectResultItem,
  onHighlightDate,
  categoryColors = DEFAULT_CALENDAR_COLORS,
}) {
  const [inputText, setInputText] = useState('');
  const [isProcessingIa, setIsProcessingIa] = useState(false);
  const [iaFeedback, setIaFeedback] = useState(null); // { type: 'success'|'error'|'info', text }
  const [iaResultCard, setIaResultCardState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`campito_section_card_${section}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [undoStack, setUndoStack] = useState([]);

  const setIaResultCard = (card) => {
    setIaResultCardState(card);
    try {
      if (card) sessionStorage.setItem(`campito_section_card_${section}`, JSON.stringify(card));
      else sessionStorage.removeItem(`campito_section_card_${section}`);
    } catch {
      // ignore
    }
  };

  // Adjuntos y cámara
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const docInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Grabación y previsualización de audio estilo WhatsApp
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [pendingVoiceAudio, setPendingVoiceAudio] = useState(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartRef = useRef(0);
  const previewAudioRef = useRef(null);
  const textareaRef = useRef(null);

  const contextDataRef = useRef(contextData);
  const onRefreshRef = useRef(onRefresh);
  const onHighlightDateRef = useRef(onHighlightDate);
  const consumedJobIdsRef = useRef(new Set());
  const pendingAttachmentsByJobRef = useRef(new Map());

  useEffect(() => {
    contextDataRef.current = contextData;
    onRefreshRef.current = onRefresh;
    onHighlightDateRef.current = onHighlightDate;
  }, [contextData, onRefresh, onHighlightDate]);

  // Limpiar temporizadores y streams al desmontar
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (streamRef.current) stopMediaStream(streamRef.current);
    };
  }, []);

  // Auto-ocultar banner de feedback después de 8s (excepto mientras procesa)
  useEffect(() => {
    if (!iaFeedback || isProcessingIa) return;
    const timer = setTimeout(() => setIaFeedback(null), 8000);
    return () => clearTimeout(timer);
  }, [iaFeedback, isProcessingIa]);

  // Procesar resultado completado de un background job para esta sección
  const applyCompletedSectionJob = async (job) => {
    if (!job || consumedJobIdsRef.current.has(job.jobId)) return;
    consumedJobIdsRef.current.add(job.jobId);
    acknowledgeAiJob(job.jobId);

    const aiResult = job.result || {};
    const ctx = contextDataRef.current || {};
    const actions = Array.isArray(aiResult.actions) ? aiResult.actions : [];
    const attForJob = pendingAttachmentsByJobRef.current.get(job.jobId) || null;
    pendingAttachmentsByJobRef.current.delete(job.jobId);

    if (section === 'calendario') {
      let exec = aiResult.exec || { addedEvents: [], updatedEvents: [], deletedIds: [], reverts: [], errors: [] };

      if (!job.actionsApplied && actions.length > 0) {
        exec = await executeCalendarIaActions({
          actions,
          rawEvents: ctx.events || [],
          currentUser: ctx.currentUser,
        });
        markJobActionsApplied(job.jobId);
      }

      if (exec.reverts?.length > 0) {
        setUndoStack((prev) => [
          ...prev,
          {
            description: aiResult.title || aiResult.summary || 'Cambios en calendario',
            reverts: exec.reverts,
          },
        ]);
      }

      if (
        (exec.addedEvents?.length > 0 || exec.updatedEvents?.length > 0 || exec.deletedIds?.length > 0 || job.actionsApplied) &&
        onRefreshRef.current
      ) {
        await onRefreshRef.current();
      }

      if (aiResult.highlight_date && onHighlightDateRef.current) {
        onHighlightDateRef.current(aiResult.highlight_date);
      } else if (exec.addedEvents?.[0]?.date && onHighlightDateRef.current) {
        onHighlightDateRef.current(exec.addedEvents[0].date.split('T')[0]);
      }

      const allRaw = ctx.events || [];
      const matchedIds = new Set((aiResult.matched_event_ids || []).map((id) => String(id)));
      const deletedSet = new Set((exec.deletedIds || []).map((id) => String(id)));

      const matchedFromDb = allRaw.filter(
        (ev) => matchedIds.has(String(ev.id)) && !deletedSet.has(String(ev.id))
      );

      const combinedMap = new Map();
      [...(exec.addedEvents || []), ...(exec.updatedEvents || []), ...matchedFromDb].forEach((ev) => {
        if (ev && ev.id) combinedMap.set(String(ev.id), ev);
      });

      const formattedResultEvents = Array.from(combinedMap.values()).map((ev) => ({
        EventID: ev.id,
        Date: ev.date ? `${ev.date.split('T')[0]} 00:00:00` : null,
        'End Date': ev.end_date
          ? `${ev.end_date.split('T')[0]} 00:00:00`
          : ev.date
          ? `${ev.date.split('T')[0]} 00:00:00`
          : null,
        'Start Time': ev.start_time ? `${ev.start_time.substring(0, 5)}:00` : null,
        'End Time': ev.end_time ? `${ev.end_time.substring(0, 5)}:00` : null,
        Category: ev.category,
        Info: ev.info,
        Responsible:
          Array.isArray(ev.responsibles) && ev.responsibles.length > 0
            ? ev.responsibles.join(', ')
            : 'Sin Asignar',
        responsibles: ev.responsibles || [],
      }));

      setIaResultCard({
        section: 'calendario',
        title: aiResult.title || 'Resultado de Calendario',
        summary: aiResult.summary || '',
        transcription: aiResult.transcription || null,
        events: formattedResultEvents,
      });

      if (exec.errors?.length > 0) {
        setIaFeedback({ type: 'error', text: exec.errors[0] });
      } else if (exec.reverts?.length > 0) {
        setIaFeedback({
          type: 'success',
          text: `✨ ${aiResult.title || 'Calendario actualizado'} (Pulsa ↩️ para deshacer)`,
        });
      } else {
        setIaFeedback(null);
      }
    } else {
      let exec = aiResult.exec || {
        addedTransactions: [],
        updatedTransactions: [],
        deletedIds: [],
        restoredIds: [],
        reverts: [],
        errors: [],
      };

      if (!job.actionsApplied && actions.length > 0) {
        exec = await executeFinanceIaActions({
          actions,
          records: ctx.records || [],
          users: ctx.users || [],
          attachment: attForJob,
          currentUser: ctx.currentUser,
        });
        markJobActionsApplied(job.jobId);
      }

      if (exec.reverts?.length > 0) {
        setUndoStack((prev) => [
          ...prev,
          {
            description: aiResult.title || aiResult.summary || 'Cambios en contabilidad',
            reverts: exec.reverts,
          },
        ]);
      }

      if (
        (exec.addedTransactions?.length > 0 ||
          exec.updatedTransactions?.length > 0 ||
          exec.deletedIds?.length > 0 ||
          exec.restoredIds?.length > 0 ||
          job.actionsApplied) &&
        onRefreshRef.current
      ) {
        await onRefreshRef.current();
      }

      const allRecords = ctx.records || [];
      const matchedIds = new Set((aiResult.matched_transaction_ids || []).map((id) => String(id)));
      const deletedSet = new Set((exec.deletedIds || []).map((id) => String(id)));

      const mapDbRowToRecord = (tx) => ({
        TransactionID: tx.id,
        Date: tx.date ? `${tx.date.split('T')[0]} 00:00:00` : '',
        User: tx.profiles?.name || ctx.currentUser || 'Socio',
        Category: tx.type,
        Value: Math.abs(parseFloat(tx.amount || 0)),
        Amount: tx.amount,
        Description: tx.description,
        Imagen: tx.image_url,
        status: tx.status || 'ACTIVE',
      });

      const matchedFromDb = allRecords.filter(
        (r) => matchedIds.has(String(r.TransactionID)) && !deletedSet.has(String(r.TransactionID))
      );

      const combinedMap = new Map();
      [
        ...(exec.addedTransactions || []).map(mapDbRowToRecord),
        ...(exec.updatedTransactions || []).map(mapDbRowToRecord),
        ...matchedFromDb,
      ].forEach((r) => {
        if (r && r.TransactionID) combinedMap.set(String(r.TransactionID), r);
      });

      setIaResultCard({
        section: 'gasto-ingreso',
        title: aiResult.title || 'Resultado Contabilidad',
        summary: aiResult.summary || '',
        transcription: aiResult.transcription || null,
        transactions: Array.from(combinedMap.values()),
        showBalancesTable: Boolean(aiResult.show_balances_table),
        finances: ctx.finances || [],
        customTable: aiResult.custom_table || null,
      });

      if (exec.errors?.length > 0) {
        setIaFeedback({ type: 'error', text: exec.errors[0] });
      } else if (exec.reverts?.length > 0) {
        setIaFeedback({
          type: 'success',
          text: `✨ ${aiResult.title || 'Contabilidad actualizada'} (Pulsa ↩️ para deshacer)`,
        });
      } else {
        setIaFeedback(null);
      }
    }
  };

  // Suscripción al gestor global de trabajos en segundo plano (sobrevive navegación y recargas)
  useEffect(() => {
    const unsubscribe = subscribeSectionJobs(section, (snap) => {
      setIsProcessingIa(snap.isProcessing);
      if (snap.isProcessing) {
        setIaFeedback({
          type: 'info',
          text:
            section === 'calendario'
              ? '🤖 Procesando consulta de calendario en segundo plano...'
              : '🤖 Procesando consulta contable en segundo plano...',
        });
      }

      if (snap.errorUnacked.length > 0) {
        const latestErr = snap.errorUnacked[0];
        if (!consumedJobIdsRef.current.has(latestErr.jobId)) {
          consumedJobIdsRef.current.add(latestErr.jobId);
          acknowledgeAiJob(latestErr.jobId);
          setIaFeedback({ type: 'error', text: `Error: ${latestErr.error}` });
        }
      }

      for (const finishedJob of snap.completedUnacked) {
        applyCompletedSectionJob(finishedJob);
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // ── Controles de grabación de voz (con apagado estricto de micrófono) ─────
  const handleStartVoiceRecording = async () => {
    if (isProcessingIa || isVoiceRecording) return;
    setPendingVoiceAudio(null);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIaFeedback({ type: 'error', text: 'El navegador no admite grabación de audio.' });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recordStartRef.current = Date.now();
      setVoiceRecordingSeconds(0);
      setIsVoiceRecording(true);
      recorder.start(300);

      recordTimerRef.current = setInterval(() => {
        setVoiceRecordingSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 400);
    } catch (err) {
      console.error('[SectionChatIA] Error iniciando micrófono:', err);
      setIaFeedback({ type: 'error', text: 'Permiso de micrófono requerido para grabar voz.' });
    }
  };

  const stopRecordingInternal = () => {
    return new Promise((resolve) => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      const elapsed = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));

      if (!recorder || recorder.state === 'inactive') {
        if (streamRef.current) {
          stopMediaStream(streamRef.current);
          streamRef.current = null;
        }
        setIsVoiceRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        if (streamRef.current) {
          stopMediaStream(streamRef.current);
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        setIsVoiceRecording(false);

        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            blob,
            dataUrl: reader.result,
            mimeType: finalMime,
            duration: elapsed,
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.stop();
    });
  };

  const handleStopVoiceRecording = async () => {
    const audioResult = await stopRecordingInternal();
    if (audioResult) {
      setPendingVoiceAudio(audioResult);
      setPreviewDuration(audioResult.duration);
    }
  };

  const handleCancelVoiceRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsVoiceRecording(false);
    setPendingVoiceAudio(null);
    setIsPreviewPlaying(false);
  };

  const handleDiscardVoice = () => {
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPendingVoiceAudio(null);
  };

  const togglePlayPreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play().catch(() => {});
      setIsPreviewPlaying(true);
    }
  };

  const handleSeekPreview = (e) => {
    const t = parseFloat(e.target.value);
    setPreviewCurrentTime(t);
    if (previewAudioRef.current) previewAudioRef.current.currentTime = t;
  };

  // ── Adjuntos y cámara ─────────────────────────────────────────────────────
  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingAttachment({
        file,
        name: file.name || `foto-${Date.now()}.jpg`,
        size: file.size,
        type: file.type || 'image/jpeg',
        dataUrl: ev.target.result,
        textContent: null,
        isImage: true,
        isPdf: false,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const nameLower = file.name.toLowerCase();
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    const isText =
      file.type.startsWith('text/') ||
      nameLower.endsWith('.txt') ||
      nameLower.endsWith('.csv') ||
      nameLower.endsWith('.json') ||
      nameLower.endsWith('.md');

    const reader = new FileReader();
    if (isText) {
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          textContent: ev.target.result,
          dataUrl: null,
          isImage: false,
          isPdf: false,
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        setPendingAttachment({
          file,
          name: file.name,
          size: file.size,
          type: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          textContent: null,
          dataUrl: ev.target.result,
          isImage: isImg,
          isPdf,
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // ── Envío de orden o consulta a Gemini en segundo plano (Background Job) ───
  const handleSendOrder = async () => {
    const textOrder = inputText.trim();
    const audioOrder = pendingVoiceAudio;
    const attOrder = pendingAttachment;

    if (!textOrder && !audioOrder && !attOrder) return;
    if (isProcessingIa) return;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setIaFeedback({ type: 'error', text: 'API Key de Gemini no configurada.' });
      return;
    }

    // Limpiar barra inferior inmediatamente para UX fluida y sin bloqueos
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setPendingVoiceAudio(null);
    setPendingAttachment(null);
    setIsPreviewPlaying(false);

    setIsProcessingIa(true);
    setIaFeedback({
      type: 'info',
      text:
        section === 'calendario'
          ? '🤖 Procesando consulta de calendario en segundo plano...'
          : '🤖 Procesando consulta contable en segundo plano...',
    });

    const knowledge = await loadFarmKnowledgeSafe();
    const systemInstruction = buildSectionSystemInstruction(section, contextData, knowledge);

    let effectivePrompt = textOrder;
    if (!effectivePrompt && attOrder && !audioOrder) {
      effectivePrompt =
        section === 'gasto-ingreso'
          ? 'Analiza esta factura, ticket o documento adjunto, extrae importe, concepto, tipo (Gasto o Retiro/Ingreso) y socio si aparece, y prepáralo en formato CREATE_TRANSACTION o resúmelo.'
          : 'Analiza este documento o imagen adjunta en relación al calendario de Campito Jorox y genera las acciones o respuestas correspondientes.';
    } else if (!effectivePrompt && audioOrder) {
      effectivePrompt =
        section === 'calendario'
          ? 'Escucha esta nota de voz del agricultor sobre el calendario. Transcríbela en "transcription", responde a su consulta o ejecuta el alta/edición/borrado de eventos en "actions" y devuelve los IDs coincidentes en "matched_event_ids".'
          : 'Escucha esta nota de voz del agricultor sobre gastos, ventas o contabilidad. Transcríbela en "transcription", responde a su consulta o ejecuta el alta/edición/borrado en "actions" y activa "show_balances_table" o "matched_transaction_ids" según corresponda.';
    }

    const { jobId } = startAiBackgroundJob({
      section,
      prompt: effectivePrompt,
      systemInstruction,
      attachment: attOrder,
      audio: audioOrder,
      responseMimeType: 'application/json',
      userMeta: { userName: contextData.currentUser || 'Ariel' },
      directFallbackFn: () =>
        callSectionGemini({
          section,
          prompt: textOrder,
          audio: audioOrder,
          attachment: attOrder,
          contextData,
          apiKey,
        }),
    });

    if (attOrder) {
      pendingAttachmentsByJobRef.current.set(jobId, attOrder);
    }
  };

  // ── Deshacer último cambio (Undo) ─────────────────────────────────────────
  const handleUndo = async () => {
    if (undoStack.length === 0 || isProcessingIa) return;
    const lastAction = undoStack[undoStack.length - 1];
    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: `↩️ Revirtiendo: "${lastAction.description}"...` });

    try {
      if (section === 'calendario') {
        await revertCalendarIaActions(lastAction.reverts);
      } else {
        await revertFinanceIaActions(lastAction.reverts);
      }
      setUndoStack((prev) => prev.slice(0, -1));
      if (onRefresh) await onRefresh();
      setIaResultCard(null);
      setIaFeedback({ type: 'success', text: '✅ Cambio revertido correctamente.' });
    } catch (err) {
      setIaFeedback({ type: 'error', text: `Error al deshacer: ${err.message}` });
    } finally {
      setIsProcessingIa(false);
    }
  };

  const getEventColor = (category) => {
    if (!category) return categoryColors.OTRO || '#8884d8';
    if (category.startsWith('RIEGO')) return categoryColors.RIEGO || '#38bdf8';
    if (category.startsWith('MANTENIMIENTO')) return categoryColors.MANTENIMIENTO || '#10b981';
    return categoryColors[category] || '#00979d';
  };

  return (
    <div style={styles.fixedBottomChatWrapper}>
      {/* ── Tarjeta de Respuestas de IA por arriba del div Chat IA (Tablas blancas con bordes redondeados) ── */}
      {iaResultCard && (
        <div style={styles.responseCard}>
          {/* Cabecera */}
          <div style={styles.cardHeaderRow}>
            <span style={styles.cardTitle}>{iaResultCard.title}</span>
            <div style={styles.cardHeaderRight}>
              <span style={styles.cardCategoryBadge}>
                {section === 'calendario' ? 'CALENDARIO' : 'CONTABILIDAD'}
              </span>
              <button
                type="button"
                onClick={() => setIaResultCard(null)}
                style={styles.cardCloseBtn}
                title="Cerrar resultado"
                aria-label="Cerrar resultado"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Transcripción si vino por nota de voz */}
          {iaResultCard.transcription && (
            <div style={styles.transcriptionBox}>
              🎙️ "{iaResultCard.transcription}"
            </div>
          )}

          {/* Resumen textual de respuesta */}
          {iaResultCard.summary && (
            <p style={styles.summaryText}>{iaResultCard.summary}</p>
          )}

          {/* FORMATO CALENDARIO: Eventos compactos en tabla blanca con bordes redondeados */}
          {iaResultCard.section === 'calendario' && iaResultCard.events?.length > 0 && (
            <div style={styles.whiteRoundedTable}>
              {iaResultCard.events.map((ev, idx) => {
                const evColor = getEventColor(ev.Category);
                const startT = ev['Start Time'] ? ev['Start Time'].substring(0, 5) : '';
                const endT = ev['End Time'] ? ev['End Time'].substring(0, 5) : '';
                const timeRange = startT && endT ? `${startT} - ${endT}` : startT || 'Todo el día';
                return (
                  <div
                    key={ev.EventID || idx}
                    onClick={() => onSelectResultItem && onSelectResultItem(ev)}
                    style={{
                      ...styles.compactRow,
                      borderBottom: idx < iaResultCard.events.length - 1 ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div style={styles.rowLeft}>
                      <div style={styles.rowLeftTop}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: evColor,
                            flexShrink: 0,
                          }}
                        />
                        <span style={styles.rowPrimaryLabel}>{ev.Category || 'Evento'}</span>
                        <span style={styles.rowDateLabel}>{formatDateDDMMYY(ev.Date)}</span>
                      </div>
                      <span style={styles.rowSubText}>{ev.Info || 'Sin detalles adicionales'}</span>
                    </div>

                    <div style={styles.rowRight}>
                      <div style={styles.rowRightTop}>{timeRange}</div>
                      <div style={styles.rowRightBottom}>{ev.Responsible || 'Sin asignar'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FORMATO GASTO-VENTA (1): Tabla de Balances Contables por Socio */}
          {iaResultCard.section === 'gasto-ingreso' &&
            iaResultCard.showBalancesTable &&
            iaResultCard.finances?.length > 0 && (
              <div style={styles.whiteRoundedTable}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.financeMiniTable}>
                    <thead>
                      <tr>
                        <th style={styles.financeTh}>Socio</th>
                        <th style={{ ...styles.financeTh, textAlign: 'right' }}>Gasto</th>
                        <th style={{ ...styles.financeTh, textAlign: 'right' }}>Ingreso</th>
                        <th style={{ ...styles.financeTh, textAlign: 'right' }}>Balance</th>
                        <th style={{ ...styles.financeTh, textAlign: 'right' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iaResultCard.finances.map((f, idx) => (
                        <tr key={f.user || idx}>
                          <td style={{ ...styles.financeTd, fontWeight: 700, color: '#0f172a' }}>{f.user}</td>
                          <td style={{ ...styles.financeTd, textAlign: 'right', color: '#475569' }}>
                            {formatCurrency(f.gasto)}
                          </td>
                          <td style={{ ...styles.financeTd, textAlign: 'right', color: '#166534' }}>
                            {formatCurrency(f.venta)}
                          </td>
                          <td
                            style={{
                              ...styles.financeTd,
                              textAlign: 'right',
                              fontWeight: 700,
                              color: f.balance < 0 ? '#991b1b' : '#14532d',
                            }}
                          >
                            {formatCurrency(f.balance)}
                          </td>
                          <td style={{ ...styles.financeTd, textAlign: 'right' }}>
                            {f.diferencia === 0 ? (
                              <span style={styles.pillOk}>✓ Al día</span>
                            ) : (
                              <span style={styles.pillDiff}>{formatCurrency(f.diferencia)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={styles.communityBalanceFooter}>
                  <span>Balance Total Comunidad:</span>
                  <strong>
                    {formatCurrency(iaResultCard.finances.reduce((acc, f) => acc + (f.balance || 0), 0))}
                  </strong>
                </div>
              </div>
            )}

          {/* FORMATO GASTO-VENTA (2): Tabla personalizada si la consulta pide desgloses */}
          {iaResultCard.section === 'gasto-ingreso' &&
            iaResultCard.customTable &&
            Array.isArray(iaResultCard.customTable.headers) &&
            Array.isArray(iaResultCard.customTable.rows) && (
              <div style={styles.whiteRoundedTable}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.financeMiniTable}>
                    <thead>
                      <tr>
                        {iaResultCard.customTable.headers.map((h, i) => (
                          <th key={i} style={styles.financeTh}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {iaResultCard.customTable.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} style={styles.financeTd}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* FORMATO GASTO-VENTA (3): Transacciones en formato compacto idéntico a la sección */}
          {iaResultCard.section === 'gasto-ingreso' && iaResultCard.transactions?.length > 0 && (
            <div style={styles.whiteRoundedTable}>
              {iaResultCard.transactions.map((r, idx) => {
                const isRetiro = r.Category === 'Retiro';
                const isDeleted = r.status === 'DELETED';
                const amtColor = isDeleted ? '#ef4444' : isRetiro ? '#16a34a' : '#475569';
                return (
                  <div
                    key={r.TransactionID || idx}
                    onClick={() => onSelectResultItem && onSelectResultItem(r)}
                    style={{
                      ...styles.compactRow,
                      borderBottom: idx < iaResultCard.transactions.length - 1 ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div style={styles.rowLeft}>
                      <div style={styles.rowLeftTop}>
                        <span style={{ ...styles.rowPrimaryLabel, color: isDeleted ? '#ef4444' : '#0f172a' }}>
                          {r.User}
                        </span>
                        <span style={styles.rowDateLabel}>{r.Date ? r.Date.split(' ')[0] : ''}</span>
                        {r.Imagen && (
                          <span title="Justificante adjunto" style={{ display: 'inline-flex', color: '#64748b' }}>
                            <FileText size={13} />
                          </span>
                        )}
                      </div>
                      {r.Description && <span style={styles.rowSubText}>{r.Description}</span>}
                    </div>

                    <div style={styles.rowRight}>
                      <div style={{ ...styles.rowRightTop, color: amtColor }}>
                        {formatCurrency(Math.abs(r.Amount || 0))}
                      </div>
                      <div style={{ ...styles.rowRightBottom, color: amtColor }}>
                        {isRetiro ? 'INGRESO' : 'GASTO'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vista previa de archivo adjunto pendiente ──────────────────────── */}
      {pendingAttachment && (
        <div style={styles.pendingAttachmentCard}>
          {pendingAttachment.isImage && pendingAttachment.dataUrl ? (
            <img
              src={pendingAttachment.dataUrl}
              alt="Adjunto"
              style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
            />
          ) : (
            <div style={styles.pendingDocIcon}>
              <FileText size={20} color="#00979d" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.pendingAttachmentName}>{pendingAttachment.name}</p>
            <p style={styles.pendingAttachmentMeta}>
              {(pendingAttachment.size / 1024).toFixed(1)} KB ·{' '}
              {pendingAttachment.isImage ? 'Foto lista para analizar' : 'Documento listo'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            style={styles.targetCloseBtn}
            title="Quitar adjunto"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Banner de Feedback (idéntico a Mapas) ─────────────────────────── */}
      {iaFeedback && (
        <div
          style={{
            ...styles.mapIaFeedbackBanner,
            backgroundColor:
              iaFeedback.type === 'error'
                ? '#fef2f2'
                : iaFeedback.type === 'info'
                ? '#eff6ff'
                : '#f0fdf4',
            borderColor:
              iaFeedback.type === 'error'
                ? '#fca5a5'
                : iaFeedback.type === 'info'
                ? '#93c5fd'
                : '#86efac',
            color:
              iaFeedback.type === 'error'
                ? '#991b1b'
                : iaFeedback.type === 'info'
                ? '#1e40af'
                : '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            {isProcessingIa && <div style={styles.miniSpinner} />}
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{iaFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setIaFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'inherit' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Barra de Input Inferior (idéntica a Mapas y Chat IA) ──────────── */}
      <div style={styles.chatIaInputBar}>
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,image/*,application/pdf"
          onChange={handleDocumentChange}
          style={{ display: 'none' }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraChange}
          style={{ display: 'none' }}
        />

        {/* 1. Botón (+) a la izquierda */}
        <button
          type="button"
          style={{
            ...styles.chatIaAttachBtn,
            backgroundColor: pendingAttachment && !pendingAttachment.isImage ? '#00979d' : '#f0f0f0',
            color: pendingAttachment && !pendingAttachment.isImage ? '#ffffff' : '#555555',
          }}
          onClick={() => docInputRef.current?.click()}
          aria-label="Adjuntar archivo o documento (+)"
          title="Adjuntar archivo o documento (+)"
        >
          <Plus size={20} />
        </button>

        {/* 2. Cápsula central (con icono del robotito antes de "Mensaje...") */}
        {pendingVoiceAudio && !isVoiceRecording ? (
          <div style={styles.chatIaAudioPreviewCapsule}>
            <button
              type="button"
              onClick={handleDiscardVoice}
              style={styles.previewTrashBtn}
              title="Descartar nota de voz"
            >
              <Trash2 size={18} color="#ef4444" />
            </button>
            <button
              type="button"
              onClick={togglePlayPreview}
              style={styles.previewPlayBtn}
              title={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
            >
              {isPreviewPlaying ? (
                <Pause size={15} color="#ffffff" />
              ) : (
                <Play size={15} color="#ffffff" style={{ marginLeft: 2 }} />
              )}
            </button>
            <div style={styles.previewTrackContainer}>
              <input
                type="range"
                min={0}
                max={previewDuration || pendingVoiceAudio.duration || 1}
                step="0.05"
                value={previewCurrentTime}
                onChange={handleSeekPreview}
                style={styles.previewSlider}
                aria-label="Progreso del audio"
              />
              <div style={styles.previewTimeRow}>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                  {formatAudioTime(previewCurrentTime > 0 ? previewCurrentTime : previewDuration || pendingVoiceAudio.duration)}
                </span>
              </div>
            </div>
            <audio
              ref={previewAudioRef}
              src={pendingVoiceAudio.dataUrl}
              onTimeUpdate={(e) => setPreviewCurrentTime(e.target.currentTime)}
              onLoadedMetadata={(e) => {
                if (e.target.duration && !isNaN(e.target.duration) && isFinite(e.target.duration)) {
                  setPreviewDuration(Math.round(e.target.duration));
                }
              }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                setPreviewCurrentTime(0);
              }}
              style={{ display: 'none' }}
            />
          </div>
        ) : isVoiceRecording ? (
          <div style={styles.chatIaRecordingCapsule}>
            <span style={styles.pulsingRedDot} />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
              {formatAudioTime(voiceRecordingSeconds)}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>
              Grabando nota de voz...
            </span>
            <button
              type="button"
              onClick={handleCancelVoiceRecording}
              style={styles.previewTrashBtn}
              title="Cancelar grabación"
            >
              <Trash2 size={17} color="#64748b" />
            </button>
          </div>
        ) : (
          <div style={styles.chatIaInputCapsule}>
            <Bot size={18} color="#00979d" style={{ flexShrink: 0, marginRight: 8 }} />
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendOrder();
                }
              }}
              placeholder="Mensaje..."
              style={styles.chatIaTextInput}
              disabled={isProcessingIa}
              autoComplete="off"
              autoCorrect="on"
              spellCheck="true"
            />
            <button
              type="button"
              style={{
                ...styles.capsuleCameraBtn,
                background: pendingAttachment?.isImage ? '#00979d' : 'transparent',
                color: pendingAttachment?.isImage ? '#ffffff' : '#64748b',
              }}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Tomar foto con la cámara"
              title="Tomar foto con la cámara"
            >
              <Camera size={19} />
            </button>
          </div>
        )}

        {/* 3. Botón de Acción a la derecha (Stop / Send / Mic) */}
        {isVoiceRecording ? (
          <button
            type="button"
            onClick={handleStopVoiceRecording}
            style={{
              ...styles.chatIaActionBtn,
              backgroundColor: '#dc2626',
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
            }}
            title="Detener grabación y revisar audio"
            aria-label="Detener grabación"
          >
            <StopCircle size={20} />
          </button>
        ) : inputText.trim() || pendingVoiceAudio || pendingAttachment ? (
          <button
            type="button"
            onClick={handleSendOrder}
            disabled={isProcessingIa}
            style={{
              ...styles.chatIaActionBtn,
              backgroundColor: '#00979d',
              color: '#ffffff',
              opacity: isProcessingIa ? 0.7 : 1,
            }}
            title="Enviar a Chat IA"
            aria-label="Enviar"
          >
            {isProcessingIa ? <div style={styles.miniWhiteSpinner} /> : <Send size={18} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartVoiceRecording}
            disabled={isProcessingIa}
            style={{
              ...styles.chatIaActionBtn,
              backgroundColor: '#00979d',
              color: '#ffffff',
            }}
            title="Grabar nota de voz"
            aria-label="Grabar nota de voz"
          >
            <Mic size={20} />
          </button>
        )}

        {/* 4. Botón Deshacer (Undo) si hay cambios recientes */}
        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={isProcessingIa}
            style={styles.chatIaUndoBtn}
            title={`Deshacer: ${undoStack[undoStack.length - 1].description}`}
            aria-label="Deshacer último cambio"
          >
            <Undo2 size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  fixedBottomChatWrapper: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 820,
    margin: '0 auto',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
  },
  responseCard: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    border: '1.5px solid #cbd5e1',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.16)',
    padding: '12px 14px',
    margin: '0 12px 10px 12px',
    gap: 8,
    boxSizing: 'border-box',
    maxHeight: '46vh',
    overflowY: 'auto',
    pointerEvents: 'auto',
    color: '#0f172a',
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  cardTitle: {
    fontWeight: 700,
    fontSize: '0.96rem',
    color: '#0f172a',
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  cardCategoryBadge: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  cardCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptionBox: {
    fontSize: '0.76rem',
    color: '#64748b',
    fontStyle: 'italic',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
  },
  summaryText: {
    margin: 0,
    fontSize: '0.84rem',
    color: '#334155',
    lineHeight: 1.4,
  },
  whiteRoundedTable: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: '2px 10px',
    display: 'flex',
    flexDirection: 'column',
  },
  compactRow: {
    cursor: 'pointer',
    padding: '0.7rem 0.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.8rem',
  },
  rowLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  rowLeftTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    minWidth: 0,
  },
  rowPrimaryLabel: {
    fontWeight: 700,
    fontSize: '0.92rem',
    color: '#0f172a',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowDateLabel: {
    fontSize: '0.78rem',
    color: '#64748b',
    opacity: 0.9,
    flexShrink: 0,
  },
  rowSubText: {
    fontSize: '0.83rem',
    color: '#64748b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowRight: {
    textAlign: 'right',
    flexShrink: 0,
  },
  rowRightTop: {
    fontWeight: 700,
    fontSize: '0.96rem',
    color: '#0f172a',
  },
  rowRightBottom: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    fontWeight: 600,
    color: '#64748b',
    opacity: 0.9,
    marginTop: '1px',
  },
  financeMiniTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
  },
  financeTh: {
    textAlign: 'left',
    padding: '7px 6px',
    borderBottom: '1px solid #e2e8f0',
    color: '#64748b',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  financeTd: {
    padding: '7px 6px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
  },
  pillOk: {
    display: 'inline-block',
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '2px 7px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '0.7rem',
  },
  pillDiff: {
    display: 'inline-block',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '2px 7px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '0.7rem',
  },
  communityBalanceFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 6px 6px 6px',
    borderTop: '1px solid #e2e8f0',
    fontSize: '0.78rem',
    color: '#475569',
  },
  pendingAttachmentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    margin: '0 12px 8px 12px',
    backgroundColor: 'rgba(240, 253, 250, 0.98)',
    backdropFilter: 'blur(8px)',
    borderRadius: 12,
    border: '1px solid #99f6e4',
    boxShadow: '0 4px 12px rgba(0, 151, 157, 0.12)',
    pointerEvents: 'auto',
  },
  pendingDocIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingAttachmentName: {
    margin: 0,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#0f172a',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
  },
  pendingAttachmentMeta: {
    margin: 0,
    fontSize: '0.68rem',
    color: '#0f766e',
  },
  targetCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  mapIaFeedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    margin: '0 12px 8px 12px',
    borderRadius: 8,
    border: '1px solid',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(8px)',
    pointerEvents: 'auto',
  },
  chatIaInputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e8e8e8',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
    pointerEvents: 'auto',
  },
  chatIaAttachBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaInputCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: '#fafafa',
    borderRadius: 22,
    border: '1.5px solid #e0e0e0',
    padding: '0 6px 0 12px',
    boxSizing: 'border-box',
  },
  chatIaTextInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1a1a1a',
    resize: 'none',
    lineHeight: 1.4,
    fontSize: '0.9rem',
    maxHeight: 100,
    overflowY: 'auto',
    fontFamily: 'inherit',
    padding: '9px 0',
  },
  capsuleCameraBtn: {
    width: 34,
    height: 34,
    minWidth: 34,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaActionBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  chatIaUndoBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: '#334155',
    color: '#ffffff',
    flexShrink: 0,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  chatIaAudioPreviewCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    border: '1px solid #00979d',
    padding: '0 12px',
    gap: 10,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
  previewTrashBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: '#00979d',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  previewTrackContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 2,
  },
  previewSlider: {
    width: '100%',
    height: 4,
    cursor: 'pointer',
    accentColor: '#00979d',
  },
  previewTimeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatIaRecordingCapsule: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    border: '1.5px solid #ef4444',
    padding: '0 14px',
    gap: 10,
  },
  pulsingRedDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    flexShrink: 0,
  },
  miniSpinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid rgba(59,130,246,0.2)',
    borderTop: '2px solid #2563eb',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  miniWhiteSpinner: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #ffffff',
    animation: 'spin 0.8s linear infinite',
  },
};

