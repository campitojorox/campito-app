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
    const [txRes, evRes, chatRes, knowledgeRes] = await Promise.all([
      supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }),
      supabase.from('events').select('*, profiles:responsible_id(name)').order('date', { ascending: false }),
      supabase.from('chat_history').select('*').order('created_at', { ascending: false }).limit(2000).catch(() => ({ data: [] })),
      supabase.from('farm_knowledge').select('*').order('created_at', { ascending: false }).catch(() => ({ data: [] }))
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

    const format = req.query.format || 'json';

    if (format === 'csv') {
      const table = (req.query.table || 'contabilidad').toLowerCase();
      let rows = contabilidad;
      if (table === 'calendario') rows = calendario;
      if (table === 'chat_ia' || table === 'chat') rows = chat_ia;
      if (table === 'memoria' || table === 'farm_knowledge' || table === 'conocimiento') rows = memoria_finca;

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
        memoria_finca: memoria_finca.length
      },
      data: {
        contabilidad,
        calendario,
        chat_ia,
        memoria_finca
      }
    });
  } catch (err) {
    console.error('Error en backup:', err);
    return res.status(500).json({ error: err.message });
  }
}
