# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Fase 8.7.2 — Cierre correctivo sobre colaboración en Cotizaciones, EN PROGRESO,
muy cerca de cerrar.** Las causas E-I (diseñadas en una sesión anterior) ya estaban
codeadas y commiteadas al arrancar esta sesión. Esta sesión: (1) encontró y arregló
el bug real de producción reportado por el usuario (borrado de partidas roto), (2)
encontró y arregló 2 bugs reales más durante la propia verificación (uno en el
código de la app, otro de datos de test acumulados), y (3) dejó UN SOLO bloqueador
para cerrar, que no es de código: un token de Google Drive vencido en el entorno de
CI/Vercel.

**No mover esto a `docs/ROADMAP.md` → Cerrado todavía.** Falta confirmar `live` en
verde completo (ver "Siguiente paso") y una decisión pendiente del usuario sobre el
script de paridad de esquema.

Rama `claude/adoring-mayer-34emkm`, PR **[#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28)**
abierto en borrador, último commit `36ab909`. `test`, `fresh-db` y
`smoke-and-critical` están en verde real (confirmado en CI, no solo push exitoso).

## Completado en esta sesión

### 1. Bug de producción: borrado de partidas roto (reportado por el usuario)

El usuario probó el preview de Vercel y encontró que borrar una partida en una
cotización **existente** (no colaborativa) tiraba "Error eliminando partida" — algo
que antes funcionaba. Causa raíz confirmada con SQL directo contra los 2 proyectos
Supabase reales: producción (`fwmyoqokcjtldiofuxdg`) tenía la última migración
aplicada en `20260910_realtime_presence_only_insert` — 2 migraciones más nuevas
(`20260911_approve_cotizacion_estado_guard.sql`,
`20260911_item_cotizacion_estado_guard.sql`, esta última crea
`delete_item_cotizacion` desde cero) estaban commiteadas y probadas en
`serenata-erp-test`, pero nunca promovidas a producción.

Al promoverlas se encontró un problema más serio: ambas migraciones hacían
`CREATE OR REPLACE FUNCTION` sobre una copia de `approve_cotizacion`/
`patch_item_cotizacion` **anterior** a 2 fixes ya aplicados por separado
(población de `cuentas_cobrar.proyecto_id`, wrapper `jsonb_null_as_empty_string`
contra falsos positivos de conflicto) — promoverlas tal cual habría revertido
ambos fixes en producción (y ya los había revertido en `serenata-erp-test`, sin que
nadie lo notara). Detalle completo de la causa y la mitigación para el futuro:
`docs/decisions/005-migraciones-manuales-append-only.md`.

**Resuelto:** se autoraron 2 migraciones aditivas nuevas
(`20260911_approve_cotizacion_restore_proyecto_id.sql`,
`20260911_item_cotizacion_restore_null_vs_empty_fix.sql`) que reincorporan ambos
fixes sobre la base del guard de estado. Se aplicaron con `apply_migration`
(individualmente, nunca `execute_sql` — así quedan registradas en el historial de
Supabase) primero en `serenata-erp-test` y luego, en la misma sesión, en
producción. Verificado con SQL directo en ambos entornos: `delete_item_cotizacion`
existe con permisos correctos, `approve_cotizacion` y `patch_item_cotizacion`
tienen ambos fixes, y un borrado controlado en una cotización desechable de
producción confirmó `{deleted: true}` sin dejar datos residuales. Commit `736b780`.

**Pendiente de confirmación humana:** el usuario todavía no repitió su prueba
manual original en el preview de Vercel — hacerlo antes de dar esto por cerrado del
todo (aunque la causa raíz y el fix ya están verificados por SQL directo).

### 2. Causa F (real, en código de la app) — encontrada durante la propia verificación

El test live de causa F fallaba con `route.continue: Route is already handled!`
(commit `8b28707` lo arregló: la intercepción se retiraba mientras el PATCH
retrasado seguía en vuelo — ahora se distinguen las 2 respuestas por contenido y se
espera a que ambas resuelvan antes de desregistrar la ruta, en un `finally`).

Arreglada esa carrera, el test reveló un bug real distinto: la segunda edición de
una celda (mientras la primera ronda de PATCH seguía en vuelo) sí disparaba un
segundo PATCH, pero con el valor VIEJO en vez del recién tecleado. Causa raíz en
`sendItemCellPatchRound` (`app/cotizaciones/[id]/page.tsx`): al resolver una ronda
con éxito, `itemDirtyCellsRef` se limpiaba incondicionalmente ANTES de llamar
`upsertLocalItemState(updatedItem, { preserveLocalEdits: true })`. Si ya había un
reintento encolado (`itemCellRetryNeededRef`, por una edición más nueva llegada
mientras esa ronda seguía en vuelo), `preserveLocalEdits` ya no veía la celda como
"ocupada" y pisaba el valor recién tecleado con el `updatedItem` de la ronda que
acababa de resolver (viejo) — el drenado mandaba entonces la ronda siguiente
leyendo ese valor ya pisado. Mismo hueco en la rama de conflicto "idéntico"
auto-resuelto.

**Fix:** no limpiar `itemDirtyCellsRef` si ya hay un reintento encolado para esa
celda. Commit `36ab909`. **Verificado con el diagnóstico real de CI** (no solo
lectura de código): el log de un run real muestra ahora la secuencia correcta —
PATCH 1 `{precio_unitario:2100, base:1750}` → 200, PATCH 2
`{precio_unitario:2200, base:2100}` → 200 (antes del fix, el PATCH 2 llevaba
`precio_unitario:2100`, el valor viejo). Test en verde en CI.

### 3. Autofill (dato de test acumulado, no timing/caché) — encontrada durante la propia verificación

El test `seleccionar producto (autofill) mientras otro edita precio a mano` fallaba
hacía varias sesiones con el mismo síntoma (el dropdown de sugerencias nunca
aparece). Se había intentado arreglar antes asumiendo timing/caché del lado
cliente-servidor — no era eso. Causa raíz real, confirmada con SQL directo: `GET
/api/productos?q=` (sin `.limit()` cuando `q` está vacío) devolvía exactamente
`total=1000` — el default de `db-max-rows` de PostgREST. `serenata-erp-test` tenía
**1241** productos acumulados (confirmado 100% basura de test por su
`created_at`): el auto-aprendizaje de productos desde `descripcion` de partida
(`onConflict: 'descripcion'`, deliberado en producción) nunca colisiona cuando
decenas de specs live usan descripciones únicas por corrida (sufijo `Date.now()`,
contadores de escala) — cada corrida agregaba filas nuevas y permanentes, para
siempre, sin que ningún cleanup las tocara.

**Fix:** se limpiaron los 1241 productos huérfanos y se agregó
`cleanupOrphanedTestProductos()` (`tests/e2e/utils/live-cleanup.ts`, purga
productos de más de 1 día) al mismo `beforeAll` que ya limpia reservas de folio
huérfanas, en los 4 specs live que lo necesitan (`basic.spec.ts`,
`cotizaciones-colaboracion.spec.ts`, `cotizaciones-colaboracion-escala.spec.ts`,
`realtime-channel-authorization.spec.ts`). Commit `36ab909`. **Verificado en CI:**
el test ya no aparece en la lista de fallos.

### 4. Test de borrado por UI mejorado

`tests/e2e/live/cotizaciones-colaboracion.spec.ts`, test "borrar una fila...": el
borrado es optimista en la UI, así que `toHaveCount(antes - 1)` solo podía aprobar
de inmediato aunque el servidor hubiera rechazado el DELETE (la regresión real que
motivó todo este bloque). Ahora captura la respuesta real del DELETE en paralelo al
clic, exige `200`, y solo después de que el servidor confirma la ausencia verifica
UI y subtotal — nunca antes ni en paralelo. Commit `8b28707`. En verde en el último
run de CI.

### 5. Script de paridad de esquema (nuevo, decisión de uso pendiente)

`scripts/check-schema-parity.mjs`: compara `db/migrations/_manifest.json` contra
`list_migrations` de un proyecto Supabase real (Management API), por nombre
normalizado (sin el prefijo de timestamp, que difiere entre entornos aunque la
migración sea la misma). Pensado para el gap operativo real que causó el punto 1:
nada detectaba que producción estaba 2 (en realidad 4, ver arriba) migraciones
atrasada. **Deliberadamente NO corre en CI** (necesitaría el token de producción en
GitHub Actions, prohibido por `TESTING.md`/`docs/ENV.md`) — queda como script
manual. Commit `1f20566`.

**Decisión pendiente del usuario:** ¿correrlo como paso manual obligatorio antes de
mergear a `main`, o como un workflow de GitHub Actions separado y protegido (con el
secreto de producción restringido a ese entorno)? No se implementó ninguna de las
dos automatizaciones — falta que el usuario elija.

## Tests ejecutados (resultado real, no esperado)

- `npx tsc --noEmit`: limpio, en cada commit de esta sesión.
- `npm run lint`: limpio (solo los mismos warnings preexistentes sin relación),
  en cada commit.
- `npm test`: 429/429, en cada commit.
- `tests/e2e/critical/cotizaciones-editar.spec.ts` +
  `cotizaciones-flush-transicion.spec.ts` (47 tests): corridos localmente contra
  el fix de causa F con el workaround de `executablePath` del sandbox (revertido
  antes de cada commit, sin diff en `playwright.config.ts`) — 47/47 en verde, sin
  regresión.
- CI del PR #28, último run (commit `36ab909`): `test` ✅, `fresh-db` ✅,
  `smoke-and-critical` ✅. `live`: 41/42 tests en verde (incluidas causa F y
  autofill, antes rojas) — 1 solo test rojo, ver "Problemas encontrados".

## Problemas encontrados (abiertos)

- **Bloqueador único para cerrar Fase 8.7.2:** `tests/e2e/live/basic.spec.ts`,
  test "crear → emitir → aprobar → ... → subir factura real a Drive → registrar
  pago" falla con:
  ```
  [Drive/upload] Exception: Google Drive desautorizado (uploadPdf): invalid_grant.
  El refresh token expiró, fue revocado o ya no coincide con GOOGLE_CLIENT_ID /
  GOOGLE_CLIENT_SECRET. Reautoriza Drive y actualiza GOOGLE_DRIVE_REFRESH_TOKEN en
  Vercel.
  ```
  **No es un bug de código ni de esta fase** — es un token OAuth vencido/revocado
  en el entorno de CI (y probablemente también en Vercel). Requiere una acción
  humana fuera del repo: reautorizar Google Drive y actualizar
  `GOOGLE_DRIVE_REFRESH_TOKEN` (en Vercel, y el secret equivalente que usa
  `e2e.yml` en GitHub Actions). Es muy probable que la falla original de este
  mismo test en un run anterior de esta sesión (un `FK violation` distinto, en
  `documentos_cuentas_cobrar_cuentas_cobrar_id_fkey`) haya sido otra manifestación
  del mismo problema de fondo — se investigó a fondo esa causa (se descartaron
  cascadas, se probó `approve_cotizacion` aislado por SQL directo en ambos
  entornos, funciona bien) sin poder reproducirla de nuevo, y no volvió a aparecer
  en los 2 runs siguientes.
- Heredado de antes (sin tocar esta sesión): flake recurrente del job `live` en
  CI (ver commits previos), PUT genérico en `cuentas-pagar`
  (`docs/archive/auditoria-ingenieria-2026-09.md`).

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.
- **Script de paridad de esquema sin automatizar** (ver punto 5 arriba) — decisión
  pendiente del usuario sobre el modo de ejecución.

## Siguiente paso

1. **Conseguir que alguien con acceso a Google Cloud Console / Vercel reautorice
   Drive** y actualice `GOOGLE_DRIVE_REFRESH_TOKEN` (Vercel + el secret de GitHub
   Actions que usa `e2e.yml`).
2. Re-disparar el job `live` del PR #28 (push nuevo o re-run) y confirmar los 42
   tests en verde, incluido el de `basic.spec.ts`.
3. Preguntarle al usuario cómo quiere operar `scripts/check-schema-parity.mjs`
   (paso manual pre-merge vs. workflow protegido separado) — no bloquea el cierre
   de esta fase, pero quedó pendiente.
4. Con `live` (los 42 tests) + `test` + `fresh-db` + `smoke-and-critical` en
   verde real: documentar el cierre en `docs/ROADMAP.md` → Cerrado y en
   `ARCHITECTURE.md` → Edición colaborativa (mismo formato que la entrada de
   8.7.1), pasar el PR #28 de borrador a listo, y recién ahí actualizar este
   documento a "ninguna iniciativa activa".
5. Pedirle al usuario que repita su prueba manual original en el preview de
   Vercel (borrar una partida en una cotización existente) — la causa raíz y el
   fix ya están verificados por SQL directo, pero falta esa confirmación humana.
6. **El merge a `main` lo autoriza el usuario directamente** — no es parte de
   cerrar esta fase ni de cerrar sesión.
