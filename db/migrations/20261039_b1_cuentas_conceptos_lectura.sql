-- #110 B1: leer lo que se muestra. `cuentas_conceptos` conserva firma, RETURNS TABLE y configuración; solo cambian
-- las lecturas internas (resultado idéntico, verificado con scripts/db/cuentas-equivalencia.sql):
--   · cc / cp: `proyecto_id IN (py) UNION ALL proyecto_id IS NULL` en vez de `IS NULL OR IN (…)`; el OR con subconsulta
--     impedía el índice y barría cuentas_cobrar y cuentas_pagar completas aun con un año vacío (≈3,700 buffers).
--   · pcp: los pagos vigentes de los grupos se leen una vez (antes tres búsquedas por grupo, ≈60,000 buffers por 5,000 grupos).
--   · it: los renglones se leen una vez (antes dos barridos completos de items_cotizacion).
--   · proy: con p_objetivo NULL decide desde cc / cp (antes dos búsquedas por proyecto en las tablas completas).
-- Reversa: CREATE OR REPLACE con el cuerpo de 20261034_c1_alta_contraparte_y_gasto_extra.sql.

CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date, p_objetivo text, p_id text)
 RETURNS TABLE(proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text, fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean, margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean, concepto_creado timestamp with time zone, key text, tipo text, objetivo text, id text, proyecto_id text, cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer, total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text, fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric, venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean, complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric, utilidad_proyecto numeric, neto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
#variable_conflict use_column
BEGIN
  -- plpgsql + force_custom_plan, no LANGUAGE sql: una función SQL se planea sin los valores de sus parámetros y, con
  -- los filtros `p_objetivo IS NULL OR …`, el plan genérico hace una sonda de índice por grupo (309,077 buffers contra
  -- 3,918 con plan por llamada, medido en test con el mismo SQL). Mismo patrón que cuentas_periodo (decisión 019).
  RETURN QUERY
  WITH
  -- p_objetivo ('cobro' | 'grupo' | 'cuenta') y p_id (uuid en texto): un solo concepto; NULL = todos (B6).
  -- #123 (T18): 'cliente' | 'proveedor' = todos los conceptos de esa contraparte (estado de cuenta, P15).
  alvo AS (
    SELECT CASE p_objetivo
             WHEN 'cobro' THEN (SELECT c.proyecto_id FROM cuentas_cobrar c WHERE c.id = p_id::uuid)
             WHEN 'grupo' THEN (SELECT gr.proyecto_id FROM cuentas_pagar_grupos gr WHERE gr.id = p_id::uuid)
             WHEN 'cuenta' THEN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.id = p_id::uuid)
           END AS proyecto_id
  ),
  py AS (
    -- El cliente se lee por llave (D12): cotización del proyecto → clientes.
    SELECT p.id, p.proyecto AS nombre, COALESCE(cl.nombre, pct.cliente) AS cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           p.fecha_entrega::text AS fecha_entrega
    FROM proyectos p
    LEFT JOIN cotizaciones pct ON pct.id = p.id
    LEFT JOIN clientes cl ON cl.id = pct.cliente_id
    WHERE CASE
            -- Un solo concepto: solo el proyecto al que pertenece.
            WHEN p_objetivo IN ('cobro', 'grupo', 'cuenta') THEN p.id = (SELECT proyecto_id FROM alvo)
            -- Una contraparte: los proyectos donde tiene cuentas (todos los años con p_year NULL).
            WHEN p_objetivo = 'cliente' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_cobrar c JOIN cotizaciones ct ON ct.id = c.cotizacion_id WHERE ct.cliente_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            WHEN p_objetivo = 'proveedor' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.responsable_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            ELSE p_year IS NULL
                 OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1))
                 OR p.fecha_entrega IS NULL
          END
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, COALESCE(cl.nombre, cct.cliente) AS cliente, cct.cliente_id,
           c.monto_total, c.monto_pagado, c.fecha_vencimiento, c.fecha_factura, c.created_at, c.factura_documento_id
    FROM (SELECT * FROM cuentas_cobrar WHERE proyecto_id IN (SELECT id FROM py)
          UNION ALL
          SELECT * FROM cuentas_cobrar WHERE proyecto_id IS NULL) c
    LEFT JOIN cotizaciones cct ON cct.id = c.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = cct.cliente_id
    WHERE (p_objetivo IS NULL OR (p_objetivo = 'cobro' AND c.id = p_id::uuid) OR (p_objetivo = 'cliente' AND cct.cliente_id = p_id::uuid))
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.item_id, c.costo_total, c.created_at, c.concepto
    FROM (SELECT * FROM cuentas_pagar WHERE proyecto_id IN (SELECT id FROM py)
          UNION ALL
          SELECT * FROM cuentas_pagar WHERE proyecto_id IS NULL) c
    WHERE (p_objetivo IS NULL
           OR (p_objetivo = 'cuenta' AND c.id = p_id::uuid)
           OR (p_objetivo = 'grupo' AND c.grupo_id = p_id::uuid)
           OR (p_objetivo = 'proveedor' AND c.responsable_id = p_id::uuid))
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
  -- #130 (Q10): los gastos extra (cuentas sin renglón) restan de la utilidad real del proyecto; la cotización aprobada no cambia.
  ex AS (
    SELECT x.proyecto_id AS pid, ROUND(SUM(x.costo_total), 2) AS extra
    FROM cuentas_pagar x
    WHERE x.item_id IS NULL AND x.proyecto_id IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden,
           COALESCE(cot.utilidad, 0) - COALESCE(ex.extra, 0) AS utilidad
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    LEFT JOIN ex ON ex.pid = py.id
    WHERE CASE WHEN p_objetivo IS NULL
               THEN EXISTS (SELECT 1 FROM cc WHERE cc.proyecto_id = py.id) OR EXISTS (SELECT 1 FROM cp WHERE cp.proyecto_id = py.id)
               ELSE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
                 OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id) END
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807, 0
    WHERE EXISTS (SELECT 1 FROM cc WHERE proyecto_id IS NULL) OR EXISTS (SELECT 1 FROM cp WHERE proyecto_id IS NULL)
  ),

  -- Cobros ------------------------------------------------------------------
  cc_factura AS (
    -- P27: cada cuenta apunta a su factura vigente (columna); una factura puede cubrir varias cuentas.
    SELECT c.id AS cc_id, d.estado_validacion, d.metodo_pago_cfdi, d.fecha_carga
    FROM cc c
    JOIN documentos_cuentas_cobrar d ON d.id = c.factura_documento_id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  ),
  -- Un complemento por factura y por pago (P9). Los legados siguen anclados a su cuenta.
  cc_comp AS (
    SELECT DISTINCT ON (d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo)
           d.factura_documento_id, d.cuentas_cobrar_id AS cuenta_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND (d.factura_documento_id IN (SELECT factura_documento_id FROM cc WHERE factura_documento_id IS NOT NULL)
           OR d.cuentas_cobrar_id IN (SELECT id FROM cc))
    ORDER BY d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  cc_pago AS (
    SELECT pc.cuentas_cobrar_id AS cc_id, pc.pago_id AS pago_id, h.fecha_pago, h.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           -- V4: un pago anterior a la factura (o sin fecha de factura: se pide) es anticipo.
           (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) AS requiere,
           CASE
             WHEN NOT (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) THEN 'anticipo'
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_comprobantes pc
    JOIN pagos h ON h.id = pc.pago_id
    JOIN cc c ON c.id = pc.cuentas_cobrar_id
    LEFT JOIN cc_comp x ON x.pago_id = pc.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
                       AND (x.factura_documento_id = c.factura_documento_id OR x.cuenta_id = c.id)
    LEFT JOIN cc_comp f ON f.pago_id = pc.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
                       AND (f.factura_documento_id = c.factura_documento_id OR f.cuenta_id = c.id)
    WHERE h.anulado_at IS NULL
  ),
  cc_pagos AS (
    SELECT cc_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', requiere, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(requiere AND estado <> 'completo') AS pendiente,
           bool_or(requiere AND estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
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
    -- Sueltas: sin factura, pago ni orden propios (B5a: todo va por grupo).
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.costo_total,
           NULL::numeric, 0::numeric, NULL::uuid, c.created_at
    FROM cp c WHERE c.grupo_id IS NULL
  ),
  p_factura AS (
    SELECT DISTINCT ON (COALESCE(d.grupo_id, d.cuentas_pagar_id)) COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           d.estado_validacion, d.fecha_carga, d.metodo_pago_cfdi
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY COALESCE(d.grupo_id, d.cuentas_pagar_id), d.fecha_carga DESC
  ),
  -- Comprobantes (D11): documentos COMPROBANTE_PAGO y pagos con comprobante.
  -- Pagos vigentes de los grupos, leídos UNA vez (antes tres búsquedas por grupo: 60,000 buffers con 5,000 grupos).
  pcp AS MATERIALIZED (
    SELECT pp.grupo_id, pp.pago_id, h.fecha_pago, h.created_at, (h.comprobante_url IS NOT NULL) AS con_comprobante
    FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
    WHERE h.anulado_at IS NULL AND pp.grupo_id IN (SELECT id FROM g)
  ),
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id, d.fecha_carga AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
      UNION ALL
      SELECT grupo_id, created_at FROM pcp WHERE con_comprobante
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT grupo_id AS obj_id, max(fecha_pago) AS fecha_max FROM pcp GROUP BY 1
  ),
  -- Complementos de proveedor (P9, P11): uno por (grupo, pago); un proveedor PPD los exige.
  p_comp_doc AS (
    SELECT DISTINCT ON (d.grupo_id, d.pago_id, d.tipo) d.grupo_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.grupo_id IN (SELECT id FROM g) AND d.pago_id IS NOT NULL
      AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    ORDER BY d.grupo_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  p_comp_pago AS (
    SELECT pp.grupo_id AS obj_id, pp.pago_id, pp.fecha_pago, pp.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           CASE
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pcp pp
    LEFT JOIN p_comp_doc x ON x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN p_comp_doc f ON f.grupo_id = pp.grupo_id AND f.pago_id = pp.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
  ),
  p_comps AS (
    SELECT obj_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', true, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(estado <> 'completo') AS pendiente,
           bool_or(estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM p_comp_pago
    GROUP BY obj_id
  ),
  it AS MATERIALIZED (SELECT id, descripcion FROM items_cotizacion WHERE id IN (SELECT item_id FROM cp WHERE item_id IS NOT NULL)),
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(COALESCE(i.descripcion, c.concepto) ORDER BY c.created_at, c.id))[1] AS descripcion
    FROM cp c
    LEFT JOIN it i ON i.id = c.item_id
    WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, si.descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha, f.metodo_pago_cfdi AS metodo,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max,
           pcm.complementos AS comps, COALESCE(pcm.pendiente, false) AS comp_pendiente,
           COALESCE(pcm.en_revision, false) AS comp_revision, pcm.fecha_max AS comps_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN it si ON si.id = s.item_id::uuid
    LEFT JOIN g_items gi ON o.objetivo = 'grupo' AND gi.grupo_id = o.id
    LEFT JOIN p_factura f ON f.obj_id = o.id
    LEFT JOIN p_comp pc ON pc.obj_id = o.id
    LEFT JOIN p_fechas pf ON pf.obj_id = o.id
    LEFT JOIN p_comps pcm ON pcm.obj_id = o.id
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
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN 'sin_complemento'
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
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN CASE WHEN p.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM pago_e p
  )

  SELECT c.pkey, c.p_orden, c.p_nombre, c.p_cliente, c.p_fecha,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen, c.p_fee, c.p_iva, c.p_reabierta,
         c.created_at,
         'c:' || c.id, 'cobro', 'cobro', c.id::text, c.proyecto_id, c.cotizacion_id, c.folio::text,
         COALESCE(c.cliente, c.p_cliente, 'Cliente'), c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END,
         1, c.v_total, c.v_pagado, false, NULL, NULL, c.fecha_vencimiento::text,
         c.d_estado, c.d_paso, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo, c.dias, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest((c.f_fecha AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
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
         CASE WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.prov_nombre, 'Proveedor')
              ELSE 'Sin asignar' END,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END,
         p.v_total, p.v_pagado, p.total_a_transferir IS NULL, p.regimen, p.orden_pago_id::text, NULL,
         p.d_estado, p.d_paso, false, p.v_saldo, NULL, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest((p.f_fecha AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max, p.comps_fecha_max) END,
         false, CASE WHEN p.tiene_factura AND p.metodo = 'PPD' THEN COALESCE(p.comps, '[]'::jsonb) ELSE '[]'::jsonb END,
         p.c_iva, p.c_iva_ret, p.c_isr_ret,
         p.p_utilidad, p.c_subtotal
  FROM pago_d p;
END;
$function$;
