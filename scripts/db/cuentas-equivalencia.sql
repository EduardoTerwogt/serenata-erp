-- Equivalencia de salida de las lecturas de Cuentas (docs/PLAN.md, #110, B0).
--
-- Dos partes en un solo archivo:
--   1. FIXTURE de ramas (prefijo `EQ`, ~40 proyectos con ids y uuids DETERMINISTAS): gasto extra, pagos anulados, reapertura activa y
--      cerrada, factura de cobro y pago compartidos entre proyectos (también entre años y del lado proveedor), cobro y cuenta sin proyecto,
--      PPD con/sin complemento, proveedor sin asignar, complementaria, sin fecha de entrega, orden de pago, grupo con varios renglones,
--      factura en revisión, anticipo, documentos eliminados, cliente sin `cliente_id`. Idempotente: si ya existe, no la vuelve a crear.
--   2. GOLDEN: una línea `caso | filas | md5` por lectura (cuentas_conceptos en todos sus modos, cuentas_periodo en una rejilla de
--      filtros, resumen, avisos, opciones, estado_cuenta, selector, auditar_consistencia). Se corre ANTES de cambiar una función y
--      DESPUÉS; el diff de las dos salidas debe estar vacío.
--
-- Uso (local o test; se niega en cualquier otra base):
--   psql -d <bd> -qAt -f scripts/db/cuentas-equivalencia.sql > golden-antes.txt     (crea la fixture si falta y calcula el golden)
--   psql -d <bd> -qAt -v solo_golden=1 -f scripts/db/cuentas-equivalencia.sql > golden-despues.txt   (no toca la fixture)
--   psql -d <bd> -q -v limpiar=1 -f scripts/db/cuentas-equivalencia.sql                (retira la fixture; contiene DELETE)
-- Luego `diff golden-antes.txt golden-despues.txt` (vacío = equivalente). `-q` es obligatorio: sin él las etiquetas de comando ensucian la salida.
-- Con datos de `escala-generador.sql` presentes el golden los incluye también (mismo código, más filas).
--
-- Determinismo: ids = md5('EQ|…')::uuid, folios y fechas fijos, zona horaria UTC. `hoy` es un parámetro de cada llamada.

\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF NOT (to_regclass('public.loadtest_runs') IS NOT NULL OR current_setting('app.escala_local', true) = 'on') THEN
    RAISE EXCEPTION 'cuentas-equivalencia: solo corre en serenata-erp-test o en una BD local con app.escala_local = on';
  END IF;
END
$guard$;

\if :{?limpiar}
DO $lim$
BEGIN
  ALTER TABLE cotizaciones DISABLE TRIGGER trigger_cotizacion_aprobada;
  ALTER TABLE items_cotizacion DISABLE TRIGGER trigger_items_cotizacion_aprobada;
  DELETE FROM cuentas_correcciones WHERE proyecto_id LIKE 'EQ%';
  DELETE FROM cuentas_reaperturas WHERE proyecto_id LIKE 'EQ%';
  UPDATE cuentas_cobrar SET factura_documento_id = NULL WHERE folio LIKE 'EQ-CC-%';
  UPDATE cuentas_pagar_grupos SET orden_pago_id = NULL WHERE proyecto_id LIKE 'EQ%';
  DELETE FROM documentos_cuentas_cobrar WHERE archivo_url LIKE 'https://eq.invalid/%';
  DELETE FROM documentos_cuentas_pagar WHERE archivo_url LIKE 'https://eq.invalid/%';
  DELETE FROM pagos_comprobantes WHERE pago_id IN (SELECT id FROM pagos WHERE created_by = 'eq');
  DELETE FROM pagos_cuentas_pagar WHERE pago_id IN (SELECT id FROM pagos WHERE created_by = 'eq');
  DELETE FROM pagos WHERE created_by = 'eq';
  DELETE FROM cuentas_cobrar WHERE folio LIKE 'EQ-CC-%';
  DELETE FROM cuentas_pagar WHERE folio LIKE 'EQ-CP-%';
  DELETE FROM cuentas_pagar_grupos WHERE proyecto_id LIKE 'EQ%';
  DELETE FROM ordenes_pago_conceptos WHERE orden_pago_id IN (SELECT id FROM ordenes_pago WHERE created_by = 'eq');
  DELETE FROM ordenes_pago WHERE created_by = 'eq';
  DELETE FROM items_cotizacion WHERE cotizacion_id LIKE 'EQ%';
  DELETE FROM proyectos WHERE id LIKE 'EQ%';
  DELETE FROM cotizaciones WHERE id LIKE 'EQ%';
  DELETE FROM proveedores WHERE nombre LIKE 'EQ Prov%';
  DELETE FROM clientes WHERE nombre LIKE 'EQ Cliente%';
  SET CONSTRAINTS ALL IMMEDIATE;
  ALTER TABLE cotizaciones ENABLE TRIGGER trigger_cotizacion_aprobada;
  ALTER TABLE items_cotizacion ENABLE TRIGGER trigger_items_cotizacion_aprobada;
END
$lim$;
\quit
\endif

SET TimeZone = 'UTC';

\if :{?solo_golden}
\else
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Fixture
-- ════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.eq_uuid(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('EQ|' || p)::uuid $$;
CREATE FUNCTION pg_temp.eq_cc(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.eq_uuid('cc:' || p) $$;
CREATE FUNCTION pg_temp.eq_gr(p text, k int DEFAULT 1) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.eq_uuid('g:' || p || ':' || k) $$;

-- Total a transferir de un grupo según el régimen del proveedor (IVA 16%, retención de 2/3 del IVA e ISR).
CREATE FUNCTION pg_temp.eq_transferir(p_neto numeric, p_reg text) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round(p_neto + round(p_neto * 0.16, 2)
               - CASE WHEN p_reg IN ('fisica', 'resico') THEN round(p_neto * (2.0 / 3.0 * 0.16), 2) ELSE 0 END
               - CASE p_reg WHEN 'fisica' THEN round(p_neto * 0.10, 2) WHEN 'resico' THEN round(p_neto * 0.0125, 2) ELSE 0 END, 2)
$$;

-- Cotización aprobada (o complementaria de `p_padre`), proyecto, renglones, grupos de pago, cuentas por pagar y cobro.
--   p_modo: 'normal' (un proveedor y un grupo por renglón) | 'mismo' (un proveedor y un grupo para todos) |
--           'sinprov1' (el renglón 1 sin proveedor: cuenta suelta) | 'sin_cobro' (sin cuenta por cobrar)
CREATE FUNCTION pg_temp.eq_proy(p_id text, p_fecha date, p_cliente uuid, p_regs text[], p_modo text DEFAULT 'normal',
                                p_padre text DEFAULT NULL, p_prov1 uuid DEFAULT NULL, p_sin_cliente_id boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  n int := array_length(p_regs, 1);
  v_proy text := COALESCE(p_padre, p_id);
  v_sub numeric := 3000 * n;
  v_fee numeric := round(v_sub * 0.03, 2);
  v_gen numeric := v_sub + v_fee;
  v_iva numeric := round(v_gen * 0.16, 2);
  v_total numeric := v_gen + v_iva;
  v_ts timestamptz := (COALESCE(p_fecha, DATE '2026-01-15') - 20)::timestamptz;
  v_cli text := COALESCE((SELECT nombre FROM clientes WHERE id = p_cliente), 'EQ Cliente sin id');
  k int; v_prov uuid; v_item uuid; v_grupo uuid;
BEGIN
  INSERT INTO cotizaciones (id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo, estado, es_complementaria_de,
                            subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total, created_at)
  VALUES (p_id, v_cli, CASE WHEN p_sin_cliente_id THEN NULL ELSE p_cliente END, 'EQ Proyecto ' || v_proy, p_fecha::text, 'CDMX',
          COALESCE(p_fecha, DATE '2026-01-15') - 20, CASE WHEN p_padre IS NULL THEN 'PRINCIPAL' ELSE 'COMPLEMENTARIA' END, 'EMITIDA', p_padre,
          v_sub, v_fee, v_gen, v_iva, v_total, 1000 * n, 1000 * n + v_fee, v_ts);
  IF p_padre IS NULL THEN
    INSERT INTO proyectos (id, proyecto, fecha_entrega, locacion, estado, created_at)
    VALUES (p_id, 'EQ Proyecto ' || p_id, p_fecha, 'CDMX', 'PREPRODUCCION', v_ts);
  END IF;
  FOR k IN 1 .. n LOOP
    v_item := pg_temp.eq_uuid('it:' || p_id || ':' || k);
    IF p_modo = 'sinprov1' AND k = 1 THEN
      v_prov := NULL;
    ELSIF k = 1 AND p_prov1 IS NOT NULL THEN
      v_prov := p_prov1;
    ELSIF p_modo = 'mismo' AND k > 1 THEN
      v_prov := pg_temp.eq_uuid('pv:' || p_id || ':1');
    ELSE
      v_prov := pg_temp.eq_uuid('pv:' || p_id || ':' || k);
      INSERT INTO proveedores (id, nombre, roles, activo, regimen_fiscal)
      VALUES (v_prov, 'EQ Prov ' || p_id || '-' || k, ARRAY['Producción'], true, p_regs[k]);
    END IF;
    INSERT INTO items_cotizacion (id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe, responsable_id, costo_unitario, margen, orden)
    VALUES (v_item, p_id, 'Producción', 'EQ renglón ' || p_id || '-' || k, 1, 3000, 3000, v_prov, 2000, 1000, k);
    IF v_prov IS NULL THEN v_grupo := NULL;
    ELSIF p_modo = 'mismo' THEN v_grupo := pg_temp.eq_gr(p_id, 1);
    ELSE v_grupo := pg_temp.eq_gr(p_id, k);
    END IF;
    IF v_grupo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas_pagar_grupos WHERE id = v_grupo) THEN
      INSERT INTO cuentas_pagar_grupos (id, proyecto_id, responsable_id, estado, monto_total, monto_pagado, created_at)
      VALUES (v_grupo, v_proy, v_prov, 'ABIERTO', 2000, 0, v_ts);
    END IF;
    INSERT INTO cuentas_pagar (id, folio, cotizacion_id, proyecto_id, item_id, responsable_id, costo_total, estado, monto_pagado, grupo_id, created_at)
    VALUES (pg_temp.eq_uuid('cp:' || p_id || ':' || k), 'EQ-CP-' || p_id || '-' || k, p_id, v_proy, v_item, v_prov, 2000, 'PENDIENTE', 0,
            v_grupo, v_ts + k * interval '1 minute');
  END LOOP;
  IF p_modo <> 'sin_cobro' THEN
    INSERT INTO cuentas_cobrar (id, folio, cotizacion_id, proyecto_id, monto_total, monto_pagado, created_at)
    VALUES (pg_temp.eq_cc(p_id), 'EQ-CC-' || p_id, p_id, v_proy, v_total, 0, v_ts + interval '30 seconds');
  END IF;
  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id = p_id;
END
$f$;

-- Factura de cobro (XML + PDF) ligada a una o varias cuentas. El total del XML es la suma de las cuentas.
CREATE FUNCTION pg_temp.eq_fx(p_key text, p_cuentas uuid[], p_metodo text, p_estado text, p_fecha date, p_vence date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := pg_temp.eq_uuid('fx:' || p_key);
BEGIN
  INSERT INTO documentos_cuentas_cobrar (id, tipo, archivo_url, archivo_nombre, estado_validacion, uuid_cfdi, total_cfdi, metodo_pago_cfdi, fecha_carga, created_at)
  VALUES (v_id, 'FACTURA_XML', 'https://eq.invalid/' || p_key || '.xml', p_key || '.xml', p_estado, md5('uuid|' || p_key),
          (SELECT sum(monto_total) FROM cuentas_cobrar WHERE id = ANY (p_cuentas)), p_metodo, p_fecha::timestamptz + interval '1 hour',
          p_fecha::timestamptz + interval '1 hour');
  INSERT INTO documentos_cuentas_cobrar (id, factura_documento_id, tipo, archivo_url, archivo_nombre, estado_validacion, fecha_carga, created_at)
  VALUES (pg_temp.eq_uuid('fp:' || p_key), v_id, 'FACTURA_PDF', 'https://eq.invalid/' || p_key || '.pdf', p_key || '.pdf', 'pendiente',
          p_fecha::timestamptz + interval '2 hour', p_fecha::timestamptz + interval '2 hour');
  UPDATE cuentas_cobrar SET factura_documento_id = v_id, fecha_factura = p_fecha, fecha_vencimiento = COALESCE(p_vence, p_fecha + 30)
  WHERE id = ANY (p_cuentas);
  RETURN v_id;
END
$f$;

-- Pago de cobro con una línea por cuenta. Monto <= 1 = fracción del monto_total de la cuenta. Recalcula las cachés.
CREATE FUNCTION pg_temp.eq_pc(p_key text, p_cuentas uuid[], p_montos numeric[], p_fecha date, p_anulado boolean DEFAULT false,
                              p_comprobante boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := pg_temp.eq_uuid('pc:' || p_key); i int;
BEGIN
  INSERT INTO pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, created_by, created_at, anulado_at, anulado_por, anulado_motivo)
  VALUES (v_id, 'cobro', p_fecha, 'TRANSFERENCIA', CASE WHEN p_comprobante THEN 'https://eq.invalid/' || p_key || '-pago.pdf' END,
          CASE WHEN p_comprobante THEN p_key || '-pago.pdf' END, 'eq', p_fecha::timestamptz + interval '3 hour',
          CASE WHEN p_anulado THEN p_fecha::timestamptz + interval '5 day' END, CASE WHEN p_anulado THEN 'eq' END,
          CASE WHEN p_anulado THEN 'eq: pago anulado' END);
  FOR i IN 1 .. array_length(p_cuentas, 1) LOOP
    INSERT INTO pagos_comprobantes (cuentas_cobrar_id, monto, pago_id, created_at)
    SELECT p_cuentas[i], round(CASE WHEN p_montos[i] <= 1 THEN p_montos[i] * cc.monto_total ELSE p_montos[i] END, 2), v_id,
           p_fecha::timestamptz + interval '3 hour'
    FROM cuentas_cobrar cc WHERE cc.id = p_cuentas[i];
  END LOOP;
  UPDATE cuentas_cobrar cc SET
    monto_pagado = COALESCE((SELECT sum(pc.monto) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                             WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0),
    fecha_pago = CASE WHEN COALESCE((SELECT sum(pc.monto) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                     WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0) >= cc.monto_total
                      THEN (SELECT max(h.fecha_pago) FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL)::timestamptz END
  WHERE cc.id = ANY (p_cuentas);
  RETURN v_id;
END
$f$;

-- Complemento de pago (XML y/o PDF) de una factura de cobro para un pago.
CREATE FUNCTION pg_temp.eq_comp(p_key text, p_factura uuid, p_pago uuid, p_estado text, p_xml boolean DEFAULT true, p_pdf boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_ts timestamptz := (SELECT fecha_pago FROM pagos WHERE id = p_pago)::timestamptz + interval '10 day';
BEGIN
  IF p_xml THEN
    INSERT INTO documentos_cuentas_cobrar (id, factura_documento_id, tipo, archivo_url, archivo_nombre, estado_validacion, pago_id, fecha_carga, created_at)
    VALUES (pg_temp.eq_uuid('cx:' || p_key), p_factura, 'COMPLEMENTO_PAGO', 'https://eq.invalid/' || p_key || '-comp.xml', p_key || '-comp.xml',
            p_estado, p_pago, v_ts, v_ts);
  END IF;
  IF p_pdf THEN
    INSERT INTO documentos_cuentas_cobrar (id, factura_documento_id, tipo, archivo_url, archivo_nombre, estado_validacion, pago_id, fecha_carga, created_at)
    VALUES (pg_temp.eq_uuid('cf:' || p_key), p_factura, 'COMPLEMENTO_PAGO_PDF', 'https://eq.invalid/' || p_key || '-comp.pdf', p_key || '-comp.pdf',
            'pendiente', p_pago, v_ts + interval '1 hour', v_ts + interval '1 hour');
  END IF;
END
$f$;

-- Factura de proveedor (XML + PDF) de un grupo: fija el total a transferir (snapshot por régimen).
CREATE FUNCTION pg_temp.eq_fp(p_grupo uuid, p_key text, p_estado text, p_metodo text, p_fecha date) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, uuid_cfdi, total_cfdi, metodo_pago_cfdi,
                                        fecha_carga, created_at)
  VALUES (pg_temp.eq_uuid('pfx:' || p_key), p_grupo, 'FACTURA_PROVEEDOR_XML', 'https://eq.invalid/' || p_key || '-p.xml', p_key || '-p.xml', p_estado,
          md5('puuid|' || p_key), 0, p_metodo, p_fecha::timestamptz + interval '1 hour', p_fecha::timestamptz + interval '1 hour');
  INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, fecha_carga, created_at)
  VALUES (pg_temp.eq_uuid('pfp:' || p_key), p_grupo, 'FACTURA_PROVEEDOR', 'https://eq.invalid/' || p_key || '-p.pdf', p_key || '-p.pdf', 'pendiente',
          p_fecha::timestamptz + interval '2 hour', p_fecha::timestamptz + interval '2 hour');
  UPDATE cuentas_pagar_grupos g SET
    total_a_transferir = pg_temp.eq_transferir(g.monto_total, (SELECT regimen_fiscal FROM proveedores WHERE id = g.responsable_id)),
    estado = CASE WHEN g.estado = 'ABIERTO' THEN 'FACTURADO' ELSE g.estado END
  WHERE g.id = p_grupo;
  UPDATE documentos_cuentas_pagar SET total_cfdi = (SELECT total_a_transferir FROM cuentas_pagar_grupos WHERE id = p_grupo)
  WHERE id = pg_temp.eq_uuid('pfx:' || p_key);
END
$f$;

-- Pago a proveedor con una línea por grupo. Monto <= 1 = fracción del total a transferir. Recalcula las cachés del grupo y de sus cuentas.
CREATE FUNCTION pg_temp.eq_pp(p_key text, p_grupos uuid[], p_montos numeric[], p_fecha date, p_anulado boolean DEFAULT false,
                              p_comprobante boolean DEFAULT true, p_orden uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := pg_temp.eq_uuid('pp:' || p_key); i int;
BEGIN
  INSERT INTO pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, created_by, created_at, anulado_at, anulado_por, anulado_motivo)
  VALUES (v_id, 'proveedor', p_fecha, 'TRANSFERENCIA', CASE WHEN p_comprobante THEN 'https://eq.invalid/' || p_key || '-pp.pdf' END,
          CASE WHEN p_comprobante THEN p_key || '-pp.pdf' END, 'eq', p_fecha::timestamptz + interval '3 hour',
          CASE WHEN p_anulado THEN p_fecha::timestamptz + interval '5 day' END, CASE WHEN p_anulado THEN 'eq' END,
          CASE WHEN p_anulado THEN 'eq: pago anulado' END);
  FOR i IN 1 .. array_length(p_grupos, 1) LOOP
    INSERT INTO pagos_cuentas_pagar (pago_id, grupo_id, monto_transferido, monto_neto, orden_pago_id, created_at)
    SELECT v_id, g.id,
           round(CASE WHEN p_montos[i] <= 1 THEN p_montos[i] * g.total_a_transferir ELSE p_montos[i] END, 2),
           round(CASE WHEN p_montos[i] <= 1 THEN p_montos[i] * g.monto_total ELSE p_montos[i] * g.monto_total / g.total_a_transferir END, 2),
           p_orden, p_fecha::timestamptz + interval '3 hour'
    FROM cuentas_pagar_grupos g WHERE g.id = p_grupos[i];
  END LOOP;
  UPDATE cuentas_pagar_grupos g SET
    monto_pagado = COALESCE(v.neto, 0), monto_transferido = COALESCE(v.transf, 0),
    estado = CASE WHEN COALESCE(v.transf, 0) >= g.total_a_transferir AND g.total_a_transferir IS NOT NULL THEN 'PAGADO'
                  WHEN COALESCE(v.transf, 0) > 0 THEN 'EN_PROCESO_PAGO'
                  WHEN g.total_a_transferir IS NOT NULL THEN 'FACTURADO' ELSE 'ABIERTO' END
  FROM (SELECT gg.id, (SELECT sum(p.monto_neto) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id WHERE p.grupo_id = gg.id AND h.anulado_at IS NULL) AS neto,
               (SELECT sum(p.monto_transferido) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id WHERE p.grupo_id = gg.id AND h.anulado_at IS NULL) AS transf
        FROM cuentas_pagar_grupos gg WHERE gg.id = ANY (p_grupos)) v
  WHERE g.id = v.id;
  UPDATE cuentas_pagar cp SET
    monto_pagado = round(g.monto_pagado * cp.costo_total / NULLIF(g.monto_total, 0), 2),
    estado = CASE WHEN g.estado = 'PAGADO' THEN 'PAGADO' WHEN g.monto_pagado > 0 THEN 'EN_PROCESO_PAGO' ELSE 'PENDIENTE' END,
    fecha_pago = CASE WHEN g.estado = 'PAGADO' THEN p_fecha::timestamptz END
  FROM cuentas_pagar_grupos g WHERE cp.grupo_id = g.id AND g.id = ANY (p_grupos);
  RETURN v_id;
END
$f$;

-- Complemento de pago de proveedor (PPD) para un pago.
CREATE FUNCTION pg_temp.eq_pcomp(p_key text, p_grupo uuid, p_pago uuid, p_estado text, p_xml boolean DEFAULT true, p_pdf boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_ts timestamptz := (SELECT fecha_pago FROM pagos WHERE id = p_pago)::timestamptz + interval '10 day';
BEGIN
  IF p_xml THEN
    INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, pago_id, fecha_carga, created_at)
    VALUES (pg_temp.eq_uuid('pcx:' || p_key), p_grupo, 'COMPLEMENTO_PAGO', 'https://eq.invalid/' || p_key || '-pc.xml', p_key || '-pc.xml', p_estado, p_pago, v_ts, v_ts);
  END IF;
  IF p_pdf THEN
    INSERT INTO documentos_cuentas_pagar (id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, pago_id, fecha_carga, created_at)
    VALUES (pg_temp.eq_uuid('pcf:' || p_key), p_grupo, 'COMPLEMENTO_PAGO_PDF', 'https://eq.invalid/' || p_key || '-pc.pdf', p_key || '-pc.pdf', 'pendiente', p_pago,
            v_ts + interval '1 hour', v_ts + interval '1 hour');
  END IF;
END
$f$;

-- Ramas completas: proyecto resuelto (cobro PUE cobrado + todos sus grupos facturados y pagados con comprobante).
CREATE FUNCTION pg_temp.eq_resuelto(p_id text, p_fecha date) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE k int; n int := (SELECT count(*) FROM items_cotizacion WHERE cotizacion_id = p_id);
BEGIN
  PERFORM pg_temp.eq_fx(p_id, ARRAY[pg_temp.eq_cc(p_id)], 'PUE', 'validado', p_fecha + 3);
  PERFORM pg_temp.eq_pc(p_id, ARRAY[pg_temp.eq_cc(p_id)], ARRAY[1.0], p_fecha + 10);
  FOR k IN 1 .. n LOOP
    PERFORM pg_temp.eq_fp(pg_temp.eq_gr(p_id, k), p_id || ':' || k, 'validado', 'PUE', p_fecha + 5);
    PERFORM pg_temp.eq_pp(p_id || ':' || k, ARRAY[pg_temp.eq_gr(p_id, k)], ARRAY[1.0], p_fecha + 12);
  END LOOP;
END
$f$;

DO $fx$
DECLARE
  cl_a uuid := pg_temp.eq_uuid('cl:A');
  cl_b uuid := pg_temp.eq_uuid('cl:B');
  v_fx uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_pv uuid; v_re uuid; v_op uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM cotizaciones WHERE id LIKE 'EQ%') THEN
    RAISE NOTICE 'cuentas-equivalencia: la fixture EQ ya existe, no se vuelve a crear';
    RETURN;
  END IF;

  INSERT INTO clientes (id, nombre, tipo, activo) VALUES (cl_a, 'EQ Cliente A', 'Agencia', true), (cl_b, 'EQ Cliente B', 'Agencia', true);

  -- EQ01: sin documentos ni pagos (todo pendiente), tres regímenes.
  PERFORM pg_temp.eq_proy('EQ01', DATE '2026-10-05', cl_a, ARRAY['moral', 'fisica', 'resico']);
  -- EQ02: resuelto de punta a punta.
  PERFORM pg_temp.eq_proy('EQ02', DATE '2026-03-10', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_resuelto('EQ02', DATE '2026-03-10');
  -- EQ03: PPD con pago parcial y sin complemento.
  PERFORM pg_temp.eq_proy('EQ03', DATE '2026-04-10', cl_b, ARRAY['moral', 'fisica']);
  v_fx := pg_temp.eq_fx('EQ03', ARRAY[pg_temp.eq_cc('EQ03')], 'PPD', 'validado', DATE '2026-04-13');
  PERFORM pg_temp.eq_pc('EQ03', ARRAY[pg_temp.eq_cc('EQ03')], ARRAY[0.5], DATE '2026-04-25');
  -- EQ04: PPD cobrado al 100% sin complemento.
  PERFORM pg_temp.eq_proy('EQ04', DATE '2026-04-12', cl_a, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ04', ARRAY[pg_temp.eq_cc('EQ04')], 'PPD', 'validado', DATE '2026-04-15');
  PERFORM pg_temp.eq_pc('EQ04', ARRAY[pg_temp.eq_cc('EQ04')], ARRAY[1.0], DATE '2026-04-28');
  -- EQ05: PPD, dos pagos, complemento completo de cada uno.
  PERFORM pg_temp.eq_proy('EQ05', DATE '2026-05-02', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ05', ARRAY[pg_temp.eq_cc('EQ05')], 'PPD', 'validado', DATE '2026-05-05');
  v_p1 := pg_temp.eq_pc('EQ05a', ARRAY[pg_temp.eq_cc('EQ05')], ARRAY[0.5], DATE '2026-05-10');
  v_p2 := pg_temp.eq_pc('EQ05b', ARRAY[pg_temp.eq_cc('EQ05')], ARRAY[0.5], DATE '2026-05-20');
  PERFORM pg_temp.eq_comp('EQ05a', v_fx, v_p1, 'validado');
  PERFORM pg_temp.eq_comp('EQ05b', v_fx, v_p2, 'validado');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ05'), 'EQ05', 'validado', 'PUE', DATE '2026-05-06');
  PERFORM pg_temp.eq_pp('EQ05', ARRAY[pg_temp.eq_gr('EQ05')], ARRAY[1.0], DATE '2026-05-25');
  -- EQ06: PPD con complemento en revisión (pago 1) y solo PDF (pago 2).
  PERFORM pg_temp.eq_proy('EQ06', DATE '2026-05-12', cl_a, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ06', ARRAY[pg_temp.eq_cc('EQ06')], 'PPD', 'validado', DATE '2026-05-15');
  v_p1 := pg_temp.eq_pc('EQ06a', ARRAY[pg_temp.eq_cc('EQ06')], ARRAY[0.5], DATE '2026-05-20');
  v_p2 := pg_temp.eq_pc('EQ06b', ARRAY[pg_temp.eq_cc('EQ06')], ARRAY[0.5], DATE '2026-05-30');
  PERFORM pg_temp.eq_comp('EQ06a', v_fx, v_p1, 'revision');
  PERFORM pg_temp.eq_comp('EQ06b', v_fx, v_p2, 'validado', false, true);
  -- EQ07: factura de cobro en revisión.
  PERFORM pg_temp.eq_proy('EQ07', DATE '2026-06-02', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ07', ARRAY[pg_temp.eq_cc('EQ07')], 'PUE', 'revision', DATE '2026-06-05');
  -- EQ08: factura sin método de pago, cobrada.
  PERFORM pg_temp.eq_proy('EQ08', DATE '2026-06-12', cl_a, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ08', ARRAY[pg_temp.eq_cc('EQ08')], NULL, 'validado', DATE '2026-06-15');
  PERFORM pg_temp.eq_pc('EQ08', ARRAY[pg_temp.eq_cc('EQ08')], ARRAY[1.0], DATE '2026-06-30');
  -- EQ09: factura vencida con saldo.
  PERFORM pg_temp.eq_proy('EQ09', DATE '2026-05-01', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ09', ARRAY[pg_temp.eq_cc('EQ09')], 'PUE', 'validado', DATE '2026-05-01', DATE '2026-05-31');
  -- EQ10: gasto extra (cuenta sin renglón) con su grupo.
  PERFORM pg_temp.eq_proy('EQ10', DATE '2026-06-10', cl_b, ARRAY['moral']);
  v_pv := pg_temp.eq_uuid('pv:EQ10:extra');
  INSERT INTO proveedores (id, nombre, roles, activo, regimen_fiscal) VALUES (v_pv, 'EQ Prov EQ10-extra', ARRAY['Producción'], true, 'fisica');
  INSERT INTO cuentas_pagar_grupos (id, proyecto_id, responsable_id, estado, monto_total, monto_pagado, created_at)
  VALUES (pg_temp.eq_gr('EQ10', 99), 'EQ10', v_pv, 'ABIERTO', 500, 0, DATE '2026-05-21');
  INSERT INTO cuentas_pagar (id, folio, cotizacion_id, proyecto_id, item_id, responsable_id, costo_total, estado, monto_pagado, grupo_id, concepto, created_at)
  VALUES (pg_temp.eq_uuid('cp:EQ10:extra'), 'EQ-CP-EQ10-X', 'EQ10', 'EQ10', NULL, v_pv, 500, 'PENDIENTE', 0, pg_temp.eq_gr('EQ10', 99),
          'Gasto extra de prueba', DATE '2026-05-21');
  -- EQ11: pagos anulados (cobro y proveedor) con un pago vigente parcial.
  PERFORM pg_temp.eq_proy('EQ11', DATE '2026-02-10', cl_a, ARRAY['moral', 'moral']);
  v_fx := pg_temp.eq_fx('EQ11', ARRAY[pg_temp.eq_cc('EQ11')], 'PUE', 'validado', DATE '2026-02-13');
  PERFORM pg_temp.eq_pc('EQ11a', ARRAY[pg_temp.eq_cc('EQ11')], ARRAY[0.5], DATE '2026-02-20', true);
  PERFORM pg_temp.eq_pc('EQ11b', ARRAY[pg_temp.eq_cc('EQ11')], ARRAY[0.4], DATE '2026-03-01');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ11', 1), 'EQ11:1', 'validado', 'PUE', DATE '2026-02-15');
  PERFORM pg_temp.eq_pp('EQ11a', ARRAY[pg_temp.eq_gr('EQ11', 1)], ARRAY[1.0], DATE '2026-02-25', true);
  PERFORM pg_temp.eq_pp('EQ11b', ARRAY[pg_temp.eq_gr('EQ11', 1)], ARRAY[0.5], DATE '2026-03-05');
  -- EQ12: resuelto con una reapertura ACTIVA.
  PERFORM pg_temp.eq_proy('EQ12', DATE '2026-03-15', cl_b, ARRAY['moral']);
  PERFORM pg_temp.eq_resuelto('EQ12', DATE '2026-03-15');
  INSERT INTO cuentas_reaperturas (id, proyecto_id, motivo, abierta_por, abierta_at) VALUES (pg_temp.eq_uuid('re:EQ12'), 'EQ12', 'eq: reapertura activa', 'eq', TIMESTAMPTZ '2026-09-01 12:00+00');
  -- EQ13: resuelto con una reapertura CERRADA y su corrección.
  PERFORM pg_temp.eq_proy('EQ13', DATE '2026-03-18', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_resuelto('EQ13', DATE '2026-03-18');
  v_re := pg_temp.eq_uuid('re:EQ13');
  INSERT INTO cuentas_reaperturas (id, proyecto_id, motivo, abierta_por, abierta_at, cerrada_por, cerrada_at)
  VALUES (v_re, 'EQ13', 'eq: reapertura cerrada', 'eq', TIMESTAMPTZ '2026-08-01 12:00+00', 'eq', TIMESTAMPTZ '2026-08-02 12:00+00');
  INSERT INTO cuentas_correcciones (id, reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario, created_at)
  VALUES (pg_temp.eq_uuid('co:EQ13'), v_re, 'EQ13', 'editar_datos', 'cobro', pg_temp.eq_cc('EQ13'), 'eq: corrección', '{}'::jsonb, 'eq', TIMESTAMPTZ '2026-08-01 13:00+00');
  -- EQ14 + EQ15: UNA factura de cobro cubre dos proyectos (mismo cliente).
  PERFORM pg_temp.eq_proy('EQ14', DATE '2026-04-02', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_proy('EQ15', DATE '2026-04-04', cl_a, ARRAY['fisica']);
  v_fx := pg_temp.eq_fx('EQ1415', ARRAY[pg_temp.eq_cc('EQ14'), pg_temp.eq_cc('EQ15')], 'PUE', 'validado', DATE '2026-04-08');
  PERFORM pg_temp.eq_pc('EQ14', ARRAY[pg_temp.eq_cc('EQ14')], ARRAY[1.0], DATE '2026-04-20');
  PERFORM pg_temp.eq_pc('EQ15', ARRAY[pg_temp.eq_cc('EQ15')], ARRAY[1.0], DATE '2026-04-22');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ14'), 'EQ14', 'validado', 'PUE', DATE '2026-04-09');
  PERFORM pg_temp.eq_pp('EQ14', ARRAY[pg_temp.eq_gr('EQ14')], ARRAY[1.0], DATE '2026-04-23');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ15'), 'EQ15', 'validado', 'PUE', DATE '2026-04-09');
  PERFORM pg_temp.eq_pp('EQ15', ARRAY[pg_temp.eq_gr('EQ15')], ARRAY[1.0], DATE '2026-04-23');
  -- EQ16 + EQ17: UN pago de cobro con dos líneas (dos proyectos), facturas separadas.
  PERFORM pg_temp.eq_proy('EQ16', DATE '2026-07-02', cl_b, ARRAY['moral']);
  PERFORM pg_temp.eq_proy('EQ17', DATE '2026-07-05', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ16', ARRAY[pg_temp.eq_cc('EQ16')], 'PPD', 'validado', DATE '2026-07-06');
  v_p1 := pg_temp.eq_fx('EQ17', ARRAY[pg_temp.eq_cc('EQ17')], 'PUE', 'validado', DATE '2026-07-07');
  v_p2 := pg_temp.eq_pc('EQ1617', ARRAY[pg_temp.eq_cc('EQ16'), pg_temp.eq_cc('EQ17')], ARRAY[1.0, 0.6], DATE '2026-07-20');
  PERFORM pg_temp.eq_comp('EQ1617', v_fx, v_p2, 'validado');
  -- EQ18 (2025) + EQ19 (2026): una factura y un pago compartidos ENTRE AÑOS.
  PERFORM pg_temp.eq_proy('EQ18', DATE '2025-12-10', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_proy('EQ19', DATE '2026-01-20', cl_a, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ1819', ARRAY[pg_temp.eq_cc('EQ18'), pg_temp.eq_cc('EQ19')], 'PUE', 'validado', DATE '2026-01-25');
  PERFORM pg_temp.eq_pc('EQ1819', ARRAY[pg_temp.eq_cc('EQ18'), pg_temp.eq_cc('EQ19')], ARRAY[1.0, 1.0], DATE '2026-02-05');
  -- EQ20 + EQ21: un proveedor común y UN pago a proveedor con dos líneas (dos proyectos).
  v_pv := pg_temp.eq_uuid('pv:COMUN');
  INSERT INTO proveedores (id, nombre, roles, activo, regimen_fiscal) VALUES (v_pv, 'EQ Prov Comun', ARRAY['Producción'], true, 'fisica');
  PERFORM pg_temp.eq_proy('EQ20', DATE '2026-05-12', cl_a, ARRAY['fisica'], 'normal', NULL, v_pv);
  PERFORM pg_temp.eq_proy('EQ21', DATE '2026-05-14', cl_b, ARRAY['fisica'], 'normal', NULL, v_pv);
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ20'), 'EQ20', 'validado', 'PPD', DATE '2026-05-16');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ21'), 'EQ21', 'validado', 'PPD', DATE '2026-05-16');
  v_p3 := pg_temp.eq_pp('EQ2021', ARRAY[pg_temp.eq_gr('EQ20'), pg_temp.eq_gr('EQ21')], ARRAY[1.0, 0.5], DATE '2026-05-30');
  PERFORM pg_temp.eq_pcomp('EQ20', pg_temp.eq_gr('EQ20'), v_p3, 'validado');
  -- EQ22: un renglón sin proveedor (cuenta suelta) y otro con proveedor.
  PERFORM pg_temp.eq_proy('EQ22', DATE '2026-07-01', cl_b, ARRAY['moral', 'moral'], 'sinprov1');
  -- EQ23 + EQ23B: cotización complementaria dentro del mismo proyecto.
  PERFORM pg_temp.eq_proy('EQ23', DATE '2026-08-08', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_proy('EQ23B', DATE '2026-08-08', cl_a, ARRAY['fisica'], 'normal', 'EQ23');
  PERFORM pg_temp.eq_resuelto('EQ23', DATE '2026-08-08');
  -- EQ24: sin fecha de entrega.
  PERFORM pg_temp.eq_proy('EQ24', NULL, cl_b, ARRAY['moral']);
  -- EQ25: proveedores PUE, PPD sin complemento y PPD con complemento.
  PERFORM pg_temp.eq_proy('EQ25', DATE '2026-06-20', cl_a, ARRAY['moral', 'fisica', 'resico']);
  v_fx := pg_temp.eq_fx('EQ25', ARRAY[pg_temp.eq_cc('EQ25')], 'PUE', 'validado', DATE '2026-06-23');
  PERFORM pg_temp.eq_pc('EQ25', ARRAY[pg_temp.eq_cc('EQ25')], ARRAY[1.0], DATE '2026-06-30');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ25', 1), 'EQ25:1', 'validado', 'PUE', DATE '2026-06-24');
  PERFORM pg_temp.eq_pp('EQ25:1', ARRAY[pg_temp.eq_gr('EQ25', 1)], ARRAY[1.0], DATE '2026-07-02');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ25', 2), 'EQ25:2', 'validado', 'PPD', DATE '2026-06-24');
  PERFORM pg_temp.eq_pp('EQ25:2', ARRAY[pg_temp.eq_gr('EQ25', 2)], ARRAY[1.0], DATE '2026-07-02');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ25', 3), 'EQ25:3', 'validado', 'PPD', DATE '2026-06-24');
  v_p1 := pg_temp.eq_pp('EQ25:3', ARRAY[pg_temp.eq_gr('EQ25', 3)], ARRAY[1.0], DATE '2026-07-02');
  PERFORM pg_temp.eq_pcomp('EQ25:3', pg_temp.eq_gr('EQ25', 3), v_p1, 'validado');
  -- EQ26: grupo facturado dentro de una orden de pago.
  PERFORM pg_temp.eq_proy('EQ26', DATE '2026-09-10', cl_a, ARRAY['moral']);
  v_op := pg_temp.eq_uuid('op:1');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ26'), 'EQ26', 'validado', 'PUE', DATE '2026-09-12');
  INSERT INTO ordenes_pago (id, fecha_generacion, estado, total_monto, created_by, created_at)
  VALUES (v_op, DATE '2026-09-20', 'GENERADA', 2000, 'eq', TIMESTAMPTZ '2026-09-20 12:00+00');
  INSERT INTO ordenes_pago_conceptos (orden_pago_id, grupo_id, responsable_id, responsable_nombre, proyecto_id, neto_cubierto, transferir_cubierto, created_at)
  SELECT v_op, g.id, g.responsable_id, 'EQ Prov EQ26-1', 'EQ26', g.monto_total, g.total_a_transferir, TIMESTAMPTZ '2026-09-20 12:00+00'
  FROM cuentas_pagar_grupos g WHERE g.id = pg_temp.eq_gr('EQ26');
  UPDATE cuentas_pagar_grupos SET orden_pago_id = v_op WHERE id = pg_temp.eq_gr('EQ26');
  -- EQ27: grupo con tres renglones, sin factura (total estimado).
  PERFORM pg_temp.eq_proy('EQ27', DATE '2026-09-20', cl_b, ARRAY['moral', 'moral', 'moral'], 'mismo');
  -- EQ28: grupo con tres renglones, con factura PPD y pago parcial.
  PERFORM pg_temp.eq_proy('EQ28', DATE '2026-09-22', cl_a, ARRAY['fisica', 'fisica', 'fisica'], 'mismo');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ28'), 'EQ28', 'validado', 'PPD', DATE '2026-09-24');
  PERFORM pg_temp.eq_pp('EQ28', ARRAY[pg_temp.eq_gr('EQ28')], ARRAY[0.3], DATE '2026-09-30');
  -- EQ29: sin cuenta por cobrar, solo proveedores (uno pagado y otro parcial).
  PERFORM pg_temp.eq_proy('EQ29', DATE '2026-06-25', cl_a, ARRAY['moral', 'resico'], 'sin_cobro');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ29', 1), 'EQ29:1', 'validado', 'PUE', DATE '2026-06-27');
  PERFORM pg_temp.eq_pp('EQ29:1', ARRAY[pg_temp.eq_gr('EQ29', 1)], ARRAY[1.0], DATE '2026-07-05');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ29', 2), 'EQ29:2', 'validado', 'PUE', DATE '2026-06-27');
  PERFORM pg_temp.eq_pp('EQ29:2', ARRAY[pg_temp.eq_gr('EQ29', 2)], ARRAY[0.4], DATE '2026-07-05');
  -- EQ30: anticipo (pago antes de la factura) y un pago posterior con complemento.
  PERFORM pg_temp.eq_proy('EQ30', DATE '2026-04-20', cl_b, ARRAY['moral']);
  PERFORM pg_temp.eq_pc('EQ30a', ARRAY[pg_temp.eq_cc('EQ30')], ARRAY[0.5], DATE '2026-04-01');
  v_fx := pg_temp.eq_fx('EQ30', ARRAY[pg_temp.eq_cc('EQ30')], 'PPD', 'validado', DATE '2026-04-10');
  v_p2 := pg_temp.eq_pc('EQ30b', ARRAY[pg_temp.eq_cc('EQ30')], ARRAY[0.5], DATE '2026-05-02');
  PERFORM pg_temp.eq_comp('EQ30b', v_fx, v_p2, 'validado');
  -- EQ31: factura de proveedor en revisión y otro grupo pagado SIN comprobante.
  PERFORM pg_temp.eq_proy('EQ31', DATE '2026-07-15', cl_a, ARRAY['moral', 'fisica']);
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ31', 1), 'EQ31:1', 'revision', NULL, DATE '2026-07-17');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ31', 2), 'EQ31:2', 'validado', 'PUE', DATE '2026-07-17');
  PERFORM pg_temp.eq_pp('EQ31:2', ARRAY[pg_temp.eq_gr('EQ31', 2)], ARRAY[1.0], DATE '2026-07-25', false, false);
  -- EQ32: documentos eliminados (factura de proveedor vieja y complemento) y uno vigente.
  PERFORM pg_temp.eq_proy('EQ32', DATE '2026-08-20', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ32', ARRAY[pg_temp.eq_cc('EQ32')], 'PPD', 'validado', DATE '2026-08-22');
  v_p1 := pg_temp.eq_pc('EQ32', ARRAY[pg_temp.eq_cc('EQ32')], ARRAY[1.0], DATE '2026-09-01');
  PERFORM pg_temp.eq_comp('EQ32old', v_fx, v_p1, 'validado');
  UPDATE documentos_cuentas_cobrar SET eliminado_at = TIMESTAMPTZ '2026-09-05 12:00+00', eliminado_por = 'eq', eliminado_motivo = 'eq: reemplazado'
   WHERE id IN (pg_temp.eq_uuid('cx:EQ32old'), pg_temp.eq_uuid('cf:EQ32old'));
  PERFORM pg_temp.eq_comp('EQ32new', v_fx, v_p1, 'validado');
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ32'), 'EQ32old', 'validado', 'PUE', DATE '2026-08-24');
  UPDATE documentos_cuentas_pagar SET eliminado_at = TIMESTAMPTZ '2026-08-26 12:00+00', eliminado_por = 'eq', eliminado_motivo = 'eq: reemplazada'
   WHERE id IN (pg_temp.eq_uuid('pfx:EQ32old'), pg_temp.eq_uuid('pfp:EQ32old'));
  PERFORM pg_temp.eq_fp(pg_temp.eq_gr('EQ32'), 'EQ32new', 'validado', 'PUE', DATE '2026-08-27');
  PERFORM pg_temp.eq_pp('EQ32', ARRAY[pg_temp.eq_gr('EQ32')], ARRAY[1.0], DATE '2026-09-02');
  -- EQ33 (2025, resuelto) y EQ34 (2025, pendiente), EQ36 (2024, resuelto).
  PERFORM pg_temp.eq_proy('EQ33', DATE '2025-05-05', cl_a, ARRAY['moral', 'fisica']);
  PERFORM pg_temp.eq_resuelto('EQ33', DATE '2025-05-05');
  PERFORM pg_temp.eq_proy('EQ34', DATE '2025-09-09', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ34', ARRAY[pg_temp.eq_cc('EQ34')], 'PPD', 'validado', DATE '2025-09-12');
  PERFORM pg_temp.eq_pc('EQ34', ARRAY[pg_temp.eq_cc('EQ34')], ARRAY[0.5], DATE '2025-10-01');
  PERFORM pg_temp.eq_proy('EQ36', DATE '2024-03-03', cl_a, ARRAY['moral']);
  PERFORM pg_temp.eq_resuelto('EQ36', DATE '2024-03-03');
  -- EQ35: cotización sin cliente_id (cliente solo como texto).
  PERFORM pg_temp.eq_proy('EQ35', DATE '2026-11-02', NULL, ARRAY['moral'], 'normal', NULL, NULL, true);
  -- EQ37: tres pagos de cobro, complemento solo de los dos primeros.
  PERFORM pg_temp.eq_proy('EQ37', DATE '2026-01-12', cl_b, ARRAY['moral']);
  v_fx := pg_temp.eq_fx('EQ37', ARRAY[pg_temp.eq_cc('EQ37')], 'PPD', 'validado', DATE '2026-01-14');
  v_p1 := pg_temp.eq_pc('EQ37a', ARRAY[pg_temp.eq_cc('EQ37')], ARRAY[0.3], DATE '2026-01-20');
  v_p2 := pg_temp.eq_pc('EQ37b', ARRAY[pg_temp.eq_cc('EQ37')], ARRAY[0.3], DATE '2026-02-10');
  v_p3 := pg_temp.eq_pc('EQ37c', ARRAY[pg_temp.eq_cc('EQ37')], ARRAY[0.4], DATE '2026-03-10');
  PERFORM pg_temp.eq_comp('EQ37a', v_fx, v_p1, 'validado');
  PERFORM pg_temp.eq_comp('EQ37b', v_fx, v_p2, 'validado');
  -- Cobro sin proyecto (y sin cotización): uno facturado y cobrado, otro pendiente.
  INSERT INTO cuentas_cobrar (id, folio, cotizacion_id, proyecto_id, monto_total, monto_pagado, created_at)
  VALUES (pg_temp.eq_cc('SINPROY1'), 'EQ-CC-SINPROY1', NULL, NULL, 1000, 0, TIMESTAMPTZ '2026-03-01 12:00+00'),
         (pg_temp.eq_cc('SINPROY2'), 'EQ-CC-SINPROY2', NULL, NULL, 2500, 0, TIMESTAMPTZ '2026-03-02 12:00+00');
  v_fx := pg_temp.eq_fx('SINPROY1', ARRAY[pg_temp.eq_cc('SINPROY1')], 'PUE', 'validado', DATE '2026-03-05');
  PERFORM pg_temp.eq_pc('SINPROY1', ARRAY[pg_temp.eq_cc('SINPROY1')], ARRAY[1.0], DATE '2026-03-15');
END
$fx$;
\endif

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Golden
-- ════════════════════════════════════════════════════════════════════════════
\pset format unaligned
\pset tuples_only on
\pset fieldsep ' | '
\pset null '∅'

-- `p_sql` devuelve (k text, t text); se imprime cuántas filas y el md5 de sus textos en el orden de k.
CREATE FUNCTION pg_temp.eq_md5(p_sql text, OUT n bigint, OUT h text) LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE 'SELECT count(*), COALESCE(md5(string_agg(t, ''|'' ORDER BY k)), ''vacio'') FROM (' || p_sql || ') x' INTO n, h;
END
$f$;

CREATE TEMP TABLE _eq_hoy (hoy date);
INSERT INTO _eq_hoy VALUES ('2026-10-15'), ('2027-03-01');
-- Años con proyectos (+ NULL = sin filtro, + uno vacío).
CREATE TEMP TABLE _eq_anios AS
  SELECT DISTINCT extract(year FROM fecha_entrega)::int AS anio FROM proyectos WHERE fecha_entrega IS NOT NULL
  UNION SELECT 2000;
-- Muestra de proyectos de escala (primeros y últimos 20 por id) además de toda la fixture.
CREATE TEMP TABLE _eq_proys AS
  SELECT id FROM proyectos WHERE id LIKE 'EQ%'
  UNION (SELECT id FROM proyectos WHERE id LIKE 'ESC%' ORDER BY id LIMIT 20)
  UNION (SELECT id FROM proyectos WHERE id LIKE 'ESC%' ORDER BY id DESC LIMIT 20);

-- cuentas_conceptos, todos los conceptos: por año (y sin filtro) y por fecha de referencia.
SELECT 'conceptos[anio=' || COALESCE(a.anio::text, 'todos') || ',hoy=' || h.hoy || ']', r.n, r.h
FROM (SELECT anio FROM _eq_anios UNION ALL SELECT NULL) a CROSS JOIN _eq_hoy h
CROSS JOIN LATERAL pg_temp.eq_md5(format('SELECT c.key AS k, to_jsonb(c)::text AS t FROM cuentas_conceptos(%L, %L::date, NULL, NULL) c', a.anio, h.hoy)) r
ORDER BY a.anio NULLS LAST, h.hoy;

-- Un solo concepto (cobro | grupo | cuenta) y todos los de una contraparte (cliente | proveedor).
SELECT 'concepto[' || m.modo || ',hoy=' || h.hoy || ']', r.n, r.h
FROM _eq_hoy h
CROSS JOIN (VALUES ('cobro'), ('grupo'), ('cuenta')) m(modo)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$
  SELECT c.key AS k, to_jsonb(c)::text AS t
  FROM (SELECT x.id::text AS id FROM %s x WHERE x.proyecto_id IN (SELECT id FROM _eq_proys)) ids,
       LATERAL cuentas_conceptos(NULL, %L::date, %L, ids.id) c
$q$, CASE m.modo WHEN 'cobro' THEN 'cuentas_cobrar' WHEN 'grupo' THEN 'cuentas_pagar_grupos' ELSE 'cuentas_pagar' END, h.hoy, m.modo)) r
ORDER BY m.modo, h.hoy;

SELECT 'concepto[cobro sin proyecto]', r.n, r.h
FROM pg_temp.eq_md5($q$
  SELECT c.key AS k, to_jsonb(c)::text AS t
  FROM cuentas_cobrar x, LATERAL cuentas_conceptos(NULL, '2026-10-15'::date, 'cobro', x.id::text) c
  WHERE x.proyecto_id IS NULL
$q$) r;

SELECT 'contraparte[' || m.modo || ',anio=' || COALESCE(a.anio::text, 'todos') || ']', r.n, r.h
FROM (VALUES ('cliente'), ('proveedor')) m(modo)
CROSS JOIN (VALUES (2026), (2025), (NULL::int)) a(anio)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$
  SELECT c.key AS k, to_jsonb(c)::text AS t
  FROM (SELECT id FROM %s WHERE nombre LIKE 'EQ %%' UNION ALL (SELECT id FROM %s WHERE nombre LIKE 'ESC %%' ORDER BY nombre LIMIT 10)) ids,
       LATERAL cuentas_conceptos(%L, '2026-10-15'::date, %L, ids.id::text) c
$q$, CASE m.modo WHEN 'cliente' THEN 'clientes' ELSE 'proveedores' END, CASE m.modo WHEN 'cliente' THEN 'clientes' ELSE 'proveedores' END, a.anio, m.modo)) r
ORDER BY m.modo, a.anio NULLS LAST;

-- cuentas_periodo: un año completo con cada mes, y una rejilla de filtros en 2026 y 2025.
SELECT 'periodo[anio=' || a.anio || ',mes=' || m.mes || ']', r.n, r.h
FROM (VALUES (2026), (2025)) a(anio)
CROSS JOIN (VALUES ('todo'), ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8'), ('9'), ('10'), ('11'), ('12')) m(mes)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'p' AS k, cuentas_periodo(jsonb_build_object('anio', %s, 'mes', %L, 'hoy', '2026-10-15', 'page_size', 200))::jsonb::text AS t$q$, a.anio, m.mes)) r
ORDER BY a.anio DESC, CASE WHEN m.mes = 'todo' THEN 0 ELSE m.mes::int END;

SELECT 'periodo[' || f.nombre || ']', r.n, r.h
FROM (VALUES
  ('pendientes+proyectos', '{"anio":2026,"mes":"todo","estado":"pendientes","vista":"proyectos","page_size":200}'),
  ('cerradas+proyectos', '{"anio":2026,"mes":"todo","estado":"cerradas","vista":"proyectos","page_size":200}'),
  ('lista+todas', '{"anio":2026,"mes":"todo","estado":"todas","vista":"lista","page_size":200}'),
  ('lista+pendientes', '{"anio":2026,"mes":"todo","estado":"pendientes","vista":"lista","page_size":200}'),
  ('lista+cobros', '{"anio":2026,"mes":"todo","tipo":"cobro","vista":"lista","page_size":200}'),
  ('lista+pagos', '{"anio":2026,"mes":"todo","tipo":"pago","vista":"lista","page_size":200}'),
  ('lista+pagina2', '{"anio":2026,"mes":"todo","vista":"lista","page":2,"page_size":25}'),
  ('proyectos+pagina2', '{"anio":2026,"mes":"todo","vista":"proyectos","page":2,"page_size":10}'),
  ('cliente', '{"anio":2026,"mes":"todo","cliente":"EQ Cliente A","vista":"lista","page_size":200}'),
  ('proveedor', '{"anio":2026,"mes":"todo","proveedor":"EQ Prov EQ25-1","vista":"lista","page_size":200}'),
  ('busqueda', '{"anio":2026,"mes":"todo","q":"eq2","vista":"lista","page_size":200}'),
  ('busqueda sin acentos', '{"anio":2026,"mes":"todo","q":"produccion","vista":"proyectos","page_size":200}'),
  ('mes por omision', '{"anio":2026,"vista":"proyectos","page_size":200}'),
  ('anio sin proyectos', '{"anio":2000,"mes":"todo","vista":"proyectos"}'),
  ('anio anterior sin mes', '{"anio":2025,"vista":"proyectos","page_size":200}')
) f(nombre, filtro)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'p' AS k, cuentas_periodo(%L::jsonb || '{"hoy":"2026-10-15"}'::jsonb)::jsonb::text AS t$q$, f.filtro)) r
ORDER BY f.nombre;

-- Proyecto seleccionado (detalle en el panel) de cada proyecto de la muestra.
SELECT 'periodo[seleccionado]', r.n, r.h
FROM pg_temp.eq_md5($q$
  SELECT p.id AS k, cuentas_periodo(jsonb_build_object('anio', 2026, 'mes', 'todo', 'hoy', '2026-10-15', 'proyecto', p.id, 'vista', 'lista', 'page_size', 5))::jsonb::text AS t
  FROM _eq_proys p WHERE p.id LIKE 'EQ%'
$q$) r;

-- Años de otros proyectos de escala: solo el año completo.
SELECT 'periodo[anio=' || a.anio || ',mes=todo,otros]', r.n, r.h
FROM _eq_anios a
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'p' AS k, cuentas_periodo(jsonb_build_object('anio', %s, 'mes', 'todo', 'hoy', '2026-10-15', 'page_size', 60))::jsonb::text AS t$q$, a.anio)) r
WHERE a.anio NOT IN (2025, 2026, 2000)
ORDER BY a.anio DESC;

-- Resumen y avisos.
SELECT 'resumen[hoy=' || h.hoy || ']', r.n, r.h
FROM _eq_hoy h CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'r' AS k, cuentas_resumen(%L::date)::jsonb::text AS t$q$, h.hoy)) r ORDER BY h.hoy;
SELECT 'avisos[hoy=' || h.hoy || ',limite=' || l.lim || ']', r.n, r.h
FROM _eq_hoy h CROSS JOIN (VALUES (5), (50)) l(lim)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'a' AS k, cuentas_avisos_items(%L::date, %s)::jsonb::text AS t$q$, h.hoy, l.lim)) r
ORDER BY h.hoy, l.lim;

-- Opciones de filtros, años, candidatos de orden y proyecto individual.
SELECT 'opciones[anio=' || a.anio || ']', r.n, r.h
FROM (SELECT anio FROM _eq_anios WHERE anio IN (2026, 2025, 2000)) a
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$SELECT 'o' AS k, cuentas_opciones(%s)::jsonb::text AS t$q$, a.anio)) r ORDER BY a.anio;
SELECT 'anios', r.n, r.h FROM pg_temp.eq_md5($q$SELECT 'a' AS k, to_jsonb(cuentas_anios())::text AS t$q$) r;
SELECT 'orden_candidatos', r.n, r.h FROM pg_temp.eq_md5($q$SELECT 'o' AS k, cuentas_orden_candidatos(100)::jsonb::text AS t$q$) r;
SELECT 'por_proyecto', r.n, r.h
FROM pg_temp.eq_md5($q$SELECT p.id AS k, cuentas_por_proyecto(2026, p.id)::jsonb::text AS t FROM _eq_proys p$q$) r;

-- Estado de cuenta por contraparte (con y sin filtro de proyectos) y selector de proyectos.
SELECT 'estado_cuenta[' || l.lado || ',' || l.filtro || ']', r.n, r.h
FROM (VALUES ('cobro', 'todos'), ('cobro', 'proyectos'), ('proveedor', 'todos'), ('proveedor', 'proyectos')) l(lado, filtro)
CROSS JOIN LATERAL pg_temp.eq_md5(format($q$
  SELECT ids.id::text AS k, estado_cuenta(%L, ids.id, %s, '2026-10-15')::jsonb::text AS t
  FROM (SELECT id FROM %s WHERE nombre LIKE 'EQ %%' UNION ALL (SELECT id FROM %s WHERE nombre LIKE 'ESC %%' ORDER BY nombre LIMIT 5)) ids
$q$, l.lado, CASE l.filtro WHEN 'todos' THEN 'NULL::text[]' ELSE 'ARRAY[''EQ02'', ''EQ14'', ''EQ20'', ''EQ25'', ''EQ2'']' END,
   CASE l.lado WHEN 'cobro' THEN 'clientes' ELSE 'proveedores' END, CASE l.lado WHEN 'cobro' THEN 'clientes' ELSE 'proveedores' END)) r
ORDER BY l.lado, l.filtro;

SELECT 'selector[' || s.nombre || ']', r.n, r.h
FROM (VALUES
  ('renglones pendientes', $$cuentas_proyectos_selector('renglones', NULL, NULL, NULL, true, 1, 50)$$),
  ('renglones todos', $$cuentas_proyectos_selector('renglones', NULL, NULL, NULL, false, 1, 50)$$),
  ('renglones busqueda', $$cuentas_proyectos_selector('renglones', NULL, 'EQ2', NULL, true, 1, 50)$$),
  ('pago cobro', $$cuentas_proyectos_selector('pago', 'cobro', NULL, NULL, true, 1, 50)$$),
  ('pago cobro cliente', $$cuentas_proyectos_selector('pago', 'cobro', NULL, (SELECT id FROM clientes WHERE nombre = 'EQ Cliente A'), true, 1, 50)$$),
  ('pago proveedor', $$cuentas_proyectos_selector('pago', 'proveedor', NULL, NULL, true, 1, 50)$$),
  ('pago proveedor comun', $$cuentas_proyectos_selector('pago', 'proveedor', NULL, (SELECT id FROM proveedores WHERE nombre = 'EQ Prov Comun'), false, 1, 50)$$)
) s(nombre, expr)
CROSS JOIN LATERAL pg_temp.eq_md5('SELECT ''s'' AS k, (' || s.expr || ')::jsonb::text AS t') r
ORDER BY s.nombre;

-- Guardas de consistencia: violaciones por guarda.
SELECT 'auditar[' || g.clave || ']', 1, g.violaciones
FROM jsonb_to_recordset(auditar_consistencia()->'guardas') g(clave text, violaciones int) ORDER BY g.clave;
