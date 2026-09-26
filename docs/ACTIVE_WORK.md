# Trabajo activo

**Última actualización:** 2026-09-26 (sesión 21, cerrada: rediseño de Cuentas y #97 en producción)

## Estado

**No hay iniciativa activa.** `docs/PLAN.md` está vacío. El rediseño de Cuentas
se cerró: su historia está en `docs/archive/rediseno-cuentas.md` y sus reglas en
`docs/decisions/017-rediseno-cuentas.md`.

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

Sesión dedicada de deuda técnica (decisión del usuario). Empezar por la
latencia en paralelo de Cuentas (`docs/ROADMAP.md` → "Deuda técnica") y
seguir con la lista de abajo. Abrir con `/serenata-iniciar-fase`.

## Deuda técnica

- **`realtime-js` fijo en 2.112.0.** Para subir de versión hay que pasar el JWT
  de Realtime con la opción `accessToken` de `createClient`
  (`lib/supabase-browser.ts`) y revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
- **El build depende de descargar Inter de Google Fonts** (`app/fonts.ts`).
  Falló de forma intermitente el 2026-09-24 y otra vez en #95 (2026-09-25,
  `smoke-and-critical`; pasó al relanzarlo). Si se repite, migrar a
  `next/font/local`.
- **Job `live` inestable en `main` (visto tras #92).** Hay fallos
  intermitentes en el test causal de `bulk` y en el de escala. Vigilar si se
  repiten ahora que #93 está mergeado.
- Las secuencias `seq_cc_2026` y `seq_cp_2026` quedaron sin uso tras #92; se
  pueden borrar en una limpieza.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403).
- **Latencia en paralelo de las RPCs de Cuentas.** Hallazgos y frentes en
  `docs/ROADMAP.md` → "Después" → "Deuda técnica". Tumba de forma
  intermitente el test `live` `cuentas-periodo-rendimiento.spec.ts` ›
  "periodo (mes)". Falló en `f01097d` y 3 veces en #97.
- Borrar el duplicado local `lib/server/proveedor-publico.ts`. Solo reexporta
  el helper del repositorio: #97 lo dejó así al integrar B5.
- `proyectos.fecha_entrega` sigue siendo texto: las RPCs de Cuentas validan
  `^\d{4}-\d{2}-\d{2}$` y mandan lo demás a "Sin fecha" (D9).
- **Drive en Preview (ex R9) sigue apagado.** El rediseño se validó sin él
  (e2e con mocks + `live` contra test). Para probar subidas en un Preview:
  refresh token de la cuenta de pruebas (secreto
  `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` o `/api/integrations/drive/authorize`) en
  Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview, y redeploy.

