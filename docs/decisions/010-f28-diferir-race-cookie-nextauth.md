# 010 — F28: diferir el fix de la race de rotación de cookie de next-auth

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
