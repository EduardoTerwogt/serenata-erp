-- Actualiza UNA partida campo por campo, sin leer-modificar-escribir la fila entera.
--
-- Bug encontrado por tests/e2e/live/cotizaciones-colaboracion.spec.ts con dos
-- usuarios reales editando a la vez: PATCH /api/cotizaciones/:id/items/:itemId leía
-- la cotización completa, fusionaba el campo recibido sobre la copia leída y
-- reescribía TODA la fila. Con dos personas en la misma fila:
--
--   A escribe la descripción -> lee la fila (precio 1000) -> escribe la fila entera
--   B escribe el precio      -> lee la fila ANTES de que A escriba (descripción vieja)
--                            -> escribe la fila entera y devuelve la descripción vieja
--
--   medido:  descripción "Partida uno" (la de A perdida) | precio 7777 (el de B)
--
-- El cliente ya mandaba un patch de un solo campo; la pérdida ocurría en el servidor.
-- Aquí el SELECT ... FOR UPDATE bloquea la fila, así que el segundo PATCH espera al
-- primero y relee lo que aquel dejó: los dos campos sobreviven. `importe` y `margen`
-- se recalculan con los MISMOS valores que ya calcula normalizeQuotationItem en el
-- cliente (importe = cantidad * precio_unitario; margen = importe - x_pagar).
--
-- Devuelve NULL si la partida no existe, para que la ruta responda 404 como antes.
create or replace function patch_item_cotizacion(
  p_cotizacion_id text,
  p_item_id uuid,
  p_patch jsonb
)
returns items_cotizacion
language plpgsql
set search_path = public
as $$
declare
  v_item items_cotizacion;
  v_categoria text;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_x_pagar numeric;
  v_responsable_id uuid;
  v_responsable_nombre text;
  v_importe numeric;
begin
  select * into v_item
  from items_cotizacion
  where id = p_item_id and cotizacion_id = p_cotizacion_id
  for update;

  if not found then
    return null;
  end if;

  v_categoria := case when p_patch ? 'categoria'
    then coalesce(p_patch->>'categoria', '') else v_item.categoria end;
  v_descripcion := case when p_patch ? 'descripcion'
    then coalesce(p_patch->>'descripcion', '') else v_item.descripcion end;
  v_cantidad := case when p_patch ? 'cantidad'
    then coalesce((p_patch->>'cantidad')::numeric, 0) else coalesce(v_item.cantidad, 0) end;
  v_precio := case when p_patch ? 'precio_unitario'
    then coalesce((p_patch->>'precio_unitario')::numeric, 0) else coalesce(v_item.precio_unitario, 0) end;
  v_x_pagar := case when p_patch ? 'x_pagar'
    then coalesce((p_patch->>'x_pagar')::numeric, 0) else coalesce(v_item.x_pagar, 0) end;
  v_responsable_id := case when p_patch ? 'responsable_id'
    then nullif(p_patch->>'responsable_id', '')::uuid else v_item.responsable_id end;
  v_responsable_nombre := case when p_patch ? 'responsable_nombre'
    then nullif(p_patch->>'responsable_nombre', '') else v_item.responsable_nombre end;

  v_importe := v_cantidad * v_precio;

  update items_cotizacion
  set categoria = v_categoria,
      descripcion = v_descripcion,
      cantidad = v_cantidad,
      precio_unitario = v_precio,
      x_pagar = v_x_pagar,
      responsable_id = v_responsable_id,
      responsable_nombre = v_responsable_nombre,
      importe = v_importe,
      margen = v_importe - v_x_pagar
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;
