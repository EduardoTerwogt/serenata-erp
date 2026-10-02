# Trabajo activo

**Última actualización:** 2026-10-02 (simplificación del modelo cerrada; B6 y K6 resueltos).

## Estado

`main` en `c92b860`. No hay iniciativa multi-sesión activa (`docs/PLAN.md` vacío; la última, "Simplificación del
modelo de datos", está archivada en `docs/archive/simplificacion-modelo-datos.md` y su resultado en
`docs/decisions/020`).

## Completado en esta sesión

- **Simplificación del modelo de datos, cerrada.** Producción reiniciada (usuarios 2, tipos de proyecto 3, resto en 0,
  siguiente folio `SH001`), Drive de producción vaciado, issues #105–#109 cerrados. `20261027` (retira
  `cliente_id_backfill_clasificacion`) corrida por el usuario: 35 tablas en test, 34 en producción (+ vista
  `historial_responsable`).
- **B5b/B5c, curva de escala y B7:** `auditar_consistencia()` (17 guardas, cron diario y Admin), índices revisados
  (ninguno retirado), herramientas viejas borradas (#116, #117, #118, #120, #121).
- **B6, un solo motor de Cuentas (#122).** El proyecto seleccionado (con cierre fiscal y cierre mensual) sale de
  `cuentas_periodo` (`20261028`) y el detalle de un concepto de `cuentas_conceptos(p_year, p_hoy, p_objetivo, p_id)`
  (`20261029`, sin DROP; la de 2 argumentos quedó como envoltura). Ambas aplicadas en test y producción. En producción
  ya no hay TypeScript que derive dinero; el motor TS pasó a `tests/support/cuentas-motor/` como doble de los mocks
  e2e, vigilado por `tests/e2e/live/cuentas-paridad-sql.spec.ts`.
- **K6 medido** (`escala.yml`, n=20, 5 renglones): POST `/api/cotizaciones` p50 621 ms / p95 662 ms; PUT p50 342 ms /
  p95 360 ms (presupuesto 800 ms).

## Decisiones nuevas

- B6 se hizo sin diferirlo como deuda (ADR 020 actualizado). Residuo aceptado: `detalle-armar.ts` elige el documento
  más reciente de cada tipo para mostrarlo (presentación; la regla del estado vive en SQL).
- **#119 (alta mínima de cotizaciones, un solo motor de edición):** es decisión de producto; el usuario la atenderá la
  próxima semana. Opciones: (1) alta mínima + editor `/cotizaciones/[id]` (recomendada), (2) no tocar, (3) id del
  borrador en la URL de `/nueva`. Si elige (1): confirmar que las complementarias usan el mismo formulario mínimo.

## Tests ejecutados (resultado real)

- Local en #122: `tsc` limpio, `lint` 0 errores, `vitest` 1064/1064, `build` verde, e2e `critical/cuentas*` + smoke
  17/17, `plpgsql_check` 0 filas, BD vacía reconstruye con 0 fallas; `cuentas_conceptos` de un concepto = fila de la
  lista (0 diferencias, local y 40 casos en test).
- CI de #122: `test`, `fresh-db`, `smoke-and-critical` y `live` en verde.
- Producción tras aplicar `20261028`/`20261029`: `auditar_consistencia()` = 0 violaciones; `cuentas_periodo` devuelve
  `seleccionado`.
- No verificado: el deploy de `main` (`c92b860`) en el Vercel de producción.

## Pendiente del usuario

- Decidir #119 (próxima semana).
- Token de Drive para el entorno Preview (ver deuda) y verificar Drive ahí.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).
- Probar `/cuentas` en producción con datos reales.

## Siguiente paso

Orden acordado (2026-10-02): **#124** (test a `us-west-2`) → **#123** (facturas y pagos N:M) → **#110** (frente 2 v2;
plan auditado guardado en el issue). Cada uno con su propio plan en `docs/PLAN.md`, que quedó vacío para recibir el de
#124. El PR #100 queda reemplazado por el plan de #110 (cerrarlo al arrancar #110). #119 sigue pendiente de decisión.

## Deuda técnica

- **Frente 2 de latencia de Cuentas en pausa** (epic #110, PR #100; ver
  `docs/archive/frente2-cuentas-conceptos-pausado.md`). Disparador: ~4,000 proyectos en total, ~2,500 en un año o p95
  de `escala.yml` sobre 650 ms. **Ojo:** el periodo "todo el año" midió p95 672 ms en test (13,193 conceptos), por
  encima del umbral; con los datos reales de hoy no importa, re-medir al crecer. Palanca barata antes de rediseñar:
  acotar `resumen`, `avisos` y candidatos de orden a lo no resuelto.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no lo usa ninguna ruta; quitarlo es un DROP + CREATE
  manual, pendiente de la próxima migración que toque esa función.
- **`realtime-js` fijo en 2.112.0.** Para subir de versión hay que pasar el JWT de Realtime con la opción
  `accessToken` de `createClient` (`lib/supabase-browser.ts`) y revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
- **Job `live` con inestabilidad intermitente** (visto desde #92): vigilar `cotizaciones-colaboracion*.spec.ts` y
  `cuentas-periodo-rendimiento.spec.ts`. Un flake se confirma con un solo re-run; dos rojos seguidos son reales.
- **Drive en Preview sigue apagado.** Para probar subidas en un Preview: refresh token de la cuenta de pruebas (secreto
  `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` o `/api/integrations/drive/authorize`) en Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`,
  solo Preview, y redeploy.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403) y la analítica por función requiere
  "Observability Plus" (402). La región de Vercel es `sfo1` (`docs/decisions/018-region-vercel-sfo1.md`).
- Sin respaldo previo al reinicio de producción (sus datos eran de prueba): el plan Free sin respaldos sigue siendo un
  riesgo para el día de uso real; decidirlo entonces (ADR 020).
