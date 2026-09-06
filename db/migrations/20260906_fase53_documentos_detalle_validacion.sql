-- Migration: fase53_documentos_detalle_validacion
-- Purpose: Fase 5.3 (Cuentas) Bloque 2 -- columna para guardar el detalle de
-- discrepancia cuando estado_validacion = 'revision' (ej. "Monto no coincide:
-- XML $1,200.00 vs cuenta $1,000.00"). Confirmado explícitamente por el
-- usuario en el chat de Bloque 2.
--
-- Aplicado a producción (fwmyoqokcjtldiofuxdg) el 2026-09-06 vía
-- mcp__Supabase__apply_migration. Verificado post-aplicación.

BEGIN;

ALTER TABLE documentos_cuentas_cobrar
  ADD COLUMN IF NOT EXISTS detalle_validacion TEXT NULL;

ALTER TABLE documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS detalle_validacion TEXT NULL;

COMMENT ON COLUMN documentos_cuentas_cobrar.detalle_validacion IS
  'Texto libre con el detalle de qué campo no coincidió, solo cuando estado_validacion = revision. NULL en pendiente/validado.';
COMMENT ON COLUMN documentos_cuentas_pagar.detalle_validacion IS
  'Texto libre con el detalle de qué campo no coincidió, solo cuando estado_validacion = revision. NULL en pendiente/validado.';

COMMIT;
