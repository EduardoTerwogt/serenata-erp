-- Frente 2 · A2 (docs/PLAN.md): vuelve el refresco de cuentas_conceptos_base al
-- commit de cada escritura, y se retira el refresco diferido de 20261014.
--
-- Por qué se descarta el refresco al leer (20261014), medido en CI:
--  * la frescura dependía de que cada lector sincronizara: el spec de paridad
--    SQL llama las funciones directo y vio filas de un proyecto ya borrado;
--  * el viaje extra por lectura se comía margen del p95 (963 y 1046 ms vs 800).
-- Con el refresco al commit la tabla está siempre al día, nada puede leer datos
-- viejos y las lecturas no sincronizan. Costo: ~140 ms de media por escritura
-- (hasta ~3 s en picos), medido en test con pg_stat_statements.
--
-- cuentas_conceptos_procesar es la de 20261012 (DELETE con WHERE por
-- pg_safeupdate). La cola vive y muere dentro de la misma transacción, por eso
-- el dedupe por xmin de cuentas_conceptos_encolar (20261014) sigue siendo correcto.

BEGIN;

-- Lo que hubiera quedado marcado con el esquema diferido.
SELECT public.cuentas_conceptos_sincronizar();

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

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos_procesar ON public.cuentas_conceptos_pendientes;
CREATE CONSTRAINT TRIGGER trigger_cuentas_conceptos_procesar
AFTER INSERT ON public.cuentas_conceptos_pendientes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_procesar();

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_procesar() FROM PUBLIC, anon, authenticated;

-- Un solo mecanismo: el sincronizar al leer ya no se usa.
DROP FUNCTION IF EXISTS public.cuentas_conceptos_sincronizar();

COMMIT;
