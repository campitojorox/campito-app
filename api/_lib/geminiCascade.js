// api/_lib/geminiCascade.js
// Enrutamiento de modelos Gemini (rápido vs complejo) y llamada REST con cascada automática.

export const FAST_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
];

export const COMPLEX_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

export const DEFAULT_MODELS = FAST_MODELS;

/**
 * Selecciona cascada rápida (Flash) para texto/consultas simples y Pro solo para adjuntos pesados o audios largos.
 */
export function selectModelsForRequest({ models, prompt, attachment, audio }) {
  if (Array.isArray(models) && models.length > 0) return models;
  const hasHeavyAttachment = Boolean(attachment?.dataUrl);
  const hasLongAudio = Boolean(
    audio?.dataUrl && ((audio?.duration || 0) >= 45 || audio.dataUrl.length > 600000)
  );
  const hasLongPrompt = typeof prompt === 'string' && prompt.length > 1500;
  return hasHeavyAttachment || hasLongAudio || hasLongPrompt ? COMPLEX_MODELS : FAST_MODELS;
}

/**
 * Llama a Gemini REST API con cascada de modelos.
 */
export async function callGeminiCascade({
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
        err.isQuota =
          res.status === 429 ||
          msg.toLowerCase().includes('quota') ||
          msg.toLowerCase().includes('resource_exhausted');
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

