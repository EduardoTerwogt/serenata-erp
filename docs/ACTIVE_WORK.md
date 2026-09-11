# Trabajo activo

**Última actualización:** 2026-09-11

## Estado

**Fase 8.7.2 — Cierre correctivo sobre colaboración en Cotizaciones, EN PROGRESO.**
Continuación directa de Fase 8.7.1 sobre el mismo módulo (mismo patrón que 8.7→8.7.1:
se auditó, aparecieron huecos reales, se numera una fase nueva — no se reabre la
anterior). Sesión cortada por límite de uso de cuenta **antes de terminar**; retoma
en cuenta/sesión nueva. Rama `claude/adoring-mayer-34emkm`, sin PR abierto todavía
(pendiente: abrir uno en borrador con el primer push útil, per `CLAUDE.md`).

**No mover esto a `docs/ROADMAP.md` → Cerrado todavía.** Solo la mitad está hecha.

### Los dos bugs reportados

1. **Avisos de "está editando" que no se actualizan** + banner de conflicto
   espurio: al agregar una partida mientras hay otra persona en el módulo (aunque
   esa persona no esté en Partidas), aparece "Alguien más lo cambió a "" mientras
   editabas", y "Mantener"/"Usar" no lo cierran.
2. **Totales/Utilidad no se recalculan** tras agregar una fila en modo
   colaborativo — solo quedan correctos al recargar la página completa.

Son bugs de estado en el cliente (Presence + React Hook Form + reconciliación), no
del modelo de datos: no tocar el protocolo de conflictos por campo
(`docs/decisions/002`), Presence-only Realtime (`docs/decisions/003`) ni los guards
`FOR SHARE`/`FOR UPDATE` (`docs/decisions/007`).

Este diagnóstico pasó por tres rondas de auditoría cruzada (dos externas, sobre dos
versiones sucesivas del plan) antes de aprobarse — cada hallazgo de las auditorías
se verificó contra el código real antes de aceptarlo, y una propuesta (reabrir Fase
8.7.1 en vez de numerar 8.7.2) se rechazó con evidencia (`grep "8.7.2"` no da
resultados en el repo; los bloqueadores citados como pendientes — evento `bulk`
descartado en silencio, recálculo fuera de la transacción — están en
`docs/ROADMAP.md` bajo **Engineering Hardening**, iniciativa distinta y sin
arrancar, no bajo 8.7.1, que el repo ya marca Cerrado).

## Completado en esta sesión (aplicado en el working tree, sin commitear)

Causas A-D del diagnóstico, cada una verificada leyendo el código real:

1. **Presence: limpiar la celda activa al soltar sección + filtrar por sección.**
   `hooks/useQuotationPresence.ts`, `releaseSection`: ahora limpia también
   `activeCellRef.current = null` y difunde `trackPresence(null, null)` — antes
   solo limpiaba `active_section`, nunca `entity_id`/`field`, así que el heartbeat
   de 15s repetía indefinidamente "editando esta celda" aunque el usuario ya
   hubiera salido de Partidas. `itemCellEditors` ahora además filtra
   `user.active_section !== 'partidas'` como defensa adicional.
2. **`mutation_id` real en el alta de fila.** `createQuotationItemRow` (page.tsx)
   ahora manda `mutation_id`; `app/api/cotizaciones/[id]/items/route.ts` lo lee del
   body y lo threadea al broadcast `item_confirmed` (antes iba `null` siempre) —
   así el propio creador de una fila reconoce su confirmación y no dispara una
   reconciliación completa contra sí mismo.
3. **Modal/tarjeta móvil de edición atado por id estable, no por índice.**
   `editingItemIndex` (`useState<number|null>`) → `editingItemRowId`
   (`useState<string|null>`) en `page.tsx`, `QuotationItemsSection.tsx`,
   `app/cotizaciones/nueva/page.tsx` y `useNuevaCotizacionPage.ts` (comparten el
   componente). El índice se deriva en cada render vía
   `watchedItems.findIndex(i => i.id === editingItemRowId)`, así que se autocorrige
   tras cualquier `replace()` de reconciliación — antes, un índice guardado
   quedaba apuntando a la fila equivocada y "Mantener"/"Usar" no hacían nada.
4. **`handleAddRow` ya no roba el foco.** `append(..., { shouldFocus: false })`,
   igual que los otros `append()` del archivo — evita un aviso de "editando
   Partidas" no intencional al agregar una fila.

**Verificado desktop vs. móvil:** el bug del índice stale (causa C) es específico
de móvil (`rowIdAt(index)` en desktop se recalcula dentro del propio loop de
render, sin estado persistido que pueda desincronizarse). La causa E de abajo, en
cambio, afecta ambas plataformas por igual.

**Tests corridos sobre 1-4:** `npx tsc --noEmit` limpio, `npm run lint` limpio (solo
warnings preexistentes sin relación), `npm test` → 428/428 (se agregó un caso nuevo
en `app/api/__tests__/cotizaciones-items-create-route.test.ts` para el
`mutation_id`). `npm run test:e2e:smoke`/`critical` **no se pudieron correr limpios
en este sandbox** — la versión de Chromium preinstalada (`chromium-1194`) no
coincide con la que `@playwright/test@1.54.2` espera (`headless_shell-1217`); es un
problema de entorno, no de este código (ver nota de infraestructura, abajo).
`live` no corre en este sandbox en absoluto (red bloqueada a `*.supabase.co`, ver
`TESTING.md`).

## Pendiente: causas E-I, diseñadas pero NO codeadas todavía

Diagnóstico completo, con líneas exactas y los snippets de la solución, verificado
contra el código real (no solo inferido) — implementar tal cual antes de dar el
bloque por cerrado.

### E. `itemCellBaseRef` nunca se refresca tras un PATCH exitoso (causa raíz real, no depende de un segundo colaborador)

`persistItemCellAutosave`, en éxito, llama `upsertLocalItemState(...)`, que solo
hace `recordServerItem` + `setValue` por celda — **nunca toca `itemCellBaseRef`**.
Si un usuario edita una celda, el autoguardado de 800ms confirma (servidor pasa de
V0 a V1), y sigue editando la MISMA celda sin blur (patrón normal: pausa, autoguarda,
sigue afinando), el siguiente autoguardado manda la `base` capturada en el FOCUS
original (V0), no V1 → el servidor compara V0 contra V1 → `409` **contra uno
mismo**, con `current` pudiendo ser cualquier valor (incluido vacío). Esto puede
explicar el síntoma "alguien más lo cambió a ''" incluso sin un segundo colaborador
real tocando nada.

### F. Sin serialización real por celda, y `flushPendingSaves` puede no ver un reintento pendiente

`persistItemCellAutosave` no comprobaba si la celda ya tenía un PATCH en vuelo.
`flushPendingSaves` toma **una foto única** de lo que está en vuelo
(`pendingMutationsRef` + `disparadas`) y hace un solo `await Promise.allSettled(...)`
— sin loop, sin re-chequeo. Una solución ingenua ("si ya hay uno en vuelo, no mandar
otro y confiar en que algo dispare un reintento después") rompe la garantía que Fase
8.7.1 cerró ("ninguna transición corre con cambios locales sin confirmar"), porque
`flushItemCellDirtyFields` salta por completo una celda ya en `itemSavingCellsRef`,
y un reintento que arranca después de que `flushPendingSaves` ya tomó su foto nunca
entra a lo que el flush espera.

**Diseño aprobado (drenado por celda):**

```ts
// Nuevos refs, junto a itemSavingCellsRef/itemDirtyCellsRef:
const itemCellDrainRef = useRef<Map<string, Promise<unknown>>>(new Map())
const itemCellRetryNeededRef = useRef<Set<string>>(new Set())

// Extraer el cuerpo actual de persistItemCellAutosave (armar patch, mandar PATCH,
// aplicar éxito/conflicto) a una función interna:
const sendItemCellPatchRound = useCallback(async (rowId, field) => {
  const key = getItemCellKey(rowId, field)
  await awaitRowCreation(rowId)          // Fix I: garantiza itemsServerRef poblado
  let base = itemCellBaseRef.current[key]
  if (base === undefined) {              // Fix I: reconstruir si nunca se capturó
    const freshBase = buildItemFieldBase(itemsServerRef.current[rowId], field)
    if (freshBase) { base = freshBase; itemCellBaseRef.current[key] = freshBase }
  }
  clearItemCellAutosaveTimer(key)        // Fix I: cancela debounce redundante
  // ...arma `patch` con normalizeItemFieldValue (ver causa G) por campo,
  // llama patchQuotationItem(rowId, patch, { base, mutationId })
  // en éxito: aplica lo de siempre Y ADEMÁS refresca itemCellBaseRef.current[key]
  //   al valor recién confirmado (arregla causa E) y limpia itemDirtyCellsRef.
  // en conflicto real (no idéntico, causa G): dispara el banner, NO limpia
  //   itemDirtyCellsRef (deliberado, bloquea Generar/Aprobar), relanza el error.
  // en conflicto idéntico (causa G): se resuelve solo, limpia itemDirtyCellsRef.
}, [...])

const persistItemCellAutosave = useCallback((rowId, field) => {
  const key = getItemCellKey(rowId, field)
  const existing = itemCellDrainRef.current.get(key)
  if (existing) { itemCellRetryNeededRef.current.add(key); return existing }
  itemSavingCellsRef.current.add(key)
  const drain = (async () => {
    let result
    do {
      itemCellRetryNeededRef.current.delete(key)
      result = await sendItemCellPatchRound(rowId, field)   // throw = conflicto real, rechaza el drenado
    } while (itemCellRetryNeededRef.current.has(key))
    return result
  })().finally(() => {
    itemSavingCellsRef.current.delete(key)
    itemCellDrainRef.current.delete(key)
  })
  itemCellDrainRef.current.set(key, drain)
  return drain
}, [...])
```

**Hueco encontrado en la ronda de revisión siguiente (ya incorporado arriba en el
diseño, detallar bien al codear):** una tecla nueva sola NO llama a
`persistItemCellAutosave` (solo reprograma el debounce) — si la ronda en vuelo
resuelve antes de que venza ese debounce, limpia dirty sin que nadie haya marcado
`retryNeeded`, y si `flushPendingSaves` corre justo ahí no ve nada pendiente. Dos
cambios lo cierran:

```ts
// dentro de handleItemFieldChange, junto a lo que ya marca dirty:
if (itemCellDrainRef.current.has(key)) itemCellRetryNeededRef.current.add(key)
```
```ts
// flushItemCellDirtyFields: iterar la UNIÓN de itemDirtyCellsRef y
// itemCellDrainRef.keys(), no solo dirty -- así un drenado activo se ve aunque su
// ronda actual haya limpiado dirty un instante antes. A propósito NO marca
// retryNeeded por su cuenta (generaría PATCH redundantes en cada Generar):
const keys = new Set([...itemDirtyCellsRef.current, ...itemCellDrainRef.current.keys()])
for (const key of keys) {
  const existingDrain = itemCellDrainRef.current.get(key)
  if (existingDrain) { disparadas.push(existingDrain); continue }
  if (!itemDirtyCellsRef.current.has(key)) continue
  const [rowId, field] = key.split(':')
  clearItemCellAutosaveTimer(key)
  disparadas.push(persistItemCellAutosave(rowId, field))
}
```
`itemSavingCellsRef` sigue marcado durante TODO el drenado (una vez antes del
`do...while`, se quita una vez en el `.finally()` externo) — `celdaOcupada` en
`reconciliarConServidor` ya lo consulta, así que la celda queda protegida de un
pisado por reconciliación en toda la ventana, sin cambios ahí.

### G. "Conflicto idéntico" necesita comparación normalizada, no `===` crudo

`attempted`/`current` de la RPC pueden diferir de lo que hay en el formulario por
representación (`null` vs `''`, `"10"` vs `10`), no solo por dato real. Normalizar
con la MISMA coerción que ya arma el `patch` de cada campo:

```ts
function normalizeItemFieldValue(field: QuotationItemCellField, value: unknown): unknown {
  switch (field) {
    case 'categoria': case 'descripcion': case 'responsable_id': return value || ''
    case 'cantidad': return Number(value) || 0
    case 'precio_unitario': case 'x_pagar':
      return value === '' || value === null || value === undefined ? 0 : Number(value) || 0
  }
}
```
`sendItemCellPatchRound` arma `patch[field]` llamando a esta función (reemplaza el
switch inline actual) y, ante conflicto, compara
`normalizeItemFieldValue(field, attempted) === normalizeItemFieldValue(field, current)`.
Mismo principio para General/Totales, reusando la coerción que ya hacen
`getGeneralFieldValue`/`getTotalsFieldValue` (`page.tsx:893-909`).

### H. Totales: `fields[i].id` NO es el UUID de negocio — usar `useWatch`, no join por id

`useFieldArray({ control, name: 'items' })` sin `keyName` custom: `fields[i].id` es
la key autogenerada de RHF para React, no el `id` de negocio que se le pasó a
`append()` (confirmado: el propio comentario del componente ya lo decía). Un diseño
anterior que unía por `field.id` nunca iba a encontrar nada. Fix real:

```ts
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
// ...
const liveItemsForTotals = useWatch({ control, name: 'items' }) ?? []
const itemsParaTotales = useMemo(
  () => liveItemsForTotals as QuotationFormValues['items'],
  [liveItemsForTotals]
)
```
Solo para este cálculo — no migrar el resto del componente de `watch('items')` a
`useWatch` (fuera de alcance, más call-sites afectados). `fields` sigue siendo
exclusivamente la key de remonte de `useFieldArray`.

### I. Primera edición de una fila nueva: reconstruir base + evitar PATCH redundante

Ya integrado en el snippet de `sendItemCellPatchRound` arriba
(`awaitRowCreation` + reconstruir `base` si `undefined` + `clearItemCellAutosaveTimer`).
Además, en `handleAddRow` (líneas ~1388-1418 de `page.tsx`), `pendingRowCreationsRef`
guarda hoy un `.then` registrado directamente sobre `creation`, ANTES de
`await creation` — como los `.then` de una promesa se disparan en el orden en que
se registraron, esa promesa puede resolver antes de que `recordServerItem(createdItem)`
se ejecute. Fix:

```ts
const creation = trackMutation(createQuotationItemRow(rowId, mutationId))
const rowReady = creation.then(
  (createdItem) => { if (createdItem) recordServerItem(createdItem); return createdItem },
  () => undefined
)
pendingRowCreationsRef.current.set(rowId, rowReady.then(() => undefined))
try {
  const createdItem = await rowReady
  if (!createdItem) throw new Error('No se pudo crear la fila')
  setCotizacion((prev) => prev ? { ...prev, items: [...(prev.items || []), createdItem] } : prev)
  // (el resto de handleAddRow sigue igual)
```

### Orden de implementación recomendado

1. Verificar que los Fixes 1-4 (ya aplicados) siguen intactos.
2. Fix H (totales, `useWatch`) — autocontenido, reemplaza el código de
   `itemsParaTotales` que YA está en el working tree (versión con `Math.max`/join
   por id, ambas descartadas, ver "Deuda técnica" abajo).
3. Fix E/F/I juntos (son un solo cambio coherente: `sendItemCellPatchRound` +
   ambos refs nuevos + `handleItemFieldChange` + `flushItemCellDirtyFields` +
   `handleAddRow`) — no separarlos, dejarían el drenado a medias.
4. Fix G (comparación normalizada) — se apoya en la función de normalización que
   E/F ya necesita.
5. Aplicar el mismo principio de G a General/Totales
   (`resolveGeneralFieldConflict`/`resolveTotalsFieldConflict` y sus handlers de
   rechazo).

### Validación pendiente

`npx tsc --noEmit && npm run lint && npm test` en cada paso. Pruebas live nuevas en
`tests/e2e/live/cotizaciones-colaboracion*.spec.ts` (no corren en este sandbox, solo
en CI vía el PR), capturando el payload real del `409` (`rowId`, `field`, `base`,
`current`, `attempted`) y cuántos PATCH viajaron:

1. B fuera de Partidas, A agrega y llena una fila → ningún conflicto ni aviso
   espurio.
2. A agrega una fila y escribe inmediatamente (antes de que la creación confirme)
   → un solo PATCH efectivo, sin 409, con y sin robo de foco.
3. Un solo usuario edita la misma celda dos veces seguidas sin blur, con pausa
   larga entre ambas → ningún conflicto contra uno mismo (prueba directa de E,
   reproducible sin segundo colaborador).
4. Conflicto real → "Mantener" persiste lo escrito, en desktop y móvil.
5. Conflicto real → "Usar" aplica el valor del servidor, en desktop y móvil.
6. Escribir, y mientras el PATCH viaja escribir de nuevo en la misma celda → el
   drenado manda un segundo PATCH con el valor final, sin 409.
7. Después de 4-6, Subtotal/Total/Utilidad cambian sin recargar.
8. Salir de Partidas elimina de inmediato el aviso de celda/sección para el otro
   colaborador.
9. Alta concurrente de fila (A y B casi al mismo tiempo) → ambas filas y Totales
   correctos sin recargar, sin fusionar campos de filas distintas.
10. Modal móvil abierto + `replace()` de otro colaborador → sigue
    mostrando/resolviendo la fila correcta.
11. PATCH resuelve justo antes de que venza el debounce de la tecla siguiente,
    dispara Generar/Aprobar en ese instante → el flush espera el segundo PATCH,
    la transición nunca corre con la celda sin confirmar.
12. Agregar fila y escribir ANTES de que el POST confirme → primer PATCH sin
    conflicto; segunda edición inmediata (sin blur) tampoco choca consigo misma.

Regresión de un usuario: `tests/e2e/critical/cotizaciones-editar.spec.ts`,
`cotizaciones-nueva-partidas.spec.ts`, `cotizaciones-flush-transicion.spec.ts`.

`npm run build` antes de push (toca rutas/TS).

## Decisiones nuevas de esta sesión

- **Reclasificación:** esto NO es "ajuste puntual fuera de roadmap" — cierra un
  hueco real en la garantía transaccional que Fase 8.7.1 había establecido
  ("ninguna transición corre con cambios locales sin confirmar"). Se documenta como
  Fase 8.7.2 en `docs/ROADMAP.md` → Cerrado **una vez terminado**, no antes. No se
  reabre 8.7.1 (ver evidencia arriba).
- **Totales: `useWatch` solo para ese cálculo, no migración completa.** Se
  consideró y descartó migrar todo `watch('items')` a `useWatch` en el componente —
  alcance mayor al de este fix, se deja como decisión aparte si se quiere más
  adelante.
- **No unificar `fields`/`watch('items')` en general.** `fields` sigue siendo
  exclusivamente la key de remonte de `useFieldArray` (confirmado que ese es su
  único rol real hoy); no se propone eliminar esa dualidad.

## Problemas encontrados (abiertos)

- **El working tree tiene código de Totales y de "un PATCH en vuelo" que ya se
  sabe INCORRECTO** (versiones descartadas del diseño, antes de las causas H y
  E/F de arriba): el cálculo de `itemsParaTotales` actual usa `Math.max`/join por
  `field.id` (no funciona, ver causa H) y `persistItemCellAutosave` tiene un guard
  de un solo reintento sin refrescar `itemCellBaseRef` (ver causas E/F). **No dar
  por bueno ese código** — reemplazar según el diseño de arriba antes de correr la
  suite de validación completa o hacer merge.
- **`test:e2e:smoke`/`test:e2e:critical` no corrieron limpios en este sandbox**
  por un mismatch de versión de Chromium preinstalada vs. la que
  `@playwright/test@1.54.2` espera — investigar si es un problema del sandbox en sí
  (reportar si persiste) o basta con un override de `executablePath` temporal (NUNCA
  commitear ese override) para validar localmente. No bloquea: `smoke`/`critical`
  sí corren en CI con el binario correcto.
- Heredados de antes (sin tocar esta sesión): flake recurrente del job `live` en CI
  (ver commits previos), PUT genérico en `cuentas-pagar` (`docs/archive/auditoria-ingenieria-2026-09.md`).

## Deuda técnica conocida (sin resolver, intencional)

- **Capa genérica `base`/`conflict`:** el protocolo de conflictos por campo sigue
  siendo específico de Cotizaciones. Se decide su forma genérica cuando Proyectos
  exista como segundo consumidor real, no antes.

## Siguiente paso

1. Implementar causas E-I tal como están diseñadas arriba (o revisar el archivo de
   plan completo si sigue disponible en `/root/.claude/plans/los-avisos-de-floofy-dragonfly.md`
   de la sesión anterior — pero ese path es local a esa sesión/cuenta, no está en
   git; este documento ya tiene todo el contenido técnico necesario para no
   depender de él).
2. Correr la suite completa de validación (arriba) y confirmar que
   `flushPendingSaves`/Generar/Aprobar nunca corren con una celda sin confirmar.
3. Abrir el PR en borrador hacia `main` con el primer commit útil de la rama (no
   se abrió todavía en esta sesión).
4. Una vez todo en verde (incluido `live` en CI, no solo el push): documentar el
   cierre real como Fase 8.7.2 en `docs/ROADMAP.md` → Cerrado y en
   `ARCHITECTURE.md` → Edición colaborativa (mismo formato que la entrada de
   8.7.1), y recién ahí actualizar este documento a "ninguna iniciativa activa".
