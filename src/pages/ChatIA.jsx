// src/pages/ChatIA.jsx — Chat IA Campito Jorox
// Orquestador visual de conversación, historial, grabación GPS y modales.
// Consume ChatContext para que la generación de IA y el estado persistan sin interrupción al cambiar de pestaña.

import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Bot, Info, RotateCcw, ChevronDown, X, FolderOpen } from 'lucide-react';
import { useChat } from '../context/useChat';
import { useVoiceGeoTracker, getGlobalLastKnownGps } from '../hooks/useVoiceGeoTracker';
import { useAudioPreview } from '../hooks/useAudioRecorder';
import { syncTextareaHeight } from '../utils/helpers';
import { readFilesAsAttachments } from '../utils/attachmentUtils';
import { GEMINI_SERVERS } from '../services/geminiDirectClient';
import { styles } from './chat/chatIaStyles';
import ServerSelectorModal from './chat/ServerSelectorModal';
import ChatInfoModal from './chat/ChatInfoModal';
import ChatMessageList from './chat/ChatMessageList';
import ChatInputBar from './chat/ChatInputBar';
import RagFileExplorerModal from '../components/rag/RagFileExplorerModal';

const CatastroLiveModal = lazy(() => import('./chat/CatastroLiveModal'));

export default function ChatIA() {
  const outletContext = useOutletContext() || {};
  const {
    searchQuery: outletSearchQuery = '',
    isSearchOpen = false,
  } = outletContext;

  const {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    error,
    setError,
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
    farmInventory,
    farmPaths,
    setFarmPaths,
    reloadInventory,
    reloadPaths,
    handleDeleteInventoryItem,
    handleDeletePath,
  } = useChat();

  // Al abrir esta pestaña, limpiar la notificación de respuesta no leída
  useEffect(() => {
    setHasUnreadReply(false);
  }, [setHasUnreadReply]);

  // Modales de la interfaz
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isInventoryMapOpen, setIsInventoryMapOpen] = useState(false);
  const [isRagExplorerOpen, setIsRagExplorerOpen] = useState(false);
  const [lastRecordedGpsTrack, setLastRecordedGpsTrack] = useState(null);
  const [inventoryModalTab, setInventoryModalTab] = useState('map');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');

  // Grabación de voz con telemetría GPS
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

  // Reproductor de previsualización de audio antes de enviar
  const {
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardAudio: rawHandleDiscardAudio,
  } = useAudioPreview();

  const handleDiscardAudio = () => {
    rawHandleDiscardAudio();
    setPendingAudio(null);
  };

  const deviceGpsRef = useRef(null);
  useEffect(() => {
    if (currentGps) {
      deviceGpsRef.current = currentGps;
    }
  }, [currentGps]);

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
    setPendingAudio(null);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const displayedMessages = useMemo(() => {
    if (!isSearchOpen || !outletSearchQuery.trim()) return messages;
    const q = outletSearchQuery.toLowerCase().trim();
    return messages.filter(
      (m) =>
        (m.text && m.text.toLowerCase().includes(q)) ||
        (m.content && m.content.toLowerCase().includes(q))
    );
  }, [messages, isSearchOpen, outletSearchQuery]);

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
  const currentBadgeServer = activeServer || GEMINI_SERVERS[selectedServerIndex] || GEMINI_SERVERS[0];

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
              onClick={() => setIsRagExplorerOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                color: '#00979d',
                borderRadius: '50%',
                transition: 'color 0.15s, transform 0.15s',
                flexShrink: 0,
              }}
              title="Explorador de Archivos y Memoria Vectorial (RAG: KML, KMZ, PDF, CSV)"
              aria-label="Explorador de Archivos Vectorial RAG"
            >
              <FolderOpen size={16} />
            </button>
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
              onClick={clearChat}
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
          style={styles.serverBadge(currentBadgeServer?.badgeColor || '#00979d')}
          onClick={() => setIsServerModalOpen(true)}
          title={`Click para ver/cambiar servidor de Gemini (${currentBadgeServer?.name || 'Gemini'})`}
        >
          <span style={styles.statusDot(currentBadgeServer?.badgeColor || '#00979d')} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              display: 'inline-block',
            }}
          >
            {currentBadgeServer?.name || 'Gemini'}
          </span>
          <ChevronDown size={13} style={{ color: '#64748b', flexShrink: 0 }} />
        </div>
      </div>

      {fallbackNotice && (
        <div style={styles.fallbackAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>
              ⚡ Cuota agotada en <b>{fallbackNotice.from?.name || 'servidor'}</b>. Conectado a{' '}
              <b>
                {fallbackNotice.to?.name || 'servidor'} ({fallbackNotice.to?.level || 'respaldo'})
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

      <RagFileExplorerModal
        isOpen={isRagExplorerOpen}
        onClose={() => setIsRagExplorerOpen(false)}
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
