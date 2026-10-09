#!/usr/bin/env bash
# Reconstruye la BD local de verificación (#110 B0): bootstrap + todas las migraciones de db/migrations/ en orden.
#   scripts/db/local-up.sh [nombre_bd]      (default: serenata_local; la borra y la recrea)
# Requiere un Postgres 16 corriendo y un usuario con permiso de CREATE DATABASE (PGUSER/PGHOST/… del entorno).
# `plpgsql_check` solo se crea si el paquete está instalado (`apt-get install postgresql-16-plpgsql-check`); si no, se omite su
# CREATE EXTENSION y la guarda corre únicamente en CI.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-serenata_local}"
dropdb --if-exists "$DB"
createdb "$DB"
# Como en Supabase: `extensions` en el search_path de la BD (operadores trigram sin calificar).
# Supabase trae jit = off (verificado en test, PG 17.11): con JIT activo, una consulta grande de Cuentas perdía ~9 s compilando.
psql -d "$DB" -q -c "ALTER DATABASE \"$DB\" SET jit = off"
psql -d "$DB" -q -c "ALTER DATABASE \"$DB\" SET search_path = \"\$user\", public, extensions"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f scripts/db/local-bootstrap.sql
# Producción no lleva 20260915_loadtest_runs.sql, pero aquí sí hace falta para que `escala-generador.sql` se reconozca como BD de pruebas.
TIENE_CHECK=$(psql -d "$DB" -Atc "select 1 from pg_available_extensions where name = 'plpgsql_check'")
for f in $(ls db/migrations/*.sql | sort); do
  if [ -z "$TIENE_CHECK" ] && grep -q "CREATE EXTENSION IF NOT EXISTS plpgsql_check" "$f"; then
    echo "-- omitida (sin plpgsql_check local): $f"
    continue
  fi
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "FALLÓ: $f" >&2; exit 1; }
done
echo "OK: $DB reconstruida."
