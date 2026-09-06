-- Migration: add_regimen_fiscal_responsables
-- Purpose: Fase 5.1 (Cotizador) -- seccion "Impuestos (estimado)" y Fase 5.3
-- (cruce fiscal de Cuentas) necesitan saber si un responsable/proveedor es
-- persona moral o persona fisica con honorarios, para aplicar el escenario
-- fiscal correcto (documento maestro seccion 3):
--   Escenario A (moral): IVA 16% acreditable, sin retencion.
--   Escenario B (fisica): IVA 16%, retencion de IVA 2/3 (10.6667%) y
--   retencion de ISR 10%, ambas sobre el neto (X Pagar).
--
-- Se captura una sola vez por responsable (su ficha), no por
-- partida/cotizacion -- decision de negocio confirmada 2026-09-06.
-- NULL = no capturado todavia (responsable nuevo, o existente sin
-- constancia de situacion fiscal aun) -- se trata como 'moral' por
-- default en los calculos hasta que se capture el dato real.
--
-- Valores en minuscula ('moral' / 'fisica') para coincidir literal con el
-- design system final (ui_kits/serenata-app/CuentasScreen.jsx,
-- PortalScreen.jsx, data.js) y no traducir entre capas.
--
-- Probado primero en serenata-erp-test (columna + constraint + inserts de
-- prueba con rollback) antes de aplicar aqui.

ALTER TABLE responsables
  ADD COLUMN regimen_fiscal text
  CHECK (regimen_fiscal IN ('moral', 'fisica'));

COMMENT ON COLUMN responsables.regimen_fiscal IS
  'Regimen fiscal del responsable para impuestos/retenciones al pagarle. NULL = no capturado aun (tratar como ''moral'' por default, 16% sin retencion). ''fisica'' = persona fisica con honorarios (retencion IVA 2/3 + ISR 10%). ''moral'' = persona moral (IVA 16% normal, sin retencion).';
