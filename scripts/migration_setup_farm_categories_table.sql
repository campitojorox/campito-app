-- ====================================================================
-- MIGRACIÓN DE ARQUITECTURA: TABLA NATIVA DE CATEGORÍAS (farm_categories)
-- Y CLASIFICACIÓN DESACOPLADA PARA PINES Y CAMINOS
-- CAMPITO JOROX
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Crear tabla centralizada de categorías
CREATE TABLE IF NOT EXISTS public.farm_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL UNIQUE,
    subcategories TEXT[] NOT NULL DEFAULT '{}',
    color TEXT NOT NULL DEFAULT '#00979d',
    icon TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_farm_categories_name ON public.farm_categories (name);
CREATE INDEX IF NOT EXISTS idx_farm_categories_active ON public.farm_categories (is_active);

-- 2. Asegurar columnas nativas en public.farm_paths (para no depender de JSON en zone)
ALTER TABLE public.farm_paths ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.farm_paths ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.farm_paths ADD COLUMN IF NOT EXISTS variety_type TEXT;

-- 3. Semilla de categorías maestras de Campito Jorox
INSERT INTO public.farm_categories (name, subcategories, color, is_default, is_active)
VALUES
    ('Árboles', ARRAY['Aguacate Hass', 'Aguacate Bacon', 'Olivo', 'Limonero', 'Naranjo', 'Algarrobo', 'Higuera', 'Frutales'], '#16a34a', true, true),
    ('Plantas', ARRAY['Huerta', 'Arbusto', 'Hierba', 'Palmera', 'Bambú'], '#4ade80', true, true),
    ('Riego / Agua', ARRAY['Llave de paso', 'Gotero', 'Filtro', 'Válvula', 'Arqueta', 'Pozo', 'Depósito', 'Tubería', 'Bomba', 'Acequia'], '#0284c7', true, true),
    ('Casas', ARRAY['Casita Cueva', 'Almacén', 'Taller', 'Caseta', 'Caravana'], '#eab308', true, true),
    ('Trazados', ARRAY['Camino', 'Carril agrícola', 'Sendero', 'MTB', 'Ríos / Arroyos', 'Línea de Riego', 'Acequia', 'Otro trazado'], '#f97316', true, true),
    ('Herramientas', ARRAY['Tractor', 'Maquinaria', 'Apero', 'Mobiliario', 'Equipo'], '#ea580c', true, true),
    ('Hitos', ARRAY['Mojón', 'Linde', 'Piedra', 'Cota catastral'], '#8b5cf6', true, true)
ON CONFLICT (name) DO UPDATE SET
    is_active = true,
    updated_at = now();

-- 4. Habilitar Row Level Security (RLS) y Políticas Públicas
ALTER TABLE public.farm_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de farm_categories anon" ON public.farm_categories;
CREATE POLICY "Lectura publica de farm_categories anon" ON public.farm_categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Insercion publica de farm_categories anon" ON public.farm_categories;
CREATE POLICY "Insercion publica de farm_categories anon" ON public.farm_categories FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizacion publica de farm_categories anon" ON public.farm_categories;
CREATE POLICY "Actualizacion publica de farm_categories anon" ON public.farm_categories FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Eliminacion publica de farm_categories anon" ON public.farm_categories;
CREATE POLICY "Eliminacion publica de farm_categories anon" ON public.farm_categories FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para farm_categories" ON public.farm_categories;
CREATE POLICY "Acceso completo service_role para farm_categories" ON public.farm_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Suscribir a Supabase Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'farm_categories'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_categories;
    END IF;
END $$;

