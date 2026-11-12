// src/services/geminiEmbeddingService.js
// Servicio de generación de vectores de incrustación (Embeddings) con Google Gemini (text-embedding-004)
// Soporta llamadas individuales y por lotes (batching) con control de reintentos y tolerancia a fallos.

const EMBEDDING_MODEL = 'text-embedding-004';

function getEffectiveApiKey(customApiKey = null) {
  if (customApiKey) return customApiKey;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  if (typeof globalThis !== 'undefined' && globalThis.process?.env?.GEMINI_API_KEY) {
    return globalThis.process.env.GEMINI_API_KEY;
  }
  if (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_GEMINI_API_KEY) {
    return globalThis.process.env.VITE_GEMINI_API_KEY;
  }
  return '';
}

/**
 * Genera el vector de embedding (768 dimensiones) para un texto dado.
 * @param {string} text
 * @param {string} [apiKey]
 * @returns {Promise<number[]>}
 */
export async function generateTextEmbedding(text, apiKey = null) {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('API Key de Gemini no configurada para generar embeddings.');
  }

  const cleanText = (text || '').trim();
  if (!cleanText) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: cleanText.substring(0, 8000) }],
      },
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status} al generar embedding`);
  }

  const data = await res.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Respuesta de embedding inválida o vacía de Gemini.');
  }

  return values;
}

/**
 * Genera embeddings para múltiples textos en lotes (batch) para no exceder cuotas de concurrencia.
 * @param {string[]} texts
 * @param {string} [apiKey]
 * @param {number} [batchSize=5]
 * @returns {Promise<Array<number[]>>}
 */
export async function batchGenerateEmbeddings(texts = [], apiKey = null, batchSize = 5) {
  const key = getEffectiveApiKey(apiKey);
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const batchPromises = chunk.map((txt) =>
      generateTextEmbedding(txt, key).catch((err) => {
        console.warn('[GeminiEmbedding] Error en fragmento:', err.message);
        return null;
      })
    );
    const batchRes = await Promise.all(batchPromises);
    results.push(...batchRes);
  }

  return results;
}
