-- Renombrar estado ENVIADA → EMITIDA en cotizaciones existentes.
-- Ejecutar manualmente en Supabase SQL Editor.

UPDATE cotizaciones SET estado = 'EMITIDA' WHERE estado = 'ENVIADA';
