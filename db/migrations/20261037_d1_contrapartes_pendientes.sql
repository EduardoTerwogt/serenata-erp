-- #131 D1: contrapartes con algo pendiente, para el desplegable de Subir factura, Registrar pago y Estado de cuenta.
-- Solo lectura y aditiva. Una sola lista (id, nombre, pendientes) por lado y por tipo de pendiente:
--   factura      cobro: clientes con cuentas sin factura · proveedor: con un grupo sin factura validada, o sin ningún grupo
--                (alta reciente: el XML le asigna renglones). Mismos predicados que `facturas_candidatos`.
--   complemento  pagos activos que piden complemento y no está completo (XML validado + PDF), mismo criterio que
--                `cc_pago` / `p_comp_pago` de `estado_cuenta`; solo facturas PPD.
--   saldo        cobro: saldo > 0 con o sin factura (anticipos, D32) · proveedor: grupo con saldo por transferir.
--   todos        activos, sin contar pendientes (Estado de cuenta).
-- plpgsql con `force_custom_plan`: filtros opcionales en SQL puro hacen una sonda por fila (.claude/rules/migraciones.md).
-- Búsqueda por nombre (`p_q`) y tope (`p_limit`, máx. 100) en SQL: devuelve `{total, contrapartes}` para que la UI diga
-- cuántas hay y no recorte en silencio.
CREATE OR REPLACE FUNCTION public.cuentas_contrapartes_pendientes(p_lado text, p_pendiente text, p_q text DEFAULT NULL, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_q     text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_pat   text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v       jsonb;
BEGIN
  v_pat := CASE WHEN v_q IS NULL THEN NULL
                ELSE '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  IF p_lado IS NULL OR p_lado NOT IN ('cobro', 'proveedor') THEN
    RAISE EXCEPTION 'lado_invalido: usa cobro o proveedor' USING ERRCODE = 'P1415';
  END IF;
  IF p_pendiente IS NULL OR p_pendiente NOT IN ('factura', 'complemento', 'saldo', 'todos') THEN
    RAISE EXCEPTION 'pendiente_invalido: usa factura, complemento, saldo o todos' USING ERRCODE = 'P1415';
  END IF;

  WITH filas AS (
    -- Cobro · factura
    SELECT ct.cliente_id AS id, count(*)::int AS n
    FROM cuentas_cobrar cc
    JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
    WHERE p_lado = 'cobro' AND p_pendiente = 'factura' AND cc.factura_documento_id IS NULL AND ct.cliente_id IS NOT NULL
    GROUP BY 1
    UNION ALL
    -- Proveedor · factura: grupos sin factura validada
    SELECT g.responsable_id, count(*)::int
    FROM cuentas_pagar_grupos g
    WHERE p_lado = 'proveedor' AND p_pendiente = 'factura' AND g.responsable_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_pagar d
                      WHERE d.grupo_id = g.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
                        AND d.estado_validacion = 'validado')
    GROUP BY 1
    UNION ALL
    -- Proveedor · factura: sin ningún grupo todavía
    SELECT pv.id, 0
    FROM proveedores pv
    WHERE p_lado = 'proveedor' AND p_pendiente = 'factura' AND pv.activo IS NOT FALSE
      AND NOT EXISTS (SELECT 1 FROM cuentas_pagar_grupos g WHERE g.responsable_id = pv.id)
    UNION ALL
    -- Cobro · complemento: pago activo posterior a la factura PPD (o sin fecha de factura) sin complemento completo
    SELECT ct.cliente_id, count(DISTINCT pc.pago_id)::int
    FROM pagos_comprobantes pc
    JOIN pagos h ON h.id = pc.pago_id AND h.anulado_at IS NULL
    JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
    JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
    WHERE p_lado = 'cobro' AND p_pendiente = 'complemento' AND ct.cliente_id IS NOT NULL
      AND (cc.fecha_factura IS NULL OR h.fecha_pago > cc.fecha_factura)
      AND EXISTS (SELECT 1 FROM documentos_cuentas_cobrar f
                  WHERE f.id = cc.factura_documento_id AND f.tipo = 'FACTURA_XML' AND f.eliminado_at IS NULL AND f.metodo_pago_cfdi = 'PPD')
      AND NOT (
        EXISTS (SELECT 1 FROM documentos_cuentas_cobrar x
                WHERE x.pago_id = pc.pago_id AND x.tipo = 'COMPLEMENTO_PAGO' AND x.eliminado_at IS NULL AND x.estado_validacion = 'validado'
                  AND (x.factura_documento_id = cc.factura_documento_id OR x.cuentas_cobrar_id = cc.id))
        AND EXISTS (SELECT 1 FROM documentos_cuentas_cobrar x
                    WHERE x.pago_id = pc.pago_id AND x.tipo = 'COMPLEMENTO_PAGO_PDF' AND x.eliminado_at IS NULL
                      AND (x.factura_documento_id = cc.factura_documento_id OR x.cuentas_cobrar_id = cc.id)))
    GROUP BY 1
    UNION ALL
    -- Proveedor · complemento
    SELECT g.responsable_id, count(DISTINCT pp.pago_id)::int
    FROM pagos_cuentas_pagar pp
    JOIN pagos h ON h.id = pp.pago_id AND h.anulado_at IS NULL
    JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id
    WHERE p_lado = 'proveedor' AND p_pendiente = 'complemento' AND g.responsable_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM documentos_cuentas_pagar f
                  WHERE f.grupo_id = g.id AND f.tipo = 'FACTURA_PROVEEDOR_XML' AND f.eliminado_at IS NULL AND f.metodo_pago_cfdi = 'PPD')
      AND NOT (
        EXISTS (SELECT 1 FROM documentos_cuentas_pagar x
                WHERE x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
                  AND x.eliminado_at IS NULL AND x.estado_validacion = 'validado')
        AND EXISTS (SELECT 1 FROM documentos_cuentas_pagar x
                    WHERE x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO_PDF' AND x.eliminado_at IS NULL))
    GROUP BY 1
    UNION ALL
    -- Cobro · saldo (con o sin factura)
    SELECT ct.cliente_id, count(*)::int
    FROM cuentas_cobrar cc
    JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
    WHERE p_lado = 'cobro' AND p_pendiente = 'saldo' AND ct.cliente_id IS NOT NULL
      AND cc.monto_total - COALESCE(cc.monto_pagado, 0) > 0.005
    GROUP BY 1
    UNION ALL
    -- Proveedor · saldo
    SELECT g.responsable_id, count(*)::int
    FROM cuentas_pagar_grupos g
    WHERE p_lado = 'proveedor' AND p_pendiente = 'saldo' AND g.responsable_id IS NOT NULL
      AND g.total_a_transferir IS NOT NULL AND g.total_a_transferir - COALESCE(g.monto_transferido, 0) > 0.005
    GROUP BY 1
    UNION ALL
    -- Todos los activos
    SELECT c.id, 0 FROM clientes c WHERE p_lado = 'cobro' AND p_pendiente = 'todos' AND c.activo IS NOT FALSE
    UNION ALL
    SELECT pv.id, 0 FROM proveedores pv WHERE p_lado = 'proveedor' AND p_pendiente = 'todos' AND pv.activo IS NOT FALSE
  )
  SELECT jsonb_build_object('total', COALESCE(max(x.total), 0),
           'contrapartes', COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'pendientes', x.n) ORDER BY x.nombre, x.id), '[]'::jsonb))
    INTO v
  FROM (
    SELECT f.id, COALESCE(c.nombre, pv.nombre) AS nombre, f.n, count(*) OVER () AS total
    FROM (SELECT id, sum(n)::int AS n FROM filas GROUP BY id) f
    LEFT JOIN clientes c ON p_lado = 'cobro' AND c.id = f.id
    LEFT JOIN proveedores pv ON p_lado = 'proveedor' AND pv.id = f.id
    WHERE COALESCE(c.nombre, pv.nombre) IS NOT NULL
      AND (v_pat IS NULL OR COALESCE(c.nombre, pv.nombre) ILIKE v_pat)
    ORDER BY 2, 1
    LIMIT v_limit
  ) x;
  RETURN v;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cuentas_contrapartes_pendientes(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_contrapartes_pendientes(text, text, text, integer) TO service_role;
