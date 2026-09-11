# Trabajo activo

**Última actualización:** 2026-09-11

## Initiative

**Fase 8.7 — Cierre real de Collaboration.**

## Objetivo

Cerrar los huecos que dejó la auditoría de Fase 8 y dejar Cotizaciones oficialmente
READY, antes de empezar Engineering Hardening. Cotizaciones es el módulo de
referencia: lo que quede a medias aquí se va a replicar en Proyectos y en Cuentas.

## Rama

`fase-8.7-collaboration`. Rama + PR + Vercel Preview, como toda iniciativa
(`CLAUDE.md`, "Rama + PR, merge al final"). El merge a `main` ocurre **una sola vez**,
cuando los cinco bloques estén cerrados y todas las suites verdes.

## Bloques aprobados

### 1. Flush previo a Generar/Aprobar — P0

`flushPendingSaves()` trackea el `fetch()` pero no necesariamente la operación
completa (un `409`/`500` puede pasar desapercibido), y no fuerza los cambios `dirty`
que siguen esperando su debounce de autosave.

Flujo correcto: detener debounces → forzar persistencia de todo lo dirty → esperar
esas operaciones → esperar las mutaciones en vuelo → **abortar la transición si hay
error o conflicto** → transición de estado → fetch canónico → PDF/aprobación.

Mantenerlo local a la pantalla de Cotización. No convertirlo en un sistema global.

**Cierre:** no existe ninguna ruta donde Generar/Aprobar se ejecute antes de que los
cambios locales previos estén confirmados por servidor. Cubierto con tests de:
cambio + click inmediato antes de los 800 ms; PATCH con `409` → no pasa a `EMITIDA`;
PATCH con `500` → no continúa; y el caso de dirty-save inmediato con Aprobar.

### 2. Cleanup de Presence durante reconnect — P1

Los timers de retry de `trackPresence()` se limpian en `onSessionEnd`, pero una
reconexión interna pasa por `onDisconnected` y puede dejar vivo un retry del canal
viejo. Una sola función de limpieza, ejecutada tanto en disconnect/reconnect como en
unmount/session end. No cambiar el protocolo de Presence ni la estrategia de reconnect.

**Cierre:** tras varias desconexiones, ningún retry hace `track()` contra un canal
retirado, cero `pageerror`, y Presence vuelve a funcionar al recuperar conexión.

### 3. Prueba live de Aprobar bajo concurrencia — P1

Existe el equivalente para Generar. Falta el de Aprobar: cotización `EMITIDA`,
usuario B modifica una partida mientras A pulsa Aprobar → queda `APROBADA`, proyecto
y cuentas se crean bien, y la modificación de B se preserva. Dos navegadores reales
contra `serenata-erp-test`.

**Cierre:** Aprobar bajo escritura concurrente queda cubierto con la misma calidad
que Generar.

### 4. Conflicto de UUID cruzado explícito — P2

La integridad de DB ya está protegida (`upsert_items_cotizacion`). **No cambiar la
RPC.** Mejorar solo la semántica de la API: UUID nuevo → crear; UUID existente en la
misma cotización → retry idempotente; UUID existente en otra cotización → `409`.

**Cierre:** no hay respuestas exitosas con un `item` inexistente. Test: crear en B con
un UUID de A → `409` y la fila de A intacta.

### 5. Actualizar `ARCHITECTURE.md` — obligatorio

Debe describir la implementación real: Postgres como única fuente de verdad; browser
solo mutaciones API/RPC y Presence; servidor emite broadcast confirmado tras el
commit; conflictos por campo con `409`; Realtime como mecanismo primario de
invalidación y el polling **solo** como fallback; UUID estable por fila; reconnect
sobre `useRealtimeChannel`.

Eliminar lo que ya no es cierto: broadcasts de negocio desde el browser,
`channel.send()` como mecanismo colaborativo, y last-write-wins sin detección de
conflictos.

**Adelantado el 2026-09-11:** ya se corrigieron en `ARCHITECTURE.md` los 5 s contra
los 20 s reales de `RECONCILIACION_MS`, el "READY" prematuro, el broadcast confirmado
como mecanismo primario y el `409` como detección real de conflicto — dejar en pie una
afirmación que ya se sabe falsa contradice la regla del propio flujo. También se
alineó `docs/decisions/002`.

**Lo que queda de este bloque:** verificar al cerrar la fase que la descripción sigue
siendo cierta después de los bloques 1-4, y quitar el aviso de "todavía no es READY".

**No documentar todavía** una capa genérica `base`/`conflict`: sigue siendo deuda
intencional hasta que Proyectos exista como segundo consumidor real.

## Decisiones ya aprobadas

- PostgreSQL sigue siendo la fuente de verdad. Presence es solo awareness.
- No generalizar lógica de negocio específica de Cotizaciones en esta fase.
- La integridad de DB del UUID cruzado ya está resuelta; este trabajo es de semántica
  de API, no de esquema.

## Estado

**Bloque 1: cerrado.** `flushPendingSaves` ahora fuerza (sin await intermedio, foto
atómica) todo lo dirty de General/Totales/Partidas/Notas antes de leer
`pendingMutationsRef`, y `trackMutation` envuelve la operación completa (no el
`fetch()` crudo) en las cuatro vías -- un 409/500 pendiente ahora sí aborta
Generar/Aprobar/el "Generar PDF" standalone. Se agregó `transitionInFlightRef`
(doble click) y un guard por campo/celda contra el doble disparo entre el blur de
sección y el propio flush del click. `approve_cotizacion` gana el mismo guard de
estado bajo `FOR UPDATE` que ya tenía `emitir_cotizacion` (asimetría encontrada en la
auditoría, aprobada para este bloque) -- migración
`20260911_approve_cotizacion_estado_guard.sql`, aplicada y validada contra
`serenata-erp-test` (estados inválidos e idempotencia de `APROBADA`, sin efectos
secundarios). Cobertura nueva en
`tests/e2e/critical/cotizaciones-flush-transicion.spec.ts` (9 casos: las 5 vías de
guardado x 409/500/dirty-click-inmediato, más el doble click) y un caso unitario en
`lib/server/quotations/__tests__/approval.test.ts`. `tsc`, lint, unit (417), build,
smoke (21) y critical (59, incluidos los 9 nuevos) verdes localmente; `live` queda
pendiente de confirmar en CI (esta sesión no tiene el `service_role`/JWT de
`serenata-erp-test`, solo acceso de datos vía MCP).

Bloques 2-5: sin empezar.

## Próximo paso

Auditar el bloque 2 (`/serenata-iniciar-fase`) y proponer el plan antes de tocar código.

## Validación antes del merge

`tsc`, `lint`, unit, `build`, smoke, critical, migrations y `live` — todos verdes en
Vercel Preview + Supabase test.

En `live` específicamente: mismo campo → `409`; autofill vs precio manual; bulk
realtime; websocket/reconnect sin `pageerror`; UUID cruzado; Generar vs edición
concurrente; **Aprobar vs edición concurrente (nuevo)**; dirty-save inmediato antes
de la transición.

## Definition of Done

- No hay cambios dirty ni mutaciones fallidas que Generar/Aprobar pueda saltarse.
- Reconnect no deja timers ni canales viejos actuando.
- Generar y Aprobar tienen cobertura concurrente real.
- El UUID cruzado es seguro **y explícito** para el caller.
- `ARCHITECTURE.md` describe la arquitectura real.
- Todas las suites verdes.

Al cumplirse: **Fase 8 CLOSED — Collaboration architecture READY.**
