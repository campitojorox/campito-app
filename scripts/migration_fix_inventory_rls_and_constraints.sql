-- ====================================================================
-- MIGRACIÓN DE RESILIENCIA Y ACCESO PÚBLICO: FARM_INVENTORY Y FARM_PATHS
-- CAMPITO JOROX
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. Eliminar restricción de categorías rígida en farm_inventory
-- Permite guardar cualquier categoría dinámica ('Casas', 'Árboles', 'Frutales', etc.) sin error 23514
ALTER TABLE public.farm_inventory DROP CONSTRAINT IF EXISTS farm_inventory_category_check;

-- 2. Asegurar que las columnas acepten valores estándar sin truncado ni error
ALTER TABLE public.farm_inventory ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.farm_inventory ALTER COLUMN category SET DEFAULT 'otro';

-- 3. Habilitar políticas de acceso RLS para rol anon (dispositivos sin login activo o PWA móvil)
-- Garantiza que los pines y caminos se sincronicen de inmediato entre el móvil y Safari
ALTER TABLE public.farm_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de inventario" ON public.farm_inventory;
CREATE POLICY "Permitir lectura publica de inventario" 
ON public.farm_inventory FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de inventario" ON public.farm_inventory;
CREATE POLICY "Permitir insercion publica de inventario" 
ON public.farm_inventory FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion publica de inventario" ON public.farm_inventory;
CREATE POLICY "Permitir actualizacion publica de inventario" 
ON public.farm_inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion publica de inventario" ON public.farm_inventory;
CREATE POLICY "Permitir eliminacion publica de inventario" 
ON public.farm_inventory FOR DELETE TO anon USING (true);

-- 4. Verificar y asegurar políticas públicas en farm_paths
ALTER TABLE public.farm_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir lectura publica de caminos" 
ON public.farm_paths FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir insercion publica de caminos" 
ON public.farm_paths FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir actualizacion publica de caminos" 
ON public.farm_paths FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion publica de caminos" ON public.farm_paths;
CREATE POLICY "Permitir eliminacion publica de caminos" 
ON public.farm_paths FOR DELETE TO anon USING (true);

-- 5. Confirmación de publicación en tiempo real
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'farm_inventory'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_inventory;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'farm_paths'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.farm_paths;
    END IF;
END $$;
