# 004 — Guardar una cotización preserva los ids de sus partidas

## Contexto

`save_cotizacion` borraba y recreaba todas las partidas con ids nuevos en cada
guardado. Era la **causa raíz** de que se perdieran ediciones ajenas: la fila que
el otro usuario estaba editando dejaba de existir a media edición.

## Decisión

Guardar preserva los ids existentes de `items_cotizacion`. El upsert va siempre
acotado por `cotizacion_id` vía RPC (`upsert_items_cotizacion`), nunca un upsert
genérico. Las partidas se leen **siempre con `ORDER BY orden`**.

## Razón

Un id estable es lo que permite que un PATCH por partida tenga sentido. Sin
`WHERE cotizacion_id`, un UUID reusado entre cotizaciones distintas podía
secuestrar la fila de otra vía `ON CONFLICT DO UPDATE`. Sin `ORDER BY`, Postgres
devuelve orden arbitrario y las filas se barajan al actualizar cualquiera.

## Alternativas descartadas

- **Borrar y recrear** — el comportamiento original; es el bug.
- **Upsert genérico sin acotar** — abre la colisión cruzada descrita arriba.

## Consecuencias

- No revertir este comportamiento por "simplificar" el guardado.
- Migraciones de referencia: `20260909_preservar_ids_y_guardados_por_seccion.sql`,
  `20260909_patch_item_cotizacion_rpc.sql`, `20260910_upsert_items_cotizacion_guarded.sql`.
