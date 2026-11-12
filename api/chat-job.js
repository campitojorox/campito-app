// api/chat-job.js — Procesador Asíncrono en Segundo Plano (Background Jobs) para Chat IA
// Permite que las generaciones de Gemini sobrevivan cambios de vista y recargas de página.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const JOBS_FILE_PATH = path.join('/tmp', 'campito_ai_jobs.json');
const MAX_STORED_JOBS = 40;

const DEFAULT_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

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

    // Mantener solo los últimos MAX_STORED_JOBS en memoria también
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
    const { data, error } = await supabaseAdmin
      .from('ai_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
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

function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  return str;
}

function matchEventFromList({ event_id, date, query, events = [] }) {
  if (!events || events.length === 0) return null;
  if (event_id !== undefined && event_id !== null && event_id !== '') {
    const exact = events.find((e) => String(e.id) === String(event_id).trim());
    if (exact) return exact;
  }
  const targetDate = normalizeDate(date);
  const normQ = normalizeText(query);
  const tokens = normQ.split(/\s+/).filter((t) => t.length > 2);

  let best = null;
  let bestScore = -1;
  for (const ev of events) {
    let score = 0;
    const evDate = normalizeDate(ev.date);
    if (targetDate) {
      score += evDate === targetDate ? 15 : -20;
    }
    const combined = normalizeText(
      `${ev.category || ''} ${ev.info || ''} ${Array.isArray(ev.responsibles) ? ev.responsibles.join(' ') : ''}`
    );
    if (normQ && combined.includes(normQ)) score += 10;
    for (const tk of tokens) {
      if (combined.includes(tk)) score += 5;
    }
    if (score > bestScore && score > 0) {
      bestScore = score;
      best = ev;
    }
  }
  return best;
}

async function uploadDataUrlToStorage(supabaseAdmin, dataUrl, prefix = 'chat-ia', fileNameHint = 'archivo.bin', fallbackMime = 'application/octet-stream') {
  if (!supabaseAdmin || !dataUrl) return null;
  try {
    const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1].split(';')[0].trim() || fallbackMime;
    const buffer = Buffer.from(match[2], 'base64');
    const ext = fileNameHint.includes('.') ? fileNameHint.split('.').pop() : (mime.split('/')[1] || 'bin');
    const storagePath = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from('comprobantes')
      .upload(storagePath, buffer, { contentType: mime });
    if (error) return null;
    const { data: pubData } = supabaseAdmin.storage.from('comprobantes').getPublicUrl(storagePath);
    return { publicUrl: pubData?.publicUrl || null, storagePath };
  } catch {
    return null;
  }
}

/**
 * Llama a Gemini REST API con cascada de modelos
 */
async function callGeminiCascade({
  prompt,
  systemInstruction,
  history = [],
  attachment = null,
  audio = null,
  models = DEFAULT_MODELS,
  responseMimeType = null,
  apiKey,
}) {
  const contents = [];

  if (Array.isArray(history) && history.length > 0) {
    for (const msg of history) {
      const contentText = msg.content || '';
      if (!contentText.trim()) continue;
      contents.push({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: contentText }],
      });
    }
  }

  const userParts = [];
  if (prompt && prompt.trim()) {
    userParts.push({ text: prompt.trim() });
  }

  if (attachment) {
    if (attachment.textContent) {
      userParts.push({
        text: `\n\n📄 **CONTENIDO DEL ARCHIVO ADJUNTO ("${attachment.name || 'documento'}")**:\n\`\`\`\n${attachment.textContent}\n\`\`\`\n`,
      });
    }
    if (attachment.dataUrl) {
      const match = attachment.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
      if (match) {
        const cleanMime = match[1].toLowerCase().trim();
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({ inlineData: { mimeType: cleanMime, data: match[2] } });
        }
      }
    }
  }

  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
    if (match) {
      userParts.push({ inlineData: { mimeType: match[1].toLowerCase().trim(), data: match[2] } });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({ inlineData: { mimeType: cleanMime, data: cleanBase64 } });
    }
  }

  if (userParts.length === 0) {
    userParts.push({ text: 'Analiza la solicitud y responde.' });
  }

  contents.push({ role: 'user', parts: userParts });

  const generationConfig = { temperature: 0.25 };
  if (responseMimeType) {
    generationConfig.response_mime_type = responseMimeType;
  }

  const payload = {
    contents,
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig,
  };

  let lastError = null;
  const cascade = Array.isArray(models) && models.length > 0 ? models : DEFAULT_MODELS;

  for (const modelId of cascade) {
    try {
      const controller = new AbortController();
      const timeoutMs = audio || attachment ? 45000 : 25000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error?.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.isQuota = res.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted');
        throw err;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Respuesta vacía del modelo');

      return { rawText: text, modelUsed: modelId };
    } catch (err) {
      console.warn(`[api/chat-job] Falló ${modelId}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Todos los modelos de Gemini fallaron');
}

/**
 * Ejecuta acciones del Calendario directamente en Supabase para que el cambio persista incluso tras recarga
 */
async function executeServerCalendarActions(supabaseAdmin, actions = [], currentUser = 'Ariel') {
  const addedEvents = [];
  const updatedEvents = [];
  const deletedIds = [];
  const reverts = [];
  const errors = [];

  if (!supabaseAdmin || actions.length === 0) {
    return { addedEvents, updatedEvents, deletedIds, reverts, errors };
  }

  const { data: allEvents } = await supabaseAdmin.from('events').select('*');
  const rawEvents = allEvents || [];

  for (const act of actions) {
    const type = (act.type || '').toUpperCase();
    if (type === 'CREATE_EVENT') {
      const d = act.data || act;
      const evDate = d.date ? `${d.date.split('T')[0]}T00:00:00Z` : new Date().toISOString();
      const evEndDate = d.end_date ? `${d.end_date.split('T')[0]}T00:00:00Z` : evDate;
      const evStartTime = d.start_time ? `${d.start_time.substring(0, 5)}:00` : '08:00:00';
      const evEndTime = d.end_time ? `${d.end_time.substring(0, 5)}:00` : '09:00:00';
      const evResp = Array.isArray(d.responsibles) && d.responsibles.length > 0
        ? d.responsibles
        : (d.responsibles ? [d.responsibles] : [currentUser || 'Ariel']);

      const { data: created, error } = await supabaseAdmin
        .from('events')
        .insert({
          date: evDate,
          end_date: evEndDate,
          start_time: evStartTime,
          end_time: evEndTime,
          category: d.category || 'RIEGO - La Nana',
          responsibles: evResp,
          info: d.info || 'Programado con Chat IA',
        })
        .select()
        .single();

      if (!error && created) {
        addedEvents.push(created);
        reverts.push({ type: 'DELETE_EVENT', id: created.id });
      } else {
        errors.push(error?.message || 'Error creando evento');
      }
    } else if (type === 'UPDATE_EVENT') {
      const target = matchEventFromList({
        event_id: act.event_id || act.id,
        date: act.date,
        query: act.query,
        events: rawEvents,
      });
      if (!target) {
        errors.push('No se encontró el evento a modificar.');
        continue;
      }
      const d = act.data || {};
      const prevData = {
        date: target.date,
        end_date: target.end_date,
        start_time: target.start_time,
        end_time: target.end_time,
        category: target.category,
        responsibles: target.responsibles,
        info: target.info,
      };
      const upd = {};
      if (d.date) upd.date = `${d.date.split('T')[0]}T00:00:00Z`;
      if (d.end_date) upd.end_date = `${d.end_date.split('T')[0]}T00:00:00Z`;
      if (d.start_time) upd.start_time = `${d.start_time.substring(0, 5)}:00`;
      if (d.end_time) upd.end_time = `${d.end_time.substring(0, 5)}:00`;
      if (d.category) upd.category = d.category;
      if (d.responsibles) upd.responsibles = Array.isArray(d.responsibles) ? d.responsibles : [d.responsibles];
      if (d.info !== undefined) upd.info = d.info;

      const { data: updated, error } = await supabaseAdmin
        .from('events')
        .update(upd)
        .eq('id', target.id)
        .select()
        .single();

      if (!error && updated) {
        updatedEvents.push(updated);
        reverts.push({ type: 'RESTORE_EVENT', id: target.id, prevData });
      } else {
        errors.push(error?.message || 'Error actualizando evento');
      }
    } else if (type === 'DELETE_EVENT') {
      const target = matchEventFromList({
        event_id: act.event_id || act.id,
        date: act.date,
        query: act.query,
        events: rawEvents,
      });
      if (!target) {
        errors.push('No se encontró el evento a eliminar.');
        continue;
      }
      const { error } = await supabaseAdmin.from('events').delete().eq('id', target.id);
      if (!error) {
        deletedIds.push(target.id);
        const rest = { ...target };
        delete rest.id;
        delete rest.created_at;
        reverts.push({ type: 'INSERT_EVENT', eventData: rest });
      } else {
        errors.push(error.message);
      }
    }
  }

  return { addedEvents, updatedEvents, deletedIds, reverts, errors };
}

/**
 * Ejecuta acciones de Contabilidad / Transacciones directamente en Supabase
 */
async function executeServerFinanceActions(supabaseAdmin, actions = [], attachment = null, currentUser = 'Ariel') {
  const addedTransactions = [];
  const updatedTransactions = [];
  const deletedIds = [];
  const restoredIds = [];
  const reverts = [];
  const errors = [];

  if (!supabaseAdmin || actions.length === 0) {
    return { addedTransactions, updatedTransactions, deletedIds, restoredIds, reverts, errors };
  }

  const [{ data: usersData }, { data: txData }] = await Promise.all([
    supabaseAdmin.from('profiles').select('*'),
    supabaseAdmin.from('transactions').select('*, profiles(name)').order('date', { ascending: false }).limit(200),
  ]);
  const users = usersData || [];
  const records = txData || [];

  const resolveUserObj = (name) => {
    const target = (name || currentUser || '').toLowerCase().trim();
    return (
      users.find((u) => (u.name || '').toLowerCase().trim() === target) ||
      users.find((u) => (u.name || '').toLowerCase().includes(target)) ||
      users[0] ||
      null
    );
  };

  let uploadedImageUrl = null;
  const needsAttachment = actions.some((a) => ['CREATE_TRANSACTION', 'UPDATE_TRANSACTION'].includes((a.type || '').toUpperCase()));
  if (needsAttachment && attachment?.dataUrl) {
    const up = await uploadDataUrlToStorage(supabaseAdmin, attachment.dataUrl, 'comprobantes', attachment.name || 'justificante.jpg', attachment.type);
    uploadedImageUrl = up?.publicUrl || null;
  }

  for (const act of actions) {
    const type = (act.type || '').toUpperCase();
    if (type === 'CREATE_TRANSACTION') {
      const d = act.data || act;
      const lowerT = (d.type || '').toLowerCase();
      const normalizedType = ['retiro', 'ingreso', 'venta', 'cobro'].includes(lowerT) ? 'Retiro' : 'Gasto';
      const rawAmt = Math.abs(parseFloat(d.amount || 0));
      if (!rawAmt || isNaN(rawAmt)) {
        errors.push('Importe inválido en la transacción.');
        continue;
      }
      const finalAmt = normalizedType === 'Retiro' ? -rawAmt : rawAmt;
      const matchedUser = resolveUserObj(d.user);
      const todayIso = new Date().toISOString().split('T')[0];
      const datePart = d.date ? d.date.toString().split('T')[0] : null;
      const txDate = !datePart || datePart === todayIso ? new Date().toISOString() : `${datePart}T12:00:00Z`;

      const { data: created, error } = await supabaseAdmin
        .from('transactions')
        .insert([
          {
            date: txDate,
            user_id: matchedUser ? matchedUser.id : null,
            type: normalizedType,
            amount: finalAmt,
            description: (d.description || 'Registrado desde Chat IA').trim(),
            image_url: uploadedImageUrl,
            status: 'ACTIVE',
          },
        ])
        .select('*, profiles(name)')
        .single();

      if (!error && created) {
        addedTransactions.push(created);
        reverts.push({ type: 'HARD_DELETE_TX', id: created.id });
      } else {
        errors.push(error?.message || 'Error creando transacción');
      }
    } else if (type === 'UPDATE_TRANSACTION') {
      const existing = records.find((r) => String(r.id) === String(act.transaction_id || act.id));
      if (!existing) {
        errors.push('No se encontró la transacción a actualizar.');
        continue;
      }
      const d = act.data || {};
      const prevData = {
        type: existing.type,
        amount: existing.amount,
        description: existing.description,
        user_id: existing.user_id,
      };
      const lowerT = (d.type || existing.type || '').toLowerCase();
      const nextType = ['retiro', 'ingreso', 'venta', 'cobro'].includes(lowerT) ? 'Retiro' : 'Gasto';
      const nextAbs = d.amount !== undefined ? Math.abs(parseFloat(d.amount)) : Math.abs(parseFloat(existing.amount));
      const nextAmt = nextType === 'Retiro' ? -nextAbs : nextAbs;
      const nextUser = d.user ? resolveUserObj(d.user) : null;

      const upd = {
        type: nextType,
        amount: nextAmt,
        description: d.description !== undefined ? d.description.trim() : existing.description,
        user_id: nextUser ? nextUser.id : existing.user_id,
      };
      if (uploadedImageUrl) upd.image_url = uploadedImageUrl;

      const { data: updated, error } = await supabaseAdmin
        .from('transactions')
        .update(upd)
        .eq('id', existing.id)
        .select('*, profiles(name)')
        .single();

      if (!error && updated) {
        updatedTransactions.push(updated);
        reverts.push({ type: 'RESTORE_TX_FIELDS', id: existing.id, prevData });
      } else {
        errors.push(error?.message || 'Error actualizando transacción');
      }
    } else if (type === 'DELETE_TRANSACTION') {
      let targetId = act.transaction_id || act.id;
      if (!targetId && act.query) {
        const q = act.query.toLowerCase();
        const found = records.find(
          (r) =>
            (r.status || 'ACTIVE') === 'ACTIVE' &&
            ((r.description && r.description.toLowerCase().includes(q)) ||
              (r.profiles?.name && r.profiles.name.toLowerCase().includes(q)))
        );
        if (found) targetId = found.id;
      }
      if (!targetId) {
        errors.push('No se encontró la transacción a eliminar.');
        continue;
      }
      const { error } = await supabaseAdmin
        .from('transactions')
        .update({ status: 'DELETED', deleted_at: new Date().toISOString() })
        .eq('id', targetId);
      if (!error) {
        deletedIds.push(targetId);
        reverts.push({ type: 'RESTORE_TX_STATUS', id: targetId });
      } else {
        errors.push(error.message);
      }
    } else if (type === 'RESTORE_TRANSACTION') {
      const targetId = act.transaction_id || act.id;
      if (!targetId) continue;
      const { error } = await supabaseAdmin
        .from('transactions')
        .update({ status: 'ACTIVE', deleted_at: null })
        .eq('id', targetId);
      if (!error) {
        restoredIds.push(targetId);
        reverts.push({ type: 'SOFT_DELETE_TX', id: targetId });
      } else {
        errors.push(error.message);
      }
    }
  }

  return { addedTransactions, updatedTransactions, deletedIds, restoredIds, reverts, errors };
}

/**
 * Procesador asíncrono principal del Background Job
 */
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

    const { rawText, modelUsed } = await callGeminiCascade({
      prompt,
      systemInstruction,
      history,
      attachment,
      audio,
      models,
      responseMimeType,
      apiKey,
    });

    if (section === 'calendario') {
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const m = cleanJson.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { title: 'Calendario IA', summary: rawText, actions: [] };
      }

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const exec = await executeServerCalendarActions(supabaseAdmin, actions, userMeta?.userName || 'Ariel');
      const serverAppliedCal =
        actions.length === 0 ||
        Boolean(
          supabaseAdmin &&
            ((exec.addedEvents?.length || 0) + (exec.updatedEvents?.length || 0) + (exec.deletedIds?.length || 0) > 0 ||
              (exec.errors?.length || 0) > 0)
        );

      job.status = 'completed';
      job.actionsApplied = serverAppliedCal;
      job.result = { ...parsed, exec, modelUsed };
      saveJob(job, supabaseAdmin);
      return;
    }

    if (section === 'gasto-ingreso') {
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const m = cleanJson.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { title: 'Contabilidad IA', summary: rawText, actions: [] };
      }

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

      // 1. Memoria
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

      // 2. Crear evento(s)
      const evMatches = [...rawText.matchAll(/\[\[CREAR_EVENTO:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      if (evMatches.length > 0) {
        for (const evMatch of evMatches) {
          try {
            const evData = JSON.parse(evMatch[1]);
            displayedContent = displayedContent.replace(evMatch[0], '').trim();
            if (supabaseAdmin) {
              const evExec = await executeServerCalendarActions(supabaseAdmin, [{ type: 'CREATE_EVENT', data: evData }], userMeta?.userName);
              if ((evExec.addedEvents?.length || 0) > 0) eventsChanged = true;
              else hasPendingClientActions = true;
            } else {
              hasPendingClientActions = true;
            }
          } catch {
            // ignore
          }
        }
      }

      // 3. Borrar evento(s)
      const delMatches = [...rawText.matchAll(/\[\[(?:BORRAR_EVENTO|ELIMINAR_EVENTO):\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      if (delMatches.length > 0) {
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
      }

      // 4. Crear transacción(es)
      const txMatches = [...rawText.matchAll(/\[\[CREAR_TRANSACCION:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      if (txMatches.length > 0) {
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
      }

      // 5. Exportaciones
      const exportMatches = [...rawText.matchAll(/\[\[EXPORTAR_ARCHIVO:\s*(\{[\s\S]*?\})\s*\]\]/gi)];
      for (const em of exportMatches) {
        try {
          exportFiles.push(JSON.parse(em[1]));
          displayedContent = displayedContent.replace(em[0], '').trim();
        } catch {
          // ignore
        }
      }

      // Limpieza de etiquetas estructuradas del texto visible (las de inventario se procesan en cliente con GPS)
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
            const up = await uploadDataUrlToStorage(supabaseAdmin, attachment.dataUrl, 'chat-ia', attachment.name || 'adjunto', attachment.type);
            uploadedUrl = up?.publicUrl || null;
            uploadedPath = up?.storagePath || null;
          } else if (audio?.dataUrl) {
            const ext = audio.mimeType?.includes('mp4') ? 'm4a' : (audio.mimeType?.includes('ogg') ? 'ogg' : 'webm');
            const up = await uploadDataUrlToStorage(supabaseAdmin, audio.dataUrl, 'chat-ia', `audio.${ext}`, audio.mimeType || 'audio/webm');
            uploadedUrl = up?.publicUrl || null;
            uploadedPath = up?.storagePath || null;
          }

          const gpsLabel = meta?.gpsLabel || '';
          const userContent =
            (prompt || (attachment ? `[Archivo adjunto: ${attachment.name}]` : audio ? `[Audio grabado: ${audio.duration || 1}s]` : '')) +
            gpsLabel;

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

    // Sección 'mapas' o genérica
    job.status = 'completed';
    job.actionsApplied = false; // Mapas aplica interpolación GPS y pila Undo en cliente
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

    // En Vercel Serverless usar waitUntil si está disponible para mantener la función viva tras responder 202
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
