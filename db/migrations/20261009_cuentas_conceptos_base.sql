-- Frente 2 de latencia de Cuentas (docs/PLAN.md, opción A; ADR 019).
--
-- Cada RPC de Cuentas recalculaba cuentas_conceptos desde cero (~330 ms sobre
-- el dataset de carga de test, 13,000 conceptos); con esa base cualquier
-- contención rebasaba el presupuesto p95 < 800 ms del job live. Ahora los
-- conceptos ya derivados viven en una tabla que se mantiene al día con
-- triggers, y cada lectura parte de ahí.
--
-- Esta migración es el estado final consolidado de lo que se construyó en
-- varias entregas (A1 tabla y refresco, A2 triggers, A3 lecturas, más dos
-- correcciones). Nunca corrió en producción, por eso se consolidó: la regla
-- append-only (decisión 005) protege lo ya aplicado ahí.
--
-- Piezas:
--  1. cuentas_conceptos_derivar(p_year, p_proyectos, p_hoy): la derivación de
--     siempre (la de 20261007) con un filtro opcional por proyecto. plpgsql con
--     plan_cache_mode = force_custom_plan: como función SQL el plan genérico
--     tardaba ~7.5 s sobre el año completo.
--  2. Tabla cuentas_conceptos_base: una fila por concepto con todo lo que NO
--     depende de "hoy" (modo tabla: derivar con p_hoy NULL). Al leer se recalculan
--     venc_dias, el estado 'vencido', paso_urgente y el orden de proyectos.
--  3. cuentas_conceptos_leer y cuentas_conceptos(p_year, p_hoy): las cuatro
--     RPCs de lectura (periodo, resumen, avisos, opciones) pasan por
--     cuentas_conceptos, que ahora lee la tabla.
--  4. Refresco por proyecto al confirmar cada escritura: los triggers de las 11
--     tablas fuente marcan sus proyectos en cuentas_conceptos_pendientes (OLD y
--     NEW); un constraint trigger diferido vacía la cola una vez por
--     transacción, con un advisory lock por proyecto en orden fijo, y llama a
--     cuentas_conceptos_refrescar. Así la tabla nunca está desactualizada.
--     Medido en test: ~141 ms de media por commit (máx. 2.9 s).
--  5. cuentas_conceptos_diferencias: filas que no coinciden entre la tabla y la
--     derivación (test de paridad; debe dar 0).
--  6. cuentas_conceptos_reconciliar(): red de seguridad diaria (keep-alive).
--  7. Tipo cuentas_concepto_t: la forma de un concepto se define una vez.
--     Con p_hoy NULL la derivación corre en "modo tabla": sin venc_dias ni orden
--     (eso se calcula al leer).
--
-- Notas de operación:
--  * pg_safeupdate (precargado por Supabase en las conexiones de PostgREST)
--    rechaza DELETE sin WHERE: la cola se vacía con WHERE proyecto_key IS NOT NULL.
--  * La cola vive y muere dentro de la misma transacción; el dedupe por xmin de
--    cuentas_conceptos_encolar es por transacción.
--  * Cargas masivas: SET LOCAL serenata.sin_refresco = 'on' apaga el marcado en
--    esa transacción; al terminar, cuentas_conceptos_reconstruir().

BEGIN;

-- Forma de un concepto: una sola definición para la derivación, la lectura y
-- la entrada de las RPCs (antes se repetía en cada firma).
CREATE TYPE public.cuentas_concepto_t AS (
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
);

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_derivar(p_year integer, p_proyectos text[], p_hoy date)
RETURNS SETOF public.cuentas_concepto_t
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
  SELECT c.pkey::text, (CASE WHEN p_hoy IS NULL THEN NULL ELSE c.p_orden END)::bigint, c.p_nombre::text, c.p_cliente::text, c.p_fecha::text,
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
  SELECT p.pkey::text, (CASE WHEN p_hoy IS NULL THEN NULL ELSE p.p_orden END)::bigint, p.p_nombre::text, p.p_cliente::text, p.p_fecha::text,
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

-- Mismas columnas que la derivación (incluye proyecto_orden, paso_urgente y
-- venc_dias, que en modo tabla van vacíos: se calculan al leer).
CREATE TABLE public.cuentas_conceptos_base AS
  SELECT * FROM cuentas_conceptos_derivar(NULL, NULL, NULL)
  WITH NO DATA;

ALTER TABLE public.cuentas_conceptos_base DROP CONSTRAINT IF EXISTS cuentas_conceptos_base_pkey;
ALTER TABLE public.cuentas_conceptos_base ADD CONSTRAINT cuentas_conceptos_base_pkey PRIMARY KEY (key);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_base_proyecto_idx ON public.cuentas_conceptos_base (proyecto_key);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_base_anio_idx ON public.cuentas_conceptos_base (anio, mes);
ALTER TABLE public.cuentas_conceptos_base ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_conceptos_base FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_leer(p_year integer, p_hoy date)
RETURNS SETOF public.cuentas_concepto_t
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

-- Entrada de las cuatro RPCs de lectura: lee la tabla. La versión de 20261007
-- devolvía RETURNS TABLE; ahora devuelve el tipo compuesto.
DROP FUNCTION IF EXISTS public.cuentas_conceptos(integer, date);
CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
RETURNS SETOF public.cuentas_concepto_t
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM cuentas_conceptos_leer(p_year, p_hoy);
$$;

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
  INSERT INTO cuentas_conceptos_base SELECT * FROM cuentas_conceptos_derivar(NULL, p_proyectos, NULL);
END;
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

-- Red de seguridad (la corre /api/keep-alive cada día): compara la tabla con la
-- derivación completa, refresca los proyectos que no coinciden y devuelve sus
-- claves. Como cada escritura actualiza la tabla en su misma transacción, un
-- desfase real solo viene de TRUNCATE, de triggers apagados o de ediciones
-- directas: no hay falsos positivos por escrituras en curso.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_reconciliar()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
DECLARE
  v_keys text[];
  v_h integer;
BEGIN
  SELECT array_agg(DISTINCT x.proyecto_key) INTO v_keys
  FROM (
    (SELECT * FROM cuentas_conceptos_base EXCEPT ALL SELECT * FROM cuentas_conceptos_derivar(NULL, NULL, NULL))
    UNION ALL
    (SELECT * FROM cuentas_conceptos_derivar(NULL, NULL, NULL) EXCEPT ALL SELECT * FROM cuentas_conceptos_base)
  ) x;
  IF v_keys IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  FOR v_h IN SELECT DISTINCT hashtext(k) FROM unnest(v_keys) AS k ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(20261010, v_h);
  END LOOP;
  PERFORM cuentas_conceptos_refrescar(v_keys);
  RETURN v_keys;
END;
$$;

-- Cola de proyectos por refrescar (vive dentro de la transacción de escritura).
CREATE TABLE IF NOT EXISTS public.cuentas_conceptos_pendientes (
  proyecto_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_pendientes_key_idx ON public.cuentas_conceptos_pendientes (proyecto_key);
ALTER TABLE public.cuentas_conceptos_pendientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_conceptos_pendientes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_encolar(p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('serenata.sin_refresco', true) = 'on' THEN
    RETURN;
  END IF;
  INSERT INTO cuentas_conceptos_pendientes (proyecto_key)
  SELECT DISTINCT k FROM unnest(p_keys) AS k
  WHERE k IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM cuentas_conceptos_pendientes p
      WHERE p.proyecto_key = k AND p.xmin::text = (txid_current() % 4294967296)::text
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_procesar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[];
  v_h integer;
BEGIN
  WITH d AS (DELETE FROM cuentas_conceptos_pendientes WHERE proyecto_key IS NOT NULL RETURNING proyecto_key)
  SELECT array_agg(DISTINCT proyecto_key) INTO v_keys FROM d;
  IF v_keys IS NULL THEN
    RETURN NULL;
  END IF;
  -- Orden fijo de adquisición: sin deadlocks entre transacciones.
  FOR v_h IN SELECT DISTINCT hashtext(k) FROM unnest(v_keys) AS k ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(20261010, v_h);
  END LOOP;
  PERFORM cuentas_conceptos_refrescar(v_keys);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_procesar ON public.cuentas_conceptos_pendientes;
CREATE CONSTRAINT TRIGGER trigger_cuentas_conceptos_procesar
AFTER INSERT ON public.cuentas_conceptos_pendientes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_procesar();

-- Reconstrucción completa (tras una carga masiva con sin_refresco).
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_reconstruir()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(20261010, 0);
  PERFORM cuentas_conceptos_refrescar(
    ARRAY(SELECT proyecto_key FROM cuentas_conceptos_base
          UNION SELECT id FROM proyectos
          UNION SELECT 'sin-proyecto')
  );
END;
$$;

-- Keys de proyecto a partir de ids de cuentas / grupos.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_cobrar(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_cobrar c WHERE c.id = ANY(p_ids));
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_pagar(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.id = ANY(p_ids));
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_grupos(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT COALESCE(g.proyecto_id, 'sin-proyecto') FROM cuentas_pagar_grupos g WHERE g.id = ANY(p_ids)
    UNION
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.grupo_id = ANY(p_ids)
  );
$$;

-- Tablas con proyecto_id propio: cuentas_cobrar, cuentas_pagar, cuentas_reaperturas.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proyecto_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.proyecto_id, 'sin-proyecto') END,
    CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.proyecto_id, 'sin-proyecto') END
  ]);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_grupos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.proyecto_id, 'sin-proyecto') END,
      CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.proyecto_id, 'sin-proyecto') END
    ]
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
    ])
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_docs_cobrar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cc uuid[] := ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_cobrar_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_cobrar_id END
  ];
  v_pagos uuid[] := ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.pago_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.pago_id END
  ];
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_cobrar(v_cc || ARRAY(SELECT pc.cuentas_cobrar_id FROM pagos_comprobantes pc WHERE pc.id = ANY(v_pagos)))
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(cuentas_conceptos_keys_cobrar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_cobrar_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_cobrar_id END
  ]));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_docs_pagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_pagar(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_pagar_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_pagar_id END
    ])
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.grupo_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.grupo_id END
    ])
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_pagos_pagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_pagar(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuenta_pagar_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuenta_pagar_id END
    ])
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.grupo_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.grupo_id END
    ])
  );
  RETURN NULL;
END;
$$;

-- proyectos: nombre, cliente y fecha de entrega viven en la tabla (el orden se
-- calcula al leer). Las cuentas nuevas o borradas encolan por su cuenta.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proyectos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.proyecto IS NOT DISTINCT FROM NEW.proyecto
     AND OLD.cliente IS NOT DISTINCT FROM NEW.cliente
     AND OLD.fecha_entrega IS NOT DISTINCT FROM NEW.fecha_entrega THEN
    RETURN NULL;
  END IF;
  PERFORM cuentas_conceptos_encolar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
  ]);
  RETURN NULL;
END;
$$;

-- cotizaciones: margen/fee/iva/utilidad de las APROBADAS del proyecto y
-- total/iva de la cotización de cada cobro (neto sin IVA). Los borradores
-- sin cobro no encolan.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_cotizaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[] := '{}';
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.estado IS NOT DISTINCT FROM NEW.estado
     AND OLD.es_complementaria_de IS NOT DISTINCT FROM NEW.es_complementaria_de
     AND OLD.margen_total IS NOT DISTINCT FROM NEW.margen_total
     AND OLD.fee_agencia IS NOT DISTINCT FROM NEW.fee_agencia
     AND OLD.iva IS NOT DISTINCT FROM NEW.iva
     AND OLD.utilidad_total IS NOT DISTINCT FROM NEW.utilidad_total
     AND OLD.total IS NOT DISTINCT FROM NEW.total THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.estado = 'APROBADA' THEN
    v_keys := v_keys || COALESCE(OLD.es_complementaria_de, OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.estado = 'APROBADA' THEN
    v_keys := v_keys || COALESCE(NEW.es_complementaria_de, NEW.id);
  END IF;
  v_keys := v_keys || ARRAY(
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_cobrar c
    WHERE c.cotizacion_id IN (
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
    )
  );
  PERFORM cuentas_conceptos_encolar(v_keys);
  RETURN NULL;
END;
$$;

-- proveedores: nombre y régimen (retenciones) de grupos y cuentas sueltas.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proveedores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(ARRAY(
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.responsable_id = NEW.id
    UNION
    SELECT COALESCE(g.proyecto_id, 'sin-proyecto') FROM cuentas_pagar_grupos g WHERE g.responsable_id = NEW.id
  ));
  RETURN NULL;
END;
$$;

-- cuentas_cobrar, cuentas_pagar y cuentas_pagar_grupos cambian a menudo solo de
-- `estado` (p. ej. el cron diario sync_estados_cuentas_cobrar_vencidas) y la
-- derivación no lo lee: INSERT y DELETE siempre marcan el proyecto, pero el
-- UPDATE solo si cambia una columna que la derivación sí lee. Medido en test:
-- un UPDATE de solo estado sobre 500 cobros marcaba 498 proyectos y su commit
-- tardaba 882 ms de refresco inútil. Si la derivación pasa a leer otra columna
-- de estas tablas, hay que agregarla aquí (ver .claude/rules/migraciones.md).
DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_cobrar;
DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_upd ON public.cuentas_cobrar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR DELETE ON public.cuentas_cobrar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();
CREATE TRIGGER trigger_cuentas_conceptos_upd AFTER UPDATE ON public.cuentas_cobrar
FOR EACH ROW WHEN (ROW(OLD.id, OLD.proyecto_id, OLD.cotizacion_id, OLD.folio, OLD.cliente, OLD.cliente_id, OLD.monto_total, OLD.monto_pagado, OLD.fecha_vencimiento, OLD.fecha_factura, OLD.created_at) IS DISTINCT FROM ROW(NEW.id, NEW.proyecto_id, NEW.cotizacion_id, NEW.folio, NEW.cliente, NEW.cliente_id, NEW.monto_total, NEW.monto_pagado, NEW.fecha_vencimiento, NEW.fecha_factura, NEW.created_at))
EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_pagar;
DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_upd ON public.cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR DELETE ON public.cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();
CREATE TRIGGER trigger_cuentas_conceptos_upd AFTER UPDATE ON public.cuentas_pagar
FOR EACH ROW WHEN (ROW(OLD.id, OLD.proyecto_id, OLD.grupo_id, OLD.cotizacion_id, OLD.responsable_id, OLD.responsable_nombre, OLD.item_descripcion, OLD.x_pagar, OLD.total_a_transferir, OLD.monto_transferido, OLD.orden_pago_id, OLD.created_at) IS DISTINCT FROM ROW(NEW.id, NEW.proyecto_id, NEW.grupo_id, NEW.cotizacion_id, NEW.responsable_id, NEW.responsable_nombre, NEW.item_descripcion, NEW.x_pagar, NEW.total_a_transferir, NEW.monto_transferido, NEW.orden_pago_id, NEW.created_at))
EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_reaperturas;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_reaperturas
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_pagar_grupos;
DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_upd ON public.cuentas_pagar_grupos;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR DELETE ON public.cuentas_pagar_grupos
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_grupos();
CREATE TRIGGER trigger_cuentas_conceptos_upd AFTER UPDATE ON public.cuentas_pagar_grupos
FOR EACH ROW WHEN (ROW(OLD.id, OLD.proyecto_id, OLD.responsable_id, OLD.monto_total, OLD.total_a_transferir, OLD.monto_transferido, OLD.orden_pago_id, OLD.created_at) IS DISTINCT FROM ROW(NEW.id, NEW.proyecto_id, NEW.responsable_id, NEW.monto_total, NEW.total_a_transferir, NEW.monto_transferido, NEW.orden_pago_id, NEW.created_at))
EXECUTE FUNCTION public.cuentas_conceptos_trg_grupos();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.documentos_cuentas_cobrar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_cobrar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_docs_cobrar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.pagos_comprobantes;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.pagos_comprobantes
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.documentos_cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_docs_pagar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.pagos_cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.pagos_cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_pagos_pagar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.proyectos;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyectos();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cotizaciones;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_cotizaciones();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.proveedores;
CREATE TRIGGER trigger_cuentas_conceptos AFTER UPDATE OF nombre, regimen_fiscal ON public.proveedores
FOR EACH ROW WHEN (OLD.nombre IS DISTINCT FROM NEW.nombre OR OLD.regimen_fiscal IS DISTINCT FROM NEW.regimen_fiscal)
EXECUTE FUNCTION public.cuentas_conceptos_trg_proveedores();


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
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_reconciliar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_reconciliar() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_encolar(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_procesar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_reconstruir() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_reconstruir() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_cobrar(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_pagar(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_grupos(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proyecto_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_grupos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_docs_cobrar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_docs_pagar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_pagos_pagar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proyectos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_cotizaciones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proveedores() FROM PUBLIC, anon, authenticated;


-- Backfill: todos los proyectos con conceptos, más "Sin proyecto".
TRUNCATE public.cuentas_conceptos_base;
INSERT INTO public.cuentas_conceptos_base SELECT * FROM cuentas_conceptos_derivar(NULL, NULL, NULL);

COMMIT;
