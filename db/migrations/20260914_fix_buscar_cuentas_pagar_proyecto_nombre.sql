-- EF-3 3B-3 fix: buscar_cuentas_pagar (20260914_buscar_cuentas_pagar.sql)
-- referenciaba cp.proyecto_nombre asumiendo que existia como columna
-- propia de cuentas_pagar (igual que el repositorio JS getCuentasPagar()
-- parecia sugerir con `row.proyecto_nombre || row.cotizaciones?.proyecto
-- || row.proyectos?.proyecto`). Confirmado contra el schema real
-- (information_schema.columns) que cuentas_pagar NO tiene columna
-- proyecto_nombre -- es un campo puramente derivado en JS de los JOINs a
-- cotizaciones/proyectos, nunca una columna propia. PL/pgSQL no valida las
-- columnas referenciadas dentro del cuerpo de una funcion al crearla
-- (CREATE OR REPLACE FUNCTION corrio sin error), asi que el bug solo
-- aparecio en runtime -- lo encontro el job `live` de CI al ejercitar la
-- app real. Corrige a COALESCE(c.proyecto, p.proyecto), sin la columna
-- inexistente, en las 3 queries que la referenciaban (fila+busqueda,
-- total_rows, totales).
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
  SELECT COALESCE(jsonb_agg(t.row_json ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb), COUNT(*) OVER ()
  INTO v_rows, v_total_rows
  FROM (
    SELECT to_jsonb(cp) || jsonb_build_object(
      'proyecto_nombre', COALESCE(c.proyecto, p.proyecto)
    ) AS row_json, cp.created_at, cp.id
    FROM cuentas_pagar cp
    LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE v_term IS NULL
       OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
       OR cp.folio ILIKE v_term ESCAPE '\'
       OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
       OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
       OR cp.item_descripcion ILIKE v_term ESCAPE '\'
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t
  LIMIT 1;

  SELECT COUNT(*) INTO v_total_rows
  FROM cuentas_pagar cp
  LEFT JOIN cotizaciones c ON c.id = cp.cotizacion_id
  LEFT JOIN proyectos p ON p.id = cp.proyecto_id
  WHERE v_term IS NULL
     OR cp.cotizacion_id ILIKE v_term ESCAPE '\'
     OR cp.folio ILIKE v_term ESCAPE '\'
     OR cp.responsable_nombre ILIKE v_term ESCAPE '\'
     OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
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
     OR COALESCE(c.proyecto, p.proyecto) ILIKE v_term ESCAPE '\'
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
