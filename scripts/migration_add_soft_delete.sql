-- ====================================================================
-- MIGRACIÓN SUPABASE: BORRADO LÓGICO (SOFT DELETE) PARA TRANSACTIONS
-- Ejecutar en: https://supabase.com -> Tu Proyecto -> SQL Editor
-- ====================================================================

-- 1. Añadir columna status y deleted_at si no existen
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Asegurar que todas las transacciones históricas queden como 'ACTIVE'
UPDATE transactions 
SET status = 'ACTIVE' 
WHERE status IS NULL;
