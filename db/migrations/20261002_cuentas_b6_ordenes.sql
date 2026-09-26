-- Rediseño de Cuentas, B6 (docs/PLAN.md §7 B6, D7, D13, D20, R6, S1,
-- supuestos 13 y 14): candidatos de orden con motivo de exclusión,
-- cancelación atómica de una orden y búsqueda de órdenes con filtros y
-- desglose.
--
-- 1. ordenes_pago: estado CANCELADA con cancelada_at/por/motivo.
-- 2. cuentas_orden_candidatos(): todo pago a proveedor con saldo y sin orden
--    (grupo o suelta), con su motivo si no es elegible (supuesto 13, T2):
--      sin_proveedor · sin_factura · factura_revision · evento_pendiente.
--    Incluye el grupo con pago parcial directo (EN_PROCESO_PAGO sin orden).
--    "Evento ya pasó" se mide por cada cotización del grupo (decisión 011,
--    D12). Las elegibles traen sus renglones con saldo; las no incluidas
--    viajan acotadas (las más próximas) con su total.
-- 3. cancelar_orden_pago(): atómica y simétrica a generar_orden_pago (B1b).
--    Solo si ningún pago está registrado contra la orden. Cada grupo, hija y
--    suelta vuelve al estado que corresponde a su saldo (R6), no a uno fijo.
--    Conserva ordenes_pago_conceptos para el historial (S1).
-- 4. buscar_ordenes_pago(p_filtros jsonb, ...): filtros por estado (VENCIDA
--    derivada a 15 días en hora CDMX, D7/D13), mes, proveedor, proyecto y
--    folio; desglose y conteo leídos de ordenes_pago_conceptos (S1); monto
--    en total a transferir (D20) cuando la orden lo guardó. La firma
--    (int, int) sigue viva para la UI anterior hasta B8.

BEGIN;

-- ── 1. Orden cancelada ─────────────────────────────────────────────────────
ALTER TABLE public.ordenes_pago
  ADD COLUMN IF NOT EXISTS cancelada_at     timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por    text,
  ADD COLUMN IF NOT EXISTS cancelada_motivo text;

-- El CHECK de estado viene del CREATE TABLE (nombre automático); se
-- sustituye para aceptar CANCELADA, y una orden está cancelada si y solo si
-- tiene fecha de cancelación. VENCIDA no se guarda: se deriva (D7).
ALTER TABLE public.ordenes_pago DROP CONSTRAINT IF EXISTS ordenes_pago_estado_check;
ALTER TABLE public.ordenes_pago
  ADD CONSTRAINT ordenes_pago_estado_check CHECK (estado IN ('GENERADA', 'PARCIALMENTE_PAGADA', 'COMPLETADA', 'CANCELADA'));
ALTER TABLE public.ordenes_pago DROP CONSTRAINT IF EXISTS ordenes_pago_cancelada_check;
ALTER TABLE public.ordenes_pago
  ADD CONSTRAINT ordenes_pago_cancelada_check CHECK ((estado = 'CANCELADA') = (cancelada_at IS NOT NULL));

-- ── 2. Candidatos de orden ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cuentas_orden_candidatos(p_limite_no_incluidas integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '8MB'
AS $$
DECLARE
  v_hoy    text := to_char(hoy_cdmx(), 'YYYY-MM-DD');
  v_result jsonb;
BEGIN
  WITH
  obj AS (
    -- Grupos con saldo y sin orden.
    SELECT 'grupo'::text AS tipo, g.id, g.proyecto_id, g.responsable_id,
           NULL::text AS responsable_nombre_cp,
           round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) AS saldo,
           g.total_a_transferir, COALESCE(g.monto_transferido, 0) AS monto_transferido,
           g.estado
    FROM cuentas_pagar_grupos g
    WHERE g.orden_pago_id IS NULL
      AND g.estado <> 'PAGADO'
      AND round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) > 0
    UNION ALL
    -- Sueltas (sin grupo) con saldo y sin orden.
    SELECT 'cuenta', cp.id, cp.proyecto_id, cp.responsable_id,
           cp.responsable_nombre,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2),
           cp.total_a_transferir, COALESCE(cp.monto_transferido, 0),
           cp.estado
    FROM cuentas_pagar cp
    WHERE cp.grupo_id IS NULL
      AND cp.orden_pago_id IS NULL
      AND cp.estado <> 'PAGADO'
      AND round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) > 0
  ),
  -- Renglones de cada objetivo (hijas del grupo o la propia suelta).
  ren AS (
    -- Dos joins por igualdad (no un OR, que obliga a un nested loop).
    SELECT 'grupo'::text AS tipo, cp.grupo_id AS obj_id, cp.id AS cuenta_id, cp.item_descripcion, cp.cantidad,
           cp.cotizacion_id, cp.responsable_nombre, cp.correo, cp.telefono, cp.banco, cp.clabe, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) AS saldo
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'grupo' AND o.id = cp.grupo_id
    UNION ALL
    SELECT 'cuenta', cp.id, cp.id, cp.item_descripcion, cp.cantidad,
           cp.cotizacion_id, cp.responsable_nombre, cp.correo, cp.telefono, cp.banco, cp.clabe, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2)
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'cuenta' AND o.id = cp.id
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
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML'
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
  primer AS (
    -- Datos de contacto de respaldo (sueltas legacy sin proveedor en catálogo).
    SELECT DISTINCT ON (r.tipo, r.obj_id) r.tipo, r.obj_id, r.responsable_nombre, r.correo, r.telefono, r.banco, r.clabe
    FROM ren r
    ORDER BY r.tipo, r.obj_id, r.created_at, r.cuenta_id
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
          'nombre', COALESCE(c.pr_nombre, pm.responsable_nombre, 'Sin nombre'),
          'regimen_fiscal', c.regimen_fiscal,
          'banco', COALESCE(c.pr_banco, pm.banco), 'clabe', COALESCE(c.pr_clabe, pm.clabe),
          'correo', COALESCE(c.pr_correo, pm.correo), 'telefono', COALESCE(c.pr_telefono, pm.telefono)
        ),
        'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
        'items', it.items
      ) ORDER BY COALESCE(c.pr_nombre, pm.responsable_nombre), c.fecha_max, c.proyecto_id, c.id)
      FROM cal c
      LEFT JOIN primer pm ON pm.tipo = c.tipo AND pm.obj_id = c.id
      LEFT JOIN items it ON it.tipo = c.tipo AND it.obj_id = c.id
      WHERE c.motivo IS NULL
    ), '[]'::jsonb),
    'no_incluidas', COALESCE((
      SELECT jsonb_agg(x.fila ORDER BY x.orden)
      FROM (
        SELECT jsonb_build_object(
                 'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
                 'responsable_nombre', COALESCE(c.pr_nombre, pm.responsable_nombre),
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
        LEFT JOIN primer pm ON pm.tipo = c.tipo AND pm.obj_id = c.id
        WHERE c.motivo IS NOT NULL
      ) x
      WHERE x.orden <= GREATEST(COALESCE(p_limite_no_incluidas, 100), 0)
    ), '[]'::jsonb),
    'no_incluidas_total', (SELECT count(*) FROM cal WHERE motivo IS NOT NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_orden_candidatos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_orden_candidatos(integer) TO service_role;

-- ── 3. Cancelar una orden ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_orden_pago(p_orden_id uuid, p_motivo text, p_usuario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_orden   ordenes_pago;
  v_grupos  int;
  v_cuentas int;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: cancelar una orden pide un motivo' USING ERRCODE = 'P1415';
  END IF;

  SELECT * INTO v_orden FROM ordenes_pago WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada: la orden % no existe', p_orden_id USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'orden_cancelada: la orden % ya está cancelada', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- Mismo orden de bloqueo que generar_orden_pago y los pagos: grupos, hijas
  -- y sueltas por id.
  PERFORM 1 FROM cuentas_pagar_grupos WHERE orden_pago_id = p_orden_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar WHERE orden_pago_id = p_orden_id ORDER BY id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM pagos_cuentas_pagar WHERE orden_pago_id = p_orden_id AND anulado_at IS NULL) THEN
    RAISE EXCEPTION 'orden_con_pagos: la orden % ya tiene pagos registrados', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- R6: cada uno regresa al estado que le toca por su saldo.
  UPDATE cuentas_pagar_grupos
     SET orden_pago_id = NULL,
         estado = CASE WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO' ELSE 'FACTURADO' END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id AND estado <> 'PAGADO';
  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  -- Hijas de grupo y sueltas. Una suelta con pago parcial fuera de orden es
  -- PENDIENTE (H3); una hija con pago parcial queda EN_PROCESO_PAGO, como la
  -- deja registrar_pago_grupo_factura.
  UPDATE cuentas_pagar
     SET orden_pago_id = NULL,
         estado = CASE
           WHEN estado = 'PAGADO' THEN estado
           WHEN grupo_id IS NOT NULL AND COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO'
           ELSE 'PENDIENTE'
         END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id;
  GET DIAGNOSTICS v_cuentas = ROW_COUNT;

  -- Un grupo ya PAGADO no se toca arriba; también suelta su orden.
  UPDATE cuentas_pagar_grupos SET orden_pago_id = NULL, updated_at = now() WHERE orden_pago_id = p_orden_id;

  UPDATE ordenes_pago
     SET estado = 'CANCELADA',
         cancelada_at = now(),
         cancelada_por = COALESCE(NULLIF(p_usuario, ''), 'sistema'),
         cancelada_motivo = btrim(p_motivo)
   WHERE id = p_orden_id;

  RETURN jsonb_build_object('orden_pago_id', p_orden_id, 'grupos', v_grupos, 'cuentas', v_cuentas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancelar_orden_pago(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_orden_pago(uuid, text, text) TO service_role;

-- ── 4. Buscar órdenes con filtros y desglose ──────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_ordenes_pago(p_filtros jsonb, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_page      int := GREATEST(COALESCE(p_page, 1), 1);
  v_hoy       date := hoy_cdmx();
  v_estado    text := NULLIF(p_filtros->>'estado', '');
  v_mes       text := NULLIF(p_filtros->>'mes', '');
  v_proveedor text := NULLIF(p_filtros->>'proveedor', '');
  v_proyecto  text := NULLIF(p_filtros->>'proyecto', '');
  v_q         text := NULLIF(btrim(p_filtros->>'q'), '');
  v_result    jsonb;
BEGIN
  WITH
  base AS (
    SELECT o.*,
           -- D7/D13: Vencida = sigue sin pagarse 15 días después de generada.
           CASE WHEN o.estado = 'GENERADA' AND v_hoy >= o.fecha_generacion + 15 THEN 'VENCIDA' ELSE o.estado END AS estado_vista
    FROM ordenes_pago o
  ),
  con AS (
    SELECT c.orden_pago_id,
           count(*) AS cuentas,
           bool_and(c.transferir_cubierto IS NOT NULL) AS con_transferir,
           sum(COALESCE(c.transferir_cubierto, c.neto_cubierto)) AS monto,
           array_agg(DISTINCT c.proyecto_id) FILTER (WHERE c.proyecto_id IS NOT NULL) AS proyectos,
           jsonb_agg(jsonb_build_object(
             'proyecto_id', c.proyecto_id, 'cotizacion_folio', c.cotizacion_folio,
             'responsable_id', c.responsable_id, 'responsable_nombre', c.responsable_nombre,
             'monto', COALESCE(c.transferir_cubierto, c.neto_cubierto)
           ) ORDER BY c.responsable_nombre, c.proyecto_id) AS desglose,
           bool_or(v_proveedor IS NOT NULL AND (c.responsable_id::text = v_proveedor OR c.responsable_nombre ILIKE v_proveedor)) AS coincide_proveedor,
           bool_or(v_proyecto IS NOT NULL AND c.proyecto_id = v_proyecto) AS coincide_proyecto,
           bool_or(v_q IS NOT NULL AND (c.cotizacion_folio ILIKE '%' || v_q || '%' OR c.proyecto_id ILIKE '%' || v_q || '%')) AS coincide_q
    FROM ordenes_pago_conceptos c
    GROUP BY c.orden_pago_id
  ),
  pagado AS (
    SELECT orden_pago_id, sum(monto_transferido) AS pagado
    FROM pagos_cuentas_pagar WHERE orden_pago_id IS NOT NULL AND anulado_at IS NULL
    GROUP BY 1
  ),
  filtrada AS (
    -- Todo menos el estado: sirve para los contadores del filtro de estado.
    SELECT b.*, c.cuentas, c.con_transferir, c.monto, c.proyectos, c.desglose, COALESCE(pg.pagado, 0) AS pagado
    FROM base b
    LEFT JOIN con c ON c.orden_pago_id = b.id
    LEFT JOIN pagado pg ON pg.orden_pago_id = b.id
    WHERE (v_mes IS NULL OR to_char(b.fecha_generacion, 'YYYY-MM') = v_mes)
      AND (v_proveedor IS NULL OR COALESCE(c.coincide_proveedor, false))
      AND (v_proyecto IS NULL OR COALESCE(c.coincide_proyecto, false))
      AND (v_q IS NULL OR b.pdf_nombre ILIKE '%' || v_q || '%' OR COALESCE(c.coincide_q, false))
  ),
  sel AS (
    SELECT * FROM filtrada WHERE v_estado IS NULL OR estado_vista = v_estado
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'fecha_generacion', s.fecha_generacion, 'pdf_url', s.pdf_url, 'pdf_nombre', s.pdf_nombre,
        'estado', s.estado_vista, 'total_monto', s.total_monto,
        -- D20: en total a transferir cuando la orden lo guardó (desde B2).
        'monto', CASE WHEN COALESCE(s.con_transferir, false) THEN round(s.monto, 2) ELSE s.total_monto END,
        'monto_estimado', NOT COALESCE(s.con_transferir, false),
        'pagado', s.pagado, 'cuentas', COALESCE(s.cuentas, 0),
        'proyectos', COALESCE(to_jsonb(s.proyectos), '[]'::jsonb), 'desglose', COALESCE(s.desglose, '[]'::jsonb),
        'created_by', s.created_by, 'cancelada_at', s.cancelada_at, 'cancelada_por', s.cancelada_por,
        'cancelada_motivo', s.cancelada_motivo
      ) ORDER BY s.fecha_generacion DESC, s.created_at DESC NULLS LAST, s.id DESC)
      FROM (
        SELECT * FROM sel
        ORDER BY fecha_generacion DESC, created_at DESC NULLS LAST, id DESC
        LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
      ) s
    ), '[]'::jsonb),
    'total_rows', (SELECT count(*) FROM sel),
    'conteos', (
      SELECT COALESCE(jsonb_object_agg(estado_vista, n), '{}'::jsonb)
      FROM (SELECT estado_vista, count(*) AS n FROM filtrada GROUP BY 1) t
    ),
    'total_sin_estado', (SELECT count(*) FROM filtrada)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_ordenes_pago(jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_ordenes_pago(jsonb, int, int) TO service_role;

COMMIT;
