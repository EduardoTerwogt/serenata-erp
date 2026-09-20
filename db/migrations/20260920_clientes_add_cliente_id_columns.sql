-- Bloque 3 (docs/PLAN.md): agrega cliente_id como FK real a clientes(id),
-- aditivo, en las 4 tablas que hoy solo tienen `cliente text not null` sin
-- FK. historial_responsable se agrega al alcance (no estaba en la lista
-- original del plan; alimenta la tabla "Historial Responsables" de Sheets).
-- Dual-write con `cliente` (texto) mientras conviven ambos -- ver
-- docs/decisions/014-cliente-id-fk-clasificacion.md.
BEGIN;

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cliente_id uuid NULL REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_id ON cotizaciones(cliente_id);

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS cliente_id uuid NULL REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);

ALTER TABLE cuentas_cobrar ADD COLUMN IF NOT EXISTS cliente_id uuid NULL REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_cliente_id ON cuentas_cobrar(cliente_id);

ALTER TABLE historial_responsable ADD COLUMN IF NOT EXISTS cliente_id uuid NULL REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_historial_responsable_cliente_id ON historial_responsable(cliente_id);

COMMENT ON COLUMN cotizaciones.cliente_id IS 'FK a clientes.id -- dual-write con cliente (texto) mientras dura la migracion (Bloque 3, docs/PLAN.md). NULL = fila sin match seguro o cliente free-text sin catalogo.';
COMMENT ON COLUMN proyectos.cliente_id IS 'FK a clientes.id, heredado de cotizaciones.cliente_id via approve_cotizacion.';
COMMENT ON COLUMN cuentas_cobrar.cliente_id IS 'FK a clientes.id, heredado de cotizaciones.cliente_id via approve_cotizacion.';
COMMENT ON COLUMN historial_responsable.cliente_id IS 'FK a clientes.id -- snapshot historico, mismo dual-write.';

-- Auditoría append-only de la clasificación de 3 cubetas (safe_match /
-- ambiguous / no_match), insumo directo de la futura pantalla de
-- reconciliación en /clientes (fuera de alcance de este bloque).
CREATE TABLE IF NOT EXISTS cliente_id_backfill_clasificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla text NOT NULL CHECK (tabla IN ('cotizaciones', 'proyectos', 'cuentas_cobrar', 'historial_responsable')),
  fila_id text NOT NULL,
  cliente_texto text NOT NULL,
  clasificacion text NOT NULL CHECK (clasificacion IN ('safe_match', 'ambiguous', 'no_match')),
  cliente_id_asignado uuid NULL REFERENCES clientes(id),
  candidatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cliente_backfill_tabla_clasif ON cliente_id_backfill_clasificacion(tabla, clasificacion);

COMMIT;
