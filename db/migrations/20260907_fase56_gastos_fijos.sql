-- Fase 5.6 -- Dashboard ejecutivo. Gastos fijos recurrentes de operación
-- (nómina, renta, etc.) para el panel de cobertura mensual. Lista simple:
-- un monto mensual que se aplica automáticamente cada mes mientras esté
-- activo, sin variación mes a mes (decisión de Eduardo, 2026-09-07).

CREATE TABLE gastos_fijos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  monto_mensual numeric(12,2) NOT NULL CHECK (monto_mensual >= 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE gastos_fijos IS
  'Fase 5.6: gastos fijos recurrentes de operación (nómina, renta, etc.) para el panel de cobertura del Dashboard ejecutivo. Lista simple -- un monto mensual que se aplica automáticamente cada mes mientras esté activo, sin variación mes a mes.';

-- RLS (mismo patrón sin políticas propias que el resto del proyecto --
-- todo el acceso va por supabaseAdmin/service_role)
ALTER TABLE gastos_fijos ENABLE ROW LEVEL SECURITY;
