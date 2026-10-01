-- Issue #99: desglose antes/después de IVA en Cuentas, y utilidad bruta con
-- descuento.
--
-- 1. Utilidad bruta = Σ utilidad_total de las cotizaciones APROBADA
--    (margen + fee − descuento, lib/quotations/calculations.ts). Antes se
--    sumaba margen + fee y una cotización con descuento mostraba más utilidad
--    de la real (SH002, SH048 en producción).
-- 2. Cada concepto trae su monto ANTES de IVA (`neto`):
--    - cobro: su parte sin IVA de la cotización,
--      monto_total × (total − iva) / total; sin cotización, monto_total / 1.16;
--    - pago: el neto del grupo o de la suelta (el subtotal del cruce fiscal).
--    Con eso las tarjetas muestran Ingresos/Egresos sin y con IVA, y el flujo
--    con IVA que se concilia con la utilidad bruta.
-- 4. Impuestos del periodo: `total` = IVA a enterar + retenciones, lo que se
--    declara al SAT. El ISR estimado viaja aparte (isr_estimado) y ya no suma.
-- 3. cuentas_por_proyecto: cada cobro trae total e IVA de su cotización
--    (columnas 13 y 14), para la misma derivación en TS (periodo.ts).
--
-- Se recrean cuentas_conceptos (cambia su RETURNS TABLE: se agregan
-- utilidad_proyecto y neto al final), cuentas_por_proyecto y cuentas_periodo.
-- cuentas_opciones, cuentas_resumen y cuentas_avisos_items leen columnas por
-- nombre y no cambian.

BEGIN;

-- Lectura cruda (seleccionado y referencia TS): reapertura, bajas y anulados.
CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto(p_year integer, p_proyecto text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '8MB'
AS $$
DECLARE
  v_desde text;
  v_hasta text;
  v_result json;
BEGIN
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'cuentas_por_proyecto: p_year es obligatorio' USING ERRCODE = '22004';
  END IF;

  v_desde := lpad(p_year::text, 4, '0') || '-01-01';
  v_hasta := lpad((p_year + 1)::text, 4, '0') || '-01-01';

  -- Forma plana y posicional (O1b): cuatro listas de filas-arreglo, en json
  -- (no jsonb: construirlo cuesta la mitad). El orden de columnas es el
  -- contrato con lib/server/cuentas/periodo-rpc.ts, que las decodifica:
  --   proyectos: id, nombre, cliente, cliente_id, fecha_entrega, margen, fee,
  --              utilidad, iva, reabierta (B7)
  --   cobros:    id, cotizacion_id, proyecto_id, folio, cliente, cliente_id,
  --              proyecto, monto_total, monto_pagado, fecha_vencimiento,
  --              fecha_factura, facturas_xml, pagos, cotizacion_total,
  --              cotizacion_iva (#99; null sin cotización)
  --   pagos:     (solo cuentas SUELTAS) id, cotizacion_id, proyecto_id,
  --              grupo_id, responsable_id, responsable_nombre,
  --              item_descripcion, x_pagar, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, regimen_fiscal,
  --              facturas_xml, comprobantes, pagos_realizados
  --   grupos:    id, proyecto_id, responsable_id, responsable_nombre,
  --              regimen_fiscal, monto_total, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, facturas_xml, comprobantes,
  --              pagos_realizados, n_items, descripcion
  -- pagos_realizados = [{fecha, monto}] de pagos_cuentas_pagar no anulados,
  -- monto en total a transferir.
  -- Las cuentas hijas de un grupo no viajan (O1b): la lectura por periodo
  -- solo usa cuántas son y la descripción de la primera; el desglose del grupo
  -- lo trae el endpoint de detalle. Son la mitad del volumen del año.
  -- proyecto_id null = "Sin proyecto" (supuesto 11). Documentos y pagos son
  -- objetos (pocos); null = ninguno.
  WITH
  py AS (
    -- Proyectos del año, más los que no tienen una fecha válida ("Sin fecha", D9).
    SELECT p.id, p.proyecto, p.cliente, p.cliente_id, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE ((p.fecha_entrega >= v_desde AND p.fecha_entrega < v_hasta AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
           OR p.fecha_entrega IS NULL
           OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$')
      AND (p_proyecto IS NULL OR p.id = p_proyecto)
  ),
  cc AS (
    SELECT cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
           cc.monto_total, cc.monto_pagado, cc.fecha_vencimiento, cc.fecha_factura, cc.created_at
    FROM cuentas_cobrar cc
    WHERE (cc.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cc.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.responsable_nombre,
           cp.item_descripcion, cp.x_pagar, cp.monto_pagado, cp.total_a_transferir, cp.monto_transferido,
           cp.orden_pago_id, cp.created_at
    FROM cuentas_pagar cp
    WHERE (cp.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cp.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT g.id, g.proyecto_id, g.responsable_id, g.monto_total, g.monto_pagado, g.total_a_transferir,
           g.monto_transferido, g.orden_pago_id, g.created_at
    FROM cuentas_pagar_grupos g
    WHERE g.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  -- Cobros: facturas XML, y complementos por pago (D16, D27).
  cc_facturas AS (
    SELECT d.cuentas_cobrar_id AS id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga, 'metodo_pago', d.metodo_pago_cfdi)) AS docs
    FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.cuentas_cobrar_id IN (SELECT id FROM cc) AND d.eliminado_at IS NULL
    GROUP BY d.cuentas_cobrar_id
  ),
  comp AS (
    SELECT d.pago_id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO') AS xml,
           json_agg(json_build_object('fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO_PDF') AS pdf
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND d.cuentas_cobrar_id IN (SELECT id FROM cc)
    GROUP BY d.pago_id
  ),
  cc_pagos AS (
    SELECT pc.cuentas_cobrar_id AS id,
           json_agg(json_build_object(
             'id', pc.id, 'monto', pc.monto, 'fecha_pago', pc.fecha_pago, 'tipo_pago', pc.tipo_pago,
             'complemento_xml', COALESCE(comp.xml, '[]'::json), 'complemento_pdf', COALESCE(comp.pdf, '[]'::json)
           ) ORDER BY pc.fecha_pago, pc.created_at) AS pagos
    FROM pagos_comprobantes pc
    LEFT JOIN comp ON comp.pago_id = pc.id
    WHERE pc.cuentas_cobrar_id IN (SELECT id FROM cc) AND pc.anulado_at IS NULL
    GROUP BY pc.cuentas_cobrar_id
  ),
  dp AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo IN ('FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO') AND d.eliminado_at IS NULL
      AND (d.grupo_id IN (SELECT id FROM g) OR d.cuentas_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
    UNION ALL
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id), 'PAGO', NULL, p.created_at
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL AND p.comprobante_url IS NOT NULL
      AND (p.grupo_id IN (SELECT id FROM g) OR p.cuenta_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
  ),
  p_docs AS (
    SELECT id,
           json_agg(json_build_object('estado_validacion', estado_validacion, 'fecha_carga', fecha_carga)) FILTER (WHERE tipo = 'FACTURA_PROVEEDOR_XML') AS facturas,
           json_agg(json_build_object('fecha_carga', fecha_carga)) FILTER (WHERE tipo IN ('COMPROBANTE_PAGO', 'PAGO')) AS comprobantes
    FROM dp GROUP BY id
  ),
  p_fechas AS (
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id) AS id,
           json_agg(json_build_object('fecha', p.fecha_pago, 'monto', p.monto_transferido) ORDER BY p.fecha_pago, p.created_at) AS fechas
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL
      AND (p.grupo_id IN (SELECT id FROM g) OR p.cuenta_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
    GROUP BY 1
  ),
  g_items AS (
    SELECT cp.grupo_id AS id, count(*) AS n,
           (array_agg(cp.item_descripcion ORDER BY cp.created_at, cp.id))[1] AS descripcion,
           (array_agg(cp.responsable_nombre ORDER BY cp.created_at, cp.id))[1] AS responsable_nombre
    FROM cp WHERE cp.grupo_id IS NOT NULL
    GROUP BY cp.grupo_id
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee,
           ROUND(SUM(c.utilidad_total), 2) AS utilidad, ROUND(SUM(c.iva), 2) AS iva
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  )
  SELECT json_build_object(
    'proyectos', COALESCE((
      SELECT json_agg(json_build_array(
        py.id, py.proyecto, py.cliente, py.cliente_id, py.fecha_entrega,
        COALESCE(cot.margen, 0), COALESCE(cot.fee, 0), COALESCE(cot.utilidad, 0), COALESCE(cot.iva, 0), py.reabierta
      ) ORDER BY py.created_at DESC, py.id DESC)
      FROM py
      LEFT JOIN cot ON cot.pid = py.id
      WHERE py.id IN (SELECT cc.proyecto_id FROM cc UNION SELECT cp.proyecto_id FROM cp)
    ), '[]'::json),
    'cobros', COALESCE((
      SELECT json_agg(json_build_array(
        cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
        cc.monto_total, COALESCE(cc.monto_pagado, 0), cc.fecha_vencimiento, cc.fecha_factura,
        f.docs, pg.pagos, ct.total, ct.iva
      ) ORDER BY cc.created_at, cc.id)
      FROM cc
      LEFT JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
      LEFT JOIN cc_facturas f ON f.id = cc.id
      LEFT JOIN cc_pagos pg ON pg.id = cc.id
    ), '[]'::json),
    'pagos', COALESCE((
      SELECT json_agg(json_build_array(
        cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.responsable_nombre,
        cp.item_descripcion, cp.x_pagar, COALESCE(cp.monto_pagado, 0), cp.total_a_transferir,
        cp.monto_transferido, cp.orden_pago_id, pr.regimen_fiscal,
        d.facturas, d.comprobantes, pf.fechas
      ) ORDER BY cp.created_at, cp.id)
      FROM cp
      LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
      LEFT JOIN p_docs d ON d.id = cp.id
      LEFT JOIN p_fechas pf ON pf.id = cp.id
      WHERE cp.grupo_id IS NULL
    ), '[]'::json),
    'grupos', COALESCE((
      SELECT json_agg(json_build_array(
        g.id, g.proyecto_id, g.responsable_id, COALESCE(pr.nombre, gi.responsable_nombre), pr.regimen_fiscal,
        g.monto_total, COALESCE(g.monto_pagado, 0), g.total_a_transferir, g.monto_transferido, g.orden_pago_id,
        d.facturas, d.comprobantes, pf.fechas, COALESCE(gi.n, 0), gi.descripcion
      ) ORDER BY g.created_at, g.id)
      FROM g
      LEFT JOIN g_items gi ON gi.id = g.id
      LEFT JOIN proveedores pr ON pr.id = g.responsable_id
      LEFT JOIN p_docs d ON d.id = g.id
      LEFT JOIN p_fechas pf ON pf.id = g.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Derivación en SQL (paridad con concepto.ts / periodo.ts): cuentas_conceptos
-- gana utilidad_proyecto y neto al final (#99; cambia su RETURNS TABLE: se recrea).
DROP FUNCTION IF EXISTS public.cuentas_conceptos(integer, date);
CREATE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
RETURNS TABLE (
  proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text,
  fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean,
  margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean,
  concepto_creado timestamptz, key text, tipo text, objetivo text, id text, proyecto_id text,
  cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer,
  total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text,
  fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric,
  venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean,
  complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric,
  utilidad_proyecto numeric, neto numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  WITH
  py AS (
    SELECT p.id, p.proyecto AS nombre, p.cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE p_year IS NULL
       OR (p.fecha_entrega >= lpad(p_year::text, 4, '0') || '-01-01'
           AND p.fecha_entrega < lpad((p_year + 1)::text, 4, '0') || '-01-01'
           AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
       OR p.fecha_entrega IS NULL
       OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$'
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, c.cliente, c.cliente_id, c.monto_total, c.monto_pagado,
           c.fecha_vencimiento, c.fecha_factura, c.created_at
    FROM cuentas_cobrar c WHERE c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.responsable_nombre, c.item_descripcion,
           c.x_pagar, c.total_a_transferir, c.monto_transferido, c.orden_pago_id, c.created_at
    FROM cuentas_pagar c WHERE c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total, gr.total_a_transferir, gr.monto_transferido,
           gr.orden_pago_id, gr.created_at
    FROM cuentas_pagar_grupos gr WHERE gr.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee, ROUND(SUM(c.iva), 2) AS iva,
           -- #99: utilidad_total = margen + fee − descuento (calculations.ts).
           ROUND(SUM(c.utilidad_total), 2) AS utilidad
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden,
           COALESCE(cot.utilidad, 0) AS utilidad
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id)
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807, 0
    WHERE EXISTS (SELECT 1 FROM cc WHERE proyecto_id IS NULL) OR EXISTS (SELECT 1 FROM cp WHERE proyecto_id IS NULL)
  ),

  -- Cobros ------------------------------------------------------------------
  cc_factura AS (
    SELECT DISTINCT ON (d.cuentas_cobrar_id) d.cuentas_cobrar_id AS cc_id, d.estado_validacion, d.metodo_pago_cfdi, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.cuentas_cobrar_id IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY d.cuentas_cobrar_id, d.fecha_carga DESC
  ),
  cc_comp AS (
    SELECT DISTINCT ON (d.pago_id, d.tipo) d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    ORDER BY d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  cc_pago AS (
    SELECT pc.cuentas_cobrar_id AS cc_id, pc.id AS pago_id, pc.fecha_pago, pc.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           -- V4: un pago anterior a la factura (o sin fecha de factura: se pide) es anticipo.
           (c.fecha_factura IS NULL OR pc.fecha_pago > c.fecha_factura) AS requiere,
           CASE
             WHEN NOT (c.fecha_factura IS NULL OR pc.fecha_pago > c.fecha_factura) THEN 'anticipo'
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_comprobantes pc
    JOIN cc c ON c.id = pc.cuentas_cobrar_id
    LEFT JOIN cc_comp x ON x.pago_id = pc.id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN cc_comp f ON f.pago_id = pc.id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
    WHERE pc.anulado_at IS NULL
  ),
  cc_pagos AS (
    SELECT cc_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', requiere, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(requiere AND estado <> 'completo') AS pendiente,
           bool_or(requiere AND estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, ((xml_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, ((pdf_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM cc_pago
    GROUP BY cc_id
  ),
  cobro AS (
    SELECT c.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           round(c.monto_total, 2) AS v_total, round(COALESCE(c.monto_pagado, 0), 2) AS v_pagado,
           -- #99: parte sin IVA del cobro (netoCobro en periodo.ts).
           CASE WHEN ct.id IS NULL THEN round(c.monto_total * 100 / 116, 2)
                WHEN COALESCE(ct.total, 0) <= 0 THEN round(c.monto_total, 2)
                ELSE round(c.monto_total * (ct.total - COALESCE(ct.iva, 0)) / ct.total, 2) END AS v_neto,
           greatest(0, round(c.monto_total - COALESCE(c.monto_pagado, 0), 2)) AS v_saldo,
           f.estado_validacion AS f_estado, f.metodo_pago_cfdi AS metodo, f.fecha_carga AS f_fecha,
           (f.cc_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.cc_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pg.complementos, COALESCE(pg.pendiente, false) AS comp_pendiente, COALESCE(pg.en_revision, false) AS comp_revision,
           pg.fecha_max AS pagos_fecha_max
    FROM cc c
    JOIN proy pr ON pr.key = COALESCE(c.proyecto_id, 'sin-proyecto')
    LEFT JOIN cc_factura f ON f.cc_id = c.id
    LEFT JOIN cc_pagos pg ON pg.cc_id = c.id
    LEFT JOIN cotizaciones ct ON ct.id = c.cotizacion_id
  ),
  cobro_d AS (
    SELECT b.*,
           CASE WHEN b.fecha_vencimiento IS NOT NULL AND b.v_saldo > 0.005 THEN b.fecha_vencimiento - p_hoy END AS dias
    FROM cobro b
  ),
  cobro_e AS (
    SELECT b.*,
           (b.dias IS NOT NULL AND b.dias < 0) AS vencido,
           CASE
             WHEN NOT b.tiene_factura THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN b.fact_revision THEN 'en_revision' ELSE 'sin_factura' END
             WHEN b.v_saldo > 0.005 THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN COALESCE(b.monto_pagado, 0) > 0.005 THEN 'parcial' ELSE 'facturado' END
             WHEN b.metodo IS NULL THEN 'sin_complemento'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN 'sin_complemento'
             ELSE 'cobrado'
           END AS d_estado,
           CASE
             WHEN NOT b.tiene_factura THEN CASE WHEN b.fact_revision THEN 'revisar_factura' ELSE 'emitir_factura' END
             WHEN b.v_saldo > 0.005 THEN 'cobrar'
             WHEN b.metodo IS NULL THEN 'indicar_metodo'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN CASE WHEN b.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM cobro_d b
  ),

  -- Pagos a proveedor (grupos y sueltas) -------------------------------------
  obj AS (
    SELECT 'grupo'::text AS objetivo, gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total AS neto,
           gr.total_a_transferir, COALESCE(gr.monto_transferido, 0) AS transferido, gr.orden_pago_id, gr.created_at
    FROM g gr
    UNION ALL
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.x_pagar,
           c.total_a_transferir, COALESCE(c.monto_transferido, 0), c.orden_pago_id, c.created_at
    FROM cp c WHERE c.grupo_id IS NULL
  ),
  p_factura AS (
    SELECT DISTINCT ON (COALESCE(d.grupo_id, d.cuentas_pagar_id)) COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY COALESCE(d.grupo_id, d.cuentas_pagar_id), d.fecha_carga DESC
  ),
  -- Comprobantes (D11): documentos COMPROBANTE_PAGO y pagos con comprobante.
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id, d.fecha_carga AT TIME ZONE 'UTC' AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
      UNION ALL
      SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id), p.created_at
      FROM pagos_cuentas_pagar p
      WHERE p.anulado_at IS NULL AND p.comprobante_url IS NOT NULL AND COALESCE(p.grupo_id, p.cuenta_pagar_id) IS NOT NULL
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id) AS obj_id, max(p.fecha_pago) AS fecha_max
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL AND COALESCE(p.grupo_id, p.cuenta_pagar_id) IS NOT NULL
    GROUP BY 1
  ),
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(c.item_descripcion ORDER BY c.created_at, c.id))[1] AS descripcion,
           (array_agg(c.responsable_nombre ORDER BY c.created_at, c.id))[1] AS responsable_nombre
    FROM cp c WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, s.responsable_nombre AS s_responsable_nombre, s.item_descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion, gi.responsable_nombre AS g_responsable_nombre,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN g_items gi ON o.objetivo = 'grupo' AND gi.grupo_id = o.id
    LEFT JOIN p_factura f ON f.obj_id = o.id
    LEFT JOIN p_comp pc ON pc.obj_id = o.id
    LEFT JOIN p_fechas pf ON pf.obj_id = o.id
  ),
  -- Cruce por régimen del neto (espejo de calcularEjemploFactura): IVA 16%,
  -- retención de IVA 2/3 e ISR 10% (física) o 1.25% (RESICO); moral no retiene.
  pago_f AS (
    SELECT p.*, round(p.neto, 2) AS c_subtotal, round(round(p.neto, 2) * 0.16, 2) AS c_iva,
           CASE WHEN p.regimen IN ('fisica', 'resico') THEN round(round(p.neto, 2) * (2.0 / 3.0 * 0.16), 2) ELSE 0 END AS c_iva_ret,
           CASE p.regimen WHEN 'fisica' THEN round(round(p.neto, 2) * 0.10, 2)
                          WHEN 'resico' THEN round(round(p.neto, 2) * 0.0125, 2)
                          ELSE 0 END AS c_isr_ret
    FROM pago p
  ),
  pago_m AS (
    SELECT p.*,
           CASE WHEN p.total_a_transferir IS NULL THEN round(p.c_subtotal + p.c_iva - p.c_iva_ret - p.c_isr_ret, 2)
                ELSE round(p.total_a_transferir, 2) END AS v_total,
           round(p.transferido, 2) AS v_pagado,
           (p.objetivo = 'grupo' OR p.responsable_id IS NOT NULL) AS tiene_proveedor
    FROM pago_f p
  ),
  pago_e AS (
    SELECT p.*,
           greatest(0, round(p.v_total - p.v_pagado, 2)) AS v_saldo
    FROM pago_m p
  ),
  pago_d AS (
    SELECT p.*,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'sin_proveedor'
             WHEN p.fact_revision THEN 'en_revision'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'sin_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    WHEN p.v_pagado > 0.005 THEN 'parcial'
                    ELSE 'facturado' END
             ELSE 'pagado'
           END AS d_estado,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'asignar_proveedor'
             WHEN p.fact_revision THEN 'revisar_factura'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'subir_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    ELSE 'pagar' END
             WHEN NOT p.tiene_factura THEN 'subir_factura'
             WHEN p.comp_ts IS NULL THEN 'subir_comprobante'
           END AS d_paso
    FROM pago_e p
  )

  SELECT c.pkey, c.p_orden, c.p_nombre, c.p_cliente, c.p_fecha,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen, c.p_fee, c.p_iva, c.p_reabierta,
         c.created_at,
         'c:' || c.id, 'cobro', 'cobro', c.id::text, c.proyecto_id, c.cotizacion_id, c.folio,
         COALESCE(c.cliente, c.p_cliente, 'Cliente'), c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END,
         1, c.v_total, c.v_pagado, false, NULL, NULL, c.fecha_vencimiento::text,
         c.d_estado, c.d_paso, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo, c.dias, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest(((c.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
         c.tiene_factura AND c.metodo IS NULL AND c.d_estado <> 'cobrado',
         CASE WHEN c.tiene_factura AND c.metodo = 'PPD' THEN COALESCE(c.complementos, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULL::numeric, NULL::numeric, NULL::numeric,
         c.p_utilidad, c.v_neto
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey, p.p_orden, p.p_nombre, p.p_cliente, p.p_fecha,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen, p.p_fee, p.p_iva, p.p_reabierta,
         p.created_at,
         CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id, 'pago', p.objetivo, p.id::text, p.proyecto_id,
         CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END, NULL,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.prov_nombre, p.g_responsable_nombre, 'Proveedor')
              WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.s_responsable_nombre, 'Proveedor')
              ELSE 'Sin asignar' END,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END,
         p.v_total, p.v_pagado, p.total_a_transferir IS NULL, p.regimen, p.orden_pago_id::text, NULL,
         p.d_estado, p.d_paso, false, p.v_saldo, NULL, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest(((p.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max) END,
         false, '[]'::jsonb,
         p.c_iva, p.c_iva_ret, p.c_isr_ret,
         p.p_utilidad, p.c_subtotal
  FROM pago_d p;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[\u0300-\u036f]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_result    jsonb;
BEGIN
  WITH
  con AS MATERIALIZED (
    SELECT * FROM cuentas_conceptos(v_anio, v_hoy)
  ),
  -- Por proyecto, sobre todos sus conceptos (D17, totales y cierre fiscal).
  proj AS MATERIALIZED (
    SELECT c.proyecto_key AS key,
           min(c.proyecto_orden) AS orden,
           min(c.proyecto_nombre) AS nombre,
           min(c.proyecto_cliente) AS cliente,
           min(c.fecha_entrega) AS fecha_entrega,
           min(c.anio) AS anio,
           min(c.mes) AS mes,
           bool_and(c.sin_fecha) AS sin_fecha,
           bool_and(c.sin_proyecto) AS sin_proyecto,
           bool_and(c.proyecto_reabierta) AS reabierta,
           count(*) FILTER (WHERE NOT c.resuelto) AS pendientes,
           bool_or(c.estado = 'vencido') AS hay_vencidos,
           max(c.fecha_resuelto) AS fecha_resuelto_max,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS por_pagar,
           -- #99: antes de IVA (cobros) y neto (pagos).
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_neto,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.cierre_iva_retenido), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.utilidad_proyecto) AS utilidad, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           -- #99: utilidad bruta con descuento (Σ utilidad_total).
           round(x.utilidad, 2) AS utilidad_bruta,
           round(greatest(0, round(x.utilidad, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.utilidad, 2) - round(greatest(0, round(x.utilidad, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto
    FROM proj x
  ),
  -- S16: sin mes, el actual si es el año en curso; si no, el último con proyectos.
  mes_ef AS (
    SELECT CASE
             WHEN v_mes_txt = 'todo' THEN NULL
             WHEN v_mes_txt ~ '^\d+$' THEN v_mes_txt::int
             WHEN v_anio = extract(year FROM v_hoy)::int THEN extract(month FROM v_hoy)::int
             ELSE (SELECT max(mes) FROM pj WHERE NOT sin_fecha AND anio = v_anio)
           END AS mes
  ),
  -- Conceptos que pasan tipo, cliente, proveedor y búsqueda.
  -- Búsqueda (normalizarBusqueda): los cinco campos se normalizan juntos,
  -- separados por U+001F (la búsqueda no lo puede contener), en una sola
  -- pasada por concepto. normalize() es lo caro: un texto solo ASCII
  -- (bytes = caracteres) no tiene acentos y se salta.
  fc AS MATERIALIZED (
    SELECT c.*
    FROM con c
    CROSS JOIN LATERAL (
      SELECT concat_ws(chr(31), c.proyecto_key, c.proyecto_nombre, COALESCE(c.proyecto_cliente, ''), c.contraparte, c.concepto) AS texto
    ) b
    WHERE (v_tipo = 'todo' OR c.tipo = v_tipo)
      AND (v_cliente IS NULL OR (c.tipo = 'cobro' AND c.contraparte = v_cliente))
      AND (v_proveedor IS NULL OR (c.tipo = 'pago' AND c.contraparte = v_proveedor))
      AND (v_q = ''
           OR strpos(CASE WHEN octet_length(b.texto) = char_length(b.texto) THEN lower(b.texto)
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[\u0300-\u036f]', '', 'g')) END,
                     v_q) > 0)
  ),
  dec AS MATERIALIZED (
    SELECT pj.*,
           (v_estado = 'todas' OR (v_estado = 'pendientes' AND NOT pj.cerradas) OR (v_estado = 'cerradas' AND pj.cerradas)) AS estado_ok
    FROM pj
    WHERE pj.key IN (SELECT proyecto_key FROM fc)
  ),
  del_anio AS (
    SELECT * FROM dec WHERE NOT sin_fecha AND anio = v_anio
  ),
  alcance AS MATERIALIZED (
    SELECT d.* FROM del_anio d, mes_ef m WHERE m.mes IS NULL OR d.mes = m.mes
  ),
  -- Proyectos a mostrar: los del periodo, y en "Todo el año" también "Sin fecha" (S17).
  vis AS MATERIALIZED (
    SELECT a.*, row_number() OVER (ORDER BY a.mes, a.cerradas, a.orden) AS pos, false AS es_sin_fecha
    FROM alcance a WHERE a.estado_ok
    UNION ALL
    SELECT d.*, 1000000 + row_number() OVER (ORDER BY d.orden), true
    FROM dec d, mes_ef m
    WHERE m.mes IS NULL AND d.sin_fecha AND d.estado_ok
  ),
  -- Orden de la lista: el de las tarjetas y, dentro del proyecto, cobros,
  -- luego grupos, luego sueltas, cada uno por creación. Se numeran solo las
  -- llaves (ordenar la fila completa costaba ~60 ms); la fila entera se
  -- vuelve a leer solo para la página pedida.
  filas AS MATERIALIZED (
    SELECT f.key, f.proyecto_key,
           row_number() OVER (ORDER BY v.pos, f.tipo = 'pago', f.objetivo = 'cuenta', f.concepto_creado, f.id) AS n
    FROM fc f
    JOIN vis v ON v.key = f.proyecto_key
    WHERE v_estado <> 'pendientes' OR NOT f.resuelto
  ),
  tarjetas AS (
    SELECT v.pos, v.es_sin_fecha,
           jsonb_build_object(
             'id', v.key, 'nombre', v.nombre, 'cliente', v.cliente, 'fecha_entrega', v.fecha_entrega,
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar,
                                           'cobros_sin_iva', v.cobros_sin_iva, 'pagos_neto', v.pagos_neto)
           ) AS t
    FROM vis v
  ),
  -- Totales del periodo: conceptos filtrados de los proyectos del alcance y su cierre.
  tot_c AS (
    SELECT round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_neto
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta,
           -- #99: flujo con IVA de los mismos proyectos que la utilidad (sin filtros de concepto).
           round(COALESCE(sum(cobros_total - pagos_total), 0), 2) AS flujo
    FROM alcance
  )
  SELECT jsonb_build_object(
    'anio', v_anio,
    'mes', COALESCE(to_jsonb(m.mes), '"todo"'::jsonb),
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'meses', (
      SELECT jsonb_agg(jsonb_build_object(
               'mes', s.m,
               'proyectos', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m),
               'pendientes', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND NOT d.cerradas),
               'visibles', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND d.estado_ok)
             ) ORDER BY s.m)
      FROM generate_series(1, 12) AS s(m)
    ),
    'conteo', (
      SELECT jsonb_build_object('todas', count(*), 'pendientes', count(*) FILTER (WHERE NOT cerradas), 'cerradas', count(*) FILTER (WHERE cerradas))
      FROM alcance
    ),
    'totales', (
      SELECT jsonb_build_object(
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar, 'sin_iva', c.cobros_sin_iva),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar, 'neto', c.pagos_neto),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta, 'flujo', t.flujo),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones, 2))
      )
      FROM tot_c c, tot_p t
    ),
    'proyectos', CASE WHEN v_vista = 'proyectos' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM (
                   SELECT t, pos FROM tarjetas WHERE NOT es_sin_fecha ORDER BY pos
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x), '[]'::jsonb),
        'total', (SELECT count(*) FROM vis WHERE NOT es_sin_fecha),
        'page', v_page, 'page_size', v_size)
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size) END,
    'sin_fecha', CASE WHEN v_vista = 'proyectos'
      THEN COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM tarjetas WHERE es_sin_fecha), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'lista', CASE WHEN v_vista = 'lista' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto(integer, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_periodo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_periodo(jsonb) TO service_role;

COMMIT;
