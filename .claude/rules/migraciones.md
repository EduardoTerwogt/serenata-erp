---
paths:
  - "db/migrations/**"
---

- Las migraciones aplicadas son **append-only**. Nunca modificar una que ya corrió
  en producción — agregar una nueva encima.
  - **Excepción estrecha:** si algo se aplicó manualmente en producción y el
    archivo se quedó corto, se puede editar la migración vieja **solo** para que
    el texto quede igual a lo que la base ya tiene — nunca para cambiar
    comportamiento. Requiere: (1) el statement agregado es idempotente y seguro
    de re-ejecutar desde un Postgres vacío (el job `Migrations` lo va a correr
    igual en cada push), y (2) no afecta ni pone en riesgo otro feature
    existente. Si hay cualquier duda de que esto se cumple, agregar una
    migración nueva en vez de editar la vieja.
- Todo cambio aplicado a producción se guarda aquí como archivo numerado y se commitea.
- `SECURITY DEFINER` debe fijar `search_path`. Revisar permisos `EXECUTE`: toda función nueva de uso interno lleva
  `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role` y se verifica en test (`aclexplode(proacl)`:
  solo el dueño y `service_role`).
- Para triggers usa `CREATE OR REPLACE TRIGGER` (PG ≥ 14), no `DROP TRIGGER` + `CREATE`: el MCP retiene todo SQL con `DROP`/`DELETE`.
- **Toda función nueva fija `search_path`** (`SET search_path = public, pg_temp`
  como mínimo), sea o no `SECURITY DEFINER` — el advisor la marca WARN si no.
- `pg_trgm` vive en `extensions` desde 2026-09-24: una función que use
  `similarity()`/operadores trigram necesita `public, extensions, pg_temp` en su
  `search_path` (o calificar `extensions.similarity`).
- El upsert de partidas va siempre acotado por `cotizacion_id`, nunca genérico.
- El job `Migrations` de CI reconstruye el schema desde un Postgres vacío en cada
  push: si una migración no es reproducible desde cero, ahí falla.
- Probar primero en `serenata-erp-test` (ref `ozrtsludmcguvgqdjicn`), luego producción
  (ref `ytlyphlgyhgztkfxwojt`, `us-east-2`, desde 2026-10-06, #124).
- **Producción no lleva `20260915_loadtest_runs.sql`.** Esa migración crea
  `loadtest_runs`, y los scripts de siembra y escala usan su existencia para decidir
  "esto es test"; en producción tiene que seguir sin existir. Al aplicar migraciones
  nuevas a producción, esa se omite (el historial de producción no la tiene).
- Contexto completo: `docs/decisions/005-migraciones-manuales-append-only.md`.
- **Aplicar a producción por MCP (2026-10-08, #123):** `apply_migration` expira a los 60 s y **retiene todo SQL con
  `DELETE`/`DROP`** esperando una confirmación interactiva que nadie ve (síntoma: expira sin error, la función no cambia). Eso lo corre
  una persona en el SQL Editor, un bloque por archivo y completo. Los archivos grandes (≥ 50 KB, varias funciones) el SQL Editor los
  cortó a media función (`unterminated dollar-quoted string`): se aplican por MCP en partes de una o pocas funciones y **nunca se da
  por buena una migración por el `success`**: comparar `md5(prosrc)` de cada función contra el cuerpo extraído del archivo
  (marcadores `$function$`, no números de línea), más `pg_get_function_identity_arguments`, `proconfig` y ACL, el esquema contra test
  y `auditar_consistencia()` = 0. Se aplican en orden numérico y, tras las que quitan objetos (M3), se verifica que ya no existan.
- **Autorización:** dentro de un plan ya aprobado, aplicar y confirmar sin pausar
  (incluido un borrado sin reemplazo) salvo regla de negocio no clara. Fuera de un
  plan, sigue la regla de 005. Ver `CLAUDE.md` → "Autonomía de ejecución" /
  "Supabase" y `docs/decisions/012-autonomia-supabase-en-plan-aprobado.md`.
- **Derivación de Cuentas (`cuentas_conceptos`):** es plpgsql con `plan_cache_mode = force_custom_plan` y `migrations.yml`
  lo exige. Una función `LANGUAGE sql` se planea sin los valores de sus parámetros: con filtros `p_x IS NULL OR …` hace
  una sonda de índice por fila (309,077 buffers contra 7,965). No la vuelvas SQL; otra función de lectura con parámetros
  opcionales va igual. Mide por buffers (`EXPLAIN (ANALYZE, BUFFERS)`), no por ms: test y producción son Micro y el
  tiempo varía 5× entre corridas. Prueba RPCs también bajo las restricciones de PostgREST (`pg_safeupdate` rechaza
  `DELETE` sin `WHERE`; `statement_timeout` y `lock_timeout` de 8 s).
