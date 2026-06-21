import React, { useState, useEffect } from 'react';
import { Pencil, Navigation, Copy, X, Crosshair } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import L from 'leaflet';

// Componente para manejar el punto de GPS y el botón de centrar
function GpsTracker() {
  const [position, setPosition] = useState(null);
  const map = useMap();

  useEffect(() => {
    // Pedir ubicación constantemente
    map.locate({ watch: true, enableHighAccuracy: true });
    
    map.on('locationfound', (e) => {
      setPosition(e.latlng);
    });

    map.on('locationerror', (e) => {
      console.warn("GPS Error:", e.message);
    });
  }, [map]);

  return (
    <>
      {position && (
        <L.circleMarker 
          center={position} 
          pathOptions={{ color: 'white', fillColor: '#4285F4', fillOpacity: 1, weight: 2 }} 
          radius={7} 
        />
      )}
      
      <button 
        onClick={() => {
          if (position) {
            map.flyTo(position, 16);
          } else {
            map.locate({ setView: true, enableHighAccuracy: true });
          }
        }}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          cursor: 'pointer'
        }}
        title="Centrar en mi ubicación"
      >
        <Crosshair size={24} color="#666" />
      </button>
    </>
  );
}

// Convertir GeoJSON points a Leaflet Layers
const pointToLayer = (feature, latlng) => {
  return L.circleMarker(latlng, {
    radius: 6,
    fillColor: feature.properties['marker-color'] || '#ff0000',
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.8
  });
};

// Estilos de las líneas extraídos del KML
const featureStyle = (feature) => {
  return {
    color: feature.properties.stroke || '#ff0000',
    weight: feature.properties['stroke-width'] || 3,
    opacity: feature.properties['stroke-opacity'] || 1,
    fillColor: feature.properties.fill || '#ff0000',
    fillOpacity: feature.properties['fill-opacity'] || 0.2,
  };
};

export default function Mapas() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Link de edición
  const editUrl = 'https://www.google.com/maps/d/u/1/edit?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';
  
  // Link del visor nativo (Navigation)
  const viewerUrl = 'https://www.google.com/maps/d/viewer?mid=1ZotmxWNQzkVPwYvhOcV881raekp78jM';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editUrl);
    alert('¡Enlace copiado! Pégalo en Safari o Chrome.');
  };

  useEffect(() => {
    const fetchKML = async () => {
      try {
        setLoading(true);
        // Llamamos a nuestro proxy interno en Vercel
        const response = await fetch('/api/get-kml');
        if (!response.ok) throw new Error("Error al descargar KML");
        const kmlText = await response.text();
        
        // Convertir KML a GeoJSON
        const parser = new DOMParser();
        const kmlDom = parser.parseFromString(kmlText, 'text/xml');
        const converted = kml(kmlDom);
        
        setGeoData(converted);
      } catch (err) {
        console.error("Error loading KML", err);
      } finally {
        setLoading(false);
      }
    };
    fetchKML();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Contenedor de botones flotantes (Opciones de My Maps) */}
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
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)'
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
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)'
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
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}>
          <p>Sincronizando capas topográficas...</p>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%' }}>
          <MapContainer 
            center={[36.758913, -4.869032]} // Centro por defecto (Campito Jorox)
            zoom={13} 
            style={{ width: '100%', height: '100%', zIndex: 1 }}
            zoomControl={false} // Desactivamos el zoom por defecto para moverlo
          >
            {/* Capa de Satélite de Alta Resolución de Esri (Gratuita) */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
            />
            
            {/* Dibujar las líneas y polígonos del KML */}
            {geoData && (
              <GeoJSON 
                data={geoData} 
                style={featureStyle} 
                pointToLayer={pointToLayer} 
              />
            )}

            {/* Radar GPS y Punto Azul */}
            <GpsTracker />
          </MapContainer>
        </div>
      )}
    </div>
  );
}
