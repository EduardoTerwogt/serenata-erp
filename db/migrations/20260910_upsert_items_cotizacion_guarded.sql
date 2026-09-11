-- Fase 8 (hardening pre-Proyectos): las partidas nacen con UUID generado en el
-- CLIENTE (crypto.randomUUID(), Fase 6B) -- correcto para IDs estables, pero
-- `upsertItems()` (lib/server/repositories/quotations.ts) hacía un
-- `.upsert(items)` genérico de supabase-js, sin ningún WHERE en el ON CONFLICT.
-- `items_cotizacion.id` es PK GLOBAL (sin constraint compuesto con
-- cotizacion_id), así que un caller que reenvíe deliberadamente (o por un bug
-- futuro que reuse ids sin querer) el UUID de una partida que ya existe en OTRA
-- cotización, al "crear" en una cotización distinta, generaba un
-- ON CONFLICT (id) DO UPDATE que sobreescribía TODAS las columnas de esa fila
-- ajena -- incluido cotizacion_id -- con los valores en blanco de "partida
-- nueva". Secuestraba la fila.
--
-- `save_cotizacion` (20260909_preservar_ids_y_guardados_por_seccion.sql) ya
-- resuelve exactamente este problema con un WHERE en el ON CONFLICT DO UPDATE
-- -- esta RPC es el mismo patrón, extraído para que `upsertItems()` (las 2
-- rutas de alta de partidas: individual y bulk) lo use también en vez de un
-- upsert sin guardia. Cuando el WHERE no matchea (id de otra cotización), la
-- fila de ESE elemento simplemente no se toca -- no es un error, tampoco
-- corrompe nada; el caller decide si eso es aceptable para su caso (hoy,
-- ambos callers ya evitan mandar ids ajenos, así que en la práctica esto es
-- defensa en profundidad, no un cambio de comportamiento esperado).

create or replace function upsert_items_cotizacion(p_cotizacion_id text, p_items jsonb)
returns setof items_cotizacion
language sql
set search_path = public
as $$
  insert into items_cotizacion (
    id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe,
    responsable_nombre, responsable_id, x_pagar, margen, orden, notas
  )
  select
    coalesce(nullif(i->>'id', '')::uuid, gen_random_uuid()),
    p_cotizacion_id,
    coalesce(i->>'categoria', ''),
    coalesce(i->>'descripcion', ''),
    coalesce((i->>'cantidad')::numeric, 0),
    coalesce((i->>'precio_unitario')::numeric, 0),
    coalesce((i->>'importe')::numeric, 0),
    nullif(i->>'responsable_nombre', ''),
    nullif(i->>'responsable_id', '')::uuid,
    coalesce((i->>'x_pagar')::numeric, 0),
    coalesce((i->>'margen')::numeric, 0),
    coalesce((i->>'orden')::int, 0),
    nullif(i->>'notas', '')
  from jsonb_array_elements(p_items) i
  on conflict (id) do update set
    categoria = excluded.categoria, descripcion = excluded.descripcion,
    cantidad = excluded.cantidad, precio_unitario = excluded.precio_unitario,
    importe = excluded.importe, responsable_nombre = excluded.responsable_nombre,
    responsable_id = excluded.responsable_id, x_pagar = excluded.x_pagar,
    margen = excluded.margen, orden = excluded.orden, notas = excluded.notas
  where items_cotizacion.cotizacion_id = p_cotizacion_id
  returning *;
$$;

revoke execute on function upsert_items_cotizacion(text, jsonb) from public, anon, authenticated;
grant execute on function upsert_items_cotizacion(text, jsonb) to service_role;
