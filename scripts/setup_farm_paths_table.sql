-- ====================================================================
-- TABLA DE CAMINOS, SENDEROS Y LÍNEAS DE RIEGO (GEOMETRÍAS Y LÍNEAS)
-- Campito Jorox
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.farm_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    
    -- Identificación
    name TEXT NOT NULL,                                -- Ej: "Camino Principal", "Sendero Aguacates", "Tubería Sector 2"
    path_type TEXT NOT NULL DEFAULT 'camino' CHECK (path_type IN (
        'camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'manguera', 'otro'
    )),
    
    -- Geometría: Array de coordenadas [{ lat: number, lng: number, alt?: number }]
    coordinates JSONB NOT NULL,
    
    -- Estilo visual (sin iconos, líneas de color)
    color TEXT NOT NULL DEFAULT '#f97316',              -- Color hexadecimal (#f97316 naranja, #3b82f6 azul, etc.)
    stroke_width NUMERIC NOT NULL DEFAULT 4,           -- Grosor de la línea en píxeles (2 a 8)
    stroke_style TEXT NOT NULL DEFAULT 'solid' CHECK (stroke_style IN ('solid', 'dashed', 'dotted')),
    
    -- Métricas calculadas
    length_meters NUMERIC(10, 2),                      -- Longitud total en metros
    zone TEXT,                                         -- Ej: "Sector Norte", "Bancal 3"
    notes TEXT,                                        -- Ej: "Apto para tractor", "Tubería polietileno 40mm"
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_farm_paths_type ON public.farm_paths (path_type);
CREATE INDEX IF NOT EXISTS idx_farm_paths_active ON public.farm_paths (is_active);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.farm_paths ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS permisivas para Campito Jorox
CREATE POLICY "Permitir lectura de caminos a usuarios autenticados" 
ON public.farm_paths FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserción de caminos a usuarios autenticados" 
ON public.farm_paths FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permitir actualización de caminos a usuarios autenticados" 
ON public.farm_paths FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir eliminación de caminos a usuarios autenticados" 
ON public.farm_paths FOR DELETE TO authenticated USING (true);

-- Soporte para clave anónima (anon / public)
CREATE POLICY "Permitir lectura publica de caminos" 
ON public.farm_paths FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir insercion publica de caminos" 
ON public.farm_paths FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Permitir actualizacion publica de caminos" 
ON public.farm_paths FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Permitir eliminacion publica de caminos" 
ON public.farm_paths FOR DELETE TO anon USING (true);

COMMENT ON TABLE public.farm_paths IS 'Trazados de caminos, senderos, acequias y tuberías de riego en Campito Jorox.';
