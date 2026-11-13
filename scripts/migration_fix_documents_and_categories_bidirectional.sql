-- ====================================================================
-- MIGRACIÓN: BIBLIOTECA DE ARCHIVOS Y CONEXIÓN BIDIRECCIONAL MÓVIL/MAC
-- CAMPITO JOROX
-- Ejecutar en Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Habilitar extensión pgvector si aún no está activa
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Asegurar columnas compatibles en public.farm_documents
CREATE TABLE IF NOT EXISTS public.farm_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    file_type TEXT,
    file_url TEXT,
    public_url TEXT,
    storage_path TEXT,
    size_bytes BIGINT DEFAULT 0,
    file_size BIGINT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'indexed',
    section_origin TEXT NOT NULL DEFAULT 'biblioteca',
    category TEXT NOT NULL DEFAULT 'general',
    chunk_count INT NOT NULL DEFAULT 0,
    geo_points_count INT NOT NULL DEFAULT 0,
    geo_paths_count INT NOT NULL DEFAULT 0,
    summary TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Añadir columnas por si la tabla ya existía con esquema parcial
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS public_url TEXT;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS section_origin TEXT DEFAULT 'biblioteca';
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS chunk_count INT DEFAULT 0;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS geo_points_count INT DEFAULT 0;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS geo_paths_count INT DEFAULT 0;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Relajar NOT NULL en columnas opcionales
ALTER TABLE public.farm_documents ALTER COLUMN public_url DROP NOT NULL;
ALTER TABLE public.farm_documents ALTER COLUMN storage_path DROP NOT NULL;

-- 3. Habilitar RLS y Políticas Públicas para Móvil y PWA (Rol anon y authenticated)
ALTER TABLE public.farm_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Lectura publica de farm_documents anon" ON public.farm_documents FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Insercion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Insercion publica de farm_documents anon" ON public.farm_documents FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizacion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Actualizacion publica de farm_documents anon" ON public.farm_documents FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Eliminacion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Eliminacion publica de farm_documents anon" ON public.farm_documents FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para farm_documents" ON public.farm_documents;
CREATE POLICY "Acceso completo service_role para farm_documents" ON public.farm_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Asegurar tabla farm_document_chunks y políticas públicas
CREATE TABLE IF NOT EXISTS public.farm_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    document_id UUID NOT NULL REFERENCES public.farm_documents(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.farm_document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de farm_document_chunks anon" ON public.farm_document_chunks;
CREATE POLICY "Lectura publica de farm_document_chunks anon" ON public.farm_document_chunks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Insercion publica de farm_document_chunks anon" ON public.farm_document_chunks;
CREATE POLICY "Insercion publica de farm_document_chunks anon" ON public.farm_document_chunks FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Eliminacion publica de farm_document_chunks anon" ON public.farm_document_chunks;
CREATE POLICY "Eliminacion publica de farm_document_chunks anon" ON public.farm_document_chunks FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para farm_document_chunks" ON public.farm_document_chunks;
CREATE POLICY "Acceso completo service_role para farm_document_chunks" ON public.farm_document_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Añadir farm_documents a Realtime para sincronización instantánea móvil <-> Mac
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'farm_documents'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_documents;
    END IF;
END $$;

-- 6. Asegurar políticas públicas de acceso al Storage Bucket 'comprobantes'
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Lectura publica comprobantes" ON storage.objects;
CREATE POLICY "Lectura publica comprobantes"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Subida publica comprobantes" ON storage.objects;
CREATE POLICY "Subida publica comprobantes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Actualizacion comprobantes" ON storage.objects;
CREATE POLICY "Actualizacion comprobantes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'comprobantes')
WITH CHECK (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Borrado comprobantes" ON storage.objects;
CREATE POLICY "Borrado comprobantes"
ON storage.objects FOR DELETE
USING (bucket_id = 'comprobantes');

