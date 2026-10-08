# Trabajo activo

**Última actualización:** 2026-10-08 (#131: ajustes de UX/UI de Subir factura y Registrar pago en el PR [#132](https://github.com/EduardoTerwogt/serenata-erp/pull/132); #123 y #130 siguen en el PR #129, sin lanzar).

## Estado

**Para retomar #123: el código vive en la rama `claude/admiring-faraday-i5w9yj` (PR en borrador
[#129](https://github.com/EduardoTerwogt/serenata-erp/pull/129)), no en `main`.** Antes de tocar nada:
`git fetch origin claude/admiring-faraday-i5w9yj && git switch claude/admiring-faraday-i5w9yj`.

**Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1`** desde el 2026-10-06 (#124 cerrado,
`docs/archive/produccion-ohio.md`, decisión 021). **Producción no se ha tocado para #123:** ninguna migración aplicada,
nada mergeado a `main`.

**#123 «Facturas y pagos ligados» — B0 a B6a hechos y documentados** (`docs/PLAN.md`, decisión
`docs/decisions/022-facturas-y-pagos-ligados.md`). Una factura cubre varias cotizaciones y un pago cubre varias facturas.
Instrucción permanente tuya: ejecutar el plan completo, consultarte solo dudas de producto y **avisarte cuando esté listo para
revisar antes de producción**: este es ese aviso. Sin aplicar nada a producción ni mergear a `main` hasta tu revisión.
**#130** («Alta de contraparte y pago por proyecto», decisión `docs/decisions/023-alta-de-contraparte-y-pago-por-proyecto.md`) se construyó en el mismo PR: C0–C5 hechos (`docs/PLAN.md`, sección #130). Subir factura da de alta al proveedor o completa la ficha del cliente con su constancia, asigna renglones o registra un gasto extra; Registrar pago tiene la vista «Por proyecto». Migraciones `20261034` y `20261035` aplicadas en test; **`auditar_consistencia()` = 0 con 24 guardas**.
**#131 (ajustes tras tu revisión del preview, subissue de #123)** vive en la rama `claude/ajustes-131` (PR en borrador #132, base `claude/admiring-faraday-i5w9yj`; si #129 se lanza antes, se reapunta a `main`). Maqueta aprobada: `docs/design/cuentas-123/cuentas-131.html`. Hecho: «Adjuntar factura» (XML y PDF en un botón), desplegable de contraparte con buscador (solo con pendientes; migración **`20261037`**, aplicada en test, y `GET /api/cuentas/contrapartes`), «Proveedor nuevo» al costado, factura de proveedor en un solo flujo por proyecto, Registrar pago sin pestañas (enlace «Pagar varios proyectos a la vez») y «concepto» donde decía «renglón». **Orden de migraciones del lanzamiento: `20261030`–`20261036` y luego `20261037`.** **Ronda 2 (2026-10-08, sin migraciones):** el pie de las ventanas ya no parte los botones; Registrar pago pone el desplegable donde estaban los avisos y «Pagar varios proyectos a la vez» lista solo los proyectos de la contraparte elegida; Subir factura de proveedor sugiere el proyecto con casilla marcada y el desplegable «Elegir otro proyecto»; la factura (cliente, proveedor o complemento) se guarda **antes** de subir sus archivos a Drive: si Drive falla el documento queda con `archivo_url = pendiente:xml|pdf`, se ve «Archivo pendiente» y «Reintentar subida» (pantalla de guardado) o «Subir archivo» (Documentos) reenvía solo el archivo (`POST /api/cuentas/documentos/[id]/reintentar-subida`). Las demás rutas que usan esos servicios siguen con Drive primero. **Ronda 3 (UX/UI, sin migraciones; referencia visual: artefacto «Subir factura y Registrar pago · propuesta UX»):** Subir factura y Registrar pago en tres pasos ①②③; el PDF es obligatorio en Subir factura (P30, tope combinado XML + PDF de ~4.2 MB); indicador de cuadre con atajo «Marcar SHxxx»; listas con «N de M marcadas» y «Marcar/Quitar todas»; conceptos bloqueados del proveedor plegados; arrastrar y soltar el XML y el PDF; complemento con nombre de factura y contraparte; pantalla de guardado con resumen y «Ver en Cuentas»; Registrar pago con el modo «Todas sus facturas / Elegir proyectos», reparto con barra aplicado/saldo y facturas abiertas solas cuando llevan monto, y «Repartir automáticamente». Falta tu revisión del preview y el lanzamiento junto con #129.
Orden de la cola: **#123 → #130 → #110 → #125** (#130 antes de #110 porque el pago por proyecto cambia lo que #110 materializa; #125 baja prioridad, revisión 2026-11-01, límite 2026-12-01).

## Tracker de #130

| Bloque | Estado |
|---|---|
| C0 Diseño · C1 Datos (`20261034`, `20261035`, en test) · C2 API | Hecho |
| C3 UI Subir factura · C4 UI Registrar pago por proyecto | Hecho (unitarias, e2e `cuentas-acciones` 38/38 escritorio y móvil) |
| C5 Cierre: spec `live` `cuentas-130.spec.ts`, decisión 023, `ARCHITECTURE.md`, `auditar_consistencia()` = 0 | Hecho; **el spec `live` solo corre en CI** (necesita las llaves de test) y sus escenarios se verificaron antes con SQL en test con rollback |

## Tracker de #123

| Bloque | Estado |
|---|---|
| B0 Preparación · B1 Permisos P14 | Hecho |
| B2 Capa de datos (M1/M2/M3 + TS) | Hecho **en test** |
| B3 API nueva y lecturas | Hecho |
| B4a Menú Acciones y Registrar pago · B4b Subir factura y complemento · B4c Estado de cuenta y fichas · B4d detalle (P22) y chips (P20) | Hecho |
| B5 Portal solo lectura | Hecho |
| B6a Constancia fiscal de Serenata en Admin (migración `20261033`, aplicada en test) | Hecho |
| B6 Cierre (decisión 022, `ARCHITECTURE.md`, `TESTING.md`, 011/017/020, ROADMAP) | Documentación hecha; **archivar el plan y cerrar #123 al lanzar** |

## Completado en esta sesión (2026-10-07, tercera parte)

- **UI fiel al mockup aprobado:** iconos de Acciones (rayo en escritorio y móvil; tarjeta, recibo), fichas de icono en el menú, encabezado de la lista de cotizaciones, Resumen del estado de cuenta en tarjetas, etiqueta «otro mes» y aviso de proveedor en Subir factura. **Desvíos conscientes:** sin «Vence» (el CFDI no la trae; se muestra «Emitida») y sin parcialidad ni saldo insoluto en el complemento (exige ampliar el parser).
- **Latencia:** `cuentas_conceptos` a plpgsql + `force_custom_plan` (guarda en `migrations.yml`, regla en `.claude/rules/migraciones.md`). Resultado en aviso 4: el gate de escala sigue rojo en lecturas globales.
- **Decisión de orden (tuya):** #123 → **#130** → #110, porque el pago por proyecto cambia lo que #110 materializa.
- **Tests (resultado real):** CI de `11e96d9` en verde: `test`, `fresh-db`, `smoke-and-critical`, `live`. `escala.yml` (manual) rojo en `0d02802`. Local: `tsc`, eslint y 26 tests de `app/cuentas` en verde tras el último cambio de UI.

## Completado en la sesión anterior (2026-10-07, segunda parte)

- **B4 (UI):** menú **Acciones** (un menú, dos disparadores) con **Subir factura**, **Registrar pago**, **Orden de pago** y
  **Estado de cuenta** (`app/cuentas/components/acciones/`); estado en la URL (`sheet`, `lado`, `cid`, `doc`, `pre`); el cliente
  solo calcula en centavos (`reparto.ts`, con tests); "la más antigua primero" sobre el orden que entrega SQL; `candidatos_cambiaron`
  recarga; idempotencia con `runIdempotentPagoSubmit` (dominios `cuentas-pagos-*`). Chips de factura y pago compartido en la lista
  (P20). Botón **Estado de cuenta** y captura de **RFC** en las fichas de cliente y proveedor (P28). El detalle ya no tiene
  formulario de pago ni alta de XML: sus botones abren las ventanas con la contraparte y el proyecto preseleccionados (P22).
- **B5 (Portal):** `GET /api/portal/cuentas` agrega por grupo los pagos recibidos, qué otras facturas cubrió el mismo pago y si
  falta el complemento PPD; sale de `estado_cuenta` del proveedor de la **sesión**; el Portal solo lo muestra.
- **B6a:** Admin → **Datos fiscales**: subir la Constancia de Situación Fiscal de Serenata, leerla (lector con IA ya existente,
  extendido a RFC, razón social y régimen), validarla (estructura del RFC, 12/13 = moral/física, consistencia con el régimen),
  **corregir y confirmar** antes de guardar; historial. `serenataRfc()` lee de `datos_fiscales_serenata`; sin constancia las rutas
  de factura fallan (409). El Dashboard deriva el ISR del tipo de persona de la constancia. `SERENATA_RFC` ya no existe.
- **Tests locales:** `tsc`, lint (0 errores), vitest 1165 en verde; `smoke` + `critical` con mocks en verde en escritorio y móvil
  (las únicas fallas de una corrida completa fueron `portal-factura` por una carrera con mis mocks y ya pasan).
- **Test (`serenata-erp-test`):** migración `20261033` aplicada y constancia de prueba `SHO100101AB1` cargada.

## Revisión del PR #129 (2026-10-07, tras tu revisión manual)

CI de `6d6eea7`: `live` rojo por una carrera real en el gasto extra (corregida con la migración `20261036`, aplicada en test) y el flake de `cuentas-paridad-sql` (57014; sin regresión: 8,041 buffers contra 7,965). Auditoría de UI contra el design system y correcciones de encimes en móvil; detalle y desvíos conscientes en `docs/PLAN.md` (sección "Revisión del PR #129"). Orden de lanzamiento: `20261034`, `20261035` y **`20261036`** después de `20261033`.

CI de `f182c96`: `live` 92/93; `cuentas-130.spec.ts` 6/6. Solo cayó `cuentas-paridad-sql › proyecto seleccionado` con `57014` (latencia de las lecturas globales; se atribuye a #110 V2–V3, sin regresión: 8,041 buffers contra 7,965). Además `cleanupLiveCuentasByPrefix` no borraba `historial_cambios_responsable_item` y mi spec dejó filas `LC130…` en test (`auditar_consistencia()` = 6 hasta que el `beforeAll` del siguiente `live` las limpie); helper corregido.

## Avisos para la entrega (léelos antes de aprobar)

1. **Orden de lanzamiento a producción:** gate de producción vacía (recontar) → M1 `20261030` → M2 `20261031` → **M3 `20261032`
   la corre una persona** en el SQL Editor (lleva DROP/DELETE; el MCP los retiene) → `20261033` → **`20261034`, `20261035` y `20261036` (#130, aditivas, sin DROP)** → merge del PR #129 →
   **subir la constancia de Serenata en Admin → Datos fiscales ANTES de abrir las rutas de factura** (sin ella fallan a propósito).
   Producción **no** lleva `20260915_loadtest_runs.sql`. Producción es plan Free, sin respaldos: respaldo manual antes de M3.
2. Las **3 preguntas de producto** se resolvieron con las propuestas del plan; la 3.ª (**corregir un descuadre ligando o
   desligando cotizaciones sin resubir la factura**) **no se construyó**: hoy el camino es marcar válida o reemplazar la factura.
   Si lo quieres, es una RPC de reasignación como corrección registrada que exige ampliar el CHECK de `cuentas_correcciones` (DDL
   que correría una persona).
3. **P14 ya está aplicado:** cualquiera con la sección `cuentas` puede reabrir, corregir y reemplazar facturas.
4. **Latencia (gate rojo, conocido):** `cuentas_conceptos` pasó a plpgsql + `force_custom_plan` (309,077 → 7,965 buffers en test,
   resultado idéntico). `escala.yml` en `0d02802` **no cumple** p95 < 800 ms en las lecturas globales (mes 2308, año 1634, lista 1506,
   resumen 1257, avisos 1086; antes 1570/1637/1867/1368/1602). El guardado (K6) sí pasa (POST 423 ms). Causa: cada lectura global
   re-deriva todo el historial; el arreglo es #110 V2–V3 (materializar), que va **después de #130**. `escala.yml` es manual y no bloquea
   el merge; hoy producción está vacía y el dataset de escala (≈16 mil conceptos) es mucho mayor que el real. Decides si lanzas con esto.
5. `scripts/db/escala-limpiar.sql` y M3 llevan DELETE/DROP: los corre una persona.
6. `rfc` entró en `PROVEEDOR_PUBLIC_COLUMNS` (desvío consciente de T8).
7. Restos de siembra en test (`seed-cuentas-test.sql`, ids `c_fx_*`): son datos de prueba.
8. Los commits de las dos sesiones anteriores salen con `noreply@anthropic.com`; los de esta sesión con
   `eduardoterwogth@gmail.com`. Vercel desplegó los previews sin queja.
9. **La lectura de la constancia usa IA** (como la de proveedores) y necesita `ANTHROPIC_API_KEY`; sin ella el formulario llega
   vacío y se captura a mano. Nada se guarda sin tu confirmación y el servidor vuelve a validar.
10. **Drive:** las rutas nuevas guardan en `/Por Cobrar/<cliente>/` y `/Por Pagar/<proveedor>/`; la constancia en
    `Datos fiscales Serenata`. El PDF viaja con el XML (≤ 4 MB cada uno, límite de Vercel).

## Problemas abiertos

- **CI del PR #129:** `test`, `fresh-db`, `smoke-and-critical` y `live` en verde en `0d02802`; solo `escala` (manual) en rojo, ver aviso 4.
- Durante B2 el `live` falló por `statement_timeout` en `cuentas_conceptos` bajo carga; vigilar si reaparece. Dos rojos seguidos
  del mismo spec son reales; uno se confirma con un solo re-run.
- Un error aislado de Realtime (`no partition of relation "messages"`) el 2026-10-06 00:50 UTC; confirmar que las particiones
  diarias se siguen creando. Flake intermitente en `cuentas-principal.spec.ts:45` (móvil).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni `*.vercel.app` (proxy): verificar por MCP o Actions.

## Trampas operativas (leer antes de tocar la base de test)

- **El MCP de Supabase retiene todo SQL con DELETE/DROP esperando confirmación interactiva** y expira a los 60 s: eso lo corre una
  persona en el SQL Editor. **El SQL Editor rechaza funciones con líneas de comentario o `BEGIN/COMMIT`**: pegar la versión sin
  comentarios, extraída por marcador y comprobada con `md5(prosrc)`, nunca por número de línea.
- `apply_migration` del MCP sí acepta DDL aditivo con comentarios (así se aplicó `20261033` a test; ojo: queda con otro nombre en
  el historial de migraciones de test).
- La base local de validación (Postgres 16) no sobrevive a la sesión: reconstruir con las migraciones en orden + seeds.
- Para correr Playwright local: los navegadores del contenedor son `chromium-1194` y el repo pide otra versión; usar una config
  local con `launchOptions.executablePath` (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) y las variables de
  `smoke-and-critical` (`PLAYWRIGHT_E2E_BYPASS=true`, etc.).

## Pendiente del usuario

- **Revisar #123** (PR #129; avisos de arriba) y decir si se lanza. Para B6a necesitará pasar la **Constancia de Situación
  Fiscal de Serenata** (PDF) en Admin → Datos fiscales al lanzar.
- De #124: revisar en Vercel → Functions que no haya errores nuevos; borrar el PDF de prueba de Drive; avisar a los usuarios que
  recarguen (Cmd/Ctrl+Shift+R) y recomendar cambio de contraseña; borrar el secreto `PROD_NUEVA_DB_URL` de GitHub; apuntar el
  conector `supabase-prod` al ref nuevo y revisar `.env.local`; borrar el proyecto viejo `fwmyoqokcjtldiofuxdg` en Supabase.
- Decidir #119 (alta mínima de cotizaciones).

## Siguiente paso

-1. **Siguiente: ajustes de UX/UI y de lógica de producto tras tu revisión del preview de `f182c96`** (issue de seguimiento, subissue de #123). Se trabajan en una **rama nueva que sale de `claude/admiring-faraday-i5w9yj`**, con su PR apuntando a la rama de #129 (no a `main`), en una sesión nueva; el cierre de sesión se hace en la rama del PR, no en `main`. Las migraciones nuevas son `20261037` en adelante. No se lanza nada a producción hasta cerrar esos ajustes.
0. **#130 ya está hecho en la rama** (aviso arriba). Falta: CI verde del último commit (incluido `live`), tu revisión visual de Subir factura (alta de proveedor, gasto extra, completar cliente) y Registrar pago «Por proyecto», y lanzar con #123. Para #110: el pago por proyecto lee de `cuentas_proyectos_selector` y `estado_cuenta(p_proyectos)`, con llave (proyecto, contraparte); #110 solo cambia de dónde se lee. Pendiente opcional: parcialidad y saldo insoluto del complemento.
1. **Tu revisión de #123** y, si la aprueba, el **lanzamiento** (aviso 1). Al lanzar: verificar `auditar_consistencia()` = 0 en
   producción, archivar `docs/PLAN.md` en `docs/archive/`, cerrar #123 y recrear `PLAN.md` vacío.
2. Después de #123 y #130: **#110** V2–V3; limpieza de #124 (quitar el ref viejo `fwmyoqokcjtldiofuxdg` de
   `app/api/internal/env-check/route.ts` y su test, y borrar `.github/workflows/db-push-una-vez.yml`, cuando borres la base
   vieja); **#125** al final.

## Deuda técnica

- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **Frente 2 de Cuentas** (#110): detrás de #123 y #130; es lo que resuelve el gate de escala.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función.
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014).
- **Drive en Preview apagado** (`GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview). **Sin respaldos en el plan Free** (ADR 020).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen; la regla de `.claude/rules/migraciones.md` sobre
  `cuentas_conceptos_derivar` está caduca (la función no existe en `main`).
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo:
  podrían leer la razón social de `datos_fiscales_serenata` (no necesario para #123).
