// src/pages/MapaFinca.jsx
// Página fullscreen del mapa satélite de Campito Jorox.
// Carga el inventario y los caminos desde Supabase y pasa los datos
// al componente FarmSatelliteMap en modo página completa.

import { useState, useEffect, useCallback } from 'react';
import FarmSatelliteMap from '../components/FarmSatelliteMap';
import { loadFarmInventory, loadFarmPaths } from '../services/farmInventoryStorage';

export default function MapaFinca() {
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
        await Promise.all([loadInventory(), loadPaths()]);
      } catch (err) {
        setError('Error cargando datos del mapa.');
      } finally {
        setLoading(false);
      }
    };
    loadAll();

    const handleInv = () => loadInventory();
    const handlePaths = () => loadPaths();
    window.addEventListener('farm-inventory-updated', handleInv);
    window.addEventListener('farm-paths-updated', handlePaths);
    return () => {
      window.removeEventListener('farm-inventory-updated', handleInv);
      window.removeEventListener('farm-paths-updated', handlePaths);
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
      <FarmSatelliteMap
        inventory={inventory}
        paths={paths}
        onReloadInventory={loadInventory}
        onReloadPaths={loadPaths}
        onPathCreated={(newPath) => setPaths(prev => [newPath, ...prev])}
        isPageMode={true}
      />
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

