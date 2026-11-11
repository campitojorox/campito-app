-- ====================================================================
-- TABLA PARA TRABAJOS EN SEGUNDO PLANO DE CHAT IA (BACKGROUND JOBS)
-- Campito Jorox
-- Permite que las generaciones de IA sobrevivan recargas en Vercel Serverless
-- ====================================================================

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
CREATE POLICY "Acceso completo service_role para ai_jobs"
ON public.ai_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura ai_jobs para usuarios autenticados" ON public.ai_jobs;
CREATE POLICY "Lectura ai_jobs para usuarios autenticados"
ON public.ai_jobs FOR SELECT TO authenticated USING (true);

