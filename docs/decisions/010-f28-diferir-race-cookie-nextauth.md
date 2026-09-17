# 010 — F28: diferir el fix de la race de rotación de cookie de next-auth (RESUELTO)

## Resolución (2026-09-17)

Retomado y cerrado en la misma sesión en que se documentó el diferimiento.
Fix: PR [#71](https://github.com/EduardoTerwogt/serenata-erp/pull/71),
mergeado a `main` en commit `136fee9`.

**Confirmado antes de implementar (WebFetch en vivo a GitHub):** el issue
upstream [`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897)
sigue abierto, sin PR ni versión que lo resuelva — se descartó "subir
`next-auth`" como opción. El fix fue a nivel de aplicación.

**Causa raíz, verificada línea por línea contra el código fuente instalado
de `@auth/core`/`next-auth`** (más precisa que la hipótesis original de
este documento): `auth()` usado como middleware (`proxy.ts`) invoca
internamente la acción `session()` de `@auth/core`
(`node_modules/@auth/core/lib/actions/session.js`), que para
`strategy: 'jwt'` **siempre** re-firma y reemite el cookie de sesión
(`Set-Cookie`) en cada invocación exitosa — sin throttle de `updateAge`
(ese throttle solo existe en la rama de sesiones de base de datos, no en
la de JWT). Con el matcher de `proxy.ts` cubriendo prácticamente toda
ruta, esto corría en cada request — el vector real y único confirmado de
la race. (`lib/api-auth.ts`'s `auth()` sin argumentos, la otra sospechosa
original, se auditó también: ese path interno de NextAuth calcula el
mismo `Set-Cookie` pero lo descarta en silencio, al no tener un
`response` al que adjuntarlo en un Server Component/Route Handler
invocado sin argumentos — no rotaba el cookie que llega al navegador.)

**Fix:** `proxy.ts`/`lib/proxy-handler.ts` dejan de envolver con `auth()`
y usan `getToken()` de `next-auth/jwt` (nuevo `lib/session-token.ts`) para
leer el JWT de sesión — decodifica de forma puramente de lectura, sin
efectos secundarios, nunca emite `Set-Cookie`. `lib/api-auth.ts` migró
igual, por consistencia y para no cargar `NextAuth({...})` completo en el
árbol de módulos de cada ruta de API (sin cambio de comportamiento
observable). La revocación real contra Postgres (`getUsuarioSessionState`)
no se tocó.

**Verificación:**
- `tests/e2e/live/staff-session-concurrent-rotation.spec.ts` (nuevo): 15
  requests genuinamente concurrentes contra la misma sesión real de
  NextAuth — pasó en el job `live` de `e2e.yml` contra el entorno de test
  real, exactamente el escenario que reproducía F28.
- Suite completa (`tsc`, `lint`, `npm test`, `e2e.yml` completo) en verde
  en el PR antes de mergear.
- `load-test.yml` por `workflow_dispatch` contra `136fee9`: el job `local`
  (build real + smoke de los 9 escenarios k6, incluido el nuevo
  `_diag-cookies-concurrent.js`) pasó limpio. El job `serverless` no llegó
  a correr — `pin-loadtest-target` se topó con el límite de build de la
  cuenta de Vercel (`Deployment rate limited — retry in 24 hours`,
  confirmado en los logs: 5 deployments recientes visibles, ninguno para
  el SHA del fix) — infra de cuenta, no relacionado al diff. Queda
  pendiente re-intentar el `workflow_dispatch` de `load-test.yml` una vez
  se levante el límite (∼24h desde 2026-09-17 ~04:22 UTC) para la
  confirmación a escala de carga real; no bloquea el cierre porque la
  regresión e2e ya prueba el mecanismo exacto contra sesión real.

## Contexto original (el diferimiento, para historial)

## Contexto

Durante el gate de carga real de EF-3 (3E-1, `docs/archive/ef-3-baseline-final.md`),
6 de 7 escenarios concurrentes de k6 rompieron el umbral `http_req_failed<1%` de
forma idéntica en `local` y `serverless`. Root-caused a fondo, descartando en orden:
cliente k6 (override manual del cookie jar ×2, con y sin `secure:true` — mismo
resultado), infraestructura edge/multi-región de Vercel (reproduce igual en `local`,
un solo proceso), y cold-start/derivación perezosa de clave (reproduce igual con el
proceso ya caliente).

Causa real: `auth.ts` usa `session: {strategy: 'jwt'}` con el middleware `auth()` de
NextAuth v5 (`proxy.ts = auth(proxyHandler)`), que reemite/rota el cookie de sesión
en casi cada request autenticada — comportamiento default de la librería, sin config
custom de `cookies`/`session.updateAge`. Bajo requests verdaderamente concurrentes
contra la MISMA sesión, la rotación puede correr dos veces en paralelo; el cliente
que se queda con la generación superada del cookie deja de ser reconocido
permanentemente hasta el próximo login. Coincide con un issue ya documentado en el
repo oficial de next-auth: [`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897)
("Race condition with cookie altering requests").

Solo `portal.js` (bypass de sesión vía HMAC, sin round-trip de next-auth) pasó
limpio en las 4 corridas completas del ciclo (2 antes y 2 después de descartar F27
como causa alterna — ver esa fila en el tracker).

## Decisión

**Diferir el fix con aprobación explícita del usuario (2026-09-17), no bloquear el
cierre de EF-3 sobre este hallazgo.** Se documenta como hallazgo real (F28, fila
condicional `3E-1b` del tracker archivado), no como deuda oculta.

## Razón

- **Gatillo angosto y ya acotado.** Necesita requests genuinamente simultáneos
  (mismos milisegundos) contra la misma sesión — no "dos pestañas abiertas en algún
  momento del día", sino dos o más requests autenticadas llegando al servidor casi
  al mismo instante. Se reprodujo con tan solo 5 sesiones concurrentes de la misma
  cuenta.
- **El fix real no es de este alcance.** Requiere decidir entre actualizar
  `next-auth` (todavía en beta, `^5.0.0-beta.30`) a una versión que lo corrija si
  existe, o ajustar la configuración de sesión (`session.updateAge`, o el propio
  mecanismo de rotación del middleware) — trabajo de código real en `auth.ts`, no
  un ajuste del load test ni algo resoluble dentro del alcance de EF-3 (que ya
  había encontrado y corregido F27 en el camino).
- **No es deuda técnica silenciosa.** Queda con causa raíz completa, evidencia
  reproducible, y referencia externa — cualquiera puede retomarlo sin re-investigar
  desde cero.

## Alternativas descartadas

- **Arreglarlo antes de cerrar EF-3.** Habría significado investigar a fondo el
  código interno de next-auth v5 (beta) y decidir entre upgrade vs. config, sin
  límite de tiempo claro — se prefirió cerrar Engineering Hardening con el
  hallazgo documentado en vez de bloquear indefinidamente el cierre sobre un bug
  de una librería externa con gatillo angosto.
- **Tratarlo como "no aplica" o ignorarlo.** Se descartó — es un hallazgo real,
  reproducible, con impacto de negocio real (aunque angosto): dos sesiones
  simultáneas de la misma cuenta (dos dispositivos, o compartir credenciales)
  pueden quedar bloqueadas permanentemente hasta volver a loguearse.

## Consecuencias

- **F28 es la única fila no resuelta de EF-3** (`3E-1b`, `Diferido con
  aprobación`) — candidato real para la próxima iniciativa que se priorice, sin
  bloque ni fecha asignados todavía (ver `docs/ACTIVE_WORK.md`/`docs/ROADMAP.md`).
- Cualquier escenario real de uso concurrente genuino de la misma cuenta (dos
  dispositivos, doble login accidental) puede producir sesiones que se
  invalidan entre sí sin aviso — hasta que se resuelva, vale la pena tenerlo
  presente si un usuario reporta "me saca sesión sin razón" bajo esas
  condiciones específicas.
- Cuando se retome: partir de `docs/archive/ef-3-baseline-final.md` (evidencia
  completa, 6 pasos de descarte) y de este documento — no re-investigar desde
  cero.
