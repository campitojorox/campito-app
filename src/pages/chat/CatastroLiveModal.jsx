// src/pages/chat/CatastroLiveModal.jsx
import {
  MapPin,
  Map,
  Navigation,
  X,
  ExternalLink,
  FileSpreadsheet,
  Download,
  Layers,
  Trash2,
  Plus,
} from 'lucide-react';
import FarmSatelliteMap from '../../components/FarmSatelliteMap';
import {
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportInventoryToKML,
  exportInventoryToGeoJSON,
} from '../../utils/exportTools';
import { styles } from './chatIaStyles';

export default function CatastroLiveModal({
  isOpen,
  onClose,
  farmInventory,
  farmPaths,
  setFarmPaths,
  inventoryModalTab,
  setInventoryModalTab,
  reloadInventory,
  reloadPaths,
  lastRecordedGpsTrack,
  inventorySearch,
  setInventorySearch,
  inventoryCategoryFilter,
  setInventoryCategoryFilter,
  handleDeleteInventoryItem,
  handleDeletePath,
}) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.modalContent,
          maxWidth: 960,
          width: '96vw',
          height: '90vh',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.modalHeader, padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="#00979d" />
            <div>
              <p style={{ ...styles.modalTitle, fontSize: '0.92rem' }}>Catastro y Mapa Satélite — Campito Jorox</p>
              <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b' }}>
                {farmInventory.length} puntos | {farmPaths.length} caminos y senderos trazados
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setInventoryModalTab('map')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: inventoryModalTab === 'map' ? '#00979d' : '#cbd5e1',
                backgroundColor: inventoryModalTab === 'map' ? '#00979d' : '#ffffff',
                color: inventoryModalTab === 'map' ? '#ffffff' : '#475569',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Map size={13} />
              <span>Mapa Satélite</span>
            </button>

            <button
              type="button"
              onClick={() => setInventoryModalTab('inventory')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: inventoryModalTab === 'inventory' ? '#10b981' : '#cbd5e1',
                backgroundColor: inventoryModalTab === 'inventory' ? '#10b981' : '#ffffff',
                color: inventoryModalTab === 'inventory' ? '#ffffff' : '#475569',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <MapPin size={13} />
              <span>Árboles ({farmInventory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setInventoryModalTab('paths')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: inventoryModalTab === 'paths' ? '#f97316' : '#cbd5e1',
                backgroundColor: inventoryModalTab === 'paths' ? '#f97316' : '#ffffff',
                color: inventoryModalTab === 'paths' ? '#ffffff' : '#475569',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Navigation size={13} />
              <span>Caminos ({farmPaths.length})</span>
            </button>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              aria-label="Cerrar modal de mapa"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {inventoryModalTab === 'map' && (
            <div style={{ width: '100%', height: '100%', minHeight: 400 }}>
              <FarmSatelliteMap
                inventory={farmInventory}
                paths={farmPaths}
                onReloadInventory={reloadInventory}
                onReloadPaths={reloadPaths}
                lastRecordedGpsTrack={lastRecordedGpsTrack}
                onPathCreated={(newP) => setFarmPaths((prev) => [newP, ...prev])}
              />
            </div>
          )}

          {inventoryModalTab === 'inventory' && (
            <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                    📥 Descarga Segura y Fichero para el Usuario
                  </span>
                  <a
                    href="https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#0284c7',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Google My Maps Jorox
                    <ExternalLink size={10} />
                  </a>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  <button
                    onClick={() => exportInventoryToExcel(farmInventory, farmPaths)}
                    disabled={farmInventory.length === 0 && farmPaths.length === 0}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <FileSpreadsheet size={13} />
                    Excel
                  </button>

                  <button
                    onClick={() => exportInventoryToPDF(farmInventory, farmPaths)}
                    disabled={farmInventory.length === 0 && farmPaths.length === 0}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Download size={13} />
                    PDF
                  </button>

                  <button
                    onClick={() => exportInventoryToKML(farmInventory, farmPaths)}
                    disabled={farmInventory.length === 0 && farmPaths.length === 0}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Map size={13} />
                    KML
                  </button>

                  <button
                    onClick={() => exportInventoryToGeoJSON(farmInventory, farmPaths)}
                    disabled={farmInventory.length === 0 && farmPaths.length === 0}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#475569',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Layers size={13} />
                    GeoJSON
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Buscar por árbol, variedad o notas..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                    outline: 'none',
                    backgroundColor: '#fafafa',
                  }}
                />
                <select
                  value={inventoryCategoryFilter}
                  onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.72rem',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <option value="all">Todas ({farmInventory.length})</option>
                  <option value="arbol">🥑 Árboles</option>
                  <option value="riego_linea">💧 Riego / Tuberías</option>
                  <option value="arqueta">🔲 Arquetas</option>
                  <option value="acequia">🧱 Acequias / Albercas</option>
                  <option value="piedra_linde">🪨 Piedras de Linde</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {farmInventory.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 16px',
                      color: '#94a3b8',
                      fontSize: '0.78rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: 8,
                      border: '1px dashed #cbd5e1',
                    }}
                  >
                    <MapPin size={24} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                      Aún no hay árboles ni puntos georreferenciados
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                      Inicia una caminata en campo con el botón <b>🧭 (Navegación)</b> del chat para mapear con voz y GPS.
                    </p>
                  </div>
                ) : (
                  farmInventory
                    .filter((item) => {
                      if (inventoryCategoryFilter !== 'all') {
                        const cat = (item.category || item.tipo || '').toLowerCase();
                        if (!cat.includes(inventoryCategoryFilter)) return false;
                      }
                      if (!inventorySearch.trim()) return true;
                      const q = inventorySearch.toLowerCase();
                      return (
                        (item.name && item.name.toLowerCase().includes(q)) ||
                        (item.variety_type && item.variety_type.toLowerCase().includes(q)) ||
                        (item.notes && item.notes.toLowerCase().includes(q)) ||
                        (item.status && item.status.toLowerCase().includes(q))
                      );
                    })
                    .map((item) => {
                      const lat = item.latitude || item.coordenadas?.lat;
                      const lng = item.longitude || item.coordenadas?.lng;
                      const acc = item.accuracy_meters || item.accuracy_m;
                      const hasWarning = item.gps_warning || item.advertencia_gps;

                      const statusColors = {
                        saludable: { bg: '#dcfce7', text: '#15803d', label: 'Saludable' },
                        clorosis: { bg: '#fef3c7', text: '#b45309', label: 'Clorosis' },
                        poda_requerida: { bg: '#fee2e2', text: '#b91c1c', label: 'Poda urgente' },
                        enfermo: { bg: '#fee2e2', text: '#991b1b', label: 'Enfermo' },
                        seco: { bg: '#f1f5f9', text: '#475569', label: 'Seco' },
                        mantenimiento: { bg: '#fef3c7', text: '#92400e', label: 'Mantenimiento' },
                        bueno: { bg: '#dcfce7', text: '#166534', label: 'Bueno' },
                      };
                      const stInfo = statusColors[item.status || item.estado] || statusColors.saludable;

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                {item.name || `${item.tipo || 'Árbol'} ${item.variedad || ''}`}
                              </span>
                              {item.variety_type && (
                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                  ({item.variety_type})
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: '0.64rem',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 8,
                                  backgroundColor: stInfo.bg,
                                  color: stInfo.text,
                                }}
                              >
                                {stInfo.label}
                              </span>
                            </div>

                            <button
                              onClick={() => handleDeleteInventoryItem(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                padding: '2px',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="Eliminar elemento"
                              aria-label="Eliminar elemento"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#334155' }}>
                              <MapPin size={12} color="#00979d" />
                              <span>
                                {lat && lng ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Sin coordenadas'}
                              </span>
                              {acc && (
                                <span style={{ fontSize: '0.66rem', color: hasWarning ? '#b45309' : '#059669', fontWeight: 600 }}>
                                  (±{Number(acc).toFixed(1)}m){hasWarning ? ' ⚠️' : ''}
                                </span>
                              )}
                            </div>

                            {lat && lng && (
                              <a
                                href={`https://maps.google.com/?q=${lat},${lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '0.68rem',
                                  color: '#0284c7',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                Ver en Google Maps
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>

                          {(item.notes || item.observaciones) && (
                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#475569', fontStyle: 'italic', lineHeight: 1.4 }}>
                              "{item.notes || item.observaciones}"
                            </p>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}

          {inventoryModalTab === 'paths' && (
            <div style={{ ...styles.modalBody, flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  Caminos, Senderos y Líneas de Riego ({farmPaths.length})
                </span>
                <button
                  onClick={() => setInventoryModalTab('map')}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#f97316',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Plus size={12} />
                  Trazar nuevo camino en el mapa
                </button>
              </div>

              {farmPaths.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '28px 16px',
                    color: '#94a3b8',
                    fontSize: '0.78rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <Navigation size={24} color="#f97316" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                    Aún no se han trazado caminos ni senderos
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem' }}>
                    Ve a la pestaña <b>Mapa Satélite</b> y pulsa <b>"Trazar Camino / Sendero"</b> para dibujar sobre el satélite con clics.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {farmPaths.map((p) => {
                    const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#ffffff',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 16,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: p.color || '#f97316',
                                display: 'inline-block',
                              }}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                              {p.name}
                            </span>
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '1px 6px',
                                borderRadius: 6,
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                fontWeight: 600,
                              }}
                            >
                              {p.path_type}
                            </span>
                          </div>

                          <button
                            onClick={() => handleDeletePath(p.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#dc2626',
                              padding: 2,
                            }}
                            title="Eliminar camino"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                          <span>
                            Longitud: <b>{p.length_meters ? `${Number(p.length_meters).toFixed(1)}m` : '—'}</b>
                          </span>
                          <span>
                            Nodos: <b>{coords.length} vértices</b>
                          </span>
                          <span>{p.created_at ? p.created_at.split('T')[0] : ''}</span>
                        </div>

                        {p.notes && (
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                            "{p.notes}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

