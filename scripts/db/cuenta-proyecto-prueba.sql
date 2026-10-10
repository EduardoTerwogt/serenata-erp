-- Prueba de la cuenta de proyecto (docs/PLAN.md, #140 B1: migración 20261042). Corre sobre la fixture de `cuentas-equivalencia.sql`
-- (la crea si falta) dentro de una transacción que se deshace: no deja nada en la base.
--
--   psql -d <bd> -v ON_ERROR_STOP=1 -f scripts/db/cuenta-proyecto-prueba.sql
--
-- Qué comprueba (`cierre` de `cuentas_periodo` con `proyecto`):
--   1. Invariante: cobrado con IVA = a transferir + SAT (IVA neto + retenciones) + utilidad antes de ISR, o sea `cuadre_diferencia = 0`
--      en todo proyecto de la fixture con cobros (EQ29 no tiene cobro registrado: es el único con diferencia, y es la que debe verse).
--   2. Factura real dentro de tolerancia: la retención de IVA es el residuo del Total del CFDI y el cuadre sigue en 0.
--   3. Factura fuera de tolerancia (+5.00): se conserva la retención estimada y la diferencia queda visible en `cuadre_diferencia`.
--   4. Sin factura (Total estimado) y los tres regímenes: el cuadre es 0.
--   5. `sat_total` = IVA neto + retenciones, y `cierre_mensual` ya no trae filas `isr` ni `proveedores`.
-- Termina con ROLLBACK; una aserción fallida aborta con error.
\set ON_ERROR_STOP on
\set solo_fixture 1
\i scripts/db/cuentas-equivalencia.sql

BEGIN;
SET LOCAL TimeZone = 'UTC';

CREATE FUNCTION pg_temp.cierre(p text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT cuentas_periodo(jsonb_build_object('anio', 2026, 'mes', 'todo', 'hoy', '2026-10-15', 'proyecto', p, 'vista', 'lista', 'page_size', 5))::jsonb
         -> 'seleccionado' -> 'cierre'
$f$;

CREATE FUNCTION pg_temp.num(j jsonb, k text) RETURNS numeric LANGUAGE sql AS $f$ SELECT (j ->> k)::numeric $f$;

-- 1. Invariante en toda la fixture.
DO $t$
DECLARE r record; malos text[] := '{}';
BEGIN
  FOR r IN SELECT id FROM proyectos WHERE id LIKE 'EQ%' ORDER BY id LOOP
    IF pg_temp.cierre(r.id) IS NOT NULL AND pg_temp.num(pg_temp.cierre(r.id), 'cuadre_diferencia') <> 0 THEN malos := malos || r.id; END IF;
  END LOOP;
  IF malos <> ARRAY['EQ29'] THEN RAISE EXCEPTION 'FALLA invariante: proyectos con diferencia %, se esperaba solo {EQ29}', malos; END IF;
  RAISE NOTICE 'ok invariante (solo EQ29, sin cobro registrado, tiene diferencia)';
END
$t$;

-- 2. Factura real de una persona física (EQ15) con el Total a ±2 centavos del estimado: manda el residuo y el cuadre sigue en 0.
DO $t$
DECLARE antes jsonb := pg_temp.cierre('EQ15'); despues jsonb; g uuid;
BEGIN
  SELECT id INTO g FROM cuentas_pagar_grupos WHERE proyecto_id = 'EQ15' AND total_a_transferir IS NOT NULL LIMIT 1;
  IF pg_temp.num(antes, 'cuadre_diferencia') <> 0 THEN RAISE EXCEPTION 'FALLA EQ15 ya descuadrado antes de tocarlo'; END IF;
  UPDATE cuentas_pagar_grupos SET total_a_transferir = total_a_transferir + 0.02 WHERE id = g;
  despues := pg_temp.cierre('EQ15');
  IF pg_temp.num(despues, 'cuadre_diferencia') <> 0 THEN RAISE EXCEPTION 'FALLA +0.02 dentro de tolerancia debía cuadrar: %', despues ->> 'cuadre_diferencia'; END IF;
  IF pg_temp.num(despues, 'iva_retenido_total') <> pg_temp.num(antes, 'iva_retenido_total') - 0.02 THEN
    RAISE EXCEPTION 'FALLA la retención de IVA debía absorber el residuo: % → %', antes ->> 'iva_retenido_total', despues ->> 'iva_retenido_total';
  END IF;
  IF pg_temp.num(despues, 'sat_total') <> round(pg_temp.num(despues, 'iva_neto_a_enterar') + pg_temp.num(despues, 'iva_retenido_total') + pg_temp.num(despues, 'isr_retenido_total'), 2) THEN
    RAISE EXCEPTION 'FALLA sat_total <> IVA neto + retenciones';
  END IF;
  RAISE NOTICE 'ok factura dentro de tolerancia';
END
$t$;

-- 3. Factura fuera de tolerancia (+5.00): la retención no se inventa y la diferencia se ve.
DO $t$
DECLARE antes jsonb; despues jsonb;
BEGIN
  UPDATE cuentas_pagar_grupos SET total_a_transferir = 1906.67 WHERE proyecto_id = 'EQ15' AND total_a_transferir IS NOT NULL;
  antes := pg_temp.cierre('EQ15');
  UPDATE cuentas_pagar_grupos SET total_a_transferir = 1911.67 WHERE proyecto_id = 'EQ15' AND total_a_transferir IS NOT NULL;
  despues := pg_temp.cierre('EQ15');
  IF pg_temp.num(despues, 'iva_retenido_total') <> 213.33 THEN RAISE EXCEPTION 'FALLA fuera de tolerancia debía conservar la retención estimada 213.33, dio %', despues ->> 'iva_retenido_total'; END IF;
  IF pg_temp.num(despues, 'cuadre_diferencia') <> pg_temp.num(antes, 'cuadre_diferencia') - 5 THEN RAISE EXCEPTION 'FALLA la diferencia de 5.00 debía verse: %', despues ->> 'cuadre_diferencia'; END IF;
  RAISE NOTICE 'ok factura fuera de tolerancia';
END
$t$;

-- 4. Sin factura (Total estimado) y los tres regímenes: el cuadre es 0.
DO $t$
DECLARE reg text; c jsonb;
BEGIN
  UPDATE cuentas_pagar_grupos SET total_a_transferir = NULL WHERE proyecto_id = 'EQ15';
  FOREACH reg IN ARRAY ARRAY['moral', 'fisica', 'resico'] LOOP
    UPDATE proveedores SET regimen_fiscal = reg WHERE id IN (SELECT responsable_id FROM cuentas_pagar_grupos WHERE proyecto_id = 'EQ15');
    c := pg_temp.cierre('EQ15');
    IF pg_temp.num(c, 'cuadre_diferencia') <> 0 THEN RAISE EXCEPTION 'FALLA % sin factura: diferencia %', reg, c ->> 'cuadre_diferencia'; END IF;
  END LOOP;
  RAISE NOTICE 'ok sin factura × 3 regímenes';
END
$t$;

-- 5. El cierre mensual ya no trae ISR ni proveedores, y la retención pendiente dice cuándo vence.
DO $t$
DECLARE n int; r text;
BEGIN
  SELECT count(*) INTO n
    FROM proyectos p, LATERAL jsonb_array_elements(cuentas_periodo(jsonb_build_object('anio', 2026, 'mes', 'todo', 'hoy', '2026-10-15', 'proyecto', p.id, 'vista', 'lista', 'page_size', 5))::jsonb -> 'seleccionado' -> 'cierre_mensual') f
   WHERE p.id LIKE 'EQ%' AND f ->> 'concepto' IN ('isr', 'proveedores');
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA el cierre mensual aún trae % filas isr/proveedores', n; END IF;
  SELECT f ->> 'sub' INTO r
    FROM proyectos p, LATERAL jsonb_array_elements(cuentas_periodo(jsonb_build_object('anio', 2026, 'mes', 'todo', 'hoy', '2026-10-15', 'proyecto', p.id, 'vista', 'lista', 'page_size', 5))::jsonb -> 'seleccionado' -> 'cierre_mensual') f
   WHERE p.id LIKE 'EQ%' AND f ->> 'concepto' = 'retenciones' AND f ->> 'mes' IS NULL LIMIT 1;
  IF r IS NOT NULL AND r <> '17 del mes siguiente al pago' THEN RAISE EXCEPTION 'FALLA rótulo de la retención pendiente: %', r; END IF;
  RAISE NOTICE 'ok cierre mensual';
END
$t$;

ROLLBACK;
