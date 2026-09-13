# Trabajo activo

**Última actualización:** 2026-09-13

## Estado

**Engineering Hardening EF-1: cerrado y mergeado a `main`** (PR
[#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29), commit de merge
`cc60f6d`, 2026-09-13). Incluye baseline, 1C-1, 1B-3, 1B-4, 1E-1, 1C-2a, 1C-2b,
1E-3a, 1E-3b/1E-3c, más 7 hallazgos corregidos en una auditoría posterior del
propio PR, y el fix de drenado real de Totales/General consolidado desde el PR
#30 (cerrado sin mergear — sus commits llegaron a `main` vía PR #29).

Plan canónico v13.1 (13 rondas de revisión) aprobado. Estado real de la
iniciativa: **v13.1 aprobado**; **EF-1 cerrado**; **EF-2 implementado en PR
[#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31)**, en borrador,
pendiente de auditoría final y merge; **EF-3 no autorizado**, mantiene el gate
de entrada de v13.1 §15. Frentes A-E de la auditoría de ingeniería:
`docs/ROADMAP.md` → Ahora, detalle completo en
`docs/archive/auditoria-ingenieria-2026-09.md`.

### Precisiones de ejecución que corrigieron la redacción original de v13.1

Antes de ejecutar, una auditoría del plan contra el código real (2026-09-12)
encontró 3 puntos donde la ejecución debía precisarse — el diseño
transaccional/RPC de v13.1 no se tocó, solo dónde vive cierta lógica de
cliente y el alcance exacto de 1B-4. Quedaron implementados así:

1. **1E-3 (idempotencia de pagos):** la orquestación (fingerprint,
   `pendingOperation`, reconciliación) vive en `useCuentasPagar.ts`/
   `useCuentasCobrar.ts` vía `lib/client/pagoIdempotency.ts`, no en
   `TabRegistrarPago.tsx` (que solo llama a `props.onRegistrarPago(...)` con
   el archivo original, sin normalizar). Orden final, con el hallazgo 7 de la
   auditoría ya incorporado: `fingerprint (sobre el archivo original) →
   readPendingOperation → reconciliar si aplica → normalizeComprobante() →
   createPendingOperation() (solo si la identidad es nueva) → fetch → clear
   (solo en éxito)`. Detalle completo, por qué el orden importa y qué pasa
   ante un fallo en cada paso según `origin` (`createdNow`/`reusedExisting`):
   [`docs/decisions/008`](decisions/008-idempotencia-cliente-orden-fingerprint-normalize-persist.md).
   `lib/client/bulkImportIdempotency.ts` sigue el mismo orden por consistencia
   (su `buildCandidatePayload()` es síncrono, sin el gap de liveness que sí
   tenía pagos).
2. **1B-4:** `app/api/cuentas-pagar/route.ts` (recibe `id` en el body, no es
   ruta `[id]`) ya no acepta `estado`/`fecha_pago`/`monto_pagado` en
   `allowedKeys`; conserva `notas`/`orden_pago_id`; responde 400 y rechaza el
   update completo si el body incluye cualquiera de los tres campos
   financieros prohibidos, sin aplicar parcialmente los permitidos.
3. **Gate de preservación de comportamiento:** verificado en CI real (`live`,
   `smoke-and-critical`) en vez de manualmente en Preview — la suite `live`
   ejerce registrar pago CxP/CxC con y sin comprobante y `basic.spec.ts`
   cubre el ciclo completo con subida real a Drive; `smoke`/`critical` cubren
   importar partidas y el PUT de cuentas-pagar con `notas`/`orden_pago_id`.

### 7 hallazgos de la auditoría posterior de PR #29, todos corregidos

1. **P1410 no cubría fila reutilizada inexistente** en
   `bulk_replace_items_cotizacion` — si una operación concurrente borraba una
   fila de `reemplazar_ids`, el `INSERT ... ON CONFLICT` la recreaba de cero
   en vez de rechazar. Fix vía migración append-only
   (`db/migrations/20260913_bulk_replace_items_cotizacion_fix_deleted_row.sql`),
   aplicada y validada con SQL directo contra `serenata-erp-test` y
   producción. Regresión: `tests/e2e/live/bulk-replace-items-rpc.spec.ts`.
2. **TTL de `pendingOperation` no disparaba reconciliación real** — un
   registro `stale` con el mismo fingerprint se reenviaba a ciegas. Corregido
   en `pagoIdempotency.ts` y en el nuevo `bulkImportIdempotency.ts`: `stale`
   siempre reconcilia; `completed` usa el resultado ya confirmado sin
   reenviar; `not_found`/`ambiguous` permiten solo un retry EXACTO.
   `reconcilePago.ts`/`reconcileBulkImportEstado` devuelven `{status,
   result?}`, no solo el status.
3. **Pruebas compuestas v13.1** — carrera real (ambos órdenes de llegada) en
   `lib/server/__tests__/idempotency.test.ts`; escenarios
   stale+not_found+retry-exacto en `pagoIdempotency.test.ts` y
   `bulkImportIdempotency.test.ts`.
4. **Paridad SHA-256 cliente/servidor** — prueba directa comparando
   `computePayloadHash` (Node) vs `computeClientPayloadHash` (Web Crypto)
   sobre payloads anidados, arrays y Unicode.
5. **`reemplazar_ids` inválido se filtraba en silencio** — la ruta bulk ahora
   responde 400 y rechaza toda la petición si alguna entrada no trae `{id
   (uuid), revision (number)}`.
6. **`clearPendingOperation` del bulk se llamaba antes de validar el
   contrato de éxito** — ahora la validación vive dentro de
   `runIdempotentBulkImportSubmit`, antes de limpiar.
7. **Orden invertido de `normalize()` y `createPendingOperation()` en
   pagos** — ver punto 1 de arriba y `docs/decisions/008`.

## Completado en esta sesión

- Aplicados los 7 hallazgos de arriba, con `tsc`/`lint`/`test` en verde local
  (544/544) antes de cada push.
- Corregida la documentación de `docs/ACTIVE_WORK.md` para reflejar el orden
  final de `runIdempotentPagoSubmit` (ya no describía el orden pre-hallazgo-7).
- **Consolidación de ramas:** PR #30 (fix del drenado real Totales/General,
  mismo bug de conflicto falso de Fase 8.7.2 nunca portado a Totales/General)
  mergeado dentro de la rama de PR #29 vía `git merge --no-ff`, para correr
  los checks de CI una sola vez mientras la cuota de GitHub Actions estaba
  agotada. PR #30 cerrado sin mergear (sus cambios llegan a `main` vía PR
  #29).
- El usuario hizo público el repositorio para recuperar minutos gratuitos de
  GitHub Actions (cuota privada agotada). Con CI corriendo de verdad por
  primera vez en este PR, aparecieron y se corrigieron 2 bugs reales
  preexistentes que ningún test local había detectado:
  - **Test race en "causa I"/"causa H"** (`tests/e2e/live/cotizaciones-colaboracion.spec.ts`):
    "causa I" no esperaba a que la pestaña B convergiera vía Realtime antes
    de terminar, dejando un conteo base desactualizado para la siguiente
    prueba. Fix: esperar la convergencia de B antes de cerrar "causa I".
  - **Mock desactualizado en `/items/bulk`** (`tests/e2e/utils/quotation-detail-mocks.ts`):
    comparaba `reemplazar_ids` (ya `{id,revision}[]` desde el propio 1C-2b de
    este PR) contra ids planos — siempre `false`, así que nunca se
    reutilizaban/borraban filas en blanco. Corregido el mock y la aserción
    correspondiente en `tests/e2e/critical/cotizaciones-editar.spec.ts`.
- **CI real confirmado en verde** (`get_check_runs`, no solo el webhook de
  finalización) en los 4 checks de PR #29 sobre el commit `6aa4fd7`: `test`,
  `fresh-db`, `live`, `smoke-and-critical`, más el comentario de Preview de
  Vercel. El timeout de subida real a Google Drive que había fallado una vez
  en un commit anterior no se repitió — confirmado flake externo, no bug del
  diff (el único código tocado ahí es un refactor trivial de lookup por ID,
  ya revisado como equivalente).
- **Merge a `main`** de PR #29 con autorización explícita del usuario, tras
  confirmar CI real en verde.
- Documentación: nueva decisión
  [`008`](decisions/008-idempotencia-cliente-orden-fingerprint-normalize-persist.md),
  `ARCHITECTURE.md` (sección "Idempotencia de cliente", fila nueva en
  "Módulos y cobertura", 2 gotchas nuevos) y `docs/ROADMAP.md` (Engineering
  Hardening pasa de "Siguiente, sin arrancar" a "Ahora — EF-1 cerrado, EF-2/3
  pendientes") actualizados para reflejar el cierre real de EF-1.

## Problemas encontrados que siguen abiertos

- **Rama remota `fix/totales-general-conflict-drain` (ex-PR #30) no se pudo
  borrar** — `git push origin --delete` devolvió `403` (permiso del token
  de esta sesión, no un problema de proxy, confirmado). Su código ya está en
  `main` vía PR #29; la rama remota quedó huérfana, sin trabajo sin mergear.
  Borrarla manualmente desde GitHub (Settings → Branches, o el botón "Delete
  branch" en el PR cerrado) en cualquier momento — sin urgencia.

## Deuda técnica

- **`previewNextQuotationFolio()` sin `complementaria_de` hace
  `SELECT id FROM cotizaciones` sin filtro ni límite** (trae toda la tabla
  para calcular el siguiente folio en JS) — `lib/server/quotations/folio.ts`.
  Causa raíz real de la latencia intermitente de `GET /api/folio` medida en
  EF-2 1D-3 contra un Preview real (p95 osciló entre 486ms y 3664ms en 3
  corridas idénticas, según si la petición caía en una instancia tibia de
  Vercel o no) — el `CacheManager` en memoria que 1D-3 restauró para esa
  ruta puntual **no resuelve esto de fondo**, solo lo esconde quirúrgicamente
  cuando la petición cae en la misma instancia serverless que la anterior.
  Preexistente a EF-2 (no introducido esta sesión). Fuera de alcance de
  EF-2 por decisión del plan (1D-3 no introduce índices ni migraciones). Fix
  real: limitar/paginar la consulta o resolver el siguiente folio por RPC en
  Postgres en vez de traer toda la tabla a Node.
- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual
  obligatorio antes de mergear a `main`, o workflow de GitHub Actions
  separado y protegido (con el secreto de producción restringido a ese
  entorno)? Ninguna de las dos automatizaciones está implementada — decisión
  del usuario, sin urgencia. (Arrastrado de sesiones anteriores, sin cambios.)
- **Fase 8.7.2 (drenado real por celda + sincronización de migraciones):**
  cerrada el 2026-09-12 (ver `docs/ROADMAP.md` → Cerrado). PR
  [#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28) verde en CI,
  pendiente de que el usuario confirme la prueba manual en Preview y
  autorice el merge a `main` cuando quiera — no bloquea Engineering
  Hardening. (Arrastrado de sesiones anteriores, sin cambios esta sesión.)

## Siguiente paso

**EF-2 (PR #31): los 8 bloques del plan aprobado están implementados**
(1A-1, 1A-2, 1B-1, 1B-2a, 1B-2b, 1D-1, 1D-3, 1E-2), con una auditoría del
propio PR que encontró y corrigió 3 hallazgos (test de remount de 1A-1 que no
probaba convergencia real -- expuso y forzó a corregir una condición de
carrera genuina en `useRealtimeChannel.ts`; layering invertido reintroducido
en el fallback de caché de folio de 1D-3; validación de `sessionVersion` en
`proxy-handler.ts` que aceptaba `NaN`/`Infinity`/fraccionarios). Migración de
1B-2a verificada en producción (`fwmyoqokcjtldiofuxdg`): columna, RPC,
`search_path` y grants (`service_role` únicamente) confirmados por consulta
directa. CI en verde. Falta: renombrar el PR (título/descripción solo
mencionan 1A-1) y decidir con el usuario cuándo pasarlo a "listo para
revisión" y mergear.

Después de EF-2: **EF-3** sigue sin autorizar, mismo gate de entrada de
v13.1 §15. Frentes candidatos (A-E) en `docs/ROADMAP.md` → Ahora.

Sin dueño ni urgencia: borrar manualmente la rama remota
`fix/totales-general-conflict-drain` (ver arriba) y decidir el modo de uso de
`check-schema-parity.mjs` (ver Deuda técnica).
