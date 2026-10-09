#!/usr/bin/env bash
# Perfil por nodos de `cuentas_conceptos` (#110 B0): extrae el cuerpo VIGENTE de la función de la propia BD, sustituye los parámetros
# por literales (así el planificador ve los valores, igual que con force_custom_plan) y corre EXPLAIN (ANALYZE, BUFFERS).
#   scripts/db/cuentas-perfil.sh [bd] [anio|NULL] [hoy] [objetivo|NULL] [id|NULL]
# Ej.: scripts/db/cuentas-perfil.sh serenata_local 2000     (año vacío: separa el costo fijo)
#      scripts/db/cuentas-perfil.sh serenata_local 2026
# La salida va a stdout; para resumirla por nodo: | grep -E "CTE|Buffers" .
set -euo pipefail
DB="${1:-serenata_local}"; ANIO="${2:-2026}"; HOY="${3:-2026-10-15}"; OBJ="${4:-NULL}"; ID="${5:-NULL}"
lit() { if [ "$1" = "NULL" ]; then echo "NULL::text"; else echo "'$1'"; fi; }
CUERPO=$(psql -d "$DB" -At -c "select prosrc from pg_proc where oid = 'cuentas_conceptos(integer,date,text,text)'::regprocedure")
SQL=$(printf '%s\n' "$CUERPO" | awk '/RETURN QUERY/{f=1;next} /^END;/{f=0} /IF v_masivo THEN PERFORM/{f=0} f' \
  | sed -E "s/\bp_year\b/$( [ "$ANIO" = NULL ] && echo 'NULL::int' || echo "$ANIO" )/g; s/\bp_hoy\b/'$HOY'::date/g; s/\bp_objetivo\b/$(lit "$OBJ")/g; s/\bp_id\b/$(lit "$ID")/g" \
  | sed -E '$ s/;[[:space:]]*$//')
# Lectura masiva (sin objetivo): igual que la función, sin lazos anidados (ver 20261039).
NL=""; [ "$OBJ" = "NULL" ] && NL="SET enable_nestloop = off"; [ -n "${NESTLOOP:-}" ] && NL="SET enable_nestloop = $NESTLOOP"
psql -d "$DB" -q -c "SET work_mem='16MB'" -c "${NL:-SET enable_nestloop = on}" -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING ON, SUMMARY ON) SELECT count(*) FROM ($SQL) q"
