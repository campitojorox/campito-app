// src/pages/chat/ChatMessageList.jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  User,
  Bot,
  FileText,
  FileSpreadsheet,
  Paperclip,
  Brain,
  Download,
  Map,
  Compass,
  FileCode,
} from 'lucide-react';
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
  return (
    <div style={styles.bubbleRow(false)}>
      <div style={styles.avatar(false)}>
        <Bot size={13} color="#888" />
      </div>
      <div style={{ ...styles.bubble(false), padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={styles.statusDot(currentServer?.badgeColor || '#00979d')} />
          <span style={{ fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>
            {currentServer?.name} ({currentServer?.level}) procesando...
          </span>
        </div>
        <div style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: currentServer?.badgeColor || '#00979d',
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

export default function ChatMessageList({
  isSearchOpen,
  outletSearchQuery,
  displayedMessages,
  isLoading,
  currentBadgeServer,
  messagesEndRef,
  setInventoryModalTab,
  setIsInventoryMapOpen,
}) {
  return (
    <div style={styles.messagesArea}>
      {isSearchOpen && outletSearchQuery.trim() && displayedMessages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
          🔍 No se encontraron mensajes con "{outletSearchQuery.trim()}".
        </div>
      )}
      {displayedMessages.map((msg) => {
        const isUser = msg.role === 'user';

        return (
          <div key={msg.id} style={styles.bubbleRow(isUser)}>
            <div style={styles.avatar(isUser)}>
              {isUser ? <User size={13} color="#fff" /> : <Bot size={13} color="#888" />}
            </div>
            <div style={styles.bubble(isUser)}>
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Adjunto"
                  style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, marginBottom: 6, display: 'block' }}
                />
              )}
              {msg.file && !msg.image && (
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
                </div>
              )}
              {msg.audio && (
                <div style={{ marginBottom: msg.content ? 6 : 0, maxWidth: 260 }}>
                  <audio
                    src={msg.audio.dataUrl}
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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

