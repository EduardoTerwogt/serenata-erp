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

**F28 — RESUELTO (2026-09-17), en la misma sesión en que se documentó el
diferimiento.** Race de concurrencia real en la rotación del cookie de
sesión de `next-auth` bajo requests verdaderamente simultáneos a la misma
sesión ([`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897),
sigue abierto upstream sin fix). Causa raíz real (verificada contra el
código fuente instalado de `@auth/core`): `auth()` usado como middleware
en `proxy.ts` reemitía el cookie de sesión en cada invocación exitosa,
sin throttle para `strategy: 'jwt'`. Fix: PR
[#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71) (mergeado,
commit `136fee9`) — `proxy.ts`/`lib/api-auth.ts` migran a `getToken()`
(decodifica sin reemitir `Set-Cookie`, nuevo `lib/session-token.ts`).
Verificado con un test e2e nuevo (`staff-session-concurrent-rotation.spec.ts`,
15 requests concurrentes reales) en verde contra el entorno de test real.
Detalle completo, causa raíz exacta y verificación en
[`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](decisions/010-f28-diferir-race-cookie-nextauth.md).

**Pendiente menor, no bloqueante:** re-correr `load-test.yml` por
`workflow_dispatch` contra `136fee9` una vez se levante el límite de
build de la cuenta de Vercel (`pin-loadtest-target` se topó con
`Deployment rate limited — retry in 24 hours` el 2026-09-17 ~04:22 UTC,
infra de cuenta, no del diff) — confirmación a escala de carga real del
job `serverless`, que no llegó a correr. El job `local` (build real +
smoke de los 9 escenarios k6) sí corrió limpio contra el fix.

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

## Deuda técnica

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

## Siguiente paso

Ninguna iniciativa de Engineering Hardening en curso. La próxima sesión
que arranque (`serenata-iniciar-fase`) debe priorizar contra
`docs/ROADMAP.md` (sección "Después") con el estado real del sistema a
la vista, no asumir que hay trabajo de hardening pendiente por default.
