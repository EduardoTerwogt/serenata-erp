-- B3 (PLAN.md, F6, K5, L4): un solo cliente por nombre y alta/búsqueda en un viaje.
--
--   - `clientes.nombre_clave` = lower(btrim(nombre)), columna generada con UNIQUE:
--     "ACME" y "acme " dejan de ser dos clientes. (El upsert de supabase-js no
--     acepta un índice de expresión, de ahí la columna.)
--   - `resolver_cliente(nombre)`: INSERT ... ON CONFLICT (nombre_clave) DO UPDATE
--     SET activo = true RETURNING id. Respeta el nombre ya guardado (no lo
--     renombra) y no tiene carrera entre dos guardados simultáneos. Reemplaza el
--     "buscar y luego insertar/actualizar" (3 viajes) del autosave.
--
-- Verificado el 2026-10-01: 0 duplicados por nombre_clave en test y en producción.
-- Aditiva: la columna `clientes.proyectos` se retira en 20261016 (manual) después
-- de desplegar el código que ya no la lee.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nombre_clave text GENERATED ALWAYS AS (lower(btrim(nombre))) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.clientes'::regclass AND conname = 'clientes_nombre_clave_key') THEN
    ALTER TABLE public.clientes ADD CONSTRAINT clientes_nombre_clave_key UNIQUE (nombre_clave);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolver_cliente(p_nombre text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
BEGIN
  IF v_nombre = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO clientes (nombre, activo)
  VALUES (v_nombre, true)
  ON CONFLICT (nombre_clave) DO UPDATE SET activo = true
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolver_cliente(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_cliente(text) TO service_role;

COMMIT;
