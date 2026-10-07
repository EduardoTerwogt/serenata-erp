# Trabajo activo

**Última actualización:** 2026-10-07 (#123: B0–B3 hechos en test y en rama; la sesión se cerró al terminar B3).

## Estado

**Para retomar #123: el código vive en la rama `claude/admiring-faraday-i5w9yj` (PR #129), no en `main`.** Hacer
`git fetch origin claude/admiring-faraday-i5w9yj && git switch claude/admiring-faraday-i5w9yj` antes de empezar; en `main`
no existen `lib/server/cuentas/{rfc,facturas,…}.ts`, las rutas nuevas ni las migraciones `20261030`–`20261032`.

**Producción corre en la base `ytlyphlgyhgztkfxwojt` (`us-east-2`) con Vercel en `cle1`** desde el 2026-10-06 (#124 cerrado,
`docs/archive/produccion-ohio.md`, decisión 021). **Producción no se ha tocado para #123:** ninguna migración aplicada, nada
mergeado a `main`.

**Iniciativa activa: #123 «Facturas y pagos ligados»** — `docs/PLAN.md` (aprobado). Una factura para varias cotizaciones,
un pago para varias facturas. **Rama `claude/admiring-faraday-i5w9yj`, PR en borrador
[#129](https://github.com/EduardoTerwogt/serenata-erp/pull/129)** (único PR de la iniciativa; no mergear hasta B6).
Orden vigente de la cola: **#123 → #110 → #125** (#125 baja prioridad, revisión 2026-11-01, límite 2026-12-01).

Instrucción permanente del usuario para #123: ejecutar el plan completo, consultarle solo dudas de **producto**, y avisarle
cuando el plan esté completo y listo para revisar **antes de lanzar a producción**. Sin aplicar nada a producción ni
mergear a `main` hasta esa revisión. La base de test se actualiza por el MCP `supabase-test`.

## Tracker de #123 (detalle en `docs/PLAN.md` → Tracker)

| Bloque | Estado |
|---|---|
| B0 Preparación, B1 Permisos P14 | Hecho |
| B2 Capa de datos (M1/M2/M3 + TS) | Hecho **en test** (producción: sin tocar) |
| B3 API nueva y lecturas | Hecho en código y tests |
| **B4a–d UI** | **Pendiente → siguiente paso** |
| B5 Portal solo lectura | Pendiente |
| B6a Constancia fiscal de Serenata en Admin (reemplaza `SERENATA_RFC`) | Pendiente, **al final**, antes de B6 |
| B6 Cerrar (decisión 022, docs, archivar plan) | Pendiente |

## Completado en esta sesión

- **B2:** migraciones `db/migrations/20261030_b2_m1_…aditiva.sql`, `20261031_b2_m2_…rpc_lectura.sql` (incluye
  `facturas_candidatos` y `estado_cuenta`), `20261032_b2_m3_contraccion.sql`; las tres **aplicadas en
  `serenata-erp-test`** (M3 y `cancel_cotizacion` las aplicó una persona en el SQL Editor). Test queda 100 % en el modelo nuevo:
  cabecera `pagos`, líneas `pagos_comprobantes`/`pagos_cuentas_pagar` con `pago_id`, `cuentas_cobrar.factura_documento_id`,
  23 guardas de `auditar_consistencia()` en 0. Capa TS (`registrar-pago`, `subir-factura`, `subir-factura-proveedor`,
  complementos), tests unitarios y specs `live`/seed/escala reescritos.
- **B1:** P14 aplicado (quien tiene la sección `cuentas` puede hacer todo en Cuentas).
- **B3:** parser de CFDI con tipo y conceptos; `lib/server/cuentas/{rfc,facturas,contrapartes,carpetas,estado-cuenta-rpc}.ts`;
  rutas `GET /api/cuentas/estado-cuenta`, `POST /api/cuentas/pagos`, `GET /api/cuentas/pagos/estado`,
  `POST /api/cuentas/facturas/preview`, `POST /api/cuentas/facturas`; `GET /api/clientes?q=` admite la sección `cuentas`
  (T8); `rfc` en clientes/proveedores (columna, esquemas Zod, `PROVEEDOR_PUBLIC_COLUMNS`); `docs/ENV.md` y `e2e.yml`.
- Plan: B6a nuevo (ver Decisiones). Tracker actualizado.

## Decisiones nuevas (de esta sesión)

- **El RFC de Serenata NO va en Vercel.** Pedido del usuario: subir la **Constancia de Situación Fiscal de Serenata** en el
  módulo Admin, leer RFC y datos fiscales (lector de PDF; el formato siempre es el mismo), **validarlos como con
  proveedores** y cargarlos; nada hardcodeado. Se difiere a **B6a** (`docs/PLAN.md`), al final de la iniciativa. Mientras
  tanto `SERENATA_RFC` (T20) es solo un **puente**; **no hay que darlo de alta en Vercel** (sin él, las rutas de factura
  fallan explícito, que es lo previsto) y CI usa el valor de prueba `SHO100101AB1` en `e2e.yml`. Que Serenata es persona
  moral está hardcodeado hoy (`lib/server/repositories/dashboard.ts`, `app/dashboard/page.tsx`); B6a lo deriva de la
  constancia. El lector de constancia de proveedores usa IA (`lib/server/portal/document-parser.ts`) y no extrae RFC.
- **Las 3 preguntas de producto abiertas se resolvieron con las propuestas del plan** (el usuario las revisará en la
  entrega): (1) anular un pago que cubre varios proyectos exige **todos** reabiertos; (2) Drive: `/Por Cobrar/<cliente>/` y
  `/Por Pagar/<proveedor>/`; (3) corregir un descuadre sin resubir (RPC de reasignación) queda para **B4b**.
- `rfc` se agregó a `PROVEEDOR_PUBLIC_COLUMNS` (`lib/server/repositories/proveedor-publico.ts`): desviación consciente de T8.

## Tests ejecutados (resultado real)

- Local (antes de pushear cada commit): `tsc`, lint y unit en verde; Postgres 16 local con todas las migraciones + seed +
  500 proyectos ESC; paridad SQL ↔ doble motor TS validada.
- CI en PR #129: **E2E `2ee176d` (código de B2) en verde, con `live`.** `test.yml` y `migrations.yml` (`fresh-db`) en verde
  también en `558f8b8`. **El E2E con las rutas de B3 (`86fdf8e` en adelante) no terminó en verde de forma confirmada:** los
  runs de `86fdf8e` y `0a86fc3` se cancelaron por pushes posteriores y los de `558f8b8`/`fcce2c9` seguían en curso al cerrar.
  **Primer paso de la próxima sesión: revisar el resultado de `e2e.yml` en la cabeza actual del PR** y arreglar lo que falle.
- Latencia medida: `cuentas_conceptos(2026, hoy)` local ≈ 480–590 ms (modelo viejo) vs 600–700 ms (nuevo), ≈ +20 %;
  `estado_cuenta` ≈ 560 ms en test, dominado por `cuentas_conceptos`. El test tiene mucho ruido (2× entre corridas). No se
  optimizó (un intento de restringir `p_comp_pago` a PPD no ayudó y se revirtió).

## Problemas abiertos

- E2E con las rutas de B3: sin confirmar (ver arriba). Durante B2 el `live` falló por `statement_timeout` en `cuentas_conceptos`
  bajo carga y por la paridad (`compartido`, ya corregido en `2ee176d`); vigilar si reaparece.
- `escala.yml`: la línea base de `escala.yml` ya fallaba en `main` (p95 800 ms) y no es indicador fiable de regresión; el
  `cuentas_conceptos` ≈ +20 % local debe revisarse con `escala.yml` antes de lanzar.
- Los commits de esta rama salen con el correo `noreply@anthropic.com`, no con `eduardoterwogth@gmail.com`
  (`.claude/rules/git.md`). Vercel desplegó los previews sin queja; si el deploy de producción rechaza, reautorar.
- Un error aislado de Realtime (`no partition of relation "messages"`) el 2026-10-06 00:50 UTC; confirmar que las particiones
  diarias se siguen creando. Flake intermitente en `cuentas-principal.spec.ts:45` (móvil).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni `*.vercel.app` (proxy): verificar por MCP o Actions.

## Trampas operativas que costaron tiempo (leer antes de tocar la base de test)

- **El MCP de Supabase retiene todo SQL con DELETE/DROP esperando confirmación interactiva** y expira a los 60 s: eso lo corre
  una persona en el SQL Editor (por eso M3 y `cancel_cotizacion`). Incluye `scripts/db/escala-limpiar.sql`.
- **El SQL Editor de Supabase rechaza funciones con líneas de comentario o `BEGIN/COMMIT`**: pegar la versión sin comentarios.
  Nunca extraer un bloque de un archivo por número de línea (se desplaza): extraer por marcador y comprobar con `md5(prosrc)`.
- `scripts/db/test-123-pendientes-mcp.sql` es **temporal** (lo que el MCP no pudo aplicar a test): **borrarlo en B6**.
- La base local de validación (`/var/tmp/pgl`, Postgres 16) **no sobrevive** a la sesión: reconstruir con las migraciones en
  orden + `scripts/seed-cuentas-test.sql` y `scripts/db/escala-generador.sql` si se necesita.
- Restos de siembra en test (`seed-cuentas-test.sql`, ids `c_fx_*`) se dejaron: son datos de prueba.

## Pendiente del usuario

- **Ninguno para #123 por ahora.** (Para B6a necesitará pasar una Constancia de Situación Fiscal de Serenata de ejemplo.)
- De #124: revisar en Vercel → Functions que no haya errores nuevos; borrar el PDF de prueba de Drive; avisar a los usuarios
  que recarguen (Cmd/Ctrl+Shift+R) y recomendar cambio de contraseña (los hashes se copiaron tal cual); borrar el secreto
  `PROD_NUEVA_DB_URL` de GitHub; apuntar el conector `supabase-prod` al ref nuevo y revisar `.env.local`; borrar el proyecto
  viejo `fwmyoqokcjtldiofuxdg` en Supabase (recomendado tras el keep-alive del 2026-10-07 y un día de uso normal).
- Decidir #119 (alta mínima de cotizaciones).

## Siguiente paso

1. **Revisar el CI de PR #129** (`e2e.yml`, `test.yml`, `migrations.yml`) en la cabeza actual y corregir lo que falle.
2. **B4 (UI)** en `docs/PLAN.md` → B4, contra `docs/design/cuentas-123/cuentas-acciones.html`: B4a menú «Acciones» y ventana
   «Registrar pago» (consume `GET /api/cuentas/estado-cuenta` y `POST /api/cuentas/pagos`; selector de contraparte con
   `GET /api/proveedores` y `GET /api/clientes?q=`), B4b «Subir factura/complemento» (preview, preselección por folios SH),
   B4c estado de cuenta y botones en las fichas, B4d P22 + chip P20. Cliente solo calcula en centavos enteros y solo para
   pintar (T6). Actualizar mocks/specs e2e (`cuentas-ordenes.spec.ts`, `cuentas-detalle-mocks.ts`).
3. **B5** portal solo lectura; **B6a** constancia de Serenata en Admin; **B6** cierre (decisión 022, `ARCHITECTURE.md`,
   `TESTING.md`, `docs/ENV.md`, 020, ROADMAP, archivar plan, borrar el script temporal).
4. **Al terminar el plan: avisar al usuario** («listo para revisar antes de producción») con los puntos de `docs/PLAN.md` →
   B6 → «Avisos para la entrega».
5. Después de #123: **#110**; limpieza de #124 (quitar el ref viejo `fwmyoqokcjtldiofuxdg` de `app/api/internal/env-check/route.ts`
   y su test, y borrar `.github/workflows/db-push-una-vez.yml`, cuando el usuario borre la base vieja); **#125** al final.

## Deuda técnica

- **Llaves legacy de Supabase** (#125): límite interno 2026-12-01.
- **Frente 2 de Cuentas** (#110): detrás de #123.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que toque esa función.
- **`realtime-js` fijo en 2.112.0** (la guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin pasar el JWT por `accessToken`).
- **Job `live` intermitente** (`cotizaciones-colaboracion*.spec.ts`, `cuentas-paridad-sql`, 57014): un flake se confirma con un re-run; dos rojos seguidos son reales.
- **Drive en Preview apagado** (`GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview). **Sin respaldos en el plan Free** (ADR 020).
- `DESIGN_SYSTEM.md` describe un tema oscuro y `#FF5A1A` que ya no existen; la regla de `.claude/rules/migraciones.md` sobre
  `cuentas_conceptos_derivar` está caduca (la función no existe en `main`).
