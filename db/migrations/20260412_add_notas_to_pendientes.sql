-- Agregar columna notas a planeacion_pendientes para guardar notas extraídas por AI
ALTER TABLE planeacion_pendientes ADD COLUMN IF NOT EXISTS notas TEXT;
