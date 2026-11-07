-- ====================================================================
-- SCRIPT COMPLETO DE CATASTRO, INVENTARIO Y CAMINOS
-- CAMPITO JOROX
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. TABLA DE INVENTARIO Y ELEMENTOS GEORREFERENCIADOS (ÁRBOLES, RIEGO, ARQUETAS)
CREATE TABLE IF NOT EXISTS public.farm_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    
    -- Identificación y taxonomía
    name TEXT NOT NULL,                                -- Ej: "Aguacate Hass #14", "Arqueta Sector Norte"
    category TEXT NOT NULL DEFAULT 'arbol' CHECK (category IN (
        'arbol', 'planta', 'riego_linea', 'arqueta', 
        'acequia', 'piedra_linde', 'pozo_deposito', 'maquinaria', 'otro'
    )),
    variety_type TEXT,                                 -- Ej: "Hass", "Bacon", "Fuerte", "Tubería 32mm"
    
    -- Localización geográfica precisa
    latitude NUMERIC(10, 7) NOT NULL,                  -- Latitud WGS84
    longitude NUMERIC(10, 7) NOT NULL,                 -- Longitud WGS84
    accuracy_meters NUMERIC(6, 2),                     -- Precisión GPS en metros
    altitude_meters NUMERIC(7, 2),                     -- Altitud sobre el nivel del mar
    zone TEXT,                                         -- Ej: "Bancal 1", "Sector Norte", "Linde Este"
    
    -- Telemetría de la sesión de voz
    audio_timestamp_s NUMERIC(8, 2),                   -- Segundo del audio donde se mencionó
    gps_warning BOOLEAN DEFAULT false,                 -- true si la precisión GPS superó los 6 metros
    
    -- Estado fitosanitario o de infraestructura
    status TEXT DEFAULT 'saludable' CHECK (status IN (
        'saludable', 'clorosis', 'poda_requerida', 'enfermo', 
        'seco', 'observaciones', 'bueno', 'mantenimiento', 'obstruido'
    )),
    image_url TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices de inventario
CREATE INDEX IF NOT EXISTS idx_farm_inventory_coords ON public.farm_inventory (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_category ON public.farm_inventory (category);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_status ON public.farm_inventory (status);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_active ON public.farm_inventory (is_active);

-- Habilitar RLS
ALTER TABLE public.farm_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura de inventario a autenticados" 
ON public.farm_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir inserción de inventario a autenticados" 
ON public.farm_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir actualización de inventario a autenticados" 
ON public.farm_inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminación de inventario a autenticados" 
ON public.farm_inventory FOR DELETE TO authenticated USING (true);

CREATE POLICY "Permitir lectura publica de inventario" 
ON public.farm_inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir insercion publica de inventario" 
ON public.farm_inventory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir actualizacion publica de inventario" 
ON public.farm_inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminacion publica de inventario" 
ON public.farm_inventory FOR DELETE TO anon USING (true);


-- 2. TABLA DE CAMINOS, SENDEROS Y LÍNEAS DE RIEGO (GEOMETRÍAS Y LÍNEAS)
CREATE TABLE IF NOT EXISTS public.farm_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    
    name TEXT NOT NULL,                                -- Ej: "Camino Principal", "Sendero Aguacates"
    path_type TEXT NOT NULL DEFAULT 'camino' CHECK (path_type IN (
        'camino', 'sendero', 'linea_riego', 'acequia', 'linde', 'manguera', 'otro'
    )),
    coordinates JSONB NOT NULL,                        -- Array de [{ lat, lng, alt? }]
    color TEXT NOT NULL DEFAULT '#f97316',
    stroke_width NUMERIC NOT NULL DEFAULT 4,
    stroke_style TEXT NOT NULL DEFAULT 'solid',
    length_meters NUMERIC(10, 2),                      -- Distancia real en metros
    zone TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices de caminos
CREATE INDEX IF NOT EXISTS idx_farm_paths_type ON public.farm_paths (path_type);
CREATE INDEX IF NOT EXISTS idx_farm_paths_active ON public.farm_paths (is_active);

-- Habilitar RLS
ALTER TABLE public.farm_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura de caminos a usuarios autenticados" 
ON public.farm_paths FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir inserción de caminos a usuarios autenticados" 
ON public.farm_paths FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir actualización de caminos a usuarios autenticados" 
ON public.farm_paths FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminación de caminos a usuarios autenticados" 
ON public.farm_paths FOR DELETE TO authenticated USING (true);

CREATE POLICY "Permitir lectura publica de caminos" 
ON public.farm_paths FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir insercion publica de caminos" 
ON public.farm_paths FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir actualizacion publica de caminos" 
ON public.farm_paths FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminacion publica de caminos" 
ON public.farm_paths FOR DELETE TO anon USING (true);

