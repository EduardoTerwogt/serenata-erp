# Trabajo activo

**Última actualización:** 2026-09-15

## Estado

**Engineering Hardening EF-1 y EF-2: cerrados y mergeados a `main`.**
EF-1: PR [#29](https://github.com/EduardoTerwogt/serenata-erp/pull/29),
commit `cc60f6d`. EF-2: PR [#31](https://github.com/EduardoTerwogt/serenata-erp/pull/31),
commit `980464c`. Historia completa de cada uno:
[`docs/archive/ef-1-engineering-hardening.md`](archive/ef-1-engineering-hardening.md),
[`docs/archive/ef-2-engineering-hardening.md`](archive/ef-2-engineering-hardening.md).

**EF-3 en ejecución.** Plan v12, 40 bloques + hasta 3 condicionales.
Documento canónico + matriz de hallazgos + tracker en vivo:
[`docs/EF-3_ENGINEERING_HARDENING.md`](EF-3_ENGINEERING_HARDENING.md) (§11).
Cerrados hasta hoy: 3A-0, 3A-0b, 3A-1, **3A-2, 3A-3**, 3B-1, 3B-2, 3B-3,
3B-4, 3B-5, 3B-6, 3B-8, 3B-9, 3B-11, 3B-12, 3C-1, 3C-2, 3C-3, 3D-0, 3D-0b,
3D-1, 3D-2, 3D-3, 3D-4, 3D-6, 3D-7, 3D-8, 3D-9, 3D-10, 3D-11, 3D-12.

**En curso: 3A-4** (cleanup de Postgres/Drive por `runId`, rama
`claude/ef3a-cleanup-drive-postgres`), siguiente paso de la ejecución
completa de EF-3A (3A-2→3A-6) en curso esta sesión. El único bloque de
EF-3D que sigue abierto es **3D-5** (`useQuotationItemCellsAutosave`),
pausado por decisión explícita del usuario, pero su bloqueador real
(entorno serverless de 3A-1) ya no existe — ver más abajo.

**3D-5 puede retomarse cuando el usuario decida** — la prueba manual
contra el entorno serverless real que su criterio de aceptación exige ya
es posible (`serenata-erp-loadtest`, ver 3A-1). **3C-4 sigue pausado**,
ahora solo por 3A-3 sembrando volumen real en la próxima corrida (3A-3 en
sí ya cerró), no por 3A-1.

## Completado en esta sesión

**Cierre de 3A-3 (fixtures de volumen)**, PR
[#56](https://github.com/EduardoTerwogt/serenata-erp/pull/56), commit
`41b9ccc`. `scripts/loadtest/seed-volume-fixtures.mjs` siembra volumen
real (1,200 cotizaciones × 5 items) vía la API real (`POST
/api/cotizaciones`+`.../emitir`+`.../aprobar`), no RPCs crudas, para no
reimplementar la orquestación real de folio+persistencia+`approve_cotizacion`.
Validación real (escala reducida, `LOADTEST_PROVEEDORES_TARGET=3`/
`LOADTEST_COTIZACIONES_TARGET=3`): 3/3 proveedores + 3/3 cotizaciones
creadas+emitidas+aprobadas, conteos post-seed exactos contra el objetivo.

**Cierre de 3A-2 (fixtures de identidad, staff/Portal)**, PR
[#55](https://github.com/EduardoTerwogt/serenata-erp/pull/55), commit
`f8c0ec2`. Endpoint interno `POST /api/internal/loadtest-portal-session`
(mismo guard fail-closed que `env-check`) firma cookies reales del Portal
sin pasar por `/api/portal/login` (rate limit real); `prepare-staff-fixtures.mjs`
crea identidades de staff distintas (login REST, extraído a
`rest-login.mjs`); `prepare-portal-fixtures.mjs` crea proveedores efímeros
directo en Postgres. Validación real vía `workflow_dispatch` de
`load-test.yml` encontró y arregló 2 bugs reales, uno por intento:
(1) `proxy-handler.ts` bloqueaba la ruta nueva con 401 antes de su propio
guard — mismo patrón ya visto 2 veces en 3A-1, agregada a `isPublicPath()`
junto con `/api/internal/loadtest-drive-folder` (3A-4) de una vez; (2)
`prepare-portal-fixtures.mjs` dejaba `portal_estado` en NULL — `GET
/api/portal/me` exige `portal_estado !== null` además de
`requirePortalSession()`, fix: proveedores de fixture con `portal_estado:
'activo'`. Los 7 casos de la spec pasaron en verde contra
`serenata-erp-loadtest` real.

- **Plan de sesión:** ejecutar EF-3A completo (3A-2→3A-6) en secuencia,
  cada bloque su propia rama+PR, mergeando antes de arrancar el siguiente
  — 3A-4 en curso.

## Completado en sesiones anteriores

**Cierre de 3A-1 (infraestructura de carga EF-3A)**, bloqueado desde
sesiones anteriores por un paso manual del usuario. Esta sesión: guió el
paso a paso completo del setup manual, implementó el código, y usó el
`workflow_dispatch` real contra Vercel para encontrar y arreglar 3 bugs
reales de código + 1 dato de test faltante — ningún hallazgo se dio por
bueno solo con CI verde.

- **Setup manual guiado paso a paso** (el usuario lo ejecutó, sin API de
  Vercel disponible en esta sesión): proyecto Vercel aislado
  `serenata-erp-loadtest` (rama de despliegue `loadtest-target`, creada
  por esta sesión vía la API de GitHub porque Vercel exige que la rama
  exista para poder trackearla), 16 Environment Variables, y 7 secretos
  nuevos de GitHub Actions. Incluyó, fuera del plan original pero
  necesario para poder avanzar:
  - **Publicar el OAuth consent screen de Google fuera de modo Prueba**
    (causa raíz de que `GOOGLE_DRIVE_REFRESH_TOKEN` expirara cada 7 días)
    — requirió una página de política de privacidad y términos del
    servicio nuevas (`public/legal/privacidad.html`,
    `public/legal/terminos.html`, PR [#50](https://github.com/EduardoTerwogt/serenata-erp/pull/50)).
    La verificación completa de Google queda pendiente (toma tiempo);
    mientras tanto se generan tokens bajo "Prueba" igual que antes.
  - **Incidente real evitado:** el usuario pegó por error el refresh token
    de la cuenta de Drive de test en el `GOOGLE_DRIVE_REFRESH_TOKEN` de
    **producción**, sobreescribiendo el real, y llegó a hacer redeploy.
    Diagnosticado y revertido en el momento (nuevo token generado con la
    cuenta correcta de producción); confirmado con una cotización de
    prueba subiendo bien su PDF.
  - **Bug de sesión no relacionado, encontrado y arreglado en el camino:**
    `NEXTAUTH_URL` de producción apuntaba al dominio largo autogenerado
    de Vercel en vez del corto — causaba que el login redirigiera siempre
    ahí. Corregido por el usuario tras el diagnóstico.
- **Código de 3A-1** (rama `claude/ecstatic-hopper-pyo0vy`, 4 PRs
  independientes en vez de uno solo — cada bug real encontrado por el
  `workflow_dispatch` se arregló y verificó por separado):
  - **PR [#51](https://github.com/EduardoTerwogt/serenata-erp/pull/51)**
    (`04f091d`→`be0c8b4`): `app/api/internal/env-check/route.ts` (gate
    fail-closed `LOADTEST_MODE`+secreto, 404 nunca 403),
    `scripts/loadtest/env-check.mjs`, `scripts/loadtest/wait-for-deployment.mjs`,
    `.github/workflows/load-test.yml` (jobs `pin-loadtest-target`/`local`/
    `serverless`), `+concurrency` compartida en `e2e.yml`, `docs/ENV.md`.
    5 tests nuevos para el guard de la ruta.
  - **PR [#52](https://github.com/EduardoTerwogt/serenata-erp/pull/52)**
    (`0279023`→`5896a4d`): primer `workflow_dispatch` real reveló que
    `LOADTEST_ENV_SECRET` traía un `LINE SEPARATOR` (U+2028) colgando —
    artefacto de copiar/pegar, Node no puede meterlo en un header HTTP.
    Fix: `.trim()` en ambos lados del guard.
  - **PR [#53](https://github.com/EduardoTerwogt/serenata-erp/pull/53)**
    (`5b65897`→`706f817`): con el bug anterior resuelto, apareció uno
    distinto: `proxy.ts`/`proxyHandler` interceptaba
    `/api/internal/env-check` con 401 antes de que corriera su propio
    guard — no estaba en `isPublicPath()`. Mismo patrón que
    `/api/integrations/drive/authorize`.
  - **PR [#54](https://github.com/EduardoTerwogt/serenata-erp/pull/54)**
    (`2001315`→`fadf8bc`): tercer bug, más sutil: `GET /api/auth/csrf`
    devuelve **2** `Set-Cookie` distintos para `authjs.csrf-token` (uno
    del middleware `auth()`, otro de la ruta), y el script los concatenaba
    sin deduplicar → `MissingCSRF` en el login REST. **Reproducido y
    confirmado localmente** antes de pushear: `next build`+`next start`
    reales en el sandbox, mismo flujo exacto del script, MissingCSRF antes
    del fix → `CredentialsSignin` (paso siguiente) después.
  - **4to hallazgo, de datos no de código:** el `workflow_dispatch`
    siguiente llegó hasta el último de los 14 casos de aceptación de la
    spec — la cuenta de staff de test sin sección `admin` — funcionando
    exactamente como estaba diseñado (caso 5). Se agregó `admin` vía la
    RPC real `admin_update_usuario` a `e2e-live@serenata.test` y
    `e2e-live-local@serenata.test` en `serenata-erp-test` (no se pudo
    confirmar cuál es exactamente `PLAYWRIGHT_TEST_EMAIL` porque el valor
    del secreto de GitHub no es legible — se cubrieron ambas candidatas,
    cambio aditivo sin riesgo).
  - **Run final [35023245288](https://github.com/EduardoTerwogt/serenata-erp/actions/runs/35023245288):
    `pin-loadtest-target`/`local`/`serverless` los 3 en verde** — 3A-1
    validado end-to-end contra infraestructura real, no solo contra CI.
- **Flake real, no bug:** el `E2E`/`live` post-merge de PR #52 falló una
  vez en un test no relacionado (`cotizaciones-colaboracion.spec.ts`,
  causa F) con `session_invalidated`; confirmado que `load-test.yml` y
  `E2E` se habían encolado bien por la `concurrency` compartida (nunca
  corrieron a la vez), y el siguiente push (PR #53) lo confirmó como
  flake — pasó limpio.
- **Tracker actualizado:** 3A-1 pasa a `Cerrado` con los 4 PR/commits;
  notas de 3C-4 y 3D-5 corregidas (su bloqueador de "3A-1 sin resolver"
  ya no aplica).
- Ver `docs/archive/` para EF-1/EF-2 completos. EF-3 bloques 3A-0, 3A-0b,
  3B-1 a 3B-12 (salvo 3B-7, bloqueado), 3C-1 a 3C-3: cerrados en sesiones
  previas.
- **EF-3D (11 de 13 bloques, 3D-0b..3D-12 salvo 3D-5):** refactor de
  `app/cotizaciones/[id]/page.tsx` (2,388→1,484 líneas, -38%) en 6 hooks
  reales + `DomainError`/`buildErrorResponse` + Document Ingestion Core.
  PR [#49](https://github.com/EduardoTerwogt/serenata-erp/pull/49),
  commit de merge `2d7bd47`. 3D-5 sigue pausado (ver "Problemas
  encontrados que siguen abiertos").
- Historia completa de cada bloque, con PR y SHA: tracker en
  `docs/EF-3_ENGINEERING_HARDENING.md` §11.

## Tests ejecutados

**3A-2 (PR #55):** `npx tsc --noEmit` (limpio), `npm run lint` (0 errores,
7 warnings preexistentes), `npm test` (creció de 799 a **800/800** verde),
`node scripts/validate-ef3-tracker.mjs` (OK). CI: 5/5 checks verdes
(`fresh-db`, `smoke-and-critical`, `test`, `live`, `tracker-lint`) —
`fresh-db` necesitó 1 re-run por un flake real de infra (`supabase/setup-cli@v1`:
"rate limit exceeded" resolviendo la versión, murió antes de correr ningún
test). Validación real, no solo CI: 3 corridas de `workflow_dispatch` de
`load-test.yml` (`local`) contra `serenata-erp-loadtest`, la última con
los 7 casos de la spec en verde.

En los 4 PRs de 3A-1 (sesión anterior), antes de cada commit: `npx tsc
--noEmit` (limpio), `npm run lint` (0 errores, 7 warnings preexistentes),
`npm test` (creció de 792 a 799/799 verde), `node
scripts/validate-ef3-tracker.mjs` (OK). PR #54 además reprodujo el bug real
localmente (`next build`+`next start` en el sandbox) antes de pushear, en
vez de confiar en la teoría. CI de los 4 PRs: 6/6 checks verdes antes de
cada merge. Validación real, no solo CI: 5 corridas de `load-test.yml`
(`workflow_dispatch`) contra la infraestructura Vercel real, la última con
los 3 jobs (`pin-loadtest-target`/`local`/`serverless`) en verde.

## Problemas encontrados que siguen abiertos

- **3D-5 (`useQuotationItemCellsAutosave`) sigue pausado** por decisión del
  usuario, pero su bloqueador real (entorno serverless de 3A-1) ya no
  existe — la prueba manual que su criterio de aceptación exige ya se
  puede correr contra `serenata-erp-loadtest`. Decisión del usuario si
  retomarlo ahora.
- **Verificación completa de Google OAuth (fuera de modo Prueba) sigue
  pendiente** — puede tardar. Hasta entonces, cualquier refresh token
  nuevo de Drive (prod o test) sigue expirando cada 7 días.
- **No se pudo confirmar con certeza cuál cuenta de test es
  `PLAYWRIGHT_TEST_EMAIL` exacta** (secreto de GitHub no legible) — se
  cubrieron las 2 candidatas con `admin`, funcionalmente correcto pero
  vale la pena que el usuario lo confirme si le importa la precisión.
- **Rama remota `fix/totales-general-conflict-drain` (ex-PR #30) no se
  pudo borrar** — `403` del token de esa sesión. Su código ya está en
  `main` vía PR #29; sin trabajo sin mergear. (Arrastrado, sin cambios
  esta sesión.)

## Deuda técnica

- **Frentes A (escalabilidad de datos) y E (pruebas de carga) de la
  auditoría de ingeniería: cubiertos por el plan EF-3** — en ejecución, no
  deuda sin plan.
- **Modo de uso de `scripts/check-schema-parity.mjs`:** ¿paso manual
  obligatorio antes de mergear a `main`, o workflow de GitHub Actions
  separado? Decisión del usuario, sin urgencia. (Arrastrado.)
- **`previewNextQuotationFolio()` sin `complementaria_de`:** F14, se cierra
  en 3B-7 — bloqueado por 3A-1, que ya cerró; 3B-7 en sí sigue sin
  implementar.
- **`GET /api/productos` con `.limit(2000)` explícito** (no paginación
  real): sigue siendo deuda de Frente A del roadmap. Producción hoy: 40
  productos (margen amplio). (Arrastrado.)
- **`AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en Vercel producción** —
  probablemente resto de la migración NextAuth v4→v5, notado al revisar
  las env vars de producción esta sesión. No se tocó, solo anotado.
- **`SUPABASE_JWT_SECRET` con valores distintos entre "Production" y
  "Preview" en Vercel producción** — notado al revisar env vars, sin
  investigar el porqué. No se tocó, solo anotado.

## Siguiente paso

1. **3A-4 en curso** (rama `claude/ef3a-cleanup-drive-postgres`) — seguido
   de 3A-5 (3 PRs) y 3A-6, en ese orden, para cerrar EF-3A por completo
   esta sesión.
2. **3B-7** depende de 3A-1 (cerrado) — no arranca sola todavía (fuera del
   plan de esta sesión). **3C-4** depende de 3A-1 (cerrado) + volumen real
   sembrado en `serenata-erp-test` (`items_cotizacion>=5,500`) — el script
   de 3A-3 ya existe y está validado, pero la corrida completa contra
   `serenata-erp-test` todavía no se ejecutó (solo a escala reducida para
   validar el bloque); sigue bloqueado hasta esa corrida real.
3. **3D-5** puede retomarse si el usuario decide correr la prueba manual
   contra `serenata-erp-loadtest`.
4. Sin dueño ni urgencia: borrar la rama remota huérfana
   `fix/totales-general-conflict-drain`, decidir el modo de uso de
   `check-schema-parity.mjs`, confirmar cuál cuenta es
   `PLAYWRIGHT_TEST_EMAIL` exacta.
