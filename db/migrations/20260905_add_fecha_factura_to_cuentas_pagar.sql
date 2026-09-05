-- Migration: add_fecha_factura_to_cuentas_pagar
-- Purpose: cierra un tercer bug real encontrado por las pruebas de
-- integracion real de Fase 4.5 Punto 3 (tests/e2e/live/basic.spec.ts,
-- corrida CI 33937465776) -- confirmado que no es problema de las pruebas.
--
-- lib/types.ts declara CuentaPagar.fecha_factura, y
-- app/api/cuentas-pagar/[id]/subir-factura/route.ts siempre intenta
-- persistirla tras extraerla del XML real (updateCuentaPagar(id,
-- { fecha_factura: ... })), pero la columna nunca existio en la tabla
-- cuentas_pagar (a diferencia de cuentas_cobrar, que si la tiene desde
-- db/migrations/20260410_cuentas_cobrar_completa.sql). PostgREST fallaba
-- con "Could not find the 'fecha_factura' column of 'cuentas_pagar' in
-- the schema cache" (PGRST204), y como esa llamada esta dentro del mismo
-- try/catch que crea los documentos, la respuesta completa se reportaba
-- como error 500 al usuario aunque los documentos (factura XML + PDF)
-- ya se hubieran subido a Drive y guardado correctamente en
-- documentos_cuentas_pagar.
--
-- fecha_vencimiento tambien esta declarada en CuentaPagar pero ningun
-- codigo la lee/escribe para cuentas_pagar (solo para cuentas_cobrar) --
-- no se agrega aqui para no tocar mas esquema del necesario.

ALTER TABLE cuentas_pagar ADD COLUMN IF NOT EXISTS fecha_factura DATE NULL;
COMMENT ON COLUMN cuentas_pagar.fecha_factura IS 'Fecha de emision de la factura de proveedor (extraida del XML).';
