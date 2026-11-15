-- ====================================================================
-- MIGRACIÓN: AÑADIR SOPORTE PARA COLORES PERSONALIZADOS DE SUBCATEGORÍAS
-- TABLA: public.farm_categories
-- CAMPITO JOROX
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Añadir columna subcategory_colors para guardar diccionario JSON de colores individuales por subcategoría
ALTER TABLE public.farm_categories 
ADD COLUMN IF NOT EXISTS subcategory_colors JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.farm_categories.subcategory_colors IS 'Diccionario JSON de colores hexadecimales personalizados para subcategorías (ej: {"Limonero": "#facc15", "Naranjo": "#f97316", "Olivo": "#65a30d"})';

