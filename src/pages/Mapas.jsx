import React from 'react';
import { Pencil, Navigation } from 'lucide-react';

export default function Mapas() {
  // Nuevo mapa (sin parámetros extraños como ehbc que fuerzan la vista previa)
  const iframeUrl = 'https://www.google.com/maps/d/embed?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Revertimos al dominio oficial porque mymaps arroja 404.
  // Para evitar que la App de Google Maps secuestre el enlace en móviles, 
  // la mejor solución es indicar al usuario que mantenga presionado el botón.
  const editUrl = 'https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Link del visor (Viewer). Al abrirlo en celular, casi siempre forzará a abrir la App de Google Maps.
  // Es ideal para navegación GPS, ya que superpone tus líneas y pines sobre la App nativa de mapas.
  const viewerUrl = 'https://www.google.com/maps/d/viewer?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Intento de forzar modo satélite con parámetro &t=k 
  const finalIframeUrl = iframeUrl + '&t=k';

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
            backgroundColor: '#4285F4', // Azul de Google para diferenciarlo
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

        <a 
          href={editUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            backgroundColor: 'var(--primary)', // Verde de la app
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
          title="Editar Mapa en el Navegador"
        >
          <Pencil size={18} />
        </a>
      </div>

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
