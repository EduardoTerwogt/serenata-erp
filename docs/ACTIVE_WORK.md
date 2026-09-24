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

- **M1 — `NEXTAUTH_SECRET` en Vercel:** (a) ✅ `AUTH_SECRET` confirmado por
  el usuario en todos los entornos; (b) ✅ merge del PR #90; (c) login/logout
  de staff y Portal en Preview y prod; (d) borrar `NEXTAUTH_SECRET` en
  Vercel; (e) repetir (c). No se espera invalidación de sesiones: NextAuth
  y `lib/session-token.ts` ya priorizan `AUTH_SECRET`, así que
  `NEXTAUTH_SECRET` no se lee en ningún lado.
- **M2 — auditoría de entornos:** confirmar que Production usa Supabase prod
  con su `SUPABASE_JWT_SECRET` y Preview usa `serenata-erp-test` con el suyo.
- **V1 — Presence en Preview real** (2 usuarios, 2 navegadores, ida y vuelta).
- **V2 — Google:** (a) login con Google → sesión; (b) autorización de Drive →
  callback → token guardado → llamada real a Drive.
- **Housekeeping:** borrar ramas remotas ya mergeadas (GitHub → Branches →
  Merged); el proxy de esta sesión no lo permite.

## Deuda técnica

- Arrastrada sin cambios: Presence sin verificar en Preview (V1),
  verificación completa de Google OAuth (V2).

## Siguiente paso

Pasos manuales M1 (c–e), M2, V1 y V2 (PR #90 ya en `main`). Antes de fin de año: decidir el
formato de folios CC/CP para 2027 (ROADMAP → "Después"). Después, priorizar en
Chat (`docs/ROADMAP.md` → "Siguiente"/"Después").
