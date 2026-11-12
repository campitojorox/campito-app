// src/utils/exportTools.js
// Utilidades de exportación y descarga directa en EXCEL, PDF, KML y GeoJSON
// para el inventario y catastro georreferenciado de Campito Jorox.

// Carga diferida bajo demanda de jspdf y jspdf-autotable (~350 KB fuera del bundle inicial)
async function loadPdfLibraries() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
}

/**
 * Descarga un archivo Blob en el navegador con el nombre especificado.
 */
function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * 1. EXPORTACIÓN A EXCEL (.csv con BOM UTF-8 y enlaces Google Maps)
 * Soporta puntos de inventario y trazados de caminos/senderos.
 */
export function exportInventoryToExcel(items = [], paths = [], filename = null) {
  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_INVENTARIO_${dateStr}.csv`;

  const headers = [
    'Tipo Elemento',
    'ID',
    'Fecha Registro',
    'Nombre',
    'Categoría',
    'Variedad / Tipo Trazado',
    'Estado / Color',
    'Latitud / Vértices',
    'Longitud / Metros',
    'Precisión GPS (m)',
    'Altitud (m)',
    'Zona',
    'Alerta Dispersión GPS',
    'Enlace Google Maps',
    'Observaciones',
    'Registrado Por',
  ];

  const pointRows = (items || []).map((item) => {
    const lat = item.latitude || (item.coordenadas && item.coordenadas.lat) || '';
    const lng = item.longitude || (item.coordenadas && item.coordenadas.lng) || '';
    const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : '';

    return [
      'PUNTO',
      item.id || '',
      item.created_at ? item.created_at.split('T')[0] : dateStr,
      item.name || `${item.tipo || 'Elemento'} ${item.variedad || ''}`.trim(),
      item.category || item.tipo || 'arbol',
      item.variety_type || item.variedad || '',
      item.status || item.estado || 'saludable',
      lat,
      lng,
      item.accuracy_meters || item.accuracy_m || '',
      item.altitude_meters || item.altitude_m || '',
      item.zone || 'Finca Principal',
      (item.gps_warning || item.advertencia_gps) ? 'SÍ (>6m)' : 'OK',
      mapsLink,
      (item.notes || item.observaciones || '').replace(/"/g, '""'),
      item.user_name || 'Admin',
    ];
  });

  const pathRows = (paths || []).map((path) => {
    const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
    const firstCoord = coords[0] || {};
    const mapsLink = firstCoord.lat && firstCoord.lng ? `https://maps.google.com/?q=${firstCoord.lat},${firstCoord.lng}` : '';

    return [
      'TRAZADO / CAMINO',
      path.id || '',
      path.created_at ? path.created_at.split('T')[0] : dateStr,
      path.name || 'Camino / Sendero',
      path.path_type || 'camino',
      `${coords.length} vértices`,
      path.color || '#f97316',
      firstCoord.lat || '—',
      path.length_meters ? `${Number(path.length_meters).toFixed(1)}m` : '—',
      '—',
      '—',
      path.zone || 'Finca Principal',
      'OK',
      mapsLink,
      (path.notes || '').replace(/"/g, '""'),
      path.user_name || 'Admin',
    ];
  });

  const allRows = [...pointRows, ...pathRows];

  const csvContent = [
    headers.map((h) => `"${h}"`).join(';'),
    ...allRows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(';')
    ),
  ].join('\r\n');

  // UTF-8 BOM (\uFEFF) para que Excel lo abra con tildes y caracteres en español perfectos
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 2. EXPORTACIÓN A PDF (Membrete oficial, métricas y tabla con jspdf)
 */
export async function exportInventoryToPDF(items = [], paths = [], filename = null, title = 'CATASTRO E INVENTARIO AGRÍCOLA') {
  // Manejo de llamada con solo (items, filename) o (items, paths, filename)
  if (typeof paths === 'string') {
    filename = paths;
    paths = [];
  }

  const { jsPDF, autoTable } = await loadPdfLibraries();
  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_INVENTARIO_${dateStr}.pdf`;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Cabecera institucional
  doc.setFillColor(43, 61, 65); // #2b3d41
  doc.rect(0, 0, 297, 24, 'F');

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('CAMPITO JOROX', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 209, 218); // Teal claro
  doc.text(title.toUpperCase(), 14, 18);

  doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  doc.text(`Fecha de emisión: ${dateStr} | Puntos: ${(items || []).length} | Caminos/Líneas: ${(paths || []).length}`, 200, 15);

  // Resumen métrico
  const safeItems = items || [];
  const safePaths = paths || [];
  const countAguacates = safeItems.filter((i) => (i.category || i.tipo || '').toLowerCase().includes('aguacate')).length;
  const countRiego = safeItems.filter((i) => ['riego_linea', 'arqueta', 'acequia'].includes((i.category || i.tipo || '').toLowerCase())).length;
  const countClorosis = safeItems.filter((i) => (i.status || i.estado || '').toLowerCase() === 'clorosis').length;
  const countPoda = safeItems.filter((i) => (i.status || i.estado || '').toLowerCase() === 'poda_requerida').length;
  const totalMeters = safePaths.reduce((acc, p) => acc + (Number(p.length_meters) || 0), 0);

  doc.setFillColor(245, 248, 248);
  doc.rect(14, 28, 269, 13, 'F');
  doc.setDrawColor(210, 220, 220);
  doc.rect(14, 28, 269, 13, 'S');

  doc.setFontSize(8);
  doc.setTextColor(43, 61, 65);
  doc.setFont('helvetica', 'bold');
  doc.text(`MÉTRICAS:`, 18, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Árboles/Plantas: ${countAguacates || safeItems.length}  |  Riego: ${countRiego}  |  Clorosis: ${countClorosis}  |  Poda urgente: ${countPoda}  |  Caminos/Trazados: ${safePaths.length} (${totalMeters.toFixed(0)}m)`,
    38,
    36
  );

  // Columnas para autoTable
  const tableHeaders = [
    'Tipo',
    'Elemento / Nombre',
    'Variedad / Detalle',
    'Estado / Color',
    'Latitud / Inicio',
    'Longitud / Longitud (m)',
    'Precisión',
    'Observaciones de Campo',
  ];

  const pointRows = safeItems.map((item) => {
    const lat = item.latitude || (item.coordenadas && item.coordenadas.lat) || '—';
    const lng = item.longitude || (item.coordenadas && item.coordenadas.lng) || '—';
    const acc = item.accuracy_meters || item.accuracy_m ? `±${Number(item.accuracy_meters || item.accuracy_m).toFixed(1)}m` : '—';
    const hasWarn = item.gps_warning || item.advertencia_gps;

    return [
      'PUNTO',
      item.name || `${item.tipo || 'Árbol'}`,
      item.variety_type || item.variedad || '—',
      (item.status || item.estado || 'saludable').toUpperCase(),
      typeof lat === 'number' ? lat.toFixed(6) : String(lat),
      typeof lng === 'number' ? lng.toFixed(6) : String(lng),
      hasWarn ? '±>6m (DISP.)' : acc,
      (item.notes || item.observaciones || '').substring(0, 50),
    ];
  });

  const pathRows = safePaths.map((p) => {
    const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
    const firstCoord = coords[0] || {};
    return [
      'CAMINO',
      p.name || 'Camino / Trazado',
      `${p.path_type || 'sendero'} (${coords.length} pts)`,
      p.color || '#f97316',
      firstCoord.lat ? Number(firstCoord.lat).toFixed(6) : '—',
      p.length_meters ? `${Number(p.length_meters).toFixed(1)}m` : '—',
      'Línea trazada',
      (p.notes || '').substring(0, 50),
    ];
  });

  autoTable(doc, {
    startY: 45,
    head: [tableHeaders],
    body: [...pointRows, ...pathRows],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [0, 151, 157], // #00979d
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 42 },
      2: { cellWidth: 32 },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
      7: { cellWidth: 71 },
    },
    didDrawPage: () => {
      const str = `Página ${doc.internal.getNumberOfPages()} — Documento Confidencial de Gestión Interna Campito Jorox`;
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(str, 14, 202);
    },
  });

  doc.save(finalFilename);
  return finalFilename;
}

/**
 * Convierte color hex (#RRGGBB) a formato KML aabbggrr.
 */
function hexToKmlColor(hex, opacity = 'ff') {
  if (!hex || typeof hex !== 'string') return `${opacity}1673f9`;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return `${opacity}${b}${g}${r}`;
  }
  return `${opacity}1673f9`;
}

/**
 * 3. EXPORTACIÓN A KML (Compatible con Google Earth y Google My Maps)
 * Soporta Puntos (árboles, arquetas) y Líneas (caminos, senderos, líneas de riego).
 */
export function exportInventoryToKML(items = [], paths = [], filename = null) {
  if (typeof paths === 'string') {
    filename = paths;
    paths = [];
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_MAPA_${dateStr}.kml`;

  const validItems = (items || []).filter((i) => {
    const lat = i.latitude || (i.coordenadas && i.coordenadas.lat);
    const lng = i.longitude || (i.coordenadas && i.coordenadas.lng);
    return lat && lng;
  });

  // Estilos de puntos y líneas para My Maps
  const styles = `
    <Style id="punto-arbol">
      <IconStyle>
        <color>ff81b910</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="punto-riego">
      <IconStyle>
        <color>ffc78402</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="punto-acequia">
      <IconStyle>
        <color>ffd4b606</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>
  `;

  const pointPlacemarks = validItems.map((item) => {
    const lat = item.latitude || item.coordenadas.lat;
    const lng = item.longitude || item.coordenadas.lng;
    const alt = item.altitude_meters || item.altitude_m || 0;
    const name = item.name || `${item.tipo || 'Elemento'} ${item.variedad || ''}`.trim();
    const status = item.status || item.estado || 'saludable';
    const notes = item.notes || item.observaciones || '';
    const acc = item.accuracy_meters || item.accuracy_m || '';
    const cat = (item.category || item.tipo || 'arbol').toLowerCase();

    let styleUrl = '#punto-arbol';
    if (cat.includes('riego') || cat.includes('arqueta')) styleUrl = '#punto-riego';
    if (cat.includes('acequia')) styleUrl = '#punto-acequia';

    return `    <Placemark>
      <name><![CDATA[${name}]]></name>
      <styleUrl>${styleUrl}</styleUrl>
      <description><![CDATA[
        <p><b>Categoría:</b> ${cat}</p>
        <p><b>Variedad:</b> ${item.variety_type || item.variedad || 'N/A'}</p>
        <p><b>Estado:</b> ${status}</p>
        <p><b>Precisión GPS:</b> ±${acc}m</p>
        <p><b>Notas:</b> ${notes}</p>
      ]]></description>
      <Point>
        <coordinates>${lng},${lat},${alt}</coordinates>
      </Point>
    </Placemark>`;
  });

  const pathPlacemarks = (paths || []).map((path) => {
    const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
    if (coords.length < 2) return '';

    const kmlColor = hexToKmlColor(path.color || '#f97316', 'e6');
    const coordString = coords.map((c) => `${c.lng},${c.lat},${c.alt || 0}`).join(' ');

    return `    <Placemark>
      <name><![CDATA[${path.name || 'Camino / Sendero'}]]></name>
      <description><![CDATA[
        <p><b>Tipo:</b> ${path.path_type || 'camino'}</p>
        <p><b>Longitud aprox:</b> ${path.length_meters ? `${Number(path.length_meters).toFixed(1)} metros` : 'N/A'}</p>
        <p><b>Vértices:</b> ${coords.length}</p>
        <p><b>Notas:</b> ${path.notes || ''}</p>
      ]]></description>
      <Style>
        <LineStyle>
          <color>${kmlColor}</color>
          <width>${path.stroke_width || 4}</width>
        </LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordString}</coordinates>
      </LineString>
    </Placemark>`;
  }).filter(Boolean);

  const kmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Campito Jorox - Mapa y Catastro Satélite</name>
    <description>Puntos, árboles, arquetas y trazados de caminos/senderos georreferenciados.</description>
${styles}
    <Folder>
      <name>Puntos de Inventario (${pointPlacemarks.length})</name>
${pointPlacemarks.join('\n')}
    </Folder>
    <Folder>
      <name>Caminos y Senderos (${pathPlacemarks.length})</name>
${pathPlacemarks.join('\n')}
    </Folder>
  </Document>
</kml>`;

  const blob = new Blob([kmlTemplate], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 4. EXPORTACIÓN A GeoJSON ESTÁNDAR (RFC 7946)
 * Soporta geometrías Point y LineString.
 */
export function exportInventoryToGeoJSON(items = [], paths = [], filename = null) {
  if (typeof paths === 'string') {
    filename = paths;
    paths = [];
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_GEOJSON_${dateStr}.geojson`;

  const validItems = (items || []).filter((i) => {
    const lat = i.latitude || (i.coordenadas && i.coordenadas.lat);
    const lng = i.longitude || (i.coordenadas && i.coordenadas.lng);
    return lat && lng;
  });

  const pointFeatures = validItems.map((item) => {
    const lat = item.latitude || item.coordenadas.lat;
    const lng = item.longitude || item.coordenadas.lng;
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)],
      },
      properties: {
        id: item.id,
        entity_type: 'point',
        name: item.name || `${item.tipo || 'Elemento'} ${item.variedad || ''}`.trim(),
        category: item.category || item.tipo || 'arbol',
        variety: item.variety_type || item.variedad || null,
        status: item.status || item.estado || 'saludable',
        accuracy_meters: item.accuracy_meters || item.accuracy_m || null,
        gps_warning: Boolean(item.gps_warning || item.advertencia_gps),
        notes: item.notes || item.observaciones || '',
      },
    };
  });

  const pathFeatures = (paths || []).map((path) => {
    const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coords.map((c) => [Number(c.lng), Number(c.lat)]),
      },
      properties: {
        id: path.id,
        entity_type: 'path',
        name: path.name || 'Camino / Sendero',
        path_type: path.path_type || 'camino',
        color: path.color || '#f97316',
        stroke_width: path.stroke_width || 4,
        length_meters: path.length_meters || null,
        notes: path.notes || '',
      },
    };
  });

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      farm: 'Campito Jorox',
      total_points: pointFeatures.length,
      total_paths: pathFeatures.length,
    },
    features: [...pointFeatures, ...pathFeatures],
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 5. EXPORTACIÓN PERSONALIZADA A PDF DIRECTO DESDE EL CHAT
 */
export async function generateCustomPDF({
  title = 'INFORME CAMPITO JOROX',
  subtitle = null,
  content = '',
  table = null,
  filename = null,
}) {
  const { jsPDF, autoTable } = await loadPdfLibraries();
  const dateStr = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fileDate = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_INFORME_${fileDate}.pdf`;

  const doc = new jsPDF({
    orientation: table && table.headers && table.headers.length > 5 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Encabezado institucional
  doc.setFillColor(43, 61, 65); // #2b3d41
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Franja teal de acento
  doc.setFillColor(0, 151, 157); // #00979d
  doc.rect(0, 22, pageWidth, 2, 'F');

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('CAMPITO JOROX', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 209, 218); // Teal claro
  doc.text(String(title || 'INFORME OFICIAL').toUpperCase(), 14, 17);

  doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  doc.text(`Fecha: ${dateStr}`, pageWidth - 45, 14);

  let currentY = 32;

  // Subtítulo
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'italic');
    doc.text(subtitle, 14, currentY);
    currentY += 7;
  }

  // Contenido de texto
  if (content && typeof content === 'string' && content.trim().length > 0) {
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');

    const cleanContent = content
      .replace(/\[\[.*?\]\]/gs, '')
      .replace(/```.*?```/gs, '')
      .replace(/[#*`_]/g, '')
      .trim();

    const splitText = doc.splitTextToSize(cleanContent, pageWidth - 28);
    doc.text(splitText, 14, currentY);
    currentY += splitText.length * 5 + 6;
  }

  // Tabla estructurada si está presente
  if (table && Array.isArray(table.headers) && Array.isArray(table.rows) && table.rows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [table.headers],
      body: table.rows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [0, 151, 157],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {
        const str = `Página ${doc.internal.getNumberOfPages()} — Documento Confidencial Campito Jorox`;
        doc.setFontSize(7.5);
        doc.setTextColor(140);
        doc.text(str, 14, pageHeight - 8);
      },
    });
  } else {
    // Si no hubo tabla, agregar pie de página en la primera página
    const str = `Página 1 — Documento Confidencial Campito Jorox`;
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(str, 14, pageHeight - 8);
  }

  doc.save(finalFilename);
  return finalFilename;
}

/**
 * 6. EXPORTACIÓN PERSONALIZADA A EXCEL / CSV DIRECTO DESDE EL CHAT
 */
export function generateCustomExcel({
  title = null,
  headers = [],
  rows = [],
  content = '',
  filename = null,
}) {
  const fileDate = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_EXPORT_${fileDate}.csv`;

  let csvRows = [];

  if (title) {
    csvRows.push([`"CAMPITO JOROX - ${title.replace(/"/g, '""')}"`]);
    csvRows.push([`"Fecha: ${fileDate}"`]);
    csvRows.push([]);
  }

  if (headers && headers.length > 0) {
    csvRows.push(headers.map((h) => `"${String(h ?? '').replace(/"/g, '""')}"`));
  }

  if (rows && rows.length > 0) {
    rows.forEach((row) => {
      const formattedRow = (Array.isArray(row) ? row : Object.values(row)).map((cell) =>
        `"${String(cell ?? '').replace(/"/g, '""')}"`
      );
      csvRows.push(formattedRow);
    });
  } else if (content) {
    content.split('\n').forEach((line) => {
      csvRows.push([`"${line.replace(/"/g, '""')}"`]);
    });
  }

  const csvContent = csvRows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 7. EXPORTACIÓN PERSONALIZADA A TXT DIRECTO DESDE EL CHAT
 */
export function generateCustomTXT({
  title = null,
  content = '',
  filename = null,
}) {
  const fileDate = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_NOTAS_${fileDate}.txt`;

  let fullText = '';
  if (title) {
    fullText += `===============================================\n`;
    fullText += `CAMPITO JOROX — ${title}\n`;
    fullText += `Fecha: ${new Date().toLocaleString('es-ES')}\n`;
    fullText += `===============================================\n\n`;
  }
  fullText += content || '';

  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 8. EXPORTACIÓN PERSONALIZADA A XML / KML DIRECTO DESDE EL CHAT
 */
function generateCustomXML({
  title = null,
  content = '',
  filename = null,
}) {
  const fileDate = new Date().toISOString().split('T')[0];
  const isKml = filename && filename.toLowerCase().endsWith('.kml');
  const finalFilename = filename || `CAMPITO_JOROX_${fileDate}.${isKml ? 'kml' : 'xml'}`;

  let xmlContent = (content || '').trim();

  if (!xmlContent.startsWith('<?xml') && !xmlContent.startsWith('<')) {
    xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<campitoJorox>
  <metadata>
    <titulo>${title || 'Exportación'}</titulo>
    <fecha>${fileDate}</fecha>
  </metadata>
  <datos><![CDATA[${xmlContent}]]></datos>
</campitoJorox>`;
  } else if (!xmlContent.startsWith('<?xml')) {
    xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;
  }

  const mimeType = isKml
    ? 'application/vnd.google-earth.kml+xml;charset=utf-8;'
    : 'application/xml;charset=utf-8;';

  const blob = new Blob([xmlContent], { type: mimeType });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 9. ENRUTADOR UNIVERSAL DE DESCARGA DIRECTA
 */
export function generateCustomFile(exportData) {
  if (!exportData) return;
  const rawType = (exportData.type || exportData.format || 'txt').toLowerCase();

  if (rawType === 'pdf') {
    return generateCustomPDF(exportData);
  } else if (rawType === 'excel' || rawType === 'csv' || rawType === 'xlsx') {
    const headers = exportData.table?.headers || exportData.headers || [];
    const rows = exportData.table?.rows || exportData.rows || [];
    return generateCustomExcel({
      title: exportData.title,
      headers,
      rows,
      content: exportData.content,
      filename: exportData.filename,
    });
  } else if (rawType === 'xml' || rawType === 'kml') {
    return generateCustomXML(exportData);
  } else if (rawType === 'json' || rawType === 'geojson') {
    const filename = exportData.filename || `CAMPITO_JOROX_${new Date().toISOString().split('T')[0]}.json`;
    const jsonStr = typeof exportData.content === 'object'
      ? JSON.stringify(exportData.content, null, 2)
      : (exportData.content || JSON.stringify(exportData, null, 2));
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    triggerFileDownload(blob, filename);
    return filename;
  } else {
    return generateCustomTXT(exportData);
  }
}

/**
 * 10. EXTRAER TABLA DE TEXTO MARKDOWN A FORMATO { headers, rows }
 */
export function extractTableFromMarkdown(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));

  if (lines.length < 2) return null;

  const parseRow = (line) =>
    line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim().replace(/[*`_]/g, ''));

  const headers = parseRow(lines[0]);
  if (!headers || headers.length === 0) return null;

  const dataLines = lines.slice(1).filter((l) => {
    const stripped = l.replace(/[|\s-:]/g, '');
    return stripped.length > 0;
  });

  const rows = dataLines.map(parseRow);
  if (rows.length === 0) return null;

  return { headers, rows };
}
