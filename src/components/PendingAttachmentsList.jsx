// src/components/PendingAttachmentsList.jsx
// Lista reutilizable de previsualización de múltiples archivos adjuntos para todas las barras de Chat IA.

import { FileText, FileSpreadsheet, Paperclip, X } from 'lucide-react';

function getAttachmentSubtitle(att, imageLabel) {
  const kb = `${((att.size || 0) / 1024).toFixed(1)} KB`;
  if (att.isPdf) return `${kb} · Documento PDF`;
  if (att.isSpreadsheet) return `${kb} · Hoja de Cálculo`;
  if (att.isImage) return `${kb} · ${imageLabel}`;
  if (att.isText) return `${kb} · Documento de texto`;
  return `${kb} · Archivo listo`;
}

function renderAttachmentIcon(att) {
  if (att.isImage && att.dataUrl) {
    return (
      <img
        src={att.dataUrl}
        alt={att.name || 'Vista previa'}
        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  if (att.isPdf) {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: '#fee2e2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <FileText size={18} color="#dc2626" />
      </div>
    );
  }
  if (att.isSpreadsheet) {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <FileSpreadsheet size={18} color="#16a34a" />
      </div>
    );
  }
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#e0f2fe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Paperclip size={18} color="#0284c7" />
    </div>
  );
}

export default function PendingAttachmentsList({
  attachments = [],
  onRemove,
  onClearAll,
  variant = 'card',
  imageLabel = 'Imagen lista para analizar',
}) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  const isBar = variant === 'bar';

  return (
    <div
      style={{
        backgroundColor: isBar ? '#f8fafc' : '#ffffff',
        borderTop: isBar ? '1px solid #e2e8f0' : 'none',
        border: isBar ? undefined : '1px solid #cbd5e1',
        borderRadius: isBar ? 0 : 12,
        padding: isBar ? '8px 14px' : '8px 10px',
        marginBottom: isBar ? 0 : 6,
        boxShadow: isBar ? 'none' : '0 4px 12px rgba(15, 23, 42, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 148,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {attachments.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#475569',
            paddingBottom: 2,
          }}
        >
          <span>{attachments.length} archivos adjuntos listos</span>
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Quitar todos
            </button>
          )}
        </div>
      )}

      {attachments.map((att, index) => (
        <div
          key={att.id || `${att.name}-${index}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: attachments.length > 1 ? '4px 6px' : 0,
            borderRadius: 8,
            backgroundColor: attachments.length > 1 ? (isBar ? '#ffffff' : '#f8fafc') : 'transparent',
            border: attachments.length > 1 ? '1px solid #e2e8f0' : 'none',
          }}
        >
          {renderAttachmentIcon(att)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: '0.79rem',
                fontWeight: 600,
                color: '#1e293b',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {att.name}
            </p>
            <p style={{ fontSize: '0.67rem', color: '#64748b', margin: 0 }}>
              {getAttachmentSubtitle(att, imageLabel)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove?.(att.id || index, index)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            title={`Quitar ${att.name || 'archivo'}`}
            aria-label={`Quitar ${att.name || 'archivo'}`}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

