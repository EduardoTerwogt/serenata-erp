# EF-3A 3A-6 — Baseline diagnóstico inicial (2026-09-16)

Bloque final de EF-3A ("Tooling y baseline diagnóstico"). Spec:
`docs/EF-3_ENGINEERING_HARDENING.md` líneas 1849-1903. **100% doc-only**, sin
rama ni PR (excepción de `CLAUDE.md`).

**Resumen ejecutivo: este baseline quedó parcial, con dos bloqueadores reales
documentados abajo — no un umbral que exija reintentar (3A-6 es diagnóstico,
no gate; el gate real es 3E-1).** El único número limpio y accionable es
`portal.js` (100% de éxito real a 150 VUs concurrentes). El resto de los
escenarios, el target `serverless` completo, y los deltas de
`pg_stat_statements` quedan como trabajo pendiente explícito para una corrida
futura.

## Decisión de alcance: volumen sembrado

El audit original (`docs/EF-3_ENGINEERING_HARDENING.md`) pedía 1,200
proveedores / 1,200 cotizaciones por target. Sembrar esa escala completa dos
veces (local + serverless), sin solaparse, hubiera tomado ~30+ minutos solo
de seed por target, sin contar los 8 escenarios de k6 (12 min cada uno). Por
tiempo de sesión, el volumen se escaló a **150 proveedores / 150
cotizaciones** por target (750 items, 750 cuentas_pagar) — real, sin mockear
nada, solo más chico. Las duraciones de los escenarios de k6 **no** se
redujeron: los 12 minutos reales por escenario (30s rampa + 11m30s meseta) se
mantuvieron intactos, porque acortarlos invalidaría cualquier percentil
p95/p99 medido.

## Ciclo ejecutado

Vía `workflow_dispatch` de `load-test.yml` en una rama throwaway
(`claude/ef3a-baseline-tmp`, nunca mergeada — los pasos de orquestación del
ciclo de baseline no forman parte del historial de `main`, consistente con
que este bloque debe landear 100% `.md`). Runner de GitHub Actions, target
`local` (`next start` en el propio runner), `runId` real
`8cd84355-b548-4d0f-a336-1913604f9e95`.

1. Barrido de huérfanos (`bulk-cleanup.mjs --sweep-orphans`) — 0 corridas
   huérfanas previas.
2. Carpeta real de Drive creada (`create-drive-run-folder.mjs`).
3. 150 sesiones de Portal firmadas (`prepare-portal-fixtures.mjs`).
4. Seed de volumen real (`seed-volume-fixtures.mjs`, 150/150) — conteos
   post-seed verificados por el propio script:

   | Tabla | Conteo real | Objetivo |
   |---|---|---|
   | `proveedores` | 300 (150 del seed de volumen + 150 del fixture de Portal, mismo patrón de nombre) | ≥150 |
   | `cotizaciones` | 150 | ≥150 |
   | `cuentas_cobrar` | 150 | ≥150 |
   | `items_cotizacion` | 750 | ≥750 |
   | `cuentas_pagar` | 750 | ≥750 |

5. Snapshot de `pg_stat_statements` "antes" — capturado correctamente.
6. Los 8 escenarios de k6 — 7 concurrentes (`crear-cotizaciones.js`,
   `editar-concurrente.js`, `navegacion-proyectos.js`, `dashboard.js`,
   `cuentas.js`, `portal.js`, `uploads.js`) + `session-version-cost.js`
   aislado después.
7. Snapshot "después" + deltas — **nunca se alcanzó** (ver bloqueador 2).
8. Cleanup completo — **nunca se alcanzó** (ver bloqueador 2), limpiado a
   mano después.

## Bloqueador 1 — Serverless: rate limit real de Vercel

Confirmado en tiempo real por el usuario durante la corrida: ambos proyectos
Vercel (`serenata-erp`, `serenata-erp-loadtest`) devolvieron
`Deployment rate limited — retry in 24 hours`. El job `pin-loadtest-target`
falló en su paso "Esperar a que el deployment del proyecto Vercel aislado
quede READY"; el job `serverless` se saltó (depende de `pin-loadtest-target`).
**0 datos de este target esta sesión.** Bloqueador externo, no corregible
hoy — pendiente de una corrida futura una vez Vercel libere el límite.

## Bloqueador 2 — Local: fallas masivas bajo concurrencia combinada real

Resultados reales por escenario, target `local`, ventana ~00:47-01:04 UTC:

| Escenario | VUs (rampa→meseta) | Iteraciones reales | Éxito real | `http_req_failed` | Métrica propia |
|---|---|---|---|---|---|
| `crear-cotizaciones.js` | 2→20 | 1,803 | 4.24% (79/1,863 checks) | 95.75% | `crear_cotizacion_ms` avg=11ms — `POST /api/cotizaciones` solo 1% (19/1,803) |
| `cuentas.js` | 2→15 | 1,846 | 1.25% | 98.74% | los 3 endpoints (`cuentas-cobrar`/`cuentas-pagar`/`por-proyecto`) ~0% éxito cada uno |
| `dashboard.js` | 2→20 | 727 | 7.45% | 92.54% | `dashboard_ms` avg=12.6ms |
| `editar-concurrente.js` | 10 fijos + 1 observador | 3,529 | 1.06% | 98.95% | `PATCH item` casi siempre falló, **pero el observador de Realtime sí funcionó**: `ws: conexión abierta (101)` ✓, `realtime_propagation_ms` avg=767.8ms p95=893.9ms — la conexión WebSocket dedicada, sin competir por el mismo pool HTTP, se mantuvo sana |
| `navegacion-proyectos.js` | 3→30 | 3,172 | 1.81% | 98.18% | `proyectos_listado_ms` avg=6.1ms |
| **`portal.js`** | **15→150** | **9,533** | **100.00%** | **0.00%** | `portal_429_rate=0%` — **único escenario limpio a escala completa**, p50=170ms p90=193ms p95=206ms |
| `uploads.js` | 4→38 | 0 (`setup()` nunca terminó) | 3/3 checks previos al timeout | — | ver hallazgo de bug abajo |
| `session-version-cost.js` | 5 (aislado) | 0 | — | — | nunca llegó a correr (ver más abajo) |

Todas las latencias de `http_req_duration` en los escenarios fallidos son
**muy rápidas** (avg 3-16ms) — no lentas. `next-start.log` (volcado completo
del servidor tras la corrida) **no registró ningún error durante la ventana
de fallas** — ni un 5xx, ni un stack trace, solo el log de arranque normal.

**Hipótesis de causa raíz (no confirmada, no hay ambiente aislado para
descartar alternativas):** el job `local` de `load-test.yml` corre TANTO la
app bajo prueba (`next start`) COMO los 7 procesos generadores de carga de
k6 en el MISMO runner de GitHub Actions (2 cores compartidos) — diseño
heredado de 3A-1, que nunca dotó al target `local` de cómputo separado del
cliente de carga, a diferencia de `serverless` (Vercel real, infraestructura
propia). Fallas instantáneas + cero errores de aplicación apuntan a que las
fallas ocurrieron **antes de llegar a la capa de aplicación** (a nivel de
conexión/socket), consistente con contención de recursos del runner
compartido entre servidor y clientes de carga — no necesariamente un límite
real de la app. Un dato a favor: `portal.js` (150 VUs, el único limpio)
autentica con una cookie HMAC verificada 100% en memoria
(`lib/portal-auth.ts`, sin round-trip), mientras los 5 escenarios fallidos
autentican vía NextAuth (con round-trip real) — una diferencia real
observada, aunque no es prueba concluyente por sí sola.

**Esto significa que el diseño actual del target `local` no es apto, tal
como está, para medir throughput/latencia de la app bajo concurrencia
combinada real** — mide, en el mejor de los casos, una mezcla de capacidad
de la app y contención del propio runner de CI compartido con el generador
de carga. El único número de este target con valor diagnóstico real es
`portal.js`: confirma que la infraestructura de sesión bypaseada del Portal
(3A-2) sostiene 150 VUs concurrentes sin fallos ni 429s — exactamente la
escala que el audit original pedía para ese escenario.

### Cascada de fallo en el script de orquestación

El script de la corrida usa `set -euo pipefail` y `wait $PID1..$PID7` sobre
los 7 procesos concurrentes de k6. Cuando uno de ellos cruza su umbral
(`http_req_failed` roto en 5 de 7), `k6 run` sale con código distinto de
cero, `wait` lo propaga, y `set -e` aborta el script en ese punto —
**nunca llegó a ejecutar** `session-version-cost.js` (aislado, después),
el snapshot "después" de `pg_stat_statements`, los deltas, ni el cleanup
final del `runId`.

**Consecuencia real:** quedaron ~209 cotizaciones, 300 proveedores, 750+
`items_cotizacion`, 750+ `cuentas_pagar`, etc. huérfanos en
`serenata-erp-test` (más de lo sembrado por el seed porque
`crear-cotizaciones.js`/`editar-concurrente.js` alcanzaron a crear más antes
de que el ciclo abortara). **Limpiados a mano** vía Supabase MCP (SQL
directo, misma cascada FK-safe que `bulk-cleanup.mjs`: `items_cotizacion` →
`cuentas_pagar`/`cuentas_cobrar` → `proyectos` →
`cotizacion_folio_reservations` → `cotizaciones` → `proveedores` →
`clientes` → `productos`) — confirmado **0 filas residuales** tras la
limpieza. Queda 1 carpeta huérfana en Drive de test
(`1a5q3I0QxAeTxw1s7zmAXIHJrHSsT1Bf9`, inofensiva, sin datos de negocio) que
se autolimpia en el próximo `--sweep-orphans` de una corrida futura (pasadas
2h desde su creación, vía el registro real en `loadtest_runs`).

## Hallazgo de bug real: `uploads.js` sin `setupTimeout` explícito

`uploads.js` hizo `setup() execution timed out after 60 seconds` — el
default de k6. Su `setup()` real (no `SMOKE`) crea+emite+aprueba hasta 50
cotizaciones secuenciales (4 llamadas HTTP cada una: crear, emitir, aprobar,
buscar `cuenta_pagar`), lo que bajo contención de recursos del runner
compartido excede 60s con margen. **Fix necesario:** `setupTimeout: '5m'`
(o similar) explícito en las `options` de `uploads.js`. Este fix **no** es
doc-only (`uploads.js` es código de 3A-5, ya mergeado a `main`) — queda
pendiente como una PR normal (rama+PR), fuera del alcance de este commit.

## `pg_stat_statements`

Snapshot "antes" capturado correctamente (universo completo, RPC
`pg_stat_statements_snapshot()` de 3A-5, ya validada real contra
`serenata-erp-test` — conteo idéntico a la vista, `queryid` sin pérdida de
precisión). El snapshot "después" y los deltas **no se calcularon** — el
ciclo abortó antes de ese paso (ver cascada de fallo arriba).

## Telemetría de Vercel

Captura manual pendiente — no se intentó esta sesión dado que `serverless`
nunca desplegó (bloqueador 1).

## Conteos iniciales verificados idénticos entre targets

No aplica esta sesión — solo un target (`local`) llegó a sembrarse; el
target `serverless` nunca arrancó (bloqueador 1), así que no hay un segundo
conteo contra el cual comparar.

## Próximos pasos (explícitos, no implícitos)

1. Aplicar el fix de `setupTimeout` a `uploads.js` (PR normal, rama+PR).
2. Reintentar el ciclo de 3A-6 una vez Vercel libere el rate limit (~24h
   desde este intento) — con foco en `serverless` como la fuente real de
   percentiles (infraestructura propia, sin contención compartida con el
   cliente de carga).
3. Decidir si el target `local`, tal como está diseñado, debe seguir
   reportándose como medición de capacidad de la app, o si debe
   re-arquitecturarse (runner separado del generador de carga) o
   documentarse explícitamente como "solo humo funcional, nunca percentiles
   confiables" de aquí en adelante.
4. Repetir la verificación de conteos iniciales idénticos entre ambos
   targets una vez ambos ciclos completen sin abortar.
