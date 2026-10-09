# Trabajo activo

**Última actualización:** 2026-10-09 — **#110 lanzado a producción** (PR #136 fusionado; migraciones `20261039`–`20261041` aplicadas y verificadas; plan archivado en `docs/archive/frente2-historico-cuentas-110.md`); PR #100 cerrado. Antes (2026-10-08): **#123 «Facturas y pagos ligados»
(con #130 y #131) lanzada a producción.** PR [#129](https://github.com/EduardoTerwogt/serenata-erp/pull/129) fusionado en `main` como `35709b6`; issues #123, #130 y #131 cerrados.

## Estado

**`main` = `35709b6`** (merge commit, sin squash). Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1`
(#124, 2026-10-06). La base de producción tiene aplicadas **`20261030`–`20261037`** y está **verificada** (ver abajo); sigue sin datos
de negocio (solo `usuarios` y catálogos). **Iniciativa en ejecución (2026-10-09): #110, `docs/PLAN.md` v5 aprobado** (leer Cuentas sin recalcular el historial: B0 medición → B1 piso
de lectura → B2 histórico a 190 días → B3 puerta → B4 cierre; PR #100 cerrado como reemplazado; ADR 019 sustituida, ADR 025 aprobada). Migraciones `20261039`–`20261041` aplicadas en **test y producción**; B3 se redefinió con el usuario (5 usuarios simultáneos p95 < 800 ms; 10 = dato). El plan de #123 vive en
`docs/archive/facturas-pagos-ligados-123-130-131.md`. Decisiones: `docs/decisions/022` (#123), `023` (#130) y `024` (#131: PDF
obligatorio y archivos a Drive después de guardar).

**Cola de iniciativas:** **#110** (frente 2 v2; resuelve el gate de escala) → **#125** (llaves de Supabase legacy; prioridad baja,
revisión 2026-11-01, límite 2026-12-01). Aparte: #119 (alta mínima de cotizaciones, falta tu decisión) y #101 (diseño de Proyectos, sin arrancar).

## Completado en esta sesión (2026-10-08)

- **#131, rondas 2 y 3** (PR #132, sin migraciones nuevas salvo `20261037` de la ronda 1): R4 «datos primero, Drive después» con
  `pendiente:xml|pdf` y «Reintentar subida» (sin copia en Storage: el usuario la descartó); Subir factura y Registrar pago en tres
  pasos; PDF obligatorio con tope combinado ~4.2 MB; indicador de cuadre con atajo «Marcar SHxxx»; selección masiva; arrastrar y soltar;
  pantalla de guardado con «Ver en Cuentas»; Registrar pago con «Todas sus facturas / Elegir proyectos», reparto con barra y
  «Repartir automáticamente». Carrera real corregida en la captura del proveedor nuevo (`AltaProveedor`, actualizaciones funcionales).
- **Fusión:** #132 → rama de #129 (merge commit `0d3cf80`), luego #129 → `main` (`35709b6`).
- **Producción, antes del merge** (gate de producción vacía: 0 filas en cotizaciones, clientes, proveedores y tablas de cuentas):
  M1 `20261030`, M2 `20261031`, M3 `20261032`, `20261033`–`20261037` en orden. Por MCP todo salvo lo que lleva `DELETE`/`DROP`:
  **`cancel_cotizacion` (parte de M2) y M3 los corriste tú en el SQL Editor**; el resto de M2 se aplicó por MCP en partes porque el SQL Editor
  cortó el archivo de 53 KB a media función (ver "Trampas operativas").
- **Cierre documental:** plan archivado, decisión 024, ROADMAP, ARCHITECTURE y regla de migraciones.

## Tests ejecutados (resultado real)

- Local: `tsc` limpio, lint sin errores, **1,313 pruebas unitarias**; e2e `cuentas-acciones` 42/42 (escritorio y móvil); `smoke` + `critical` 178 pasados / 2 omitidos
  antes de la última corrección de la carrera (después: ese e2e 20/20 aislado).
- CI de `a6b51a3` (#132): `test`, `fresh-db`, `smoke-and-critical` verdes; `live` rojo en la 1.ª corrida solo por `cuentas-paridad-sql › proyecto seleccionado` con `57014`
  (flake conocido) y **verde en la 2.ª**. CI de #129 en `0d3cf80` (todo #132 dentro): `test`, `fresh-db`, `smoke-and-critical` y `live` verdes.
- **Producción tras aplicar:** los **36** cuerpos de función de `20261030`–`20261037` coinciden con los archivos (md5 de `prosrc`, 0 diferencias); lenguaje,
  `SECURITY DEFINER`, volatilidad, `proconfig` y ACL coinciden con test (solo `postgres` y `service_role` ejecutan); columnas, restricciones e índices
  de las tablas de cuentas = test (únicas diferencias esperadas: `loadtest_runs` solo en test y el envoltorio `estado_cuenta` de 3 argumentos, que ya
  es el de `20261034`); `auditar_consistencia()` = **0** con **24 guardas**; M3 verificada (RPC viejas, `pago_operations` y columnas retiradas; `pago_id`/`grupo_id` NOT NULL).
- **No se verificó desde la sesión:** el estado del deploy de Vercel de `35709b6` ni el comportamiento real de Subir factura/Registrar pago en producción (sin
  salida de red a `*.vercel.app`). Es lo primero que toca revisar (abajo).

## Problemas abiertos

- **Gate de escala (#110):** con B1+B2 en local (10 años, 2017–2025 archivados), 5 usuarios con el comportamiento real cumplen p95 < 800 ms; 10 usuarios ≈ 1–1.5 s en Micro (dato, no puerta). Falta correr `scripts/loadtest/k6/cuentas.js` contra un deploy real. `escala.yml` es manual y no bloquea.
- **Flake `57014`** en `cuentas-paridad-sql` (job `live`): un rojo se confirma con un solo re-run; dos seguidos son reales. Flake intermitente en
  `cuentas-principal.spec.ts:45` (móvil) y en un test de Cotizaciones bajo carga.
- Un error aislado de Realtime (`no partition of relation "messages"`) el 2026-10-06 00:50 UTC: confirmar que las particiones diarias se siguen creando.
- **Historial de migraciones de producción:** quedó con nombres por partes (`20261031_b2_m2_parte_N…`, `20261034_c1_parte_N…`) y **sin** entradas para
  `cancel_cotizacion` y M3 (corridas en el SQL Editor). Es cosmético; el estado real se verifica con `md5(prosrc)` contra los archivos, no con el historial.
- Un PDF real de más de ~4 MB no cabe en Subir factura (límite de Vercel); la salida es «Subir archivo» desde el detalle (decisión 024).

## Trampas operativas

- **El MCP de Supabase retiene todo SQL con `DELETE`/`DROP`** esperando una confirmación que nadie ve y **expira a los 60 s sin error**: ese SQL lo corre una persona en el
  SQL Editor. `apply_migration` sí acepta DDL aditivo con comentarios, pero hay que partir lo grande (las migraciones de ≥ 50 KB) y verificar con `md5(prosrc)`; el
  `success` no prueba nada. El SQL Editor cortó el archivo grande de 53 KB a media función (`unterminated dollar-quoted string` en `cuentas_periodo`); bloques de
  una función o con `BEGIN/COMMIT` cortos (`cancel_cotizacion`, M3) sí corrieron. Detalle en `.claude/rules/migraciones.md`.
- Todo lector nuevo de `archivo_url` debe tratar el valor `pendiente:*` (decisión 024). Drive no está configurado en Preview: ahí siempre se ve «Archivo pendiente».
- La base local de validación (Postgres 16) no sobrevive a la sesión: reconstruir con las migraciones en orden + seeds.
- Para correr Playwright local: los navegadores del contenedor son `chromium-1194` y el repo pide otra versión; usar una config local con
  `launchOptions.executablePath` (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) y las variables de `smoke-and-critical` (`PLAYWRIGHT_E2E_BYPASS=true`, etc.).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni `*.vercel.app` (proxy): verificar por MCP o Actions.

## Pendiente del usuario

0. **#110 (tras el lanzamiento):** correr `scripts/loadtest/k6/cuentas.js` (VUS=5) contra un deploy real y revisar `Server-Timing` de `periodo`; tomar un respaldo manual antes de que haya datos reales que archivar; confirmar que el cron `keep-alive` responde 200 con `archivado.ok`. Pendiente de decisión (opcional): congelar el régimen fiscal desde que un proyecto se resuelve, no solo al archivarlo (ADR 025).

1. **Tras el deploy de `35709b6`:** que el deploy de Vercel haya terminado bien; **subir la Constancia de Situación Fiscal de Serenata** en Admin → Datos fiscales (sin ella las
   rutas de factura fallan a propósito, 409); confirmar que `ANTHROPIC_API_KEY` está en Vercel (la lectura de constancias usa IA; sin ella el formulario llega vacío y se captura a mano);
   probar Subir factura (con XML y PDF) y Registrar pago en producción; revisar en Vercel → Functions que no haya errores nuevos.
2. De #124: borrar el PDF de prueba de Drive; avisar a los usuarios que recarguen (Cmd/Ctrl+Shift+R) y recomendar cambio de contraseña; borrar el secreto
   `PROD_NUEVA_DB_URL` de GitHub; apuntar el conector `supabase-prod` al ref nuevo y revisar `.env.local`; borrar el proyecto viejo `fwmyoqokcjtldiofuxdg` en Supabase.
3. Decidir #119 (alta mínima de cotizaciones). Opcional: borrar la rama ya fusionada `claude/ajustes-131` (y `claude/admiring-faraday-i5w9yj`).

## Siguiente paso

1. Verificar el lanzamiento (punto 1 de arriba) y correr `auditar_consistencia()` en Admin tras la primera factura/pago reales.
2. **#110** (frente 2 v2): plan v5 aprobado y en ejecución; seguir el tracker de `docs/PLAN.md` (B0 medición fiel a 10 años en curso). El pago por proyecto lee de `cuentas_proyectos_selector` y `estado_cuenta(p_proyectos)`, con llave (proyecto, contraparte).
3. Limpieza de #124 (quitar el ref viejo `fwmyoqokcjtldiofuxdg` de `app/api/internal/env-check/route.ts` y su test, y borrar
   `.github/workflows/db-push-una-vez.yml`, cuando borres la base vieja); **#125** al final.
4. Opcionales sin fecha: parcialidad y saldo insoluto del complemento (exige ampliar el parser); corregir un descuadre ligando o desligando cotizaciones sin
   resubir la factura (RPC de reasignación como corrección registrada; exige ampliar el CHECK de `cuentas_correcciones`, DDL que correría una persona);
   cancelar una cotización aprobada con factura o cobros, con traspaso (`docs/ROADMAP.md` → "Después").

## Deuda técnica

- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **Frente 2 de Cuentas** (#110): es lo que resuelve el gate de escala.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función.
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014).
- **Sin respaldos en el plan Free** (ADR 020): con datos reales, respaldo manual antes de cualquier migración con `DROP`.
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen; la regla de `.claude/rules/migraciones.md` sobre `cuentas_conceptos_derivar` está
  caduca (la función no existe en `main`).
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo: podrían leer la razón social de
  `datos_fiscales_serenata` (no necesario para #123).
- `rfc` entró en `PROVEEDOR_PUBLIC_COLUMNS` (desvío consciente de T8).
