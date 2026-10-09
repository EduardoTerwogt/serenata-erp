# Trabajo activo

**Última actualización:** 2026-10-09 — **#110 «Frente 2 de Cuentas» lanzado a producción.** PR [#136](https://github.com/EduardoTerwogt/serenata-erp/pull/136)
fusionado en `main` como `6c42f48` (merge commit, sin squash); issue #110 cerrado. Antes (2026-10-08): #123/#130/#131 «Facturas y pagos ligados» (PR #129, `35709b6`).

## Estado

**`main` = `6c42f48`.** Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1` (#124); deploy de `6c42f48` en **READY**
(`serenata-erp.vercel.app`). La base de producción tiene aplicadas **`20261030`–`20261041`** y está verificada; sigue sin datos de negocio reales
(solo `usuarios`, catálogos y un proyecto de prueba; la constancia fiscal de Serenata ya está subida). **No hay iniciativa activa**: `docs/PLAN.md` está vacío.

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

## Decisiones nuevas

- `docs/decisions/025`: histórico a 190 días, componentes por factura/pago compartido, régimen congelado al archivar, puerta de rendimiento a 5 usuarios.
- Descartado con medición: unir `resumen` y `avisos`, `opciones` desde tablas base y reducir el CPU por concepto (revisar solo si `Server-Timing` en producción muestra
  `periodo` > 1 s sostenido).

## Tests ejecutados (resultado real)

- Local: `tsc` limpio, lint sin errores, **1,320 pruebas unitarias**; golden de las lecturas de Cuentas (117 líneas) con 0 diferencias antes/después de cada migración;
  `scripts/db/cuentas-historico-prueba.sql` completo (incluye régimen congelado; probado que falla con las funciones anteriores); BD limpia reconstruida desde las 153 migraciones.
- CI del último commit (`332ca54`): `test`, `fresh-db`, `smoke-and-critical` y `live` **verdes**. En el commit anterior `live` falló una vez por un error de mi fixture
  (ya corregido) y otra por el flake `57014` (verde en el re-run).
- **No se verificó desde la sesión:** el cron `keep-alive` real en producción ni `scripts/loadtest/k6/cuentas.js` contra un deploy (sin salida de red a `*.supabase.co`/`*.vercel.app`).

## Problemas abiertos

- **Régimen fiscal de lo resuelto pero no archivado** (primeros 190 días): sigue el régimen actual del proveedor. Congelarlo desde que se resuelve exigiría guardarlo en cada RPC de pago/cierre; no se pidió.
- **Flake `57014`** en `cuentas-paridad-sql › proyecto seleccionado` (job `live`): 24 llamadas de ~1.6 s sobre la base de test (2,703 proyectos); un rojo se confirma con un solo re-run, dos seguidos son reales.
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

1. **#110:** correr `scripts/loadtest/k6/cuentas.js` (`VUS=5`) contra un deploy real y revisar `Server-Timing` de `periodo`; confirmar que el cron `keep-alive` responde 200 con `archivado.ok`;
   tomar un respaldo manual antes de que haya datos reales que archivar (ADR 020, plan Free sin respaldos).
2. Decidir #119 (alta mínima de cotizaciones). Opcional: borrar ramas ya fusionadas (`claude/ajustes-131`, `claude/admiring-faraday-i5w9yj`, `claude/practical-hypatia-gc37j4`).

## Siguiente paso

1. Verificar el lanzamiento de #110 (punto 1 de arriba) y correr `auditar_consistencia()` en Admin tras la primera factura/pago reales.
2. Elegir la próxima iniciativa (`docs/ROADMAP.md` → "Siguiente"/"Después"): **#125** al final; #119 y #101 esperan decisión tuya.
3. Opcional: borrar `.github/workflows/db-push-una-vez.yml` (workflow de un solo uso de #124 contra la base nueva; ya no tiene su secreto `PROD_NUEVA_DB_URL`).
4. Opcionales sin fecha: parcialidad y saldo insoluto del complemento (exige ampliar el parser); corregir un descuadre ligando o desligando cotizaciones sin
   resubir la factura (exige ampliar el CHECK de `cuentas_correcciones`); cancelar una cotización aprobada con factura o cobros, con traspaso (`docs/ROADMAP.md` → "Después").

## Deuda técnica

- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función (DROP + CREATE manual).
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014).
- **Sin respaldos en el plan Free** (ADR 020): con datos reales, respaldo manual antes de cualquier migración con `DROP`.
- La fecha de entrega de un histórico sigue editable desde Proyectos hasta que se defina ese módulo (ADR 025).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen.
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo: podrían leer la razón social de `datos_fiscales_serenata`.
- `rfc` entró en `PROVEEDOR_PUBLIC_COLUMNS` (desvío consciente de T8).
