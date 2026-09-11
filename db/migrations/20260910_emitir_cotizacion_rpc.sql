-- Fase 8 (hardening pre-Proyectos): "Generar Cotización" (BORRADOR -> EMITIDA)
-- pasaba SOLO por el PUT completo (`guardar('EMITIDA')` -> `updateQuotation` ->
-- `save_cotizacion`), el mismo camino sin control de concurrencia que usaba
-- /cotizaciones/nueva. Auditoría confirmó la carrera: si otro colaborador
-- modificaba una partida por PATCH justo antes de que A pulsara "Generar
-- Cotización", el PUT completo de A podía borrar/revertir ese cambio -- ningún
-- `revision` ni `FOR UPDATE` comparaba contra el estado real.
--
-- A diferencia de "Aprobar" (que ya tenía `approve_cotizacion`, con su propia
-- transacción y efectos secundarios -- ahí no hacía falta ninguna RPC nueva,
-- solo dejar de llamar el PUT completo antes), "Emitir" no tenía ninguna
-- transición dedicada: no hay folio que reservar en este paso (el folio ya es
-- el id de la cotización desde que se creó), solo un cambio de estado. Esta
-- RPC reemplaza esa laguna con el mismo patrón `FOR UPDATE` que ya usan las
-- demás RPCs de esta iniciativa, sin tocar partidas/general/totales/notas.

create or replace function emitir_cotizacion(p_cotizacion_id text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cotizacion cotizaciones;
begin
  select * into v_cotizacion
  from cotizaciones
  where id = p_cotizacion_id
  for update;

  if not found then
    return null;
  end if;

  if v_cotizacion.estado = 'EMITIDA' then
    -- Idempotente: un reintento de red o doble click no debe fallar ni
    -- incrementar `revision` dos veces.
    return to_jsonb(v_cotizacion);
  end if;

  if v_cotizacion.estado <> 'BORRADOR' then
    return jsonb_build_object('error', 'estado_invalido', 'estado_actual', v_cotizacion.estado);
  end if;

  update cotizaciones
  set estado = 'EMITIDA',
      revision = revision + 1
  where id = p_cotizacion_id
  returning * into v_cotizacion;

  return to_jsonb(v_cotizacion);
end;
$$;

-- Mismo patrón que 20260909_harden_rpc_permissions.sql: todas las llamadas
-- legítimas van por supabaseAdmin (service_role) desde la ruta API, nunca
-- directo desde el navegador con la anon/authenticated key.
revoke execute on function emitir_cotizacion(text) from public, anon, authenticated;
grant execute on function emitir_cotizacion(text) to service_role;
