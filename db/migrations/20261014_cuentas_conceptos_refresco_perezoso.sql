-- Frente 2 · A2, rediseño (docs/PLAN.md): el recálculo sale del camino de
-- escritura.
--
-- Con 20261010 cada transacción de escritura refrescaba cuentas_conceptos_base
-- al commit, serializada por proyecto. Medido en test (pg_stat_statements):
-- 713 llamadas, media 141 ms, máximo 2.9 s por commit. Los specs con muchas
-- escrituras seguidas o concurrentes (B7) pasaron de 5–8 s a >30 s.
--
-- Ahora escribir solo MARCA el proyecto (un INSERT en la cola) y leer
-- SINCRONIZA primero: cuentas_conceptos_sincronizar() refresca los proyectos
-- pendientes. La tabla, cuentas_conceptos_refrescar y los triggers de origen
-- no cambian.
--
-- Correctitud:
--  * La cola solo deduplica dentro de la misma transacción (xmin), nunca contra
--    filas ya confirmadas: si el lector ya borró la fila pero aún no termina de
--    refrescar, una escritura posterior sigue quedando marcada.
--  * El lector toma un advisory lock por proyecto (orden fijo) antes de
--    borrar de la cola; el segundo lector espera, no encuentra nada y sigue.
--  * El DELETE lleva WHERE (pg_safeupdate, ver 20261012).

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_encolar(p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('serenata.sin_refresco', true) = 'on' THEN
    RETURN;
  END IF;
  INSERT INTO cuentas_conceptos_pendientes (proyecto_key)
  SELECT DISTINCT k FROM unnest(p_keys) AS k
  WHERE k IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM cuentas_conceptos_pendientes p
      WHERE p.proyecto_key = k AND p.xmin::text = (txid_current() % 4294967296)::text
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_sincronizar()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[];
  v_done text[];
  v_h integer;
BEGIN
  SELECT array_agg(DISTINCT proyecto_key) INTO v_keys FROM cuentas_conceptos_pendientes;
  IF v_keys IS NULL THEN
    RETURN 0;
  END IF;
  -- Orden fijo de adquisición: sin deadlocks entre lectores.
  FOR v_h IN SELECT DISTINCT hashtext(k) FROM unnest(v_keys) AS k ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(20261010, v_h);
  END LOOP;
  -- Tras el lock, otro lector pudo haberlos refrescado ya: solo los que borra este.
  WITH d AS (DELETE FROM cuentas_conceptos_pendientes WHERE proyecto_key = ANY(v_keys) RETURNING proyecto_key)
  SELECT array_agg(DISTINCT proyecto_key) INTO v_done FROM d;
  IF v_done IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM cuentas_conceptos_refrescar(v_done);
  RETURN cardinality(v_done);
END;
$$;

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_procesar ON public.cuentas_conceptos_pendientes;
DROP FUNCTION IF EXISTS public.cuentas_conceptos_procesar();

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_sincronizar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_sincronizar() TO service_role;

-- Lo marcado hasta ahora (nada en condiciones normales).
SELECT public.cuentas_conceptos_sincronizar();

COMMIT;
