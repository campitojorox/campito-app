-- ====================================================================
-- TABLA DE HISTORIAL DE CHAT IA PARA CAMPITO JOROX
-- Permite respaldar preguntas, respuestas y archivos en Google Drive
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

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

-- Índices para búsquedas y respaldos rápidos por fecha
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history (user_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: Usuarios autenticados pueden leer y escribir
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON public.chat_history;
CREATE POLICY "Permitir lectura para usuarios autenticados" 
ON public.chat_history FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Permitir insercion para usuarios autenticados" ON public.chat_history;
CREATE POLICY "Permitir insercion para usuarios autenticados" 
ON public.chat_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Permitir acceso al Service Role (para script de respaldo y APIs)
DROP POLICY IF EXISTS "Permitir todo para service_role" ON public.chat_history;
CREATE POLICY "Permitir todo para service_role"
ON public.chat_history FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
