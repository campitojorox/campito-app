// api/events.js — API Serverless para Gestión y Borrado de Eventos
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function getSupabaseClient() {
  if (!url || !serviceKey) {
    throw new Error('Faltan credenciales de Supabase en variables de entorno.');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabaseAdmin = getSupabaseClient();

    // ─── 1. BORRADO VÍA MÉTODO DELETE O POST CON ACTION 'DELETE' ─────────────
    if (req.method === 'DELETE' || (req.method === 'POST' && req.body?.action === 'DELETE')) {
      const body = req.body || {};
      const queryParams = req.query || {};
      const eventId = body.event_id || body.id || queryParams.event_id || queryParams.id;
      const targetDate = body.date || queryParams.date;
      const queryStr = body.query || queryParams.query;

      let idToDelete = eventId;

      // Si no tenemos ID directo pero tenemos fecha o texto de búsqueda, buscar en base de datos
      if (!idToDelete && (targetDate || queryStr)) {
        let dbQuery = supabaseAdmin.from('events').select('*');
        if (targetDate) {
          const cleanDate = targetDate.toString().split('T')[0];
          dbQuery = dbQuery.gte('date', `${cleanDate}T00:00:00Z`).lte('date', `${cleanDate}T23:59:59Z`);
        }
        const { data: candidates, error: findErr } = await dbQuery;
        if (!findErr && candidates && candidates.length > 0) {
          if (queryStr) {
            const token = queryStr.toLowerCase();
            const matched = candidates.find((c) =>
              (c.category && c.category.toLowerCase().includes(token)) ||
              (c.info && c.info.toLowerCase().includes(token)) ||
              (c.responsibles && JSON.stringify(c.responsibles).toLowerCase().includes(token))
            );
            if (matched) idToDelete = matched.id;
          }
          if (!idToDelete && candidates.length === 1) {
            idToDelete = candidates[0].id;
          }
        }
      }

      if (!idToDelete) {
        return res.status(404).json({
          success: false,
          error: 'No se pudo identificar el evento a eliminar. Proporciona event_id o fecha/query precisos.',
        });
      }

      const { data: deletedRow, error: delErr } = await supabaseAdmin
        .from('events')
        .delete()
        .eq('id', idToDelete)
        .select()
        .single();

      if (delErr) {
        return res.status(500).json({ success: false, error: delErr.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Evento eliminado correctamente del calendario.',
        deletedId: idToDelete,
        deletedEvent: deletedRow || { id: idToDelete },
      });
    }

    // ─── 2. CREACIÓN VÍA POST (ACTION 'CREATE' O INSERT DIRECTO) ──────────────
    if (req.method === 'POST') {
      const { event } = req.body || {};
      if (!event) {
        return res.status(400).json({ success: false, error: 'Faltan datos del evento.' });
      }
      const { data: newRow, error: insErr } = await supabaseAdmin
        .from('events')
        .insert(event)
        .select()
        .single();

      if (insErr) {
        return res.status(500).json({ success: false, error: insErr.message });
      }

      return res.status(201).json({
        success: true,
        message: 'Evento creado correctamente.',
        event: newRow,
      });
    }

    // ─── 3. CONSULTA VÍA GET ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('events')
        .select('*')
        .order('date', { ascending: true });

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, events: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/events] Error en API de eventos:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

