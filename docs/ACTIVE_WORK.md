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

## Pendiente manual (arrastrado de la sesión 6, PR #90)

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
- **V1 — Presence en Preview real** (2 usuarios, 2 navegadores, ida y vuelta).
- **V2 — Google:** (a) login con Google → sesión; (b) autorización de Drive →
  callback → token guardado → llamada real a Drive.
- **Housekeeping:** borrar ramas remotas ya mergeadas (GitHub → Branches →
  Merged); el proxy de esta sesión no lo permite.

## Deuda técnica

- Arrastrada sin cambios: Presence sin verificar en Preview (V1),
  verificación completa de Google OAuth (V2).

## Siguiente paso

Pasos manuales V1 y V2 (M2 cerrado; M1 diferido a ROADMAP → "Después") (PR #90 ya en `main`). Antes de fin de año: decidir el
formato de folios CC/CP para 2027 (ROADMAP → "Después"). Después, priorizar en
Chat (`docs/ROADMAP.md` → "Siguiente"/"Después").
