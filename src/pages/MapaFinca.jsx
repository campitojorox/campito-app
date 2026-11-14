// src/pages/MapaFinca.jsx
// Página fullscreen del mapa satélite de Campito Jorox.
// Carga el inventario y los caminos desde Supabase y pasa los datos
// al componente FarmSatelliteMap en modo página completa.

import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import FarmSatelliteMap from '../components/FarmSatelliteMap';
import ErrorBoundary from '../components/ErrorBoundary';
import { loadFarmInventory, loadFarmPaths, loadFarmCategories } from '../services/farmInventoryStorage';

export default function MapaFinca() {
  const { searchQuery = '', isSearchOpen = false } = useOutletContext() || {};
  const [inventory, setInventory] = useState([]);
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Carga del inventario (Supabase con fallback automático a localStorage)
  const loadInventory = useCallback(async () => {
    try {
      const data = await loadFarmInventory();
      setInventory(data || []);
    } catch (err) {
      console.error('Error cargando inventario:', err);
    }
  }, []);

  // Carga de caminos y trazados (Supabase con fallback a localStorage)
  const loadPaths = useCallback(async () => {
    try {
      const data = await loadFarmPaths();
      setPaths(data || []);
    } catch (err) {
      console.error('Error cargando caminos:', err);
    }
  }, []);

  // Carga inicial y escucha reactiva de eventos
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadFarmCategories(), loadInventory(), loadPaths()]);
      } catch {
        setError('Error cargando datos del mapa.');
      } finally {
        setLoading(false);
      }
    };
    loadAll();

    const handleInv = (e) => {
      if (e?.detail?.deleted && e.detail.id) {
        setInventory((prev) => prev.filter((i) => String(i.id) !== String(e.detail.id)));
      } else if (e?.detail?.id && !e.detail.forceReload) {
        setInventory((prev) => {
          const exists = prev.some((i) => String(i.id) === String(e.detail.id));
          if (exists) {
            return prev.map((i) =>
              String(i.id) === String(e.detail.id) ? { ...i, ...e.detail } : i
            );
          }
          return [e.detail, ...prev];
        });
      }
      loadInventory();
    };

    const handlePaths = (e) => {
      if (e?.detail?.deleted && e.detail.id) {
        setPaths((prev) => prev.filter((p) => String(p.id) !== String(e.detail.id)));
      } else if (e?.detail?.id && !e.detail.forceReload) {
        setPaths((prev) => {
          const exists = prev.some((p) => String(p.id) === String(e.detail.id));
          if (exists) {
            return prev.map((p) =>
              String(p.id) === String(e.detail.id) ? { ...p, ...e.detail } : p
            );
          }
          return [e.detail, ...prev];
        });
      }
      loadPaths();
    };

    window.addEventListener('farm-inventory-updated', handleInv);
    window.addEventListener('farm-paths-updated', handlePaths);

    // ── Sincronización multi-dispositivo activa (iPhone <-> Mac Safari/Chrome) ──
    // Al regresar a la pestaña o ventana tras haber interactuado en el móvil,
    // se consulta Supabase en segundo plano sin interrumpir la visualización.
    const handleVisibilitySync = () => {
      if (!document.hidden) {
        loadInventory();
        loadPaths();
      }
    };
    const handleFocusSync = () => {
      loadInventory();
      loadPaths();
    };

    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleFocusSync);

    const heartbeat = setInterval(() => {
      if (!document.hidden) {
        loadInventory();
        loadPaths();
      }
    }, 20000);

    return () => {
      window.removeEventListener('farm-inventory-updated', handleInv);
      window.removeEventListener('farm-paths-updated', handlePaths);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleFocusSync);
      clearInterval(heartbeat);
    };
  }, [loadInventory, loadPaths]);

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingContent}>
          <div style={styles.spinner} />
          <span style={styles.loadingText}>Cargando mapa de Campito Jorox...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingContent}>
          <span style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</span>
          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>{error}</span>
          <button onClick={() => window.location.reload()} style={styles.retryBtn}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pageWrapper}>
      <ErrorBoundary sectionName="Mapas y Catastro">
        <FarmSatelliteMap
          inventory={inventory}
          paths={paths}
          onReloadInventory={loadInventory}
          onReloadPaths={loadPaths}
          onPathCreated={(newPath) => setPaths(prev => [newPath, ...prev])}
          isPageMode={true}
          searchQuery={isSearchOpen ? searchQuery : ''}
        />
      </ErrorBoundary>
    </div>
  );
}

const styles = {
  pageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    position: 'relative',
  },
  loadingScreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 400,
    backgroundColor: '#0f172a',
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '3px solid rgba(0,151,157,0.2)',
    borderTop: '3px solid #00979d',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  retryBtn: {
    marginTop: '0.5rem',
    padding: '8px 16px',
    backgroundColor: '#00979d',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

