-- Generador sintético de volumen para la curva de escala (docs/PLAN.md, D18, B7).
--
-- Crea `v_n` proyectos aprobados con la forma del dataset de carga de
-- serenata-erp-test: 5 renglones por cotización, cada uno con su proveedor y su
-- grupo de pago (≈4.99 grupos por proyecto), 1 cuenta por cobrar por proyecto,
-- casi todo ABIERTO / FACTURA_PENDIENTE y 10 % de cobros ya facturados. Todo va
-- en bloque (set-based), con el prefijo `ESC` en ids, folios y nombres, así que
-- `escala-limpiar.sql` lo retira completo sin tocar nada más.
--
-- Parámetros (editar las tres primeras líneas de DECLARE):
--   v_n       proyectos a crear.
--   v_meses   1 = todos en el mes `v_mes0` (la forma del dataset de test, el peor
--             caso de una sola vista de mes); 12 = repartidos en todo el año.
--   v_anio    año de las fechas de entrega.
--
-- Se niega a correr fuera de una BD de pruebas: exige la tabla `loadtest_runs`
-- (solo existe en serenata-erp-test) o la variable `app.escala_local` = 'on'
-- (BD local de verificación: `SET app.escala_local = 'on';` antes de correrlo).
--
-- Uso:  psql -d <bd> -f scripts/db/escala-generador.sql   (o pegarlo en el SQL Editor)

DO $gen$
DECLARE
  v_n      int  := 500;
  v_meses  int  := 1;
  v_anio   int  := 2026;
  v_mes0   int  := 10;
  v_ini    int;
BEGIN
  IF NOT (to_regclass('public.loadtest_runs') IS NOT NULL OR current_setting('app.escala_local', true) = 'on') THEN
    RAISE EXCEPTION 'escala-generador: solo corre en serenata-erp-test o en una BD local con app.escala_local = on';
  END IF;
  IF EXISTS (SELECT 1 FROM cotizaciones WHERE id LIKE 'ESC%') THEN
    SELECT max(substr(id, 4)::int) INTO v_ini FROM cotizaciones WHERE id ~ '^ESC[0-9]+$';
  END IF;
  v_ini := COALESCE(v_ini, 0);

  CREATE TEMP TABLE _esc ON COMMIT DROP AS
  SELECT g AS i,
         'ESC' || lpad(g::text, 6, '0') AS id,
         make_date(v_anio, CASE WHEN v_meses = 1 THEN v_mes0 ELSE 1 + (g % 12) END, 1 + (g % 27)) AS fecha
  FROM generate_series(v_ini + 1, v_ini + v_n) g;

  ALTER TABLE _esc ADD COLUMN cliente_id uuid DEFAULT gen_random_uuid();

  INSERT INTO clientes (id, nombre, tipo, activo)
  SELECT cliente_id, 'ESC Cliente ' || i, 'Agencia', true FROM _esc;

  -- Un proveedor distinto por renglón: cada renglón vive en su propio grupo de pago (≈5 por proyecto).
  CREATE TEMP TABLE _esc_items ON COMMIT DROP AS
  SELECT gen_random_uuid() AS item_id, gen_random_uuid() AS prov_id, gen_random_uuid() AS grupo_id, e.id AS cot, e.i, k
  FROM _esc e, generate_series(1, 5) k;

  INSERT INTO proveedores (id, nombre, roles, activo, regimen_fiscal)
  SELECT prov_id, 'ESC Proveedor ' || i || '-' || k, ARRAY['Producción'], true, CASE WHEN k % 2 = 0 THEN 'fisica' ELSE 'moral' END
  FROM _esc_items;

  -- Cotizaciones EMITIDAS (los renglones de una APROBADA están congelados): se aprueban al final.
  INSERT INTO cotizaciones (id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo, estado,
                            subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total)
  SELECT e.id, 'ESC Cliente ' || e.i, e.cliente_id, 'ESC Proyecto ' || e.i, e.fecha::text, 'CDMX', e.fecha - 20, 'PRINCIPAL', 'EMITIDA',
         15000.00, 450.00, 17250.00, 2760.00, 20010.00, 5000.00, 5450.00
  FROM _esc e;

  INSERT INTO proyectos (id, proyecto, fecha_entrega, locacion, estado)
  SELECT e.id, 'ESC Proyecto ' || e.i, e.fecha, 'CDMX', 'PREPRODUCCION' FROM _esc e;

  -- cantidad 1, precio 3,000, costo 2,000, margen 1,000: consistente con los CHECK de B5c.
  INSERT INTO items_cotizacion (id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe, responsable_id, costo_unitario, margen, orden)
  SELECT item_id, cot, 'Producción', 'ESC renglón ' || i || '-' || k, 1, 3000, 3000, prov_id, 2000, 1000, k FROM _esc_items;

  INSERT INTO cuentas_pagar_grupos (id, proyecto_id, responsable_id, estado, monto_total, monto_pagado)
  SELECT grupo_id, cot, prov_id, 'ABIERTO', 2000, 0 FROM _esc_items;

  INSERT INTO cuentas_pagar (id, folio, cotizacion_id, proyecto_id, item_id, responsable_id, costo_total, estado, monto_pagado, grupo_id)
  SELECT gen_random_uuid(), 'ESC-CP-' || lpad(i::text, 6, '0') || '-' || k, cot, cot, item_id, prov_id, 2000, 'PENDIENTE', 0, grupo_id
  FROM _esc_items;

  INSERT INTO cuentas_cobrar (id, folio, cotizacion_id, proyecto_id, monto_total, monto_pagado, fecha_factura, fecha_vencimiento)
  SELECT gen_random_uuid(), 'ESC-CC-' || lpad(e.i::text, 6, '0'), e.id, e.id, 20010.00, 0,
         CASE WHEN e.i % 10 = 0 THEN e.fecha + 3 END, CASE WHEN e.i % 10 = 0 THEN e.fecha + 33 END
  FROM _esc e;

  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id IN (SELECT id FROM _esc);
END
$gen$;
