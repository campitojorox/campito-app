import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { lazy } from 'react';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import './index.css';

const Calendario = lazy(() => import('./pages/Calendario'));
const Resumen = lazy(() => import('./pages/Resumen'));
const GastoVenta = lazy(() => import('./pages/GastoVenta'));
const Mapas = lazy(() => import('./pages/Mapas'));

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
      window.screen.orientation.lock("portrait").catch((err) => {
        console.warn("Screen orientation lock failed: ", err);
      });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--bg-color)', color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 'bold' }}>Cargando...</div>;
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <>
      <div id="portrait-lock-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-color)',
        zIndex: 9999,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'white',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📱</div>
        <h2 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>Modo Vertical</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Por favor, gira tu teléfono. Esta aplicación está diseñada para usarse exclusivamente en orientación vertical.</p>
      </div>

      <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout session={session} />}>
          <Route index element={<Navigate to="/calendario" replace />} />
          <Route path="calendario" element={<Calendario />} />
          <Route path="gasto-venta" element={<GastoVenta />} />
          <Route path="resumen" element={<Resumen />} />
          <Route path="mapas" element={<Mapas />} />
        </Route>
      </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
