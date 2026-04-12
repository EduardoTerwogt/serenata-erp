-- Tabla para almacenar notas contextuales asociadas a eventos específicos
-- Notas se extraen del mensaje original por Claude AI y se asocian a eventos por fecha
CREATE TABLE IF NOT EXISTS public.planeacion_event_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id TEXT REFERENCES public.cotizaciones(id) ON DELETE CASCADE,  -- cotizaciones.id es TEXT (folio)
  evento_id TEXT,  -- ID del evento original (ValidatedEventLine.id durante planeación)
  fecha_evento DATE,  -- Fecha del evento para agrupación en UI
  nota TEXT NOT NULL,
  tipo TEXT DEFAULT 'contextual',  -- 'contextual' | 'usuario' | 'system'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_event_notas_cotizacion
  ON public.planeacion_event_notas(cotizacion_id);

CREATE INDEX IF NOT EXISTS idx_event_notas_evento_id
  ON public.planeacion_event_notas(evento_id);

CREATE INDEX IF NOT EXISTS idx_event_notas_fecha
  ON public.planeacion_event_notas(fecha_evento);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_planeacion_event_notas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_planeacion_event_notas_updated_at
BEFORE UPDATE ON public.planeacion_event_notas
FOR EACH ROW
EXECUTE FUNCTION public.update_planeacion_event_notas_updated_at();
