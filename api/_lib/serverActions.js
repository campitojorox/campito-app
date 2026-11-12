// api/_lib/serverActions.js
// Ejecutores de calendario, finanzas y subida a Storage en servidor para api/chat-job.

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

export function matchEventFromList({ event_id, date, query, events = [] }) {
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

export async function uploadDataUrlToStorage(
  supabaseAdmin,
  dataUrl,
  prefix = 'chat-ia',
  fileNameHint = 'archivo.bin',
  fallbackMime = 'application/octet-stream'
) {
  if (!supabaseAdmin || !dataUrl) return null;
  try {
    const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1].split(';')[0].trim() || fallbackMime;
    const buffer = Buffer.from(match[2], 'base64');
    const ext = fileNameHint.includes('.') ? fileNameHint.split('.').pop() : mime.split('/')[1] || 'bin';
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

export async function executeServerCalendarActions(supabaseAdmin, actions = [], currentUser = 'Ariel') {
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
      const evResp =
        Array.isArray(d.responsibles) && d.responsibles.length > 0
          ? d.responsibles
          : d.responsibles
            ? [d.responsibles]
            : [currentUser || 'Ariel'];

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

export async function executeServerFinanceActions(
  supabaseAdmin,
  actions = [],
  attachment = null,
  currentUser = 'Ariel',
  attachments = null
) {
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
  const attList = Array.isArray(attachments) && attachments.length > 0
    ? attachments.filter(Boolean)
    : attachment
      ? [attachment]
      : [];
  const primaryUploadAtt =
    attList.find((a) => a?.dataUrl && (a.isImage || a.isPdf)) ||
    attList.find((a) => a?.dataUrl) ||
    null;
  const needsAttachment = actions.some((a) =>
    ['CREATE_TRANSACTION', 'UPDATE_TRANSACTION'].includes((a.type || '').toUpperCase())
  );
  if (needsAttachment && primaryUploadAtt?.dataUrl) {
    const up = await uploadDataUrlToStorage(
      supabaseAdmin,
      primaryUploadAtt.dataUrl,
      'comprobantes',
      primaryUploadAtt.name || 'justificante.jpg',
      primaryUploadAtt.type
    );
    uploadedImageUrl = up?.publicUrl || null;
  }

  for (const act of actions) {
    const type = (act.type || '').toUpperCase();
    if (type === 'CREATE_TRANSACTION') {
      const d = act.data || act;
      const lowerT = (d.type || '').toLowerCase();
      const normalizedType = ['retiro', 'ingreso', 'venta', 'cobro'].includes(lowerT) ? 'Retiro' : 'Gasto';
      const rawAmt = Math.abs(parseFloat(d.amount || 0));
      if (!rawAmt || Number.isNaN(rawAmt)) {
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
      const nextAbs =
        d.amount !== undefined ? Math.abs(parseFloat(d.amount)) : Math.abs(parseFloat(existing.amount));
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

