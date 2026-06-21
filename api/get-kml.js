export default async function handler(req, res) {
  // Configurar encabezados CORS para permitir llamadas desde el frontend
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // ID del mapa de Google My Maps del usuario
    const mapId = '1ZotmxWNQzkVPwYvhOcV881raekp78jM';
    // forcekml=1 es crucial para obtener KML puro y no KMZ (zip)
    const url = `https://www.google.com/maps/d/kml?mid=${mapId}&forcekml=1`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch KML from Google My Maps: ${response.statusText}`);
    }
    
    const kmlText = await response.text();
    
    // Devolver el XML nativo
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(kmlText);
  } catch (error) {
    console.error('Error en el proxy de KML:', error);
    res.status(500).json({ error: error.message });
  }
}
