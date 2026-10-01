# Trabajo activo

**Última actualización:** 2026-10-01 (plan v9 de "Simplificación del modelo de
datos" aprobado; frente 2 en pausa). Debajo, el cierre de la sesión 22.

## Estado

**#99 (desglose antes/después de IVA y utilidad con descuento) → hecho y en producción**
(2026-10-01). PR #104 mergeado (`e9940ea`) con `test`, `fresh-db`,
`smoke-and-critical` y `live` en verde; issue #99 cerrado. `20261007` y
`20261008` aplicadas en producción antes del merge. Verificado después: 0
grupos desfasados, 0 grupos ABIERTO vacíos, "Eduardo Terwogt" de SH072 en 3,100
(antes 5,900), grupo vacío "Serenata" borrado, trigger presente,
`cuentas_conceptos(2026)` con 114 conceptos y `utilidad_proyecto`,
`cuentas_periodo` ~65 ms, advisors sin hallazgos nuevos. Pendiente de
verificar por el usuario en la app: SH072 sin "Ajuste" y SH080 con el desglose.

**Iniciativa "Simplificación del modelo de datos"** — epic #109. **Plan v12
aprobado (2026-10-01)** (auditoría externa 2: escritores TS de
`cuentas_cobrar.estado` y tipos de actualización acotados; auditoría externa: orden de la columna puente,
verificación final del reinicio, `lock_timeout`; auditoría 7: estado de cotización solo por RPC,
fórmula única del cobro D15, un solo `cliente_id` D16, B6 obligatorio D17). Antes, v9 en `docs/PLAN.md` (auditoría 6: P0 de la restricción
"proveedor ⇒ grupo" movida a B5b como constraint diferido, sin purga de
reservas de folio, foto dorada sin tocar prod; decisiones D12 dueño único de
verdad, D13 renombrar `x_pagar` a Costo Unitario/Costo Total, D14 retirar
Calendar). 7 PRs (nuevo B5c: renglones, editor y nomenclatura), 40 → 34 tablas.
Historia de auditorías en `docs/archive/simplificacion-modelo-auditorias.md`.
**Siguiente sesión: B0** (abrir con `serenata-iniciar-fase`). Pendientes del
usuario que B0 pedirá: respaldo `supabase db dump` (plan Free sin respaldos),
Drive en Preview y limpiar carpetas de prueba de Drive antes del reinicio (B2).

**B0 → hecho** (PR #111 mergeado, 2026-10-01; `live` verde ×3). Guardas, `plpgsql_check`
en CI, 8 índices, foto dorada, esquema test = prod verificado (única excepción
declarada: `loadtest_runs`), línea base de test (`cuentas_periodo` 579/498 ms,
`cuentas_resumen` 286 ms). La prueba de escala salió del gate de PR (`escala.yml`, D18).

**B5a y B5b etapa 1 → mergeados** (PRs #113 y #114; `live` verde). Pagos, facturas y
órdenes solo por grupo; el estado del cobro es una columna generada (D15).
**B5b etapa 2 → en PR** (rama `claude/intelligent-babbage-1cbzl3`): `cuentas_pagar` sin copias
(proveedor, descripción, cantidad, margen, orden y transferencias salen del dueño), `item_id`
uuid NOT NULL con FK, constraint "proveedor ⇒ grupo" al COMMIT, retiro de `buscar_*`,
`estado_anterior` y `registrar_pago_cuenta_pagar`. Migración `20261023` (contiene DROP:
**la corre el usuario a mano en test y luego producción**; producción está vacía salvo
usuarios y tipos de proyecto). Faltan de B5b: `historial_responsable` → vista,
`proyectos.fecha_entrega` → date, `timestamptz` en Cuentas, D12/D16 (cliente), `costo_total`
(DROP EXPRESSION) y quitar `x_pagar` de la cuenta (M1).

**B1+B3 mergeado — PR #112 (2026-10-01), `live` verde.** Sheets, Calendar y Planeación retirados del
código; clientes por `nombre_clave` + `resolver_cliente`; autosave de productos en
bloque; L7; CHECK/timestamptz/RLS. `20261017` y `20261018` aplicadas en test y prod.
**Manual pendiente del usuario (no bloquea B5a):** correr `20261016` (DROP) en test y
luego prod; quitar de Vercel `GOOGLE_SHEETS_SPREADSHEET_ID` y `GOOGLE_CALENDAR_ID`;
verificar Drive en Preview. Pendiente de B0 para B2: respaldo `supabase db dump` y limpieza de carpetas de prueba
de Drive.

**Frente 2 de latencia de Cuentas → en pausa** — epic #110, PR #100 en borrador
(retitulado "[En pausa]", ya sin "Closes #99"); al retomarlo hay que traer
`main` a su rama (conflicto add/add esperado en `20261008`: conservar la de
`main`). Estado y cómo retomarlo:
`docs/archive/frente2-cuentas-conceptos-pausado.md`. Pendiente del usuario:
decidir el cómputo de test y producción (#107; Dashboard → Reports → Database).
`20261009` y `20261010` aplicadas solo en test. El E2E de `main` tras los
commits de docs falló (`1b650cd`) por la degradación de la BD de test (#107).

## Completado en la sesión 22

- **Fuente Inter migrada de `next/font/google` a `next/font/local`**
  (`app/fonts.ts`). Los 4 pesos (400/500/600/700, subset latin) viven en
  `app/fonts/*.woff2` + `app/fonts/Inter-OFL.txt`, generados desde
  `@expo-google-fonts/inter@0.4.2` (misma fuente/licencia SIL OFL 1.1 que
  `lib/server/pdf/fonts/inter.ts`), subseteados con `pyftsubset`. El build
  ya no depende de descargar Google Fonts.
- **Borrado el duplicado `lib/server/proveedor-publico.ts`** (quedó como
  mero re-export tras #97). Su único importador
  (`app/api/proveedores/route.ts`) usa directamente
  `lib/server/repositories/proveedor-publico.ts`.
- **Frente 3 de la latencia en paralelo de Cuentas, confirmado en 4 corridas
  reales de `live`.** `cuentas-periodo-rendimiento.spec.ts` se logueaba por
  `/cuentas` (montaba la página real, que dispara periodo+resumen+
  opciones+avisos en paralelo, compitiendo con la propia medición) — ahora
  entra por `/cotizaciones`, como el resto de los specs `live`. Resultado:
  3 de 4 corridas en verde (una con margen cómodo, otra necesitó la 2.ª
  ronda de "mejor de dos"), 1 de 4 en rojo con 3 mediciones sobre
  presupuesto (`avisos` en 1797 ms). **No cerrado como "resuelto sin
  más"** — eliminó el `statement_timeout` fatal, pero el margen sigue
  estrecho de forma intermitente. Ver "Deuda técnica" abajo.
- **Región de Vercel cambiada a `sfo1`** (antes `iad1`), cerca de Supabase
  producción (`us-west-2`). Motivado por que el usuario reportó la app
  lenta en general. Diagnóstico y por qué no se migró Supabase de región:
  `docs/decisions/018-region-vercel-sfo1.md`. **No se pudo confirmar con
  números reales el efecto** — limitaciones del entorno (Observability Plus
  de pago, logs de runtime en 403, proxy del sandbox bloquea curl directo a
  deployments); queda en manos del usuario verificarlo desde el dashboard
  de Vercel o por sensación de uso real.
- Todo lo anterior está en `main` (`c04f378`), commit directo autorizado
  explícitamente por el usuario para el cambio de región; el resto pasó por
  PR #98 (mergeado).

## Decisiones nuevas

- `docs/decisions/018-region-vercel-sfo1.md`: región de Vercel en `sfo1`;
  migrar Supabase de región queda descartado salvo que la latencia de red
  siga siendo el cuello de botella dominante tras este cambio.

## Tests ejecutados

- Local (PR #98): `npx tsc --noEmit`, `npm run lint` (0 errores) y
  `npm test` (134/134 archivos, 1112/1112 tests) en verde. `npm run build`
  verde, confirmado sin llamadas a Google Fonts.
- CI de PR #98: `test`, `fresh-db`, `smoke-and-critical` y `live` en verde,
  3 corridas seguidas (incluida 1 re-run manual para tener 2+ datos de
  `live` antes de mergear).
- CI de `main` tras el merge (`bf4aadc`): `live` rojo — 3 mediciones de
  Cuentas sobre presupuesto (ver frente 3 arriba).
- CI de `main` tras el cambio de región (`c04f378`): 1.ª corrida, Cuentas
  en verde pero falló un test no relacionado
  (`staff-session-revocation.spec.ts`, timeout de 30 s con "browser has
  been closed") — re-run confirmó que fue un flake de infraestructura
  aislado del runner: 2.ª corrida, todo verde (`live` y
  `smoke-and-critical`).

## Pendiente del usuario

- Probar `/cuentas` en producción con datos reales.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).
- Confirmar si el cambio de región de Vercel mejoró la latencia percibida
  (dashboard de Vercel → Functions, o uso real en los próximos días).

## Siguiente paso

Nada urgente. Si `/cuentas` se sigue sintiendo lenta después del cambio de
región, o si `live` vuelve a fallar en Cuentas de forma consistente (no un
flake puntual), el frente 2 (cachear/restructurar `cuentas_conceptos` para
no recalcularse desde cero en cada RPC) es la siguiente iniciativa — cambio
de arquitectura, requiere su propio plan antes de tocar código. Mientras
tanto, seguir con la lista de deuda técnica de abajo cuando se priorice.
Abrir con `/serenata-iniciar-fase`.

## Deuda técnica

- **`realtime-js` fijo en 2.112.0.** Para subir de versión hay que pasar el
  JWT de Realtime con la opción `accessToken` de `createClient`
  (`lib/supabase-browser.ts`) y revisar los reintentos de postgrest. La
  guarda `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se
  sube sin eso.
- **Job `live` inestable en `main` de forma intermitente (visto desde
  #92).** Dos focos distintos, no confundir: (1) el test causal de `bulk` y
  el de escala (`cotizaciones-colaboracion*.spec.ts`) — sin incidentes
  desde 2026-09-24, vigilar; (2) `cuentas-periodo-rendimiento.spec.ts` —
  frente 3 aplicado (ver arriba), margen sigue estrecho de forma
  intermitente, frente 2 es la siguiente escalada si se repite.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403).
  La analítica de duración por función (`function_duration_ms`/`ttfb_ms`)
  requiere el plan pagado "Observability Plus", no disponible en esta
  cuenta (402).
- `proyectos.fecha_entrega` sigue siendo texto: las RPCs de Cuentas validan
  `^\d{4}-\d{2}-\d{2}$` y mandan lo demás a "Sin fecha" (D9).
- **Drive en Preview (ex R9) sigue apagado.** El rediseño se validó sin él
  (e2e con mocks + `live` contra test). Para probar subidas en un Preview:
  refresh token de la cuenta de pruebas (secreto
  `GOOGLE_DRIVE_REFRESH_TOKEN_TEST` o `/api/integrations/drive/authorize`)
  en Vercel → `GOOGLE_DRIVE_REFRESH_TOKEN`, solo Preview, y redeploy.
