-- Bloque 6 de la iniciativa de agrupación de Cuentas por Pagar
-- (docs/PLAN.md). La lista interna de "Cuentas / Por Pagar" (vista
-- "Lista", app/components/cuentas/CuentasTable.tsx) seguía mostrando una
-- fila por CADA item de cotización (buscar_cuentas_pagar,
-- db/migrations/20260914_buscar_cuentas_pagar.sql) -- ese RPC nunca se
-- tocó al construir cuentas_pagar_grupos (Bloque 1), así que un proveedor
-- con 3 items en el mismo proyecto seguía apareciendo 3 veces en la lista,
-- con el x_pagar de cada renglón por separado, en vez de una sola fila con
-- el total del grupo. Reportado por el usuario tras revisar el Preview.
--
-- Reemplaza buscar_cuentas_pagar como fuente de la lista (buscar_cuentas_pagar
-- se deja desplegada, sin caller JS -- mismo patrón de limpieza que
-- getCuentasPagarPendientesEventosRealizados en el Bloque 3). Una "unidad
-- facturable" es un grupo real (cuentas_pagar_grupos) o una cuenta_pagar
-- legacy sin grupo_id todavía (excluida a propósito de la migración
-- retroactiva del Bloque 5 por ya tener documento o pago en curso, o
-- creada antes de que existiera el esquema de agrupación) -- se muestra
-- como su propio "grupo" de un solo item, nunca invisible para staff.
-- Mismo patrón UNION ALL que ya usan
-- cuentas_pagar_grupos_facturados_eventos_realizados() (Bloque 3) y el
-- Portal (getCuentasPagarGruposPorProveedor, Bloque 4).
--
-- Cada fila de grupo muestra los datos de un item "representante" (el más
-- antiguo del grupo, orden estable por created_at/id) solo para render
-- (folio/descripción/cantidad/correo) -- x_pagar/monto_pagado/estado
-- siempre son los del GRUPO (monto_total/monto_pagado/estado), nunca los
-- del item individual. El id expuesto es el del item representante a
-- propósito: la UI abre el detalle existente (GET /api/cuentas-pagar/:id/documentos,
-- sin cambios) con ese id, que ya resuelve y muestra el grupo completo por
-- su cuenta.grupo_id -- ninguna ruta ni el modal de detalle necesitan
-- tocarse.
CREATE OR REPLACE FUNCTION public.buscar_cuentas_pagar_grupos(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
  v_page int := GREATEST(p_page, 1);
  v_term text := CASE WHEN p_search IS NULL OR p_search = '' THEN NULL
    ELSE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  v_rows jsonb;
  v_total_rows bigint;
  v_total_pendiente numeric;
  v_total_pagado numeric;
  v_pendientes_count bigint;
BEGIN
  SELECT COALESCE(jsonb_agg(t.row_json ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb), COUNT(*) OVER ()
  INTO v_rows, v_total_rows
  FROM (
    (
      SELECT jsonb_build_object(
          'id', rep.id, 'es_grupo', true, 'items_count', rep.items_count,
          'proyecto_id', g.proyecto_id, 'proyecto_nombre', COALESCE(rep.proyecto_nombre, g.proyecto_id),
          'responsable_id', g.responsable_id, 'responsable_nombre', COALESCE(pv.nombre, rep.responsable_nombre),
          'correo', rep.correo, 'cotizacion_id', rep.cotizacion_id,
          'item_descripcion', rep.item_descripcion, 'cantidad', rep.cantidad,
          'estado', g.estado, 'x_pagar', g.monto_total, 'monto_pagado', g.monto_pagado
        ) AS row_json, g.created_at, g.id
      FROM cuentas_pagar_grupos g
      LEFT JOIN proveedores pv ON pv.id = g.responsable_id
      JOIN LATERAL (
        SELECT cp2.id, cp2.cotizacion_id, cp2.item_descripcion, cp2.correo, cp2.cantidad, cp2.responsable_nombre,
               COALESCE(c2.proyecto, p2.proyecto) AS proyecto_nombre,
               (SELECT count(*) FROM cuentas_pagar WHERE grupo_id = g.id) AS items_count
        FROM cuentas_pagar cp2
        LEFT JOIN cotizaciones c2 ON c2.id = cp2.cotizacion_id
        LEFT JOIN proyectos p2 ON p2.id = cp2.proyecto_id
        WHERE cp2.grupo_id = g.id
        ORDER BY cp2.created_at, cp2.id
        LIMIT 1
      ) rep ON true
      WHERE v_term IS NULL
         OR pv.nombre ILIKE v_term ESCAPE '\'
         OR EXISTS (
           SELECT 1 FROM cuentas_pagar cpi
           LEFT JOIN cotizaciones ci ON ci.id = cpi.cotizacion_id
           LEFT JOIN proyectos pi ON pi.id = cpi.proyecto_id
           WHERE cpi.grupo_id = g.id
             AND (cpi.cotizacion_id ILIKE v_term ESCAPE '\'
               OR cpi.item_descripcion ILIKE v_term ESCAPE '\'
               OR cpi.folio ILIKE v_term ESCAPE '\'
               OR COALESCE(ci.proyecto, pi.proyecto) ILIKE v_term ESCAPE '\')
         )
    )
    UNION ALL
    (
      SELECT jsonb_build_object(
          'id', cp.id, 'es_grupo', false, 'items_count', 1,
          'proyecto_id', cp.proyecto_id, 'proyecto_nombre', COALESCE(c.proyecto, p.proyecto),
          'responsable_id', cp.responsable_id, 'responsable_nombre', cp.responsable_nombre,
          'correo', cp.correo, 'cotizacion_id', cp.cotizacion_id,
          'item_descripcion', cp.item_descripcion, 'cantidad', cp.cantidad,
          'estado', cp.estado, 'x_pagar', cp.x_pagar, 'monto_pagado', cp.monto_pagado
        ) AS row_json, cp.created_at, cp.id
      FROM cuentas_pagar cp
      LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
      LEFT JOIN proyectos p ON p.id = cp.proyecto_id
      WHERE cp.grupo_id IS NULL
        AND (v_term IS NULL
          OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
          OR cp.folio ILIKE v_term ESCAPE '\'
          OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
          OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
          OR cp.item_descripcion ILIKE v_term ESCAPE '\')
    )
    ORDER BY created_at DESC, id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t
  LIMIT 1;

  SELECT COUNT(*) INTO v_total_rows FROM (
    (
      SELECT g.id FROM cuentas_pagar_grupos g
      LEFT JOIN proveedores pv ON pv.id = g.responsable_id
      WHERE v_term IS NULL
         OR pv.nombre ILIKE v_term ESCAPE '\'
         OR EXISTS (
           SELECT 1 FROM cuentas_pagar cpi
           LEFT JOIN cotizaciones ci ON ci.id = cpi.cotizacion_id
           LEFT JOIN proyectos pi ON pi.id = cpi.proyecto_id
           WHERE cpi.grupo_id = g.id
             AND (cpi.cotizacion_id ILIKE v_term ESCAPE '\'
               OR cpi.item_descripcion ILIKE v_term ESCAPE '\'
               OR cpi.folio ILIKE v_term ESCAPE '\'
               OR COALESCE(ci.proyecto, pi.proyecto) ILIKE v_term ESCAPE '\')
         )
    )
    UNION ALL
    (
      SELECT cp.id FROM cuentas_pagar cp
      LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
      LEFT JOIN proyectos p ON p.id = cp.proyecto_id
      WHERE cp.grupo_id IS NULL
        AND (v_term IS NULL
          OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
          OR cp.folio ILIKE v_term ESCAPE '\'
          OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
          OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
          OR cp.item_descripcion ILIKE v_term ESCAPE '\')
    )
  ) counted;

  SELECT
    ROUND(COALESCE(SUM(GREATEST(u.monto_total - COALESCE(u.monto_pagado, 0), 0)), 0), 2),
    ROUND(COALESCE(SUM(u.monto_pagado), 0), 2)
  INTO v_total_pendiente, v_total_pagado
  FROM (
    (
      SELECT g.monto_total, g.monto_pagado FROM cuentas_pagar_grupos g
      LEFT JOIN proveedores pv ON pv.id = g.responsable_id
      WHERE v_term IS NULL
         OR pv.nombre ILIKE v_term ESCAPE '\'
         OR EXISTS (
           SELECT 1 FROM cuentas_pagar cpi
           LEFT JOIN cotizaciones ci ON ci.id = cpi.cotizacion_id
           LEFT JOIN proyectos pi ON pi.id = cpi.proyecto_id
           WHERE cpi.grupo_id = g.id
             AND (cpi.cotizacion_id ILIKE v_term ESCAPE '\'
               OR cpi.item_descripcion ILIKE v_term ESCAPE '\'
               OR cpi.folio ILIKE v_term ESCAPE '\'
               OR COALESCE(ci.proyecto, pi.proyecto) ILIKE v_term ESCAPE '\')
         )
    )
    UNION ALL
    (
      SELECT cp.x_pagar, cp.monto_pagado FROM cuentas_pagar cp
      LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
      LEFT JOIN proyectos p ON p.id = cp.proyecto_id
      WHERE cp.grupo_id IS NULL
        AND (v_term IS NULL
          OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
          OR cp.folio ILIKE v_term ESCAPE '\'
          OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
          OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
          OR cp.item_descripcion ILIKE v_term ESCAPE '\')
    )
  ) u;

  SELECT COUNT(*) INTO v_pendientes_count FROM (
    SELECT g.id FROM cuentas_pagar_grupos g WHERE g.estado <> 'PAGADO'
    UNION ALL
    SELECT cp.id FROM cuentas_pagar cp WHERE cp.grupo_id IS NULL AND cp.estado <> 'PAGADO'
  ) pc;

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows,
    'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
    'pendientes_count', v_pendientes_count
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_pagar_grupos(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cuentas_pagar_grupos(text, int, int) TO service_role;
