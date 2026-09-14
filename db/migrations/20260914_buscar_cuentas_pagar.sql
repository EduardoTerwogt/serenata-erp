-- EF-3 3B-3: RPC de paginacion/busqueda/totales server-side para Cuentas
-- por Pagar. Reemplaza el filtrado/paginado en JS sobre el arreglo
-- completo (filterPagarRows en selectors.ts + getCuentasPagar() con
-- .limit(500)). Busca sobre los mismos 5 campos que filterPagarRows
-- (selectors.ts:37-50): cotizacion_id, folio, responsable_nombre,
-- proyecto_nombre, item_descripcion -- con escape de comodines LIKE
-- (%/_) para que un termino literal como "ITEM_01" no matchee de mas.
-- CxP no tiene side-effect de escritura en su GET -- RPC puramente de
-- lectura, sin recalculo previo.
CREATE OR REPLACE FUNCTION public.buscar_cuentas_pagar(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
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
  -- `cp.*` bastaba para buscar/paginar, pero el repositorio JS actual
  -- (`getCuentasPagar()`/`getCuentaPagarById()`, confirmado leyendo
  -- `cuentas-pagar.ts:23-32`) rellena `proyecto_nombre` con
  -- `row.proyecto_nombre || row.cotizaciones?.proyecto ||
  -- row.proyectos?.proyecto` -- si la columna propia de `cuentas_pagar`
  -- viene vacia, el JOIN a `cotizaciones`/`proyectos` la completa. Una
  -- fila con `cp.proyecto_nombre` NULL habria perdido ese fallback aqui.
  -- Se replica el mismo COALESCE via LEFT JOIN, sobreescribiendo solo ese
  -- campo sobre el resto de columnas de `cp` intactas. jsonb_agg agrega
  -- explicitamente t.row_json (nunca t completo) y repite el ORDER BY en
  -- el nivel externo: un agregado no hereda el orden de su subconsulta
  -- sin su propio ORDER BY.
  SELECT COALESCE(jsonb_agg(t.row_json ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb), COUNT(*) OVER ()
  INTO v_rows, v_total_rows
  FROM (
    SELECT to_jsonb(cp) || jsonb_build_object(
      'proyecto_nombre', COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto)
    ) AS row_json, cp.created_at, cp.id
    FROM cuentas_pagar cp
    LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE v_term IS NULL
       OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
       OR cp.folio ILIKE v_term ESCAPE '\'
       OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
       OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
       OR cp.item_descripcion ILIKE v_term ESCAPE '\'
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t
  LIMIT 1;

  -- total_rows real (no el de la pagina): recalculado aparte porque
  -- `COUNT(*) OVER()` de arriba solo cuenta las filas de la pagina, no el
  -- total del filtro. Mismo JOIN+COALESCE que arriba para que el filtro
  -- de busqueda por proyecto_nombre sea identico al de la pagina.
  SELECT COUNT(*) INTO v_total_rows
  FROM cuentas_pagar cp
  LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
  LEFT JOIN proyectos p ON p.id = cp.proyecto_id
  WHERE v_term IS NULL
     OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
     OR cp.folio ILIKE v_term ESCAPE '\'
     OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
     OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
     OR cp.item_descripcion ILIKE v_term ESCAPE '\';

  SELECT
    ROUND(COALESCE(SUM(GREATEST(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 0)), 0), 2),
    ROUND(COALESCE(SUM(cp.monto_pagado), 0), 2)
  INTO v_total_pendiente, v_total_pagado
  FROM cuentas_pagar cp
  LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
  LEFT JOIN proyectos p ON p.id = cp.proyecto_id
  WHERE v_term IS NULL
     OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
     OR cp.folio ILIKE v_term ESCAPE '\'
     OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
     OR COALESCE(cp.proyecto_nombre, c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
     OR cp.item_descripcion ILIKE v_term ESCAPE '\';

  SELECT COUNT(*) INTO v_pendientes_count FROM cuentas_pagar WHERE estado <> 'PAGADO';

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows,
    'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
    'pendientes_count', v_pendientes_count
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_pagar(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cuentas_pagar(text, int, int) TO service_role;
