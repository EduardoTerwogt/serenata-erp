-- Fase 8 (hardening pre-Proyectos): la arquitectura establece que el navegador
-- solo debe usar Presence (awareness efímera); los cambios de negocio deben
-- llegar siempre por Broadcast CONFIRMADO desde el servidor
-- (lib/server/realtime/broadcast.ts, con `service_role`, que bypassa RLS por
-- completo -- esta migración no lo afecta en absoluto).
--
-- Hoy nada en el código hace `channel.send({ type: 'broadcast', ... })` desde
-- el navegador (retirado en Fase 6D) -- pero la política de INSERT de
-- 20260909_realtime_broadcast_authorization.sql seguía permitiendo AMBAS
-- extensiones (`broadcast` y `presence`) para cualquier staff autorizado en
-- `cotizaciones`. Eso deja la regla de "el navegador nunca emite datos de
-- negocio" dependiendo solo de que nadie vuelva a escribir ese código -- no de
-- que la plataforma lo impida.
--
-- Esta migración reemplaza esa política de INSERT por una que solo cubre
-- `presence`: un `authenticated` con la sección correcta puede seguir haciendo
-- `channel.track()` (Presence), pero un `channel.send({ type: 'broadcast' })`
-- desde el navegador ahora es rechazado por RLS -- sin política de INSERT que
-- lo cubra, se deniega por defecto.
--
-- La política de SELECT (para RECIBIR mensajes, incluidos los broadcasts
-- confirmados que el servidor sí emite) no cambia: el navegador necesita
-- seguir viendo `item_confirmed`/`general_confirmed`/etc.

drop policy if exists "staff cotizaciones puede enviar broadcast/presence en su canal" on "realtime"."messages";

create policy "staff cotizaciones puede enviar presence en su canal"
on "realtime"."messages"
for insert
to authenticated
with check (
  (select realtime.topic()) like 'cotizacion:%'
  and (current_setting('request.jwt.claims', true)::jsonb -> 'sections') ? 'cotizaciones'
  and realtime.messages.extension = 'presence'
);
