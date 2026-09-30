-- Frente 2 de latencia de Cuentas, bloque A1 (docs/PLAN.md, opción A).
--
-- Cada RPC de Cuentas recalculaba cuentas_conceptos desde cero (~330 ms
-- sobre el dataset de carga de test); con esa base, cualquier contención de
-- la BD rebasaba el presupuesto de 800 ms del job live. La opción A guarda
-- los conceptos ya derivados en una tabla y cada lectura parte de ahí.
--
-- Este bloque (A1) solo agrega piezas, sin cambiar ninguna lectura:
-- 1. cuentas_conceptos_derivar(p_year, p_proyectos, p_hoy): la derivación de
--    siempre (idéntica a cuentas_conceptos de 20261007), con un filtro
--    opcional por proyecto. Es plpgsql con plan_cache_mode = force_custom_plan:
--    como función SQL el plan genérico tardaba ~7.5 s sobre el año completo.
--    cuentas_conceptos(p_year, p_hoy) pasa a llamarla con p_proyectos NULL.
-- 2. Tabla cuentas_conceptos_base: una fila por concepto con todo lo que NO
--    depende de "hoy". Se deriva con p_hoy = 1900-01-01 (nada vencido); al
--    leer se recalculan venc_dias, el estado 'vencido', paso_urgente y el
--    orden de proyectos.
-- 3. cuentas_conceptos_refrescar(p_proyectos): borra y vuelve a derivar esos
--    proyectos ('sin-proyecto' incluido). Los triggers que lo llaman llegan
--    en A2; mientras tanto la tabla solo se llena con el backfill.
-- 4. cuentas_conceptos_leer(p_year, p_hoy): misma forma que cuentas_conceptos,
--    desde la tabla. Las RPCs la usan a partir de A3.
-- 5. cuentas_conceptos_diferencias(p_year, p_hoy): filas que no coinciden
--    entre leer y la derivación (test de paridad; debe dar 0).

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_derivar(p_year integer, p_proyectos text[], p_hoy date)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
-- Plan con los valores reales: como función SQL, el plan genérico con
-- p_proyectos estimaba mal y tardaba ~7.5 s sobre el año completo.
SET plan_cache_mode = force_custom_plan
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH
  py AS (
    SELECT p.id, p.proyecto AS nombre, p.cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE (p_proyectos IS NULL OR p.id = ANY(p_proyectos))
      AND (p_year IS NULL
       OR (p.fecha_entrega >= lpad(p_year::text, 4, '0') || '-01-01'
           AND p.fecha_entrega < lpad((p_year + 1)::text, 4, '0') || '-01-01'
           AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
       OR p.fecha_entrega IS NULL
       OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$')
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, c.cliente, c.cliente_id, c.monto_total, c.monto_pagado,
           c.fecha_vencimiento, c.fecha_factura, c.created_at
    FROM cuentas_cobrar c
    WHERE (c.proyecto_id IS NULL AND (p_proyectos IS NULL OR 'sin-proyecto' = ANY(p_proyectos)))
       OR c.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.responsable_nombre, c.item_descripcion,
           c.x_pagar, c.total_a_transferir, c.monto_transferido, c.orden_pago_id, c.created_at
    FROM cuentas_pagar c
    WHERE (c.proyecto_id IS NULL AND (p_proyectos IS NULL OR 'sin-proyecto' = ANY(p_proyectos)))
       OR c.proyecto_id IN (SELECT id FROM py)
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

  -- RETURN QUERY exige tipos exactos (varchar ≠ text): casts explícitos.
  SELECT c.pkey::text, c.p_orden::bigint, c.p_nombre::text, c.p_cliente::text, c.p_fecha::text,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen::numeric, c.p_fee::numeric, c.p_iva::numeric, c.p_reabierta,
         c.created_at::timestamptz,
         ('c:' || c.id)::text, 'cobro'::text, 'cobro'::text, c.id::text, c.proyecto_id::text, c.cotizacion_id::text, c.folio::text,
         COALESCE(c.cliente, c.p_cliente, 'Cliente')::text, c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END::text,
         1::integer, c.v_total::numeric, c.v_pagado::numeric, false, NULL::text, NULL::text, c.fecha_vencimiento::text,
         c.d_estado::text, c.d_paso::text, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo::numeric, c.dias::integer, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest(((c.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
         c.tiene_factura AND c.metodo IS NULL AND c.d_estado <> 'cobrado',
         CASE WHEN c.tiene_factura AND c.metodo = 'PPD' THEN COALESCE(c.complementos, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULL::numeric, NULL::numeric, NULL::numeric,
         c.p_utilidad::numeric, c.v_neto::numeric
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey::text, p.p_orden::bigint, p.p_nombre::text, p.p_cliente::text, p.p_fecha::text,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen::numeric, p.p_fee::numeric, p.p_iva::numeric, p.p_reabierta,
         p.created_at::timestamptz,
         (CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id)::text, 'pago'::text, p.objetivo::text, p.id::text, p.proyecto_id::text,
         (CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END)::text, NULL::text,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.prov_nombre, p.g_responsable_nombre, 'Proveedor')
              WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.s_responsable_nombre, 'Proveedor')
              ELSE 'Sin asignar' END::text,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END::text,
         (CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END)::integer,
         p.v_total::numeric, p.v_pagado::numeric, p.total_a_transferir IS NULL, p.regimen::text, p.orden_pago_id::text, NULL::text,
         p.d_estado::text, p.d_paso::text, false, p.v_saldo::numeric, NULL::integer, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest(((p.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max) END,
         false, '[]'::jsonb,
         p.c_iva::numeric, p.c_iva_ret::numeric, p.c_isr_ret::numeric,
         p.p_utilidad::numeric, p.c_subtotal::numeric
  FROM pago_d p;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
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
  SELECT * FROM cuentas_conceptos_derivar(p_year, NULL, p_hoy);
$$;

CREATE TABLE IF NOT EXISTS public.cuentas_conceptos_base AS
  SELECT proyecto_key, proyecto_nombre, proyecto_cliente, fecha_entrega, anio, mes, sin_fecha, sin_proyecto,
  margen, fee, iva_proyecto, proyecto_reabierta, concepto_creado, key, tipo, objetivo, id, proyecto_id,
  cotizacion_id, folio, contraparte, contraparte_id, concepto, items, total, pagado, total_estimado,
  regimen_fiscal, orden_pago_id, fecha_vencimiento, estado, paso, saldo, resuelto, fecha_resuelto,
  metodo_desconocido, complementos, cierre_iva, cierre_iva_retenido, cierre_isr_retenido,
  utilidad_proyecto, neto
  FROM cuentas_conceptos_derivar(NULL, NULL, DATE '1900-01-01')
  WITH NO DATA;

ALTER TABLE public.cuentas_conceptos_base DROP CONSTRAINT IF EXISTS cuentas_conceptos_base_pkey;
ALTER TABLE public.cuentas_conceptos_base ADD CONSTRAINT cuentas_conceptos_base_pkey PRIMARY KEY (key);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_base_proyecto_idx ON public.cuentas_conceptos_base (proyecto_key);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_base_anio_idx ON public.cuentas_conceptos_base (anio, mes);
ALTER TABLE public.cuentas_conceptos_base ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_conceptos_base FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_refrescar(p_proyectos text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
BEGIN
  IF p_proyectos IS NULL OR cardinality(p_proyectos) = 0 THEN
    RETURN;
  END IF;
  DELETE FROM cuentas_conceptos_base WHERE proyecto_key = ANY(p_proyectos);
  INSERT INTO cuentas_conceptos_base (proyecto_key, proyecto_nombre, proyecto_cliente, fecha_entrega, anio, mes, sin_fecha, sin_proyecto,
  margen, fee, iva_proyecto, proyecto_reabierta, concepto_creado, key, tipo, objetivo, id, proyecto_id,
  cotizacion_id, folio, contraparte, contraparte_id, concepto, items, total, pagado, total_estimado,
  regimen_fiscal, orden_pago_id, fecha_vencimiento, estado, paso, saldo, resuelto, fecha_resuelto,
  metodo_desconocido, complementos, cierre_iva, cierre_iva_retenido, cierre_isr_retenido,
  utilidad_proyecto, neto)
  SELECT proyecto_key, proyecto_nombre, proyecto_cliente, fecha_entrega, anio, mes, sin_fecha, sin_proyecto,
  margen, fee, iva_proyecto, proyecto_reabierta, concepto_creado, key, tipo, objetivo, id, proyecto_id,
  cotizacion_id, folio, contraparte, contraparte_id, concepto, items, total, pagado, total_estimado,
  regimen_fiscal, orden_pago_id, fecha_vencimiento, estado, paso, saldo, resuelto, fecha_resuelto,
  metodo_desconocido, complementos, cierre_iva, cierre_iva_retenido, cierre_isr_retenido,
  utilidad_proyecto, neto
  FROM cuentas_conceptos_derivar(NULL, p_proyectos, DATE '1900-01-01');
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_leer(p_year integer, p_hoy date)
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
AS $$
  WITH b AS (
    SELECT * FROM cuentas_conceptos_base
    WHERE p_year IS NULL OR anio = p_year OR sin_fecha
  ),
  -- Orden de la lectura cruda: proyectos del alcance por created_at desc, id desc.
  ord AS (
    SELECT p.id, row_number() OVER (ORDER BY p.created_at DESC, p.id DESC) AS orden
    FROM proyectos p
    WHERE p.id IN (SELECT proyecto_key FROM b)
  ),
  d AS (
    SELECT b.*,
           CASE WHEN b.tipo = 'cobro' AND b.fecha_vencimiento IS NOT NULL AND b.saldo > 0.005
                THEN b.fecha_vencimiento::date - p_hoy END AS dias
    FROM b
  )
  SELECT d.proyecto_key,
         CASE WHEN d.sin_proyecto THEN 9223372036854775807 ELSE ord.orden END,
         d.proyecto_nombre, d.proyecto_cliente, d.fecha_entrega, d.anio, d.mes, d.sin_fecha, d.sin_proyecto,
         d.margen, d.fee, d.iva_proyecto, d.proyecto_reabierta, d.concepto_creado, d.key, d.tipo, d.objetivo,
         d.id, d.proyecto_id, d.cotizacion_id, d.folio, d.contraparte, d.contraparte_id, d.concepto, d.items,
         d.total, d.pagado, d.total_estimado, d.regimen_fiscal, d.orden_pago_id, d.fecha_vencimiento,
         CASE WHEN d.dias < 0 THEN 'vencido' ELSE d.estado END,
         d.paso,
         (d.dias IS NOT NULL AND d.dias < 0) AND d.paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         d.saldo, d.dias, d.resuelto, d.fecha_resuelto, d.metodo_desconocido, d.complementos,
         d.cierre_iva, d.cierre_iva_retenido, d.cierre_isr_retenido, d.utilidad_proyecto, d.neto
  FROM d
  LEFT JOIN ord ON ord.id = d.proyecto_key;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_diferencias(p_year integer, p_hoy date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  WITH l AS (SELECT * FROM cuentas_conceptos_leer(p_year, p_hoy)),
       r AS (SELECT * FROM cuentas_conceptos_derivar(p_year, NULL, p_hoy))
  SELECT ((SELECT count(*) FROM (SELECT * FROM l EXCEPT ALL SELECT * FROM r) x)
        + (SELECT count(*) FROM (SELECT * FROM r EXCEPT ALL SELECT * FROM l) y))::int;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_derivar(integer, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_derivar(integer, text[], date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_refrescar(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_refrescar(text[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_leer(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_leer(integer, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_diferencias(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_diferencias(integer, date) TO service_role;

-- Backfill: todos los proyectos con conceptos, más "Sin proyecto".
TRUNCATE public.cuentas_conceptos_base;
INSERT INTO public.cuentas_conceptos_base (proyecto_key, proyecto_nombre, proyecto_cliente, fecha_entrega, anio, mes, sin_fecha, sin_proyecto,
  margen, fee, iva_proyecto, proyecto_reabierta, concepto_creado, key, tipo, objetivo, id, proyecto_id,
  cotizacion_id, folio, contraparte, contraparte_id, concepto, items, total, pagado, total_estimado,
  regimen_fiscal, orden_pago_id, fecha_vencimiento, estado, paso, saldo, resuelto, fecha_resuelto,
  metodo_desconocido, complementos, cierre_iva, cierre_iva_retenido, cierre_isr_retenido,
  utilidad_proyecto, neto)
SELECT proyecto_key, proyecto_nombre, proyecto_cliente, fecha_entrega, anio, mes, sin_fecha, sin_proyecto,
  margen, fee, iva_proyecto, proyecto_reabierta, concepto_creado, key, tipo, objetivo, id, proyecto_id,
  cotizacion_id, folio, contraparte, contraparte_id, concepto, items, total, pagado, total_estimado,
  regimen_fiscal, orden_pago_id, fecha_vencimiento, estado, paso, saldo, resuelto, fecha_resuelto,
  metodo_desconocido, complementos, cierre_iva, cierre_iva_retenido, cierre_isr_retenido,
  utilidad_proyecto, neto
FROM cuentas_conceptos_derivar(NULL, NULL, DATE '1900-01-01');

COMMIT;
