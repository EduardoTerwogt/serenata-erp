-- Migration: proveedor_documentos_detalle_validacion
-- Purpose: Punto 2 (2026-09-20, cierre de la revisión de Documentación del
-- Portal): proveedor_documentos.estado_validacion nunca se movía de
-- 'pendiente' -- ningún mecanismo en el repo lo escribía. Se resuelve con
-- clasificación híbrida: auto-clasifica con la misma lectura de IA que ya
-- corre para matching/régimen fiscal (document-parser.ts), y staff puede
-- corregir a mano desde el modal de Proveedores. Mismo patrón de columna
-- que documentos_cuentas_cobrar/documentos_cuentas_pagar
-- (20260906_fase53_documentos_detalle_validacion.sql).

BEGIN;

ALTER TABLE proveedor_documentos
  ADD COLUMN IF NOT EXISTS detalle_validacion TEXT NULL;

COMMENT ON COLUMN proveedor_documentos.detalle_validacion IS
  'Texto libre con el motivo cuando estado_validacion = revision (auto-clasificación que no pudo leer el documento, o nota de staff). NULL en pendiente/validado.';

COMMIT;
