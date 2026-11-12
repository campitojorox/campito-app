// src/components/SectionChatIA.jsx
// Barra fija inferior de Chat IA compartida para las secciones Calendario y Gasto-Venta.

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Undo2,
} from 'lucide-react';
import { useAudioRecorder, formatAudioTime } from '../hooks/useAudioRecorder';
import { syncTextareaHeight } from '../utils/helpers';
import { ACCEPTED_CHAT_FILE_TYPES, readFilesAsAttachments } from '../utils/attachmentUtils';
import PendingAttachmentsList from './PendingAttachmentsList';
import {
  buildSectionSystemInstruction,
  loadFarmKnowledgeSafe,
  callSectionGemini,
  executeCalendarIaActions,
  revertCalendarIaActions,
  executeFinanceIaActions,
  revertFinanceIaActions,
} from '../services/sectionIaService';
import { callUnifiedAiBrain } from '../services/unifiedAiBrain';
import {
  startAiBackgroundJob,
  subscribeSectionJobs,
  acknowledgeAiJob,
  markJobActionsApplied,
} from '../services/aiBackgroundJobManager';
import SectionIaResultCard from './SectionIaResultCard';
import { styles } from './sectionChatStyles';

const DEFAULT_CALENDAR_COLORS = {
  RIEGO: '#38bdf8',
  MANTENIMIENTO: '#10b981',
  OTRO: '#8884d8',
};

export default function SectionChatIA({
  section,
  contextData = {},
  onRefresh,
  onSelectResultItem,
  onHighlightDate,
  categoryColors = DEFAULT_CALENDAR_COLORS,
}) {
  const [inputText, setInputText] = useState('');
  const [isProcessingIa, setIsProcessingIa] = useState(false);
  const [iaFeedback, setIaFeedback] = useState(null);
  const [iaResultCard, setIaResultCardState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`campito_section_card_${section}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [undoStack, setUndoStack] = useState([]);

  const setIaResultCard = useCallback(
    (card) => {
      setIaResultCardState(card);
      try {
        if (card) sessionStorage.setItem(`campito_section_card_${section}`, JSON.stringify(card));
        else sessionStorage.removeItem(`campito_section_card_${section}`);
      } catch {
        // ignore
      }
    },
    [section]
  );

  const [pendingAttachments, setPendingAttachments] = useState([]);
  const docInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const handleAudioError = useCallback((err) => {
    console.error('[SectionChatIA] Error micrófono:', err);
    setIaFeedback({ type: 'error', text: 'Permiso de micrófono requerido para grabar voz.' });
  }, []);

  const {
    isRecording: isVoiceRecording,
    recordingSeconds: voiceRecordingSeconds,
    startRecording: handleStartVoiceRecording,
    stopRecording: handleStopVoiceRecording,
    cancelRecording: handleCancelVoiceRecording,
    pendingAudio: pendingVoiceAudio,
    setPendingAudio: setPendingVoiceAudio,
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardAudio: handleDiscardVoice,
  } = useAudioRecorder({ onError: handleAudioError });

  const contextDataRef = useRef(contextData);
  const onRefreshRef = useRef(onRefresh);
  const onHighlightDateRef = useRef(onHighlightDate);
  const consumedJobIdsRef = useRef(new Set());
  const pendingAttachmentsByJobRef = useRef(new Map());

  useEffect(() => {
    syncTextareaHeight(textareaRef.current, inputText);
  }, [inputText]);

  useEffect(() => {
    contextDataRef.current = contextData;
    onRefreshRef.current = onRefresh;
    onHighlightDateRef.current = onHighlightDate;
  }, [contextData, onRefresh, onHighlightDate]);

  useEffect(() => {
    if (!iaFeedback || isProcessingIa) return;
    const timer = setTimeout(() => setIaFeedback(null), 8000);
    return () => clearTimeout(timer);
  }, [iaFeedback, isProcessingIa]);

  const applyCompletedSectionJob = useCallback(
    async (job) => {
      if (!job || consumedJobIdsRef.current.has(job.jobId)) return;
      consumedJobIdsRef.current.add(job.jobId);
      acknowledgeAiJob(job.jobId);

      const aiResult = job.result || {};
      const ctx = contextDataRef.current || {};
      const actions = Array.isArray(aiResult.actions) ? aiResult.actions : [];
      const attsForJob = pendingAttachmentsByJobRef.current.get(job.jobId) || [];
      pendingAttachmentsByJobRef.current.delete(job.jobId);

      if (section === 'calendario') {
        let exec = aiResult.exec || { addedEvents: [], updatedEvents: [], deletedIds: [], reverts: [], errors: [] };
        const serverMutatedCal =
          job.actionsApplied &&
          ((exec.addedEvents?.length || 0) + (exec.updatedEvents?.length || 0) + (exec.deletedIds?.length || 0) > 0 ||
            (exec.errors?.length || 0) > 0);

        if (!serverMutatedCal && actions.length > 0) {
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
          (exec.addedEvents?.length > 0 ||
            exec.updatedEvents?.length > 0 ||
            exec.deletedIds?.length > 0 ||
            job.actionsApplied) &&
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

        const serverMutatedFin =
          job.actionsApplied &&
          ((exec.addedTransactions?.length || 0) +
            (exec.updatedTransactions?.length || 0) +
            (exec.deletedIds?.length || 0) +
            (exec.restoredIds?.length || 0) >
            0 ||
            (exec.errors?.length || 0) > 0);

        if (!serverMutatedFin && actions.length > 0) {
          exec = await executeFinanceIaActions({
            actions,
            records: ctx.records || [],
            users: ctx.users || [],
            attachment: attsForJob[0] || null,
            attachments: attsForJob,
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
            serverMutatedFin) &&
          onRefreshRef.current
        ) {
          await onRefreshRef.current();
        }

        const allRecords = ctx.records || [];
        const matchedIds = new Set((aiResult.matched_transaction_ids || []).map((id) => String(id)));
        const deletedSet = new Set((exec.deletedIds || []).map((id) => String(id)));

        const mapDbRowToRecord = (tx) => {
          const matchedProfile = (ctx.users || []).find((u) => String(u.id) === String(tx.user_id));
          return {
            TransactionID: tx.id,
            Date: tx.date ? `${tx.date.split('T')[0]} 00:00:00` : '',
            User: tx.profiles?.name || matchedProfile?.name || ctx.currentUser || 'Socio',
            Category: tx.type,
            Value: Math.abs(parseFloat(tx.amount || 0)),
            Amount: tx.amount,
            Description: tx.description,
            Imagen: tx.image_url,
            status: tx.status || 'ACTIVE',
          };
        };

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
    },
    [section, setIaResultCard]
  );

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
  }, [section, applyCompletedSectionJob]);

  const handleCameraChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files, { forceImage: true });
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  const handleDocumentChange = async (e) => {
    const items = await readFilesAsAttachments(e.target.files);
    if (items.length > 0) {
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    e.target.value = '';
  };

  const handleSendOrder = async () => {
    const textOrder = inputText.trim();
    const audioOrder = pendingVoiceAudio;
    const attsOrder = pendingAttachments;

    if (!textOrder && !audioOrder && attsOrder.length === 0) return;
    if (isProcessingIa) return;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setIaFeedback({ type: 'error', text: 'API Key de Gemini no configurada.' });
      return;
    }

    setInputText('');
    syncTextareaHeight(textareaRef.current, '');
    setPendingVoiceAudio(null);
    setPendingAttachments([]);
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
    if (!effectivePrompt && attsOrder.length > 0 && !audioOrder) {
      const namesLabel = attsOrder.map((a) => `"${a.name || 'documento'}"`).join(', ');
      effectivePrompt =
        section === 'gasto-ingreso'
          ? `Analiza ${attsOrder.length > 1 ? 'estas facturas, tickets o documentos adjuntos' : 'esta factura, ticket o documento adjunto'} (${namesLabel}), extrae importe, concepto, tipo (Gasto o Retiro/Ingreso) y socio si aparece, y prepáralo en formato CREATE_TRANSACTION o resúmelo.`
          : `Analiza ${attsOrder.length > 1 ? 'estos documentos o imágenes adjuntas' : 'este documento o imagen adjunta'} (${namesLabel}) en relación al calendario de Campito Jorox y genera las acciones o respuestas correspondientes.`;
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
      attachment: attsOrder[0] || null,
      attachments: attsOrder,
      audio: audioOrder,
      responseMimeType: 'application/json',
      userMeta: { userName: contextData.currentUser || 'Usuario' },
      directFallbackFn: async () => {
        try {
          const brainRes = await callUnifiedAiBrain({
            prompt: textOrder,
            section,
            audio: audioOrder,
            attachments: attsOrder,
            events: contextData.events || [],
            transactions: contextData.transactions || [],
            users: contextData.users || [],
            userMeta: { userName: contextData.currentUser || 'Usuario' },
            apiKey,
          });
          return { rawText: brainRes.rawText, parsed: brainRes.parsedCommands };
        } catch {
          return callSectionGemini({
            section,
            prompt: textOrder,
            audio: audioOrder,
            attachment: attsOrder[0] || null,
            attachments: attsOrder,
            contextData,
            apiKey,
          });
        }
      },
    });

    if (attsOrder.length > 0) {
      pendingAttachmentsByJobRef.current.set(jobId, attsOrder);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || isProcessingIa) return;
    const lastAction = undoStack[undoStack.length - 1];
    setIsProcessingIa(true);
    setIaFeedback({ type: 'info', text: `↩️ Revirtiendo: "${lastAction.description}"...` });

    try {
      if (section === 'calendario') await revertCalendarIaActions(lastAction.reverts);
      else await revertFinanceIaActions(lastAction.reverts);
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
      <SectionIaResultCard
        iaResultCard={iaResultCard}
        section={section}
        onClose={() => setIaResultCard(null)}
        onSelectResultItem={onSelectResultItem}
        getEventColor={getEventColor}
      />

      <PendingAttachmentsList
        attachments={pendingAttachments}
        onRemove={(idOrIdx, idx) =>
          setPendingAttachments((prev) =>
            prev.filter((item, i) => (item.id ? item.id !== idOrIdx : i !== idx))
          )
        }
        onClearAll={() => setPendingAttachments([])}
        variant="card"
        imageLabel="Foto lista para analizar"
      />

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

      <div style={styles.chatIaInputBar}>
        <input
          ref={docInputRef}
          type="file"
          multiple
          accept={ACCEPTED_CHAT_FILE_TYPES}
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

        <button
          type="button"
          style={{
            ...styles.chatIaAttachBtn,
            backgroundColor: pendingAttachments.some((a) => !a.isImage) ? '#00979d' : '#f0f0f0',
            color: pendingAttachments.some((a) => !a.isImage) ? '#ffffff' : '#555555',
          }}
          onClick={() => docInputRef.current?.click()}
          aria-label="Adjuntar archivos o documentos (+)"
          title="Adjuntar uno o varios archivos (+)"
        >
          <Plus size={20} />
        </button>

        {pendingVoiceAudio && !isVoiceRecording ? (
          <div style={styles.chatIaAudioPreviewCapsule}>
            <button type="button" onClick={handleDiscardVoice} style={styles.previewTrashBtn} title="Descartar nota de voz">
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
                if (e.target.duration && !Number.isNaN(e.target.duration) && Number.isFinite(e.target.duration)) {
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
            <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>Grabando nota de voz...</span>
            <button type="button" onClick={handleCancelVoiceRecording} style={styles.previewTrashBtn} title="Cancelar grabación">
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
                const val = e.target.value;
                setInputText(val);
                syncTextareaHeight(e.target, val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendOrder();
                }
              }}
              placeholder={
                section === 'calendario'
                  ? 'Pregunta fechas, agenda un riego o dicta con voz...'
                  : 'Apunta un gasto, consulta saldos o sube tickets...'
              }
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
                background: pendingAttachments.some((a) => a.isImage) ? '#00979d' : 'transparent',
                color: pendingAttachments.some((a) => a.isImage) ? '#ffffff' : '#64748b',
              }}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Tomar foto con la cámara"
              title="Tomar foto con la cámara"
            >
              <Camera size={19} />
            </button>
          </div>
        )}

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
        ) : inputText.trim() || pendingVoiceAudio || pendingAttachments.length > 0 ? (
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
