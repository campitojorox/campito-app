// src/components/rag/RagFileExplorerModal.jsx
// Modal / Explorador de Archivos simplificado y limpio para Campito Jorox.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Folder,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Map,
  Filter,
  RefreshCw,
  X,
  Search,
  ExternalLink,
  Download,
  Trash2,
  Plus,
  Check,
} from 'lucide-react';
import {
  fetchAllRagDocuments,
  deleteRagDocument,
  subscribeToRagDocuments,
  indexDocumentForRag,
} from '../../services/ragDocumentService';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todos los formatos' },
  { id: 'geo', label: '🗺️ KML / KMZ / Geo' },
  { id: 'pdf', label: '📄 PDF' },
  { id: 'csv', label: '📊 Tablas / Excel' },
  { id: 'chat', label: '💬 Archivos del Chat' },
];

function getFileFormatIcon(fileType, fileName = '') {
  const ext = (fileType || fileName.split('.').pop() || '').toLowerCase();
  if (['kml', 'kmz', 'geojson', 'gpx'].includes(ext)) {
    return <Map size={16} color="#059669" />;
  }
  if (ext === 'pdf') {
    return <FileText size={16} color="#dc2626" />;
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return <FileSpreadsheet size={16} color="#16a34a" />;
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
    return <ImageIcon size={16} color="#0284c7" />;
  }
  return <FileText size={16} color="#64748b" />;
}

export default function RagFileExplorerModal({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    setIsRefreshing(true);
    try {
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
    loadDocuments();

    const unsubscribe = subscribeToRagDocuments(() => {
      loadDocuments();
    });

    return () => {
      unsubscribe?.();
    };
  }, [isOpen, loadDocuments]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(`Subiendo ${file.name} (${i + 1}/${files.length})...`);
        await indexDocumentForRag({
          file,
          name: file.name,
          userName: 'Usuario',
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        });
      }
      await loadDocuments();
    } catch (upErr) {
      console.warn('[RagFileExplorerModal] Error en subida:', upErr);
      alert('Aviso al subir archivo: ' + upErr.message);
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId, docName) => {
    if (!window.confirm(`¿Eliminar "${docName}"?`)) return;
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
      const matchQ = !q || doc.name?.toLowerCase().includes(q);
      const matchType =
        selectedFilter === 'all'
          ? true
          : selectedFilter === 'geo'
            ? ['kml', 'kmz', 'geojson', 'gpx'].includes(doc.file_type?.toLowerCase())
            : selectedFilter === 'chat'
              ? doc.section_origin === 'chat-ia' || doc.category === 'chat'
              : selectedFilter === 'pdf'
                ? doc.file_type?.toLowerCase() === 'pdf' || doc.name?.toLowerCase().endsWith('.pdf')
                : selectedFilter === 'csv'
                  ? ['xlsx', 'xls', 'csv'].includes(doc.file_type?.toLowerCase()) || /\.(xlsx|xls|csv)$/i.test(doc.name)
                  : doc.file_type?.toLowerCase() === selectedFilter;
      return matchQ && matchType;
    });
  }, [documents, searchQuery, selectedFilter]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(3px)',
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
          maxWidth: '720px',
          maxHeight: '88vh',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Cabecera compacta: Título con icono pequeño a la izquierda, buscador a la derecha */}
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {/* Título de sección con icono pequeño */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <Folder size={17} color="#00979d" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
              Archivos de la Finca
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
              ({filteredDocs.length})
            </span>
          </div>

          {/* Zona derecha: Buscador pequeño + Icono Filtro + Subir + Refrescar + Cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            {/* Buscador pequeño */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#1e293b',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #334155',
                width: '125px',
              }}
            >
              <Search size={12} color="#94a3b8" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'none',
                  outline: 'none',
                  fontSize: '0.72rem',
                  width: '100%',
                  color: '#f8fafc',
                  padding: 0,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Icono de Filtros arriba al lado de búsqueda */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsFilterOpen((prev) => !prev)}
                style={{
                  background: selectedFilter !== 'all' ? '#00979d' : 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: selectedFilter !== 'all' ? '#ffffff' : '#cbd5e1',
                  cursor: 'pointer',
                  padding: '5px 7px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={selectedFilter !== 'all' ? `Filtro: ${selectedFilter}` : 'Filtrar formatos'}
              >
                <Filter size={14} />
              </button>

              {isFilterOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                    onClick={() => setIsFilterOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '28px',
                      right: 0,
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '4px',
                      zIndex: 100,
                      boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
                      minWidth: '150px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {FILTER_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setSelectedFilter(f.id);
                          setIsFilterOpen(false);
                        }}
                        style={{
                          background: selectedFilter === f.id ? 'rgba(0,151,157,0.25)' : 'none',
                          color: selectedFilter === f.id ? '#38bdf8' : '#e2e8f0',
                          border: 'none',
                          textAlign: 'left',
                          padding: '6px 9px',
                          borderRadius: '5px',
                          fontSize: '0.72rem',
                          fontWeight: selectedFilter === f.id ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{f.label}</span>
                        {selectedFilter === f.id && <Check size={12} color="#38bdf8" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Subir archivo */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#00979d',
                color: '#ffffff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Subir archivo"
            >
              <Plus size={13} />
              <span>Subir</span>
            </button>

            {/* Refrescar */}
            <button
              onClick={loadDocuments}
              disabled={isRefreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: isRefreshing ? '#00979d' : '#cbd5e1',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '6px',
                display: 'flex',
              }}
              title="Recargar"
            >
              <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Cerrar */}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '6px',
                display: 'flex',
              }}
              title="Cerrar"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Barra de progreso si está subiendo */}
        {isUploading && (
          <div
            style={{
              padding: '6px 14px',
              backgroundColor: '#e6f7f7',
              borderBottom: '1px solid #b2ecee',
              fontSize: '0.74rem',
              color: '#007b80',
              fontWeight: 600,
            }}
          >
            {uploadProgressText || 'Subiendo archivo...'}
          </div>
        )}

        {/* Lista simplificada de elementos: Icono pequeño de formato, nombre, fecha, 3 botones */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {filteredDocs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                color: '#94a3b8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Folder size={32} strokeWidth={1.5} color="#cbd5e1" />
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                {searchQuery || selectedFilter !== 'all'
                  ? 'No hay archivos con este filtro'
                  : 'No hay archivos subidos todavía'}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const dateStr = doc.created_at
                ? new Date(doc.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })
                : '';
              const fileUrl = doc.public_url || doc.file_url;

              return (
                <div
                  key={doc.id}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  {/* Icono pequeño de formato + Nombre + Fecha */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {getFileFormatIcon(doc.file_type, doc.name)}
                    </div>

                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '280px',
                        }}
                        title={doc.name}
                      >
                        {doc.name}
                      </span>
                      {dateStr && (
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {dateStr}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3 Botones actuales: Ver, Descargar, Eliminar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '5px 7px',
                          borderRadius: '5px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc',
                          color: '#0284c7',
                          display: 'flex',
                          alignItems: 'center',
                          textDecoration: 'none',
                        }}
                        title="Ver o abrir archivo"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}

                    {fileUrl && (
                      <a
                        href={fileUrl}
                        download={doc.name}
                        style={{
                          padding: '5px 7px',
                          borderRadius: '5px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc',
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          textDecoration: 'none',
                        }}
                        title="Descargar archivo"
                      >
                        <Download size={13} />
                      </a>
                    )}

                    <button
                      onClick={() => handleDelete(doc.id, doc.name)}
                      style={{
                        padding: '5px 7px',
                        borderRadius: '5px',
                        border: '1px solid #fee2e2',
                        backgroundColor: '#fff5f5',
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                      title="Eliminar archivo"
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
    </div>
  );
}
