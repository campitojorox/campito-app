// src/components/rag/RagFileExplorerModal.jsx
// Modal / Explorador de Archivos Vectorial (RAG) de Campito Jorox.
// Permite visualizar los documentos cargados históricamente (KML, KMZ, GeoJSON, PDF, CSV, etc.),
// ver su estado de indexación vectorial, puntos/caminos extraídos y forzar su aprendizaje/reindexación.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Folder,
  FileText,
  MapPin,
  Route,
  RefreshCw,
  X,
  Search,
  CheckCircle2,
  Sparkles,
  Layers,
  Database,
} from 'lucide-react';
import {
  getLocalRagDocuments,
  getLocalRagChunks,
  searchRagKnowledge,
} from '../../services/ragDocumentService';
import { supabase } from '../../supabaseClient';

export default function RagFileExplorerModal({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [chunksCount, setChunksCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'test_search'
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [isSearchingTest, setIsSearchingTest] = useState(false);

  const loadDocuments = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Cargar documentos locales
      const localDocs = getLocalRagDocuments();
      const localChunks = getLocalRagChunks();
      setChunksCount(localChunks.length);

      // 2. Intentar cargar documentos desde Supabase
      const { data: dbDocs, error } = await supabase
        .from('farm_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(dbDocs) && dbDocs.length > 0) {
        // Mezclar dando prioridad a Supabase
        const map = new Map();
        localDocs.forEach((d) => map.set(d.id || d.name, d));
        dbDocs.forEach((d) => map.set(d.id || d.name, d));
        setDocuments(Array.from(map.values()));
      } else {
        setDocuments(localDocs);
      }
    } catch {
      setDocuments(getLocalRagDocuments());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        loadDocuments();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loadDocuments]);

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
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                backgroundColor: '#00979d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                Explorador de Archivos y Memoria Vectorial (RAG)
              </h2>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Biblioteca permanente de Campito Jorox · {documents.length} archivos indexados ({chunksCount} vectores)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={loadDocuments}
              disabled={isRefreshing}
              style={{
                background: 'none',
                border: 'none',
                color: isRefreshing ? '#00979d' : '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
              }}
              title="Refrescar lista de archivos"
            >
              <RefreshCw size={17} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

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
            Probar Búsqueda Vectorial (RAG)
          </button>
        </div>

        {/* Contenido según pestaña */}
        {activeTab === 'files' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Barra de Filtros y Búsqueda */}
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
                  placeholder="Buscar en archivos aprendidos (KML, KMZ, facturas, tuberías)..."
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

              <div style={{ display: 'flex', gap: 6 }}>
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
                    gap: 10,
                  }}
                >
                  <Folder size={42} strokeWidth={1.5} color="#cbd5e1" />
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    No hay archivos en la biblioteca todavía
                  </p>
                  <p style={{ margin: 0, fontSize: '0.76rem', maxWidth: '380px' }}>
                    Sube un archivo <b>.KML</b>, <b>.KMZ</b>, <b>GeoJSON</b> o <b>PDF</b> mediante el botón <b>+</b> en el Chat o en Mapas. El sistema lo descomprimirá, indexará y aprenderá automáticamente.
                  </p>
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const isGeo = ['kml', 'kmz', 'geojson', 'gpx'].includes(doc.file_type?.toLowerCase());
                  const formattedSize = doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(1)} KB` : '—';
                  const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';

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
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: isGeo ? '#ecfdf5' : '#eff6ff',
                          color: isGeo ? '#059669' : '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isGeo ? <Layers size={20} /> : <FileText size={20} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{doc.name}</span>
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
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle2 size={12} color="#10b981" /> Indexado en RAG ({doc.chunk_count || 1} chunks)
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem', color: '#64748b' }}>
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
              Comprueba en tiempo real qué fragmentos y coordenadas recupera el modelo mediante similitud de coseno ante cualquier consulta:
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
            Los archivos subidos se incorporan automáticamente a la memoria RAG del Chat y Mapas.
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
