-- Bloque 2 (docs/PLAN.md): agrega 'resico' (persona física RESICO, retención
-- ISR 1.25% Art. 113-J LISR, mismo IVA retenido 2/3 que física con
-- honorarios) al CHECK de regimen_fiscal. Aditivo -- todo el código que
-- asumía solo moral/fisica se actualiza en el mismo commit (lib/types.ts,
-- lib/validation/schemas.ts, lib/shared/factura-fiscal.ts,
-- lib/server/validation/factura-fiscal.ts, app/components/cuentas/utils.ts,
-- app/components/cuentas/tabs/TabInformacion.tsx, ProveedorModal.tsx,
-- app/portal/page.tsx, lib/server/portal/document-parser.ts).
--
-- El CHECK original (20260906_add_regimen_fiscal_responsables.sql) se creó
-- sin nombre explícito sobre la tabla `responsables`, antes del rename a
-- `proveedores` (20260906_fase53_bloque0_rename_responsables_a_proveedores.sql).
-- Postgres no renombra constraints al renombrar la tabla, así que el nombre
-- autogenerado sigue siendo responsables_regimen_fiscal_check.
BEGIN;

ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS responsables_regimen_fiscal_check;
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_regimen_fiscal_check;

ALTER TABLE proveedores
  ADD CONSTRAINT proveedores_regimen_fiscal_check
  CHECK (regimen_fiscal IN ('moral', 'fisica', 'resico'));

COMMENT ON COLUMN proveedores.regimen_fiscal IS
  'Regimen fiscal del proveedor para impuestos/retenciones al pagarle. NULL = no capturado aun (tratar como moral por default, 16% sin retencion). fisica = persona fisica con honorarios (retencion IVA 2/3 + ISR 10%). resico = persona fisica RESICO (retencion IVA 2/3 + ISR 1.25%, Art. 113-J LISR). moral = persona moral (IVA 16%, sin retencion).';

COMMIT;
