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

## Completado en esta sesión (2026-09-17)

**F28 — RESUELTO**, en la misma sesión en que se documentó el
diferimiento (el hallazgo era de EF-3 3E-1, pero EF-3 ya estaba cerrado
antes de esta sesión — este trabajo fue aparte, no reabrió esa
iniciativa). Race de concurrencia real en la rotación del cookie de
sesión de `next-auth` bajo requests verdaderamente simultáneos a la
misma sesión ([`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897),
sigue abierto upstream sin fix).

- **Causa raíz** (verificada línea por línea contra el código fuente
  instalado de `@auth/core`, no solo inferida): `auth()` usado como
  middleware en `proxy.ts` invoca la acción `session()` de `@auth/core`,
  que para `strategy: 'jwt'` siempre re-firma y reemite `Set-Cookie` en
  cada invocación exitosa, sin throttle de `updateAge`. El vector real y
  único confirmado era ese middleware, no `lib/api-auth.ts` (su `auth()`
  sin argumentos ya descartaba el `Set-Cookie` en silencio).
- **Fix:** PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71)
  (mergeado, commit `136fee9`) — `proxy.ts`/`lib/proxy-handler.ts` y
  `lib/api-auth.ts` dejan de envolver con `auth()` y usan `getToken()`
  (nuevo `lib/session-token.ts`), que decodifica sin efectos
  secundarios y nunca emite `Set-Cookie`. La revocación real contra
  Postgres (`getUsuarioSessionState`) no se tocó.
- **Tests ejecutados y resultado real:** `tsc --noEmit` limpio, `lint`
  sin errores nuevos, `npm test` 833/833 en verde, suite `e2e.yml`
  completa (`smoke-and-critical` + `live`) en verde en el PR y de nuevo
  en `main` tras el merge. Test de regresión nuevo,
  `tests/e2e/live/staff-session-concurrent-rotation.spec.ts` (15
  requests genuinamente concurrentes contra la misma sesión real): en
  verde contra `main`. `load-test.yml` completo (`local` + `serverless`)
  por `workflow_dispatch` contra `main`: verde (el primer intento se
  topó con un rate-limit de build de la cuenta de Vercel, ajeno al
  diff, resuelto solo unas horas después).
- Detalle completo, causa raíz exacta y verificación:
  [`docs/decisions/010-f28-diferir-race-cookie-nextauth.md`](decisions/010-f28-diferir-race-cookie-nextauth.md).
  `ARCHITECTURE.md` (capa de auth y gotcha de F28) actualizado para
  reflejar el mecanismo nuevo.

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

Ninguna iniciativa de Engineering Hardening en curso, ni ningún trabajo
abierto de esta sesión. La próxima sesión que arranque
(`serenata-iniciar-fase`) debe priorizar contra `docs/ROADMAP.md`
(sección "Después") con el estado real del sistema a la vista, no
asumir que hay trabajo pendiente por default.
