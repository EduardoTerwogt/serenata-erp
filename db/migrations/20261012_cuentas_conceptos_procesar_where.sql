-- Fix de 20261010 (frente 2 · A2): Supabase carga pg_safeupdate en las
-- conexiones de PostgREST, que rechaza DELETE sin WHERE ("21000 DELETE
-- requires a WHERE clause"). cuentas_conceptos_procesar vaciaba la cola así,
-- y toda escritura en una tabla fuente desde la app fallaba al commit. Las
-- pruebas vía rol postgres no lo detectaron; el job live sí.
--
-- Mismo cuerpo con un WHERE que no filtra nada (proyecto_key es NOT NULL).

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_procesar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[];
  v_h integer;
BEGIN
  WITH d AS (DELETE FROM cuentas_conceptos_pendientes WHERE proyecto_key IS NOT NULL RETURNING proyecto_key)
  SELECT array_agg(DISTINCT proyecto_key) INTO v_keys FROM d;
  IF v_keys IS NULL THEN
    RETURN NULL;
  END IF;
  -- Orden fijo de adquisición: sin deadlocks entre transacciones.
  FOR v_h IN SELECT DISTINCT hashtext(k) FROM unnest(v_keys) AS k ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(20261010, v_h);
  END LOOP;
  PERFORM cuentas_conceptos_refrescar(v_keys);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_procesar() FROM PUBLIC, anon, authenticated;

COMMIT;
