-- Rediseño de Cuentas, B3 (docs/PLAN.md, O1, U1, D9, D12, H7, S17,
-- supuesto 11): lectura por periodo.
--
-- 1. Índice por proyectos.fecha_entrega (D12): el año se filtra por rango de
--    texto 'YYYY-MM-DD', que usa el índice.
-- 2. cuentas_por_proyecto(p_year DEFAULT NULL) (U1):
--    - sin parámetro devuelve exactamente lo mismo que la versión anterior
--      (la UI actual no cambia hasta B8);
--    - con p_year devuelve los conceptos crudos del año más "Sin fecha" y
--      "Sin proyecto" (S17, supuesto 11) en forma plana y posicional
--      {proyectos, cobros, pagos, grupos}, con lo necesario para derivar en
--      TS (O1):
--      fecha_entrega, facturas XML, pagos y complementos de cada cobro,
--      grupos de proveedor con sus documentos, comprobantes y fechas de pago,
--      y el snapshot total_a_transferir. No filtra más allá del año ni
--      deriva. Set-based (CTEs agregadas una vez), en json y con filas
--      arreglo, para el presupuesto de O1b.
-- 3. cuentas_anios(): años con datos, para el select de periodo.
-- 4. sync_estados_cuentas_cobrar_vencidas() calcula "hoy" en CDMX (H7), no en
--    UTC. Mismo cuerpo que su versión en pg_proc salvo esa línea.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_proyectos_fecha_entrega ON public.proyectos (fecha_entrega);

DROP FUNCTION IF EXISTS public.cuentas_por_proyecto();
DROP FUNCTION IF EXISTS public.cuentas_por_proyecto(integer);

CREATE FUNCTION public.cuentas_por_proyecto(p_year integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desde text;
  v_hasta text;
  v_result json;
BEGIN
  IF p_year IS NULL THEN
    -- Versión anterior, sin cambios (20260928); solo el tipo de retorno pasa
    -- a json, que el cliente lee igual.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'proyecto', t.proyecto,
          'cuentas_cobrar', t.cuentas_cobrar,
          'cuentas_pagar', t.cuentas_pagar,
          'total_cobrar', t.total_cobrar,
          'total_pagar', t.total_pagar,
          'margen_total_proyecto', t.margen_total_proyecto,
          'fee_agencia_proyecto', t.fee_agencia_proyecto,
          'utilidad_total_proyecto', t.utilidad_total_proyecto,
          'iva_total_proyecto', t.iva_total_proyecto
        )
        ORDER BY t.proyecto_created_at DESC, t.proyecto_id DESC
      ),
      '[]'::jsonb
    )::json INTO v_result
    FROM (
      SELECT
        p.id AS proyecto_id,
        p.created_at AS proyecto_created_at,
        jsonb_build_object('id', p.id, 'folio', p.id, 'nombre', p.proyecto, 'cliente', p.cliente, 'cliente_id', p.cliente_id, 'estado', p.estado) AS proyecto,
        COALESCE((SELECT jsonb_agg(cc ORDER BY cc.created_at DESC, cc.id DESC) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), '[]'::jsonb) AS cuentas_cobrar,
        COALESCE((
          SELECT jsonb_agg(
            to_jsonb(cp) || jsonb_build_object(
              'grupo_estado', g.estado,
              'grupo_monto_total', g.monto_total,
              'grupo_monto_pagado', g.monto_pagado,
              'grupo_total_a_transferir', g.total_a_transferir,
              'grupo_monto_transferido', g.monto_transferido,
              'proveedor_regimen_fiscal', pr.regimen_fiscal
            )
            ORDER BY cp.created_at DESC, cp.id DESC
          )
          FROM cuentas_pagar cp
          LEFT JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
          LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
          WHERE cp.proyecto_id = p.id
        ), '[]'::jsonb) AS cuentas_pagar,
        ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
        ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar,
        ROUND(COALESCE((SELECT SUM(c.margen_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS margen_total_proyecto,
        ROUND(COALESCE((SELECT SUM(c.fee_agencia) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS fee_agencia_proyecto,
        ROUND(COALESCE((SELECT SUM(c.utilidad_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS utilidad_total_proyecto,
        ROUND(COALESCE((SELECT SUM(c.iva) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS iva_total_proyecto
      FROM proyectos p
      WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
         OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
    ) t;
    RETURN v_result;
  END IF;

  v_desde := lpad(p_year::text, 4, '0') || '-01-01';
  v_hasta := lpad((p_year + 1)::text, 4, '0') || '-01-01';

  -- Forma plana y posicional (O1b): cuatro listas de filas-arreglo, en json
  -- (no jsonb: construirlo cuesta la mitad). El orden de columnas es el
  -- contrato con lib/server/cuentas/periodo-rpc.ts, que las decodifica:
  --   proyectos: id, nombre, cliente, cliente_id, fecha_entrega, margen, fee,
  --              utilidad, iva
  --   cobros:    id, cotizacion_id, proyecto_id, folio, cliente, cliente_id,
  --              proyecto, monto_total, monto_pagado, fecha_vencimiento,
  --              fecha_factura, facturas_xml, pagos
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
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE (p.fecha_entrega >= v_desde AND p.fecha_entrega < v_hasta AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
       OR p.fecha_entrega IS NULL
       OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$'
  ),
  cc AS (
    SELECT cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
           cc.monto_total, cc.monto_pagado, cc.fecha_vencimiento, cc.fecha_factura, cc.created_at
    FROM cuentas_cobrar cc
    WHERE cc.proyecto_id IS NULL OR cc.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.responsable_nombre,
           cp.item_descripcion, cp.x_pagar, cp.monto_pagado, cp.total_a_transferir, cp.monto_transferido,
           cp.orden_pago_id, cp.created_at
    FROM cuentas_pagar cp
    WHERE cp.proyecto_id IS NULL OR cp.proyecto_id IN (SELECT id FROM py)
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
    WHERE d.tipo = 'FACTURA_XML' AND d.cuentas_cobrar_id IN (SELECT id FROM cc)
    GROUP BY d.cuentas_cobrar_id
  ),
  comp AS (
    SELECT d.pago_id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO') AS xml,
           json_agg(json_build_object('fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO_PDF') AS pdf
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF')
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
    WHERE pc.cuentas_cobrar_id IN (SELECT id FROM cc)
    GROUP BY pc.cuentas_cobrar_id
  ),
  dp AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo IN ('FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO')
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
        COALESCE(cot.margen, 0), COALESCE(cot.fee, 0), COALESCE(cot.utilidad, 0), COALESCE(cot.iva, 0)
      ) ORDER BY py.created_at DESC, py.id DESC)
      FROM py
      LEFT JOIN cot ON cot.pid = py.id
      WHERE py.id IN (SELECT cc.proyecto_id FROM cc UNION SELECT cp.proyecto_id FROM cp)
    ), '[]'::json),
    'cobros', COALESCE((
      SELECT json_agg(json_build_array(
        cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
        cc.monto_total, COALESCE(cc.monto_pagado, 0), cc.fecha_vencimiento, cc.fecha_factura,
        f.docs, pg.pagos
      ) ORDER BY cc.created_at, cc.id)
      FROM cc
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

REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto(integer) TO service_role;

-- Años con datos de Cuentas, más el año en curso (CDMX), del más reciente al
-- más antiguo.
CREATE OR REPLACE FUNCTION public.cuentas_anios()
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(y ORDER BY y DESC), '{}')
  FROM (
    SELECT left(p.fecha_entrega, 4)::integer AS y
    FROM proyectos p
    WHERE p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$'
      AND (EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
           OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id))
    UNION
    SELECT extract(year FROM hoy_cdmx())::integer
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_anios() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_anios() TO service_role;

-- H7: "hoy" en CDMX. El resto del cuerpo es el de pg_proc.
CREATE OR REPLACE FUNCTION public.sync_estados_cuentas_cobrar_vencidas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy date := hoy_cdmx();
BEGIN
  WITH calculado AS (
    SELECT
      id,
      ROUND(monto_total - COALESCE(monto_pagado, 0), 2) AS saldo,
      CASE
        WHEN ROUND(monto_total - COALESCE(monto_pagado, 0), 2) <= 0 AND monto_total > 0
          THEN 'PAGADO'
        WHEN fecha_vencimiento IS NOT NULL
          AND fecha_vencimiento < v_hoy
          AND ROUND(monto_total - COALESCE(monto_pagado, 0), 2) > 0
          THEN 'VENCIDO'
        WHEN NOT (estado <> 'FACTURA_PENDIENTE' AND fecha_factura IS NOT NULL)
          THEN 'FACTURA_PENDIENTE'
        WHEN COALESCE(monto_pagado, 0) > 0
          THEN 'PARCIALMENTE_PAGADO'
        ELSE 'FACTURADO'
      END AS estado_nuevo
    FROM cuentas_cobrar
  )
  UPDATE cuentas_cobrar c
  SET estado = calculado.estado_nuevo
  FROM calculado
  WHERE c.id = calculado.id AND c.estado IS DISTINCT FROM calculado.estado_nuevo;
END;
$$;

COMMIT;
