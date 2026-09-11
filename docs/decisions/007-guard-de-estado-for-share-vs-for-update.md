# 007 — El guard de estado en escrituras de partidas usa FOR SHARE, no FOR UPDATE

## Contexto

Fase 8.7.1: ninguna escritura de partidas (`patch_item_cotizacion`,
`upsert_items_cotizacion`, el `DELETE`) revisaba el `estado` de la cotización dueña
-- se podía seguir modificando, creando, borrando o importando partidas de una
cotización ya `APROBADA`/`CANCELADA`, sin garantía de orden frente a una aprobación
en curso (`approve_cotizacion` lee `items_cotizacion` sin lock, así que un PATCH que
ganara la carrera después de esa lectura pero antes del commit podía dejar
`cuentas_pagar`/`cuenta_cobrar` calculadas de un snapshot que ya no coincidía con la
partida recién escrita). Había que agregar un guard, y decidir qué lock usar.

## Decisión

Las tres RPCs de escritura de partidas hacen `SELECT estado FROM cotizaciones WHERE
id = ... FOR SHARE` antes de tocar la partida, y rechazan si el estado no es
`BORRADOR`/`EMITIDA`. `emitir_cotizacion`/`approve_cotizacion` siguen con `FOR
UPDATE` (exclusivo) para la transición de estado en sí -- eso no cambió.

## Razón

`FOR SHARE` es un lock compartido: muchas escrituras de partidas *distintas*
(el caso común, dos usuarios editando filas distintas de la misma cotización) lo
toman a la vez sin bloquearse entre sí. Solo bloquea contra el `FOR UPDATE`
exclusivo de una transición de estado en curso -- Postgres serializa exactamente el
caso peligroso (edición vs. transición) sin serializar el caso común (edición vs.
edición). Con `FOR UPDATE` en las escrituras de partidas, dos usuarios editando la
misma cotización a la vez se habrían bloqueado entre sí en cada PATCH -- una
regresión de rendimiento/UX para resolver un problema que no tenían.

## Alternativas descartadas

- **`FOR UPDATE` en las escrituras de partidas** -- serializa también el caso común
  (partidas distintas), sin necesidad.
- **Chequeo de estado en JS antes de llamar a la RPC, sin lock** -- es exactamente
  la misma clase de bug que ya existía (`approveQuotationAndFetchResult` verificaba
  el estado en JS antes del `FOR UPDATE` de `approve_cotizacion`, encontrado y
  corregido en Fase 8.7): TOCTOU, no cierra la carrera real.
- **No lockear nada, comparar timestamps o `revision`** -- no evita que una escritura
  aterrice después de que la transición ya comprometió proyecto/cuentas; solo lo
  detectaría después del hecho.

## Consecuencias

- Un guard nuevo sobre una tabla que ya tiene una transición de estado con `FOR
  UPDATE` debe usar `FOR SHARE`, no `FOR UPDATE`, salvo que el caso común también
  deba serializarse (no es el caso aquí).
- `upsert_items_cotizacion` cambió su forma de retorno de `setof items_cotizacion` a
  `jsonb` (necesario para poder devolver `{estado_invalido, estado_actual}`) -- todo
  caller directo de esa RPC (no solo `upsertItems()`) debe desenvolver `.items`.
