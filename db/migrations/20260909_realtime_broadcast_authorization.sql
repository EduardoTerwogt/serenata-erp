-- Fase 1 del rediseño de colaboración en tiempo real -- hoy los canales de
-- Supabase Realtime son PUBLICOS: cualquiera con la anon key puede unirse a
-- "cotizacion:*" y ver/enviar broadcasts de cualquier cotización
-- (hooks/useQuotationPresence.ts, sin config.private ni auth). Esta
-- migración habilita autorización real vía RLS sobre realtime.messages,
-- usando el claim "sections" de un JWT corto firmado por la app (no emitido
-- por Supabase Auth) a partir de la sesión de NextAuth -- ver
-- app/api/realtime/token/route.ts.
--
-- La autorización de negocio es por SECCIÓN, no por cotización individual
-- (cualquier staff con la sección "cotizaciones" ve/edita TODAS las
-- cotizaciones hoy), así que basta validar el claim -- no hace falta una
-- tabla de membresías por cotización como en el ejemplo de los docs de
-- Supabase.
--
-- IMPORTANTE: esto NO cierra el canal público por sí solo. Además hay que
-- deshabilitar "Allow public access" en Realtime Settings del dashboard --
-- paso manual, solo en serenata-erp-test durante esta fase (producción
-- sigue corriendo el código de main con canal público hasta que esta
-- branch se mergee).

create policy "staff cotizaciones puede unirse a canal de cotizacion"
on "realtime"."messages"
for select
to authenticated
using (
  (select realtime.topic()) like 'cotizacion:%'
  and (current_setting('request.jwt.claims', true)::jsonb -> 'sections') ? 'cotizaciones'
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy "staff cotizaciones puede enviar broadcast/presence en su canal"
on "realtime"."messages"
for insert
to authenticated
with check (
  (select realtime.topic()) like 'cotizacion:%'
  and (current_setting('request.jwt.claims', true)::jsonb -> 'sections') ? 'cotizaciones'
  and realtime.messages.extension in ('broadcast', 'presence')
);
