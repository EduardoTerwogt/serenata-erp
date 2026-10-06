# Trabajo activo

**Última actualización:** 2026-10-06 (#124 ejecutado: producción y Vercel en Ohio; falta la vigilancia de 7 días).

## Estado

**Producción corre en la base nueva `ytlyphlgyhgztkfxwojt` (`us-east-2`, Postgres 17.11) con Vercel en `cle1`**
desde el 2026-10-06 ~01:05 UTC (19:05 CDMX del 5 de octubre). `main` en `9891c57` más el commit de documentación de
cierre. La base vieja `fwmyoqokcjtldiofuxdg` (`us-west-2`) está **pausada** como respaldo de infraestructura durante
7 días. **`docs/PLAN.md` = #124, en R4 (cierre).**

Cola acordada con el usuario (reordenada el 2026-10-06):
1. **#124** — producción y Vercel a Ohio. Ejecutado; falta cerrar (ver "Siguiente paso").
2. **#123** — nueva lógica de cuentas (una factura para varias cotizaciones, un pago para varias facturas).
3. **#110** — frente 2 v2 de Cuentas. Plan auditado en el cuerpo del issue; **depende de #123**.
4. **#125** — llaves de Supabase legacy → publishable/secret. **Prioridad baja, última.** Las legacy dejan de
   funcionar a fin de 2026 (documentación de Supabase); fecha límite interna **2026-12-01**, revisión el
   **2026-11-01** (si no ha arrancado, pasa al frente). Insumos en el issue y sus comentarios.

## Completado en esta sesión (2026-10-05/06)

- **R1:** producción nueva creada con `db push` (workflow de un solo uso `db-push-una-vez.yml`, 141 migraciones);
  huellas de esquema idénticas a la vieja, incluidas GRANTs, extensiones, políticas de Realtime y RLS.
- **R3:** corte por variables de Vercel más *Redeploy*; verificación del usuario (login, cotización, flujos); reinicio
  de datos de prueba; `GO_LIVE`.
- **R2/R4 en código (PR #126):** `vercel.json` → `cle1`; huella de esquema extendida; `preview-latency.yml` con mediana,
  máximo y selector de credenciales; `env-check` protege los dos refs de producción; decisión 021.
- **Deploy en `cle1`:** `dpl_AH6znhRz…` READY, alias `serenata-erp.vercel.app`. CI de `main` (Test Suite, Migrations, E2E con
  `live`) en verde.
- **Test:** pausado y reactivado durante el corte; subido a Postgres `17.11.0.002` (igual que producción).
- **`escala.yml`** en verde sobre `main`: línea base nueva con test en 17.11.
- **Medición:** `/api/cuentas/periodo` en producción, mediana 443 ms antes y 409 ms después (9 recargas, rango 269–698):
  mejora dentro del ruido. El beneficio de #124 es la alineación de regiones, no una mejora grande de latencia en
  producción (ver `docs/decisions/021-region-ohio.md`).

## Decisiones nuevas

- **021** reemplaza a la 018: todo en Ohio (`us-east-2` / `cle1`).
- Orden de iniciativas (2026-10-06): #124 → #123 → #110 → #125. #125 baja a prioridad baja; revisión el 2026-11-01.
- Producción **no lleva** `20260915_loadtest_runs.sql` (`.claude/rules/migraciones.md`).
- El usuario **no tiene repo ni Node** en su máquina: operaciones de base nuevas van por workflow de GitHub o MCP.

## Tests ejecutados (resultado real)

- PR #126 y `main` (`9891c57`): Test Suite, Migrations y E2E (`smoke-and-critical`, `live`) en verde. En el PR hubo dos
  flakes aislados (`live`: `57014` en `cuentas-paridad-sql`; `smoke-and-critical`: `cuentas-principal.spec.ts:45` en móvil),
  ambos verdes en un solo re-run.
- `escala.yml` (run 37401207282): verde, ~4 min en "Run scale tests". El run programado del 2026-10-04 (test en 17.6) falló;
  causa no investigada.
- `auditar_consistencia()` en test tras el upgrade: 0 violaciones en las 17 guardas.

## Problemas abiertos

- Un error aislado de Realtime (`no partition of relation "messages" found for row`) a las 00:50 UTC del 2026-10-06 en
  producción nueva. No se repitió; se confirma a las 24 h que las particiones diarias de `realtime.messages` se siguen creando.
- Flake intermitente en `tests/e2e/.../cuentas-principal.spec.ts:45` (móvil). No bloquea; investigar si se repite.
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni a `*.vercel.app` (proxy). Las verificaciones van por
  MCP o por GitHub Actions.

## Pendiente del usuario

- Revisar en Vercel → Functions que no haya errores nuevos tras 24 h.
- Borrar el PDF de prueba de Drive; avisar a los usuarios que recarguen con Cmd/Ctrl+Shift+R; recomendar cambio de
  contraseña a los 2 usuarios (los hashes se copiaron tal cual).
- Borrar el secreto `PROD_NUEVA_DB_URL` de GitHub (Settings → Secrets) cuando termine R4.
- Conector `supabase-prod` en claude.ai: apuntarlo al ref nuevo si tiene ref fijo; revisar `.env.local` de su máquina.
- A los 7 días (2026-10-13), con la vigilancia limpia: borrar el proyecto viejo `fwmyoqokcjtldiofuxdg` en Supabase.
- Decidir #119 (alta mínima de cotizaciones).

## Siguiente paso

1. **Vigilancia de 24 h (2026-10-06 ~08:20 UTC):** keep-alive de las 08:00 UTC, particiones de `realtime.messages`,
   `auditar_consistencia()` en producción. Agendada.
2. **A los 7 días (2026-10-13):** PR chico que quita el ref viejo de `app/api/internal/env-check/route.ts` (y su test) y borra
   `.github/workflows/db-push-una-vez.yml`; el usuario borra el proyecto viejo y el secreto.
3. **Cerrar #124:** cerrar el issue, `git mv docs/PLAN.md docs/archive/produccion-ohio.md`, resumen en `docs/ROADMAP.md` →
   "Cerrado", recrear `docs/PLAN.md` vacío.
4. **Arrancar #123** (siguiente de la cola). #125 queda al final; revisar su fecha el 2026-11-01.

## Deuda técnica

- **Llaves legacy de Supabase** (#125): fecha límite interna 2026-12-01.
- **Frente 2 de Cuentas** (#110): en espera detrás de #123. Mientras tanto, `resumen` y `avisos` crecen con el
  historial (curva de B7). Con los datos reales de hoy no importa.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que
  toque esa función.
- **`realtime-js` fijo en 2.112.0.** Para subirlo hay que pasar el JWT de Realtime con la opción `accessToken`
  (`lib/supabase-browser.ts`). La guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
  Probablemente se resuelve en #125.
- **Job `live` con inestabilidad intermitente:** vigilar `cotizaciones-colaboracion*.spec.ts` y `cuentas-paridad-sql`
  (`statement_timeout` 57014 en `cuentas_conceptos`, #110). Un flake se confirma con un solo re-run; dos rojos seguidos
  son reales.
- **Drive en Preview apagado:** refresh token de pruebas en Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview.
- **Sin respaldos en el plan Free:** riesgo para el día de uso real (ADR 020). Producción nueva también es Free.
- Observabilidad: la analítica por función de Vercel requiere "Observability Plus" (402). Región actual `cle1`
  (decisión 021).
