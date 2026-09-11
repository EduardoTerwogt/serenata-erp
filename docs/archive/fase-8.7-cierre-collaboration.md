# Fase 8.7 — Cierre real de Collaboration (bitácora)

**Cerrada:** 2026-09-11. Mergeada a `main` en el commit `887af1d` (PR #23).

## Objetivo

Cerrar los cinco huecos que dejó la auditoría de Fase 8 y dejar Cotizaciones
oficialmente READY, antes de empezar Engineering Hardening. Cotizaciones es el
módulo de referencia: lo que quedara a medias ahí se iba a replicar en Proyectos y
en Cuentas.

## Bloque 1 — Flush previo a Generar/Aprobar (P0)

`flushPendingSaves()` trackeaba el `fetch()` pero no necesariamente la operación
completa (un `409`/`500` podía pasar desapercibido), y no forzaba los cambios
`dirty` que seguían esperando su debounce de autosave.

`flushPendingSaves` ahora fuerza (sin await intermedio, foto atómica) todo lo dirty
de General/Totales/Partidas/Notas antes de leer `pendingMutationsRef`, y
`trackMutation` envuelve la operación completa (no el `fetch()` crudo) en las
cuatro vías -- un 409/500 pendiente ahora sí aborta Generar/Aprobar/el "Generar
PDF" standalone. Se agregó `transitionInFlightRef` (doble click) y un guard por
campo/celda contra el doble disparo entre el blur de sección y el propio flush del
click. `approve_cotizacion` ganó el mismo guard de estado bajo `FOR UPDATE` que ya
tenía `emitir_cotizacion` (asimetría encontrada en la auditoría) -- migración
`20260911_approve_cotizacion_estado_guard.sql`, validada contra
`serenata-erp-test` (estados inválidos e idempotencia de `APROBADA`, sin efectos
secundarios).

Cobertura: `tests/e2e/critical/cotizaciones-flush-transicion.spec.ts` (9 casos: las
5 vías de guardado x 409/500/dirty-click-inmediato, más el doble click) y un caso
unitario en `lib/server/quotations/__tests__/approval.test.ts`.

## Bloque 2 — Cleanup de Presence durante reconnect (P1)

Los timers de retry de `trackPresence()` se limpiaban en `onSessionEnd`, pero una
reconexión interna pasaba por `onDisconnected` y podía dejar vivo un retry del
canal viejo -- terminaba llamando `.track()` contra un canal ya retirado por
`useRealtimeChannel`.

`hooks/useQuotationPresence.ts` ganó `clearPendingTrackRetries`, una sola función
invocada desde `onDisconnected` y desde `onSessionEnd`, más un guard defensivo en
`intentar` (compara contra `channelRef.current`) para el residual de una promesa
de `.track()` que resuelve después del cleanup. No se tocó el protocolo de
Presence ni la estrategia de reconnect de `lib/realtime/useRealtimeChannel.ts`.

Cobertura: el test existente "el canal caído reconecta..." ahora exige cero
`pageerror` en general (antes solo excluía un mensaje puntual), y un test nuevo,
"Presence se recupera tras una caída de canal, sin pageerror", fuerza una caída
real (cierre de WebSocket del lado servidor) y confirma que Presence vuelve a
funcionar tras reconectar.

## Fix de causa raíz (fuera de los bloques): atomicidad en autofill de producto

El test `live` "seleccionar producto (autofill) mientras otro edita precio a
mano" fallaba de forma intermitente desde antes de Fase 8.7 (reproduce igual en
`main`/`09f880b`, confirmado por fecha de CI y por mecanismo real extraído de
payloads de diagnóstico en CI).

Causa raíz: `handleSelectProduct` nunca limpiaba `itemDirtyCellsRef`/el timer de
autosave de los 4 campos que parchea atómicamente -- si el usuario seguía con una
celda (p. ej. `descripcion`) dirty por una edición manual sin blur, el blur
disparado al elegir la sugerencia hacía que `handleItemFieldBlur` mandara un
segundo PATCH suelto de un solo campo, corriendo en paralelo al combinado. La RPC
nunca fue parcial: eran dos llamadas atómicas independientes, una de las cuales
nunca debió dispararse. Arreglado limpiando dirty + timer de los 4 campos antes de
aplicar la selección.

Cobertura: el test crítico mockeado ya existente ("seleccionar una sugerencia de
producto...") ahora falla si se dispara más de un PATCH a `/items/:id` --
confirmado que reproduce sin el fix y pasa con él.

## Bloque 3 — Prueba live de Aprobar bajo concurrencia (P1)

Existía el equivalente para Generar. Faltaba el de Aprobar: cotización `EMITIDA`,
usuario B modifica una partida mientras A pulsa Aprobar → queda `APROBADA`,
proyecto y cuentas se crean bien, y la modificación de B se preserva.

Nuevo test en `tests/e2e/live/cotizaciones-colaboracion.spec.ts`, mismo
`describe.serial` y mismo patrón que el de Generar. Verificado contra Supabase
real: la cotización queda `APROBADA`, la edición de B no se revirtió, el proyecto
se creó, la cuenta por cobrar se creó, y las cuentas por pagar creadas coinciden
exactamente con las partidas que tienen `x_pagar > 0` en ese momento (invariante,
no un conteo fijo). Nuevo helper `leerProyectoYCuentasDelServidor` en
`tests/e2e/utils/live-helpers.ts`, mismo patrón que `leerCotizacionDelServidor`.
No se tocó `approve_cotizacion` ni `cleanupLiveCotizacion` (ya limpiaba
proyectos/cuentas de antes).

## Bloque 4 — Conflicto de UUID cruzado explícito (P2)

La integridad de DB ya estaba protegida (`upsert_items_cotizacion`, guard por
`WHERE cotizacion_id` en el `ON CONFLICT`); el hueco era de semántica de API:
`POST /api/cotizaciones/:id/items` descartaba el retorno de `upsertItems` y, si el
guard rechazaba un id ya perteneciente a otra cotización, terminaba respondiendo
`{ item: undefined }` con status 200 -- una respuesta exitosa con una partida
inexistente.

Ahora usa el retorno directo de `upsertItems`: si venía un id explícito del
cliente y el array resultante viene vacío, responde `409` sin recalcular ni emitir
el evento confirmado. El caso "mismo id en la misma cotización" ya era idempotente
de antes, sin cambios. No se tocó la RPC ni `items/bulk/route.ts` (sus ids ya
vienen siempre propios de la misma cotización o recién generados).

Cobertura: unit nuevo para el caso 409 (`cotizaciones-items-create-route.test.ts`)
y un test live nuevo que pasa por la API real, no por la RPC directo
(`items-cotizacion-uuid-guard.spec.ts`), confirmando el 409 y que la fila de A y
el conteo de B quedan intactos.

## Bloque 5 — Actualizar `ARCHITECTURE.md`

Verificada la descripción contra el código real después de los bloques 1-4 y
actualizada: se agregó la garantía de flush + revalidación de estado bajo
`FOR UPDATE` en ambos RPCs (Bloque 1) y el `409` explícito por UUID cruzado en la
creación de partidas (Bloque 4) a la sección de Edición colaborativa; se quitó el
aviso "Todavía no es READY" y se declaró el módulo READY. No se documentó la capa
genérica `base`/`conflict` (deuda intencional, sigue así hasta que Proyectos
exista como segundo consumidor real).

## Validación final

Los 5 bloques verdes en CI real (`test`, `fresh-db`/Migrations,
`smoke-and-critical`, `live`) sobre el commit final del PR #23 (`9dc2b41`), y de
nuevo sobre el propio `main` tras el merge (`887af1d`). Un único caso de "flake"
detectado durante el proceso (`cotizaciones-editar.spec.ts` — reconciliación de
import masivo, timeout de 5s), no relacionado con ningún diff de esta fase,
confirmado como tal al salir verde en un re-run manual sin cambios de código.

## Decisiones tomadas durante la fase

- PostgreSQL sigue siendo la fuente de verdad. Presence es solo awareness.
- No generalizar lógica de negocio específica de Cotizaciones en esta fase — la
  capa genérica `base`/`conflict` espera a que Proyectos exista como segundo
  consumidor real.
- La integridad de DB del UUID cruzado ya estaba resuelta antes de esta fase; el
  trabajo del Bloque 4 fue de semántica de API, no de esquema — no se tocó la RPC.

## Resultado

**Fase 8 CLOSED — Collaboration architecture READY.** Cotizaciones queda como
módulo de referencia para Proyectos y Cuentas cuando necesiten edición
colaborativa.
