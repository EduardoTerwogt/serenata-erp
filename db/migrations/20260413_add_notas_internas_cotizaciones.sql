-- Agregar campo notas_internas a cotizaciones
-- Uso interno: notas del evento de planeación, no se reflejan en PDF.
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS notas_internas TEXT;
