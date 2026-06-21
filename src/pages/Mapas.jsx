import React, { useState } from 'react';
import { Pencil, Navigation, Copy, X } from 'lucide-react';

export default function Mapas() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Nuevo mapa
  const iframeUrl = 'https://www.google.com/maps/d/embed?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Link de edición
  const editUrl = 'https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Link del visor (Navigation)
  const viewerUrl = 'https://www.google.com/maps/d/viewer?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Satélite
  const finalIframeUrl = iframeUrl + '&t=k';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editUrl);
    alert('¡Enlace copiado! Pégalo en Safari o Chrome.');
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Contenedor de botones flotantes */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        zIndex: 1000
      }}>
        <a 
          href={viewerUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            backgroundColor: '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
            opacity: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 0.5 : 1,
            pointerEvents: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 'none' : 'auto'
          }}
          title="Abrir en Google Maps para Navegar"
        >
          <Navigation size={18} />
        </a>

        <button 
          onClick={() => setIsEditModalOpen(true)}
          style={{
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
            opacity: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 0.5 : 1,
            pointerEvents: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 'none' : 'auto'
          }}
          title="Opciones de Edición"
        >
          <Pencil size={18} />
        </button>
      </div>

      {isEditModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 5000, padding: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', position: 'relative' }}>
            <button onClick={() => setIsEditModalOpen(false)} style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            <h3 style={{ color: 'var(--primary)', marginTop: 0, marginBottom: '1rem' }}>Editar Mapa en Móvil</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Los celulares abren automáticamente la App de Google Maps, la cual <strong>no permite editar</strong>. Para ver las herramientas de dibujo, debes usar el navegador (Safari o Chrome) y pedir la <strong>"Vista de Computadora"</strong>.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1.5rem' }}>
              <button onClick={copyToClipboard} className="btn" style={{ margin: 0, backgroundColor: 'var(--surface)', color: 'white', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Copy size={18} /> Copiar Enlace
              </button>
              <a href={editUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Intentar Abrir Forzado
              </a>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '1rem', textAlign: 'center' }}>
              Truco: Mantén presionado el botón azul de arriba y elige "Abrir en pestaña nueva".
            </p>
          </div>
        </div>
      )}

      {iframeUrl === 'PLACEHOLDER_MAP_URL' ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
          <p>Esperando el enlace de inserción de Google My Maps...</p>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <iframe 
            src={finalIframeUrl} 
            width="100%" 
            height="100%" 
            style={{ 
              border: 'none', 
              backgroundColor: '#fff', 
              display: 'block',
              marginTop: '-100px', // Oculta la tarjeta superior completa de Google
              height: 'calc(100% + 116px)' // 100px compensan arriba, y 16px extras hunden la franja blanca suavemente
            }}
            title="Google Maps"
          ></iframe>
        </div>
      )}
    </div>
  );
}
