// src/pages/chat/ChatMessageList.jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InteractiveVisualRenderer from '../../components/chat/InteractiveVisualRenderer';
import {
  User,
  Bot,
  FileText,
  FileSpreadsheet,
  Paperclip,
  Brain,
  Download,
  ExternalLink,
  Map,
  Compass,
  FileCode,
  History,
} from 'lucide-react';
import { formatSessionDate } from '../../context/chatConstants';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  generateCustomFile,
  generateCustomPDF,
  generateCustomExcel,
  generateCustomTXT,
  extractTableFromMarkdown,
} from '../../utils/exportTools';
import { styles } from './chatIaStyles';

export function TypingIndicator({ currentServer }) {
  const dotColor = currentServer?.badgeColor || '#10b981';
  return (
    <div style={styles.bubbleRow(false)}>
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% {
            transform: translateY(0) scale(0.85);
            opacity: 0.4;
          }
          40% {
            transform: translateY(-6px) scale(1.15);
            opacity: 1;
          }
        }
      `}</style>
      <div style={styles.avatar(false)}>
        <Bot size={13} color="#888" />
      </div>
      <div style={{ ...styles.bubble(false), padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span
            style={{
              ...styles.statusDot(dotColor),
              animation: 'pulse-color 1.4s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>
            {currentServer?.name || 'Gemini'} ({currentServer?.level || 'Procesando'}) procesando...
          </span>
        </div>
        <div style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="chat-typing-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: dotColor,
                display: 'inline-block',
                willChange: 'transform, opacity',
                animation: `chatBounce 1.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatMessageList({
  isSearchOpen,
  outletSearchQuery,
  displayedMessages,
  isLoading,
  currentBadgeServer,
  messagesEndRef,
  messagesAreaRef,
  onLoadPreviousChat,
  hasMorePreviousChats,
  isLoadingPreviousChat,
  loadedHistorySessionsCount,
  setInventoryModalTab,
  setIsInventoryMapOpen,
  style,
}) {
  return (
    <div ref={messagesAreaRef} style={{ ...styles.messagesArea, ...style }}>
      {/* Botón superior centrado para cargar el chat anterior del historial */}
      {hasMorePreviousChats && !isSearchOpen && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 14px 0', width: '100%' }}>
          <button
            onClick={onLoadPreviousChat}
            disabled={isLoadingPreviousChat}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: 20,
              padding: '6px 18px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: isLoadingPreviousChat ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'background-color 0.15s, transform 0.15s',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e2e8f0';
              e.currentTarget.style.color = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
            title="Cargar la conversación anterior guardada en el historial"
          >
            <History size={14} color="#64748b" />
            <span>{isLoadingPreviousChat ? 'Cargando chat anterior...' : 'Cargar chat anterior'}</span>
          </button>
        </div>
      )}

      {!hasMorePreviousChats && loadedHistorySessionsCount > 0 && !isSearchOpen && (
        <div style={{ textAlign: 'center', margin: '8px 0 14px 0', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
          Inicio del historial de conversaciones
        </div>
      )}

      {isSearchOpen && outletSearchQuery.trim() && displayedMessages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
          🔍 No se encontraron mensajes con "{outletSearchQuery.trim()}".
        </div>
      )}
      {displayedMessages.map((msg) => {
        if (msg.type === 'session_separator') {
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '18px 0 12px 0',
                gap: 10,
                width: '100%',
              }}
            >
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#64748b',
                  fontWeight: 600,
                  backgroundColor: '#f8fafc',
                  padding: '3px 12px',
                  borderRadius: 14,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                💬 {msg.isCurrentChat ? 'Conversación actual' : `Chat anterior · ${formatSessionDate(msg.sessionDate)}`}
              </span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
            </div>
          );
        }

        const isUser = msg.role === 'user';

        return (
          <div key={msg.id} style={styles.bubbleRow(isUser)}>
            <div style={styles.avatar(isUser)}>
              {isUser ? <User size={13} color="#fff" /> : <Bot size={13} color="#888" />}
            </div>
            <div style={styles.bubble(isUser)}>
              {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: msg.content ? 6 : 0 }}>
                  {msg.attachments.map((attItem, idx) => {
                    const isImg =
                      attItem.isImage ||
                      (attItem.type && attItem.type.startsWith('image/')) ||
                      (attItem.name && /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(attItem.name));
                    const fileUrl = attItem.public_url || attItem.file_url || attItem.url || attItem.dataUrl;
                    const isPdf = attItem.isPdf || (attItem.name && attItem.name.toLowerCase().endsWith('.pdf'));
                    const isSpreadsheet =
                      attItem.isSpreadsheet || (attItem.name && /\.(xlsx|xls|csv)$/i.test(attItem.name));
                    const isGeo =
                      attItem.isGeo || (attItem.name && /\.(kml|kmz|geojson|gpx)$/i.test(attItem.name));
                    const isRemote = Boolean(fileUrl && fileUrl.startsWith('http'));

                    if (isImg && fileUrl) {
                      return (
                        <div
                          key={`${attItem.name || 'img'}-${idx}`}
                          style={{
                            maxWidth: 240,
                            borderRadius: 10,
                            overflow: 'hidden',
                            backgroundColor: isUser ? 'rgba(0,0,0,0.1)' : '#f1f5f9',
                            border: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e2e8f0',
                          }}
                        >
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'block', textDecoration: 'none' }}
                            title="Abrir imagen completa"
                          >
                            <img
                              src={fileUrl}
                              alt={attItem.name || 'Adjunto'}
                              style={{
                                width: '100%',
                                maxHeight: 180,
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          </a>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 8px',
                              fontSize: '0.68rem',
                              color: isUser ? '#ffffff' : '#475569',
                              backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : '#ffffff',
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 140,
                                fontWeight: 500,
                              }}
                            >
                              {attItem.name || 'Foto'}
                            </span>
                            {isRemote && (
                              <a
                                href={fileUrl}
                                download={attItem.name || 'foto.jpg'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  color: isUser ? '#ffffff' : '#0284c7',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                }}
                                title="Descargar foto"
                              >
                                <Download size={12} />
                                <span>Bajar</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${attItem.name || 'file'}-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 10px',
                          backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : '#f8fafc',
                          borderRadius: 8,
                          maxWidth: 320,
                          border: isUser ? '1px solid rgba(255,255,255,0.25)' : '1px solid #e2e8f0',
                        }}
                      >
                        {isPdf ? (
                          <FileText size={18} color={isUser ? '#ffffff' : '#dc2626'} style={{ flexShrink: 0 }} />
                        ) : isSpreadsheet ? (
                          <FileSpreadsheet size={18} color={isUser ? '#ffffff' : '#16a34a'} style={{ flexShrink: 0 }} />
                        ) : isGeo ? (
                          <Map size={18} color={isUser ? '#ffffff' : '#059669'} style={{ flexShrink: 0 }} />
                        ) : (
                          <Paperclip size={18} color={isUser ? '#ffffff' : '#0284c7'} style={{ flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {attItem.name}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: '0.64rem', opacity: 0.85 }}>
                            {attItem.size > 0 && <span>{(attItem.size / 1024).toFixed(1)} KB</span>}
                            {isRemote && <span>• ☁️ Centralizado</span>}
                          </div>
                        </div>

                        {isRemote && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '3px 5px',
                                borderRadius: 4,
                                backgroundColor: isUser ? 'rgba(255,255,255,0.25)' : '#e0f2fe',
                                color: isUser ? '#ffffff' : '#0284c7',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="Abrir / Ver archivo"
                            >
                              <ExternalLink size={12} />
                            </a>
                            <a
                              href={fileUrl}
                              download={attItem.name}
                              style={{
                                padding: '3px 5px',
                                borderRadius: 4,
                                backgroundColor: isUser ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                color: isUser ? '#ffffff' : '#475569',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="Descargar archivo"
                            >
                              <Download size={12} />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!msg.attachments && msg.image && (
                <div style={{ maxWidth: 220, marginBottom: 6 }}>
                  <a href={msg.image} target="_blank" rel="noopener noreferrer">
                    <img
                      src={msg.image}
                      alt="Adjunto"
                      style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, display: 'block' }}
                    />
                  </a>
                </div>
              )}
              {!msg.attachments && msg.file && !msg.image && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
                    borderRadius: 8,
                    marginBottom: msg.content ? 6 : 0,
                    maxWidth: 260,
                    border: isUser ? '1px solid rgba(255,255,255,0.25)' : '1px solid #e2e8f0',
                  }}
                >
                  {msg.file.isPdf ? (
                    <FileText size={18} color={isUser ? '#ffffff' : '#dc2626'} />
                  ) : msg.file.isSpreadsheet ? (
                    <FileSpreadsheet size={18} color={isUser ? '#ffffff' : '#16a34a'} />
                  ) : (
                    <Paperclip size={18} color={isUser ? '#ffffff' : '#0284c7'} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.file.name}
                    </p>
                    {msg.file.size && (
                      <p style={{ margin: 0, fontSize: '0.64rem', opacity: 0.85 }}>
                        {(msg.file.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  {msg.file.url && (
                    <a
                      href={msg.file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: isUser ? '#ffffff' : '#0284c7' }}
                      title="Abrir archivo"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              )}
              {msg.audio && (
                <div style={{ marginBottom: msg.content ? 6 : 0, maxWidth: 260 }}>
                  <audio
                    src={msg.audio.public_url || msg.audio.file_url || msg.audio.dataUrl}
                    controls
                    style={{ width: '100%', height: 36, borderRadius: 18, outline: 'none' }}
                  />
                  {msg.audio.duration && (
                    <span
                      style={{
                        fontSize: '0.66rem',
                        color: isUser ? 'rgba(255,255,255,0.85)' : '#64748b',
                        display: 'block',
                        marginTop: 2,
                      }}
                    >
                      🎙️ Audio ({msg.audio.duration}s)
                    </span>
                  )}
                </div>
              )}
              {msg.content &&
                (isUser ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                ) : (
                  <div className="chatia-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const lang = match ? match[1].toLowerCase() : '';
                          const codeText = String(children).replace(/\n$/, '');

                          if (!inline && (lang === 'mermaid' || lang === 'svg' || lang === 'croquis')) {
                            return (
                              <InteractiveVisualRenderer
                                type={lang === 'mermaid' ? 'mermaid' : 'svg'}
                                code={codeText}
                                title={lang === 'mermaid' ? 'Esquema de Flujo' : 'Plano Técnico / Croquis'}
                              />
                            );
                          }

                          return !inline ? (
                            <pre
                              style={{
                                backgroundColor: '#1e293b',
                                color: '#f8fafc',
                                padding: '10px 12px',
                                borderRadius: 8,
                                overflowX: 'auto',
                                fontSize: '0.78rem',
                              }}
                            >
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          ) : (
                            <code
                              style={{
                                backgroundColor: '#f1f5f9',
                                color: '#0f172a',
                                padding: '2px 4px',
                                borderRadius: 4,
                                fontSize: '0.85em',
                              }}
                              className={className}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ))}
              {msg.learnedMemory && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    padding: '4px 8px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: 6,
                    border: '1px solid #bbf7d0',
                    fontSize: '0.72rem',
                    color: '#166534',
                    fontWeight: 600,
                  }}
                >
                  <Brain size={13} color="#16a34a" />
                  <span>
                    Aprendido en memoria: <b>{msg.learnedMemory.title}</b>
                  </span>
                </div>
              )}
              {msg.inventoryExportBatch && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <button
                    onClick={() => exportInventoryToExcel(msg.inventoryExportBatch)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <FileSpreadsheet size={12} />
                    Descargar Excel
                  </button>
                  <button
                    onClick={() => exportInventoryToPDF(msg.inventoryExportBatch)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Download size={12} />
                    Descargar PDF
                  </button>
                  <button
                    onClick={() => exportInventoryToKML(msg.inventoryExportBatch)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Map size={12} />
                    Capa KML (My Maps)
                  </button>
                  <button
                    onClick={() => {
                      setInventoryModalTab('map');
                      setIsInventoryMapOpen(true);
                    }}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#00979d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Compass size={12} />
                    Ver en Mapa Satélite
                  </button>
                </div>
              )}

              {msg.exportFiles && msg.exportFiles.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  {msg.exportFiles.map((file, fIdx) => {
                    const type = (file.type || 'txt').toLowerCase();
                    const isPdf = type === 'pdf';
                    const isExcel = type === 'excel' || type === 'csv' || type === 'xlsx';
                    const isXml = type === 'xml' || type === 'kml';
                    const ext = isPdf ? 'pdf' : isExcel ? 'csv' : isXml ? (file.filename?.endsWith('.kml') ? 'kml' : 'xml') : 'txt';
                    const filename = file.filename || `Documento_Campito_${fIdx + 1}.${ext}`;

                    const cardBg = isPdf ? '#fef2f2' : isExcel ? '#f0fdf4' : isXml ? '#f0f9ff' : '#f8fafc';
                    const cardBorder = isPdf ? '#fca5a5' : isExcel ? '#86efac' : isXml ? '#7dd3fc' : '#cbd5e1';
                    const iconColor = isPdf ? '#dc2626' : isExcel ? '#16a34a' : isXml ? '#0284c7' : '#475569';
                    const badgeText = isPdf ? 'PDF OFICIAL' : isExcel ? 'HOJA EXCEL' : isXml ? 'XML / KML' : 'TEXTO';

                    return (
                      <div
                        key={fIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          backgroundColor: cardBg,
                          border: `1.5px solid ${cardBorder}`,
                          borderRadius: 10,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 8,
                              backgroundColor: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                            }}
                          >
                            {isPdf ? (
                              <FileText size={20} color={iconColor} />
                            ) : isExcel ? (
                              <FileSpreadsheet size={20} color={iconColor} />
                            ) : isXml ? (
                              <FileCode size={20} color={iconColor} />
                            ) : (
                              <FileText size={20} color={iconColor} />
                            )}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 700,
                                color: '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={filename}
                            >
                              {filename}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: iconColor }}>{badgeText}</span>
                              {file.title && <span>· {file.title}</span>}
                              {file.table?.rows && <span>· {file.table.rows.length} registros</span>}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => generateCustomFile(file)}
                          style={{
                            padding: '7px 14px',
                            backgroundColor: '#00979d',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 2px 5px rgba(0, 151, 157, 0.3)',
                            transition: 'transform 0.15s, background-color 0.15s',
                            whiteSpace: 'nowrap',
                          }}
                          title={`Descargar ${filename}`}
                        >
                          <Download size={14} />
                          Descargar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isUser && !msg.exportFiles && msg.content && msg.content.includes('|') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 6, borderTop: '1px dashed #e2e8f0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Descargar datos:</span>
                  <button
                    onClick={() => {
                      const table = extractTableFromMarkdown(msg.content);
                      const dateStr = new Date().toISOString().split('T')[0];
                      generateCustomPDF({
                        title: 'Informe Campito Jorox',
                        subtitle: 'Exportación directa desde chat',
                        content: msg.content,
                        table,
                        filename: `CAMPITO_JOROX_${dateStr}.pdf`,
                      });
                    }}
                    style={{
                      padding: '3px 8px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      borderRadius: 6,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Descargar este contenido en PDF"
                  >
                    <FileText size={11} /> PDF
                  </button>
                  <button
                    onClick={() => {
                      const table = extractTableFromMarkdown(msg.content);
                      const dateStr = new Date().toISOString().split('T')[0];
                      generateCustomExcel({
                        title: 'Exportación Campito Jorox',
                        headers: table?.headers || [],
                        rows: table?.rows || [],
                        content: msg.content,
                        filename: `CAMPITO_JOROX_${dateStr}.csv`,
                      });
                    }}
                    style={{
                      padding: '3px 8px',
                      backgroundColor: '#dcfce7',
                      color: '#16a34a',
                      border: '1px solid #86efac',
                      borderRadius: 6,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Descargar esta tabla en Excel / CSV"
                  >
                    <FileSpreadsheet size={11} /> Excel
                  </button>
                  <button
                    onClick={() => {
                      const dateStr = new Date().toISOString().split('T')[0];
                      generateCustomTXT({
                        title: 'Campito Jorox - Mensaje',
                        content: msg.content,
                        filename: `CAMPITO_JOROX_${dateStr}.txt`,
                      });
                    }}
                    style={{
                      padding: '3px 8px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Descargar como archivo TXT"
                  >
                    <FileText size={11} /> TXT
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isLoading && <TypingIndicator currentServer={currentBadgeServer} />}

      <div ref={messagesEndRef} />
    </div>
  );
}

