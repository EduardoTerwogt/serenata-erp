# EF-3E 3E-1 — Baseline diagnóstico final (gate real) (2026-09-17)

Bloque final de EF-3E ("Baseline final y cierre"). Spec:
`docs/EF-3_ENGINEERING_HARDENING.md` (sección 3E-1). **100% doc-only**, sin
rama ni PR para este archivo (excepción de `CLAUDE.md`) — la orquestación de
k6 vivió en la rama throwaway `claude/ef3e1-baseline-tmp` (nunca mergeada,
borrada al cerrar este bloque). Repite el ciclo de 3A-6
(`docs/archive/ef-3-baseline-previo.md`) sobre el commit final de EF-3
(`a6e4528`), pero aquí **los umbrales son gate real**, no diagnóstico.

## Resumen ejecutivo

- **Volumen sembrado confirmado a escala objetivo** en `serenata-erp-test`
  antes de arrancar: `proveedores=2416`, `cotizaciones=2201`,
  `items_cotizacion=10995`, `cuentas_pagar=10979` — todos por encima de los
  mínimos del audit (1,200/1,200/6,000/6,000). No se sembró nada nuevo.
- **`http_req_duration` (p95<800ms, p99<1500ms) pasó en los 7 escenarios
  concurrentes, en ambos entornos, siempre** — la latencia de la app bajo
  carga real está dentro del umbral en todos los casos medidos.
- **`http_req_failed` (rate<1%) pasó solo en `portal.js`** (150 VUs) — los
  otros 6 escenarios concurrentes (`crear-cotizaciones`, `cuentas`,
  `dashboard`, `editar-concurrente`, `navegacion-proyectos`, `uploads`)
  rompieron ese umbral, **idéntico en `local` y `serverless`**, antes y
  después de un fix real encontrado en el camino (F27).
- **Un bug real, aislado, y corregido en el camino: F27** —
  `cuentas_por_proyecto()` sin índice en `cuentas_pagar.proyecto_id`,
  `mean_exec_time=1012ms`/`max=7912ms` a volumen real. Índice agregado,
  verificado 9x más rápido, mergeado a `main` (PR #69, `106245f`). **No
  cambió el resultado del gate** — se re-corrió el ciclo completo después y
  el mismo patrón de 6/7 escenarios se repitió idéntico.
- **Un segundo hallazgo real, root-caused a fondo, diferido con aprobación
  explícita del usuario: F28** — race de concurrencia en la rotación del
  cookie de sesión de `next-auth` (ver detalle abajo y en la matriz de
  hallazgos, fila `3E-1b`). Explica los 6 escenarios que rompen
  `http_req_failed`. Gatillo angosto (requests verdaderamente simultáneos a
  la misma sesión) — no bloquea el cierre de EF-3.
- **Decisión de Bloque 7 (contención de CPU del runner compartido,
  hipótesis de 3A-6) — revisada y NO aplica a este hallazgo**: el mismo
  patrón de fallas se reprodujo **idéntico en `local` y `serverless`**
  (infraestructura real de Vercel, sin contención de runner compartido
  posible) — descarta contención de CPU como explicación de F28. Ver nota
  completa más abajo, incluida una relectura de qué pasó realmente en 3A-6.

## Ciclo ejecutado

Rama throwaway `claude/ef3e1-baseline-tmp` (nunca mergeada, orquestación
100% descartable), `workflow_dispatch` de `load-test.yml` con
`sha=a6e4528815cc926eb6977fc781abd36c0e005069` (HEAD de `main` al momento
de arrancar 3E-1) y `full_baseline=true` — jobs nuevos `local-full`/
`serverless-full` que corren los 8 escenarios a duración real (30s rampa +
11m30s meseta, sin `SMOKE=1`), gate real de umbrales, sobre la misma
`serenata-erp-test` compartida (local primero, serverless después, mismo
criterio de `needs` que ya usaba el job `serverless` original para no
solaparse).

Corrida final usada para este reporte: run
[35162257199](https://github.com/EduardoTerwogt/serenata-erp/actions/runs/35162257199)
(local-full 21:32-21:56 UTC, serverless-full 21:56-22:16 UTC,
2026-09-16) — la 4ª de 4 corridas completas del ciclo de 8 escenarios (2
antes de aplicar F27, 2 después; los resultados no cambiaron entre pre y
post F27, confirmando que F27 no es la causa de la ruptura del gate).

1. Barrido de huérfanos — sin corridas huérfanas previas relevantes.
2. Carpeta real de Drive creada por corrida.
3. 150 sesiones de Portal firmadas (`prepare-portal-fixtures.mjs --count 150`).
4. Snapshot de `pg_stat_statements` "antes".
5. Los 8 escenarios de k6 a duración real: 7 concurrentes
   (`crear-cotizaciones.js`, `editar-concurrente.js`,
   `navegacion-proyectos.js`, `dashboard.js`, `cuentas.js`, `portal.js`,
   `uploads.js`, cada uno con `--summary-export` propio, lanzados con
   `set +e` y `wait` individual por PID — fix del bug real que abortó el
   intento de 3A-6, ver más abajo) + `session-version-cost.js` aislado
   después.
6. Snapshot "después" + deltas reales de `pg_stat_statements`.
7. Cleanup completo del `runId` (filas de Postgres + carpeta de Drive).
8. Repetido contra `serverless` inmediatamente después, mismo `runId`
   distinto, mismo seed compartido.

### Fix del bug real que abortó el intento de 3A-6

3A-6 usó `set -euo pipefail` + `wait $PID1..$PID7` en un solo paso —
el primer escenario que rompía su propio umbral hacía que `wait` devolviera
código distinto de cero, lo que abortaba el paso completo bajo `bash -e`
(GitHub Actions corre los pasos `run:` así por defecto), saltándose
`session-version-cost.js`, el snapshot "después", los deltas, y el
cleanup. Esta corrida usa `set +e` en el paso que lanza los 7 concurrentes,
`--summary-export=results/<nombre>.json` por escenario y `wait $PID;
echo $? > results/<nombre>.exit` individual por PID — un umbral roto en
cualquiera de los 7 nunca aborta el resto del ciclo. Confirmado real: en
las 4 corridas completas de este bloque, los 8 escenarios + snapshot +
cleanup corrieron siempre hasta el final, sin importar cuántos rompieron
su propio umbral.

## Resultados reales por escenario — ambos entornos

Extraídos de los logs reales del job (`get_job_logs`, no del artifact —
el artifact zip vive en Azure Blob Storage, host bloqueado por la policy de
egress del sandbox de esta sesión, confirmado vía el endpoint de status del
proxy; los números de threshold pass/fail de esta tabla SÍ son reales,
capturados agregando un paso que parsea cada `results/<escenario>.json` e
imprime sus `thresholds` directo al log del job). Mismos resultados en las
4 corridas completas (2 pre-F27, 2 post-F27):

| Escenario | VUs (rampa→meseta) | `http_req_duration` p95<800/p99<1500 | `http_req_failed` rate<1% | Local | Serverless |
|---|---|---|---|---|---|
| `crear-cotizaciones.js` | 2→20 | ✅ Pasa | ❌ Rompe | Igual | Igual |
| `cuentas.js` | 2→15 | ✅ Pasa | ❌ Rompe | Igual | Igual |
| `dashboard.js` | 2→20 | ✅ Pasa | ❌ Rompe | Igual | Igual |
| `editar-concurrente.js` | 10 fijos | ✅ Pasa | ❌ Rompe | Igual | Igual |
| `navegacion-proyectos.js` | 3→30 | ✅ Pasa | ❌ Rompe | Igual | Igual |
| **`portal.js`** | **15→150** | **✅ Pasa** | **✅ Pasa** | **Limpio** | **Limpio** |
| `uploads.js` | 4→38 | ✅ Pasa | ❌ Rompe | Igual | Igual |
| `session-version-cost.js` | 5 (aislado) | N/A (sin thresholds) | N/A | — | — |

**Nota sobre precisión de los números**: el paso que imprime métricas
capturó los `thresholds` (booleanos pass/fail) de cada JSON de k6
correctamente, pero por una discrepancia de esquema (la estructura real de
`--summary-export` de k6 v2.2.0 no anida los valores bajo `.values` como se
asumió al escribir el parser) los valores numéricos (`avg`/`p95`/`p99`
reales, tasa exacta de fallo) no quedaron capturados para estos 7
escenarios del ciclo completo — **no se fabrica ningún número aquí**: la
tabla de arriba refleja exactamente los booleanos de threshold reales
extraídos de los logs de esas 4 corridas, ni más ni menos. Para un
diagnóstico puntual con detalle numérico completo, ver la sección
siguiente (`cuentas.js` aislado, con status/body reales).

## Hallazgo F27 — `cuentas_por_proyecto()` sin índice (activado y corregido)

Medido con `pg_stat_statements` tras las 4 corridas: `queryid
7468401826217064494` (la función `cuentas_por_proyecto()` vía PostgREST),
`calls=793`, `mean_exec_time=1012.5ms`, `max_exec_time=7911.9ms`,
`total_exec_time=802,950ms`. Ningún otro query real de la app se acercó a
ese orden de magnitud (siguiente más lento con tráfico real: <50ms mean).

Root cause confirmado con `EXPLAIN (ANALYZE, BUFFERS)` directo contra
`serenata-erp-test`: `cuentas_cobrar` ya tenía índice por `proyecto_id`
(migración previa), `cuentas_pagar` nunca lo tuvo — cada invocación de
`cuentas_por_proyecto()` hace, por cada uno de los ~2,200 proyectos reales,
3 subconsultas correlacionadas contra `cuentas_pagar` (`EXISTS` +
`jsonb_agg` + `SUM`) sin índice, secuenciales sobre las ~11K filas de la
tabla cada vez.

Fix: `CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_proyecto_id ON
cuentas_pagar (proyecto_id)` — puramente aditivo. Verificado directo:
`5605.9ms` / `1,630,527` shared buffer hits → `578-623ms` (repetido 2x) /
`~28,000` buffer hits. Aplicado a `serenata-erp-test` y producción vía
Supabase MCP antes del PR; migración
`db/migrations/20260916_fix_cuentas_por_proyecto_missing_index.sql`,
PR [#69](https://github.com/EduardoTerwogt/serenata-erp/pull/69) mergeado
a `main` (`106245f`).

**Re-medido después del fix**: el ciclo completo de 8 escenarios se corrió
de nuevo (2 corridas más, local+serverless) — el patrón de 6/7 escenarios
rompiendo `http_req_failed` se repitió **exactamente igual**. F27 era real
y valía la pena corregir, pero no era la causa (ni siquiera parcial) del
gate roto — eso llevó a la investigación de F28.

## Hallazgo F28 — race de concurrencia en la rotación del cookie de sesión de next-auth (activado, diferido con aprobación)

### Investigación (resumen; detalle completo en la matriz de hallazgos, fila `3E-1b`)

1. **Diagnóstico aislado de `cuentas.js`** (solo ese escenario, duración
   real, contra `serverless`, en foreground para que el log del job trajera
   status/body real): `checks_succeeded=1.30%` (70 de 5,368),
   `http_req_failed=98.69%` (5,298 de 5,368), **1,780 iteraciones**. Todas
   las fallas: `401 {"error":"No autenticado"}` en
   `/api/cuentas-cobrar`/`/api/cuentas-pagar`/`/api/cuentas/por-proyecto`.
   Login (`/api/auth/csrf` + `/api/auth/callback/credentials`) **nunca
   falló** — 0 de 0.
2. **Descartado**: `session_version` (revocación explícita en
   `lib/api-auth.ts`) — esa ruta devuelve `{"error":"Sesión invalidada"}`,
   nunca observado; el fallo real es `auth()` (next-auth) devolviendo
   directamente sin sesión.
3. **Descartado**: errores de Postgres/pool de conexiones — 0 errores de
   conexión en `postgres_logs` durante la ventana exacta de cada corrida.
4. **Descartado — cliente k6**: se reemplazó el manejo automático de
   cookies de k6 por un override manual (parseo del `Set-Cookie` crudo +
   `jar.set()` a mano, mismo patrón que `mergeCookies()` de
   `rest-login.mjs`/`env-check.mjs`), dos veces (con y sin `secure:true`
   explícito) — **resultado idéntico** (70.00%/35 de 50 fallas) en ambos
   intentos, contra el mismo jar 100% automático.
5. **Descartado — infraestructura edge/multi-región de Vercel**: el mismo
   diagnóstico (5 VUs concurrentes con la misma cuenta) contra `local`
   (`next start` en un solo proceso Node, un solo reloj, sin distribución
   edge) reprodujo **exactamente igual** (70.00%/35 de 50).
6. **Descartado — cold start / derivación perezosa de clave**: se repitió
   el mismo diagnóstico usando `setup()` de k6 (secuencial, garantizado
   completo antes de que arranque cualquier VU) para forzar 2 ciclos reales
   de login+request ANTES de lanzar los 5 VUs concurrentes contra el MISMO
   proceso ya caliente — **resultado idéntico** (62.50%/35 de 56; los 21
   requests extra son el propio warmup, limpio). Descarta cualquier teoría
   de "race de inicialización en frío".
7. **Patrón observado, consistente en las 6 corridas de diagnóstico**: con
   ≥2 sesiones concurrentes de la MISMA cuenta, TODAS pasan su primera
   request (login + 1 request autenticada) y luego fallan TODAS,
   permanentemente, en el mismo instante sincronizado (no escalonado por
   sesión) — apunta a un estado global del lado del servidor, no algo
   por-sesión. Con 1 sola sesión (sin concurrencia), funciona perfecto
   indefinidamente.

### Root cause

`auth.ts` usa `session: { strategy: 'jwt' }` con el middleware `auth()` de
next-auth v5 envolviendo toda la app (`proxy.ts` = `export default
auth(proxyHandler)`) — este wrapper reemite/rota el cookie de sesión en
casi cada request autenticada (comportamiento **default** de next-auth v5,
no una config custom: no existe override de `cookies`/`session.updateAge`
en `auth.ts`). Bajo requests **verdaderamente concurrentes** contra la
MISMA sesión, cada uno intenta rotar el cookie a la vez — clase de bug ya
reportada upstream:
[`nextauthjs/next-auth#8897`](https://github.com/nextauthjs/next-auth/issues/8897)
("Race condition with cookie altering requests"). Coincide exactamente con
cada observación: funciona perfecto a 1 sesión, falla determinística y
permanentemente a ≥2, todas las sesiones fallan sincronizadas en el mismo
instante, y el propio 401 trae un `Set-Cookie` (el intento de rotación) que
decodifica vacío.

### Severidad real

Requiere requests genuinamente simultáneos (mismo milisegundo) contra la
MISMA sesión/cuenta — no "2 pestañas abiertas en algún momento del día",
sino golpes concurrentes reales. Gatillo angosto, bug real, diferido en vez
de arreglado ahora.

### Decisión

**Diferido con aprobación explícita del usuario (2026-09-17)** — no bloquea
el cierre de EF-3. Fix (upgrade de `next-auth` o ajuste de
`session.updateAge`/config de rotación de cookie) queda pendiente como
trabajo aparte, fuera de Engineering Hardening. Registrado en la matriz de
hallazgos como F28, con fila condicional propia `3E-1b` (mismo patrón que
`3B-7b`/`3C-4b`/`3D-0b`).

## Decisión de Bloque 7 — revisada

El plan original de sesión (previo a 3E-1) incluía un "Bloque 7": la
hipótesis de 3A-6 de que las fallas masivas observadas en `local` eran
contención de CPU del runner compartido de GitHub Actions (la app y los 7
procesos de k6 corriendo en el mismo runner de 2 cores), no un límite real
de capacidad de la app — recomendaba documentar `local` como
"solo humo funcional, nunca percentiles confiables" sin nueva
infraestructura de CI.

**Esa hipótesis de contención de CPU NO explica lo que encontró esta
sesión.** El mismo patrón de 6/7 escenarios rompiendo `http_req_failed` se
reprodujo **idéntico en `serverless`** (infraestructura real de Vercel,
sin contención de runner compartido posible) — si fuera contención del
runner, `serverless` no debería haberse visto afectado en absoluto. La
causa real (F28) es un bug de aplicación reproducible en cualquier entorno
con concurrencia real contra la misma sesión, sin relación con el runner
compartido de CI.

**Relectura de 3A-6**: el patrón que 3A-6 documentó en `local` (5 de 7
escenarios con 92-99% de fallas, `portal.js` limpio a 150 VUs, latencias
rápidas, `next-start.log` sin errores de aplicación) es **exactamente la
misma firma que F28** — probablemente era F28 todo este tiempo, no
contención de CPU. 3A-6 nunca pudo confirmarlo porque `serverless` nunca
llegó a correr esa sesión (rate-limit de Vercel bloqueó el deployment) —
sin el punto de comparación, la hipótesis de contención de runner era
razonable con la evidencia disponible entonces, pero esta sesión (con
ambos entornos corriendo) descarta esa explicación y confirma que es F28.
`local` sigue sin ser un target confiable para medir *capacidad* de la
app bajo contención de recursos reales (eso sigue siendo cierto en
general — sigue compartiendo runner con el generador de carga), pero
**la ruptura específica de `http_req_failed` observada en 3A-6 y en esta
sesión no fue nunca eso** — fue F28, confirmado real en infraestructura
propia (`serverless`) también.

## `pg_stat_statements`

Snapshot "antes"/"después" y deltas capturados correctamente en las 4
corridas (RPC `pg_stat_statements_snapshot()` de 3A-5, universo completo).
El delta que llevó a encontrar F27 (`queryid 7468401826217064494`, mean
window de la corrida `7153.5ms` sobre solo 10 calls completados en la
ventana, el resto cancelados/timeout) quedó guardado en
`docs/archive/telemetry/9dd5be34-4556-4857-bcde-347e7f3d6744-pg-stat-deltas.json`
(corrida de referencia, run 35158481159, pre-fix).

## Cleanup y estado final de `serenata-erp-test`

Las 4 corridas completas dejaron 0 filas huérfanas en cada caso (verificado
directo vía Supabase MCP después de cada una: `proveedores`/`cotizaciones`
volvían al conteo base tras cada cleanup). Único residual conocido y
tolerado: carpetas de Drive huérfanas por corrida (el borrado de carpeta
con muchos archivos reales de `uploads.js` a escala real devuelve 403/500
de la API de Drive — mismo tipo de huérfano ya documentado y tolerado en
3A-6, se autolimpia vía `--sweep-orphans` en una corrida futura, sin datos
de negocio en riesgo).

Volumen final confirmado en `serenata-erp-test` al cerrar este bloque:
`proveedores=2416`, `cotizaciones≈2200-2201`, `items_cotizacion≈10985-10995`,
`cuentas_pagar=10979`, `cuentas_cobrar=2197` — estable a través de las
9 corridas de esta sesión (4 completas + 5 diagnósticos puntuales), sin
crecimiento neto.

## Próximos pasos (explícitos)

1. Fix real de F28 (upgrade de `next-auth` o config de rotación de cookie)
   — trabajo aparte, fuera de Engineering Hardening, sin fecha fijada aquí.
2. Si se retoma, usar `scripts/loadtest/k6/_diag-cookies-concurrent.js`
   (branch throwaway ya borrada, pero el patrón está documentado arriba:
   5 VUs, misma cuenta, `setup()` opcional para descartar cold-start) como
   reproducción mínima verificada.
