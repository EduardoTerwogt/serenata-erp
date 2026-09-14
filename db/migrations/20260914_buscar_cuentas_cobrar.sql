-- EF-3 3B-2: RPC de paginacion/busqueda/totales server-side para Cuentas
-- por Cobrar. Reemplaza el filtrado/paginado en JS sobre el arreglo
-- completo (filterCobrarRows en selectors.ts + getCuentasCobrar() sin
-- limite). Busca sobre los mismos 4 campos que filterCobrarRows
-- (selectors.ts:23-35): cotizacion_id, folio, cliente, proyecto -- con
-- escape de comodines LIKE (%/_) para que un folio literal como "SH_001"
-- no matchee de mas. Llama sync_estados_cuentas_cobrar_vencidas() (3B-1)
-- internamente, por lo que el GET de la ruta deja de invocarla por su
-- cuenta (evita ejecutar el UPDATE completo de la tabla 2 veces por
-- request).
CREATE OR REPLACE FUNCTION public.buscar_cuentas_cobrar(p_search text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
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
  PERFORM sync_estados_cuentas_cobrar_vencidas();

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM cuentas_cobrar cc
    WHERE v_term IS NULL
       OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
       OR cc.folio ILIKE v_term ESCAPE '\'
       OR cc.cliente ILIKE v_term ESCAPE '\'
       OR cc.proyecto ILIKE v_term ESCAPE '\'
    ORDER BY cc.created_at DESC, cc.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t;

  -- total_rows real del filtro (no el de la pagina).
  SELECT COUNT(*) INTO v_total_rows
  FROM cuentas_cobrar cc
  WHERE v_term IS NULL
     OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
     OR cc.folio ILIKE v_term ESCAPE '\'
     OR cc.cliente ILIKE v_term ESCAPE '\'
     OR cc.proyecto ILIKE v_term ESCAPE '\';

  -- totales sobre el filtro aplicado -- mismo redondeo por fila que
  -- sumMontoPendiente/sumMontoPagado sobre cobrarFiltradas hoy.
  SELECT
    ROUND(COALESCE(SUM(GREATEST(cc.monto_total - COALESCE(cc.monto_pagado, 0), 0)), 0), 2),
    ROUND(COALESCE(SUM(cc.monto_pagado), 0), 2)
  INTO v_total_pendiente, v_total_pagado
  FROM cuentas_cobrar cc
  WHERE v_term IS NULL
     OR cc.cotizacion_id ILIKE v_term ESCAPE '\'
     OR cc.folio ILIKE v_term ESCAPE '\'
     OR cc.cliente ILIKE v_term ESCAPE '\'
     OR cc.proyecto ILIKE v_term ESCAPE '\';

  -- pendientes_count sobre la tabla COMPLETA sin filtro -- misma semantica
  -- que countPendingCuentas(cuentasCobrar) hoy, que cuenta sobre el
  -- arreglo sin filtrar, nunca sobre el resultado de busqueda.
  SELECT COUNT(*) INTO v_pendientes_count FROM cuentas_cobrar WHERE estado <> 'PAGADO';

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows,
    'total_monto_pendiente', v_total_pendiente, 'total_monto_pagado', v_total_pagado,
    'pendientes_count', v_pendientes_count
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cuentas_cobrar(text, int, int) TO service_role;
