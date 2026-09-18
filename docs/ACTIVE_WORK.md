# Trabajo activo

**Última actualización:** 2026-09-18

## Estado

**Engineering Hardening (EF-1 + EF-2 + EF-3) cerrado por completo.**
Las 3 iniciativas terminaron y están mergeadas a `main`:

- **EF-1** — PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29), commit `cc60f6d`.
- **EF-2** — PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31), commit `980464c`.
- **EF-3** — 41 filas base + 4 condicionales (28 hallazgos, F1-F28).
  Cierre: 3E-1 `7827ba8`, 3E-2 `0114d9a`, 3E-3 `321575b` (contenido) +
  `a4ff717` (sincronización final — `validate-ef3-tracker.mjs
  --require-final` sin excepciones). Ver Sección 11/12 del tracker
  archivado para el detalle completo.

Historia completa de cada una:
[`docs/archive/ef-1-engineering-hardening.md`](archive/ef-1-engineering-hardening.md),
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md),
[`docs/archive/ef-3-engineering-hardening.md`](archive/ef-3-engineering-hardening.md)
(tracker completo, matriz de 28 hallazgos, gate real de carga:
[`docs/archive/ef-3-baseline-final.md`](archive/ef-3-baseline-final.md)).

**Agrupar Cuentas por Pagar por proveedor+proyecto para facturación —
cerrada por completo (2026-09-18).** 8 bloques, PR
[#73](https://github.com/EduardoTerwogt/serenata-erp/pull/73) y
[#74](https://github.com/EduardoTerwogt/serenata-erp/pull/74) mergeados a
`main`. Historia completa:
[`docs/archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md`](archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md),
decisión de diseño: [`docs/decisions/011`](decisions/011-agrupacion-cuentas-pagar-por-proveedor-proyecto.md).

**`docs/PLAN.md` — Aprobado, listo para ejecutar (2026-09-18).** Nueva
iniciativa multi-sesión: 6 bloques en paralelo derivados de las iniciativas
A-F del roadmap (Plantillas, Cotizaciones UI, Cotizaciones fórmula Costo
Unitario/Costo Total, Portal, Clientes, PDF de orden de pago) — pasó por 6
rondas de auditoría externa antes de aprobarse. Ver `docs/PLAN.md` para el
tracker de bloques, el detalle de cada uno y qué quedó suelto para atención
individual (historial de cuentas por mes/año, dropdown de impuestos de
proyecto, calculadora de régimen fiscal, estado de resultados/balance,
normalizar `cliente_id` como FK).

**F28 — RESUELTO** (race de concurrencia en la rotación del cookie de sesión de
`next-auth`), PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71)
mergeado. Detalle completo:
[`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](decisions/010-f28-diferir-race-cookie-nextauth.md).

## Completado en esta sesión (2026-09-18)

Cierre de la iniciativa de agrupación de Cuentas por Pagar — Bloques 6, 7 y
un hotfix de una regresión encontrada al cerrar (Bloque 8).

- **Bloque 6 — Agrupar la vista interna de Cuentas por Pagar (Lista y Por
  proyecto), PR #73.** El Bloque 3 solo había agrupado el modal de detalle;
  "Lista" y "Por proyecto" seguían mostrando una fila por item. RPC nueva
  `buscar_cuentas_pagar_grupos` reemplaza a `buscar_cuentas_pagar` como
  fuente de "Lista"; `cuentas_por_proyecto()` ampliada con
  `grupo_estado`/`grupo_monto_total`/`grupo_monto_pagado` para que "Por
  proyecto" agrupe en JS (`agruparCuentasPagarPorGrupo`). Ambas migraciones
  verificadas contra `serenata-erp-test` y producción con datos reales. De
  paso se corrigió un hueco encontrado en el camino: `regimen_fiscal`
  extraído de la constancia por el parser AI nunca se persistía.
- **Bloque 7 — Reordenar el detalle de Cuentas por Pagar (modal de grupo),
  PR #73.** `TabInformacion.tsx` reordenado a
  folio/responsable(editable)/proyecto/fecha factura → tarjeta "Grupo de
  facturación" (sin resaltar ningún item como "actual") → cruce fiscal →
  contacto; Notas e Historial de reasignación al final. Cuentas legacy sin
  `grupo_id` sintetizan un "grupo" de 1 item para que la tarjeta nunca
  desaparezca.
- **PR #73 (Bloques 1-7 completos) mergeado a `main`**, commit `6c60a46`.
  CI en verde (`test`/`tracker-lint`/`fresh-db`/`smoke-and-critical`/`live`,
  Vercel preview).
- **Bloque 8 — Hotfix: regresión de `proyecto_id` en `cuentas_cobrar`, PR
  #74.** Al revisar el flujo completo antes de cerrar, el usuario encontró
  que una cotización complementaria aprobada dejaba de aparecer en Cuentas
  por Cobrar. Causa raíz: `20260917_reconciliar_grupos_en_approve_cotizacion.sql`
  (Bloque 2) se había escrito sobre una copia vieja de `approve_cotizacion`
  — de antes de que `20260911_approve_cotizacion_restore_proyecto_id.sql`
  ya hubiera corregido la falta de `proyecto_id` en el upsert de
  `cuentas_cobrar` una vez. Corregido en
  `20260918_fix_approve_cotizacion_cuenta_cobrar_proyecto_id.sql`
  (restaura `proyecto_id`, mantiene intacto el loop de
  `reconcile_cuenta_pagar_grupo()`, + backfill de la única fila real
  afectada en producción, `SH071-A`). Verificado en `serenata-erp-test`
  (aprobación real de una complementaria de prueba) y producción antes del
  push. Mergeado a `main`, commit `3640f36`. Documentado como segunda
  lección de proceso en `docs/decisions/011`.
- **Cierre de la iniciativa:** `docs/PLAN.md` archivado a
  `docs/archive/agrupacion-cuentas-pagar-por-proveedor-proyecto.md` (8
  bloques cerrados en el tracker), resumen agregado a `docs/ROADMAP.md` →
  "Cerrado", `docs/PLAN.md` recreado vacío. `ARCHITECTURE.md` y
  `docs/decisions/006`/`011` ya reflejaban el modelo nuevo desde el Bloque
  5 — verificados sustantivos, sin cambios adicionales necesarios por los
  Bloques 6-8 (son UI/hotfix, no cambian el modelo de datos descrito ahí).

**Decisiones tomadas en esta sesión:**
- El criterio de cierre de "prueba manual end-to-end" de `docs/PLAN.md` se
  dio por cumplido vía la cobertura granular por SQL directo de cada pieza
  (Bloques 1-5) más la revisión manual real del usuario sobre el Preview
  (Bloques 6-8) — en vez de exigir un recorrido único de punta a punta
  adicional. Fue precisamente esa revisión la que encontró la regresión del
  Bloque 8.
- Notas e Historial de reasignación se quedan en el modal de detalle (no
  estaban en la lista de 4 secciones que pidió el usuario para el
  reordenamiento), movidos al final.
- Reasignar responsable se queda editable en el campo "Responsable" del
  modal reordenado.
- Cuentas sin grupo real (legacy) sintetizan un "grupo" de 1 item en vez de
  ocultar la tarjeta "Grupo de facturación".

**Tests ejecutados y resultado real:** `tsc --noEmit` limpio, `lint` sin
errores nuevos (8 warnings preexistentes), `vitest` 885/885 en cada punto de
verificación (Bloques 6, 7, hotfix). Verificación SQL directa contra
`serenata-erp-test` y producción para ambas migraciones del Bloque 6, y
para el hotfix del Bloque 8 (incluida una aprobación real de una
cotización complementaria de prueba, creada y limpiada en el mismo turno).
CI de ambos PRs en verde antes de mergear.

## Deuda técnica

- **Nueva: no hay cobertura automática (unit ni integración) del
  comportamiento SQL de `approve_cotizacion` respecto a `cuentas_cobrar`.**
  `lib/server/quotations/__tests__/approval.test.ts` mockea la RPC
  completa, así que nunca ejercita el SQL real — no habría atrapado la
  regresión del Bloque 8 ni la atraparía si se repite. No existe ningún
  harness de test SQL/pgTAP en el repo. Construir uno es una decisión de
  arquitectura de testing, fuera de alcance del hotfix — queda pendiente,
  sin plan asignado.
- **Norma nueva agregada a `docs/decisions/011`:** al reemplazar una
  función existente vía `CREATE OR REPLACE`, partir siempre de su versión
  más reciente confirmada (`pg_proc.prosrc` en producción, o el
  manifiesto), nunca de una copia local desactualizada — la regresión del
  Bloque 8 fue exactamente este error, y ya había pasado una vez antes en
  la misma función.
- **Pendiente de atender en algún momento, no bloqueante — gate real de
  concurrencia de F28 nunca quedó cableado en CI.** Ni el paso `SMOKE`
  de `scripts/loadtest/k6/_diag-cookies-concurrent.js` ni el job
  `serverless` de `load-test.yml` ejercen las 5 VUs sostenidas contra el
  umbral real `http_req_failed<1%` — ese gate solo se usó antes vía
  ramas throwaway durante el diagnóstico original de F28, nunca se
  agregó como job permanente. El test e2e ya prueba el mecanismo real
  bajo concurrencia genuina, así que esto no bloquea nada, pero si en
  algún momento se quiere la confirmación a escala real hay que correr
  `_diag-cookies-concurrent.js` a mano fuera de `SMOKE=1` (o agregar un
  job dedicado a `load-test.yml`, mismo patrón que los demás escenarios).
- **Frente C (superficie de riesgo) de la auditoría de ingeniería no fue
  parte del alcance de EF-3:** `CRON_SECRET` que falla abierto si no
  existe, e idempotencia que trata cualquier error de INSERT como
  duplicado. Siguen pendientes, sin plan asignado.
- **Evento `bulk` de Realtime descartado en silencio** (Frente B de la
  auditoría) — tampoco fue parte del alcance de EF-3. Sigue sin tocar.
- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual
  obligatorio antes de mergear a `main`, o workflow de GitHub Actions
  separado? Decisión del usuario, sin urgencia. (Arrastrado.)
- **Verificación completa de Google OAuth (fuera de modo Prueba) sigue
  pendiente** — puede tardar. Hasta entonces, cualquier refresh token
  nuevo de Drive (prod o test) expira cada 7 días.
- **No se pudo confirmar con certeza cuál cuenta de test es
  `PLAYWRIGHT_TEST_EMAIL` exacta** (secreto de GitHub no legible) — se
  cubrieron 2 candidatas con sección `admin`, funcionalmente correcto
  pero vale la pena confirmarlo si importa la precisión. (Arrastrado.)
- **`AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en Vercel producción** —
  probablemente resto de la migración NextAuth v4→v5. No se tocó, solo
  anotado. (Arrastrado.)
- **`SUPABASE_JWT_SECRET` con valores distintos entre "Production" y
  "Preview" en Vercel producción** — sin investigar el porqué. No se
  tocó, solo anotado. (Arrastrado.)
- **Pendiente, requiere decisión de arquitectura (no de esta sesión):** el job
  `tracker-lint` de `.github/workflows/test.yml` sigue corriendo en cada PR
  validando específicamente los 40 bloques de EF-3, una iniciativa ya cerrada para
  siempre. Generalizarlo para validar el tracker de `docs/PLAN.md` (cualquiera que
  sea la iniciativa activa, con IDs de bloque variables) es una mejora real, pero
  implica diseñar un esquema de validación genérico — más de un camino razonable,
  no es un cleanup mecánico. (Arrastrado.)

## Pendiente de limpieza manual (no bloquea nada)

- **Rama `claude/ef3e1-baseline-tmp`** (throwaway del ciclo de carga de
  3E-1, nunca mergeada, sin efecto en `main`) — el borrado remoto está
  bloqueado por policy del proxy de egress de las sesiones de Claude Code
  contra la API de GitHub (`git push --delete` y `DELETE` directo vía API
  ambos devolvieron 403: "Write access to this GitHub API path is not
  permitted through this proxy"). Alguien con acceso directo a GitHub
  puede borrarla desde la UI cuando quiera; no hay urgencia.
- **Rama remota `fix/totales-general-conflict-drain` (ex-PR #30)** — mismo
  tipo de bloqueo en una sesión anterior. Su código ya está en `main` vía
  PR #29; no tiene trabajo sin mergear. (Arrastrado.)
- **Ramas ya mergeadas de esta sesión** (`claude/epic-davinci-1fj7ki`,
  `claude/fix-approve-cotizacion-proyecto-id`) — pueden borrarse desde la
  UI de GitHub cuando se quiera, sin urgencia (mismo bloqueo de proxy que
  las de arriba si se intenta desde una sesión de Claude Code).

## Siguiente paso

**Ejecutar `docs/PLAN.md`, bloque por bloque.** Los 6 bloques pueden
avanzar en paralelo (ramas/sesiones distintas, sin compartir archivos salvo
lo anotado en "Coordinación entre bloques paralelos" del plan). Empezar por
el Bloque 1 (Plantillas: header de tarjeta) es la recomendación del plan
por ser el más aislado y simple, pero no es una dependencia real — cualquier
sesión puede tomar cualquier bloque `Pendiente` del tracker. Recordar la
regla del propio plan: el Bloque 3 (fórmula Costo Unitario/Costo Total)
debe mergear a `main` antes de que arranque cualquier trabajo sobre las
iniciativas sueltas que dependen de él (B-financiera, F).
