# Trabajo activo

**Última actualización:** 2026-09-26 (sesión 21: rediseño de Cuentas cerrado y en producción)

## Estado

**No hay iniciativa activa.** `docs/PLAN.md` está vacío. El rediseño de
Cuentas se cerró; su historia está en `docs/archive/rediseno-cuentas.md` y sus
reglas en `docs/decisions/017-rediseno-cuentas.md`.

## Completado en la sesión 21

- **Migraciones `20260926`–`20261006` aplicadas a producción** (`serenata-erp`),
  en orden. Verificación:
  - md5 del cuerpo de cada función igual al de los archivos;
  - EXECUTE solo para `service_role`;
  - conteos y montos (34 CxC, 86 CxP, 30 grupos, 8 órdenes, pagos) iguales al
    snapshot previo;
  - `cuentas_periodo`, `cuentas_resumen`, `cuentas_opciones`,
    `cuentas_orden_candidatos`, `cuentas_por_proyecto` y
    `cuentas_avisos_items` responden.
- **PR #96 mergeado** (`f01097d`), deploy de producción en Vercel READY.
- **PR #97** (credenciales del portal fuera de las respuestas de
  `proveedores`): main integrado en su rama. El helper de B5
  `lib/server/proveedor-publico.ts` ahora delega en la lista blanca del
  repositorio. CI en curso; se mergea al quedar en verde.
- En `serenata-erp-test` faltaban los REVOKE/GRANT de las funciones de B7
  (anon podía ejecutarlas). Se aplicaron. `cuentas_avisos_items` en test solo
  difiere del archivo en un comentario.

## Pendiente del usuario

- Probar `/cuentas` en producción con datos reales.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Cómo retomar (sesión nueva)

Abrir con `/serenata-iniciar-fase`. No hay plan en curso: lo siguiente se
define en Chat (ver `docs/ROADMAP.md` → "Después").

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
- Drive está apagado en Preview a propósito. Si hace falta, se saca un token
  con `/api/integrations/drive/authorize` usando una cuenta de pruebas.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403).
- `proyectos.fecha_entrega` sigue siendo texto: las RPCs de Cuentas validan
  `^\d{4}-\d{2}-\d{2}$` y mandan lo demás a "Sin fecha" (D9).
- **Drive en Preview (ex R9) sigue apagado.** El rediseño se validó sin él
  (e2e con mocks + `live` contra test). Para probar subidas en un Preview:
  refresh token de la cuenta de pruebas (secreto
  `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` o `/api/integrations/drive/authorize`) en
  Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview, y redeploy.

