-- plpgsql_check (PLAN.md, B0 / J4).
--
-- Analiza estáticamente las funciones PL/pgSQL: columnas y tablas inexistentes,
-- tipos incompatibles, variables sin usar. Es la red de seguridad de la
-- iniciativa "Simplificación del modelo de datos": un RENAME o DROP COLUMN no
-- avisa si alguna función todavía lee la columna vieja, y esa función fallaría
-- hasta que alguien la ejecute en producción.
--
-- Solo agrega una extensión; no toca tablas, funciones ni datos.
-- El chequeo en sí vive en scripts/db/plpgsql-check.sql (lo corren CI y a mano).

BEGIN;

CREATE EXTENSION IF NOT EXISTS plpgsql_check WITH SCHEMA extensions;

COMMIT;
