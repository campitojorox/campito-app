// src/pages/chat/ChatInputBar.jsx
import {
  AlertCircle,
  X,
  StopCircle,
  Plus,
  Trash2,
  Play,
  Pause,
  Bot,
  Camera,
  Send,
  Mic,
} from 'lucide-react';
import { syncTextareaHeight } from '../../utils/helpers';
import { formatAudioTime } from '../../hooks/useAudioRecorder';
import { ACCEPTED_CHAT_FILE_TYPES } from '../../utils/attachmentUtils';
import PendingAttachmentsList from '../../components/PendingAttachmentsList';
import { styles } from './chatIaStyles';

export default function ChatInputBar({
  error,
  setError,
  isRecording,
  recordingSeconds,
  currentGps,
  accuracyWarning,
  gpsPointsCount,
  handleMicClick,
  pendingAttachments = [],
  setPendingAttachments,
  docInputRef,
  fileInputRef,
  handleDocumentChange,
  handleCameraChange,
  handleAttachClick,
  handleCameraClick,
  pendingAudio,
  handleDiscardAudio,
  togglePlayPreview,
  isPreviewPlaying,
  setIsPreviewPlaying,
  previewDuration,
  setPreviewDuration,
  previewCurrentTime,
  setPreviewCurrentTime,
  handleSeekPreview,
  previewAudioRef,
  wakeLockActive,
  handleCancelRecording,
  inputRef,
  input,
  setInput,
  currentUserId,
  handleKeyDown,
  isLoading,
  hasText,
  sendMessage,
}) {
  return (
    <>
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
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Grabando con GPS activo...</span>
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

      <PendingAttachmentsList
        attachments={pendingAttachments}
        onRemove={(idOrIdx, idx) =>
          setPendingAttachments((prev) =>
            prev.filter((item, i) => (item.id ? item.id !== idOrIdx : i !== idx))
          )
        }
        onClearAll={() => setPendingAttachments([])}
        variant="bar"
        imageLabel="Foto de campo"
      />

      <div style={styles.inputBar}>
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
          className="chatia-iconbtn"
          style={styles.iconBtn(pendingAttachments.some((a) => !a.isImage))}
          onClick={handleAttachClick}
          aria-label="Adjuntar archivos o documentos (+)"
          title="Adjuntar uno o varios archivos (+)"
        >
          <Plus size={20} />
        </button>

        {pendingAudio && !isRecording ? (
          <div style={styles.audioPreviewCapsule}>
            <button
              type="button"
              onClick={handleDiscardAudio}
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
                max={previewDuration || pendingAudio.duration || 1}
                step="0.05"
                value={previewCurrentTime}
                onChange={handleSeekPreview}
                style={styles.previewSlider}
                aria-label="Progreso del audio"
              />
              <div style={styles.previewTimeRow}>
                <span style={styles.previewTimeText}>
                  {formatAudioTime(previewCurrentTime > 0 ? previewCurrentTime : previewDuration || pendingAudio.duration)}
                </span>
                {pendingAudio.gpsTrack?.length > 0 && (
                  <span style={styles.previewGpsTag} title={`${pendingAudio.gpsTrack.length} lecturas GPS vinculadas`}>
                    📍 {pendingAudio.gpsTrack.length} pts GPS
                  </span>
                )}
              </div>
            </div>

            <audio
              ref={previewAudioRef}
              src={pendingAudio.dataUrl}
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
        ) : isRecording ? (
          <div style={styles.recordingCapsule}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'inline-block',
                animation: 'chatPulseRed 1.2s infinite ease-in-out',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
              {formatAudioTime(recordingSeconds)}
            </span>
            {wakeLockActive && (
              <span title="Pantalla bloqueada encendida durante la grabación" style={{ fontSize: '0.72rem', color: '#0f766e', flexShrink: 0 }}>
                🔒
              </span>
            )}
            {currentGps ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: accuracyWarning ? '#b45309' : '#047857',
                  backgroundColor: accuracyWarning ? '#fef3c7' : '#d1fae5',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  marginLeft: 'auto',
                }}
              >
                📍 ±{currentGps.accuracy?.toFixed(1)}m
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                📍 Conectando GPS...
              </span>
            )}
            <button
              type="button"
              onClick={handleCancelRecording}
              style={styles.previewTrashBtn}
              title="Cancelar grabación"
              aria-label="Cancelar grabación"
            >
              <Trash2 size={17} color="#64748b" />
            </button>
          </div>
        ) : (
          <div style={{ ...styles.inputCapsule, paddingLeft: 12 }}>
            <Bot size={18} color="#00979d" style={{ flexShrink: 0, marginRight: 8 }} />
            <textarea
              ref={inputRef}
              className="chatia-input"
              style={styles.textInput}
              placeholder="Mensaje..."
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
                syncTextareaHeight(e.target, val);
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="on"
              spellCheck="true"
            />

            <button
              className="chatia-iconbtn"
              style={styles.capsuleCameraBtn(pendingAttachments.some((a) => a.isImage))}
              onClick={handleCameraClick}
              aria-label="Tomar foto con la cámara"
              title="Tomar foto con la cámara"
            >
              <Camera size={19} />
            </button>
          </div>
        )}

        {isRecording ? (
          <button
            type="button"
            className="chatia-iconbtn"
            style={{
              ...styles.iconBtn(true),
              backgroundColor: '#dc2626',
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.6)',
            }}
            onClick={handleMicClick}
            aria-label="Detener grabación y escuchar preview"
            title="Detener grabación y escuchar preview"
          >
            <StopCircle size={20} />
          </button>
        ) : hasText ? (
          <button
            type="button"
            className="chatia-iconbtn"
            style={styles.sendBtn(true)}
            onClick={() => sendMessage()}
            disabled={isLoading}
            aria-label="Enviar mensaje"
            title="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="chatia-iconbtn"
            style={{
              ...styles.iconBtn(false),
              backgroundColor: '#00979d',
              color: '#ffffff',
            }}
            onClick={handleMicClick}
            disabled={isLoading}
            aria-label="Grabar mensaje de voz"
            title="Grabar mensaje de voz"
          >
            <Mic size={20} />
          </button>
        )}
      </div>
    </>
  );
}

