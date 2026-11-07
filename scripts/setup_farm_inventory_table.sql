-- ====================================================================
-- TABLA DE INVENTARIO AGRÍCOLA Y CATASTRO GPS EN TIEMPO REAL
-- Campito Jorox
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.farm_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    
    -- Identificación y taxonomía
    name TEXT NOT NULL,                                -- Ej: "Aguacate Hass #14", "Arqueta Sector Norte"
    category TEXT NOT NULL CHECK (category IN (
        'arbol', 'planta', 'riego_linea', 'arqueta', 
        'acequia', 'piedra_linde', 'pozo_deposito', 'maquinaria', 'otro'
    )),
    variety_type TEXT,                                 -- Ej: "Hass", "Bacon", "Fuerte", "Tubería 32mm"
    
    -- Localización geográfica precisa
    latitude NUMERIC(10, 7) NOT NULL,                  -- Latitud WGS84
    longitude NUMERIC(10, 7) NOT NULL,                 -- Longitud WGS84
    accuracy_meters NUMERIC(6, 2),                     -- Precisión GPS en metros (ej: 2.5)
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
    image_url TEXT,                                    -- Enlace a foto en Supabase Storage
    notes TEXT,                                        -- Comentarios, edad del árbol, fecha de poda
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices de búsqueda geográfica y categorización
CREATE INDEX IF NOT EXISTS idx_farm_inventory_coords ON public.farm_inventory (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_category ON public.farm_inventory (category);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_status ON public.farm_inventory (status);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_active ON public.farm_inventory (is_active);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.farm_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Lectura de inventario para autenticados" 
ON public.farm_inventory FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Insercion de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Insercion de inventario para autenticados" 
ON public.farm_inventory FOR INSERT 
TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Modificacion de inventario para autenticados" ON public.farm_inventory;
CREATE POLICY "Modificacion de inventario para autenticados" 
ON public.farm_inventory FOR UPDATE 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Acceso completo service_role para backup" ON public.farm_inventory;
CREATE POLICY "Acceso completo service_role para backup" 
ON public.farm_inventory FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
