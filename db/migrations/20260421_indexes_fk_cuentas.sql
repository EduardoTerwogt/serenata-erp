-- Índices en foreign keys críticas para queries de aprobación/cancelación
-- y filtro de soft-delete en planeación.
-- Ejecutar en Supabase SQL Editor.

CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_cotizacion
  ON cuentas_cobrar(cotizacion_id);

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_cotizacion
  ON cuentas_pagar(cotizacion_id);

-- Índice parcial: solo filas activas de planeación (eliminada = false)
CREATE INDEX IF NOT EXISTS idx_planeacion_pendientes_activas
  ON planeacion_pendientes(id) WHERE eliminada = false;
