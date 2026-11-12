-- ====================================================================
-- SCRIPT CONSOLIDADO IDEMPOTENTE: 5 TABLAS DE CAMPITO JOROX
-- Tablas: farm_knowledge, farm_inventory, farm_paths, chat_history, ai_jobs
-- Ejecutar en Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. FARM_KNOWLEDGE
CREATE TABLE IF NOT EXISTS public.farm_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('cultivo', 'riego', 'parcela', 'maquinaria', 'suelo', 'general', 'proveedor', 'protocolo', 'plaga')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'chat',
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_farm_knowledge_category ON public.farm_knowledge (category);
CREATE INDEX IF NOT EXISTS idx_farm_knowledge_active ON public.farm_knowledge (is_active);
ALTER TABLE public.farm_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Lectura de conocimiento para autenticados" ON public.farm_knowledge FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insercion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Insercion de conocimiento para autenticados" ON public.farm_knowledge FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Modificacion de conocimiento para autenticados" ON public.farm_knowledge FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para backup" ON public.farm_knowledge;
CREATE POLICY "Acceso completo service_role para backup" ON public.farm_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. FARM_INVENTORY
CREATE TABLE IF NOT EXISTS public.farm_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('arbol', 'planta', 'riego_linea', 'arqueta', 'acequia', 'piedra_linde', 'pozo_deposito', 'maquinaria', 'otro')),
    variety_type TEXT,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(6, 2),
    altitude_meters NUMERIC(7, 2),
    zone TEXT,
    audio_timestamp_s NUMERIC(8, 2),
    gps_warning BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'saludable' CHECK (status IN ('saludable', 'clorosis', 'poda_requerida', 'enfermo', 'seco', 'observaciones', 'bueno', 'mantenimiento', 'obstruido')),
    image_url TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_farm_inventory_coords ON public.farm_inventory (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_category ON public.farm_inventory (category);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_status ON public.farm_inventory (status);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_active ON public.farm_inventory (is_active);
ALTER TABLE public.farm_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Lectura de inventario para autenticados" ON public.farm_inventory FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insercion de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Insercion de inventario para autenticados" ON public.farm_inventory FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Modificacion de inventario para autenticados" ON public.farm_inventory FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para backup" ON public.farm_inventory;
CREATE POLICY "Acceso completo service_role para backup" ON public.farm_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. FARM_PATHS
CREATE TABLE IF NOT EXISTS public.farm_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    name TEXT NOT NULL,
    path_type TEXT NOT NULL DEFAULT 'camino' CHECK (path_type IN ('camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'manguera', 'otro')),
    coordinates JSONB NOT NULL,
    color TEXT NOT NULL DEFAULT '#f97316',
    stroke_width NUMERIC NOT NULL DEFAULT 4,
    stroke_style TEXT NOT NULL DEFAULT 'solid' CHECK (stroke_style IN ('solid', 'dashed', 'dotted')),
    length_meters NUMERIC(10, 2),
    zone TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_farm_paths_type ON public.farm_paths (path_type);
CREATE INDEX IF NOT EXISTS idx_farm_paths_active ON public.farm_paths (is_active);
ALTER TABLE public.farm_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de caminos a usuarios autenticados" ON public.farm_paths;
CREATE POLICY "Permitir lectura de caminos a usuarios autenticados" ON public.farm_paths FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserción de caminos a usuarios autenticados" ON public.farm_paths;
CREATE POLICY "Permitir inserción de caminos a usuarios autenticados" ON public.farm_paths FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualización de caminos a usuarios autenticados" ON public.farm_paths;
CREATE POLICY "Permitir actualización de caminos a usuarios autenticados" ON public.farm_paths FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminación de caminos a usuarios autenticados" ON public.farm_paths;
CREATE POLICY "Permitir eliminación de caminos a usuarios autenticados" ON public.farm_paths FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir lectura publica de caminos" ON public.farm_paths FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir insercion publica de caminos" ON public.farm_paths FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir actualizacion publica de caminos" ON public.farm_paths FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir eliminacion publica de caminos" ON public.farm_paths FOR DELETE TO anon USING (true);

-- 4. CHAT_HISTORY
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
    session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history (user_id);
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON public.chat_history;
CREATE POLICY "Permitir lectura para usuarios autenticados" ON public.chat_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion para usuarios autenticados" ON public.chat_history;
CREATE POLICY "Permitir insercion para usuarios autenticados" ON public.chat_history FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo para service_role" ON public.chat_history;
CREATE POLICY "Permitir todo para service_role" ON public.chat_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. AI_JOBS
CREATE TABLE IF NOT EXISTS public.ai_jobs (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    section TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    actions_applied BOOLEAN NOT NULL DEFAULT false,
    persisted_to_db BOOLEAN NOT NULL DEFAULT false,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    result JSONB,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_section_status ON public.ai_jobs (section, status, created_at DESC);
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo service_role para ai_jobs" ON public.ai_jobs;
CREATE POLICY "Acceso completo service_role para ai_jobs" ON public.ai_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura ai_jobs para usuarios autenticados" ON public.ai_jobs;
CREATE POLICY "Lectura ai_jobs para usuarios autenticados" ON public.ai_jobs FOR SELECT TO authenticated USING (true);

