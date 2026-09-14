-- EF-3 3B-11: paginacion/busqueda server-side -- Ordenes de pago
--
-- getOrdenesPago() (lib/server/repositories/cuentas-pagar.ts) sin limite
-- explicito. Unico consumidor confirmado:
-- app/api/cuentas-pagar/ordenes-historial/route.ts (GET sin querystring,
-- sin filtro de texto -- el unico cambio de contrato es paginacion).
CREATE OR REPLACE FUNCTION public.buscar_ordenes_pago(p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 200);
  v_page int := GREATEST(p_page, 1);
  v_rows jsonb;
  v_total_rows bigint;
BEGIN
  -- jsonb_agg(t) sin ORDER BY propio no garantiza el orden de la
  -- subconsulta -- el paginado de esta RPC depende de que la pagina N
  -- siempre muestre las mismas filas en el mismo orden que el cliente
  -- espera (fecha_generacion desc, id desc).
  SELECT COALESCE(jsonb_agg(t ORDER BY t.fecha_generacion DESC, t.id DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by, created_at
    FROM ordenes_pago
    ORDER BY fecha_generacion DESC, id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) t;
  SELECT COUNT(*) INTO v_total_rows FROM ordenes_pago;
  RETURN jsonb_build_object('rows', v_rows, 'total_rows', v_total_rows);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_ordenes_pago(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_ordenes_pago(int, int) TO service_role;
