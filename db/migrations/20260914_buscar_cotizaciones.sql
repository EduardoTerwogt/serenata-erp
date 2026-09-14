-- EF-3 3B-4: RPC de paginacion/busqueda/conteos server-side para
-- Cotizaciones. Reemplaza el filtrado en JS sobre getCotizaciones()/
-- fetchQuotationsList() sin limite. Busca sobre los mismos 5 campos que
-- app/cotizaciones/page.tsx:70-76 (id, cliente, proyecto de la propia
-- cotizacion + descripcion/responsable_nombre de sus items_cotizacion via
-- EXISTS), con escape de %/_ (ESCAPE '\'). items_count por fila reemplaza
-- (c.items || []).length que QuotationCopyItemsModal.tsx calculaba sobre
-- el array completo. counts_by_estado se calcula sobre la tabla COMPLETA
-- sin filtro de busqueda ni de estado -- misma semantica que los tabs de
-- page.tsx:95-99, que cuentan sobre cotizaciones completo, nunca sobre
-- filtradas.
CREATE OR REPLACE FUNCTION public.buscar_cotizaciones(p_search text DEFAULT NULL, p_estado text DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 10)
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
  v_counts_by_estado jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      c.id, c.cliente, c.proyecto, c.total, c.estado, c.created_at,
      (SELECT COUNT(*) FROM items_cotizacion i WHERE i.cotizacion_id = c.id) AS items_count
    FROM cotizaciones c
    WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
      AND (
        v_term IS NULL OR
        c.id ILIKE v_term ESCAPE '\' OR
        c.cliente ILIKE v_term ESCAPE '\' OR
        c.proyecto ILIKE v_term ESCAPE '\' OR
        EXISTS (
          SELECT 1 FROM items_cotizacion i
          WHERE i.cotizacion_id = c.id
            AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
        )
      )
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t;

  -- total_rows real del filtro (busqueda+estado), no el de la pagina.
  SELECT COUNT(*) INTO v_total_rows
  FROM cotizaciones c
  WHERE (p_estado IS NULL OR p_estado = 'TODAS' OR c.estado = p_estado)
    AND (
      v_term IS NULL OR
      c.id ILIKE v_term ESCAPE '\' OR
      c.cliente ILIKE v_term ESCAPE '\' OR
      c.proyecto ILIKE v_term ESCAPE '\' OR
      EXISTS (
        SELECT 1 FROM items_cotizacion i
        WHERE i.cotizacion_id = c.id
          AND (i.descripcion ILIKE v_term ESCAPE '\' OR i.responsable_nombre ILIKE v_term ESCAPE '\')
      )
    );

  SELECT jsonb_build_object(
    'TODAS', COUNT(*),
    'BORRADOR', COUNT(*) FILTER (WHERE estado = 'BORRADOR'),
    'EMITIDA', COUNT(*) FILTER (WHERE estado = 'EMITIDA'),
    'APROBADA', COUNT(*) FILTER (WHERE estado = 'APROBADA'),
    'CANCELADA', COUNT(*) FILTER (WHERE estado = 'CANCELADA')
  ) INTO v_counts_by_estado
  FROM cotizaciones;

  RETURN jsonb_build_object(
    'rows', v_rows, 'total_rows', v_total_rows, 'counts_by_estado', v_counts_by_estado
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_cotizaciones(text, text, int, int) TO service_role;
