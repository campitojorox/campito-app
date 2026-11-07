-- ====================================================================
-- TABLA DE CONOCIMIENTO Y MEMORIA PERMANENTE (KNOWLEDGE BASE)
-- Campito Jorox - Módulo de Aprendizaje Acumulativo de la Finca
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

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

-- Índices para búsqueda rápida de conocimiento
CREATE INDEX IF NOT EXISTS idx_farm_knowledge_category ON public.farm_knowledge (category);
CREATE INDEX IF NOT EXISTS idx_farm_knowledge_active ON public.farm_knowledge (is_active);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.farm_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Lectura de conocimiento para autenticados" 
ON public.farm_knowledge FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Insercion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Insercion de conocimiento para autenticados" 
ON public.farm_knowledge FOR INSERT 
TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de conocimiento para autenticados" ON public.farm_knowledge;
CREATE POLICY "Modificacion de conocimiento para autenticados" 
ON public.farm_knowledge FOR UPDATE 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para backup" ON public.farm_knowledge;
CREATE POLICY "Acceso completo service_role para backup" 
ON public.farm_knowledge FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
