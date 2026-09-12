# Trabajo activo

**Última actualización:** 2026-09-12

## Estado

**Engineering Hardening — EF-1 autorizado, arrancando.**

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

Arrancar EF-1: baseline (validar suites en verde en la rama de trabajo) y
luego 1C-1 (CxP/CxC `.find()`→`.maybeSingle()`), siguiendo v13.1 §18 y el
camino crítico de arriba. Rama dedicada + PR en borrador desde el primer
commit útil, por PR según v13.1 §15 (9 PRs de EF-1).
