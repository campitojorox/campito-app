// src/components/rag/RagFileExplorerModal.jsx
// Modal / Explorador de Archivos Vectorial (RAG) de Campito Jorox.
// Permite visualizar los documentos cargados (KML, KMZ, GeoJSON, PDF, CSV, etc.),
// sincronizados bidireccionalmente entre el móvil y el Mac mediante Supabase y Storage.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Folder,
  FileText,
  MapPin,
  Route,
  RefreshCw,
  X,
  Search,
  Sparkles,
  Layers,
  Database,
  UploadCloud,
  ExternalLink,
  Download,
  Trash2,
  Cloud,
  HardDrive,
  Plus,
} from 'lucide-react';
import {
  getLocalRagChunks,
  fetchAllRagDocuments,
  deleteRagDocument,
  subscribeToRagDocuments,
  indexDocumentForRag,
  searchRagKnowledge,
} from '../../services/ragDocumentService';

export default function RagFileExplorerModal({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [chunksCount, setChunksCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'test_search'
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [isSearchingTest, setIsSearchingTest] = useState(false);

  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const localChunks = getLocalRagChunks();
      setChunksCount(localChunks.length);
      const docs = await fetchAllRagDocuments();
      setDocuments(docs);
    } catch (err) {
      console.warn('[RagFileExplorerModal] Error cargando documentos:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadDocuments();
    }, 0);

    // Suscripción bidireccional en tiempo real (móvil <-> Mac <-> Supabase)
    const unsubscribe = subscribeToRagDocuments(() => {
      loadDocuments();
    });

    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [isOpen, loadDocuments]);

  // Subida directa desde el explorador
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(`Indexando y subiendo ${file.name} (${i + 1}/${files.length})...`);
        await indexDocumentForRag({
          file,
          name: file.name,
          userName: 'Usuario',
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        });
      }
      await loadDocuments();
    } catch (upErr) {
      console.warn('[RagFileExplorerModal] Error en subida directa:', upErr);
      alert('Aviso al subir archivo: ' + upErr.message);
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Eliminación con confirmación
  const handleDelete = async (docId, docName) => {
    if (!window.confirm(`¿Seguro que deseas eliminar "${docName}" de la biblioteca permanente y la nube?`)) {
      return;
    }
    try {
      await deleteRagDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (delErr) {
      console.warn('[RagFileExplorerModal] Error eliminando archivo:', delErr);
    }
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q || doc.name?.toLowerCase().includes(q) || doc.summary?.toLowerCase().includes(q);
      const matchType =
        selectedFilter === 'all'
          ? true
          : selectedFilter === 'geo'
            ? ['kml', 'kmz', 'geojson', 'gpx'].includes(doc.file_type?.toLowerCase())
            : doc.file_type?.toLowerCase() === selectedFilter;
      return matchQ && matchType;
    });
  }, [documents, searchQuery, selectedFilter]);

  const handleTestSearch = async () => {
    if (!testQuery.trim() || isSearchingTest) return;
    setIsSearchingTest(true);
    try {
      const results = await searchRagKnowledge(testQuery, {
        matchThreshold: 0.25,
        matchCount: 8,
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
      });
      setTestResults(results);
    } catch (e) {
      console.warn('Error en búsqueda de prueba RAG:', e);
    } finally {
      setIsSearchingTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        accept=".kml,.kmz,.geojson,.gpx,.pdf,.csv,.xlsx,.xls,.txt,.md,.xml,image/*"
        style={{ display: 'none' }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                backgroundColor: '#00979d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Database size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#f8fafc' }}>
                Biblioteca de Archivos y Memoria Vectorial
              </h2>
              <p style={{ margin: 0, fontSize: '0.73rem', color: '#94a3b8' }}>
                Campito Jorox · {documents.length} archivos en la nube ({chunksCount} vectores)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#00979d',
                color: '#ffffff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Subir archivo desde este dispositivo"
            >
              <Plus size={15} />
              <span>{isUploading ? 'Subiendo...' : '+ Subir Archivo'}</span>
            </button>

            <button
              onClick={loadDocuments}
              disabled={isRefreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: isRefreshing ? '#00979d' : '#cbd5e1',
                cursor: 'pointer',
                padding: '7px',
                borderRadius: '8px',
                display: 'flex',
              }}
              title="Sincronizar con Supabase"
            >
              <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '7px',
                borderRadius: '8px',
                display: 'flex',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Barra de progreso de subida si está activa */}
        {isUploading && (
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: '#e6f7f7',
              borderBottom: '1px solid #b2ecee',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.78rem',
              color: '#007b80',
              fontWeight: 600,
            }}
          >
            <UploadCloud size={16} className="animate-pulse" />
            <span>{uploadProgressText || 'Procesando e indexando archivo...'}</span>
          </div>
        )}

        {/* Pestañas superiores */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            padding: '4px 16px',
            gap: 8,
          }}
        >
          <button
            onClick={() => setActiveTab('files')}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'none',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'files' ? 700 : 500,
              color: activeTab === 'files' ? '#00979d' : '#64748b',
              borderBottom: activeTab === 'files' ? '2px solid #00979d' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Folder size={15} />
            Archivos Cartográficos y Documentos ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('test_search')}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'none',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'test_search' ? 700 : 500,
              color: activeTab === 'test_search' ? '#00979d' : '#64748b',
              borderBottom: activeTab === 'test_search' ? '2px solid #00979d' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={15} />
            Búsqueda Vectorial RAG
          </button>
        </div>

        {/* Contenido de la Pestaña */}
        {activeTab === 'files' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Buscador y Filtros */}
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#f1f5f9',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  flex: 1,
                  minWidth: '220px',
                }}
              >
                <Search size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Buscar archivos (KML, KMZ, facturas, tuberías)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'none',
                    outline: 'none',
                    fontSize: '0.82rem',
                    width: '100%',
                    color: '#1e293b',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'geo', label: '🗺️ KML / KMZ / GeoJSON' },
                  { id: 'pdf', label: '📄 PDF' },
                  { id: 'csv', label: '📊 CSV / Excel' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFilter(f.id)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: selectedFilter === f.id ? '1px solid #00979d' : '1px solid #cbd5e1',
                      backgroundColor: selectedFilter === f.id ? '#e6f7f7' : '#ffffff',
                      color: selectedFilter === f.id ? '#007b80' : '#475569',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Documentos */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredDocs.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Folder size={46} strokeWidth={1.5} color="#cbd5e1" />
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                    No hay archivos en la biblioteca todavía
                  </p>
                  <p style={{ margin: 0, fontSize: '0.76rem', maxWidth: '420px', color: '#64748b' }}>
                    Sube un archivo <b>.KML</b>, <b>.KMZ</b>, <b>GeoJSON</b>, <b>PDF</b> o foto mediante el botón de arriba o en el Chat. Se sincronizará automáticamente en la nube de Supabase para estar disponible en tu móvil y Mac.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      marginTop: 6,
                      padding: '8px 16px',
                      backgroundColor: '#00979d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <UploadCloud size={16} />
                    <span>Subir archivo a la biblioteca</span>
                  </button>
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const isGeo = ['kml', 'kmz', 'geojson', 'gpx'].includes(doc.file_type?.toLowerCase());
                  const formattedSize = doc.size_bytes || doc.file_size ? `${((doc.size_bytes || doc.file_size) / 1024).toFixed(1)} KB` : '—';
                  const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                  const fileUrl = doc.public_url || doc.file_url;
                  const isSyncedToCloud = Boolean(fileUrl && fileUrl.startsWith('http'));

                  return (
                    <div
                      key={doc.id}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '8px',
                          backgroundColor: isGeo ? '#ecfdf5' : '#eff6ff',
                          color: isGeo ? '#059669' : '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isGeo ? <Layers size={22} /> : <FileText size={22} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{doc.name}</span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isGeo ? '#d1fae5' : '#dbeafe',
                              color: isGeo ? '#065f46' : '#1e40af',
                              textTransform: 'uppercase',
                            }}
                          >
                            {doc.file_type}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isSyncedToCloud ? '#f0fdf4' : '#fef3c7',
                              color: isSyncedToCloud ? '#166534' : '#92400e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {isSyncedToCloud ? <Cloud size={11} /> : <HardDrive size={11} />}
                            {isSyncedToCloud ? 'En la nube (Supabase)' : 'Local'}
                          </span>
                        </div>

                        {doc.summary && (
                          <p
                            style={{
                              margin: '4px 0 6px',
                              fontSize: '0.74rem',
                              color: '#475569',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {doc.summary}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem', color: '#64748b', flexWrap: 'wrap' }}>
                          <span>📅 {dateStr}</span>
                          <span>📦 {formattedSize}</span>
                          {doc.geo_points_count > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#059669', fontWeight: 600 }}>
                              <MapPin size={11} /> {doc.geo_points_count} puntos
                            </span>
                          )}
                          {doc.geo_paths_count > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#d97706', fontWeight: 600 }}>
                              <Route size={11} /> {doc.geo_paths_count} caminos
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de acción directos: Ver, Descargar, Borrar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {fileUrl && (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#f8fafc',
                              color: '#0284c7',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              textDecoration: 'none',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}
                            title="Abrir o ver archivo"
                          >
                            <ExternalLink size={13} />
                            <span style={{ display: 'none', sm: 'inline' }}>Ver</span>
                          </a>
                        )}

                        {fileUrl && (
                          <a
                            href={fileUrl}
                            download={doc.name}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#f8fafc',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              textDecoration: 'none',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}
                            title="Descargar archivo"
                          >
                            <Download size={13} />
                          </a>
                        )}

                        <button
                          onClick={() => handleDelete(doc.id, doc.name)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #fee2e2',
                            backgroundColor: '#fff5f5',
                            color: '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                          }}
                          title="Eliminar de la biblioteca"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Pestaña de Búsqueda Vectorial Interactiva */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#475569' }}>
              Comprueba qué fragmentos y datos cartográficos recupera el modelo mediante similitud de coseno en Supabase / RAG:
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Ej: '¿Dónde está la arqueta principal?' o 'Tubería del sector 2'..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleTestSearch}
                disabled={isSearchingTest || !testQuery.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#00979d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isSearchingTest ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isSearchingTest ? 'Buscando...' : 'Buscar Vectores'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {testResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.8rem' }}>
                  Escribe una consulta arriba y pulsa "Buscar Vectores" para ver los fragmentos semánticos coincidentes.
                </div>
              ) : (
                testResults.map((res, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#00979d' }}>Fuente: {res.document_name}</span>
                      <span
                        style={{
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.68rem',
                        }}
                      >
                        Similitud: {(res.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p style={{ margin: 0, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{res.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Pie del Modal */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Los archivos subidos se sincronizan con Supabase Storage para acceso universal móvil y web.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
