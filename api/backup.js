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
    const [txRes, evRes] = await Promise.all([
      supabase.from('transactions').select('*, profiles(name)').order('date', { ascending: false }),
      supabase.from('events').select('*, profiles:responsible_id(name)').order('date', { ascending: false })
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
      Imagen: tx.image_url || ''
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

    const format = req.query.format || 'json';

    if (format === 'csv') {
      const table = req.query.table || 'contabilidad';
      const rows = table === 'calendario' ? calendario : contabilidad;
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
        calendario: calendario.length
      },
      data: {
        contabilidad,
        calendario
      }
    });
  } catch (err) {
    console.error('Error en backup:', err);
    return res.status(500).json({ error: err.message });
  }
}
