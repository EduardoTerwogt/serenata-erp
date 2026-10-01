-- Índices faltantes (PLAN.md, B0 / G1, K14).
--
-- Cuatro de ellos cubren FKs que el advisor de Supabase marca sin índice y
-- que las lecturas de Cuentas, Cotizaciones y Proveedores usan por filtro:
-- items_cotizacion (cotizacion_id, orden) — renglones de una cotización en su
-- orden —, items_cotizacion (responsable_id), cuentas_pagar (cotizacion_id) y
-- cuentas_pagar (responsable_id, created_at) — historial por proveedor (K14).
-- Los demás son parciales para los FK de baja cardinalidad que sobreviven al
-- plan: cotizaciones.es_complementaria_de, proveedores.match_candidato_id y
-- documentos_*.reemplazado_por. Los FKs de tablas que el plan retira
-- (historial_responsable, cliente_id_backfill_clasificacion) no se indexan.
--
-- Idempotente. Cada migración de la iniciativa lleva límites (M3): si no
-- obtiene el lock rápido, falla en vez de bloquear la app.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE INDEX IF NOT EXISTS idx_items_cotizacion_cotizacion_orden
  ON public.items_cotizacion (cotizacion_id, orden);
CREATE INDEX IF NOT EXISTS idx_items_cotizacion_responsable
  ON public.items_cotizacion (responsable_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_cotizacion
  ON public.cuentas_pagar (cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_responsable_created
  ON public.cuentas_pagar (responsable_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_complementaria_de
  ON public.cotizaciones (es_complementaria_de) WHERE es_complementaria_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proveedores_match_candidato
  ON public.proveedores (match_candidato_id) WHERE match_candidato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_cc_reemplazado_por
  ON public.documentos_cuentas_cobrar (reemplazado_por) WHERE reemplazado_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_cp_reemplazado_por
  ON public.documentos_cuentas_pagar (reemplazado_por) WHERE reemplazado_por IS NOT NULL;

COMMIT;
