// src/context/chatConstants.js
import { GEMINI_SERVERS } from '../services/geminiDirectClient';

export function stripLegacyGpsTag(text) {
  return (text || '').replace(/\s*\[GPS:\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\]$/i, '');
}

export const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el **Cerebro IA Unificado** de **Campito Jorox** 🌿\n\nTengo acceso completo en tiempo real y puedo ayudarte con:\n- 🗺️ **Catastro y Caminos:** Consultar o modificar trazados de pistas, mangueras, aguacates y arquetas de la sección Mapas.\n- 📐 **Planos Técnicos y Esquemas:** Dibujos vectoriales acotados (SVG) y diagramas hidráulicos (Mermaid) con descarga e impresión.\n- 👁️ **Fotos y Documentos:** Diagnóstico de plagas en hojas, OCR de facturas de abono o lectura de contadores de agua.\n- 📅 **Calendario y Riego:** Consultar y agendar turnos en La Nana o El Moro.\n- 💰 **Finanzas y Gastos:** Balances, gastos, ventas y liquidaciones.\n- 🛠️ **Crear Nuevas Herramientas:** Pídeme inventar herramientas dinámicas para el equipo.\n\n¿En qué te puedo ayudar hoy?',
  serverUsed: GEMINI_SERVERS.find((s) => s.id === 'gemini-2.5-flash') || GEMINI_SERVERS[0],
};

/**
 * Formatea fechas para divisores de sesión de chat.
 */
export function formatSessionDate(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy, ${timeStr}`;
    if (isYesterday) return `Ayer, ${timeStr}`;
    return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${timeStr}`;
  } catch {
    return '';
  }
}

/**
 * Agrupa registros planos de chat_history en sesiones lógicas e históricas.
 */
export function groupRemoteRowsIntoSessions(rows, formatRowFn) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  const sessions = [];
  let currentGroup = [];
  let currentSessionId = null;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const prev = sorted[i - 1];

    let startNew = false;
    if (i === 0) {
      startNew = true;
    } else if (row.session_id && currentSessionId && row.session_id !== currentSessionId) {
      startNew = true;
    } else if (!row.session_id) {
      const gapHours = prev ? (new Date(row.created_at) - new Date(prev.created_at)) / (1000 * 60 * 60) : 0;
      if (gapHours > 1.5 && row.role === 'user') {
        startNew = true;
      }
    }

    if (startNew && currentGroup.length > 0) {
      const converted = formatRowFn ? currentGroup.map(formatRowFn) : currentGroup;
      const firstUser = converted.find((m) => m.role === 'user');
      sessions.push({
        sessionId: currentSessionId || `session_legacy_${currentGroup[0].id}`,
        createdAt: currentGroup[0].created_at,
        title: firstUser?.content ? firstUser.content.slice(0, 45).trim() : 'Conversación anterior',
        messages: converted,
      });
      currentGroup = [];
    }

    currentSessionId = row.session_id || currentSessionId;
    currentGroup.push(row);
  }

  if (currentGroup.length > 0) {
    const converted = formatRowFn ? currentGroup.map(formatRowFn) : currentGroup;
    const firstUser = converted.find((m) => m.role === 'user');
    sessions.push({
      sessionId: currentSessionId || `session_legacy_${currentGroup[0].id}`,
      createdAt: currentGroup[0].created_at,
      title: firstUser?.content ? firstUser.content.slice(0, 45).trim() : 'Conversación anterior',
      messages: converted,
    });
  }

  return sessions.reverse();
}

