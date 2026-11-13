// api/farm-sync.js
// Endpoint Serverless administrativo para sincronización bidireccional y resiliente
// de puntos de inventario y recorridos de Campito Jorox en Supabase.
// Utiliza SUPABASE_SERVICE_ROLE_KEY para evitar bloqueos por RLS o falta de políticas anon.

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://byyqdtcuutfnjdlaewsu.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!url || !key) return null;
  return createClient(url, key, {
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
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
  }

  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Faltan credenciales de administración de Supabase en el servidor.' });
  }

  const { action, payload, id, batch } = req.body || {};

  try {
    switch (action) {
      case 'INSERT_INVENTORY': {
        if (!payload) return res.status(400).json({ error: 'Falta payload de inventario.' });
        const { data, error } = await supabaseAdmin.from('farm_inventory').upsert([payload]).select().single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      case 'UPDATE_INVENTORY': {
        if (!id || !payload) return res.status(400).json({ error: 'Falta id o payload para actualizar inventario.' });
        const { data, error } = await supabaseAdmin
          .from('farm_inventory')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      case 'DELETE_INVENTORY': {
        if (!id) return res.status(400).json({ error: 'Falta id para eliminar inventario.' });
        const now = new Date().toISOString();
        await supabaseAdmin.from('farm_inventory').update({ is_active: false, updated_at: now }).eq('id', id);
        const { error } = await supabaseAdmin.from('farm_inventory').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'INSERT_PATH': {
        if (!payload) return res.status(400).json({ error: 'Falta payload de camino.' });
        const { data, error } = await supabaseAdmin.from('farm_paths').upsert([payload]).select().single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      case 'UPDATE_PATH': {
        if (!id || !payload) return res.status(400).json({ error: 'Falta id o payload para actualizar camino.' });
        const { data, error } = await supabaseAdmin
          .from('farm_paths')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      case 'DELETE_PATH': {
        if (!id) return res.status(400).json({ error: 'Falta id para eliminar camino.' });
        const now = new Date().toISOString();
        await supabaseAdmin.from('farm_paths').update({ is_active: false, updated_at: now }).eq('id', id);
        const { error } = await supabaseAdmin.from('farm_paths').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'SYNC_BATCH': {
        const results = { inventory: [], paths: [] };
        if (Array.isArray(batch?.inventory) && batch.inventory.length > 0) {
          const { data: invData, error: invErr } = await supabaseAdmin
            .from('farm_inventory')
            .upsert(batch.inventory)
            .select();
          if (invErr) console.warn('[farm-sync] Error batch inventario:', invErr);
          else results.inventory = invData;
        }

        if (Array.isArray(batch?.paths) && batch.paths.length > 0) {
          const { data: pathData, error: pathErr } = await supabaseAdmin
            .from('farm_paths')
            .upsert(batch.paths)
            .select();
          if (pathErr) console.warn('[farm-sync] Error batch caminos:', pathErr);
          else results.paths = pathData;
        }

        return res.status(200).json({ success: true, results });
      }

      case 'INSERT_DOCUMENT': {
        if (!payload) return res.status(400).json({ error: 'Falta payload de documento.' });
        const { data, error } = await supabaseAdmin.from('farm_documents').upsert([payload]).select().single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      case 'DELETE_DOCUMENT': {
        if (!id) return res.status(400).json({ error: 'Falta id para eliminar documento.' });
        await supabaseAdmin.from('farm_document_chunks').delete().eq('document_id', id);
        const { error } = await supabaseAdmin.from('farm_documents').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'FETCH_DOCUMENTS': {
        const { data, error } = await supabaseAdmin
          .from('farm_documents')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` });
    }
  } catch (err) {
    console.error('[farm-sync] Error ejecutando acción:', action, err);
    return res.status(500).json({ error: err.message || 'Error interno en sincronización de finca.' });
  }
}
