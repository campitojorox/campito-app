import React from 'react';
import { Pencil } from 'lucide-react';

export default function Mapas() {
  // Nuevo mapa (sin parámetros extraños como ehbc que fuerzan la vista previa)
  const iframeUrl = 'https://www.google.com/maps/d/embed?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Link de edición exacto proporcionado por el usuario (el u/1/ fuerza la cuenta correcta de Google)
  const editUrl = 'https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Intento de forzar modo satélite con parámetro &t=k 
  const finalIframeUrl = iframeUrl + '&t=k';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <a 
        href={editUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
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
          zIndex: 1000,
          opacity: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 0.5 : 1,
          pointerEvents: iframeUrl === 'PLACEHOLDER_MAP_URL' ? 'none' : 'auto'
        }}
        title="Editar Mapa en el Navegador"
      >
        <Pencil size={18} />
      </a>

      {iframeUrl === 'PLACEHOLDER_MAP_URL' ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
          <p>Esperando el enlace de inserción de Google My Maps...</p>
        </div>
      ) : (
        <iframe 
          src={finalIframeUrl} 
          width="100%" 
          height="100%" 
          style={{ border: 'none', backgroundColor: '#fff', display: 'block' }}
          title="Google Maps"
        ></iframe>
      )}
    </div>
  );
}
