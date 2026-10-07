# Trabajo activo

**Última actualización:** 2026-10-07 (#123 ejecutado completo en la rama y en test; falta tu revisión y el lanzamiento).

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
Orden de la cola: **#123 → #110 → #125** (#125 baja prioridad, revisión 2026-11-01, límite 2026-12-01).

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

## Completado en esta sesión (2026-10-07, segunda parte)

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

## Avisos para la entrega (léelos antes de aprobar)

1. **Orden de lanzamiento a producción:** gate de producción vacía (recontar) → M1 `20261030` → M2 `20261031` → **M3 `20261032`
   la corre una persona** en el SQL Editor (lleva DROP/DELETE; el MCP los retiene) → `20261033` → merge del PR #129 →
   **subir la constancia de Serenata en Admin → Datos fiscales ANTES de abrir las rutas de factura** (sin ella fallan a propósito).
   Producción **no** lleva `20260915_loadtest_runs.sql`. Producción es plan Free, sin respaldos: respaldo manual antes de M3.
2. Las **3 preguntas de producto** se resolvieron con las propuestas del plan; la 3.ª (**corregir un descuadre ligando o
   desligando cotizaciones sin resubir la factura**) **no se construyó**: hoy el camino es marcar válida o reemplazar la factura.
   Si lo quieres, es una RPC de reasignación como corrección registrada que exige ampliar el CHECK de `cuentas_correcciones` (DDL
   que correría una persona).
3. **P14 ya está aplicado:** cualquiera con la sección `cuentas` puede reabrir, corregir y reemplazar facturas.
4. **Latencia:** `cuentas_conceptos` pasó a plpgsql + `force_custom_plan` (309,077 → 7,965 buffers en test, resultado idéntico). Falta
   confirmar `escala.yml` en la rama (p95 < 800 ms); si no cumple, #110 V2–V3 (ver decisión 022, notas de honestidad).
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

- **CI del PR #129:** `test` y `fresh-db` en verde en `558f8b8` (B3); el E2E de esa cabeza terminó en verde (incluido `live`).
  El de la cabeza actual (`d29a01b` en adelante) se está corriendo: **revisarlo primero** al retomar.
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

1. **Revisar el CI de PR #129** (`e2e.yml`, `test.yml`, `migrations.yml`) en la cabeza actual y corregir lo que falle.
2. **Tu revisión de #123** y, si la aprueba, el **lanzamiento** (aviso 1). Al lanzar: verificar `auditar_consistencia()` = 0 en
   producción, archivar `docs/PLAN.md` en `docs/archive/`, cerrar #123 y recrear `PLAN.md` vacío.
3. Después de #123: **#110**; limpieza de #124 (quitar el ref viejo `fwmyoqokcjtldiofuxdg` de
   `app/api/internal/env-check/route.ts` y su test, y borrar `.github/workflows/db-push-una-vez.yml`, cuando borres la base
   vieja); **#125** al final.

## Deuda técnica

- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **Frente 2 de Cuentas** (#110): detrás de #123.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función.
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014).
- **Drive en Preview apagado** (`GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview). **Sin respaldos en el plan Free** (ADR 020).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen; la regla de `.claude/rules/migraciones.md` sobre
  `cuentas_conceptos_derivar` está caduca (la función no existe en `main`).
- Los PDFs (`cotizacion-pdf*.ts`, `orden-pago-pdf.ts`, `hoja-llamado-pdf.ts`) siguen con "Serenata House Entertainment" fijo:
  podrían leer la razón social de `datos_fiscales_serenata` (no necesario para #123).
