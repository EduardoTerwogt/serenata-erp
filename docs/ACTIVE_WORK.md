# Trabajo activo

**Última actualización:** 2026-09-13

## Estado

**Engineering Hardening EF-1 y EF-2: cerrados y mergeados a `main`.**
EF-1: PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29),
commit `cc60f6d`. EF-2: PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31),
commit `980464c`. Historia completa de cada uno:
[`docs/archive/ef-1-engineering-hardening.md`](archive/ef-1-engineering-hardening.md),
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md).

Plan canónico v13.1 (13 rondas de revisión) aprobado. Estado real de la
iniciativa: **v13.1 aprobado**; **EF-1 y EF-2 cerrados**; **EF-3 no
autorizado**, mantiene el gate de entrada de v13.1 §15. Los frentes A-E de
la auditoría de ingeniería, con lo que EF-2 cerró de cada uno y lo que sigue
abierto: `docs/ROADMAP.md` → Ahora (tabla de frentes), detalle completo en
`docs/archive/auditoria-ingenieria-2026-09.md`.

No hay ninguna iniciativa a medio arrancar ahora mismo — el trabajo activo
es decidir/auditar EF-3 cuando se priorice.

## Completado en esta sesión

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

Documentación: nueva decisión
[`009`](decisions/009-revocacion-sesion-staff-session-version.md) (revocación
de sesión de staff), `ARCHITECTURE.md` actualizado (aislamiento de
`supabaseAdmin`, revocación de sesión, `DomainError`/logger, 2 gotchas
nuevos de serverless/Realtime, 2 filas nuevas en "Módulos y cobertura"),
`docs/ROADMAP.md` (EF-2 pasa a cerrado, tabla de frentes con estado real
tras EF-2), y esta sesión de EF-1 archivada junto con la de EF-2 (ver
Estado, arriba) — `docs/ACTIVE_WORK.md` traía todavía la bitácora larga de
cierre de EF-1, ya cerrada hace una sesión.

## Tests ejecutados

`npx tsc --noEmit`, `npm run lint` y `npm test` en verde antes de cada push
de la sesión; suite completa en 616/616 en el estado final. CI real
confirmado en verde (no solo el webhook de finalización) en los 4 checks
del commit final del PR #31 (`ee82da0`): `test`, `fresh-db`, `live`,
`smoke-and-critical`, más el Preview de Vercel.

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
  `SELECT id FROM cotizaciones` sin filtro ni límite** (trae toda la tabla
  para calcular el siguiente folio en JS) — `lib/server/quotations/folio.ts`.
  Causa raíz real de la latencia intermitente de `GET /api/folio` medida en
  EF-2 1D-3 contra un Preview real (p95 osciló entre 486ms y 3664ms en 3
  corridas idénticas, según si la petición caía en una instancia tibia de
  Vercel o no) — el `CacheManager` en memoria que 1D-3 restauró para esa
  ruta puntual **no resuelve esto de fondo**, solo lo esconde
  quirúrgicamente cuando la petición cae en la misma instancia serverless
  que la anterior (ver gotcha en `ARCHITECTURE.md`). Preexistente a EF-2, no
  introducido esta sesión. Fuera de alcance de EF-2 por decisión del plan
  (1D-3 no introduce índices ni migraciones). Fix real: limitar/paginar la
  consulta o resolver el siguiente folio por RPC en Postgres en vez de traer
  toda la tabla a Node. Mismo patrón que el frente A de la auditoría de
  ingeniería (`getCuentasPagar()` con problema análogo) — candidato natural
  para EF-3.
- **Frentes A (escalabilidad de datos) y E (pruebas de carga) de la
  auditoría de ingeniería: sin tocar por EF-2.** Frentes B, C y D quedaron
  parcialmente cerrados — detalle exacto de qué se cerró de cada uno en
  `docs/ROADMAP.md` → Ahora (tabla de frentes). Candidatos para EF-3.
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

**EF-3, cuando se priorice:** auditar los frentes A-E contra el código real
ya con EF-2 aplicado (mismo patrón que se hizo para EF-1 y EF-2) y proponer
bloques concretos sin implementar — sigue el gate de entrada de v13.1 §15,
no autorizado todavía. Punto de partida: la tabla de frentes en
`docs/ROADMAP.md` → Ahora ya dice qué le falta a cada uno tras EF-2; el
frente A (escalabilidad) y E (carga) están intactos y son los más grandes
pendientes.

Sin dueño ni urgencia: borrar manualmente la rama remota
`fix/totales-general-conflict-drain` y decidir el modo de uso de
`check-schema-parity.mjs` (ver arriba).
