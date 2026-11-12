// src/services/ragDocumentService.js
// Gestor unificado de indexación, almacenamiento y recuperación vectorial (RAG) de archivos para Campito Jorox.
// Funciona en modo híbrido con persistencia en Supabase (pgvector) y fallback en memoria/localStorage local.

import { supabase } from '../supabaseClient';
import { generateTextEmbedding, batchGenerateEmbeddings } from './geminiEmbeddingService';
import { chunkDocumentContent } from './documentChunker';
import { isKmzFile, extractKmlFromKmz } from '../utils/kmzReader';

const LOCAL_DOCUMENTS_KEY = 'campito_rag_documents_v1';
const LOCAL_CHUNKS_KEY = 'campito_rag_chunks_v1';

// ─── ALMACENAMIENTO LOCAL FALLBACK (SOBREVIVE RECARGAS OFFLINE) ───
export function getLocalRagDocuments() {
  try {
    const raw = localStorage.getItem(LOCAL_DOCUMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRagDocument(doc) {
  try {
    const list = getLocalRagDocuments().filter((d) => d.id !== doc.id);
    list.unshift(doc);
    localStorage.setItem(LOCAL_DOCUMENTS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {
    console.warn('[RAG] Error guardando documento en caché local:', e);
  }
}

export function getLocalRagChunks() {
  try {
    const raw = localStorage.getItem(LOCAL_CHUNKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRagChunks(newChunks = []) {
  try {
    const existing = getLocalRagChunks();
    const map = new Map(existing.map((c) => [c.id || `${c.document_id}_${c.chunk_index}`, c]));
    for (const c of newChunks) {
      map.set(c.id || `${c.document_id}_${c.chunk_index}`, c);
    }
    const combined = Array.from(map.values()).slice(-300);
    localStorage.setItem(LOCAL_CHUNKS_KEY, JSON.stringify(combined));
  } catch (e) {
    console.warn('[RAG] Error guardando chunks en caché local:', e);
  }
}

// ─── CÁLCULO DE SIMILITUD COSENO EN JAVASCRIPT (FALLBACK LOCAL) ───
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Procesa e indexa un archivo subido en el RAG vectorial (KML, KMZ, GeoJSON, GPX, CSV, PDF, TXT, etc.).
 * @param {Object} options
 * @param {File|Blob} options.file
 * @param {string} options.name
 * @param {string} [options.textContent]
 * @param {string} [options.dataUrl]
 * @param {string} [options.userName]
 * @param {string} [options.userId]
 * @param {string} [options.apiKey]
 * @returns {Promise<{ document: Object, chunksCount: number, pointsCount: number, pathsCount: number }>}
 */
export async function indexDocumentForRag({
  file = null,
  name = 'archivo.bin',
  textContent = null,
  dataUrl = null,
  userName = 'Admin',
  userId = null,
  apiKey = null,
}) {
  let effectiveTextContent = textContent;
  let detectedType = name.split('.').pop()?.toLowerCase() || 'txt';

  // 1. Si es KMZ, descomprimir automáticamente en caliente para extraer el KML interno
  const isKmz = (await isKmzFile(file)) || name.toLowerCase().endsWith('.kmz');
  if (isKmz && file) {
    try {
      const extracted = await extractKmlFromKmz(file);
      effectiveTextContent = extracted.kmlText;
      detectedType = 'kmz';
    } catch (kmzErr) {
      console.warn('[RAG] Aviso descomprimiendo KMZ:', kmzErr.message);
    }
  }

  if (!effectiveTextContent && dataUrl && (detectedType === 'kml' || detectedType === 'xml')) {
    try {
      const base64Data = dataUrl.split(',')[1];
      if (base64Data) {
        effectiveTextContent = atob(base64Data);
      }
    } catch {
      // Ignorar si no se puede decodificar
    }
  }

  // 2. Fragmentación semántica del contenido
  const { chunks, pointsCount, pathsCount, parsed } = chunkDocumentContent({
    textContent: effectiveTextContent || name,
    documentName: name,
    fileType: detectedType,
  });

  const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const docRecord = {
    id: docId,
    name,
    file_type: detectedType,
    file_url: dataUrl || null,
    storage_path: `farm-files/${docId}_${name}`,
    size_bytes: file?.size || (effectiveTextContent ? effectiveTextContent.length : 0),
    status: 'indexed',
    chunk_count: chunks.length,
    geo_points_count: pointsCount,
    geo_paths_count: pathsCount,
    summary: chunks[0]?.content || `Archivo ${name} procesado para RAG`,
    metadata: {
      userName,
      hasGeoData: pointsCount > 0 || pathsCount > 0,
      originalExt: detectedType,
    },
    created_at: new Date().toISOString(),
    is_active: true,
  };

  saveLocalRagDocument(docRecord);

  // 3. Generar embeddings con Google Gemini text-embedding-004
  const textsToEmbed = chunks.map((c) => c.content);
  let embeddings = [];
  try {
    embeddings = await batchGenerateEmbeddings(textsToEmbed, apiKey, 6);
  } catch (embErr) {
    console.warn('[RAG] Aviso generando embeddings con Gemini:', embErr.message);
  }

  const enrichedChunks = chunks.map((ch, idx) => ({
    id: `chk_${docId}_${ch.chunkIndex}`,
    document_id: docId,
    document_name: name,
    file_type: detectedType,
    chunk_index: ch.chunkIndex,
    content: ch.content,
    embedding: embeddings[idx] || null,
    metadata: ch.metadata || {},
    created_at: new Date().toISOString(),
  }));

  saveLocalRagChunks(enrichedChunks);

  // 4. Sincronización asíncrona con Supabase (si las tablas existen)
  (async () => {
    try {
      await supabase.from('farm_documents').insert({
        id: docRecord.id,
        name: docRecord.name,
        file_type: docRecord.file_type,
        file_url: docRecord.file_url,
        storage_path: docRecord.storage_path,
        size_bytes: docRecord.size_bytes,
        status: docRecord.status,
        chunk_count: docRecord.chunk_count,
        geo_points_count: docRecord.geo_points_count,
        geo_paths_count: docRecord.geo_paths_count,
        summary: docRecord.summary,
        metadata: docRecord.metadata,
        user_name: userName,
        user_id: userId,
        is_active: true,
      });

      const dbChunks = enrichedChunks
        .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
        .map((c) => ({
          document_id: docRecord.id,
          document_name: c.document_name,
          file_type: c.file_type,
          chunk_index: c.chunk_index,
          content: c.content,
          embedding: c.embedding,
          metadata: c.metadata,
        }));

      if (dbChunks.length > 0) {
        await supabase.from('farm_document_chunks').insert(dbChunks);
      }
    } catch (syncErr) {
      console.warn('[RAG] Tablas remotas de Supabase no disponibles aún, usando almacenamiento local persistente:', syncErr.message);
    }
  })();

  return {
    document: docRecord,
    chunksCount: chunks.length,
    pointsCount,
    pathsCount,
    parsed,
    effectiveTextContent,
  };
}

/**
 * Busca los fragmentos más relevantes en el almacén vectorial para una pregunta dada.
 * Utiliza la función RPC `match_document_chunks` de Supabase o similitud coseno local en memoria si falla la red.
 * @param {string} queryText
 * @param {Object} [options]
 * @returns {Promise<Array<{ content: string, document_name: string, similarity: number, metadata: Object }>>}
 */
export async function searchRagKnowledge(queryText, { matchThreshold = 0.35, matchCount = 6, filterFileType = null, apiKey = null } = {}) {
  const cleanQ = (queryText || '').trim();
  if (!cleanQ) return [];

  let queryVector;
  try {
    queryVector = await generateTextEmbedding(cleanQ, apiKey);
  } catch (err) {
    console.warn('[RAG] No se pudo generar embedding de la consulta:', err.message);
    // Búsqueda por palabras clave fallback
    const localChunks = getLocalRagChunks();
    const tokens = cleanQ.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return localChunks
      .filter((c) => tokens.some((tk) => c.content.toLowerCase().includes(tk)))
      .slice(0, matchCount)
      .map((c) => ({
        content: c.content,
        document_name: c.document_name,
        similarity: 0.5,
        metadata: c.metadata,
      }));
  }

  // 1. Intentar consulta RPC remota a Supabase
  if (Array.isArray(queryVector) && queryVector.length > 0) {
    try {
      const { data: remoteMatches, error: rpcErr } = await supabase.rpc('match_document_chunks', {
        query_embedding: queryVector,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_file_type: filterFileType,
      });

      if (!rpcErr && Array.isArray(remoteMatches) && remoteMatches.length > 0) {
        return remoteMatches;
      }
    } catch {
      // Continuar a fallback local
    }
  }

  // 2. Fallback: Búsqueda local por coseno en localStorage
  const localChunks = getLocalRagChunks();
  const scored = [];

  for (const chk of localChunks) {
    if (filterFileType && chk.file_type !== filterFileType) continue;
    if (queryVector && Array.isArray(chk.embedding) && chk.embedding.length > 0) {
      const sim = cosineSimilarity(queryVector, chk.embedding);
      if (sim >= matchThreshold) {
        scored.push({
          content: chk.content,
          document_name: chk.document_name,
          similarity: sim,
          metadata: chk.metadata,
        });
      }
    } else {
      // Comparación por token si el fragmento no tiene embedding
      const tokens = cleanQ.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const matchScore = tokens.reduce((acc, tk) => (chk.content.toLowerCase().includes(tk) ? acc + 0.15 : acc), 0);
      if (matchScore >= matchThreshold) {
        scored.push({
          content: chk.content,
          document_name: chk.document_name,
          similarity: Math.min(matchScore, 0.75),
          metadata: chk.metadata,
        });
      }
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, matchCount);
}

/**
 * Da formato al contexto RAG recuperado para inyectarlo de forma limpia en el prompt del sistema.
 */
export function formatRagContextForPrompt(ragMatches = []) {
  if (!Array.isArray(ragMatches) || ragMatches.length === 0) return '';

  let out = `\n\n📚 **CONOCIMIENTO RECUPERADO DE LA BIBLIOTECA DE ARCHIVOS (RAG / EMBEDDINGS)**:
A continuación se incluyen los fragmentos más relevantes extraídos de archivos subidos previamente a Campito Jorox (KML, KMZ, GeoJSON, facturas, análisis):`;

  ragMatches.forEach((m, idx) => {
    out += `\n[Fuente ${idx + 1}: ${m.document_name} | Similitud: ${(m.similarity * 100).toFixed(0)}%]\n${m.content}\n`;
  });

  out += `\n*INSTRUCCIÓN RAG: Utiliza esta información documental para responder a las preguntas del agricultor sobre elementos, coordenadas, arquetas o datos cartográficos de archivos cargados anteriormente.*`;
  return out;
}
