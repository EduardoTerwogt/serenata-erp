-- Agregar flag para soft delete de líneas eliminadas en ValidationTable
-- Permite auditoría sin perder datos históricos
ALTER TABLE planeacion_pendientes ADD COLUMN IF NOT EXISTS eliminada BOOLEAN DEFAULT FALSE;

-- Índice para queries que filtran no eliminadas
CREATE INDEX IF NOT EXISTS idx_planeacion_pendientes_no_eliminada
  ON planeacion_pendientes(id)
  WHERE NOT eliminada;
