# Trabajo activo

**Última actualización:** 2026-09-26 (sesión 22: deuda técnica — fuente Inter,
duplicado de `proveedor-publico.ts` y frente 3 de la latencia de Cuentas)

## Estado

**No hay iniciativa activa.** `docs/PLAN.md` está vacío. El rediseño de Cuentas
se cerró: su historia está en `docs/archive/rediseno-cuentas.md` y sus reglas en
`docs/decisions/017-rediseno-cuentas.md`.

## Completado en la sesión 22

- **Fuente Inter migrada de `next/font/google` a `next/font/local`**
  (`app/fonts.ts`). Los 4 pesos (400/500/600/700, subset latin) viven ahora en
  `app/fonts/*.woff2` + `app/fonts/Inter-OFL.txt`, generados desde
  `@expo-google-fonts/inter@0.4.2` (misma fuente/licencia SIL OFL 1.1 ya
  vendorizada en `lib/server/pdf/fonts/inter.ts`) subseteados con
  `pyftsubset`. El build ya no depende de descargar Google Fonts.
- **Borrado el duplicado `lib/server/proveedor-publico.ts`.** Su único
  importador (`app/api/proveedores/route.ts`) ahora usa directamente
  `lib/server/repositories/proveedor-publico.ts`.
- **Frente 3 de la latencia en paralelo de Cuentas** (ver "Deuda técnica"
  abajo): `tests/e2e/live/cuentas-periodo-rendimiento.spec.ts` ya no entra
  por `/cuentas` para loguearse (esa página disparaba periodo+resumen+
  opciones+avisos en paralelo, compitiendo con la propia medición del test)
  — ahora usa `/cotizaciones`, igual que el resto de los specs `live`.
  Pendiente confirmar en CI real (ver nota en "Deuda técnica").

## Completado en la sesión 21

- **Migraciones `20260926`–`20261006` aplicadas a producción** (`serenata-erp`),
  en orden. Verificación:
  - md5 del cuerpo de cada función igual al del archivo;
  - EXECUTE solo para `service_role`;
  - conteos y montos (34 CxC, 86 CxP, 30 grupos, 8 órdenes, pagos) iguales al
    snapshot previo;
  - las RPCs nuevas responden.
- **PR #96 mergeado** (`f01097d`): rediseño de Cuentas B1–B8.
- **PR #97 mergeado** (`8dbbfa9`): las credenciales del portal ya no salen en
  las respuestas de `proveedores`.
  - Se integró `main`: el helper de B5 `lib/server/proveedor-publico.ts`
    delega en la lista blanca del repositorio.
  - Se mergeó con autorización del usuario pese a un único test `live` en rojo
    que no es suyo (ver deuda: latencia de Cuentas).
- Producción desplegada en Vercel: READY en `20cc5fa`.
- En `serenata-erp-test` faltaban los REVOKE/GRANT de las funciones de B7
  (anon podía ejecutarlas). Se aplicaron.

## Decisiones nuevas

- **Opción A** en el test de rendimiento, autorizada por el usuario: si la
  primera ronda de 40 muestras excede el presupuesto, se mide una segunda y
  cuenta la mejor (`ea4cb85`).
- La latencia en paralelo de Cuentas va a una sesión dedicada de deuda
  técnica (`docs/ROADMAP.md`), no se ataca ahora.

## Tests ejecutados

- Local, sobre el merge de `main` en #97: `npx tsc --noEmit` y
  `npm run lint` (0 errores; warnings previos) en verde, y `npm test` con
  134 archivos y 1112 tests en verde.
- CI de #96: todo verde.
- CI de `main`: `66cc479`, todo verde; `f01097d`, `live` rojo por el test de
  rendimiento.
- CI de #97 en `ea4cb85`: `test`, `fresh-db` y `smoke-and-critical` verdes;
  `live` 77/78, con "periodo (mes)" en rojo (timeouts de 8 s).

## Pendiente del usuario

- Probar `/cuentas` en producción con datos reales.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Siguiente paso

Confirmar en CI real (2-3 corridas del job `live` sin fallo de
`cuentas-periodo-rendimiento.spec.ts`) que el frente 3 alcanzó. Si vuelve a
fallar, escalar al frente 2 (cachear/restructurar `cuentas_conceptos`) como
iniciativa nueva en `docs/PLAN.md` — no agregar más tolerancia al test. Luego
seguir con el resto de la lista de abajo. Abrir con `/serenata-iniciar-fase`.

## Deuda técnica

- **`realtime-js` fijo en 2.112.0.** Para subir de versión hay que pasar el JWT
  de Realtime con la opción `accessToken` de `createClient`
  (`lib/supabase-browser.ts`) y revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
- **Job `live` inestable en `main` (visto tras #92).** Hay fallos
  intermitentes en el test causal de `bulk` y en el de escala. Vigilar si se
  repiten ahora que #93 está mergeado.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403).
- **Latencia en paralelo de las RPCs de Cuentas — frente 3 aplicado, por
  confirmar.** Diagnóstico (sesión 21, `docs/ROADMAP.md` → "Después" →
  "Deuda técnica"): cada RPC es rápida sola (`cuentas_periodo` ~527 ms,
  `cuentas_resumen` ~346, `cuentas_avisos_items` ~316, `cuentas_opciones`
  ~236 en `serenata-erp-test`), pero `/cuentas` las dispara en paralelo y
  bajo carga concurrente algunas superan el `statement_timeout=8s` de
  `authenticator` (`57014`). Sesión 22 confirmó una fuente extra de esa
  concurrencia: el propio test `cuentas-periodo-rendimiento.spec.ts` entraba
  por `login(page, '/cuentas')`, que monta la página real y dispara las
  mismas RPCs en paralelo justo antes de medir — se cambió a
  `login(page, '/cotizaciones')`. Falló en `f01097d` y 3 veces en #97
  (incluso ya con "mejor de dos rondas", `ea4cb85`), así que **no cerrar con
  una sola corrida verde**: observar 2-3 corridas reales de `live` antes de
  dar el frente 3 por suficiente. Si vuelve a fallar, el frente 2
  (cachear/restructurar `cuentas_conceptos` — cambio de arquitectura) queda
  como la siguiente iniciativa; el frente 1 (tamaño de cómputo de
  `serenata-erp-test`) es una decisión de costo, no se tocó.
- `proyectos.fecha_entrega` sigue siendo texto: las RPCs de Cuentas validan
  `^\d{4}-\d{2}-\d{2}$` y mandan lo demás a "Sin fecha" (D9).
- **Drive en Preview (ex R9) sigue apagado.** El rediseño se validó sin él
  (e2e con mocks + `live` contra test). Para probar subidas en un Preview:
  refresh token de la cuenta de pruebas (secreto
  `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` o `/api/integrations/drive/authorize`) en
  Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview, y redeploy.

