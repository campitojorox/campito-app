// api/chat-job.js — Procesador Asíncrono en Segundo Plano (Background Jobs) para Chat IA
// Permite que las generaciones de Gemini sobrevivan cambios de vista y recargas de página.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectModelsForRequest, callGeminiCascade } from './_lib/geminiCascade.js';
import {
  uploadDataUrlToStorage,
  executeServerCalendarActions,
  executeServerFinanceActions,
} from './_lib/serverActions.js';

const JOBS_FILE_PATH = path.join('/tmp', 'campito_ai_jobs.json');
const MAX_STORED_JOBS = 40;

function getJobsMap() {
  if (!globalThis.__campitoAiJobs) {
    globalThis.__campitoAiJobs = new Map();
    try {
      if (fs.existsSync(JOBS_FILE_PATH)) {
        const raw = fs.readFileSync(JOBS_FILE_PATH, 'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const j of arr) {
            if (j && j.jobId) globalThis.__campitoAiJobs.set(j.jobId, j);
          }
        }
      }
    } catch {
      // Ignorar si /tmp no tiene historial válido
    }
  }
  return globalThis.__campitoAiJobs;
}

function flushJobsToFile() {
  try {
    const map = getJobsMap();
    const list = Array.from(map.values())
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_STORED_JOBS);

    map.clear();
    for (const j of list) map.set(j.jobId, j);

    fs.writeFileSync(JOBS_FILE_PATH, JSON.stringify(list), 'utf8');
  } catch {
    // Ignorar errores de escritura temporal
  }
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function syncJobToSupabase(supabaseAdmin, job) {
  if (!supabaseAdmin || !job) return;
  try {
    await supabaseAdmin.from('ai_jobs').upsert({
      id: job.jobId,
      section: job.section,
      status: job.status,
      acknowledged: Boolean(job.acknowledged),
      actions_applied: Boolean(job.actionsApplied),
      persisted_to_db: Boolean(job.persistedToDb),
      user_id: job.userMeta?.userId || null,
      result: job.result || null,
      error: job.error || null,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Tabla ai_jobs es opcional; fallback a memoria y /tmp
  }
}

async function loadJobFromSupabase(supabaseAdmin, jobId) {
  if (!supabaseAdmin || !jobId) return null;
  try {
    const { data, error } = await supabaseAdmin.from('ai_jobs').select('*').eq('id', jobId).single();
    if (error || !data) return null;
    return {
      jobId: data.id,
      section: data.section,
      status: data.status,
      acknowledged: data.acknowledged,
      actionsApplied: data.actions_applied,
      persistedToDb: data.persisted_to_db,
      result: data.result,
      error: data.error,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  } catch {
    return null;
  }
}

function saveJob(job, supabaseAdmin = null) {
  const map = getJobsMap();
  job.updatedAt = Date.now();
  map.set(job.jobId, job);
  flushJobsToFile();
  if (supabaseAdmin) {
    syncJobToSupabase(supabaseAdmin, job).catch(() => {});
  }
}

function parseJsonResponse(rawText, fallbackTitle) {
  const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanJson);
  } catch {
    const m = cleanJson.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { title: fallbackTitle, summary: rawText, actions: [] };
  }
}

async function processAiJob(jobId, body) {
  const supabaseAdmin = getSupabaseAdmin();
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const map = getJobsMap();
  const job = map.get(jobId);
  if (!job) return;

  try {
    if (!apiKey) throw new Error('API Key de Gemini no configurada en el servidor');

    const {
      section,
      prompt,
      systemInstruction,
      history,
      attachment,
      audio,
      models,
      responseMimeType,
      userMeta,
      meta,
      persistToChatHistory,
    } = body;

    const selectedModels = selectModelsForRequest({ models, prompt, attachment, audio });

    const { rawText, modelUsed } = await callGeminiCascade({
      prompt,
      systemInstruction,
      history,
      attachment,
      audio,
      models: selectedModels,
      responseMimeType,
      apiKey,
    });

    if (section === 'calendario') {
      const parsed = parseJsonResponse(rawText, 'Calendario IA');
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const exec = await executeServerCalendarActions(supabaseAdmin, actions, userMeta?.userName || 'Ariel');
      const serverAppliedCal =
        actions.length === 0 ||
        Boolean(
          supabaseAdmin &&
            ((exec.addedEvents?.length || 0) + (exec.updatedEvents?.length || 0) + (exec.deletedIds?.length || 0) >
              0 ||
              (exec.errors?.length || 0) > 0)
        );

      job.status = 'completed';
      job.actionsApplied = serverAppliedCal;
      job.result = { ...parsed, exec, modelUsed };
      saveJob(job, supabaseAdmin);
      return;
    }

    if (section === 'gasto-ingreso') {
      const parsed = parseJsonResponse(rawText, 'Contabilidad IA');
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const exec = await executeServerFinanceActions(
        supabaseAdmin,
        actions,
        attachment,
        userMeta?.userName || 'Ariel'
      );
      const serverAppliedFin =
        actions.length === 0 ||
        Boolean(
          supabaseAdmin &&
            ((exec.addedTransactions?.length || 0) +
              (exec.updatedTransactions?.length || 0) +
              (exec.deletedIds?.length || 0) +
              (exec.restoredIds?.length || 0) >
              0 ||
              (exec.errors?.length || 0) > 0)
        );

      job.status = 'completed';
      job.actionsApplied = serverAppliedFin;
      job.result = { ...parsed, exec, modelUsed };
      saveJob(job, supabaseAdmin);
      return;
    }

    if (section === 'chat-ia') {
      let displayedContent = rawText;
      let learnedMemory = null;
      let eventsChanged = false;
      let txChanged = false;
      let hasPendingClientActions = false;
      const exportFiles = [];

      const memMatch = rawText.match(/\[\[MEMORIA:\s*(\{[\s\S]*?\})\s*\]\]/i);
      if (memMatch) {
        try {
          learnedMemory = JSON.parse(memMatch[1]);
          displayedContent = displayedContent.replace(memMatch[0], '').trim();
          if (supabaseAdmin && learnedMemory?.content) {
            await supabaseAdmin.from('farm_knowledge').insert({
              category: learnedMemory.category || 'general',
              title: learnedMemory.title || 'Dato aprendido',
              content: learnedMemory.content,
              source: 'chat',
              user_id: userMeta?.userId || null,
              user_name: userMeta?.userName || 'Admin',
              is_active: true,
            });
          }
        } catch {
          // ignore
        }
      }

      const evMatches = [...rawText.matchAll(/\[\[CREAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      for (const evMatch of evMatches) {
        try {
          const evData = JSON.parse(evMatch[1]);
          displayedContent = displayedContent.replace(evMatch[0], '').trim();
          if (supabaseAdmin) {
            const evExec = await executeServerCalendarActions(
              supabaseAdmin,
              [{ type: 'CREATE_EVENT', data: evData }],
              userMeta?.userName
            );
            if ((evExec.addedEvents?.length || 0) > 0) eventsChanged = true;
            else hasPendingClientActions = true;
          } else {
            hasPendingClientActions = true;
          }
        } catch {
          // ignore
        }
      }

      const delMatches = [...rawText.matchAll(/\[\[(?:BORRAR_EVENTO|ELIMINAR_EVENTO):\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      for (const dm of delMatches) {
        try {
          const delData = JSON.parse(dm[1]);
          displayedContent = displayedContent.replace(dm[0], '').trim();
          if (supabaseAdmin) {
            const delExec = await executeServerCalendarActions(supabaseAdmin, [
              {
                type: 'DELETE_EVENT',
                event_id: delData.event_id || delData.id,
                date: delData.date,
                query: delData.query || delData.info || delData.category || delData.description,
              },
            ]);
            if ((delExec.deletedIds?.length || 0) > 0) eventsChanged = true;
            else hasPendingClientActions = true;
          } else {
            hasPendingClientActions = true;
          }
        } catch {
          // ignore
        }
      }

      const txMatches = [...rawText.matchAll(/\[\[CREAR_TRANSACCION:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      for (const txMatch of txMatches) {
        try {
          const txData = JSON.parse(txMatch[1]);
          displayedContent = displayedContent.replace(txMatch[0], '').trim();
          if (supabaseAdmin) {
            const txExec = await executeServerFinanceActions(
              supabaseAdmin,
              [{ type: 'CREATE_TRANSACTION', data: txData }],
              null,
              userMeta?.userName
            );
            if ((txExec.addedTransactions?.length || 0) > 0) txChanged = true;
            else hasPendingClientActions = true;
          } else {
            hasPendingClientActions = true;
          }
        } catch {
          // ignore
        }
      }

      const exportMatches = [...rawText.matchAll(/\[\[EXPORTAR_ARCHIVO:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      for (const em of exportMatches) {
        try {
          exportFiles.push(JSON.parse(em[1]));
          displayedContent = displayedContent.replace(em[0], '').trim();
        } catch {
          // ignore
        }
      }

      displayedContent = displayedContent
        .replace(/\[\[REGISTRAR_PUNTOS:\s*(\[[\s\S]*?\])\s*\]\]/gi, '')
        .replace(/\[\[REGISTRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[BORRAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[REGISTRAR_CAMINO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[EDITAR_PUNTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[CREAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[BORRAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[ELIMINAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .replace(/\[\[CREAR_TRANSACCION:\s*(\{[\s\S]*?\})\s*\]\]/gi, '')
        .trim();

      let persistedToDb = false;
      if (persistToChatHistory && supabaseAdmin) {
        try {
          let uploadedUrl = null;
          let uploadedPath = null;
          if (attachment?.dataUrl) {
            const up = await uploadDataUrlToStorage(
              supabaseAdmin,
              attachment.dataUrl,
              'chat-ia',
              attachment.name || 'adjunto',
              attachment.type
            );
            uploadedUrl = up?.publicUrl || null;
            uploadedPath = up?.storagePath || null;
          } else if (audio?.dataUrl) {
            const ext = audio.mimeType?.includes('mp4')
              ? 'm4a'
              : audio.mimeType?.includes('ogg')
                ? 'ogg'
                : 'webm';
            const up = await uploadDataUrlToStorage(
              supabaseAdmin,
              audio.dataUrl,
              'chat-ia',
              `audio.${ext}`,
              audio.mimeType || 'audio/webm'
            );
            uploadedUrl = up?.publicUrl || null;
            uploadedPath = up?.storagePath || null;
          }

          const gpsLabel = meta?.gpsLabel || '';
          const userContent =
            (prompt ||
              (attachment
                ? `[Archivo adjunto: ${attachment.name}]`
                : audio
                  ? `[Audio grabado: ${audio.duration || 1}s]`
                  : '')) + gpsLabel;

          await supabaseAdmin.from('chat_history').insert({
            role: 'user',
            content: userContent,
            file_url: uploadedUrl,
            file_name: uploadedPath,
            user_id: userMeta?.userId || null,
            user_name: userMeta?.userName || 'Admin',
            model_used: null,
          });

          await supabaseAdmin.from('chat_history').insert({
            role: 'assistant',
            content: displayedContent,
            file_url: null,
            file_name: null,
            user_id: userMeta?.userId || null,
            user_name: 'Asistente IA',
            model_used: modelUsed,
          });

          persistedToDb = true;
        } catch (dbErr) {
          console.warn('[api/chat-job] Error guardando chat_history:', dbErr.message);
        }
      }

      job.status = 'completed';
      job.actionsApplied = !hasPendingClientActions;
      job.persistedToDb = persistedToDb;
      job.result = {
        rawText,
        displayedContent,
        learnedMemory,
        exportFiles,
        modelUsed,
        eventsChanged,
        txChanged,
      };
      saveJob(job, supabaseAdmin);
      return;
    }

    job.status = 'completed';
    job.actionsApplied = false;
    job.result = { rawText, modelUsed };
    saveJob(job, supabaseAdmin);
  } catch (err) {
    console.error(`[api/chat-job] Error en job ${jobId}:`, err);
    job.status = 'error';
    job.error = err.message || 'Error ejecutando consulta IA en segundo plano';
    saveJob(job, supabaseAdmin);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PATCH');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (req.method === 'POST') {
    const body = req.body || {};
    const jobId = body.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const section = body.section || 'chat-ia';

    const job = {
      jobId,
      section,
      status: 'processing',
      acknowledged: false,
      actionsApplied: false,
      persistedToDb: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userMeta: body.userMeta || null,
      result: null,
      error: null,
    };

    saveJob(job, supabaseAdmin);
    const bgPromise = processAiJob(jobId, body);

    try {
      const vercelFns = await import('@vercel/functions').catch(() => null);
      if (vercelFns && typeof vercelFns.waitUntil === 'function') {
        vercelFns.waitUntil(bgPromise);
      } else if (typeof res.waitUntil === 'function') {
        res.waitUntil(bgPromise);
      }
    } catch {
      // En entorno Node local la promesa sigue ejecutándose de forma natural
    }

    return res.status(202).json({
      success: true,
      jobId,
      status: 'processing',
      job,
    });
  }

  if (req.method === 'GET') {
    const query = req.query || {};
    const jobId = query.id || query.jobId;
    const section = query.section;
    const map = getJobsMap();

    if (jobId) {
      let job = map.get(jobId) || null;
      if (!job && supabaseAdmin) {
        job = await loadJobFromSupabase(supabaseAdmin, jobId);
        if (job) map.set(jobId, job);
      }
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job no encontrado' });
      }
      return res.status(200).json({ success: true, job });
    }

    let list = Array.from(map.values());
    if (section) {
      list = list.filter((j) => j.section === section);
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return res.status(200).json({ success: true, jobs: list.slice(0, 20) });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const jobId = body.jobId || body.id;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Falta jobId' });
    }

    const map = getJobsMap();
    let job = map.get(jobId);
    if (!job && supabaseAdmin) {
      job = await loadJobFromSupabase(supabaseAdmin, jobId);
    }
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job no encontrado' });
    }

    if (typeof body.acknowledged === 'boolean') job.acknowledged = body.acknowledged;
    if (typeof body.actionsApplied === 'boolean') job.actionsApplied = body.actionsApplied;
    saveJob(job, supabaseAdmin);

    return res.status(200).json({ success: true, job });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
