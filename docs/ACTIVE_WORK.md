# Trabajo activo

**Última actualización:** 2026-09-14

## Estado

**Engineering Hardening EF-1 y EF-2: cerrados y mergeados a `main`.**
EF-1: PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29),
commit `cc60f6d`. EF-2: PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31),
commit `980464c`. Historia completa de cada uno:
[`docs/archive/ef-1-engineering-hardening.md`](archive/ef-1-engineering-hardening.md),
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md).

**EF-3 autorizado y en ejecución (2026-09-14).** Plan v12 (12 rondas de
auditoría, la última externa e independiente contra el repo real), 40
bloques. Documento canónico + matriz de hallazgos + tracker en vivo:
[`docs/EF-3_ENGINEERING_HARDENING.md`](EF-3_ENGINEERING_HARDENING.md).
**Bloque en curso: 3A-0** (este mismo commit — persistencia documental del
plan). Siguiente: 3A-0b (validador de tracker en CI).

## Completado en esta sesión

**3A-0 (EF-3):** creación de `docs/EF-3_ENGINEERING_HARDENING.md` (plan
completo v12 + historial de 12 rondas + tracker de 40 bloques),
actualización de `docs/ROADMAP.md` (EF-3 pasa de "no autorizado" a "en
ejecución") y de este documento, y de las 2 skills
(`serenata-iniciar-fase`/`serenata-cerrar-sesion`) para que reconozcan el
tracker de EF-3 al abrir/cerrar sesión.

## Completado en sesiones anteriores

**EF-2 (8 bloques del plan aprobado), de punta a punta:** planeación en modo
plan con 4 rondas de auditoría del usuario contra el código real antes de
autorizar, implementación bloque por bloque (1A-1, 1A-2, 1B-1, 1B-2a, 1B-2b,
1D-1, 1D-3, 1E-2), dos rondas de auditoría del propio PR con 4 hallazgos
reales corregidos y verificados, medición de p95 real contra un Preview de
Vercel para cerrar el gate de 1D-3, verificación directa en producción de la
migración de 1B-2a, y merge a `main`. Historia completa, con las 3
mediciones de latencia y los 5 hallazgos de auditoría uno por uno:
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md).

Infraestructura nueva y reutilizable que quedó del camino:
`.github/workflows/preview-latency.yml` (`workflow_dispatch`) mide p95 real
de cualquier ruta contra cualquier Preview — útil para el próximo bloque
que necesite el mismo tipo de gate.

## Tests ejecutados

`npx tsc --noEmit`, `npm run lint` y `npm test` en verde antes de cada push
de la sesión; suite completa en 616/616 en el estado final de EF-2. CI real
confirmado en verde (no solo el webhook de finalización) en los 4 checks
del commit final del PR #31 (`ee82da0`): `test`, `fresh-db`, `live`,
`smoke-and-critical`, más el Preview de Vercel. 3A-0 es doc-only, sin
suites que correr.

## Problemas encontrados que siguen abiertos

- **Rama remota `fix/totales-general-conflict-drain` (ex-PR #30) no se pudo
  borrar** — `git push origin --delete` devolvió `403` (permiso del token
  de esa sesión). Su código ya está en `main` vía PR #29; la rama remota
  quedó huérfana, sin trabajo sin mergear. Borrarla manualmente desde GitHub
  en cualquier momento — sin urgencia. (Arrastrado, sin cambios esta sesión.)
- **CI (`test`/`e2e`/`migrations`) no se disparó automáticamente para un
  push a la rama del PR #31 en un punto de la sesión** — evento de GitHub
  perdido, causa no determinada. Se disparó manualmente vía
  `workflow_dispatch` como workaround puntual; no se repitió. Si vuelve a
  pasar, vale la pena investigar si es un patrón real o un flake aislado del
  webhook.

## Deuda técnica

- **`previewNextQuotationFolio()` sin `complementaria_de` hace
  `SELECT id FROM cotizaciones` sin filtro ni límite** — F14 de la matriz de
  EF-3, se cierra en el bloque **3B-7** (RPC `preview_next_cotizacion_folio_principal`).
  Detalle histórico: p95 osciló entre 486ms y 3664ms contra un Preview real
  en EF-2 1D-3; el `CacheManager` que 1D-3 restauró para esa ruta puntual
  no resuelve esto de fondo (ver gotcha en `ARCHITECTURE.md`).
- **Frentes A (escalabilidad de datos) y E (pruebas de carga) de la
  auditoría de ingeniería: cubiertos por el plan EF-3 v12** (40 bloques,
  `docs/EF-3_ENGINEERING_HARDENING.md`) — ya no son deuda sin plan, están
  en ejecución.
- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual
  obligatorio antes de mergear a `main`, o workflow de GitHub Actions
  separado y protegido (con el secreto de producción restringido a ese
  entorno)? Ninguna de las dos automatizaciones está implementada — decisión
  del usuario, sin urgencia. (Arrastrado de sesiones anteriores, sin
  cambios.)
- **Fase 8.7.2 (drenado real por celda + sincronización de migraciones):**
  cerrada el 2026-09-12 (ver `docs/ROADMAP.md` → Cerrado). PR
  [#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28) verde en CI,
  pendiente de que el usuario confirme la prueba manual en Preview y
  autorice el merge a `main` cuando quiera — no bloquea Engineering
  Hardening. (Arrastrado de sesiones anteriores, sin cambios esta sesión.)

## Siguiente paso

**3A-0b** (validador de tracker en CI, rama+PR) — primer bloque con rama de
EF-3, requisito de todo lo demás según el grafo de dependencias
(`docs/EF-3_ENGINEERING_HARDENING.md` → Sección 5). Después: 3A-1
(entornos de carga), que además necesita un paso manual del usuario
(crear el proyecto Vercel aislado, sección 3A-1 punto 2).

Sin dueño ni urgencia: borrar manualmente la rama remota
`fix/totales-general-conflict-drain` y decidir el modo de uso de
`check-schema-parity.mjs` (ver arriba).
