-- #130 (C1): alta de contraparte al subir una factura, gasto extra y pago por proyecto.
-- Decisiones Q1–Q13 en docs/PLAN.md (sección #130). Migración aditiva sobre #123 (corre después de 20261033).
--   · cuentas_pagar.item_id deja de ser obligatorio: una cuenta sin renglón es un **gasto extra** (concepto propio,
--     cuelga de la cotización principal aprobada del proyecto) y resta de la utilidad real del proyecto (Q10).
--   · clientes: columnas de constancia fiscal (Q11). datos_fiscales_serenata: tolerancia del match por total CFDI (Q7).
--   · preparar_grupo_factura_proveedor: alta de proveedor + asignación/reasignación de renglones o gasto extra, en
--     una sola transacción; devuelve el grupo al que se liga la factura (la factura sigue subiéndose como hoy).
--   · cuentas_proyectos_selector: lectura ligera y paginada de proyectos con renglones (Subir factura) o con
--     saldo de facturas (Registrar pago por proyecto). estado_cuenta acepta un filtro opcional por proyectos.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Gasto extra: una cuenta por pagar sin renglón
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.cuentas_pagar ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.cuentas_pagar ADD COLUMN IF NOT EXISTS concepto text;
ALTER TABLE public.cuentas_pagar ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_pagar_operation_id_key ON public.cuentas_pagar (operation_id) WHERE operation_id IS NOT NULL;
ALTER TABLE public.cuentas_pagar DROP CONSTRAINT IF EXISTS cuentas_pagar_renglon_o_gasto;
ALTER TABLE public.cuentas_pagar ADD CONSTRAINT cuentas_pagar_renglon_o_gasto CHECK (
  item_id IS NOT NULL
  OR (NULLIF(btrim(concepto), '') IS NOT NULL AND proyecto_id IS NOT NULL AND cotizacion_id = proyecto_id
      AND responsable_id IS NOT NULL AND costo_total > 0));
COMMENT ON COLUMN public.cuentas_pagar.concepto IS '#130: descripción de un gasto extra (cuenta sin renglón). Con renglón, la descripción vive en items_cotizacion.';
COMMENT ON COLUMN public.cuentas_pagar.operation_id IS '#130: idempotencia del alta de un gasto extra (doble clic o reintento).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Constancia del cliente y tolerancia del match por total CFDI
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS constancia_url text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS constancia_nombre text;

ALTER TABLE public.datos_fiscales_serenata ADD COLUMN IF NOT EXISTS tolerancia_total numeric(10,2) NOT NULL DEFAULT 1.00;
ALTER TABLE public.datos_fiscales_serenata DROP CONSTRAINT IF EXISTS datos_fiscales_serenata_tolerancia_check;
ALTER TABLE public.datos_fiscales_serenata ADD CONSTRAINT datos_fiscales_serenata_tolerancia_check CHECK (tolerancia_total >= 0 AND tolerancia_total <= 100);

-- Una constancia nueva hereda la tolerancia vigente (la tolerancia no es dato de la constancia).
CREATE OR REPLACE FUNCTION public.guardar_datos_fiscales_serenata(p_rfc text, p_razon_social text, p_regimen_fiscal text, p_codigo_postal text, p_constancia_url text, p_constancia_nombre text, p_usuario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rfc  text := upper(btrim(p_rfc));
  v_tipo text;
  v_id   uuid;
  v_tol  numeric;
BEGIN
  IF v_rfc IS NULL OR v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
    RAISE EXCEPTION 'rfc_invalido: el RFC no tiene la estructura de un RFC' USING ERRCODE = 'P1413';
  END IF;
  IF p_razon_social IS NULL OR btrim(p_razon_social) = '' THEN
    RAISE EXCEPTION 'razon_social_requerida: falta la razón social' USING ERRCODE = 'P1413';
  END IF;
  v_tipo := CASE char_length(v_rfc) WHEN 12 THEN 'moral' ELSE 'fisica' END;

  SELECT d.tolerancia_total INTO v_tol FROM public.datos_fiscales_serenata d WHERE d.vigente LIMIT 1;
  UPDATE public.datos_fiscales_serenata SET vigente = false WHERE vigente;
  INSERT INTO public.datos_fiscales_serenata (rfc, razon_social, regimen_fiscal, tipo_persona, codigo_postal, constancia_url, constancia_nombre, actualizado_por, tolerancia_total)
  VALUES (v_rfc, btrim(p_razon_social), NULLIF(btrim(p_regimen_fiscal), ''), v_tipo, NULLIF(btrim(p_codigo_postal), ''), p_constancia_url, p_constancia_nombre, p_usuario, COALESCE(v_tol, 1.00))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_tolerancia_total(p_valor numeric, p_usuario text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v numeric(10,2);
BEGIN
  IF p_valor IS NULL OR p_valor < 0 OR p_valor > 100 THEN
    RAISE EXCEPTION 'tolerancia_invalida: debe estar entre 0 y 100 pesos' USING ERRCODE = 'P1413';
  END IF;
  UPDATE public.datos_fiscales_serenata SET tolerancia_total = round(p_valor, 2), actualizado_por = p_usuario
  WHERE vigente RETURNING tolerancia_total INTO v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_constancia: sube primero la constancia de Serenata en Datos fiscales' USING ERRCODE = 'P1413';
  END IF;
  RETURN v;
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Funciones de lectura que entienden el gasto extra (versión vigente + el cambio mínimo)
-- ════════════════════════════════════════════════════════════════════════════

-- ── cuentas_conceptos: descripción del gasto extra y utilidad real (Q10) ──
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
    FROM cuentas_cobrar c
    LEFT JOIN cotizaciones cct ON cct.id = c.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = cct.cliente_id
    WHERE (p_objetivo IS NULL OR (p_objetivo = 'cobro' AND c.id = p_id::uuid) OR (p_objetivo = 'cliente' AND cct.cliente_id = p_id::uuid))
      AND (c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py))
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.item_id, c.costo_total, c.created_at, c.concepto
    FROM cuentas_pagar c
    WHERE (p_objetivo IS NULL
           OR (p_objetivo = 'cuenta' AND c.id = p_id::uuid)
           OR (p_objetivo = 'grupo' AND c.grupo_id = p_id::uuid)
           OR (p_objetivo = 'proveedor' AND c.responsable_id = p_id::uuid))
      AND (c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py))
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
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id)
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
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id, d.fecha_carga AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
      UNION ALL
      SELECT p.grupo_id, h.created_at
      FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
      WHERE h.anulado_at IS NULL AND h.comprobante_url IS NOT NULL AND p.grupo_id IN (SELECT id FROM g)
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT p.grupo_id AS obj_id, max(h.fecha_pago) AS fecha_max
    FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE h.anulado_at IS NULL AND p.grupo_id IN (SELECT id FROM g)
    GROUP BY 1
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
    SELECT pp.grupo_id AS obj_id, pp.pago_id, h.fecha_pago, h.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           CASE
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_cuentas_pagar pp
    JOIN pagos h ON h.id = pp.pago_id
    LEFT JOIN p_comp_doc x ON x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN p_comp_doc f ON f.grupo_id = pp.grupo_id AND f.pago_id = pp.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
    WHERE h.anulado_at IS NULL AND pp.grupo_id IN (SELECT id FROM g)
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
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(COALESCE(i.descripcion, c.concepto) ORDER BY c.created_at, c.id))[1] AS descripcion
    FROM cp c
    LEFT JOIN items_cotizacion i ON i.id = c.item_id
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
    LEFT JOIN items_cotizacion si ON si.id = s.item_id::uuid
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

-- ── auditar_consistencia: gasto extra válido ──
CREATE OR REPLACE FUNCTION public.auditar_consistencia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
g_cobro_pagado AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE abs(cc.monto_pagado - COALESCE((
    SELECT SUM(p.monto) FROM pagos_comprobantes p JOIN pagos h ON h.id = p.pago_id
    WHERE p.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_pagado AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(p.monto_neto) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_transferido AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(COALESCE(g.monto_transferido, 0) - COALESCE((
    SELECT SUM(p.monto_transferido) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_hijas_grupo AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(cp.monto_pagado) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_total AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_total - COALESCE((
    SELECT SUM(cp.costo_total) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_vacio AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
),
g_cp_costo_total AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE abs(cp.costo_total - round(i.costo_unitario * i.cantidad, 2)) > 0.01
),
g_orden_total AS (
  SELECT o.id::text AS id
  FROM ordenes_pago o
  WHERE abs(o.total_monto - COALESCE((
    SELECT SUM(c.neto_cubierto) FROM ordenes_pago_conceptos c
    WHERE c.orden_pago_id = o.id), 0)) > 0.01
),
g_item_importe AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.importe - round(i.cantidad * i.precio_unitario, 2)) > 0.01
),
g_item_margen AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.margen - (i.importe - round(i.costo_unitario * i.cantidad, 2))) > 0.01
),
g_cobro_total AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  JOIN cotizaciones c ON c.id = cc.cotizacion_id
  WHERE abs(cc.monto_total - c.total) > 0.01
),
g_k4_sin_cuenta AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  JOIN cotizaciones c ON c.id = i.cotizacion_id AND c.estado = 'APROBADA'
  WHERE i.costo_unitario > 0
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.item_id = i.id)
),
g_k4_cuenta_sin_item AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE (cp.item_id IS NULL AND NULLIF(btrim(cp.concepto), '') IS NULL)
     OR (cp.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = cp.item_id))
),
g_gasto_extra_proyecto AS (
  -- #130: un gasto extra cuelga de la cotización principal aprobada de su proyecto.
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cp.proyecto_id AND c.id = cp.cotizacion_id AND c.estado = 'APROBADA')
),
g_k4_item_cero AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE i.costo_unitario <= 0
),
g_cp_sin_grupo AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
),
g_folio_cc AS (
  SELECT cc.id::text AS id FROM cuentas_cobrar cc
  WHERE cc.folio IS NULL
     OR cc.folio IN (SELECT folio FROM cuentas_cobrar GROUP BY folio HAVING count(*) > 1)
),
g_folio_cp AS (
  SELECT cp.id::text AS id FROM cuentas_pagar cp
  WHERE cp.folio IS NULL
     OR cp.folio IN (SELECT folio FROM cuentas_pagar GROUP BY folio HAVING count(*) > 1)
),
g_factura_ligada AS (
  -- #123: una cuenta ligada apunta a una FACTURA_XML vigente.
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE cc.factura_documento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_cobrar d
                    WHERE d.id = cc.factura_documento_id AND d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL)
),
g_factura_cliente AS (
  -- Las cuentas de una factura son del mismo cliente (P2).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
  JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
  WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  GROUP BY d.id
  HAVING count(DISTINCT ct.cliente_id) > 1
),
g_factura_suma AS (
  -- Una factura "validada" suma lo que dice su XML (tolerancia de 0.01 por cotización, P26).
  SELECT x.id::text AS id
  FROM (
    SELECT d.id, d.total_cfdi, count(*) AS n, sum(cc.monto_total) AS suma
    FROM documentos_cuentas_cobrar d
    JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL AND d.estado_validacion = 'validado' AND d.total_cfdi IS NOT NULL
    GROUP BY d.id, d.total_cfdi
  ) x
  WHERE abs(round(x.total_cfdi - x.suma, 2)) > round(0.01 * x.n, 2)
),
g_pago_coherente AS (
  -- Un pago tiene líneas, todas de su lado y de una sola contraparte (T17).
  SELECT h.id::text AS id
  FROM pagos h
  WHERE (NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id)
         AND NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'cobro' AND EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'proveedor' AND EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id))
     OR (h.lado = 'cobro' AND (
           SELECT count(DISTINCT ct.cliente_id) FROM pagos_comprobantes pc
           JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
           JOIN cotizaciones ct ON ct.id = cc.cotizacion_id WHERE pc.pago_id = h.id) > 1)
     OR (h.lado = 'proveedor' AND (
           SELECT count(DISTINCT g.responsable_id) FROM pagos_cuentas_pagar pp
           JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id WHERE pp.pago_id = h.id) > 1)
),
g_complemento AS (
  -- Un complemento vigente referencia una factura vigente y un pago con línea en una cuenta de esa factura (P9).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL AND d.factura_documento_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM documentos_cuentas_cobrar f WHERE f.id = d.factura_documento_id AND f.eliminado_at IS NULL)
    AND (d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
                        WHERE pc.pago_id = d.pago_id AND cc.factura_documento_id = d.factura_documento_id))
  UNION ALL
  SELECT d.id::text
  FROM documentos_cuentas_pagar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    AND (d.grupo_id IS NULL OR d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = d.pago_id AND pp.grupo_id = d.grupo_id))
),
g_factura_fecha AS (
  -- Fecha de factura y factura vigente van juntas (las cachés solo las escriben las RPC).
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE (cc.factura_documento_id IS NOT NULL AND cc.fecha_factura IS NULL)
     OR (cc.factura_documento_id IS NULL AND cc.fecha_factura IS NOT NULL)
),
  resultado(clave, descripcion, violaciones, ejemplos) AS (
    VALUES
      ('cobro_pagado', 'cuentas por cobrar: monto_pagado = Σ pagos vigentes', (SELECT count(*) FROM g_cobro_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_pagado', 'grupos de pago: monto_pagado = Σ pagos vigentes (neto)', (SELECT count(*) FROM g_grupo_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_transferido', 'grupos de pago: monto_transferido = Σ pagos vigentes (transferido)', (SELECT count(*) FROM g_grupo_transferido), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_transferido ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_hijas', 'grupos de pago: monto_pagado = Σ monto_pagado de sus renglones', (SELECT count(*) FROM g_hijas_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_hijas_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_total', 'grupos de pago: monto_total = Σ costo_total de sus renglones', (SELECT count(*) FROM g_grupo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_vacio', 'grupos de pago sin renglones', (SELECT count(*) FROM g_grupo_vacio), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_vacio ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_costo_total', 'cuentas por pagar: costo_total = costo_unitario × cantidad del renglón', (SELECT count(*) FROM g_cp_costo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_costo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('orden_total', 'órdenes de pago: total_monto = Σ desglose', (SELECT count(*) FROM g_orden_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_orden_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_importe', 'renglones: importe = cantidad × precio', (SELECT count(*) FROM g_item_importe), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_importe ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_margen', 'renglones: margen = importe − costo total', (SELECT count(*) FROM g_item_margen), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_margen ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cobro_total', 'cuentas por cobrar: monto_total = total de la cotización', (SELECT count(*) FROM g_cobro_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_sin_cuenta', 'renglón aprobado con costo_unitario > 0 sin cuenta por pagar', (SELECT count(*) FROM g_k4_sin_cuenta), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_sin_cuenta ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_cuenta_sin_item', 'cuenta por pagar sin renglón ni concepto de gasto extra', (SELECT count(*) FROM g_k4_cuenta_sin_item), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_cuenta_sin_item ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('gasto_extra_proyecto', 'gasto extra: cuelga de la cotización principal aprobada de su proyecto', (SELECT count(*) FROM g_gasto_extra_proyecto), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_gasto_extra_proyecto ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_item_cero', 'cuenta por pagar de un renglón con costo_unitario <= 0', (SELECT count(*) FROM g_k4_item_cero), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_item_cero ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_sin_grupo', 'cuenta por pagar con proveedor y sin grupo', (SELECT count(*) FROM g_cp_sin_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_sin_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cc', 'folio de cuenta por cobrar nulo o duplicado', (SELECT count(*) FROM g_folio_cc), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cc ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cp', 'folio de cuenta por pagar nulo o duplicado', (SELECT count(*) FROM g_folio_cp), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cp ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_ligada', 'cuentas por cobrar: la factura ligada es una FACTURA_XML vigente', (SELECT count(*) FROM g_factura_ligada), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_ligada ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_cliente', 'facturas de cobro: todas sus cuentas son de un solo cliente', (SELECT count(*) FROM g_factura_cliente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_cliente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_suma', 'facturas de cobro validadas: Σ cotizaciones = total del XML (±0.01 por cotización)', (SELECT count(*) FROM g_factura_suma), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_suma ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('pago_coherente', 'pagos: con líneas, de su lado y de una sola contraparte', (SELECT count(*) FROM g_pago_coherente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_pago_coherente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('complemento_valido', 'complementos: factura vigente y pago con línea en ella', (SELECT count(*) FROM g_complemento), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_complemento ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_fecha', 'cuentas por cobrar: fecha de factura si y solo si hay factura ligada', (SELECT count(*) FROM g_factura_fecha), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_fecha ORDER BY id LIMIT 5) m), '{}'::text[]))
  )
  SELECT jsonb_build_object(
    'ejecutado_en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'total_violaciones', COALESCE(sum(violaciones), 0),
    'guardas', COALESCE(jsonb_agg(jsonb_build_object(
      'clave', clave, 'descripcion', descripcion, 'violaciones', violaciones, 'ejemplos', to_jsonb(ejemplos)
    ) ORDER BY clave), '[]'::jsonb)
  )
  FROM resultado;
$function$;

-- ── cuentas_orden_candidatos: descripción del gasto extra ──
CREATE OR REPLACE FUNCTION public.cuentas_orden_candidatos(p_limite_no_incluidas integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '8MB'
AS $function$
DECLARE
  v_hoy    text := to_char(hoy_cdmx(), 'YYYY-MM-DD');
  v_result jsonb;
BEGIN
  WITH
  obj AS (
    -- Grupos con saldo y sin orden.
    SELECT 'grupo'::text AS tipo, g.id, g.proyecto_id, g.responsable_id,
           round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) AS saldo,
           g.total_a_transferir, COALESCE(g.monto_transferido, 0) AS monto_transferido,
           g.estado
    FROM cuentas_pagar_grupos g
    WHERE g.orden_pago_id IS NULL
      AND g.estado <> 'PAGADO'
      AND round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) > 0
    UNION ALL
    -- Sueltas (sin grupo) con saldo: solo las que no tienen proveedor, que
    -- salen como "no incluidas" (K1: con proveedor, la cuenta va en un grupo).
    SELECT 'cuenta', cp.id, cp.proyecto_id, cp.responsable_id,
           round(cp.costo_total - COALESCE(cp.monto_pagado, 0), 2),
           NULL::numeric, 0::numeric,
           cp.estado
    FROM cuentas_pagar cp
    WHERE cp.grupo_id IS NULL
      AND cp.responsable_id IS NULL
      AND cp.estado <> 'PAGADO'
      AND round(cp.costo_total - COALESCE(cp.monto_pagado, 0), 2) > 0
  ),
  -- Renglones de cada objetivo (hijas del grupo o la propia suelta).
  ren AS (
    -- Dos joins por igualdad (no un OR, que obliga a un nested loop).
    SELECT 'grupo'::text AS tipo, cp.grupo_id AS obj_id, cp.id AS cuenta_id, COALESCE(i.descripcion, cp.concepto) AS item_descripcion, i.cantidad,
           cp.cotizacion_id, cp.created_at,
           round(cp.costo_total - COALESCE(cp.monto_pagado, 0), 2) AS saldo
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'grupo' AND o.id = cp.grupo_id
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
    UNION ALL
    SELECT 'cuenta', cp.id, cp.id, COALESCE(i.descripcion, cp.concepto), i.cantidad,
           cp.cotizacion_id, cp.created_at,
           round(cp.costo_total - COALESCE(cp.monto_pagado, 0), 2)
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'cuenta' AND o.id = cp.id
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
  ),
  evento AS (
    SELECT r.tipo, r.obj_id,
           bool_or(c.fecha_entrega IS NULL OR c.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$') AS sin_fecha,
           max(c.fecha_entrega) FILTER (WHERE c.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$') AS fecha_max,
           array_agg(DISTINCT r.cotizacion_id ORDER BY r.cotizacion_id) AS folios
    FROM ren r
    LEFT JOIN cotizaciones c ON c.id = r.cotizacion_id
    GROUP BY r.tipo, r.obj_id
  ),
  factura AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           bool_or(d.estado_validacion = 'validado') AS validada
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
      AND (d.grupo_id IN (SELECT id FROM obj WHERE tipo = 'grupo') OR d.cuentas_pagar_id IN (SELECT id FROM obj WHERE tipo = 'cuenta'))
    GROUP BY 1
  ),
  cal AS (
    SELECT o.*, e.sin_fecha, e.fecha_max, e.folios,
           p.proyecto AS proyecto_nombre,
           pr.nombre AS pr_nombre, pr.regimen_fiscal, pr.banco AS pr_banco, pr.clabe AS pr_clabe,
           pr.correo AS pr_correo, pr.telefono AS pr_telefono,
           CASE
             WHEN o.responsable_id IS NULL THEN 'sin_proveedor'
             WHEN f.obj_id IS NULL THEN 'sin_factura'
             WHEN NOT f.validada THEN 'factura_revision'
             -- Un grupo solo se ordena FACTURADO o con pago parcial directo.
             WHEN o.tipo = 'grupo' AND o.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN 'sin_factura'
             WHEN e.sin_fecha OR e.fecha_max > v_hoy THEN 'evento_pendiente'
           END AS motivo
    FROM obj o
    LEFT JOIN evento e ON e.tipo = o.tipo AND e.obj_id = o.id
    LEFT JOIN factura f ON f.obj_id = o.id
    LEFT JOIN proyectos p ON p.id = o.proyecto_id
    LEFT JOIN proveedores pr ON pr.id = o.responsable_id
  ),
  items AS (
    -- Renglones con saldo, agregados una sola vez y solo para las elegibles.
    SELECT r.tipo, r.obj_id,
           jsonb_agg(jsonb_build_object(
             'cuenta_id', r.cuenta_id, 'descripcion', r.item_descripcion, 'cantidad', r.cantidad,
             'cotizacion_id', r.cotizacion_id, 'saldo', r.saldo
           ) ORDER BY r.created_at, r.cuenta_id) AS items
    FROM ren r
    JOIN cal c ON c.tipo = r.tipo AND c.id = r.obj_id AND c.motivo IS NULL
    WHERE r.saldo > 0
    GROUP BY r.tipo, r.obj_id
  )
  SELECT jsonb_build_object(
    'hoy', v_hoy,
    'elegibles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
        'folios', to_jsonb(c.folios), 'fecha_evento', c.fecha_max,
        'responsable', jsonb_build_object(
          'id', c.responsable_id,
          'nombre', COALESCE(c.pr_nombre, 'Sin nombre'),
          'regimen_fiscal', c.regimen_fiscal,
          'banco', c.pr_banco, 'clabe', c.pr_clabe,
          'correo', c.pr_correo, 'telefono', c.pr_telefono
        ),
        'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
        'items', it.items
      ) ORDER BY c.pr_nombre, c.fecha_max, c.proyecto_id, c.id)
      FROM cal c
      LEFT JOIN items it ON it.tipo = c.tipo AND it.obj_id = c.id
      WHERE c.motivo IS NULL
    ), '[]'::jsonb),
    'no_incluidas', COALESCE((
      SELECT jsonb_agg(x.fila ORDER BY x.orden)
      FROM (
        SELECT jsonb_build_object(
                 'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
                 'responsable_nombre', COALESCE(c.pr_nombre, 'Sin asignar'),
                 'regimen_fiscal', c.regimen_fiscal,
                 'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
                 'motivo', c.motivo, 'fecha_evento', c.fecha_max
               ) AS fila,
               row_number() OVER (
                 -- Primero lo que ya se podría pagar si se resuelve el motivo:
                 -- eventos realizados, del más reciente al más viejo.
                 ORDER BY (c.sin_fecha OR c.fecha_max > v_hoy), c.fecha_max DESC NULLS LAST, c.proyecto_id, c.id
               ) AS orden
        FROM cal c
        WHERE c.motivo IS NOT NULL
      ) x
      WHERE x.orden <= GREATEST(COALESCE(p_limite_no_incluidas, 100), 0)
    ), '[]'::jsonb),
    'no_incluidas_total', (SELECT count(*) FROM cal WHERE motivo IS NOT NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── estado_cuenta: filtro por proyectos (pago por proyecto). Sobrecarga con p_proyectos (obligatorio, así una llamada
-- con los parámetros de antes no es ambigua); la firma de siempre queda como envoltura. Sin DROP. ──
CREATE OR REPLACE FUNCTION public.estado_cuenta(p_lado text, p_contraparte uuid, p_proyectos text[], p_hoy date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
  hoy AS (SELECT COALESCE(p_hoy, hoy_cdmx()) AS d),
  -- Un concepto por cuenta de cobro (cliente) o por grupo (proveedor), ya con su estado y saldo.
  cf AS MATERIALIZED (
    SELECT c.*,
           CASE p_lado WHEN 'cobro' THEN cc.factura_documento_id
                       ELSE (SELECT d.id FROM documentos_cuentas_pagar d
                             WHERE d.grupo_id = c.id::uuid AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                             ORDER BY d.fecha_carga DESC LIMIT 1) END AS factura_id,
           cc.fecha_factura::text AS fecha_factura
    FROM cuentas_conceptos(NULL, (SELECT d FROM hoy), CASE p_lado WHEN 'cobro' THEN 'cliente' ELSE 'proveedor' END, p_contraparte::text) c
    LEFT JOIN cuentas_cobrar cc ON p_lado = 'cobro' AND cc.id = c.id::uuid
    WHERE c.tipo = CASE p_lado WHEN 'cobro' THEN 'cobro' ELSE 'pago' END
      AND (p_proyectos IS NULL OR c.proyecto_id = ANY(p_proyectos))
  ),
  cj AS MATERIALIZED (
    SELECT cf.factura_id, cf.fecha_factura, cf.fecha_vencimiento, cf.total, cf.pagado, cf.saldo, cf.cotizacion_id, cf.proyecto_key, cf.key,
           jsonb_build_object(
             'key', cf.key, 'objetivo', cf.objetivo, 'id', cf.id, 'proyecto_id', cf.proyecto_id, 'proyecto_nombre', cf.proyecto_nombre,
             'cotizacion_id', cf.cotizacion_id, 'folio', cf.folio, 'concepto', cf.concepto, 'total', cf.total, 'pagado', cf.pagado,
             'saldo', cf.saldo, 'estado', cf.estado, 'paso', cf.paso, 'venc_dias', cf.venc_dias,
             'fecha_vencimiento', cf.fecha_vencimiento, 'resuelto', cf.resuelto) AS j
    FROM cf
  ),
  -- Datos del documento de factura (cobro: documentos_cuentas_cobrar; proveedor: documentos_cuentas_pagar).
  doc AS (
    SELECT d.id, d.uuid_cfdi, d.total_cfdi, d.metodo_pago_cfdi, d.estado_validacion, d.detalle_validacion, d.archivo_url, d.archivo_nombre, d.fecha_carga
    FROM documentos_cuentas_cobrar d WHERE p_lado = 'cobro' AND d.id IN (SELECT factura_id FROM cj WHERE factura_id IS NOT NULL)
    UNION ALL
    SELECT d.id, d.uuid_cfdi, d.total_cfdi, d.metodo_pago_cfdi, d.estado_validacion, d.detalle_validacion, d.archivo_url, d.archivo_nombre, d.fecha_carga
    FROM documentos_cuentas_pagar d WHERE p_lado = 'proveedor' AND d.id IN (SELECT factura_id FROM cj WHERE factura_id IS NOT NULL)
  ),
  facturas AS (
    SELECT x.factura_id, x.fecha, x.n,
           jsonb_build_object(
             'id', x.factura_id, 'uuid_cfdi', d.uuid_cfdi, 'total_cfdi', d.total_cfdi, 'metodo_pago', d.metodo_pago_cfdi,
             'estado_validacion', d.estado_validacion, 'detalle_validacion', d.detalle_validacion, 'archivo_url', d.archivo_url,
             'archivo_nombre', d.archivo_nombre, 'fecha_carga', d.fecha_carga, 'fecha_factura', x.fecha,
             'fecha_vencimiento', x.vence, 'total', x.total, 'pagado', x.pagado, 'saldo', x.saldo, 'conceptos', x.conceptos) AS j
    FROM (
      SELECT cj.factura_id, min(cj.fecha_factura) AS fecha, min(cj.fecha_vencimiento) AS vence, count(*) AS n,
             sum(cj.total) AS total, sum(cj.pagado) AS pagado, sum(cj.saldo) AS saldo,
             jsonb_agg(cj.j ORDER BY cj.cotizacion_id NULLS LAST, cj.key) AS conceptos
      FROM cj WHERE cj.factura_id IS NOT NULL GROUP BY cj.factura_id
    ) x
    JOIN doc d ON d.id = x.factura_id
  ),
  sin_factura AS (
    SELECT COALESCE(jsonb_agg(cj.j ORDER BY cj.cotizacion_id NULLS LAST, cj.key), '[]'::jsonb) AS j,
           COALESCE(sum(cj.total), 0) AS total, COALESCE(sum(cj.pagado), 0) AS pagado, COALESCE(sum(cj.saldo), 0) AS saldo
    FROM cj WHERE cj.factura_id IS NULL
  ),
  -- Pagos aplicados a estas cuentas o grupos (los anulados salen marcados, para el historial).
  lineas AS (
    SELECT pc.pago_id, pc.cuentas_cobrar_id::text AS destino_id, pc.monto, cc.factura_documento_id AS factura_id, cc.folio, cc.cotizacion_id
    FROM pagos_comprobantes pc JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
    WHERE p_lado = 'cobro' AND pc.cuentas_cobrar_id::text IN (SELECT id FROM cf)
    UNION ALL
    SELECT pp.pago_id, pp.grupo_id::text, pp.monto_transferido, f.id, NULL, NULL
    FROM pagos_cuentas_pagar pp
    LEFT JOIN LATERAL (SELECT d.id FROM documentos_cuentas_pagar d
                       WHERE d.grupo_id = pp.grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                       ORDER BY d.fecha_carga DESC LIMIT 1) f ON true
    WHERE p_lado = 'proveedor' AND pp.grupo_id::text IN (SELECT id FROM cf)
  ),
  complementos AS (
    SELECT d.pago_id, jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'estado', d.estado_validacion, 'factura_id', d.factura_id,
                                                  'archivo_url', d.archivo_url, 'monto_pagado', d.monto_pagado) ORDER BY d.fecha_carga) AS j
    FROM (
      SELECT id, tipo, estado_validacion, factura_documento_id AS factura_id, archivo_url, monto_pagado, pago_id, fecha_carga
      FROM documentos_cuentas_cobrar WHERE p_lado = 'cobro' AND tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
      UNION ALL
      SELECT id, tipo, estado_validacion, NULL::uuid, archivo_url, monto_pagado, pago_id, fecha_carga
      FROM documentos_cuentas_pagar WHERE p_lado = 'proveedor' AND tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
    ) d
    WHERE d.pago_id IN (SELECT pago_id FROM lineas)
    GROUP BY d.pago_id
  ),
  pagos_j AS (
    SELECT h.id, h.fecha_pago, h.created_at, sum(l.monto) AS monto,
           jsonb_build_object(
             'id', h.id, 'fecha_pago', h.fecha_pago, 'tipo_pago', h.tipo_pago, 'comprobante_url', h.comprobante_url,
             'archivo_nombre', h.archivo_nombre, 'notas', h.notas, 'anulado', h.anulado_at IS NOT NULL, 'anulado_motivo', h.anulado_motivo,
             'monto', sum(l.monto),
             'aplicaciones', jsonb_agg(jsonb_build_object('destino_id', l.destino_id, 'factura_id', l.factura_id, 'folio', l.folio,
                                                           'cotizacion_id', l.cotizacion_id, 'monto', l.monto) ORDER BY l.destino_id),
             'complementos', COALESCE(co.j, '[]'::jsonb)) AS j
    FROM lineas l
    JOIN pagos h ON h.id = l.pago_id
    LEFT JOIN complementos co ON co.pago_id = h.id
    GROUP BY h.id, co.j
  ),
  contraparte AS (
    SELECT jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rfc', c.rfc) AS j
    FROM clientes c WHERE p_lado = 'cobro' AND c.id = p_contraparte
    UNION ALL
    SELECT jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rfc', p.rfc)
    FROM proveedores p WHERE p_lado = 'proveedor' AND p.id = p_contraparte
  )
  SELECT jsonb_build_object(
    'lado', p_lado,
    'hoy', to_char((SELECT d FROM hoy), 'YYYY-MM-DD'),
    'contraparte', (SELECT j FROM contraparte),
    'resumen', jsonb_build_object(
      'total', (SELECT COALESCE(sum(total), 0) FROM cj),
      'pagado', (SELECT COALESCE(sum(pagado), 0) FROM cj),
      'saldo', (SELECT COALESCE(sum(saldo), 0) FROM cj),
      'vencido', (SELECT COALESCE(sum(c.saldo), 0) FROM cf c WHERE c.estado = 'vencido'),
      'facturas', (SELECT count(*) FROM facturas),
      'sin_factura', (SELECT count(*) FROM cj WHERE factura_id IS NULL),
      'sin_factura_saldo', (SELECT saldo FROM sin_factura)),
    'facturas', COALESCE((SELECT jsonb_agg(f.j ORDER BY f.fecha NULLS LAST, f.factura_id) FROM facturas f), '[]'::jsonb),
    'sin_factura', (SELECT j FROM sin_factura),
    'pagos', COALESCE((SELECT jsonb_agg(p.j ORDER BY p.fecha_pago DESC, p.created_at DESC, p.id) FROM pagos_j p), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.estado_cuenta(p_lado text, p_contraparte uuid, p_hoy date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.estado_cuenta(p_lado, p_contraparte, NULL::text[], p_hoy);
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Selector de proyectos (Subir factura y Registrar pago por proyecto)
-- ════════════════════════════════════════════════════════════════════════════
-- modo 'renglones': proyectos con cuentas por pagar aún sin factura (o todos) y sus renglones, para elegir a qué se
-- liga una factura de proveedor. modo 'pago': proyectos con facturas con saldo del lado elegido, y por proyecto las
-- contrapartes con su saldo (el saldo exacto lo da estado_cuenta con p_proyectos). Paginado, sin derivar saldos.
CREATE OR REPLACE FUNCTION public.cuentas_proyectos_selector(
  p_modo text, p_lado text DEFAULT NULL, p_q text DEFAULT NULL, p_contraparte uuid DEFAULT NULL,
  p_solo_pendientes boolean DEFAULT true, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_q     text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_pat   text;
  v_size  integer := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 50);
  v_page  integer := GREATEST(COALESCE(p_page, 1), 1);
  v_off   integer;
  v_total bigint;
  v_rows  jsonb;
BEGIN
  IF p_modo IS NULL OR p_modo NOT IN ('renglones', 'pago') THEN
    RAISE EXCEPTION 'modo_invalido: usa renglones o pago' USING ERRCODE = 'P1415';
  END IF;
  IF p_modo = 'pago' AND (p_lado IS NULL OR p_lado NOT IN ('cobro', 'proveedor')) THEN
    RAISE EXCEPTION 'lado_invalido: usa cobro o proveedor' USING ERRCODE = 'P1415';
  END IF;
  v_off := (v_page - 1) * v_size;
  v_pat := CASE WHEN v_q IS NULL THEN NULL
                ELSE '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  IF p_modo = 'renglones' THEN
    WITH base AS (
      SELECT p.id, p.proyecto, COALESCE(cl.nombre, ct.cliente) AS cliente, p.fecha_entrega, p.created_at,
             EXISTS (SELECT 1 FROM cuentas_pagar x WHERE x.proyecto_id = p.id AND x.responsable_id = p_contraparte) AS de_contraparte
      FROM proyectos p
      LEFT JOIN cotizaciones ct ON ct.id = p.id
      LEFT JOIN clientes cl ON cl.id = ct.cliente_id
      WHERE (v_pat IS NULL OR p.id ILIKE v_pat OR p.proyecto ILIKE v_pat OR cl.nombre ILIKE v_pat OR ct.cliente ILIKE v_pat)
        AND EXISTS (SELECT 1 FROM cuentas_pagar x
                    LEFT JOIN cuentas_pagar_grupos g ON g.id = x.grupo_id
                    WHERE x.proyecto_id = p.id AND (NOT COALESCE(p_solo_pendientes, true) OR g.id IS NULL OR g.estado = 'ABIERTO'))
    ),
    pag AS (
      SELECT b.*, count(*) OVER () AS n FROM base b
      ORDER BY b.de_contraparte DESC, b.created_at DESC, b.id DESC OFFSET v_off LIMIT v_size
    )
    SELECT COALESCE(max(s.n), 0),
           COALESCE(jsonb_agg(jsonb_build_object(
             'proyecto_id', s.id, 'proyecto', s.proyecto, 'cliente', s.cliente, 'fecha_entrega', s.fecha_entrega,
             'de_contraparte', s.de_contraparte, 'renglones', r.renglones
           ) ORDER BY s.de_contraparte DESC, s.created_at DESC, s.id DESC), '[]'::jsonb)
      INTO v_total, v_rows
    FROM pag s
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'cuenta_id', x.id, 'descripcion', COALESCE(i.descripcion, x.concepto, 'Concepto'),
               'costo_total', x.costo_total, 'gasto_extra', x.item_id IS NULL,
               'responsable_id', x.responsable_id, 'responsable', pr.nombre,
               'grupo_id', x.grupo_id, 'grupo_estado', g.estado,
               'bloqueado', (g.id IS NOT NULL AND g.estado <> 'ABIERTO') OR COALESCE(x.monto_pagado, 0) > 0 OR g.orden_pago_id IS NOT NULL
             ) ORDER BY pr.nombre NULLS FIRST, x.created_at, x.id), '[]'::jsonb) AS renglones
      FROM cuentas_pagar x
      LEFT JOIN items_cotizacion i ON i.id = x.item_id
      LEFT JOIN proveedores pr ON pr.id = x.responsable_id
      LEFT JOIN cuentas_pagar_grupos g ON g.id = x.grupo_id
      WHERE x.proyecto_id = s.id
    ) r;
  ELSE
    WITH base AS (
      SELECT p.id, p.proyecto, COALESCE(cl.nombre, ct.cliente) AS cliente, p.fecha_entrega, p.created_at
      FROM proyectos p
      LEFT JOIN cotizaciones ct ON ct.id = p.id
      LEFT JOIN clientes cl ON cl.id = ct.cliente_id
      WHERE (v_pat IS NULL OR p.id ILIKE v_pat OR p.proyecto ILIKE v_pat OR cl.nombre ILIKE v_pat OR ct.cliente ILIKE v_pat)
    ),
    sal AS (
      -- Una fila por (proyecto, contraparte) con saldo de facturas abiertas (Q4: solo contra facturas).
      SELECT cc.proyecto_id AS pid, ct.cliente_id AS cid, COALESCE(cl.nombre, ct.cliente) AS nombre,
             count(DISTINCT cc.factura_documento_id) AS facturas,
             round(sum(cc.monto_total - COALESCE(cc.monto_pagado, 0)), 2) AS saldo
      FROM cuentas_cobrar cc
      JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
      LEFT JOIN clientes cl ON cl.id = ct.cliente_id
      WHERE p_lado = 'cobro' AND cc.factura_documento_id IS NOT NULL
        AND cc.monto_total - COALESCE(cc.monto_pagado, 0) > 0.005
        AND (p_contraparte IS NULL OR ct.cliente_id = p_contraparte)
        AND cc.proyecto_id IN (SELECT id FROM base)
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT g.proyecto_id, g.responsable_id, pv.nombre, count(*),
             round(sum(g.total_a_transferir - COALESCE(g.monto_transferido, 0)), 2)
      FROM cuentas_pagar_grupos g
      JOIN proveedores pv ON pv.id = g.responsable_id
      WHERE p_lado = 'proveedor' AND g.total_a_transferir IS NOT NULL
        AND g.total_a_transferir - COALESCE(g.monto_transferido, 0) > 0.005
        AND (p_contraparte IS NULL OR g.responsable_id = p_contraparte)
        AND g.proyecto_id IN (SELECT id FROM base)
      GROUP BY 1, 2, 3
    ),
    pag AS (
      SELECT b.*, count(*) OVER () AS n FROM base b
      WHERE EXISTS (SELECT 1 FROM sal WHERE sal.pid = b.id)
      ORDER BY b.created_at DESC, b.id DESC OFFSET v_off LIMIT v_size
    )
    SELECT COALESCE(max(s.n), 0),
           COALESCE(jsonb_agg(jsonb_build_object(
             'proyecto_id', s.id, 'proyecto', s.proyecto, 'cliente', s.cliente, 'fecha_entrega', s.fecha_entrega,
             'contrapartes', (SELECT jsonb_agg(jsonb_build_object('id', sal.cid, 'nombre', sal.nombre, 'facturas', sal.facturas, 'saldo', sal.saldo)
                                              ORDER BY sal.nombre, sal.cid)
                              FROM sal WHERE sal.pid = s.id)
           ) ORDER BY s.created_at DESC, s.id DESC), '[]'::jsonb)
      INTO v_total, v_rows
    FROM pag s;
  END IF;

  RETURN jsonb_build_object('modo', p_modo, 'total', v_total, 'page', v_page, 'page_size', v_size, 'proyectos', v_rows);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Preparar el grupo de una factura de proveedor (alta + renglones o gasto extra), atómico
-- ════════════════════════════════════════════════════════════════════════════
-- Una de dos: p_renglones (cuentas por pagar de UN proyecto que pasan al proveedor; solo grupos ABIERTOS y sin pagos
-- ni orden, D21) o p_gasto {proyecto_id, concepto, costo_total} (gasto extra neto al proveedor). El proveedor es
-- p_proveedor_id o, si no existe, p_proveedor {nombre, rfc, regimen_fiscal, telefono, correo, banco, clabe}. Devuelve
-- el grupo ABIERTO del proveedor en el proyecto; la factura se sube después con ese grupo (flujo actual). Orden de
-- locks (T16): cotización → grupos → cuentas. Reintentos: un gasto extra repetido (mismo operation_id) no se duplica.
CREATE OR REPLACE FUNCTION public.preparar_grupo_factura_proveedor(
  p_proveedor_id uuid, p_proveedor jsonb, p_renglones uuid[], p_gasto jsonb, p_usuario text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prov      proveedores;
  v_creado    boolean := false;
  v_rfc       text;
  v_regimen   text;
  v_campo     text;
  v_existente uuid;
  v_n         integer;
  v_proyectos text[];
  v_proyecto  text;
  v_r         record;
  v_extra     cuentas_pagar;
  v_grupo     uuid;
  v_mov       integer := 0;
  v_concepto  text;
  v_costo     numeric;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operacion_requerida: falta el identificador de la operación' USING ERRCODE = 'P1415';
  END IF;
  v_n := COALESCE(array_length(p_renglones, 1), 0);
  IF (v_n > 0) = (p_gasto IS NOT NULL) THEN
    RAISE EXCEPTION 'destino_requerido: elige renglones o registra un gasto extra, no ambos ni ninguno' USING ERRCODE = 'P1415';
  END IF;
  IF p_proveedor_id IS NULL AND p_proveedor IS NULL THEN
    RAISE EXCEPTION 'proveedor_requerido: elige un proveedor o captura sus datos' USING ERRCODE = 'P1415';
  END IF;

  -- Repetición del mismo envío (doble clic, reintento tras un corte): el gasto extra ya existe.
  IF p_gasto IS NOT NULL THEN
    SELECT * INTO v_extra FROM cuentas_pagar WHERE operation_id = p_operation_id;
    IF FOUND THEN
      RETURN jsonb_build_object('proveedor_id', v_extra.responsable_id, 'proveedor_creado', false, 'proyecto_id', v_extra.proyecto_id,
                                'grupo_id', v_extra.grupo_id, 'cuenta_extra_id', v_extra.id, 'reasignados', 0, 'repetido', true);
    END IF;
  END IF;

  -- Proveedor: el elegido o uno nuevo con los datos mínimos (Q3).
  IF p_proveedor_id IS NOT NULL THEN
    SELECT * INTO v_prov FROM proveedores WHERE id = p_proveedor_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proveedor_no_encontrado: %', p_proveedor_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_rfc := upper(btrim(COALESCE(p_proveedor->>'rfc', '')));
    IF v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
      RAISE EXCEPTION 'rfc_invalido: el RFC no tiene la estructura de un RFC' USING ERRCODE = 'P1415';
    END IF;
    v_regimen := lower(btrim(COALESCE(p_proveedor->>'regimen_fiscal', '')));
    IF v_regimen NOT IN ('moral', 'fisica', 'resico') THEN
      RAISE EXCEPTION 'regimen_invalido: el régimen debe ser moral, fisica o resico' USING ERRCODE = 'P1415';
    END IF;
    FOREACH v_campo IN ARRAY ARRAY['nombre', 'telefono', 'correo', 'banco'] LOOP
      IF NULLIF(btrim(COALESCE(p_proveedor->>v_campo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'proveedor_incompleto: falta %', v_campo USING ERRCODE = 'P1415';
      END IF;
    END LOOP;
    IF btrim(p_proveedor->>'correo') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'correo_invalido: el correo no tiene la forma de un correo' USING ERRCODE = 'P1415';
    END IF;
    IF regexp_replace(COALESCE(p_proveedor->>'clabe', ''), '[[:space:]]', '', 'g') !~ '^[0-9]{18}$' THEN
      RAISE EXCEPTION 'clabe_invalida: la CLABE debe tener 18 dígitos' USING ERRCODE = 'P1415';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('proveedor_rfc:' || v_rfc, 0));
    SELECT id INTO v_existente FROM proveedores WHERE rfc = v_rfc LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'proveedor_existente: %', v_existente USING ERRCODE = 'P1413';
    END IF;
    INSERT INTO proveedores (nombre, telefono, correo, banco, clabe, rfc, regimen_fiscal, roles, activo)
    VALUES (btrim(p_proveedor->>'nombre'), btrim(p_proveedor->>'telefono'), btrim(p_proveedor->>'correo'), btrim(p_proveedor->>'banco'),
            regexp_replace(p_proveedor->>'clabe', '[[:space:]]', '', 'g'), v_rfc, v_regimen, '{}', true)
    RETURNING * INTO v_prov;
    v_creado := true;
  END IF;

  IF v_n > 0 THEN
    -- Renglones de un solo proyecto.
    SELECT array_agg(DISTINCT x.proyecto_id) INTO v_proyectos FROM cuentas_pagar x WHERE x.id = ANY(p_renglones);
    IF v_proyectos IS NULL THEN
      RAISE EXCEPTION 'renglon_no_encontrado: los renglones elegidos ya no existen' USING ERRCODE = 'P0002';
    END IF;
    IF array_length(v_proyectos, 1) <> 1 THEN
      RAISE EXCEPTION 'proyectos_distintos: una factura de proveedor es de un solo proyecto' USING ERRCODE = 'P1415';
    END IF;
    v_proyecto := v_proyectos[1];

    PERFORM 1 FROM cuentas_pagar_grupos g
    WHERE g.id IN (SELECT x.grupo_id FROM cuentas_pagar x WHERE x.id = ANY(p_renglones) AND x.grupo_id IS NOT NULL)
       OR (g.proyecto_id = v_proyecto AND g.responsable_id = v_prov.id AND g.estado = 'ABIERTO')
    ORDER BY g.id FOR UPDATE;
    PERFORM 1 FROM cuentas_pagar x WHERE x.id = ANY(p_renglones) ORDER BY x.id FOR UPDATE;
    IF (SELECT count(*) FROM cuentas_pagar WHERE id = ANY(p_renglones)) <> (SELECT count(DISTINCT u) FROM unnest(p_renglones) u) THEN
      RAISE EXCEPTION 'renglon_no_encontrado: alguno de los renglones elegidos ya no existe' USING ERRCODE = 'P0002';
    END IF;

    FOR v_r IN
      SELECT x.id, x.monto_pagado, g.estado, g.orden_pago_id
      FROM cuentas_pagar x LEFT JOIN cuentas_pagar_grupos g ON g.id = x.grupo_id
      WHERE x.id = ANY(p_renglones) ORDER BY x.id
    LOOP
      IF v_r.estado IS NOT NULL AND v_r.estado <> 'ABIERTO' THEN
        RAISE EXCEPTION 'grupo_no_abierto: el renglón % ya está en un grupo facturado o en pago', v_r.id USING ERRCODE = 'P1412';
      END IF;
      IF COALESCE(v_r.monto_pagado, 0) > 0 OR v_r.orden_pago_id IS NOT NULL THEN
        RAISE EXCEPTION 'renglon_bloqueado: el renglón % tiene pagos o está en una orden de pago', v_r.id USING ERRCODE = 'P1413';
      END IF;
    END LOOP;

    FOR v_r IN
      SELECT x.id, x.item_id, x.responsable_id, pa.nombre AS anterior
      FROM cuentas_pagar x LEFT JOIN proveedores pa ON pa.id = x.responsable_id
      WHERE x.id = ANY(p_renglones) AND x.responsable_id IS DISTINCT FROM v_prov.id ORDER BY x.id
    LOOP
      PERFORM reasignar_responsable_cuenta_pagar(v_r.id, v_prov.id);
      IF v_r.item_id IS NOT NULL THEN
        INSERT INTO historial_cambios_responsable_item (item_id, cotizacion_id, responsable_anterior_id, responsable_anterior_nombre,
                                                        responsable_nuevo_id, responsable_nuevo_nombre, changed_by)
        SELECT i.id, i.cotizacion_id, v_r.responsable_id, v_r.anterior, v_prov.id, v_prov.nombre, p_usuario
        FROM items_cotizacion i WHERE i.id = v_r.item_id;
      END IF;
      v_mov := v_mov + 1;
    END LOOP;
    SELECT x.grupo_id INTO v_grupo FROM cuentas_pagar x WHERE x.id = p_renglones[1];
  ELSE
    -- Gasto extra: cuenta sin renglón en la cotización principal aprobada del proyecto (Q5, Q10).
    v_proyecto := btrim(COALESCE(p_gasto->>'proyecto_id', ''));
    v_concepto := btrim(COALESCE(p_gasto->>'concepto', ''));
    IF COALESCE(p_gasto->>'costo_total', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'gasto_invalido: el costo debe ser un monto mayor a cero' USING ERRCODE = 'P1415';
    END IF;
    v_costo := round((p_gasto->>'costo_total')::numeric, 2);
    IF v_proyecto = '' OR v_concepto = '' OR v_costo <= 0 THEN
      RAISE EXCEPTION 'gasto_invalido: faltan el proyecto, el concepto o el costo' USING ERRCODE = 'P1415';
    END IF;
    PERFORM 1 FROM cotizaciones c
    WHERE c.id = v_proyecto AND c.es_complementaria_de IS NULL AND c.estado = 'APROBADA' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proyecto_sin_cotizacion_aprobada: el proyecto % no tiene una cotización principal aprobada', v_proyecto USING ERRCODE = 'P1413';
    END IF;
    PERFORM 1 FROM cuentas_pagar_grupos g
    WHERE g.proyecto_id = v_proyecto AND g.responsable_id = v_prov.id AND g.estado = 'ABIERTO' FOR UPDATE;
    INSERT INTO cuentas_pagar (cotizacion_id, proyecto_id, responsable_id, item_id, costo_total, concepto, operation_id)
    VALUES (v_proyecto, v_proyecto, v_prov.id, NULL, v_costo, v_concepto, p_operation_id)
    RETURNING * INTO v_extra;
    v_grupo := (reconcile_cuenta_pagar_grupo(v_extra.id)->>'grupo_id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'proveedor_id', v_prov.id, 'proveedor_nombre', v_prov.nombre, 'proveedor_creado', v_creado,
    'proyecto_id', v_proyecto, 'grupo_id', v_grupo, 'cuenta_extra_id', v_extra.id, 'reasignados', v_mov,
    'monto_total', (SELECT g.monto_total FROM cuentas_pagar_grupos g WHERE g.id = v_grupo), 'repetido', false);
END;
$function$;

-- ── Permisos: funciones nuevas solo para service_role ──
REVOKE EXECUTE ON FUNCTION public.cuentas_proyectos_selector(text, text, text, uuid, boolean, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_proyectos_selector(text, text, text, uuid, boolean, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.preparar_grupo_factura_proveedor(uuid, jsonb, uuid[], jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_grupo_factura_proveedor(uuid, jsonb, uuid[], jsonb, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.guardar_tolerancia_total(numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_tolerancia_total(numeric, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.estado_cuenta(text, uuid, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estado_cuenta(text, uuid, text[], date) TO service_role;

COMMIT;
