-- ====================================================================
-- SCRIPT MIGRACIÓN: EXPLORADOR DE ARCHIVOS VECTORIAL (RAG) - CAMPITO JOROX
-- Habilita pgvector y crea las tablas para almacenamiento de documentos,
-- fragmentación semántica (chunks), embeddings (768d) y búsqueda por similitud.
-- Ejecutar en Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. HABILITAR EXTENSIÓN PGVECTOR
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. TABLA FARM_DOCUMENTS (Catálogo Maestro de Archivos de la Finca)
CREATE TABLE IF NOT EXISTS public.farm_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'kml', 'kmz', 'geojson', 'pdf', 'csv', 'xlsx', 'txt', 'md', 'xml'
    file_url TEXT,
    storage_path TEXT,
    size_bytes BIGINT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'indexed' CHECK (status IN ('processing', 'indexed', 'error')),
    chunk_count INT NOT NULL DEFAULT 0,
    geo_points_count INT NOT NULL DEFAULT 0,
    geo_paths_count INT NOT NULL DEFAULT 0,
    summary TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_farm_documents_type ON public.farm_documents (file_type);
CREATE INDEX IF NOT EXISTS idx_farm_documents_created_at ON public.farm_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_farm_documents_active ON public.farm_documents (is_active);
ALTER TABLE public.farm_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de documentos para autenticados" ON public.farm_documents;
CREATE POLICY "Lectura de documentos para autenticados" ON public.farm_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insercion de documentos para autenticados" ON public.farm_documents;
CREATE POLICY "Insercion de documentos para autenticados" ON public.farm_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de documentos para autenticados" ON public.farm_documents;
CREATE POLICY "Modificacion de documentos para autenticados" ON public.farm_documents FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Lectura publica de documentos anon" ON public.farm_documents;
CREATE POLICY "Lectura publica de documentos anon" ON public.farm_documents FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para documentos" ON public.farm_documents;
CREATE POLICY "Acceso completo service_role para documentos" ON public.farm_documents FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. TABLA FARM_DOCUMENT_CHUNKS (Fragmentos Semánticos con Embeddings 768d)
CREATE TABLE IF NOT EXISTS public.farm_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    document_id UUID NOT NULL REFERENCES public.farm_documents(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768), -- text-embedding-004 de Google Gemini
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_farm_document_chunks_doc_id ON public.farm_document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_farm_document_chunks_file_type ON public.farm_document_chunks (file_type);

-- Índice IVFFlat / HNSW para búsqueda rápida por similitud coseno
CREATE INDEX IF NOT EXISTS idx_farm_chunks_embedding_hnsw
ON public.farm_document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

ALTER TABLE public.farm_document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de chunks para autenticados" ON public.farm_document_chunks;
CREATE POLICY "Lectura de chunks para autenticados" ON public.farm_document_chunks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insercion de chunks para autenticados" ON public.farm_document_chunks;
CREATE POLICY "Insercion de chunks para autenticados" ON public.farm_document_chunks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura publica de chunks anon" ON public.farm_document_chunks;
CREATE POLICY "Lectura publica de chunks anon" ON public.farm_document_chunks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para chunks" ON public.farm_document_chunks;
CREATE POLICY "Acceso completo service_role para chunks" ON public.farm_document_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 4. FUNCIÓN RPC: match_document_chunks
-- Realiza búsqueda por similitud de coseno entre el embedding de consulta y la base vectorial.
CREATE OR REPLACE FUNCTION public.match_document_chunks(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.40,
    match_count INT DEFAULT 8,
    filter_file_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    document_name TEXT,
    file_type TEXT,
    chunk_index INT,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.document_id,
        c.document_name,
        c.file_type,
        c.chunk_index,
        c.content,
        1 - (c.embedding <=> query_embedding) AS similarity,
        c.metadata
    FROM public.farm_document_chunks c
    WHERE
        c.embedding IS NOT NULL
        AND (filter_file_type IS NULL OR c.file_type = filter_file_type)
        AND 1 - (c.embedding <=> query_embedding) >= match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_document_chunks TO authenticated, anon, service_role;

