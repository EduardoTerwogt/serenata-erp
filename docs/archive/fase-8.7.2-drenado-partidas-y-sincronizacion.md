# Fase 8.7.2 — Drenado real por celda + sincronización de migraciones (bitácora)

**Cerrada:** 2026-09-12. PR [#28](https://github.com/EduardoTerwogt/serenata-erp/pull/28).

## Objetivo

Dos bugs reportados sobre la edición colaborativa de Cotizaciones, distintos de lo
que Fase 8.7.1 había cerrado:

1. Avisos de "está editando" que no se actualizaban + banner de conflicto espurio
   ("Alguien más lo cambió a "" mientras editabas") al agregar una partida.
2. Totales/Utilidad no se recalculaban tras agregar una fila en modo colaborativo —
   solo quedaban correctos al recargar la página completa.

## Causas A-D (Presence, mutation_id, modal móvil, foco) — primer bloque

Verificadas contra el código real:

1. `releaseSection` (Presence, `hooks/useQuotationPresence.ts`) solo limpiaba
   `active_section` al soltar Partidas, nunca `entity_id`/`field` — el heartbeat de
   15s repetía "editando esta celda" indefinidamente. Ahora limpia también
   `activeCellRef` y difunde `trackPresence(null, null)`; `itemCellEditors` además
   filtra por `active_section === 'partidas'`.
2. El alta de fila no threadeaba `mutation_id` (sí lo hacía el PATCH) — el propio
   creador de una fila reconciliaba contra sí mismo.
3. El modal/tarjeta móvil de edición se ataba por índice (`editingItemIndex`), no por
   id estable — un índice guardado quedaba apuntando a la fila equivocada tras
   cualquier reconciliación, dejando "Mantener"/"Usar" sin efecto. Cambiado a
   `editingItemRowId`, derivando el índice en cada render.
4. `handleAddRow` robaba el foco al agregar una fila (`append()` sin
   `shouldFocus: false`).

## Causas E-I (drenado real, base refrescado, comparación normalizada) — segundo bloque

El diagnóstico completo, con diseño y snippets, quedó documentado en
`docs/ACTIVE_WORK.md` durante varias sesiones antes de codearse — purgado de ahí al
cerrar esta fase, resumen aquí:

- **E.** `itemCellBaseRef` nunca se refrescaba tras un PATCH exitoso — seguir editando
  la misma celda sin blur mandaba la `base` vieja y producía un `409` contra uno
  mismo. `sendItemCellPatchRound` ahora refresca `itemCellBaseRef` al valor
  confirmado por el servidor en cada ronda exitosa.
- **F.** Sin serialización real por celda, `flushPendingSaves` podía no ver un
  reintento pendiente. Reemplazado el guard de un solo intento por un drenado real
  (`itemCellDrainRef` + `itemCellRetryNeededRef`, `do...while` en
  `persistItemCellAutosave`) que manda una ronda más con el valor final en cuanto la
  actual resuelve.
- **G.** La comparación de "conflicto idéntico" usaba `===` crudo — `attempted`/
  `current` pueden diferir por representación (`null` vs `''`) sin ser un conflicto
  real. `normalizeItemFieldValue`/`normalizeGeneralFieldValue`/
  `normalizeTotalsFieldValue` aplican la misma coerción que cada patch ya usa antes
  de comparar.
- **H.** El cálculo de Totales unía partidas por `fields[i].id` (la key interna de
  `useFieldArray`, no el id de negocio) — nunca encontraba nada. Cambiado a
  `useWatch({ control, name: 'items' })`, solo para ese cálculo.
- **I.** `handleAddRow` registraba su `.then` de confirmación antes de encadenar
  `recordServerItem`, así que una primera edición sin blur podía ver
  `itemsServerRef` todavía sin poblar. `sendItemCellPatchRound` también reconstruye
  `base` si nunca se capturó.

## Tres rondas de auditoría externa sobre la implementación de E-I

1. **trackMutation con la promesa cruda.** `flushPendingSaves` veía un conflicto ya
   auto-resuelto (causa G) como una mutación fallida y abortaba Generar/Aprobar sin
   motivo real. Corregido armando la promesa semántica (`.then(onFulfilled,
   onRejected)`, ya resuelta) antes de pasarla a `trackMutation`, mismo patrón en
   `sendItemCellPatchRound`, `persistGeneralField` y `persistTotalsField`.
2. **`patch_item_cotizacion` es atómica — la resolución de conflicto no lo respetaba.**
   Un conflicto en un solo campo de un PATCH multi-campo (autofill de producto:
   `descripcion`/`categoria`/`precio_unitario`/`x_pagar`; responsable:
   `responsable_id`/`responsable_nombre`) rechaza la operación COMPLETA — pero
   "Usar"/"Mantener" solo tocaban el campo marcado, dejando el resto del grupo
   mostrando un valor que el servidor nunca guardó. `buildAtomicConflictRecord`
   sintetiza el registro completo del grupo; `resolveItemCellConflict` generaliza a
   cualquier grupo de más de un campo — "Usar" revierte TODOS los campos al valor
   real del servidor, "Mantener" reintenta el PATCH completo vía
   `retryItemGroupPatch`.
3. **"Mantener" en un conflicto de grupo reintentaba con la `base` vieja.**
   `nextServer[f] = detail.current` solo corría en la rama "theirs" — para
   "Mantener", `itemsServerRef` quedaba con el valor viejo, así que el reintento
   (que arma su `base` leyendo `itemsServerRef`) volvía a chocar contra el mismo
   conflicto que se acababa de "resolver". Se refresca en ambas ramas.

## Bug de producción encontrado al verificar el cierre: migraciones atrasadas

El usuario probó el preview de Vercel y encontró que borrar una partida en una
cotización existente (no colaborativa) fallaba con "Error eliminando partida" — algo
que antes funcionaba. Causa raíz confirmada con SQL directo: producción tenía la
última migración aplicada en `20260910_realtime_presence_only_insert` —
`20260911_approve_cotizacion_estado_guard.sql` e
`20260911_item_cotizacion_estado_guard.sql` (esta última crea
`delete_item_cotizacion` desde cero) estaban commiteadas y probadas en
`serenata-erp-test`, pero nunca promovidas.

Al promoverlas se encontró que ambas se autoraron sobre una copia de
`approve_cotizacion`/`patch_item_cotizacion` **anterior** a 2 fixes ya aplicados por
separado en producción sobre esas mismas funciones (población de
`cuentas_cobrar.proyecto_id`, wrapper `jsonb_null_as_empty_string` contra falsos
positivos de conflicto) — promoverlas tal cual habría revertido ambos fixes (y ya
los había revertido en `serenata-erp-test`, sin que nadie lo notara). Se autoraron 2
migraciones aditivas nuevas que reincorporan ambos fixes sobre la base del guard de
estado, aplicadas primero en test y luego en producción en la misma sesión.
Verificado con SQL directo en ambos entornos y un borrado controlado en una
cotización desechable de producción. Detalle y mitigación para el futuro:
`docs/decisions/005-migraciones-manuales-append-only.md`.

## Dos bugs reales más, encontrados verificando el propio cierre (no adivinados)

- **Causa F, hueco real en el drenado.** El diagnóstico en vivo (logueando cada PATCH
  que sale del navegador) mostró que la segunda edición de una celda SÍ disparaba un
  segundo PATCH, pero con el valor VIEJO. En `sendItemCellPatchRound`, al resolver
  una ronda con éxito, `itemDirtyCellsRef` se limpiaba incondicionalmente ANTES de
  `upsertLocalItemState(updatedItem, { preserveLocalEdits: true })` — si ya había un
  reintento encolado (edición más nueva llegada durante esa ronda),
  `preserveLocalEdits` ya no veía la celda como "ocupada" y pisaba el valor recién
  tecleado con el de la ronda vieja. Fix: no limpiar `itemDirtyCellsRef` si ya hay un
  reintento encolado para esa celda.
- **Autofill, dato de test acumulado, no timing/caché.** `GET /api/productos?q=`
  (sin `.limit()` cuando `q` está vacío) se truncaba en el default de 1000 filas de
  PostgREST — `serenata-erp-test` acumuló 1241 productos porque el auto-aprendizaje
  de productos (`onConflict: 'descripcion'`) nunca colisiona cuando decenas de specs
  live usan descripciones únicas por corrida. Limpiados los 1241 (100% basura de
  test) y agregado `cleanupOrphanedTestProductos()` (purga productos de más de 1 día)
  al `beforeAll` de los 4 specs live que lo necesitan.

## Bloqueador final: token de Google Drive vencido (ajeno al código)

El job `live` quedó rojo un tiempo por `invalid_grant` al subir un PDF a Drive — el
refresh token de CI (`GOOGLE_DRIVE_REFRESH_TOKEN_TEST`, GitHub Actions Secret,
distinto del `GOOGLE_DRIVE_REFRESH_TOKEN` de Vercel) había expirado. Reautorizado
vía el flujo ya integrado en la app (`/api/integrations/drive/authorize` →
`/api/integrations/drive/callback`) y actualizado el secret correspondiente.

## Decisiones tomadas durante la fase

- Ver `docs/decisions/005-migraciones-manuales-append-only.md` — riesgo real de
  promover una migración que reemplaza una función completa sin diffear contra la
  definición viva primero.
- `scripts/check-schema-parity.mjs` agregado como chequeo manual (no en CI, requeriría
  el token de producción en GitHub Actions) — modo de uso definitivo (paso manual vs.
  workflow protegido) queda como decisión abierta.
- No se generalizó el protocolo `base`/`conflict` fuera de Cotizaciones.

## Resultado

**Fase 8.7.2 CLOSED.** `test`, `fresh-db`, `smoke-and-critical` y `live` (42/42,
incluidas las pruebas nuevas de causas E-I y el ciclo completo con Drive real) en
verde confirmado en CI — no solo push exitoso. Producción sincronizada con las
migraciones que el código de este PR asume, verificado con SQL directo, no solo por
la existencia del archivo.
