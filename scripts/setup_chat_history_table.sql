-- ====================================================================
-- SCRIPT COMPLETO DE BASE DE DATOS PARA CHAT IA & MEMORIA DE FINCA
-- Campito Jorox
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. TABLA DE HISTORIAL DE CHAT IA (Conversaciones y archivos adjuntos)
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
CREATE POLICY "Permitir lectura para usuarios autenticados" 
ON public.chat_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion para usuarios autenticados" ON public.chat_history;
CREATE POLICY "Permitir insercion para usuarios autenticados" 
ON public.chat_history FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo para service_role" ON public.chat_history;
CREATE POLICY "Permitir todo para service_role"
ON public.chat_history FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. TABLA DE MEMORIA Y APRENDIZAJE PERMANENTE (KNOWLEDGE BASE)
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
CREATE POLICY "Lectura de conocimiento para autenticados" 
ON public.farm_knowledge FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insercion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Insercion de conocimiento para autenticados" 
ON public.farm_knowledge FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Modificacion de conocimiento para autenticados" 
ON public.farm_knowledge FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para backup" ON public.farm_knowledge;
CREATE POLICY "Acceso completo service_role para backup" 
ON public.farm_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);
