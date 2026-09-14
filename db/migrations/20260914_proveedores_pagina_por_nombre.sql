-- EF-3 3B-6: lectura interna completa vía keyset -- Proveedores
--
-- getProveedores() sin límite; volumen real 10, objetivo de capacidad 1,000
-- (CLAUDE.md), justo en el borde del cap real de PostgREST (max_rows=1000,
-- supabase/config.toml:18). RPC parametrizada con comparación por tupla
-- nativa de Postgres -- deja que el propio ORDER BY nombre decida el orden,
-- sin reimplementar collation en Node ni interpolar texto en un filtro
-- .or() (que trataría `,`/`(`/`)` en un nombre como sintaxis reservada).
CREATE OR REPLACE FUNCTION public.proveedores_pagina_por_nombre(
  p_cursor_nombre text DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_page_size int DEFAULT 500
)
RETURNS SETOF proveedores
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM proveedores
  WHERE activo = true
    AND (
      p_cursor_nombre IS NULL
      OR (nombre, id) > (p_cursor_nombre, p_cursor_id)
    )
  ORDER BY nombre ASC, id ASC
  LIMIT p_page_size;
$$;

REVOKE EXECUTE ON FUNCTION public.proveedores_pagina_por_nombre(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proveedores_pagina_por_nombre(text, uuid, int) TO service_role;
