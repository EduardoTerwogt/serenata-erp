# Trabajo activo

**Última actualización:** 2026-09-12

## Estado

**Engineering Hardening — EF-1 implementado + 7 hallazgos de auditoría corregidos, pendiente de confirmación de CI y merge.**

Los 9 bloques de EF-1 están commiteados y pusheados a `claude/trusting-cerf-kl5qph`
(PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29), borrador):
baseline, 1C-1, 1B-3, 1B-4, 1E-1, 1C-2a, 1C-2b, 1E-3a, 1E-3b/1E-3c. Cada
commit pasó localmente `npx tsc --noEmit`, `npm run lint` y `npm test` en
verde antes de pushearse; las 3 migraciones originales (1E-1 `payload_hash`,
1C-2a `bulk_replace_items_cotizacion`+`bulk_import_operations`, 1E-3a
overloads con `operation_id`+`pago_operations`) se aplicaron y validaron
con pruebas SQL aisladas contra `serenata-erp-test` antes de commitear, con
limpieza de datos de prueba después.

**Auditoría posterior de PR #29 contra v13.1 + addendum (2026-09-12):**
encontró 7 hallazgos, todos corregidos, con `tsc`/`lint`/`test` en verde
local (544/544) tras el fix:

1. **P1410 no cubría fila reutilizada inexistente** — `bulk_replace_items_cotizacion`
   solo comparaba `revision` cuando la fila de `reemplazar_ids` seguía
   existiendo; si la borraba una operación concurrente, el `INSERT ... ON
   CONFLICT` la recreaba de cero. Fix vía migración append-only nueva
   (`db/migrations/20260913_bulk_replace_items_cotizacion_fix_deleted_row.sql`,
   `CREATE OR REPLACE` sobre la original, que nunca se edita) — aplicada y
   validada con SQL directo contra `serenata-erp-test` **y contra
   producción** (ambas confirmadas: P1410 con `motivo: fila_no_existe`,
   cero mutaciones). Prueba de regresión en
   `tests/e2e/live/bulk-replace-items-rpc.spec.ts` (RPC directa vía
   supabase-js admin, sin pasar por la ruta HTTP).
2. **TTL de `pendingOperation` no disparaba reconciliación real** — un
   registro `stale` con el MISMO fingerprint se reenviaba a ciegas en vez
   de consultar `/estado` primero. Corregido en `lib/client/pagoIdempotency.ts`
   y en el nuevo `lib/client/bulkImportIdempotency.ts` (extraído de
   `handleImportItems` en `page.tsx`, mismo patrón que
   `runIdempotentPagoSubmit`): `stale` reconcilia siempre; `completed` usa
   el resultado ya confirmado sin reenviar (evita duplicar la mutación);
   `not_found`/`ambiguous` permiten solo un retry EXACTO (mismo
   `operationId`/payload). `reconcilePago.ts` y `reconcileBulkImportEstado`
   ahora devuelven `{status, result?}`, no solo el status.
3. **Pruebas compuestas v13.1** — carrera real (Map compartido, ambos
   órdenes de llegada) en `lib/server/__tests__/idempotency.test.ts`
   confirmando una sola ejecución del handler; escenarios
   stale+not_found+retry-exacto en `pagoIdempotency.test.ts` y el nuevo
   `bulkImportIdempotency.test.ts`.
4. **Paridad SHA-256 cliente/servidor** — prueba directa en
   `idempotency.test.ts` comparando `computePayloadHash` (Node) vs
   `computeClientPayloadHash` (Web Crypto) sobre payloads anidados, arrays
   y Unicode.
5. **`reemplazar_ids` inválido se filtraba en silencio** — la ruta bulk
   ahora responde 400 y rechaza toda la petición si alguna entrada no trae
   `{id (uuid), revision (number)}`, igual que ya hacía con `items`.
6. **`clearPendingOperation` del bulk se llamaba antes de validar el
   contrato de éxito** — un 2xx sin `cotizacion` limpiaba el registro antes
   del `throw`. Ahora la validación vive dentro de
   `runIdempotentBulkImportSubmit`, antes de limpiar.
7. **Orden invertido de `normalize()` y `createPendingOperation()` en pagos**
   (hallazgo reportado por el usuario tras revisar el diff) — el código
   persistía la identidad ANTES de `normalize()` (async, puede tardar
   segundos: imagen, canvas, encode JPEG). Un cierre de pestaña o caída del
   navegador durante esa ventana dejaba una identidad persistida sin que
   ningún request hubiera salido nunca — como `not_found` nunca es
   terminal, un intento posterior con un payload distinto quedaba
   bloqueado por esa identidad fantasma. No era riesgo de doble cobro, era
   un problema de liveness. Orden corregido en `runIdempotentPagoSubmit`:
   `normalize() → createPendingOperation() → submit()`. `bulk` no tenía
   este problema (`buildCandidatePayload` es síncrono).

**Bloqueadores reales para mergear EF-1, ninguno del código:**
1. **CI real** — GitHub Actions sigue bloqueado por agotamiento de cuota
   mensual de la cuenta (`runner_id: 0`, nunca se asigna un runner,
   confirmado también en el PR #30 de un fix no relacionado). Registrado
   como comentario en el PR #29. Ninguna suite local sustituye este
   requisito.
2. **Verificación manual de Preview de Vercel** del gate de preservación
   de comportamiento (punto 3 de la sección de abajo).
3. **Autorización explícita del usuario** para mergear a `main` — no
   depende de que las suites locales pasen.

Plan canónico v13.1 (13 rondas de revisión) aprobado. Estado real de la
iniciativa: **v13.1 aprobado**; **EF-1 autorizado** (baseline, 1C-1, 1E-1,
1C-2a/b, 1B-3, 1B-4, 1E-3a/b/c); **EF-2 y EF-3 no autorizados**, mantienen
sus gates de entrada. Hallazgos y frentes A-E: `docs/ROADMAP.md` →
Siguiente, detalle en `docs/archive/auditoria-ingenieria-2026-09.md`.

Antes de ejecutar, una auditoría del plan contra el código real (2026-09-12)
encontró 3 puntos donde la ejecución debía precisarse — el diseño
transaccional/RPC de v13.1 no se toca, solo dónde vive cierta lógica de
cliente y el alcance exacto de 1B-4:

1. **1E-3 (idempotencia de pagos):** la orquestación (fingerprint,
   `pendingOperation`, reconciliación) va en `useCuentasPagar.ts` /
   `useCuentasCobrar.ts` — no en `TabRegistrarPago.tsx`, que hoy solo llama
   a `props.onRegistrarPago(...)` (el fetch real y el `idempotency_key`
   viven en esos hooks). El fingerprint se calcula sobre el `File`
   **original**, antes de `normalizeComprobante()` — `TabRegistrarPago`
   debe pasar el archivo original al hook, no el ya normalizado.
   Regla de limpieza ante un fallo local **antes** del `fetch`, por
   procedencia de la identidad:
   - `createdNow` (operationId generado en este submit, `readPendingOperation`
     devolvió `none`) → sí se limpia: ningún request salió nunca para esa
     identidad.
   - `reusedExisting` (operationId reutilizado de un intento anterior,
     mismo fingerprint) → NO se limpia: ese intento anterior pudo haber
     hecho commit en el servidor.
   Una vez que el `fetch` de este intento fue disparado (cualquier
   procedencia), ningún resultado ambiguo posterior limpia — permanece
   pendiente hasta éxito confirmado o reconciliación `completed`.
2. **1B-4:** en `app/api/cuentas-pagar/route.ts` (recibe `id` en el body,
   no es ruta `[id]`), quitar `estado`/`fecha_pago`/`monto_pagado` de
   `allowedKeys`, conservar `notas`/`orden_pago_id`, y responder **400**
   rechazando el update completo si el body incluye cualquiera de los tres
   campos financieros prohibidos (nunca aplicar parcialmente).
3. **Gate de preservación de comportamiento:** antes de mergear cada PR de
   activación (1C-2b, 1E-3b, 1E-3c, 1B-4), verificar manualmente en Preview
   de Vercel que el happy path (registrar pago CxP/CxC con y sin
   comprobante, importar partidas, PUT con `notas`/`orden_pago_id`) es
   funcionalmente idéntico al actual — mismos estados, montos, documentos,
   contrato HTTP de éxito y UX de submit/success/refresh. Únicos cambios
   visibles aceptados: los fail-closed/400 explícitos ya definidos en el
   plan para escenarios inseguros/ambiguos.

Camino crítico de EF-1 (v13.1 §16, sin cambios): baseline → 1C-1 → 1E-1 →
{1C-2a→1C-2b} y {1E-3a→1E-3b, 1E-3a→1E-3c} → 1B-3 → 1B-4.

## Pendiente (no bloquea, sin dueño todavía)

- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual obligatorio
  antes de mergear a `main`, o workflow de GitHub Actions separado y protegido (con
  el secreto de producción restringido a ese entorno)? Ninguna de las dos
  automatizaciones está implementada — decisión del usuario, sin urgencia.
- **Fase 8.7.2 (drenado real por celda + sincronización de migraciones):**
  cerrada el 2026-09-12 (ver `docs/ROADMAP.md` → Cerrado). PR
  [#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28) verde en
  CI, pendiente de que el usuario confirme la prueba manual en Preview y
  autorice el merge a `main` cuando quiera — no bloquea el arranque de
  Engineering Hardening.

## Siguiente paso

EF-1 completo, con los 7 hallazgos de la auditoría de PR #29 ya corregidos
y en verde local, esperando resolución de la cuota de GitHub Actions para
que `test`/`migrations`/`e2e` corran de verdad. Cuando corran:
1. Confirmar los 3 workflows en verde en el commit HEAD de
   `claude/trusting-cerf-kl5qph` en ese momento.
2. Verificación manual en Preview de Vercel del gate de preservación de
   comportamiento (punto 3, arriba): registrar pago CxP/CxC con y sin
   comprobante, importar partidas, PUT con `notas`/`orden_pago_id` —
   incluye confirmar que el flujo de bulk-import (ahora vía
   `runIdempotentBulkImportSubmit`) se ve y comporta idéntico al anterior.
3. Recién entonces, autorización explícita del usuario para mergear a
   `main` — CI en verde y Preview OK no autorizan el merge por sí solos.
