import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({ error: 'Faltan credenciales de Supabase en el servidor.' });
  }

  const supabase = createClient(url, key);

  try {
    const [txRes, evRes, chatRes, knowledgeRes, inventoryRes, pathsRes] = await Promise.all([
      supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }),
      supabase.from('events').select('*, profiles:responsible_id(name)').order('date', { ascending: false }),
      supabase.from('chat_history').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('farm_knowledge').select('*').order('created_at', { ascending: false }),
      supabase.from('farm_inventory').select('*').order('created_at', { ascending: false }),
      supabase.from('farm_paths').select('*').order('created_at', { ascending: false })
    ]);

    if (txRes.error) throw txRes.error;
    if (evRes.error) throw evRes.error;

    const contabilidad = (txRes.data || []).map(tx => ({
      TransactionID: tx.id,
      Date: tx.date ? tx.date.split('T')[0] : '',
      User: tx.profiles?.name || '',
      Category: tx.type || '',
      Value: Math.abs(tx.amount || 0),
      Amount: tx.amount || 0,
      Description: tx.description || '',
      UserID: tx.user_id || '',
      Imagen: tx.image_url || '',
      Estado: tx.status || 'ACTIVE',
      FechaEliminado: tx.deleted_at || ''
    }));

    const calendario = (evRes.data || []).map(ev => {
      const responsiblesStr = (ev.responsibles && ev.responsibles.length > 0)
        ? ev.responsibles.join(', ')
        : (ev.profiles?.name || '');
      return {
        EventID: ev.id,
        Date: ev.date ? ev.date.split('T')[0] : '',
        EndDate: ev.end_date ? ev.end_date.split('T')[0] : (ev.date ? ev.date.split('T')[0] : ''),
        StartTime: ev.start_time || '',
        EndTime: ev.end_time || '',
        Responsible: responsiblesStr,
        Category: ev.category || '',
        Info: ev.info || '',
        CalendarID: 'campitojorox@gmail.com'
      };
    });

    const chat_ia = (chatRes.data || []).map(msg => ({
      MessageID: msg.id,
      Fecha: msg.created_at ? msg.created_at.split('T')[0] : '',
      Hora: msg.created_at ? msg.created_at.split('T')[1]?.substring(0, 8) : '',
      Usuario: msg.user_name || 'Admin',
      Rol: msg.role || 'user',
      Mensaje: msg.content || '',
      ModeloIA: msg.model_used || '',
      ArchivoURL: msg.file_url || '',
      ArchivoNombre: msg.file_name || ''
    }));

    const memoria_finca = (knowledgeRes.data || []).map(k => ({
      ID: k.id,
      Fecha: k.created_at ? k.created_at.split('T')[0] : '',
      Categoria: k.category || 'general',
      Titulo: k.title || '',
      Contenido: k.content || '',
      Usuario: k.user_name || 'Admin',
      Origen: k.source || 'chat',
      Activo: k.is_active ? 'SI' : 'NO'
    }));

    const inventario_gps = (inventoryRes?.data || []).map(inv => ({
      ID: inv.id,
      Fecha: inv.created_at ? inv.created_at.split('T')[0] : '',
      Nombre: inv.name || '',
      Categoria: inv.category || 'arbol',
      Variedad: inv.variety_type || '',
      Latitud: inv.latitude || '',
      Longitud: inv.longitude || '',
      Precision_m: inv.accuracy_meters || '',
      Altitud_m: inv.altitude_meters || '',
      Zona: inv.zone || '',
      Estado: inv.status || 'saludable',
      AlertaGPS: inv.gps_warning ? 'SI' : 'NO',
      FotoURL: inv.image_url || '',
      Notas: inv.notes || '',
      EnlaceGoogleMaps: (inv.latitude && inv.longitude) ? `https://maps.google.com/?q=${inv.latitude},${inv.longitude}` : '',
      Activo: inv.is_active ? 'SI' : 'NO'
    }));

    const caminos_senderos = (pathsRes?.data || []).map(p => {
      const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
      return {
        ID: p.id,
        Fecha: p.created_at ? p.created_at.split('T')[0] : '',
        Nombre: p.name || '',
        Tipo: p.path_type || 'camino',
        Color: p.color || '#f97316',
        Grosor: p.stroke_width || 4,
        Longitud_m: p.length_meters || '',
        NumVertices: coords.length,
        Zona: p.zone || '',
        Notas: p.notes || '',
        Activo: p.is_active ? 'SI' : 'NO'
      };
    });

    const format = req.query.format || 'json';

    if (format === 'csv') {
      const table = (req.query.table || 'contabilidad').toLowerCase();
      let rows = contabilidad;
      if (table === 'calendario') rows = calendario;
      if (table === 'chat_ia' || table === 'chat') rows = chat_ia;
      if (table === 'memoria' || table === 'farm_knowledge' || table === 'conocimiento') rows = memoria_finca;
      if (table === 'inventario' || table === 'farm_inventory' || table === 'arboles' || table === 'gps') rows = inventario_gps;
      if (table === 'caminos' || table === 'senderos' || table === 'farm_paths' || table === 'rutas') rows = caminos_senderos;

      if (rows.length === 0) {
        return res.send('');
      }
      const headers = Object.keys(rows[0]);
      const csvLines = [headers.join(',')];
      for (const row of rows) {
        const line = headers.map(h => {
          let val = (row[h] === null || row[h] === undefined) ? '' : String(row[h]);
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',');
        csvLines.push(line);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="CAMPITO_JOROX_${table.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.status(200).send(csvLines.join('\n'));
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        contabilidad: contabilidad.length,
        calendario: calendario.length,
        chat_ia: chat_ia.length,
        memoria_finca: memoria_finca.length,
        inventario_gps: inventario_gps.length,
        caminos_senderos: caminos_senderos.length
      },
      data: {
        contabilidad,
        calendario,
        chat_ia,
        memoria_finca,
        inventario_gps,
        caminos_senderos
      }
    });
  } catch (err) {
    console.error('Error en backup:', err);
    return res.status(500).json({ error: err.message });
  }
}
