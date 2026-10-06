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
--   v_docs    true = además siembra facturas y 2 pagos por cuenta y por grupo (ver el bloque final);
--             false = la forma original (sin documentos ni pagos, 10 % de cobros facturados).
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
  v_docs   boolean := true;
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

  -- Documentos y pagos (#123, B0): ≥1 factura y 2 pagos por cuenta, en el modelo 1:1 vigente
  -- (cada documento y cada pago cuelga de UNA cuenta o grupo). Sirve de línea base de `escala.yml`
  -- y de volumen para el backfill de B2. Se apaga con v_docs := false.
  --   Cobro:     cada cuenta con FACTURA_XML (PPD, validada) + FACTURA_PDF y 2 pagos de 5,002.50
  --              (parcial, 10,005.00) o de 10,005.00 (pagada, 20,010.00; 1 de cada 3).
  --   Proveedor: cada grupo con FACTURA_PROVEEDOR_XML (validada) + FACTURA_PROVEEDOR y 2 pagos de
  --              1,000 (pagado) o de 1,000 + 500 (en proceso; 1 de cada 3 pagados). Un solo renglón
  --              por grupo, así que el prorrateo a la hija es el monto completo.
  -- Las cachés (monto_pagado, fechas, estados) se escriben igual que las RPC de pago.
  IF v_docs THEN
    UPDATE cuentas_cobrar cc SET fecha_factura = e.fecha + 3, fecha_vencimiento = e.fecha + 33
    FROM _esc e WHERE cc.cotizacion_id = e.id;

    INSERT INTO documentos_cuentas_cobrar (id, cuentas_cobrar_id, tipo, archivo_url, archivo_nombre, estado_validacion,
                                           uuid_cfdi, total_cfdi, metodo_pago_cfdi)
    SELECT gen_random_uuid(), cc.id, d.tipo, 'https://esc.invalid/' || cc.folio || '.' || lower(split_part(d.tipo, '_', 2)),
           cc.folio || '.' || lower(split_part(d.tipo, '_', 2)), CASE WHEN d.tipo = 'FACTURA_XML' THEN 'validado' ELSE 'pendiente' END,
           CASE WHEN d.tipo = 'FACTURA_XML' THEN gen_random_uuid()::text END,
           CASE WHEN d.tipo = 'FACTURA_XML' THEN 20010.00 END,
           CASE WHEN d.tipo = 'FACTURA_XML' THEN 'PPD' END
    FROM cuentas_cobrar cc JOIN _esc e ON e.id = cc.cotizacion_id,
         (VALUES ('FACTURA_XML'), ('FACTURA_PDF')) AS d(tipo);

    INSERT INTO pagos_comprobantes (cuentas_cobrar_id, monto, tipo_pago, fecha_pago, comprobante_url, archivo_nombre)
    SELECT cc.id, CASE WHEN e.i % 3 = 0 THEN 10005.00 ELSE 5002.50 END, 'TRANSFERENCIA', e.fecha + 3 + n * 10,
           'https://esc.invalid/' || cc.folio || '-pago' || n || '.pdf', cc.folio || '-pago' || n || '.pdf'
    FROM cuentas_cobrar cc JOIN _esc e ON e.id = cc.cotizacion_id, generate_series(1, 2) n;

    UPDATE cuentas_cobrar cc SET
      monto_pagado = p.total,
      fecha_pago = CASE WHEN p.total >= cc.monto_total THEN p.ultima::timestamptz END
    FROM (SELECT cuentas_cobrar_id, sum(monto) AS total, max(fecha_pago) AS ultima
          FROM pagos_comprobantes WHERE cuentas_cobrar_id IN (SELECT id FROM cuentas_cobrar WHERE cotizacion_id IN (SELECT id FROM _esc))
          GROUP BY cuentas_cobrar_id) p
    WHERE cc.id = p.cuentas_cobrar_id;

    INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, uuid_cfdi, total_cfdi)
    SELECT gen_random_uuid(), x.grupo_id, d.tipo, 'https://esc.invalid/' || x.grupo_id || '.' || d.ext, x.grupo_id || '.' || d.ext,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN 'validado' ELSE 'pendiente' END,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN gen_random_uuid()::text END,
           CASE WHEN d.tipo = 'FACTURA_PROVEEDOR_XML' THEN 2000.00 END
    FROM _esc_items x,
         (VALUES ('FACTURA_PROVEEDOR_XML', 'xml'), ('FACTURA_PROVEEDOR', 'pdf')) AS d(tipo, ext);

    INSERT INTO pagos_cuentas_pagar (grupo_id, monto_transferido, monto_neto, tipo_pago, fecha_pago, comprobante_url, archivo_nombre, created_by)
    SELECT x.grupo_id, CASE WHEN n = 1 OR (x.i + x.k) % 3 = 0 THEN 1000.00 ELSE 500.00 END,
           CASE WHEN n = 1 OR (x.i + x.k) % 3 = 0 THEN 1000.00 ELSE 500.00 END, 'TRANSFERENCIA', e.fecha + 10 + n * 10,
           'https://esc.invalid/' || x.grupo_id || '-pago' || n || '.pdf', x.grupo_id || '-pago' || n || '.pdf', 'escala'
    FROM _esc_items x JOIN _esc e ON e.i = x.i, generate_series(1, 2) n;

    UPDATE cuentas_pagar_grupos g SET
      total_a_transferir = 2000.00,
      monto_pagado = p.neto,
      monto_transferido = p.transferido,
      estado = CASE WHEN p.transferido >= 2000.00 THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END,
      updated_at = now()
    FROM (SELECT grupo_id, sum(monto_neto) AS neto, sum(monto_transferido) AS transferido, max(fecha_pago) AS ultima
          FROM pagos_cuentas_pagar WHERE grupo_id IN (SELECT grupo_id FROM _esc_items) GROUP BY grupo_id) p
    WHERE g.id = p.grupo_id;

    UPDATE cuentas_pagar cp SET
      monto_pagado = g.monto_pagado,
      estado = CASE WHEN g.estado = 'PAGADO' THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END,
      fecha_pago = CASE WHEN g.estado = 'PAGADO' THEN (SELECT max(fecha_pago) FROM pagos_cuentas_pagar WHERE grupo_id = g.id) END,
      updated_at = now()
    FROM cuentas_pagar_grupos g
    WHERE cp.grupo_id = g.id AND g.id IN (SELECT grupo_id FROM _esc_items);
  END IF;
END
$gen$;
