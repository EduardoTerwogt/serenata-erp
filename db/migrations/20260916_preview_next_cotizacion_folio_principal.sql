-- EF-3 3B-7 (F14): folio principal por RPC en vez de traer toda la tabla
-- `cotizaciones` a Node (`SELECT id FROM cotizaciones` sin filtro/límite).
-- Principio del palomar: con k folios ocupados (existentes + reservas
-- PRINCIPAL activas), el primer hueco libre desde 1 está a lo sumo en
-- k+1 -- generate_series solo necesita recorrer ese rango, nunca la tabla
-- completa. bigint para evitar overflow de int con volumen alto.
-- La rama de complementarias (`folio.ts:96-124`, ya acotada por
-- `.eq('es_complementaria_de', ...)`) queda fuera de alcance de este
-- bloque -- no se toca aquí.
CREATE OR REPLACE FUNCTION public.preview_next_cotizacion_folio_principal()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ocupados AS (
    SELECT substring(id from '^SH(\d+)$')::bigint AS n
    FROM cotizaciones
    WHERE id ~ '^SH\d+$'
    UNION ALL
    SELECT substring(folio from '^SH(\d+)$')::bigint
    FROM cotizacion_folio_reservations
    WHERE kind = 'PRINCIPAL'
      AND consumed_at IS NULL
      AND expires_at > now()
      AND folio ~ '^SH\d+$'
  ),
  candidatos AS (
    SELECT gs AS n
    FROM generate_series(1::bigint, (SELECT COUNT(*) FROM ocupados) + 1) AS gs
  )
  SELECT 'SH' || lpad(candidatos.n::text, 3, '0')
  FROM candidatos
  LEFT JOIN ocupados ON ocupados.n = candidatos.n
  WHERE ocupados.n IS NULL
  ORDER BY candidatos.n
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_next_cotizacion_folio_principal() TO service_role;
