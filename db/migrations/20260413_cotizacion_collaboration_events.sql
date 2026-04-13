-- Auditoría de colaboración para cotizaciones (presencia + edición por sección)
CREATE TABLE IF NOT EXISTS cotizacion_collaboration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id TEXT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT 'Usuario',
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'start_edit_section', 'stop_edit_section', 'save')),
  section TEXT NULL CHECK (section IN ('notas', 'general', 'partidas', 'totales')),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collab_events_cotizacion_created_at
  ON cotizacion_collaboration_events (cotizacion_id, created_at DESC);
