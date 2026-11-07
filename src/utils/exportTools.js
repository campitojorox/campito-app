// src/utils/exportTools.js
// Utilidades de exportación y descarga directa en EXCEL, PDF, KML y GeoJSON
// para el inventario y catastro georreferenciado de Campito Jorox.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Descarga un archivo Blob en el navegador con el nombre especificado.
 */
export function triggerFileDownload(blob, filename) {
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
 */
export function exportInventoryToExcel(items = [], filename = null) {
  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_INVENTARIO_${dateStr}.csv`;

  const headers = [
    'ID',
    'Fecha Registro',
    'Nombre',
    'Categoría',
    'Variedad',
    'Estado Fitosanitario',
    'Latitud',
    'Longitud',
    'Precisión GPS (m)',
    'Altitud (m)',
    'Zona',
    'Alerta Dispersión GPS',
    'Enlace Google Maps',
    'Observaciones',
    'Registrado Por',
  ];

  const rows = items.map((item) => {
    const lat = item.latitude || (item.coordenadas && item.coordenadas.lat) || '';
    const lng = item.longitude || (item.coordenadas && item.coordenadas.lng) || '';
    const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : '';

    return [
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

  const csvContent = [
    headers.map((h) => `"${h}"`).join(';'),
    ...rows.map((row) =>
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
export function exportInventoryToPDF(items = [], filename = null, title = 'CATASTRO E INVENTARIO AGRÍCOLA') {
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
  doc.text(`Fecha de emisión: ${dateStr} | Total registros: ${items.length}`, 220, 15);

  // Resumen métrico
  const countAguacates = items.filter((i) => (i.category || i.tipo || '').toLowerCase().includes('aguacate')).length;
  const countRiego = items.filter((i) => ['riego_linea', 'arqueta', 'acequia'].includes((i.category || i.tipo || '').toLowerCase())).length;
  const countClorosis = items.filter((i) => (i.status || i.estado || '').toLowerCase() === 'clorosis').length;
  const countPoda = items.filter((i) => (i.status || i.estado || '').toLowerCase() === 'poda_requerida').length;

  doc.setFillColor(245, 248, 248);
  doc.rect(14, 28, 269, 12, 'F');
  doc.setDrawColor(210, 220, 220);
  doc.rect(14, 28, 269, 12, 'S');

  doc.setFontSize(8);
  doc.setTextColor(43, 61, 65);
  doc.setFont('helvetica', 'bold');
  doc.text(`MÉTRICAS:`, 18, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(`Árboles/Plantas: ${countAguacates || items.length}  |  Infraestructura Riego: ${countRiego}  |  Clorosis/Falta hierro: ${countClorosis}  |  Poda urgente: ${countPoda}`, 40, 35);

  // Columnas para autoTable
  const tableHeaders = [
    'Elemento / Especie',
    'Variedad',
    'Estado',
    'Latitud',
    'Longitud',
    'Precisión',
    'Alerta GPS',
    'Observaciones de Campo',
  ];

  const tableRows = items.map((item) => {
    const lat = item.latitude || (item.coordenadas && item.coordenadas.lat) || '—';
    const lng = item.longitude || (item.coordenadas && item.coordenadas.lng) || '—';
    const acc = item.accuracy_meters || item.accuracy_m ? `±${Number(item.accuracy_meters || item.accuracy_m).toFixed(1)}m` : '—';
    const hasWarn = item.gps_warning || item.advertencia_gps;

    return [
      item.name || `${item.tipo || 'Árbol'}`,
      item.variety_type || item.variedad || '—',
      (item.status || item.estado || 'saludable').toUpperCase(),
      typeof lat === 'number' ? lat.toFixed(6) : String(lat),
      typeof lng === 'number' ? lng.toFixed(6) : String(lng),
      acc,
      hasWarn ? 'DISPERSIÓN (>6m)' : 'OK (Preciso)',
      (item.notes || item.observaciones || '').substring(0, 60),
    ];
  });

  autoTable(doc, {
    startY: 44,
    head: [tableHeaders],
    body: tableRows,
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
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 28, halign: 'center' },
      7: { cellWidth: 75 },
    },
    didDrawPage: (data) => {
      // Pie de página
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
 * 3. EXPORTACIÓN A KML (Compatible con Google Earth y Google My Maps)
 */
export function exportInventoryToKML(items = [], filename = null) {
  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_MAPA_${dateStr}.kml`;

  const validItems = items.filter((i) => {
    const lat = i.latitude || (i.coordenadas && i.coordenadas.lat);
    const lng = i.longitude || (i.coordenadas && i.coordenadas.lng);
    return lat && lng;
  });

  const placemarks = validItems.map((item) => {
    const lat = item.latitude || item.coordenadas.lat;
    const lng = item.longitude || item.coordenadas.lng;
    const alt = item.altitude_meters || item.altitude_m || 0;
    const name = item.name || `${item.tipo || 'Elemento'} ${item.variedad || ''}`.trim();
    const status = item.status || item.estado || 'saludable';
    const notes = item.notes || item.observaciones || '';
    const acc = item.accuracy_meters || item.accuracy_m || '';

    return `    <Placemark>
      <name><![CDATA[${name}]]></name>
      <description><![CDATA[
        <p><b>Categoría:</b> ${item.category || item.tipo || 'arbol'}</p>
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

  const kmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Campito Jorox - Inventario y Catastro Agrícola</name>
    <description>Puntos georreferenciados mediante sistema de voz y GPS en tiempo real.</description>
${placemarks.join('\n')}
  </Document>
</kml>`;

  const blob = new Blob([kmlTemplate], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}

/**
 * 4. EXPORTACIÓN A GeoJSON ESTÁNDAR (RFC 7946)
 */
export function exportInventoryToGeoJSON(items = [], filename = null) {
  const dateStr = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `CAMPITO_JOROX_GEOJSON_${dateStr}.geojson`;

  const validItems = items.filter((i) => {
    const lat = i.latitude || (i.coordenadas && i.coordenadas.lat);
    const lng = i.longitude || (i.coordenadas && i.coordenadas.lng);
    return lat && lng;
  });

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      farm: 'Campito Jorox',
      total_features: validItems.length,
    },
    features: validItems.map((item) => {
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
          name: item.name || `${item.tipo || 'Elemento'} ${item.variedad || ''}`.trim(),
          category: item.category || item.tipo || 'arbol',
          variety: item.variety_type || item.variedad || null,
          status: item.status || item.estado || 'saludable',
          accuracy_meters: item.accuracy_meters || item.accuracy_m || null,
          gps_warning: Boolean(item.gps_warning || item.advertencia_gps),
          notes: item.notes || item.observaciones || '',
        },
      };
    }),
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json;charset=utf-8;' });
  triggerFileDownload(blob, finalFilename);
  return finalFilename;
}
