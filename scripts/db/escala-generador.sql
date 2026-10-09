-- Generador sintético de volumen para la curva de escala (docs/PLAN.md, D18, B7).
--
-- Crea `v_n` proyectos aprobados con la forma del dataset de carga de
-- serenata-erp-test: 5 renglones por cotización, cada uno con su proveedor y su
-- grupo de pago (≈4.99 grupos por proyecto), 1 cuenta por cobrar por proyecto,
-- todo ABIERTO / FACTURA_PENDIENTE (con v_docs, facturado y pagado en parte). Todo va
-- en bloque (set-based), con el prefijo `ESC` en ids, folios y nombres, así que
-- `escala-limpiar.sql` lo retira completo sin tocar nada más.
--
-- Parámetros: se leen de variables de sesión (`SET app.escala_n = '2700';` antes de correrlo) y, si no
-- están, usan el valor entre paréntesis. Sin ninguna, hace lo de siempre (500 proyectos en un solo año).
--   app.escala_n         (500)   proyectos a crear POR AÑO.
--   app.escala_meses     (1)     1 = todos en el mes `app.escala_mes0` (la forma del dataset de test, el peor
--                                caso de una sola vista de mes); 12 = repartidos en todo el año. Los años
--                                anteriores al primero siempre van repartidos (12).
--   app.escala_anio      (2026)  año más reciente de las fechas de entrega.
--   app.escala_mes0      (10)    mes de `app.escala_meses = 1`.
--   app.escala_docs      (true)  true = además siembra facturas y 2 pagos por cuenta y por grupo (ver el bloque final);
--                                false = sin documentos ni pagos (todo FACTURA_PENDIENTE / ABIERTO).
--   app.escala_anios     (1)     cuántos años crear hacia atrás desde `app.escala_anio` (10 = diez años de historial).
--   app.escala_res_actual (0)    % de proyectos RESUELTOS del año más reciente (cobro PUE cobrado al 100% y todos
--                                sus grupos pagados con factura y comprobante: ningún paso pendiente).
--   app.escala_res_viejos (95)   % de resueltos de los años anteriores (un historial real está casi todo resuelto).
-- Con los valores por omisión el resultado es idéntico al de la versión anterior de este script.
--
-- Se niega a correr fuera de una BD de pruebas: exige la tabla `loadtest_runs`
-- (solo existe en serenata-erp-test) o la variable `app.escala_local` = 'on'
-- (BD local de verificación: `SET app.escala_local = 'on';` antes de correrlo).
--
-- Uso:  psql -d <bd> -f scripts/db/escala-generador.sql   (o pegarlo en el SQL Editor)

DO $gen$
DECLARE
  v_n      int  := COALESCE(nullif(current_setting('app.escala_n', true), '')::int, 500);
  v_meses  int  := COALESCE(nullif(current_setting('app.escala_meses', true), '')::int, 1);
  v_anio0  int  := COALESCE(nullif(current_setting('app.escala_anio', true), '')::int, 2026);
  v_mes0   int  := COALESCE(nullif(current_setting('app.escala_mes0', true), '')::int, 10);
  v_docs   boolean := COALESCE(nullif(current_setting('app.escala_docs', true), '')::boolean, true);
  v_anios  int  := COALESCE(nullif(current_setting('app.escala_anios', true), '')::int, 1);
  v_res_act   int := COALESCE(nullif(current_setting('app.escala_res_actual', true), '')::int, 0);
  v_res_viejo int := COALESCE(nullif(current_setting('app.escala_res_viejos', true), '')::int, 95);
  v_anio   int;
  v_res    int;
  v_off    int;
  v_ini    int;
BEGIN
  IF NOT (to_regclass('public.loadtest_runs') IS NOT NULL OR current_setting('app.escala_local', true) = 'on') THEN
    RAISE EXCEPTION 'escala-generador: solo corre en serenata-erp-test o en una BD local con app.escala_local = on';
  END IF;

 FOR v_off IN 0 .. v_anios - 1 LOOP
  v_anio := v_anio0 - v_off;
  v_res  := CASE WHEN v_off = 0 THEN v_res_act ELSE v_res_viejo END;
  DROP TABLE IF EXISTS _esc, _esc_items, _esc_fx, _esc_pg_cc, _esc_pg_pp;
  v_ini := NULL;
  IF EXISTS (SELECT 1 FROM cotizaciones WHERE id LIKE 'ESC%') THEN
    SELECT max(substr(id, 4)::int) INTO v_ini FROM cotizaciones WHERE id ~ '^ESC[0-9]+$';
  END IF;
  v_ini := COALESCE(v_ini, 0);

  CREATE TEMP TABLE _esc ON COMMIT DROP AS
  SELECT g AS i,
         'ESC' || lpad(g::text, 6, '0') AS id,
         make_date(v_anio, CASE WHEN v_meses = 1 AND v_off = 0 THEN v_mes0 ELSE 1 + (g % 12) END, 1 + (g % 27)) AS fecha,
         -- Resuelto: determinista por posición dentro del año (el 100% de v_res por cada 100 proyectos).
         ((g - v_ini - 1) % 100) < v_res AS res
  FROM generate_series(v_ini + 1, v_ini + v_n) g;

  ALTER TABLE _esc ADD COLUMN cliente_id uuid DEFAULT gen_random_uuid();

  INSERT INTO clientes (id, nombre, tipo, activo)
  SELECT cliente_id, 'ESC Cliente ' || i, 'Agencia', true FROM _esc;

  -- Un proveedor distinto por renglón: cada renglón vive en su propio grupo de pago (≈5 por proyecto).
  CREATE TEMP TABLE _esc_items ON COMMIT DROP AS
  SELECT gen_random_uuid() AS item_id, gen_random_uuid() AS prov_id, gen_random_uuid() AS grupo_id, e.id AS cot, e.i, k, e.res
  FROM _esc e, generate_series(1, 5) k;

  -- Las tablas temporales y las recién insertadas no tienen estadísticas dentro de la transacción: sin ANALYZE el
  -- planificador elige lazos anidados (estimaba 1 fila) y el tiempo crecía con el volumen acumulado.
  ANALYZE _esc;
  ANALYZE _esc_items;

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

  -- Sin factura no hay fecha de factura (#123: `auditar_consistencia()` las exige juntas); con v_docs se facturan abajo.
  INSERT INTO cuentas_cobrar (id, folio, cotizacion_id, proyecto_id, monto_total, monto_pagado)
  SELECT gen_random_uuid(), 'ESC-CC-' || lpad(e.i::text, 6, '0'), e.id, e.id, 20010.00, 0
  FROM _esc e;

  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id IN (SELECT id FROM _esc);

  -- Documentos y pagos (#123): ≥1 factura y 2 pagos por cuenta y por grupo, en el modelo de #123 (cada pago es una
  -- cabecera `pagos` con su línea por cuenta o grupo; la factura de cobro es una FACTURA_XML sin ancla de cuenta,
  -- a la que apunta `cuentas_cobrar.factura_documento_id` y de la que cuelga el PDF). Sirve de línea base de
  -- `escala.yml` y de volumen para el backfill. Se apaga con v_docs := false.
  --   Cobro:     cada cuenta con FACTURA_XML (PPD, validada) + FACTURA_PDF y 2 pagos de 5,002.50
  --              (parcial, 10,005.00) o de 10,005.00 (pagada, 20,010.00; 1 de cada 3).
  --   Proveedor: cada grupo con FACTURA_PROVEEDOR_XML (validada) + FACTURA_PROVEEDOR y 2 pagos de
  --              1,000 (pagado) o de 1,000 + 500 (en proceso; 1 de cada 3 pagados). Un solo renglón
  --              por grupo, así que el prorrateo a la hija es el monto completo.
  -- Las cabeceras `pagos` se marcan con created_by = 'escala' (así las retira escala-limpiar.sql). Las cachés
  -- (monto_pagado, fechas, estados) se escriben igual que las RPC de pago.
  IF v_docs THEN
    ANALYZE cuentas_cobrar;
    UPDATE cuentas_cobrar cc SET fecha_factura = e.fecha + 3, fecha_vencimiento = e.fecha + 33
    FROM _esc e WHERE cc.cotizacion_id = e.id;

    CREATE TEMP TABLE _esc_fx ON COMMIT DROP AS
    SELECT gen_random_uuid() AS id, cc.id AS cuenta_id, cc.folio, e.res
    FROM cuentas_cobrar cc JOIN _esc e ON e.id = cc.cotizacion_id;

    INSERT INTO documentos_cuentas_cobrar (id, tipo, archivo_url, archivo_nombre, estado_validacion, uuid_cfdi, total_cfdi, metodo_pago_cfdi)
    SELECT f.id, 'FACTURA_XML', 'https://esc.invalid/' || f.folio || '.xml', f.folio || '.xml', 'validado',
           gen_random_uuid()::text, 20010.00, CASE WHEN f.res THEN 'PUE' ELSE 'PPD' END
    FROM _esc_fx f;
    UPDATE cuentas_cobrar cc SET factura_documento_id = f.id FROM _esc_fx f WHERE cc.id = f.cuenta_id;
    INSERT INTO documentos_cuentas_cobrar (factura_documento_id, tipo, archivo_url, archivo_nombre, estado_validacion)
    SELECT f.id, 'FACTURA_PDF', 'https://esc.invalid/' || f.folio || '.pdf', f.folio || '.pdf', 'pendiente'
    FROM _esc_fx f;

    CREATE TEMP TABLE _esc_pg_cc ON COMMIT DROP AS
    SELECT gen_random_uuid() AS pago_id, cc.id AS cuenta_id, cc.folio, n, e.fecha + 3 + n * 10 AS fecha,
           CASE WHEN e.res OR e.i % 3 = 0 THEN 10005.00 ELSE 5002.50 END AS monto
    FROM cuentas_cobrar cc JOIN _esc e ON e.id = cc.cotizacion_id, generate_series(1, 2) n;
    INSERT INTO pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, created_by)
    SELECT pago_id, 'cobro', fecha, 'TRANSFERENCIA', 'https://esc.invalid/' || folio || '-pago' || n || '.pdf', folio || '-pago' || n || '.pdf', 'escala'
    FROM _esc_pg_cc;
    INSERT INTO pagos_comprobantes (cuentas_cobrar_id, monto, pago_id) SELECT cuenta_id, monto, pago_id FROM _esc_pg_cc;

    ANALYZE _esc_pg_cc;
    ANALYZE pagos_comprobantes;
    UPDATE cuentas_cobrar cc SET
      monto_pagado = p.total,
      fecha_pago = CASE WHEN p.total >= cc.monto_total THEN p.ultima::timestamptz END
    FROM (SELECT cuenta_id, sum(monto) AS total, max(fecha) AS ultima FROM _esc_pg_cc GROUP BY cuenta_id) p
    WHERE cc.id = p.cuenta_id;

    INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, uuid_cfdi, total_cfdi)
    SELECT gen_random_uuid(), x.grupo_id, d.tipo, 'https://esc.invalid/' || x.grupo_id || '.' || d.ext, x.grupo_id || '.' || d.ext,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN 'validado' ELSE 'pendiente' END,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN gen_random_uuid()::text END,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN 2000.00 END
    FROM _esc_items x,
         (VALUES ('FACTURA_PROVEEDOR_XML', 'xml'), ('FACTURA_PROVEEDOR', 'pdf')) AS d(tipo, ext);

    CREATE TEMP TABLE _esc_pg_pp ON COMMIT DROP AS
    SELECT gen_random_uuid() AS pago_id, x.grupo_id, n, e.fecha + 10 + n * 10 AS fecha,
           CASE WHEN n = 1 OR x.res OR (x.i + x.k) % 3 = 0 THEN 1000.00 ELSE 500.00 END AS monto
    FROM _esc_items x JOIN _esc e ON e.i = x.i, generate_series(1, 2) n;
    INSERT INTO pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, created_by)
    SELECT pago_id, 'proveedor', fecha, 'TRANSFERENCIA', 'https://esc.invalid/' || grupo_id || '-pago' || n || '.pdf', grupo_id || '-pago' || n || '.pdf', 'escala'
    FROM _esc_pg_pp;
    INSERT INTO pagos_cuentas_pagar (pago_id, grupo_id, monto_transferido, monto_neto)
    SELECT pago_id, grupo_id, monto, monto FROM _esc_pg_pp;

    ANALYZE _esc_pg_pp;
    ANALYZE pagos_cuentas_pagar;
    ANALYZE cuentas_pagar_grupos;
    UPDATE cuentas_pagar_grupos g SET
      total_a_transferir = 2000.00,
      monto_pagado = p.neto,
      monto_transferido = p.transferido,
      estado = CASE WHEN p.transferido >= 2000.00 THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END,
      updated_at = now()
    FROM (SELECT grupo_id, sum(monto) AS neto, sum(monto) AS transferido, max(fecha) AS ultima FROM _esc_pg_pp GROUP BY grupo_id) p
    WHERE g.id = p.grupo_id;

    ANALYZE cuentas_pagar;
    -- La última fecha por grupo se agrega una vez (una subconsulta por fila escaneaba _esc_pg_pp completo: cuadrático).
    UPDATE cuentas_pagar cp SET
      monto_pagado = g.monto_pagado,
      estado = CASE WHEN g.estado = 'PAGADO' THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END,
      fecha_pago = CASE WHEN g.estado = 'PAGADO' THEN u.ultima END,
      updated_at = now()
    FROM cuentas_pagar_grupos g
    JOIN (SELECT grupo_id, max(fecha) AS ultima FROM _esc_pg_pp GROUP BY grupo_id) u ON u.grupo_id = g.id
    WHERE cp.grupo_id = g.id;
  END IF;
  RAISE NOTICE 'escala-generador: año % listo (% proyectos, % de resueltos) a las %', v_anio, v_n, v_res || '%', clock_timestamp();
 END LOOP;
END
$gen$;
