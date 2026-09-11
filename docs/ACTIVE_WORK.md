# Trabajo activo

**Última actualización:** 2026-09-11

## Initiative

**Fase 8.7 — Cierre real de Collaboration.**

## Objetivo

Cerrar los huecos que dejó la auditoría de Fase 8 y dejar Cotizaciones oficialmente
READY, antes de empezar Engineering Hardening. Cotizaciones es el módulo de
referencia: lo que quede a medias aquí se va a replicar en Proyectos y en Cuentas.

## Regla de ejecución

Branch dedicada + PR + Vercel Preview. **No trabajar directo sobre `main`** en esta
fase — es la excepción a la regla general de `CLAUDE.md`, por el riesgo de tocar el
motor de colaboración.

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

**Hallazgo confirmado el 2026-09-11:** `ARCHITECTURE.md` dice que la reconciliación
corre **cada 5 s**; el código usa `RECONCILIACION_MS = 20_000`
(`app/cotizaciones/[id]/page.tsx:46`). Corregir también esto.

**No documentar todavía** una capa genérica `base`/`conflict`: sigue siendo deuda
intencional hasta que Proyectos exista como segundo consumidor real.

## Decisiones ya aprobadas

- PostgreSQL sigue siendo la fuente de verdad. Presence es solo awareness.
- No generalizar lógica de negocio específica de Cotizaciones en esta fase.
- La integridad de DB del UUID cruzado ya está resuelta; este trabajo es de semántica
  de API, no de esquema.

## Estado

Bloques 1-5: sin empezar.

## Próximo paso

Auditar el bloque 1 (`/serenata-iniciar-fase`) y proponer el plan antes de tocar código.

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
