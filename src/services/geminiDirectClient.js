// src/services/geminiDirectClient.js
// Catálogo de servidores Gemini disponibles y llamada REST directa de respaldo para ChatIA.

import { normalizeAttachments, appendAttachmentsToGeminiParts } from '../utils/attachmentUtils';

export const GEMINI_SERVERS = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    level: 'pro',
    badgeColor: '#3b82f6',
    desc: 'El modelo más potente. Máxima capacidad deductiva, análisis y lógica',
    available: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    level: 'pro',
    badgeColor: '#0ea5e9',
    desc: 'Alta precisión para tablas financieras complejas y planificación',
    available: false,
    deprecated: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    level: 'high',
    badgeColor: '#8b5cf6',
    desc: 'Razonamiento avanzado, análisis profundo de cosechas y balances',
    available: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    level: 'medium',
    badgeColor: '#10b981',
    desc: 'Equilibrado, 1M contexto, veloz y alta precisión',
    available: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    level: 'eco',
    badgeColor: '#f59e0b',
    desc: 'Ultra ligero, mínima latencia, respaldo seguro de cuota',
    available: true,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    level: 'next-gen',
    badgeColor: '#ec4899',
    desc: 'Próxima generación de arquitectura neuronal (Preview)',
    available: false,
    comingSoon: true,
  },
];

export async function callGeminiDirect({
  modelId,
  prompt,
  attachment,
  attachments,
  image,
  audio,
  history,
  systemInstruction,
  apiKey,
  timeoutMs = 25000,
}) {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const attList = normalizeAttachments(
    attachments,
    attachment || (image ? { dataUrl: image.dataUrl, name: 'imagen.jpg' } : null)
  );
  const effectiveTimeout = audio || attList.length > 0 ? Math.max(timeoutMs, 45000) : timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  const contents = [];

  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h.content) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }
  }

  const userParts = [];
  if (prompt) {
    userParts.push({ text: prompt });
  }

  if (attList.length > 0) {
    appendAttachmentsToGeminiParts(userParts, attList);
  }

  if (audio && audio.dataUrl) {
    const match = audio.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
    if (match) {
      const cleanMime = match[1].toLowerCase().trim();
      userParts.push({
        inlineData: {
          mimeType: cleanMime,
          data: match[2],
        },
      });
    } else {
      const cleanMime = (audio.mimeType || 'audio/webm').split(';')[0].trim();
      const cleanBase64 = audio.dataUrl.replace(/^data:.*?;base64,/, '');
      userParts.push({
        inlineData: {
          mimeType: cleanMime,
          data: cleanBase64,
        },
      });
    }
  }

  if (!prompt && audio) {
    userParts.push({
      text: 'Por favor, escucha atentamente este mensaje de voz del agricultor de Campito Jorox. Transcribe o interpreta lo que dice y responde a su consulta o petición. Si consulta sobre el calendario o turnos de riego, revisa el calendario inyectado y responde con el horario exacto. Si pide programar un turno o evento, usa [[CREAR_EVENTO: {...}]]. Si pide borrar o cancelar un evento del calendario, usa [[BORRAR_EVENTO: {"date": "YYYY-MM-DD", "query": "...", "event_id": "..."}]] o [[ELIMINAR_EVENTO: {"event_id": "..."}]]. Si consulta sobre la contabilidad, responde con los balances reales. Si describe árboles, plantas, arquetas o elementos de la finca para inventario, extrae los datos y ubícalos con [[REGISTRAR_PUNTOS: [...] ]]. Si pide recordar o aprender una regla de la finca, guárdala con [[MEMORIA: {...} ]]. Si pide borrar un punto, usa [[BORRAR_PUNTO: {...}]]. Responde detalladamente en español.',
    });
  } else if (!prompt && attList.length > 0) {
    const namesLabel = attList.map((a) => `"${a.name || 'documento'}"`).join(', ');
    userParts.push({
      text: `Por favor analiza detalladamente ${attList.length > 1 ? 'los archivos adjuntos' : 'el archivo adjunto'} (${namesLabel}) para Campito Jorox. Sintetiza la información relevante y, si contiene pautas o reglas para alimentar el conocimiento de la finca, guárdalas con [[MEMORIA: {"category": "suelo|cultivo|riego|fertilizacion|general", "title": "...", "content": "..."}]]. Si contiene árboles o parcelas, regístralos con [[REGISTRAR_PUNTOS: [...] ]].`,
    });
  } else if (userParts.length === 0) {
    userParts.push({ text: 'Hola' });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const payload = {
    contents,
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.error?.message || `HTTP ${res.status}`;
      const isQuota =
        res.status === 429 ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('resource_exhausted');
      const err = new Error(errorMsg);
      err.status = res.status;
      err.isQuota = isQuota;
      throw err;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');

    if (!text) {
      throw new Error('El modelo devolvió una respuesta vacía');
    }

    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Tiempo de espera agotado (15s)');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  }
}

