# Trabajo activo

**Última actualización:** 2026-10-02 (sesión de planeación: #124 aprobado, cola de iniciativas definida).

## Estado

`main` con solo documentación sobre `c92b860` (sin cambios de código en esta sesión). **`docs/PLAN.md` = #124
"Producción y Vercel a Ohio" — Aprobado, listo para ejecutar desde R0 en una sesión nueva.**

Cola acordada con el usuario (2026-10-02):
1. **#124** — producción y Vercel a Ohio (`us-east-2` / `cle1`). Plan en `docs/PLAN.md`.
2. **#125** — llaves de Supabase legacy → publishable/secret. Las legacy dejan de funcionar a fin de 2026
   (documentación de Supabase); fecha límite interna **2026-12-01**. Insumos en el issue y sus comentarios.
3. **#123** — nueva lógica de cuentas (una factura para varias cotizaciones, un pago para varias facturas).
4. **#110** — frente 2 v2 de Cuentas. Plan auditado guardado en el cuerpo del issue; **depende de #123** (cambia el
   modelo que precalcula).

## Completado en esta sesión

- **Frente 2 re-auditado → #110.** Diagnóstico medido en test:
  - la derivación recorre todo el historial en `resumen` y `avisos`;
  - un solo concepto cuesta 37 ms y 3,701 buffers por escaneos completos.

  16 hallazgos (H1–H16): derivación en dos etapas, dos granos, `MERGE`, cobertura de triggers verificada por CI y
  métrica por buffers. El plan quedó en el issue #110; el PR #100 queda reemplazado.
- **Región:** medición del usuario con cloudping (Ohio ~60 ms, Virginia ~64, California ~77, Oregon ~80, México
  ~14 sin oferta de Supabase/Vercel) → opción B, todo en Ohio. Hallazgo: la decisión 018 eligió `sfo1` sin ver que
  Vercel tiene `pdx1` en Oregon.
- **#124:** plan con cuatro auditorías internas y una externa. Lo más relevante:
  - comparación de GRANTs (`service_role` 245);
  - `db push` con el mismo motor que CI;
  - solo se copian 2 usuarios (tipos y etapas los siembran las migraciones);
  - ventanas de rollback A/B con GO/NO-GO;
  - hashes fuera del contexto de Claude;
  - A/B de latencia con `preview-latency.yml`.
- **#125** creado. Supabase confirma que `anon`/`service_role` legacy funcionan hasta fin de 2026.

## Decisiones nuevas

- Orden de iniciativas: #124 → #125 → #123 → #110. Se evaluó #125 antes de #124 y se descartó: ataba Ohio a un
  trabajo incierto (compatibilidad de `supabase-js` 2.100 y de `realtime-js` 2.112 con las llaves nuevas).
- Supabase Pro temporal: descartado ("Restore to a new project" copia en la misma región).
- El usuario **no tiene repo ni Node** en su máquina: `db push` se corre con un workflow de GitHub de un solo uso
  (R2b del plan).
- Integración Supabase ↔ Vercel del Marketplace: descartada (pisaría las variables de Preview).

## Tests ejecutados (resultado real)

Sesión sin cambios de código: no se corrieron suites. Mediciones por MCP (solo lectura):
- `cuentas_conceptos` del año completo en test: 548 ms, 161,979 buffers.
- Un concepto: 37 ms, 3,701 buffers.
- Producción vieja: 17 filas en `public`; sin Auth, Storage, Vault ni Edge Functions.

## Problemas abiertos

- El conector MCP de Vercel da **403** sobre el team `eduardoterwogts-projects`. El usuario debe reautenticarlo (R0).
- Desde la sesión de Claude no hay salida de red a `*.supabase.co` ni a `*.vercel.app` (proxy). Las verificaciones
  van por MCP o por GitHub Actions.

## Pendiente del usuario

- R0 de #124: reconectar el conector de Vercel con el team; confirmar `us-east-2` (Supabase) y `cle1` (Vercel);
  capturas de Settings → API / Data API / Realtime de producción; agendar una ventana de 2–3 h para R1–R3.
- Decidir #119 (alta mínima de cotizaciones).
- Token de Drive para Preview; borrar ramas remotas ya mergeadas; probar `/cuentas` en producción con datos reales.

## Siguiente paso

Sesión nueva: ejecutar #124 desde R0 siguiendo el checklist de `docs/PLAN.md` (el checklist manda sobre las tablas de
auditoría).

## Deuda técnica

- **Llaves legacy de Supabase** (#125): fecha límite interna 2026-12-01.
- **Frente 2 de Cuentas** (#110): en espera detrás de #123. Mientras tanto, `resumen` y `avisos` crecen con el
  historial (curva de B7). Con los datos reales de hoy no importa.
- **`cuentas_por_proyecto(p_year, p_proyecto)`:** `p_proyecto` ya no se usa; quitarlo en la próxima migración que
  toque esa función.
- **`realtime-js` fijo en 2.112.0.** Para subirlo hay que pasar el JWT de Realtime con la opción `accessToken`
  (`lib/supabase-browser.ts`). La guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
  Probablemente se resuelve en #125.
- **Job `live` con inestabilidad intermitente:** vigilar `cotizaciones-colaboracion*.spec.ts`. Un flake se confirma
  con un solo re-run; dos rojos seguidos son reales.
- **Drive en Preview apagado:** refresh token de pruebas en Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview.
- **Sin respaldos en el plan Free:** riesgo para el día de uso real (ADR 020).
- Observabilidad: la analítica por función de Vercel requiere "Observability Plus" (402). Región actual `sfo1`
  (decisión 018, la reemplaza #124).
