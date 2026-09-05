-- Migration: fix_documentos_cuentas_pagar_y_estado_vencido
-- Purpose: cierra dos huecos reales entre el codigo de la app y el esquema,
-- encontrados por las pruebas de integracion real de Fase 4.5 Punto 3
-- (tests/e2e/live/basic.spec.ts, corrida CI 33936792723).
--
-- 1. documentos_cuentas_pagar.tipo nunca permitio 'FACTURA_PROVEEDOR_XML',
--    pero app/api/cuentas-pagar/[id]/subir-factura/route.ts (y el label en
--    TabDocumentos.tsx) siempre insertan ese valor al subir el XML de una
--    factura de proveedor. Toda subida de factura de proveedor fallaba con
--    "violates check constraint documentos_cuentas_pagar_tipo_check".
--
-- 2. cuentas_cobrar.estado nunca permitio 'VENCIDO', pero
--    lib/server/cuentas/status.ts (y lib/types.ts) si manejan ese estado
--    para cuentas por cobrar con el pago atrasado. El intento de
--    persistirlo fallaba en silencio con
--    "violates check constraint cuentas_cobrar_estado_check".

ALTER TABLE documentos_cuentas_pagar DROP CONSTRAINT documentos_cuentas_pagar_tipo_check;
ALTER TABLE documentos_cuentas_pagar ADD CONSTRAINT documentos_cuentas_pagar_tipo_check
  CHECK (tipo IN ('FACTURA_PROVEEDOR', 'FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO', 'OTRO'));

ALTER TABLE cuentas_cobrar DROP CONSTRAINT cuentas_cobrar_estado_check;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_estado_check
  CHECK (estado IN ('FACTURA_PENDIENTE', 'FACTURADO', 'PARCIALMENTE_PAGADO', 'PAGADO', 'VENCIDO'));
