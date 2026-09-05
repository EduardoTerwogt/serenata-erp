-- Limpieza de esquema: elimina tabla, columnas y RPC confirmados sin ningun
-- camino de codigo (activo o inactivo) tras auditoria de dos pasadas.
-- Ver .claude/plans (sesion 2026-09-05) para el detalle de la verificacion:
-- - cotizacion_collaboration_events: solo aparece en migraciones que
--   documentan retroactivamente el esquema real de prod, cero refs en app.
-- - cotizaciones.fecha_aprobacion: approve_cotizacion() nunca la escribe;
--   unica mencion en codigo es un mock de test, sin ruta real.
-- - cuentas_cobrar.deadline_pago: no esta en el schema de sync de Sheets,
--   cero refs en codigo app.
-- - ordenes_pago.notas: cero apariciones en UI o API.
-- - replace_cotizacion_items(text, jsonb): superseded por la logica inline
--   de save_cotizacion(); unica mencion en codigo es un string de ejemplo
--   en un test generico de manejo de errores RPC, no una llamada real.
--
-- Explicitamente EXCLUIDOS de este borrado (reclasificados, no tocar):
-- - cuentas_pagar.metodo_pago: tiene camino de escritura real via sync-up
--   de Google Sheets (lib/integrations/sheets/schema.ts).
-- - registrar_pago_cuenta_cobrar(): fix de seguridad a medio terminar
--   (ALTO-7 del audit b46f811) que falta conectar al endpoint, no es
--   codigo muerto.

drop table if exists public.cotizacion_collaboration_events;

alter table public.cotizaciones drop column if exists fecha_aprobacion;

alter table public.cuentas_cobrar drop column if exists deadline_pago;

alter table public.ordenes_pago drop column if exists notas;

drop function if exists public.replace_cotizacion_items(text, jsonb);
