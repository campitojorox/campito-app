// src/services/calendarService.js
// Servicio centralizado para gestión y borrado de eventos del calendario en Supabase
import { supabase } from '../supabaseClient.js';

/**
 * Normaliza cadenas quitando tildes y pasando a minúsculas
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.toString().trim();
  // Caso YYYY-MM-DD...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  // Caso DD-MM-YYYY o DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }
  return str;
}

/**
 * Localiza el evento que mejor coincide con los criterios especificados
 * (event_id, date, query)
 */
export function findEventToMatch({ event_id = null, date = null, query = null, events = [] }) {
  if (!events || events.length === 0) return null;

  // 1. Coincidencia directa por ID si se suministró
  if (event_id !== null && event_id !== undefined && event_id !== '') {
    const strId = event_id.toString().trim();
    const exact = events.find((ev) => ev.id && ev.id.toString() === strId);
    if (exact) return exact;
  }

  const targetDate = normalizeDate(date);
  const normQuery = normalizeText(query);
  const queryTokens = normQuery.split(/\s+/).filter((t) => t.length > 2);

  // Filtrar o puntuar candidatos
  let bestCandidate = null;
  let highestScore = -1;

  for (const ev of events) {
    let score = 0;
    const evDate = normalizeDate(ev.date || ev.Date);

    // Comparación de fecha
    if (targetDate) {
      if (evDate === targetDate) {
        score += 15;
      } else {
        // Si se especificó fecha y no coincide en absoluto, omitir salvo que no haya otra opción
        score -= 20;
      }
    }

    // Comparación de texto (categoría, info, responsables)
    const cat = normalizeText(ev.category || ev.Category);
    const info = normalizeText(ev.info || ev.Info);
    const resp = normalizeText(
      Array.isArray(ev.responsibles)
        ? ev.responsibles.join(' ')
        : (ev.responsible || ev.Responsible || '')
    );
    const combined = `${cat} ${info} ${resp}`;

    if (normQuery) {
      if (combined.includes(normQuery)) {
        score += 10;
      }
      for (const token of queryTokens) {
        if (cat.includes(token)) score += 6;
        if (info.includes(token)) score += 4;
        if (resp.includes(token)) score += 4;
      }
    }

    if (score > highestScore && score > 0) {
      highestScore = score;
      bestCandidate = ev;
    }
  }

  return bestCandidate;
}

/**
 * Elimina un evento de la base de datos de Supabase.
 * Acepta:
 * - event_id: ID exacto
 * - date: Fecha 'YYYY-MM-DD'
 * - query: Texto descriptivo / categoría / responsables
 * - currentEvents: Lista opcional de eventos en memoria para resolución inmediata
 */
export async function deleteCalendarEvent({ event_id = null, date = null, query = null, currentEvents = [] }) {
  try {
    let targetEvent = null;
    let targetId = event_id;

    // Si tenemos eventos en memoria o no tenemos ID directo, buscamos el evento
    if (currentEvents && currentEvents.length > 0) {
      targetEvent = findEventToMatch({ event_id, date, query, events: currentEvents });
      if (targetEvent) {
        targetId = targetEvent.id;
      }
    }

    // Si aún no tenemos targetId ni targetEvent, consultar directamente a Supabase
    if (!targetId && (date || query)) {
      let req = supabase.from('events').select('*');
      const normDate = normalizeDate(date);
      if (normDate) {
        req = req.gte('date', `${normDate}T00:00:00Z`).lte('date', `${normDate}T23:59:59Z`);
      }
      const { data: dbEvents, error: dbErr } = await req;
      if (!dbErr && dbEvents && dbEvents.length > 0) {
        targetEvent = findEventToMatch({ event_id, date, query, events: dbEvents });
        if (targetEvent) {
          targetId = targetEvent.id;
        }
      }
    }

    if (!targetId) {
      return {
        success: false,
        error: 'No se encontró ningún evento que coincida con los criterios especificados.',
      };
    }

    // Ejecutar borrado en Supabase
    const { error: delError } = await supabase
      .from('events')
      .delete()
      .eq('id', targetId);

    if (delError) {
      console.error('[calendarService] Error borrando evento en Supabase:', delError);
      return {
        success: false,
        error: delError.message,
      };
    }

    return {
      success: true,
      deletedId: targetId,
      deletedEvent: targetEvent || { id: targetId },
    };
  } catch (err) {
    console.error('[calendarService] Excepción al borrar evento:', err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Crea un evento en el calendario de Supabase
 */
export async function createCalendarEvent(eventData) {
  try {
    const evDate = eventData.date ? `${eventData.date.split('T')[0]}T00:00:00Z` : new Date().toISOString();
    const evEndDate = eventData.end_date ? `${eventData.end_date.split('T')[0]}T00:00:00Z` : evDate;
    const evStartTime = eventData.start_time ? (eventData.start_time.substring(0, 5) + ':00') : '08:00:00';
    const evEndTime = eventData.end_time ? (eventData.end_time.substring(0, 5) + ':00') : '10:00:00';
    const evCat = eventData.category || 'RIEGO - La Nana';
    const evResp = Array.isArray(eventData.responsibles)
      ? eventData.responsibles
      : (eventData.responsibles ? [eventData.responsibles] : ['Ariel']);
    const evInfo = eventData.info || 'Programado desde Chat IA';

    const { data, error } = await supabase
      .from('events')
      .insert({
        date: evDate,
        end_date: evEndDate,
        start_time: evStartTime,
        end_time: evEndTime,
        category: evCat,
        responsibles: evResp,
        info: evInfo,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, event: data };
  } catch (err) {
    console.error('[calendarService] Error creando evento:', err);
    return { success: false, error: err.message };
  }
}
