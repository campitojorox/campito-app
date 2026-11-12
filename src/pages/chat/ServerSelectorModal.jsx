// src/pages/chat/ServerSelectorModal.jsx
import { Zap, X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { GEMINI_SERVERS } from '../../services/geminiDirectClient';
import { styles } from './chatIaStyles';

export default function ServerSelectorModal({
  isOpen,
  onClose,
  activeServer,
  setSelectedServerIndex,
  setActiveServer,
  autoFallback,
  setAutoFallback,
}) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="#00979d" />
            <p style={styles.modalTitle}>Servidores de Gemini</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <div
            style={{
              padding: '9px 12px',
              backgroundColor: '#f0fdfa',
              borderRadius: 8,
              border: '1px solid #99f6e4',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={styles.statusDot(activeServer.badgeColor)} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#0f766e' }}>
                Conectado: {activeServer.name} ({activeServer.level})
              </p>
              <p style={{ margin: 0, fontSize: '0.68rem', color: '#115e59' }}>
                Cuota activa y respondiendo correctamente
              </p>
            </div>
            <CheckCircle2 size={16} color="#00979d" />
          </div>

          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '4px 0 0' }}>
            Selecciona un modelo o deja activo el <b>Auto-Fallback</b> para usar el más potente disponible:
          </p>

          {GEMINI_SERVERS.map((srv, idx) => {
            const isConnectedNow = activeServer.id === srv.id;

            return (
              <div
                key={srv.id}
                style={{
                  ...styles.serverCard(isConnectedNow),
                  opacity: srv.comingSoon ? 0.6 : 1,
                  cursor: srv.comingSoon ? 'not-allowed' : 'pointer',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 6,
                }}
                onClick={() => {
                  if (srv.comingSoon) return;
                  setSelectedServerIndex(idx);
                  setActiveServer(srv);
                  onClose();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={styles.statusDot(srv.badgeColor)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        {srv.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 10,
                          backgroundColor: `${srv.badgeColor}20`,
                          color: srv.badgeColor,
                        }}
                      >
                        ({srv.level})
                      </span>
                      {isConnectedNow && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: '#00979d',
                            fontWeight: 700,
                            backgroundColor: '#ccfbf1',
                            padding: '1px 6px',
                            borderRadius: 8,
                          }}
                        >
                          Conectado Ahora
                        </span>
                      )}
                      {!isConnectedNow && srv.available && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: '#059669',
                            fontWeight: 600,
                            backgroundColor: '#d1fae5',
                            padding: '1px 6px',
                            borderRadius: 8,
                          }}
                        >
                          Disponible (Fallback)
                        </span>
                      )}
                      {srv.comingSoon && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: '#94a3b8',
                            fontWeight: 600,
                            backgroundColor: '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: 8,
                          }}
                        >
                          Próximamente
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>{srv.desc}</p>
                  </div>
                  {isConnectedNow && <CheckCircle2 size={16} color="#00979d" />}
                </div>
              </div>
            );
          })}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              marginTop: 4,
            }}
          >
            <div>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0, color: '#1e293b' }}>
                Auto-Fallback de cuota
              </p>
              <p style={{ fontSize: '0.68rem', color: '#64748b', margin: 0 }}>
                Si se acaba el crédito, cambia al siguiente servidor
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoFallback}
              onChange={(e) => setAutoFallback(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#00979d', cursor: 'pointer' }}
            />
          </div>

          <div
            style={{
              fontSize: '0.68rem',
              color: '#475569',
              backgroundColor: '#f1f5f9',
              padding: '9px 12px',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f172a' }}>
              <ShieldCheck size={14} color="#00979d" />
              <span>Entorno Confidencial y Privado</span>
            </div>
            <span>
              Toda la información, audios y documentos de este chat son <b>estrictamente confidenciales</b>. Nunca se comparten con terceros externos ni redes públicas. Tú como administrador tienes total libertad para <b>exportar y descargar tus informes en PDF, Excel o KML/GeoJSON</b> cuando lo desees.
            </span>
            <span style={{ color: '#64748b', fontSize: '0.64rem', marginTop: 2 }}>
              Cuenta: Google AI Studio · Sesión protegida y privada
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

