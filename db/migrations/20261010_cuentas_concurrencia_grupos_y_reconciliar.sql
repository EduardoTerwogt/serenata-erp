-- Dos correcciones de concurrencia/costo halladas por el live de CI (frente 2):
--
-- 1. cuentas_pagar_recalcular_grupo (20261008) perdía actualizaciones. Dos
--    transacciones que cambian renglones distintos del mismo grupo calculaban
--    la suma con su propia foto de datos; la segunda en confirmar pisaba a la
--    primera (live: grupo 1500 en vez de 1700). Ahora bloquea las filas de
--    grupo (en orden de id, sin interbloqueos) ANTES de sumar: la suma corre
--    en una sentencia nueva que ya ve lo confirmado por la otra transacción.
--
-- 2. cuentas_conceptos_reconciliar derivaba la base completa dos veces (una por
--    sentido del EXCEPT ALL). Vía PostgREST rige statement_timeout = 8 s y en
--    test (13 mil conceptos) llegó a 6.5 s. Ahora deriva una sola vez.

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_pagar_recalcular_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.grupo_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.grupo_id];
  ELSE
    v_ids := ARRAY[OLD.grupo_id, NEW.grupo_id];
  END IF;

  -- Serializa el recálculo por grupo. Sin este bloqueo la suma usa la foto
  -- previa a la espera y deja el monto de la transacción que confirma último.
  PERFORM 1 FROM cuentas_pagar_grupos g
  WHERE g.id = ANY(v_ids)
  ORDER BY g.id
  FOR UPDATE;

  UPDATE cuentas_pagar_grupos g SET
    monto_total = s.suma,
    updated_at = now()
  FROM (
    SELECT gid, (SELECT COALESCE(SUM(cp.x_pagar), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = gid) AS suma
    FROM unnest(v_ids) AS gid
    WHERE gid IS NOT NULL
  ) s
  WHERE g.id = s.gid AND g.monto_total IS DISTINCT FROM s.suma;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_recalcular_grupo() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_reconciliar()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
DECLARE
  v_keys text[];
  v_h integer;
BEGIN
  WITH d AS MATERIALIZED (SELECT * FROM cuentas_conceptos_derivar(NULL, NULL, NULL)),
       b AS MATERIALIZED (SELECT * FROM cuentas_conceptos_base)
  SELECT array_agg(DISTINCT x.proyecto_key) INTO v_keys
  FROM (
    (SELECT * FROM b EXCEPT ALL SELECT * FROM d)
    UNION ALL
    (SELECT * FROM d EXCEPT ALL SELECT * FROM b)
  ) x;
  IF v_keys IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  FOR v_h IN SELECT DISTINCT hashtext(k) FROM unnest(v_keys) AS k ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(20261010, v_h);
  END LOOP;
  PERFORM cuentas_conceptos_refrescar(v_keys);
  RETURN v_keys;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_reconciliar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_reconciliar() TO service_role;

COMMIT;
