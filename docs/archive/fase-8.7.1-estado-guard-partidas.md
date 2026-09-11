# Fase 8.7.1 — Serializar mutaciones de partidas contra Generar/Aprobar (bitácora)

**Cerrada:** 2026-09-11.

## Objetivo

Una auditoría sobre el cierre de Fase 8.7 (que declaró Cotizaciones READY) encontró
un P0 que ese cierre no cubrió: `flushPendingSaves` solo esperaba las cuatro vías de
autoguardado por debounce (General, Totales, celda de partida, Notas), y ninguna
escritura de partidas revisaba el `estado` de la cotización dueña.

## Hallazgo verificado contra el código real (no contra la bitácora de 8.7)

1. **Cliente.** `handleSelectProduct`, `handleResponsableChange`, `handleAddRow`,
   `handleRemoveRow` y `handleImportItems` (`app/cotizaciones/[id]/page.tsx`) usaban
   `enqueueRowMutation`/`pendingRowCreationsRef` -- sirven para serializar contra
   OTRAS mutaciones de la misma fila, no para que `flushPendingSaves` las esperara.
   Ninguna pasaba por `trackMutation`.
2. **Servidor -- el hueco real.** `patch_item_cotizacion` y `upsert_items_cotizacion`
   (alta individual y masiva) nunca revisaban el estado de `cotizaciones`; el
   `DELETE` de una partida ni siquiera pasaba por RPC. Se podía modificar, crear,
   borrar o importar partidas de una cotización ya `APROBADA`/`CANCELADA` sin ningún
   rechazo -- y como `approve_cotizacion` lee `items_cotizacion` sin lock, un PATCH
   que ganara la carrera después de esa lectura pero antes del commit podía dejar
   `cuentas_pagar`/`cuenta_cobrar` calculadas de un snapshot que ya no coincidía con
   la partida recién escrita.
3. **Tests.** El test live de Aprobar bajo concurrencia (Fase 8.7 Bloque 3) solo
   probaba el orden favorable (la edición de B siempre ganaba la carrera); nunca el
   peligroso (Aprobar gana, la edición tardía debería rechazarse).

## Bloque 1 — Guard de estado transaccional (P0)

Migración `20260911_item_cotizacion_estado_guard.sql`: `patch_item_cotizacion`,
`upsert_items_cotizacion` y la nueva RPC `delete_item_cotizacion` bloquean la fila de
`cotizaciones` bajo `FOR SHARE` antes de tocar la partida; si el estado no es
`BORRADOR`/`EMITIDA`, devuelven `{estado_invalido, estado_actual}` en vez de aplicar
la escritura. `FOR SHARE` (no `FOR UPDATE`) para que dos escrituras de partidas
*distintas* sigan sin bloquearse entre sí -- solo esperan al `FOR UPDATE` exclusivo
de `emitir_cotizacion`/`approve_cotizacion`, que es lo único que cambia el estado.
`upsert_items_cotizacion` cambió su forma de retorno (`setof items_cotizacion` →
`jsonb`) para poder devolver el rechazo; `EstadoCotizacionInvalidoError`
(`lib/server/repositories/quotations.ts`) mapea esa forma a un `409` explícito en las
tres rutas de escritura de partidas. El `DELETE` directo por fila se reemplazó por la
RPC nueva -- mismo comportamiento en el caso feliz, ahora con el guard.

Cobertura: unit tests en `lib/server/repositories/__tests__/quotations-items-estado-guard.test.ts`
y casos nuevos en los tres archivos de test de rutas de partidas
(`cotizacion-item-patch-route.test.ts`, `cotizaciones-items-create-route.test.ts`,
`cotizaciones-items-bulk-route.test.ts`).

## Bloque 2 — Flush completo de las cinco vías restantes (P0)

`handleAddRow`, `handleRemoveRow`, `handleSelectProduct`, `handleResponsableChange` y
`handleImportItems` ahora envuelven su promesa de red completa con `trackMutation`,
mismo patrón que ya usaba `persistItemCellAutosave` -- `enqueueRowMutation` y
`pendingRowCreationsRef` se quedan igual (siguen sirviendo para serializar contra
otras mutaciones de la misma fila), `trackMutation` se agrega encima. `flushPendingSaves`
no cambió: ya sabía leer `pendingMutationsRef`, solo le faltaba que estas cinco vías
lo llenaran.

Cobertura: 8 casos nuevos en `tests/e2e/critical/cotizaciones-flush-transicion.spec.ts`
(las 5 combinaciones mutación+transición del reporte de auditoría, un 500 que aborta
la transición, y doble click con una mutación todavía en vuelo). Verificado que
pasan 3 veces seguidas (`--repeat-each=3`) para descartar flake -- el primer intento
de la prueba del 500 sí resultó flaky con una latencia fija en ms; se cambió a una
respuesta retenida hasta soltarla a mano, sin depender del reloj de la máquina.

## Bloque 3 — Test live del orden peligroso (P1)

Dos tests nuevos en `tests/e2e/live/cotizaciones-colaboracion.spec.ts`:

- Editar una partida de una cotización ya `APROBADA` (reusa el estado que deja el
  test de Aprobar de esta misma fase, justo antes) se rechaza con `409`/`estado_invalido`, sin
  tocar nada.
- Aprobar y un PATCH concurrente disparados de verdad con `Promise.all` (sin forzar
  quién gana) contra una cotización propia -- la aserción rama según quién ganó, y en
  ambos casos confirma que `cuentas_pagar` corresponde exactamente al snapshot de
  `items_cotizacion` que quedó vigente. No se puede ejecutar en este entorno (faltan
  credenciales de `serenata-erp-test`); queda para el job `live` de CI real.

## Bloque 4 — Documentación

`ARCHITECTURE.md`: sección de Edición colaborativa describe el guard de estado y la
relación `FOR SHARE`/`FOR UPDATE`; el módulo de Cotizaciones sigue READY, con nota de
qué cerró esta fase encima de 8.7.

## Decisiones tomadas durante la fase

- El guard usa `FOR SHARE`, no `FOR UPDATE`, deliberadamente: el caso común (dos
  usuarios editando partidas distintas) no debe serializarse; solo el caso peligroso
  (edición vs. transición de estado) debe hacerlo.
- No se generalizó `trackMutation`/`enqueueRowMutation` fuera de Cotizaciones.
- No se tocó Presence, el protocolo `base`/`conflict` por campo, ni
  `useRealtimeChannel`.

## Resultado

**Fase 8.7.1 CLOSED.** Ya no existe una ruta desde la pantalla de Cotización donde
Generar/Aprobar ocurra antes de confirmar una mutación de partida en vuelo, y el
servidor garantiza -- independiente del cliente, de pestañas múltiples o de la
latencia de red -- que ninguna partida se modifica después de que su cotización quedó
`APROBADA`/`CANCELADA`.
