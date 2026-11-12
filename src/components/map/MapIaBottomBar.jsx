// src/components/map/MapIaBottomBar.jsx
import {
  Plus,
  Trash2,
  Play,
  Pause,
  Bot,
  Camera,
  StopCircle,
  Send,
  Mic,
  Undo2,
  X,
  FileText,
} from 'lucide-react';
import { syncTextareaHeight } from '../../utils/helpers';
import { formatAudioTime } from '../../hooks/useAudioRecorder';
import MapSelectionCard from './MapSelectionCard';
import { styles } from './mapStyles';

export default function MapIaBottomBar({
  selectedTarget,
  setSelectedTarget,
  localPaths,
  allCategories = [],
  handleDirectFieldUpdate,
  handleDeleteTarget,
  handleDeleteNode,
  pendingAttachment,
  setPendingAttachment,
  iaFeedback,
  setIaFeedback,
  isProcessingIa,
  docInputRef,
  fileInputRef,
  handleDocumentChange,
  handleCameraChange,
  handleAttachClick,
  handleCameraClick,
  pendingVoiceAudio,
  isVoiceRecording,
  handleDiscardVoice,
  togglePlayPreview,
  isPreviewPlaying,
  setIsPreviewPlaying,
  previewDuration,
  setPreviewDuration,
  previewCurrentTime,
  setPreviewCurrentTime,
  handleSeekPreview,
  previewAudioRef,
  voiceRecordingSeconds,
  wakeLockActive,
  voiceCurrentGps,
  liveUserGps,
  handleCancelVoiceRecording,
  handleStopVoiceRecording,
  handleStartVoiceRecording,
  mapIaTextareaRef,
  mapIaInput,
  setMapIaInput,
  handleSendMapIaOrder,
  undoStack,
  handleUndoMapAction,
}) {
  return (
    <div style={styles.fixedBottomChatWrapper}>
      <MapSelectionCard
        selectedTarget={selectedTarget}
        setSelectedTarget={setSelectedTarget}
        localPaths={localPaths}
        allCategories={allCategories}
        handleDirectFieldUpdate={handleDirectFieldUpdate}
        handleDeleteTarget={handleDeleteTarget}
        handleDeleteNode={handleDeleteNode}
      />

      {pendingAttachment && (
        <div style={styles.pendingAttachmentCard}>
          {pendingAttachment.isImage && pendingAttachment.dataUrl ? (
            <img
              src={pendingAttachment.dataUrl}
              alt="Foto adjunta"
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
              {pendingAttachment.isImage ? 'Fotografía lista para vincular' : 'Documento listo'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            style={styles.targetCloseBtn}
            title="Quitar archivo adjunto"
            aria-label="Quitar archivo"
          >
            <X size={15} />
          </button>
        </div>
      )}

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

        <button
          type="button"
          style={{
            ...styles.chatIaAttachBtn,
            backgroundColor: pendingAttachment && !pendingAttachment.isImage ? '#00979d' : '#f0f0f0',
            color: pendingAttachment && !pendingAttachment.isImage ? '#ffffff' : '#555555',
          }}
          onClick={handleAttachClick}
          aria-label="Adjuntar archivo o documento (+)"
          title="Adjuntar archivo o documento (+)"
        >
          <Plus size={20} />
        </button>

        {pendingVoiceAudio && !isVoiceRecording ? (
          <div style={styles.chatIaAudioPreviewCapsule}>
            <button
              type="button"
              onClick={handleDiscardVoice}
              style={styles.previewTrashBtn}
              title="Descartar nota de voz"
              aria-label="Descartar nota de voz"
            >
              <Trash2 size={18} color="#ef4444" />
            </button>

            <button
              type="button"
              onClick={togglePlayPreview}
              style={styles.previewPlayBtn}
              title={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
              aria-label={isPreviewPlaying ? 'Pausar audio' : 'Escuchar audio'}
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
                  {formatAudioTime(
                    previewCurrentTime > 0 ? previewCurrentTime : previewDuration || pendingVoiceAudio.duration
                  )}
                </span>
                {pendingVoiceAudio.gpsTrack?.length > 0 && (
                  <span style={styles.previewGpsTag} title={`${pendingVoiceAudio.gpsTrack.length} lecturas GPS vinculadas`}>
                    📍 {pendingVoiceAudio.gpsTrack.length} pts GPS
                  </span>
                )}
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
            {wakeLockActive && (
              <span title="Pantalla bloqueada encendida durante la grabación" style={{ fontSize: '0.72rem', color: '#0f766e', flexShrink: 0 }}>
                🔒
              </span>
            )}
            {voiceCurrentGps ? (
              <span style={styles.previewGpsTagActive}>📍 ±{voiceCurrentGps.accuracy?.toFixed(1)}m</span>
            ) : liveUserGps ? (
              <span style={styles.previewGpsTagActive}>📍 ±{liveUserGps.accuracy?.toFixed(1)}m</span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                📍 Conectando GPS...
              </span>
            )}
            <button
              type="button"
              onClick={handleCancelVoiceRecording}
              style={styles.previewTrashBtn}
              title="Cancelar grabación"
              aria-label="Cancelar grabación"
            >
              <Trash2 size={17} color="#64748b" />
            </button>
          </div>
        ) : (
          <div style={{ ...styles.chatIaInputCapsule, paddingLeft: 12 }}>
            <Bot size={18} color="#00979d" style={{ flexShrink: 0, marginRight: 8 }} />
            <textarea
              ref={mapIaTextareaRef}
              rows={1}
              value={mapIaInput}
              onChange={(e) => {
                const val = e.target.value;
                setMapIaInput(val);
                syncTextareaHeight(e.target, val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMapIaOrder();
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
              onClick={handleCameraClick}
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
        ) : mapIaInput.trim() || pendingVoiceAudio || pendingAttachment ? (
          <button
            type="button"
            onClick={handleSendMapIaOrder}
            disabled={isProcessingIa}
            style={{
              ...styles.chatIaActionBtn,
              backgroundColor: '#00979d',
              color: '#ffffff',
              opacity: isProcessingIa ? 0.7 : 1,
            }}
            title="Enviar orden a la IA"
            aria-label="Enviar orden"
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
            title={
              selectedTarget
                ? `Hablar orden por voz para ${selectedTarget.title || 'elemento seleccionado'}`
                : 'Hablar orden por voz con telemetría GPS'
            }
            aria-label="Grabar mensaje de voz"
          >
            <Mic size={20} />
          </button>
        )}

        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={handleUndoMapAction}
            disabled={isProcessingIa}
            style={styles.chatIaUndoBtn}
            title={`Retroceder cambios: ${undoStack[undoStack.length - 1].description}`}
            aria-label="Retroceder cambios en el mapa"
          >
            <Undo2 size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

