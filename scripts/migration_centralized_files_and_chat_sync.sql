-- ====================================================================
-- MIGRACIÓN: CENTRALIZACIÓN DE ARCHIVOS, CHAT IA Y RESPALDO BIDIRECCIONAL
-- CAMPITO JOROX
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. TABLA CHAT_HISTORY (Historial y archivos adjuntos del Chat IA)
CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    file_url TEXT,
    file_name TEXT,
    model_used TEXT,
    session_id TEXT,
    drive_url TEXT,
    drive_file_id TEXT
);

-- Asegurar columnas drive_url y drive_file_id
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS drive_url TEXT;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history (user_id);

-- Habilitar RLS en chat_history con acceso público (anon y authenticated)
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica chat_history anon" ON public.chat_history;
CREATE POLICY "Lectura publica chat_history anon" ON public.chat_history FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insercion publica chat_history anon" ON public.chat_history;
CREATE POLICY "Insercion publica chat_history anon" ON public.chat_history FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizacion publica chat_history anon" ON public.chat_history;
CREATE POLICY "Actualizacion publica chat_history anon" ON public.chat_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Eliminacion publica chat_history anon" ON public.chat_history;
CREATE POLICY "Eliminacion publica chat_history anon" ON public.chat_history FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para chat_history" ON public.chat_history;
CREATE POLICY "Acceso completo service_role para chat_history" ON public.chat_history FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. TABLA FARM_DOCUMENTS (Biblioteca centralizada RAG de documentos y mapas)
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
    is_active BOOLEAN NOT NULL DEFAULT true,
    drive_url TEXT,
    drive_file_id TEXT
);

-- Asegurar columnas adicionales
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
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS drive_url TEXT;
ALTER TABLE public.farm_documents ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

-- Políticas públicas para farm_documents
ALTER TABLE public.farm_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Lectura publica de farm_documents anon" ON public.farm_documents FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insercion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Insercion publica de farm_documents anon" ON public.farm_documents FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizacion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Actualizacion publica de farm_documents anon" ON public.farm_documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Eliminacion publica de farm_documents anon" ON public.farm_documents;
CREATE POLICY "Eliminacion publica de farm_documents anon" ON public.farm_documents FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para farm_documents" ON public.farm_documents;
CREATE POLICY "Acceso completo service_role para farm_documents" ON public.farm_documents FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. STORAGE: BUCKET 'comprobantes' (Almacenamiento universal público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Lectura publica comprobantes" ON storage.objects;
CREATE POLICY "Lectura publica comprobantes"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Subida publica comprobantes" ON storage.objects;
CREATE POLICY "Subida publica comprobantes"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Actualizacion comprobantes" ON storage.objects;
CREATE POLICY "Actualizacion comprobantes"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'comprobantes')
WITH CHECK (bucket_id = 'comprobantes');

DROP POLICY IF EXISTS "Borrado comprobantes" ON storage.objects;
CREATE POLICY "Borrado comprobantes"
ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'comprobantes');


-- 4. REALTIME: SINCRONIZACIÓN INSTANTÁNEA MÓVIL <-> MAC
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_history;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'farm_documents'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_documents;
    END IF;
END $$;

