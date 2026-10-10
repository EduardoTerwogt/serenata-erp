# Trabajo activo

**Última actualización:** 2026-10-10 — **#140 «Cuenta de proyecto clara» ejecutado (B0–B5) y en revisión en el PR [#142](https://github.com/EduardoTerwogt/serenata-erp/pull/142)** (borrador). La migración
`20261042` ya está aplicada en test y **producción** (md5 de `cuentas_cierre_mensual` y `cuentas_periodo` = archivo, ACL y `proconfig` iguales, `auditar_consistencia()` = 0). Falta: revisión del usuario en el Preview y merge.
Antes (2026-10-09): #110 lanzado (PR #136) y CI afinado (#138, #139).

## Estado

**`main` = `279206e`** (merge de #139; sin cambios de app ni de base desde `6c42f48`). Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1` (#124);
el código de la app en producción es el de `6c42f48` (`serenata-erp.vercel.app`). La base de producción tiene aplicadas **`20261030`–`20261042`** y está verificada; sigue sin datos de negocio reales
(solo `usuarios`, catálogos y un proyecto de prueba; la constancia fiscal de Serenata ya está subida). **#140 en revisión** (PR #142): B0–B5 hechos; ver ADR 026. Issue derivado de montos: [#143](https://github.com/EduardoTerwogt/serenata-erp/issues/143).

**Cola de iniciativas:** **#125** (llaves de Supabase legacy; prioridad baja, revisión 2026-11-01, límite 2026-12-01). Aparte: #119 (alta mínima de
cotizaciones, falta tu decisión) y #101 (diseño de Proyectos, sin arrancar).

## Completado en esta sesión (2026-10-09, #110)

- **B1 (`20261039`)** lectura barata de `cuentas_conceptos` (hash join en lecturas masivas; sigue plpgsql con `force_custom_plan`).
- **B2 (`20261040`)** histórico a 190 días: solo consulta, error `proyecto_historico` (P1420 / 409), archivado por el cron `keep-alive`, sigue sumando en ingresos,
  egresos, utilidad e impuestos, sale de `resumen` y `avisos`; `auditar_consistencia()` 24 → 27 guardas.
- **`20261041`** (decisión del usuario): el régimen fiscal de los proveedores se congela al archivar; lo cerrado no se mueve, solo lo abierto.
- **B3** puerta redefinida con el usuario: 5 usuarios simultáneos, p95 < 800 ms por endpoint; 10 usuarios es un dato. `scripts/loadtest/k6/cuentas.js` imita la pantalla real.
- **B4** ADR 025 aprobada, `ARCHITECTURE.md`, reglas de migraciones, ROADMAP; plan archivado en `docs/archive/frente2-historico-cuentas-110.md`.
- **Producción, antes del merge** (por MCP en partes, sin `DROP`/`DELETE`, sin `20260915_loadtest_runs.sql`): 14 funciones = archivos por md5, 8 triggers, columnas e índice,
  ACL solo `postgres`/`service_role`, `auditar_consistencia()` = 0 con 27 guardas, archivado en simulación vacío (no se archivó nada de verdad).

## Completado después del lanzamiento (2026-10-09, CI y tests)

- **Análisis del 57014** (solo lectura): sin bloat, sin fixtures residuales, sin locks (las lecturas de Cuentas no toman). Una llamada a `cuentas_periodo` tarda ~0.8 s en reposo pero en CI
  `pg_stat_statements` da media 1.9 s y máximo ~8 s; la base free se atasca a ratos y también cancela `resumen` + `periodo` de la UI en tests que lo toleran.
- **#138:** «proyecto seleccionado (B6)» pasó de 20–24 a 8–9 llamadas (mismas ramas cubiertas). **#139:** `paths-ignore: ['**.md']` solo en `push` de `e2e.yml`, `test.yml` y `migrations.yml`
  (13 de los últimos 20 pushes a `main` eran solo docs y lanzaban E2E completo) + `__tests__/api-route-guards.test.ts` (toda ruta de `app/api` con `requireSection/AnySection` antes de leer body/base;
  públicas del proxy declaradas con su guardia). Documentado en `TESTING.md`.

## Decisiones nuevas

- `docs/decisions/025`: histórico a 190 días, componentes por factura/pago compartido, régimen congelado al archivar, puerta de rendimiento a 5 usuarios.
- Descartado con medición: unir `resumen` y `avisos`, `opciones` desde tablas base y reducir el CPU por concepto (revisar solo si `Server-Timing` en producción muestra
  `periodo` > 1 s sostenido).

## Tests ejecutados (resultado real)

- Local: `tsc` limpio, lint sin errores, **1,320 pruebas unitarias**; golden de las lecturas de Cuentas (117 líneas) con 0 diferencias antes/después de cada migración;
  `scripts/db/cuentas-historico-prueba.sql` completo (incluye régimen congelado; probado que falla con las funciones anteriores); BD limpia reconstruida desde las 153 migraciones.
- **`main` en `279206e`:** `Test Suite`, `Migrations` y `E2E` (smoke, critical y `live`) **verdes**; el PR #139 también verde en sus 4 jobs. Conteo hoy: 1,327 unitarias (153 archivos), 26 smoke,
  155 critical, 95 live, 6 escala. Mutación manual del test de guardias (ruta sin guardia, portal sin `requirePortalSession`, `folio` con guardia débil): falla en las tres.
- `Migrations` falló una vez en `d716c4b` por «Setup Supabase CLI» (instalación de la herramienta, 6 s, antes de aplicar nada); el mismo job pasó en `279206e`.
- **No se verificó desde la sesión:** el cron `keep-alive` real en producción ni `scripts/loadtest/k6/cuentas.js` contra un deploy (sin salida de red a `*.supabase.co`/`*.vercel.app`).

## Problemas abiertos

- **Régimen fiscal de lo resuelto pero no archivado** (primeros 190 días): sigue el régimen actual del proveedor. Congelarlo desde que se resuelve exigiría guardarlo en cada RPC de pago/cierre; no se pidió.
- **`57014` en `cuentas-paridad-sql › proyecto seleccionado`** (job `live`, dos rojos seguidos en `main` el 2026-10-09; verde en #138, #139 y `main` tras el recorte): no es aleatorio. Una llamada a `cuentas_periodo` tarda ~0.8 s en la base de test
  en reposo (2,703 proyectos) pero `pg_stat_statements` en CI da media 1.9 s y máximo ~8 s (el `statement_timeout` de PostgREST); la base free se atasca a ratos (`resumen` + `periodo` de la UI también
  cancelados en `basic` y `cuentas-130`, que lo toleran). Causa del atasco sin probar (CPU compartida, contención de 2 vCPU o plan tras `autoanalyze`). Mitigación: el test pasó de 20–24 a 8–9 llamadas;
  si reaparecen timeouts, medir con `EXPLAIN (ANALYZE, BUFFERS)` por llamada durante un CI. Subir cómputo descartado (plan free).
  Flake intermitente en `cuentas-principal.spec.ts:45` (móvil) y en un test de Cotizaciones bajo carga.
- Un error aislado de Realtime (`no partition of relation "messages"`) el 2026-10-06 00:50 UTC: confirmar que las particiones diarias se siguen creando.
- **Historial de migraciones de producción:** con nombres por partes y sin entradas para lo corrido a mano o por `execute_sql` (incluidas `20261039`–`20261041`). Es cosmético;
  el estado real se verifica con `md5(prosrc)` contra los archivos.
- Un PDF real de más de ~4 MB no cabe en Subir factura (límite de Vercel); la salida es «Subir archivo» desde el detalle (decisión 024).

## Trampas operativas

- **El MCP de Supabase retiene todo SQL con `DELETE`/`DROP`** esperando una confirmación que nadie ve y **expira a los 60 s sin error**: ese SQL lo corre una persona en el SQL Editor.
  Lo grande se aplica por MCP en partes y se verifica con `md5(prosrc)`; el `success` no prueba nada. Para parchar una función ya aplicada, un bloque `DO` que lea
  `pg_get_functiondef`, reemplace y haga `EXECUTE` evita pegar 30 KB. Detalle en `.claude/rules/migraciones.md`.
- Un comentario partido distinto cambia el md5 de `prosrc`: pegar el cuerpo exacto del archivo (o comparar con comentarios y espacios normalizados).
- Todo lector nuevo de `archivo_url` debe tratar el valor `pendiente:*` (decisión 024). Drive no está configurado en Preview: ahí siempre se ve «Archivo pendiente».
- La base local de validación (Postgres 16) no sobrevive a la sesión: `scripts/db/local-up.sh [bd]` la reconstruye en ~10 s; el generador y el medidor están en `scripts/db/escala-*.sql`.
- Para correr Playwright local: los navegadores del contenedor son `chromium-1194` y el repo pide otra versión; usar una config local con
  `launchOptions.executablePath` (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) y las variables de `smoke-and-critical` (`PLAYWRIGHT_E2E_BYPASS=true`, etc.).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni `*.vercel.app` (proxy): verificar por MCP o Actions.
- El hook `pre-push-gate.mjs` pausa el primer push a `main` de cada sesión (pide confirmar con el usuario).

## Pendiente del usuario

0. **Comprobar el filtro de #139:** el push de cierre de esta sesión es solo `.md`; no debe crear corridas de `E2E`, `Test Suite` ni `Migrations` (si crea alguna, revisar el `paths-ignore`).
   Mirar también en GitHub (Settings → Branches) si `main` exige checks: el filtro va solo en `push`, no debería afectar.
1. **#110:** correr `scripts/loadtest/k6/cuentas.js` (`VUS=5`) contra un deploy real y revisar `Server-Timing` de `periodo`; confirmar que el cron `keep-alive` responde 200 con `archivado.ok`;
   tomar un respaldo manual antes de que haya datos reales que archivar (ADR 020, plan Free sin respaldos).
2. Decidir #119 (alta mínima de cotizaciones). Opcional: borrar ramas ya fusionadas (`claude/ajustes-131`, `claude/admiring-faraday-i5w9yj`, `claude/practical-hypatia-gc37j4`).

## Siguiente paso

1. Verificar el lanzamiento de #110 (punto 1 de arriba) y correr `auditar_consistencia()` en Admin tras la primera factura/pago reales.
2. Revisar #140 en el Preview del PR #142 (SH001 en escritorio y móvil: sin proveedores, 4 físicas, mixto) y mergear. Luego **#125** (revisión 2026-11-01); #119 y #101 esperan decisión tuya; #143 (montos) sin arrancar.
3. Opcional: borrar `.github/workflows/db-push-una-vez.yml` (workflow de un solo uso de #124 contra la base nueva; ya no tiene su secreto `PROD_NUEVA_DB_URL`).
4. Opcionales sin fecha: parcialidad y saldo insoluto del complemento (exige ampliar el parser); corregir un descuadre ligando o desligando cotizaciones sin
   resubir la factura (exige ampliar el CHECK de `cuentas_correcciones`); cancelar una cotización aprobada con factura o cobros, con traspaso (`docs/ROADMAP.md` → "Después").

## Deuda técnica

- **Doble TS de Cuentas** (`tests/support/cuentas-motor`, 2,147 líneas, solo pruebas): segunda implementación de las reglas que alimenta los datos simulados de `critical` y la paridad de `live` (6 pruebas, ~18 % del tiempo de `live`).
  Candidato a plan aparte: reemplazar la paridad por la equivalencia `scripts/db/cuentas-equivalencia.sql` y los simulados por fixtures fijos.
- Si el 57014 reaparece: mover las 6 pruebas de paridad de `live` por PR a corrida nocturna o semanal; recortar «cierre mensual» de 300 a ~60 casos (semilla fija); medir con `EXPLAIN (ANALYZE, BUFFERS)` por llamada durante un CI.
- **Sin vigilancia de producción:** nadie comprueba que el cron `keep-alive` responda 200 con `archivado.ok` ni que `auditar_consistencia()` siga en 0. Bastaría un workflow diario con un `curl` (requiere `CRON_SECRET` en los secretos de GitHub).
- `TESTING.md` dice «17 guardas» en `auditar_consistencia()`; son 27.
- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función (DROP + CREATE manual).
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014): ver «Problemas abiertos»; la base de test free no tiene margen contra los 8 s.
- **Sin respaldos en el plan Free** (ADR 020): con datos reales, respaldo manual antes de cualquier migración con `DROP`.
- La fecha de entrega de un histórico sigue editable desde Proyectos hasta que se defina ese módulo (ADR 025).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen.
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo: podrían leer la razón social de `datos_fiscales_serenata`.
- `rfc` entró en `PROVEEDOR_PUBLIC_COLUMNS` (desvío consciente de T8).
