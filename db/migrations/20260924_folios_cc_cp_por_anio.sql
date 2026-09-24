-- Folios de Cuentas por Cobrar / por Pagar con el año en curso y consecutivo
-- que reinicia cada año (decisión del usuario 2026-09-24): CC-2027-00001 es el
-- primer folio de 2027. Antes, generate_folio_cc/cp usaban seq_cc_2026 /
-- seq_cp_2026 y el literal 'CC-2026-' / 'CP-2026-' (20260410_*), así que en
-- 2027 seguirían saliendo folios "2026".
--
-- 1. folio_contadores (serie, anio) -> ultimo. El siguiente número se toma con
--    un upsert atómico (el row lock serializa inserts concurrentes de la
--    misma serie; a diferencia de nextval, un rollback no deja huecos).
-- 2. El año se calcula en America/Mexico_City (Serenata opera en CDMX): un
--    registro del 31-dic a las 20:00 locales no debe salir con el año siguiente.
--    p_momento (default now()) existe para poder probar el cambio de año.
-- 3. El número se rellena a 5 dígitos SIN truncar: LPAD(n, 5) cortaba a 5
--    caracteres los números >= 100000 (test ya va en CP-2026-16xxx).
-- 4. 2026 arranca desde el valor actual de la secuencia vieja (o del folio
--    más alto, lo que sea mayor), así que no hay colisiones con la UNIQUE
--    (folio) existente. Las secuencias viejas quedan sin uso; no se borran.
-- 5. siguiente_folio es SECURITY DEFINER (search_path fijo): escribe
--    folio_contadores sin depender de los grants/RLS de quien inserta.
--    EXECUTE solo para service_role/postgres: antes anon/authenticated podían
--    llamar generate_folio_* por RPC y consumir folios.
--
-- Mismas firmas y tipo de retorno (VARCHAR) que antes; los triggers
-- auto_generate_folio_cc/cp no cambian. Idempotente y reproducible desde una
-- base vacía (en CI las secuencias existen, sin filas -> contadores en 0).

BEGIN;

CREATE TABLE IF NOT EXISTS public.folio_contadores (
  serie  TEXT    NOT NULL CHECK (serie IN ('CC', 'CP')),
  anio   INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2999),
  ultimo INTEGER NOT NULL CHECK (ultimo >= 0),
  PRIMARY KEY (serie, anio)
);

COMMENT ON TABLE public.folio_contadores IS
  'Consecutivo de folios CC/CP por año (reinicia cada año). Solo lo escribe siguiente_folio().';

ALTER TABLE public.folio_contadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.folio_contadores FROM anon, authenticated;

-- Punto de partida de 2026: lo ya emitido por las secuencias viejas.
INSERT INTO public.folio_contadores (serie, anio, ultimo)
SELECT 'CC', 2026, GREATEST(
  (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM public.seq_cc_2026),
  COALESCE((SELECT MAX(substring(folio FROM '^CC-2026-(\d+)$')::INTEGER) FROM public.cuentas_cobrar), 0)
)
ON CONFLICT (serie, anio) DO NOTHING;

INSERT INTO public.folio_contadores (serie, anio, ultimo)
SELECT 'CP', 2026, GREATEST(
  (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM public.seq_cp_2026),
  COALESCE((SELECT MAX(substring(folio FROM '^CP-2026-(\d+)$')::INTEGER) FROM public.cuentas_pagar), 0)
)
ON CONFLICT (serie, anio) DO NOTHING;

CREATE OR REPLACE FUNCTION public.siguiente_folio(p_serie TEXT, p_momento TIMESTAMPTZ DEFAULT now())
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anio INTEGER := EXTRACT(YEAR FROM (p_momento AT TIME ZONE 'America/Mexico_City'))::INTEGER;
  v_num  INTEGER;
BEGIN
  INSERT INTO folio_contadores (serie, anio, ultimo)
  VALUES (p_serie, v_anio, 1)
  ON CONFLICT (serie, anio) DO UPDATE SET ultimo = folio_contadores.ultimo + 1
  RETURNING ultimo INTO v_num;

  RETURN p_serie || '-' || v_anio || '-' || LPAD(v_num::TEXT, GREATEST(5, length(v_num::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_folio_cc()
RETURNS VARCHAR
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN siguiente_folio('CC');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_folio_cp()
RETURNS VARCHAR
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN siguiente_folio('CP');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.siguiente_folio(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_folio_cc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_folio_cp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_folio(TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_folio_cc() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_folio_cp() TO service_role;

COMMIT;
