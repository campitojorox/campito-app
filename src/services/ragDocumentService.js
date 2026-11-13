// src/services/ragDocumentService.js
// Gestor unificado de indexación, almacenamiento y recuperación vectorial (RAG) de archivos para Campito Jorox.
// Funciona en arquitectura Local-First bidireccional resiliente con sincronización a Supabase y Storage en la nube.

import { supabase } from '../supabaseClient';
import { generateTextEmbedding, batchGenerateEmbeddings } from './geminiEmbeddingService';
import { chunkDocumentContent } from './documentChunker';
import { isKmzFile, extractKmlFromKmz } from '../utils/kmzReader';
import { generateUUID, isValidUUID } from './farmInventoryStorage';

const LOCAL_DOCUMENTS_KEY = 'campito_rag_documents_v1';
const LOCAL_CHUNKS_KEY = 'campito_rag_chunks_v1';

// ─── CANAL DE DIFUSIÓN MULTI-PESTAÑA / DISPOSITIVO ───────────────────────────
const docSyncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('campito_documents_sync_channel')
  : null;

if (docSyncBroadcast) {
  docSyncBroadcast.onmessage = (event) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('farm-documents-updated', { detail: event.data }));
    }
  };
}

export function broadcastDocumentSync(type, id, extra = {}) {
  try {
    docSyncBroadcast?.postMessage({ type, id, ...extra });
  } catch (err) {
    console.warn('[RAG] Error en broadcastDocumentSync:', err);
  }
}

// ─── PROXY SERVERLESS PARA BYPASS DE RLS EN REDES MÓVILES / DESCONEXIÓN ──────
async function callFarmSyncProxy(action, body = {}) {
  try {
    const res = await fetch('/api/farm-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('[RAG] Proxy farm-sync falló:', e.message);
  }
  return null;
}

// ─── UTILIDAD: DATAURL A BLOB PARA SUBIDA A SUPABASE STORAGE ──────────────────
function dataUrlToBlob(dataUrl) {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return null;
  }
}

// ─── ALMACENAMIENTO LOCAL FALLBACK (SOBREVIVE RECARGAS OFFLINE) ───────────────
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
    const list = getLocalRagDocuments().filter((d) => d.id !== doc.id && d.name !== doc.name);
    list.unshift(doc);
    localStorage.setItem(LOCAL_DOCUMENTS_KEY, JSON.stringify(list.slice(0, 100)));
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
    const combined = Array.from(map.values()).slice(-500);
    localStorage.setItem(LOCAL_CHUNKS_KEY, JSON.stringify(combined));
  } catch (e) {
    console.warn('[RAG] Error guardando chunks en caché local:', e);
  }
}

// ─── CÁLCULO DE SIMILITUD COSENO EN JAVASCRIPT (FALLBACK LOCAL) ──────────────
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
 * Consulta unificada y bidireccional de todos los documentos indexados en la finca.
 * Prioriza la base de datos de Supabase, auto-migra documentos locales huérfanos del Mac
 * y alimenta la caché del móvil para disponibilidad inmediata sin conexión.
 */
export async function fetchAllRagDocuments() {
  const localDocs = getLocalRagDocuments();

  let remoteDocs = [];
  try {
    const { data, error } = await supabase
      .from('farm_documents')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      remoteDocs = data;
    } else {
      const proxyRes = await callFarmSyncProxy('FETCH_DOCUMENTS');
      if (proxyRes?.data && Array.isArray(proxyRes.data)) {
        remoteDocs = proxyRes.data;
      }
    }
  } catch (err) {
    console.warn('[RAG] Error consultando documentos remotos:', err.message);
    const proxyRes = await callFarmSyncProxy('FETCH_DOCUMENTS');
    if (proxyRes?.data && Array.isArray(proxyRes.data)) {
      remoteDocs = proxyRes.data;
    }
  }

  // Mapa combinado
  const mergedMap = new Map();

  // 1. Agregar remotos
  remoteDocs.forEach((rd) => {
    mergedMap.set(rd.id, {
      ...rd,
      public_url: rd.public_url || rd.file_url || '',
      file_url: rd.public_url || rd.file_url || '',
      size_bytes: rd.size_bytes || rd.file_size || 0,
      file_size: rd.file_size || rd.size_bytes || 0,
      _cloudSynced: true,
    });
  });

  // 2. Revisar documentos locales huérfanos del Mac que no se hubieran sincronizado
  for (const ld of localDocs) {
    const foundById = mergedMap.get(ld.id);
    const foundByName = Array.from(mergedMap.values()).find((m) => m.name === ld.name);
    const existing = foundById || foundByName;

    if (!existing) {
      // Documento local en Mac que falló por ID antiguo: auto-migrar con UUID válido a Supabase
      const validId = isValidUUID(ld.id) ? ld.id : generateUUID();
      const migratedDoc = {
        ...ld,
        id: validId,
        public_url: ld.public_url || ld.file_url || '',
        file_url: ld.public_url || ld.file_url || '',
        size_bytes: ld.size_bytes || ld.file_size || 0,
        file_size: ld.size_bytes || ld.file_size || 0,
        storage_path: ld.storage_path || `farm-files/${validId}_${ld.name}`,
        is_active: true,
        _cloudSynced: false,
      };
      mergedMap.set(validId, migratedDoc);

      // Sincronizar en segundo plano
      (async () => {
        try {
          const { error } = await supabase.from('farm_documents').upsert([migratedDoc]);
          if (error) {
            await callFarmSyncProxy('INSERT_DOCUMENT', { payload: migratedDoc });
          }
        } catch {
          await callFarmSyncProxy('INSERT_DOCUMENT', { payload: migratedDoc });
        }
      })();
    } else {
      mergedMap.set(existing.id, {
        ...ld,
        ...existing,
        _cloudSynced: true,
      });
    }
  }

  const result = Array.from(mergedMap.values());
  result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  try {
    localStorage.setItem(LOCAL_DOCUMENTS_KEY, JSON.stringify(result.slice(0, 100)));
  } catch {
    // Ignorar fallo de almacenamiento local
  }

  return result;
}

/**
 * Suscripción en tiempo real a cambios en la biblioteca de documentos.
 */
export function subscribeToRagDocuments(onUpdate) {
  if (typeof window === 'undefined') return () => {};

  const channel = supabase
    .channel('farm_documents_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_documents' }, (payload) => {
      onUpdate?.(payload);
    })
    .subscribe();

  const handleCustomEvent = (e) => {
    onUpdate?.(e.detail);
  };
  window.addEventListener('farm-documents-updated', handleCustomEvent);

  return () => {
    supabase.removeChannel(channel);
    window.removeEventListener('farm-documents-updated', handleCustomEvent);
  };
}

/**
 * Elimina un documento tanto de Supabase como del almacenamiento local y Storage.
 */
export async function deleteRagDocument(documentId) {
  if (!documentId) return false;

  // 1. Quitar de caché local
  const currentDocs = getLocalRagDocuments();
  const filtered = currentDocs.filter((d) => d.id !== documentId);
  try {
    localStorage.setItem(LOCAL_DOCUMENTS_KEY, JSON.stringify(filtered));
    const currentChunks = getLocalRagChunks();
    const filteredChunks = currentChunks.filter((c) => c.document_id !== documentId);
    localStorage.setItem(LOCAL_CHUNKS_KEY, JSON.stringify(filteredChunks));
  } catch (e) {
    console.warn('[RAG] Error borrando documento local:', e);
  }

  // 2. Eliminar en Supabase y proxy
  try {
    await supabase.from('farm_document_chunks').delete().eq('document_id', documentId);
    const { error } = await supabase.from('farm_documents').delete().eq('id', documentId);
    if (error) {
      await callFarmSyncProxy('DELETE_DOCUMENT', { id: documentId });
    }
  } catch {
    await callFarmSyncProxy('DELETE_DOCUMENT', { id: documentId });
  }

  broadcastDocumentSync('DOCUMENT_DELETED', documentId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farm-documents-updated', { detail: { id: documentId, deleted: true } }));
  }

  return true;
}

/**
 * Procesa e indexa un archivo subido en el RAG vectorial (KML, KMZ, GeoJSON, GPX, CSV, PDF, TXT, etc.).
 * Sube automáticamente el binario a Supabase Storage bucket 'comprobantes' para acceso universal HTTPS.
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

  // Generar ID UUID válido compatible con PostgreSQL
  const docId = generateUUID();
  const cleanBaseName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `farm-files/${docId}_${cleanBaseName}`;

  // 3. Subir el archivo físico a Supabase Storage (bucket 'comprobantes')
  let publicUrl = dataUrl || '';
  let uploadTarget = file;
  if (!uploadTarget && dataUrl && dataUrl.startsWith('data:')) {
    uploadTarget = dataUrlToBlob(dataUrl);
  } else if (!uploadTarget && effectiveTextContent) {
    uploadTarget = new Blob([effectiveTextContent], { type: 'text/plain;charset=utf-8' });
  }

  if (uploadTarget) {
    try {
      const { error: upErr } = await supabase.storage
        .from('comprobantes')
        .upload(storagePath, uploadTarget, {
          contentType: uploadTarget.type || 'application/octet-stream',
          upsert: true,
        });

      if (!upErr) {
        const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(storagePath);
        if (pubData?.publicUrl) {
          publicUrl = pubData.publicUrl;
        }
      } else {
        console.warn('[RAG] Aviso subiendo archivo físico a Storage:', upErr.message);
      }
    } catch (storageErr) {
      console.warn('[RAG] Error en llamada a Supabase Storage:', storageErr.message);
    }
  }

  const docRecord = {
    id: docId,
    name,
    file_type: detectedType,
    file_url: publicUrl || null,
    public_url: publicUrl || '',
    storage_path: storagePath,
    size_bytes: file?.size || (effectiveTextContent ? effectiveTextContent.length : 0),
    file_size: file?.size || (effectiveTextContent ? effectiveTextContent.length : 0),
    status: 'indexed',
    section_origin: 'biblioteca',
    category: ['kml', 'kmz', 'geojson', 'gpx'].includes(detectedType) ? 'catastro' : 'general',
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
    updated_at: new Date().toISOString(),
    user_name: userName,
    user_id: userId,
    is_active: true,
    _cloudSynced: Boolean(publicUrl),
  };

  saveLocalRagDocument(docRecord);

  // 4. Generar embeddings con Google Gemini text-embedding-004
  const textsToEmbed = chunks.map((c) => c.content);
  let embeddings = [];
  try {
    embeddings = await batchGenerateEmbeddings(textsToEmbed, apiKey, 6);
  } catch (embErr) {
    console.warn('[RAG] Aviso generando embeddings con Gemini:', embErr.message);
  }

  const enrichedChunks = chunks.map((ch, idx) => ({
    id: generateUUID(),
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

  // 5. Sincronización asíncrona y resiliente con Supabase
  (async () => {
    try {
      const { error: insErr } = await supabase.from('farm_documents').insert([
        {
          id: docRecord.id,
          name: docRecord.name,
          file_type: docRecord.file_type,
          file_url: docRecord.file_url,
          public_url: docRecord.public_url,
          storage_path: docRecord.storage_path,
          size_bytes: docRecord.size_bytes,
          file_size: docRecord.file_size,
          status: docRecord.status,
          section_origin: docRecord.section_origin,
          category: docRecord.category,
          chunk_count: docRecord.chunk_count,
          geo_points_count: docRecord.geo_points_count,
          geo_paths_count: docRecord.geo_paths_count,
          summary: docRecord.summary,
          metadata: docRecord.metadata,
          user_name: userName,
          user_id: userId,
          is_active: true,
        },
      ]);

      if (insErr) {
        console.warn('[RAG] Inserción directa falló, llamando proxy /api/farm-sync:', insErr.message);
        await callFarmSyncProxy('INSERT_DOCUMENT', { payload: docRecord });
      }

      const dbChunks = enrichedChunks
        .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
        .map((c) => ({
          id: c.id,
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
      console.warn('[RAG] Sincronización remota usó fallback local:', syncErr.message);
      await callFarmSyncProxy('INSERT_DOCUMENT', { payload: docRecord });
    } finally {
      broadcastDocumentSync('DOCUMENT_ADDED', docId, { document: docRecord });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('farm-documents-updated', { detail: { document: docRecord } }));
      }
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
 */
export async function searchRagKnowledge(queryText, { matchThreshold = 0.35, matchCount = 6, filterFileType = null, apiKey = null } = {}) {
  const cleanQ = (queryText || '').trim();
  if (!cleanQ) return [];

  let queryVector;
  try {
    queryVector = await generateTextEmbedding(cleanQ, apiKey);
  } catch (err) {
    console.warn('[RAG] No se pudo generar embedding de la consulta:', err.message);
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
