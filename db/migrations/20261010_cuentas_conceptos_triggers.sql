-- Frente 2 · A2 (docs/PLAN.md): cuentas_conceptos_base se mantiene fresca sola.
--
-- Cada escritura en una tabla fuente de cuentas_conceptos_derivar encola los
-- proyectos afectados (OLD y NEW) en cuentas_conceptos_pendientes. Un constraint
-- trigger diferido vacía la cola una vez al commit y llama
-- cuentas_conceptos_refrescar: una RPC con muchos statements refresca una vez.
-- Un advisory lock por proyecto serializa transacciones concurrentes sobre el
-- mismo proyecto (sin él, la segunda chocaría con la PK o refrescaría con un
-- snapshot sin los cambios de la primera).
--
-- Operaciones masivas: SET LOCAL serenata.sin_refresco = 'on' desactiva la
-- cola en esa transacción; al final, cuentas_conceptos_reconstruir().

BEGIN;

CREATE TABLE IF NOT EXISTS public.cuentas_conceptos_pendientes (
  proyecto_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS cuentas_conceptos_pendientes_key_idx ON public.cuentas_conceptos_pendientes (proyecto_key);
ALTER TABLE public.cuentas_conceptos_pendientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_conceptos_pendientes FROM PUBLIC, anon, authenticated;

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
    AND NOT EXISTS (SELECT 1 FROM cuentas_conceptos_pendientes p WHERE p.proyecto_key = k);
END;
$$;

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
  WITH d AS (DELETE FROM cuentas_conceptos_pendientes RETURNING proyecto_key)
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

-- Reconstrucción completa (tras una carga masiva con sin_refresco).
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_reconstruir()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(20261010, 0);
  PERFORM cuentas_conceptos_refrescar(
    ARRAY(SELECT proyecto_key FROM cuentas_conceptos_base
          UNION SELECT id FROM proyectos
          UNION SELECT 'sin-proyecto')
  );
END;
$$;

-- Keys de proyecto a partir de ids de cuentas / grupos.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_cobrar(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_cobrar c WHERE c.id = ANY(p_ids));
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_pagar(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.id = ANY(p_ids));
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_keys_grupos(p_ids uuid[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT COALESCE(g.proyecto_id, 'sin-proyecto') FROM cuentas_pagar_grupos g WHERE g.id = ANY(p_ids)
    UNION
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.grupo_id = ANY(p_ids)
  );
$$;

-- Tablas con proyecto_id propio: cuentas_cobrar, cuentas_pagar, cuentas_reaperturas.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proyecto_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.proyecto_id, 'sin-proyecto') END,
    CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.proyecto_id, 'sin-proyecto') END
  ]);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_grupos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.proyecto_id, 'sin-proyecto') END,
      CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.proyecto_id, 'sin-proyecto') END
    ]
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
    ])
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_docs_cobrar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cc uuid[] := ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_cobrar_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_cobrar_id END
  ];
  v_pagos uuid[] := ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.pago_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.pago_id END
  ];
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_cobrar(v_cc || ARRAY(SELECT pc.cuentas_cobrar_id FROM pagos_comprobantes pc WHERE pc.id = ANY(v_pagos)))
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(cuentas_conceptos_keys_cobrar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_cobrar_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_cobrar_id END
  ]));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_docs_pagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_pagar(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuentas_pagar_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuentas_pagar_id END
    ])
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.grupo_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.grupo_id END
    ])
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_pagos_pagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(
    cuentas_conceptos_keys_pagar(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.cuenta_pagar_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.cuenta_pagar_id END
    ])
    || cuentas_conceptos_keys_grupos(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.grupo_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.grupo_id END
    ])
  );
  RETURN NULL;
END;
$$;

-- proyectos: nombre, cliente y fecha de entrega viven en la tabla (el orden se
-- calcula al leer). Las cuentas nuevas o borradas encolan por su cuenta.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proyectos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.proyecto IS NOT DISTINCT FROM NEW.proyecto
     AND OLD.cliente IS NOT DISTINCT FROM NEW.cliente
     AND OLD.fecha_entrega IS NOT DISTINCT FROM NEW.fecha_entrega THEN
    RETURN NULL;
  END IF;
  PERFORM cuentas_conceptos_encolar(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
  ]);
  RETURN NULL;
END;
$$;

-- cotizaciones: margen/fee/iva/utilidad de las APROBADAS del proyecto y
-- total/iva de la cotización de cada cobro (neto sin IVA). Los borradores
-- sin cobro no encolan.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_cotizaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[] := '{}';
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.estado IS NOT DISTINCT FROM NEW.estado
     AND OLD.es_complementaria_de IS NOT DISTINCT FROM NEW.es_complementaria_de
     AND OLD.margen_total IS NOT DISTINCT FROM NEW.margen_total
     AND OLD.fee_agencia IS NOT DISTINCT FROM NEW.fee_agencia
     AND OLD.iva IS NOT DISTINCT FROM NEW.iva
     AND OLD.utilidad_total IS NOT DISTINCT FROM NEW.utilidad_total
     AND OLD.total IS NOT DISTINCT FROM NEW.total THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.estado = 'APROBADA' THEN
    v_keys := v_keys || COALESCE(OLD.es_complementaria_de, OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.estado = 'APROBADA' THEN
    v_keys := v_keys || COALESCE(NEW.es_complementaria_de, NEW.id);
  END IF;
  v_keys := v_keys || ARRAY(
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_cobrar c
    WHERE c.cotizacion_id IN (
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.id END
    )
  );
  PERFORM cuentas_conceptos_encolar(v_keys);
  RETURN NULL;
END;
$$;

-- proveedores: nombre y régimen (retenciones) de grupos y cuentas sueltas.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos_trg_proveedores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM cuentas_conceptos_encolar(ARRAY(
    SELECT COALESCE(c.proyecto_id, 'sin-proyecto') FROM cuentas_pagar c WHERE c.responsable_id = NEW.id
    UNION
    SELECT COALESCE(g.proyecto_id, 'sin-proyecto') FROM cuentas_pagar_grupos g WHERE g.responsable_id = NEW.id
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_cobrar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_cobrar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_reaperturas;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_reaperturas
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyecto_id();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cuentas_pagar_grupos;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_pagar_grupos
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_grupos();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.documentos_cuentas_cobrar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_cobrar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_docs_cobrar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.pagos_comprobantes;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.pagos_comprobantes
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.documentos_cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_docs_pagar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.pagos_cuentas_pagar;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.pagos_cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_pagos_pagar();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.proyectos;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_proyectos();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.cotizaciones;
CREATE TRIGGER trigger_cuentas_conceptos AFTER INSERT OR UPDATE OR DELETE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.cuentas_conceptos_trg_cotizaciones();

DROP TRIGGER IF EXISTS trigger_cuentas_conceptos ON public.proveedores;
CREATE TRIGGER trigger_cuentas_conceptos AFTER UPDATE OF nombre, regimen_fiscal ON public.proveedores
FOR EACH ROW WHEN (OLD.nombre IS DISTINCT FROM NEW.nombre OR OLD.regimen_fiscal IS DISTINCT FROM NEW.regimen_fiscal)
EXECUTE FUNCTION public.cuentas_conceptos_trg_proveedores();

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_encolar(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_procesar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_reconstruir() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos_reconstruir() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_cobrar(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_pagar(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_keys_grupos(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proyecto_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_grupos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_docs_cobrar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_pagos_comprobantes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_docs_pagar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_pagos_pagar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proyectos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_cotizaciones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos_trg_proveedores() FROM PUBLIC, anon, authenticated;

-- Lo escrito entre 20261009 y esta migración: reconstrucción completa.
SELECT public.cuentas_conceptos_reconstruir();

COMMIT;
