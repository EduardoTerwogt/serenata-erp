-- Alinea el esquema de test, producción y una BD reconstruida (PLAN.md, B0 / J1, J11).
--
-- Hallazgos de la huella de esquema (scripts/db/esquema-huella.sql) entre
-- serenata-erp-test y producción, ya sin los objetos del frente 2:
--
-- 1. cuentas_pagar.estado: db/migrations/20260410_cuentas_pagar_estados.sql lo
--    declara NOT NULL DEFAULT 'PENDIENTE', pero producción lo tenía NULLABLE (la
--    columna ya existía y `ADD COLUMN IF NOT EXISTS` no la tocó). Producción:
--    0 nulos en 89 filas, así que se aplica la restricción que el repo ya
--    prometía (el CHECK de estados no la cubre: NULL pasa un CHECK).
-- 2. Nombres de dos restricciones únicas: producción usa `historial_unique` y
--    `productos_descripcion_unique`; las bases reconstruidas desde las
--    migraciones (test, fresh-db) usan los nombres autogenerados. Se deja el
--    nombre de producción, que es la verdad. Renombrar la restricción renombra
--    su índice. En producción es un no-op.
--
-- Idempotente. Límites de bloqueo por la regla M3 de la iniciativa.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cuentas_pagar ALTER COLUMN estado SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.historial_responsable'::regclass
             AND conname = 'historial_responsable_responsable_id_cotizacion_id_rol_en_p_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.historial_responsable'::regclass
                     AND conname = 'historial_unique') THEN
    ALTER TABLE public.historial_responsable
      RENAME CONSTRAINT historial_responsable_responsable_id_cotizacion_id_rol_en_p_key TO historial_unique;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.productos'::regclass
             AND conname = 'productos_descripcion_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.productos'::regclass
                     AND conname = 'productos_descripcion_unique') THEN
    ALTER TABLE public.productos RENAME CONSTRAINT productos_descripcion_key TO productos_descripcion_unique;
  END IF;
END
$$;

COMMIT;
