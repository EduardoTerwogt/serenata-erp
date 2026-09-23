# Trabajo activo

**Última actualización:** 2026-09-23 (sesión 6, deuda técnica post-EF-3)

## Estado

**`docs/PLAN.md` — Vacío.** No hay iniciativa multi-sesión abierta. Esta
sesión atendió la deuda técnica que seguía viva en `main` (`9b3b303`) con un
plan de una sola sesión (auditado 2 rondas por el usuario): un PR en
borrador sobre `claude/clever-galileo-2w49pi` + pasos manuales fuera del PR.

## Fase 0 — auditoría previa (hallazgos)

1. **`bulk` Realtime:** productor (`items/bulk/route.ts`, `item_id: null`,
   `operation: 'bulk'`, vía `after()`) → consumidor
   (`useQuotationPresence.ts:247`, ya no lo descarta) → `page.tsx`
   (`latestItemConfirmed` → `reconciliarConServidor()`). El test live de
   importar partidas solo comprobaba el estado final con timeout de 60 s, así
   que el poll de 20 s (`RECONCILIACION_MS`) podía tapar un evento perdido.
2. **`cliente_id_backfill_clasificacion`:** RLS apagado en test y prod, y por
   los grants por defecto `anon`/`authenticated` tenían
   SELECT/INSERT/UPDATE/DELETE (prod: 168 filas; test: 6,594). Ningún código
   de la app la lee. Era el único ERROR del advisor de prod.
3. **`tracker-lint`:** solo lo usaban `test.yml`,
   `scripts/validate-ef3-tracker.mjs` y su test. Ningún `needs:`; `main` sin
   branch protection ni rulesets, así que no es un required check.
4. **Peso de los PDFs:** jsPDF decodifica el isotipo PNG (4 KB) y lo incrusta
   como RGB crudo sin comprimir: 447×448×3 = 587 KB por PDF, más ~107 KB
   del logo Serenata. Inter (~75 KB) no era la causa.
5. **Secretos de auth:** NextAuth (`next-auth/lib/env.js`) y
   `lib/session-token.ts` ya priorizan `AUTH_SECRET` sobre
   `NEXTAUTH_SECRET`; el Portal solo lee `AUTH_SECRET`. Si `AUTH_SECRET`
   existe en el entorno (el Portal no funcionaría sin él), `NEXTAUTH_SECRET`
   no se lee en ningún lado: quitarlo **no** invalida sesiones.

## Completado en esta sesión (6)

- **B1 — RLS + REVOKE** en `cliente_id_backfill_clasificacion`
  (`db/migrations/20260923_rls_cliente_id_backfill_clasificacion.sql`),
  aplicada en `serenata-erp-test` y en producción. Verificado en ambos:
  `relrowsecurity = true`; `has_table_privilege` false para
  S/I/U/D de anon y authenticated; `SET ROLE anon|authenticated` → SELECT e
  INSERT rechazados con `42501`; `service_role` lee; advisor sin ERROR. La
  tabla se conserva (decisión del usuario: no está confirmado que la
  reconciliación manual haya terminado) — anotado en ROADMAP → "Después".
- **B2 — flake de `portal-documentos.spec.ts`:** `getByText('ine.jpg')` hace
  match por substring y también agarraba el párrafo del modal de
  confirmación ('Se borra "ine.jpg"…'), abierto mientras el DELETE está en
  vuelo. Cambiado a `getByRole('link', { name: 'ine.jpg' })` (el nombre del
  archivo es un `<a>`). Sin tocar aserciones, timeouts ni retries.
- **B3 — `tracker-lint` retirado:** job de `test.yml`,
  `scripts/validate-ef3-tracker.mjs` y su test. La historia de EF-3 queda en
  `docs/archive/`.
- **B4 — PDFs comprimidos:** `compress: true` en `new jsPDF` de Cotización,
  Orden de pago y Hoja de llamado (misma causa raíz en los 3). Reporte de
  cierre no se tocó (diferido con Proyectos). Test de regresión de peso
  (< 200 KB) en los 3, verificado que falla sin el fix.
- **B5 — `AUTH_SECRET` canónico:** `lib/session-token.ts` sin fallback a
  `NEXTAUTH_SECRET`, falla explícito; test nuevo
  `lib/__tests__/session-token.test.ts` (falla sin el fix);
  `docs/ENV.md` actualizado.
- **V-bulk — test live causal:** el test "importar partidas…" de
  `tests/e2e/live/cotizaciones-colaboracion.spec.ts` ahora observa los
  frames del socket de B y sus GET de la cotización: se sincroniza con un
  latido del poll y exige que B converja **antes** del siguiente, que haya
  llegado `item_confirmed` con `operation: 'bulk'` y que B relea en ≤ 3 s
  tras el evento. Solo corre en el job `live` de CI.
- **Docs:** `docs/ROADMAP.md` (Frentes B y C al día: `CRON_SECRET`,
  idempotencia y `bulk` resueltos; nuevos "Después"; entrada en "Cerrado").

## Tests ejecutados y resultado real

- `npx tsc --noEmit` limpio; `npm run lint` 0 errores (8 warnings
  preexistentes); `npm test` 963/963 (bajan de 978 por los tests del
  validador de EF-3 retirado; +5 nuevos).
- B4, método fijado antes del cambio: 3 escenarios × 3 PDFs
  (corto/largo/límite), antes vs. después. Páginas y `MediaBox` iguales,
  `pdftotext -layout` idéntico byte a byte, mismas fuentes y mismas imágenes
  (dimensiones y cantidad); `pdftoppm -r 150` + `compare -metric AE`:
  **0 píxeles distintos** en las 27 páginas (incluso sin fuzz).
  Tamaños: Cotización 778→37 KB, 843→46 KB, 801→40 KB; Orden de pago
  149→27 KB, 914→57 KB, 840→44 KB; Hoja de llamado 643→27 KB,
  669→33 KB, 644→26 KB.
- B2: spec nuevo `--repeat-each=20` → 60/60 en verde (local).
- (ver resultados de smoke/critical/build y CI abajo — se completan al
  cerrar el PR)

## Pendiente manual (fuera del PR)

- **M1 — `NEXTAUTH_SECRET` en Vercel:** (a) confirmar que `AUTH_SECRET`
  existe en Production y Preview; (b) merge del PR; (c) login/logout de
  staff y Portal en Preview y prod; (d) borrar `NEXTAUTH_SECRET` en Vercel;
  (e) repetir (c). No se espera invalidación de sesiones (Fase 0 punto 5).
- **M2 — auditoría de entornos:** confirmar que Production usa Supabase prod
  con su `SUPABASE_JWT_SECRET` y Preview usa `serenata-erp-test` con el suyo.
- **V1 — Presence en Preview real** (2 usuarios, 2 navegadores, ida y vuelta).
- **V2 — Google:** (a) login con Google → sesión; (b) autorización de Drive →
  callback → token guardado → llamada real a Drive.
- **Housekeeping:** borrar ramas remotas ya mergeadas (GitHub → Branches →
  Merged); el proxy de esta sesión no lo permite.

## Deuda técnica

- Advisor de Supabase (WARN, sin ERROR): 10 funciones con `search_path`
  mutable y `pg_trgm` en `public` — anotado en ROADMAP → "Después".
- Arrastrada sin cambios: Presence sin verificar en Preview (V1),
  verificación completa de Google OAuth (V2).

## Siguiente paso

Cerrar el PR de deuda técnica (CI verde, incluido `live` con el test causal
de `bulk`) y luego los pasos manuales M1/M2/V1/V2. Después, priorizar en
Chat (`docs/ROADMAP.md` → "Siguiente"/"Después").
