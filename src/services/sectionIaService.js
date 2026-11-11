// src/services/sectionIaService.js
// Orquestador especializado de Chat IA para las secciones de Calendario y Gasto-Venta.
// Ejecuta consultas, altas, ediciones y borrados en Supabase y prepara respuestas
// estructuradas para mostrarse en el formato exacto de cada sección.

import { supabase } from '../supabaseClient.js';
import { createCalendarEvent, deleteCalendarEvent, findEventToMatch } from './calendarService.js';

const GEMINI_MODELS_CASCADE = [
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

/**
 * Carga conocimiento permanente de la finca ('farm_knowledge') de forma segura
 */
export async function loadFarmKnowledgeSafe() {
  try {
    const { data, error } = await supabase
      .from('farm_knowledge')
      .select('category, title, content')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error && Array.isArray(data)) return data;
  } catch {
    // Fallback offline silencioso
  }
  return [];
}

/**
 * Normaliza tipo de transacción al esquema oficial de Supabase ('Gasto' o 'Retiro')
 */
function normalizeTxType(rawType) {
  const lower = (rawType || '').toString().toLowerCase().trim();
  if (['retiro', 'ingreso', 'venta', 'cobro'].includes(lower)) return 'Retiro';
  return 'Gasto';
}

/**
 * Resuelve el usuario correspondiente dentro del catálogo de socios
 */
function resolveUser(userName, users = []) {
  if (!userName || !Array.isArray(users) || users.length === 0) return null;
  const target = userName.toString().toLowerCase().trim();
  return (
    users.find((u) => (u.name || '').toLowerCase().trim() === target) ||
    users.find((u) => (u.name || '').toLowerCase().includes(target)) ||
    null
  );
}

/**
 * Construye la instrucción de sistema específica para cada sección
 */
export function buildSectionSystemInstruction(section, contextData = {}, knowledge = []) {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const todayHuman = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const knowledgeText =
    knowledge.length > 0
      ? `\n\n🧠 **REGLAS Y CONOCIMIENTO DE CAMPITO JOROX**:\n${knowledge
          .map((k) => `- [${(k.category || 'general').toUpperCase()}] ${k.title}: ${k.content}`)
          .join('\n')}`
      : '';

  const usersList = (contextData.users || []).map((u) => u.name).filter(Boolean);

  if (section === 'calendario') {
    const rawEvents = contextData.events || [];
    const selectedDateIso = contextData.selectedDateIso || todayIso;

    const eventsSnapshot = rawEvents.map((ev) => ({
      id: ev.id,
      date: ev.date ? ev.date.split('T')[0] : null,
      end_date: ev.end_date ? ev.end_date.split('T')[0] : null,
      start_time: ev.start_time ? ev.start_time.substring(0, 5) : null,
      end_time: ev.end_time ? ev.end_time.substring(0, 5) : null,
      category: ev.category,
      responsibles: ev.responsibles || [],
      info: ev.info || '',
    }));

    return `Eres el Asistente IA de la sección **CALENDARIO** de Campito Jorox.
Hoy es: ${todayHuman} (${todayIso}).
Fecha seleccionada actualmente en el calendario: ${selectedDateIso}.
Usuario activo: ${contextData.currentUser || 'Socio'}.
Socios / Responsables disponibles: ${JSON.stringify(usersList)}.

Eventos actuales en base de datos (${eventsSnapshot.length}):
${JSON.stringify(eventsSnapshot)}
${knowledgeText}

TU MISIÓN:
Interpreta mensajes de texto, notas de voz o archivos/fotos adjuntos y responde SIEMPRE en formato JSON estricto para ejecutar acciones en el calendario o entregar resultados visuales en formato de eventos del calendario.

CATEGORÍAS OFICIALES DEL CALENDARIO:
- "RIEGO - La Nana"
- "RIEGO - El Moro"
- "MANTENIMIENTO - Poda"
- "MANTENIMIENTO - Limpieza"
- "MANTENIMIENTO - Fertilizado"
- "MANTENIMIENTO - Fitosanitarios"
- "OTRO"

REGLAS DE OPERACIÓN:
1. Si te piden CREAR o PROGRAMAR uno o más turnos/eventos: genera acciones "CREATE_EVENT". Usa fechas YYYY-MM-DD y horas HH:MM. Si no indican responsable, asigna ["${contextData.currentUser || 'Ariel'}"]. Si no indican hora, usa "08:00" a "09:00".
2. Si te piden EDITAR o CAMBIAR un evento existente: genera "UPDATE_EVENT" con su "event_id" y los campos modificados en "data".
3. Si te piden BORRAR, ELIMINAR o CANCELAR un evento: genera "DELETE_EVENT" con su "event_id" (y/o "date" y "query").
4. Si te hacen una CONSULTA o BÚSQUEDA (ej: "¿cuándo regamos?", "¿qué eventos tiene Mauro?", "¿qué hay esta semana?", "muéstrame las podas"):
   - Responde de forma concisa en "summary".
   - Incluye en "matched_event_ids" TODOS los IDs exactos de los eventos que responden a la consulta para mostrarlos en la tabla de resultados.
5. Si creas o editas eventos, indica "highlight_date" con la fecha principal (YYYY-MM-DD) para enfocar el calendario.

ESQUEMA JSON OBLIGATORIO DE RESPUESTA:
{
  "title": "Título corto del resultado (ej: 'Turnos de Riego', 'Evento programado', 'Evento eliminado')",
  "summary": "Resumen claro y conciso en español",
  "transcription": "Transcripción del audio si hubo nota de voz (o null)",
  "actions": [
    {
      "type": "CREATE_EVENT" | "UPDATE_EVENT" | "DELETE_EVENT",
      "event_id": "id exacto si es UPDATE_EVENT o DELETE_EVENT",
      "date": "YYYY-MM-DD si aplica",
      "query": "palabras clave si aplica para DELETE_EVENT",
      "data": {
        "date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "start_time": "HH:MM",
        "end_time": "HH:MM",
        "category": "RIEGO - La Nana",
        "responsibles": ["Ariel"],
        "info": "Notas adicionales"
      }
    }
  ],
  "matched_event_ids": ["id1", "id2"],
  "highlight_date": "YYYY-MM-DD o null"
}`;
  }

  // Sección 'gasto-ingreso'
  const records = contextData.records || [];
  const finances = contextData.finances || [];
  const totalCommunityBalance = finances.reduce((acc, f) => acc + (f.balance || 0), 0);

  const txSnapshot = records.slice(0, 120).map((r) => ({
    id: r.TransactionID,
    date: r.Date ? r.Date.split(' ')[0] : null,
    user: r.User,
    type: r.Category, // 'Gasto' o 'Retiro' (donde Retiro = Ingreso/Venta)
    amount: Math.abs(parseFloat(r.Amount || 0)),
    description: r.Description || '',
    has_image: Boolean(r.Imagen),
    status: r.status || 'ACTIVE',
  }));

  return `Eres el Asistente IA de la sección **GASTO-VENTA Y CONTABILIDAD** de Campito Jorox.
Hoy es: ${todayHuman} (${todayIso}).
Usuario activo: ${contextData.currentUser || 'Socio'}.
Socios disponibles: ${JSON.stringify(usersList)}.

IMPORTANTE SOBRE TIPOS DE MOVIMIENTO EN LA BASE DE DATOS:
- "Gasto" = Gasto / Dinero invertido (ej: compras, abono, gasoil, herramientas).
- "Retiro" = Ingreso / Venta (dinero generado o retirado de ventas de cosecha). En la interfaz se muestra como "INGRESO".

RESUMEN CONTABLE ACTUAL POR SOCIO (calculado sobre transacciones ACTIVAS):
${JSON.stringify(finances)}
Balance Total Comunidad: ${totalCommunityBalance.toFixed(2)} €

Últimas transacciones (${txSnapshot.length} registros):
${JSON.stringify(txSnapshot)}
${knowledgeText}

TU MISIÓN:
Interpreta mensajes de texto, notas de voz y fotos/PDFs de tickets o facturas adjuntas. Responde SIEMPRE en formato JSON estricto para ejecutar acciones contables o entregar resultados en los formatos exactos de Gasto-Venta (lista de transacciones y/o tabla de balances).

REGLAS DE OPERACIÓN:
1. Si te piden REGISTRAR un gasto, compra, venta o ingreso (por voz, texto o adjuntando foto/PDF de factura/ticket):
   - Extrae el importe numérico en euros, concepto/descripción, tipo ("Gasto" o "Retiro" para ingreso/venta) y el socio responsable (si no se menciona, usa "${contextData.currentUser || usersList[0] || 'Ariel'}").
   - Genera una acción "CREATE_TRANSACTION".
2. Si te piden MODIFICAR una transacción existente: genera "UPDATE_TRANSACTION" con su "transaction_id" y campos en "data".
3. Si te piden ELIMINAR / BORRAR una transacción: genera "DELETE_TRANSACTION" con su "transaction_id" (y/o "query").
4. Si te piden RESTAURAR una transacción de la papelera: genera "RESTORE_TRANSACTION" con su "transaction_id".
5. Si te hacen una CONSULTA FINANCIERA o BÚSQUEDA:
   - Si preguntan por balances, saldos, quién debe a quién, liquidaciones o resumen de cuentas entre socios: pon "show_balances_table": true y redacta cifras exactas en "summary".
   - Si buscan movimientos concretos (ej: "gastos de Ariel", "últimos ingresos", "compras de abono"): devuelve sus IDs en "matched_transaction_ids" para mostrarlos en formato de lista de transacciones.
   - Si piden un desglose agrupado (ej: por mes o por socio/concepto), puedes incluir "custom_table": { "headers": [...], "rows": [[...]] }.

ESQUEMA JSON OBLIGATORIO DE RESPUESTA:
{
  "title": "Título corto del resultado (ej: 'Gasto registrado', 'Resumen de Balances', 'Movimientos de Ariel')",
  "summary": "Respuesta clara con cifras exactas en €",
  "transcription": "Transcripción del audio si hubo nota de voz (o null)",
  "actions": [
    {
      "type": "CREATE_TRANSACTION" | "UPDATE_TRANSACTION" | "DELETE_TRANSACTION" | "RESTORE_TRANSACTION",
      "transaction_id": "id exacto si es UPDATE/DELETE/RESTORE",
      "query": "descripción si aplica para DELETE",
      "data": {
        "type": "Gasto" | "Retiro",
        "amount": 45.50,
        "description": "Concepto claro",
        "user": "Nombre del socio",
        "date": "YYYY-MM-DD"
      }
    }
  ],
  "matched_transaction_ids": ["id1", "id2"],
  "show_balances_table": false,
  "custom_table": null
}`;
}

/**
 * Llama a Gemini en cascada con soporte de texto, audio y adjuntos (fotos/PDFs/Excel)
 */
export async function callSectionGemini({
  section,
  prompt = '',
  audio = null,
  attachment = null,
  contextData = {},
  apiKey,
}) {
  if (!apiKey) {
    throw new Error('Falta VITE_GEMINI_API_KEY en el entorno.');
  }

  const knowledge = await loadFarmKnowledgeSafe();
  const systemInstruction = buildSectionSystemInstruction(section, contextData, knowledge);

  const userParts = [];
  if (prompt && prompt.trim()) {
    userParts.push({ text: prompt.trim() });
  }

  if (attachment) {
    if (attachment.textContent) {
      userParts.push({
        text: `\n\n📄 Contenido del archivo adjunto ("${attachment.name || 'documento'}"):\n\`\`\`\n${attachment.textContent}\n\`\`\``,
      });
    }
    if (attachment.dataUrl) {
      const match = attachment.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
      if (match) {
        const cleanMime = match[1].toLowerCase().split(';')[0].trim();
        if (cleanMime.startsWith('image/') || cleanMime === 'application/pdf') {
          userParts.push({ inlineData: { mimeType: cleanMime, data: match[2] } });
        }
      }
    }
    if (!prompt && !audio) {
      userParts.push({
        text:
          section === 'gasto-ingreso' || section === 'gasto-venta'
            ? 'Analiza esta factura, ticket o documento adjunto, extrae importe, concepto, tipo (Gasto o Retiro/Ingreso) y socio si aparece, y prepáralo en formato CREATE_TRANSACTION o resúmelo.'
            : 'Analiza este documento o imagen adjunta en relación al calendario de Campito Jorox y genera las acciones o respuestas correspondientes.',
      });
    }
  }

  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (match) {
      userParts.push({ inlineData: { mimeType: match[1].split(';')[0].trim(), data: match[2] } });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({ inlineData: { mimeType: cleanMime, data: cleanBase64 } });
    }
    if (!prompt) {
      userParts.push({
        text:
          section === 'calendario'
            ? 'Escucha esta nota de voz del agricultor sobre el calendario. Transcríbela en "transcription", responde a su consulta o ejecuta el alta/edición/borrado de eventos en "actions" y devuelve los IDs coincidentes en "matched_event_ids".'
            : 'Escucha esta nota de voz del agricultor sobre gastos, ventas o contabilidad. Transcríbela en "transcription", responde a su consulta o ejecuta el alta/edición/borrado en "actions" y activa "show_balances_table" o "matched_transaction_ids" según corresponda.',
      });
    }
  }

  if (userParts.length === 0) {
    throw new Error('No hay contenido para enviar al asistente.');
  }

  const payload = {
    contents: [{ role: 'user', parts: userParts }],
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.15,
      response_mime_type: 'application/json',
    },
  };

  let lastError = null;
  for (const modelId of GEMINI_MODELS_CASCADE) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), audio || attachment ? 35000 : 22000);
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
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const resData = await res.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Respuesta vacía del modelo');

      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const match = cleanJson.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          parsed = {
            title: section === 'calendario' ? 'Calendario IA' : 'Contabilidad IA',
            summary: rawText,
            actions: [],
          };
        }
      }

      return {
        ...parsed,
        modelUsed: modelId,
      };
    } catch (err) {
      console.warn(`[sectionIaService] Falló ${modelId}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo conectar con los modelos de IA.');
}

/**
 * Ejecuta acciones del asistente en la sección Calendario y genera pila de Undo
 */
export async function executeCalendarIaActions({ actions = [], rawEvents = [], currentUser = 'Ariel' }) {
  const addedEvents = [];
  const updatedEvents = [];
  const deletedIds = [];
  const reverts = [];
  const errors = [];

  for (const act of actions) {
    const type = (act.type || '').toUpperCase();

    if (type === 'CREATE_EVENT') {
      const d = act.data || act;
      const res = await createCalendarEvent({
        date: d.date,
        end_date: d.end_date || d.date,
        start_time: d.start_time || '08:00',
        end_time: d.end_time || '09:00',
        category: d.category || 'RIEGO - La Nana',
        responsibles: Array.isArray(d.responsibles) && d.responsibles.length > 0
          ? d.responsibles
          : (d.responsibles ? [d.responsibles] : [currentUser || 'Ariel']),
        info: d.info || 'Programado con Chat IA',
      });

      if (res.success && res.event) {
        addedEvents.push(res.event);
        reverts.push({ type: 'DELETE_EVENT', id: res.event.id });
      } else {
        errors.push(res.error || 'Error creando evento');
      }
    } else if (type === 'UPDATE_EVENT') {
      const target = findEventToMatch({
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

      const updatePayload = {};
      if (d.date) updatePayload.date = `${d.date.split('T')[0]}T00:00:00Z`;
      if (d.end_date) updatePayload.end_date = `${d.end_date.split('T')[0]}T00:00:00Z`;
      if (d.start_time) updatePayload.start_time = d.start_time.substring(0, 5) + ':00';
      if (d.end_time) updatePayload.end_time = d.end_time.substring(0, 5) + ':00';
      if (d.category) updatePayload.category = d.category;
      if (d.responsibles) updatePayload.responsibles = Array.isArray(d.responsibles) ? d.responsibles : [d.responsibles];
      if (d.info !== undefined) updatePayload.info = d.info;

      const { data: updatedRow, error: updErr } = await supabase
        .from('events')
        .update(updatePayload)
        .eq('id', target.id)
        .select()
        .single();

      if (!updErr && updatedRow) {
        updatedEvents.push(updatedRow);
        reverts.push({ type: 'RESTORE_EVENT', id: target.id, prevData });
      } else {
        errors.push(updErr?.message || 'Error actualizando evento');
      }
    } else if (type === 'DELETE_EVENT') {
      const res = await deleteCalendarEvent({
        event_id: act.event_id || act.id,
        date: act.date,
        query: act.query,
        currentEvents: rawEvents,
      });

      if (res.success && res.deletedId) {
        deletedIds.push(res.deletedId);
        if (res.deletedEvent && res.deletedEvent.category) {
          const rest = { ...res.deletedEvent };
          delete rest.id;
          delete rest.created_at;
          reverts.push({ type: 'INSERT_EVENT', eventData: rest });
        }
      } else {
        errors.push(res.error || 'No se pudo borrar el evento');
      }
    }
  }

  return { addedEvents, updatedEvents, deletedIds, reverts, errors };
}

/**
 * Revierte acciones de calendario (Undo)
 */
export async function revertCalendarIaActions(reverts = []) {
  for (let i = reverts.length - 1; i >= 0; i--) {
    const rev = reverts[i];
    if (rev.type === 'DELETE_EVENT' && rev.id) {
      await supabase.from('events').delete().eq('id', rev.id);
    } else if (rev.type === 'RESTORE_EVENT' && rev.id && rev.prevData) {
      await supabase.from('events').update(rev.prevData).eq('id', rev.id);
    } else if (rev.type === 'INSERT_EVENT' && rev.eventData) {
      await supabase.from('events').insert([rev.eventData]);
    }
  }
}

/**
 * Sube un comprobante (imagen o PDF) al bucket 'comprobantes' si existe adjunto
 */
async function uploadAttachmentToComprobantes(attachment) {
  if (!attachment?.file) return null;
  try {
    const fileExt = attachment.name ? attachment.name.split('.').pop() : 'jpg';
    const fileName = `ia_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage.from('comprobantes').upload(fileName, attachment.file);
    if (!error) {
      const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
      return pubData?.publicUrl || null;
    }
  } catch (err) {
    console.warn('[sectionIaService] Error subiendo comprobante:', err);
  }
  return null;
}

/**
 * Ejecuta acciones del asistente en la sección Gasto-Venta y genera pila de Undo
 */
export async function executeFinanceIaActions({
  actions = [],
  records = [],
  users = [],
  attachment = null,
  currentUser = 'Ariel',
}) {
  const addedTransactions = [];
  const updatedTransactions = [];
  const deletedIds = [];
  const restoredIds = [];
  const reverts = [];
  const errors = [];

  const needsAttachmentUpload = actions.some(
    (a) => (a.type || '').toUpperCase() === 'CREATE_TRANSACTION' || (a.type || '').toUpperCase() === 'UPDATE_TRANSACTION'
  );
  const uploadedImageUrl = needsAttachmentUpload && attachment ? await uploadAttachmentToComprobantes(attachment) : null;

  for (const act of actions) {
    const type = (act.type || '').toUpperCase();

    if (type === 'CREATE_TRANSACTION') {
      const d = act.data || act;
      const normalizedType = normalizeTxType(d.type);
      const rawAmount = Math.abs(parseFloat(d.amount || 0));
      if (!rawAmount || isNaN(rawAmount)) {
        errors.push('Importe inválido en la transacción.');
        continue;
      }

      const finalAmount = normalizedType === 'Retiro' ? -rawAmount : rawAmount;
      const matchedUser = resolveUser(d.user || currentUser, users) || users[0] || null;
      const txDate = d.date ? `${d.date.split('T')[0]}T12:00:00Z` : new Date().toISOString();

      const { data: newRow, error: insErr } = await supabase
        .from('transactions')
        .insert([
          {
            date: txDate,
            user_id: matchedUser ? matchedUser.id : null,
            type: normalizedType,
            amount: finalAmount,
            description: (d.description || 'Registrado desde Chat IA').trim(),
            image_url: uploadedImageUrl,
            status: 'ACTIVE',
          },
        ])
        .select('*, profiles(name)')
        .single();

      if (!insErr && newRow) {
        addedTransactions.push(newRow);
        reverts.push({ type: 'HARD_DELETE_TX', id: newRow.id });
      } else {
        errors.push(insErr?.message || 'Error creando transacción');
      }
    } else if (type === 'UPDATE_TRANSACTION') {
      const targetId = act.transaction_id || act.id;
      const existing = records.find((r) => String(r.TransactionID) === String(targetId));
      if (!existing) {
        errors.push('No se encontró la transacción a actualizar.');
        continue;
      }

      const d = act.data || {};
      const prevUser = resolveUser(existing.User, users);
      const prevData = {
        type: existing.Category,
        amount: existing.Amount,
        description: existing.Description,
        user_id: prevUser ? prevUser.id : null,
      };

      const nextType = d.type ? normalizeTxType(d.type) : existing.Category;
      const nextAbsAmt = d.amount !== undefined ? Math.abs(parseFloat(d.amount)) : Math.abs(parseFloat(existing.Amount));
      const nextAmount = nextType === 'Retiro' ? -nextAbsAmt : nextAbsAmt;
      const nextUser = d.user ? resolveUser(d.user, users) : prevUser;

      const updatePayload = {
        type: nextType,
        amount: nextAmount,
        description: d.description !== undefined ? d.description.trim() : existing.Description,
        user_id: nextUser ? nextUser.id : prevData.user_id,
      };
      if (uploadedImageUrl) updatePayload.image_url = uploadedImageUrl;

      const { data: updRow, error: updErr } = await supabase
        .from('transactions')
        .update(updatePayload)
        .eq('id', existing.TransactionID)
        .select('*, profiles(name)')
        .single();

      if (!updErr && updRow) {
        updatedTransactions.push(updRow);
        reverts.push({ type: 'RESTORE_TX_FIELDS', id: existing.TransactionID, prevData });
      } else {
        errors.push(updErr?.message || 'Error actualizando transacción');
      }
    } else if (type === 'DELETE_TRANSACTION') {
      let targetId = act.transaction_id || act.id;
      if (!targetId && act.query) {
        const q = act.query.toLowerCase();
        const found = records.find(
          (r) =>
            r.status === 'ACTIVE' &&
            ((r.Description && r.Description.toLowerCase().includes(q)) ||
              (r.User && r.User.toLowerCase().includes(q)))
        );
        if (found) targetId = found.TransactionID;
      }

      if (!targetId) {
        errors.push('No se encontró la transacción a eliminar.');
        continue;
      }

      const { error: delErr } = await supabase
        .from('transactions')
        .update({ status: 'DELETED', deleted_at: new Date().toISOString() })
        .eq('id', targetId);

      if (!delErr) {
        deletedIds.push(targetId);
        reverts.push({ type: 'RESTORE_TX_STATUS', id: targetId });
      } else {
        errors.push(delErr.message);
      }
    } else if (type === 'RESTORE_TRANSACTION') {
      const targetId = act.transaction_id || act.id;
      if (!targetId) continue;

      const { error: resErr } = await supabase
        .from('transactions')
        .update({ status: 'ACTIVE', deleted_at: null })
        .eq('id', targetId);

      if (!resErr) {
        restoredIds.push(targetId);
        reverts.push({ type: 'SOFT_DELETE_TX', id: targetId });
      } else {
        errors.push(resErr.message);
      }
    }
  }

  return { addedTransactions, updatedTransactions, deletedIds, restoredIds, reverts, errors };
}

/**
 * Revierte acciones de transacciones (Undo)
 */
export async function revertFinanceIaActions(reverts = []) {
  for (let i = reverts.length - 1; i >= 0; i--) {
    const rev = reverts[i];
    if (rev.type === 'HARD_DELETE_TX' && rev.id) {
      await supabase.from('transactions').delete().eq('id', rev.id);
    } else if (rev.type === 'RESTORE_TX_FIELDS' && rev.id && rev.prevData) {
      await supabase.from('transactions').update(rev.prevData).eq('id', rev.id);
    } else if (rev.type === 'RESTORE_TX_STATUS' && rev.id) {
      await supabase.from('transactions').update({ status: 'ACTIVE', deleted_at: null }).eq('id', rev.id);
    } else if (rev.type === 'SOFT_DELETE_TX' && rev.id) {
      await supabase
        .from('transactions')
        .update({ status: 'DELETED', deleted_at: new Date().toISOString() })
        .eq('id', rev.id);
    }
  }
}

