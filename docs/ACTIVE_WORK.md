# Trabajo activo

**Última actualización:** 2026-09-24 (sesión 7, advisor WARN de Supabase)

## Estado

**`docs/PLAN.md` — Vacío.** Sesión de un solo bloque (ROADMAP → "Después"):
cerrar los 11 WARN de seguridad del advisor. **PR
[#91](https://github.com/EduardoTerwogt/serenata-erp/pull/91) mergeado a
`main` (`fe5e4fe`)**; migración aplicada en test y producción. CI del PR en
verde en el head `2b23b63`: `test`, `fresh-db`, `smoke-and-critical`,
`live` y Preview de Vercel.

## Sesión 7 — advisor sin WARN

- **Migración** `db/migrations/20260924_advisor_search_path_pg_trgm.sql`:
  `ALTER EXTENSION pg_trgm SET SCHEMA extensions` (owner `supabase_admin`,
  pero `postgres` puede moverla — probado con rollback antes) y
  `ALTER FUNCTION … SET search_path` en las 10 funciones, **sin reescribir
  cuerpos** (decisión 005). `match_proveedor_por_nombre` lleva
  `public, extensions, pg_temp` (único llamador trigram de la app,
  verificado en `pg_proc`); las otras 9, `public, pg_temp`.
- **Verificado en test:** advisor 0 WARN; `match_proveedor_por_nombre`
  con hash idéntico antes/después (150 filas); `EXPLAIN … ILIKE` sigue en
  `idx_responsables_nombre_gin`; 3 GIN válidos; INSERT en cuentas CC/CP
  genera folio; trigger `updated_at` pisa el valor en las 4 tablas
  (transacciones con rollback).
- **Verificado en prod:** advisor 0 WARN (solo INFO
  `rls_enabled_no_policy`, esperado); match idéntico (9 filas); `pg_trgm`
  en `extensions`; 3 GIN válidos; `updated_at` OK en cuentas CC/CP y
  `service_templates` (`planeacion_event_notas` vacía en prod). Los folios
  **no** se probaron con INSERT en prod a propósito: `nextval` no se revierte
  con rollback y dejaría huecos en la numeración; mismo cuerpo que en test.
- Local: `tsc` limpio, lint 0 errores, `npm test` 963/963.
- Nuevo en ROADMAP → "Después": folios CC/CP con año 2026 fijo.
- Gotcha nuevo en `ARCHITECTURE.md` y regla en
  `.claude/rules/migraciones.md`: `pg_trgm` en `extensions`; toda función
  nueva fija `search_path`.

## Pasos manuales (arrastrados de la sesión 6, PR #90)

- **M1 — `NEXTAUTH_SECRET`: ✅ (2026-09-24).** Vía Vercel MCP quedó solo
  en Development (el MCP no puede borrar variables); redeploy de producción
  `dpl_FKAT3A1MXA3cXGWGYu2pFZqnTZ4e` y Preview
  `dpl_CJgsMXDc71gCzyWqM1y7qcHpmxQG`. Verificado por el usuario: sesiones
  abiertas de staff y Portal en prod sobrevivieron; login/logout OK en prod
  y Preview. **Falta (usuario, cuando quiera):** borrar la entrada restante
  de Development en el dashboard — no la lee nada.
- **M2 — auditoría de entornos: ✅ corregido y verificado (2026-09-24).**
  Hallazgo: en Vercel `serenata-erp`, URL/anon/service_role de Supabase eran
  una sola entrada para Production+Preview+Development apuntando a **prod**
  (los Previews leían y escribían producción). Fix: esas 3 quedaron en
  Production+Development (prod) y Preview tiene entradas propias hacia
  `serenata-erp-test` (`ozrtsludmcguvgqdjicn`); el usuario cargó la
  service_role y el `SUPABASE_JWT_SECRET` legacy de test en Preview.
  Redeploy de Preview `dpl_7aXwSwcM5tXchu5hB9e7ByvPARDJ`. Verificado: un
  usuario de prod ya no entra al Preview; con
  `prueba-manual@serenata.test` (usuario creado solo en test) el login y la
  cotización generan tráfico en los edge logs de **test** (`usuarios`,
  `cotizaciones`, RPCs, WebSocket de Realtime 101). **Google separado
  también (decisión del usuario):** `GOOGLE_DRIVE_FOLDER_ID`,
  `GOOGLE_DRIVE_FOLDER_ID_CUENTAS`, `GOOGLE_SHEETS_SPREADSHEET_ID`,
  `GOOGLE_CALENDAR_ID` y `GOOGLE_DRIVE_REFRESH_TOKEN` quedaron solo en
  Production+Development; Preview tiene las 2 carpetas de Drive apuntando a
  la carpeta de test de CI (`DRIVE_TEST_FOLDER_ID`) y **sin** Sheets ni
  Calendar (el sync falla explícito "no configurado"; `GOOGLE_CALENDAR_ID`
  no lo lee ningún código hoy). `GOOGLE_CLIENT_ID/SECRET` siguen compartidos
  (misma app OAuth). **Drive en Preview queda deshabilitado a propósito**
  (sin `GOOGLE_DRIVE_REFRESH_TOKEN` en Preview: el usuario no tiene el valor
  de `GOOGLE_DRIVE_REFRESH_TOKEN_TEST`; `getGoogleEnv()` devuelve null y la
  subida falla explícito). Habilitarlo se resuelve dentro de V2: generar un
  token nuevo vía `/api/integrations/drive/authorize` (callback de prod, solo
  muestra el token, no lo persiste) y una carpeta de test accesible con ese
  token (scope `drive.file`). Redeploy de Preview
  `dpl_8LhZdXq6TKh49m3GkJGtqrs11uNm`.
  Usuarios de prueba solo en test para V1: `prueba-manual@serenata.test` y
  `prueba-manual-2@serenata.test` (contraseñas entregadas al usuario en la
  sesión, no en el repo). La autorización del canal privado de Realtime en
  Preview se confirma con V1.
- **V1 — Presence en Preview real: ✅ (2026-09-24).** Probado por el
  usuario con `prueba-manual@` y `prueba-manual-2@serenata.test` en el
  Preview `dpl_8LhZdXq6TKh49m3GkJGtqrs11uNm` (ya contra test): la
  colaboración funciona. El usuario vio un "ligero bug, nada grave" y
  decidió dejarlo así: el aviso "X está editando" no se quita en B cuando
  A sale de la cotización (repro completo en ROADMAP → "Después").
- **V2 — Google: ✅ cerrado (2026-09-24).** (a) **No aplica:** la app no
  tiene login con Google — `auth.ts` solo usa `Credentials` (email +
  contraseña); el ítem venía de un supuesto que el código no respalda.
  (b) Drive en producción funciona: subidas reales registradas en prod hasta
  el 2026-09-21 (`proveedor_documentos`), `documentos_cuentas_pagar` hasta
  el 19-sep; el token de prod (`GOOGLE_DRIVE_REFRESH_TOKEN`, Production +
  Development) no se tocó. Drive en **Preview queda apagado por decisión
  del usuario** (sin refresh token en Preview → error explícito "Google
  Drive no configurado"); Drive real contra test ya lo cubre el job `live`
  de CI con su propio token y carpeta.
- **Housekeeping:** borrar ramas remotas ya mergeadas (GitHub → Branches →
  Merged); el proxy de esta sesión no lo permite.

## Deuda técnica

- Drive deshabilitado en Preview a propósito (ver V2). Si algún día hace
  falta, generar token vía `/api/integrations/drive/authorize` con una
  cuenta de pruebas + carpeta de test accesible con scope `drive.file`.

## Siguiente paso

Pasos manuales cerrados (M1, M2, V1 y V2).
Folios CC/CP por año: migración `20260924_folios_cc_cp_por_anio.sql`
(aplicada y verificada en test; PR abierto, falta CI + prod). Queda el
housekeeping de ramas y borrar `NEXTAUTH_SECRET` de Development. Después,
priorizar en Chat
(`docs/ROADMAP.md` → "Siguiente"/"Después"; incluye el bug de Presence).
