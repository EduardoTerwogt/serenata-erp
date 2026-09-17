# Trabajo activo

**Última actualización:** 2026-09-17

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

**No hay ninguna iniciativa de Engineering Hardening en curso.** El
`docs/ROADMAP.md` no tiene todavía una próxima iniciativa comprometida —
se prioriza en Chat con el estado real del sistema a la vista.

**F28 — RESUELTO** (race de concurrencia en la rotación del cookie de sesión de
`next-auth`), PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71)
mergeado. Detalle completo:
[`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](decisions/010-f28-diferir-race-cookie-nextauth.md).

## Completado en esta sesión (2026-09-17)

**Workflow de `docs/PLAN.md` para coordinar entre cuentas de Claude distintas**,
PR [#72](https://github.com/EduardoTerwogt/serenata-erp/pull/72) (mergeado).

- **Motivación:** con varias cuentas de Claude trabajando el mismo repo, la
  memoria automática es local a cada cuenta/máquina — el repo es el único canal
  real de contexto compartido. Antes, el tracker de una iniciativa grande usaba
  un nombre distinto cada vez (ej. `docs/EF-3_ENGINEERING_HARDENING.md`), lo que
  dejó referencias muertas en los skills y en `ARCHITECTURE.md` tras archivarse.
- **`docs/PLAN.md`** (nuevo): nombre fijo para el tracker de la iniciativa
  multi-sesión activa. Nace como borrador desde la primera idea confirmada (no
  cuando el plan ya está terminado), se refina en vivo, se ejecuta bloque por
  bloque, y se archiva con `git mv` a `docs/archive/<slug>.md` al cerrar. Ciclo
  de vida completo documentado dentro del propio archivo.
- Referencias a `docs/PLAN.md` agregadas en `CLAUDE.md`, `README.md`, `AGENTS.md`,
  `docs/ROADMAP.md`, `docs/PROMPTS.md` y ambos skills de sesión
  (`serenata-iniciar-fase`, `serenata-cerrar-sesion`).
- **`CLAUDE.md` optimizado:** 229 → 166 líneas (bajo el límite de 200
  recomendado por la doc de Claude Code). Detalle de git movido a
  `.claude/rules/git.md` (carga siempre, sin pérdida de contexto). Principios
  críticos, patrones obligatorios y reglas de negocio invariables intactos.
- **Limpieza de referencias muertas a la ruta vieja de EF-3**
  (`docs/EF-3_ENGINEERING_HARDENING.md` → `docs/archive/ef-3-engineering-hardening.md`):
  3 en documentación (`ARCHITECTURE.md` y ambos skills) + ~11 en comentarios de
  código/tests (k6, repos de proyectos/proveedores, `env-check`,
  `useQuotationBusinessActions`, `test.yml`). Sin tocar
  `scripts/validate-ef3-tracker.mjs` ni su test a propósito — `TRACKER_PATHS`
  prueba ambas rutas como fallback intencional.
- **Autorizado explícitamente por el usuario:** la excepción doc-only (push
  directo a `main`) aplica igual en sesiones de Claude Code remotas/en la nube,
  documentado en `.claude/rules/git.md`.
- **Tests ejecutados y resultado real:** `tsc --noEmit` limpio, `lint` sin
  errores nuevos (8 warnings preexistentes, ninguno en archivos tocados),
  `vitest` 46/46 en los 5 archivos de test tocados. CI del PR en verde:
  `test`, `tracker-lint`, `smoke-and-critical`, `fresh-db`, `live`, Vercel
  (preview + comments).

## Deuda técnica

- **Pendiente de atender en algún momento, no bloqueante — gate real de
  concurrencia de F28 nunca quedó cableado en CI.** Ni el paso `SMOKE`
  de `scripts/loadtest/k6/_diag-cookies-concurrent.js` ni el job
  `serverless` de `load-test.yml` ejercen las 5 VUs sostenidas contra el
  umbral real `http_req_failed<1%` — ese gate solo se usó antes vía
  ramas throwaway durante el diagnóstico original de F28, nunca se
  agregó como job permanente. El test e2e ya prueba el mecanismo real
  bajo concurrencia genuina (ver arriba), así que esto no bloquea nada,
  pero si en algún momento se quiere la confirmación a escala real hay
  que correr `_diag-cookies-concurrent.js` a mano fuera de `SMOKE=1`
  (o agregar un job dedicado a `load-test.yml`, mismo patrón que los
  demás escenarios).
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

## Siguiente paso

**Iniciativa activa: Agrupar Cuentas por Pagar por proveedor+proyecto para
facturación** — aprobada, lista para ejecutar bloque por bloque. Tracker
completo, diseño y estado de cada bloque: [`docs/PLAN.md`](PLAN.md). Próximo
paso: Bloque 1 (esquema `cuentas_pagar_grupos` + función de reconciliación).
