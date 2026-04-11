-- Fase 5b: Crear índices para optimizar búsquedas de catálogos
-- Impacto estimado: reducción ~70% en latencia de búsquedas (1.43s → 300-400ms)

-- Índice para búsquedas rápidas en clientes.nombre (ILIKE sin patrón prefijo)
CREATE INDEX IF NOT EXISTS idx_clientes_nombre
  ON clientes(nombre)
  WHERE activo = true;

-- Índice para búsquedas rápidas en productos.descripcion (ILIKE)
CREATE INDEX IF NOT EXISTS idx_productos_descripcion
  ON productos(descripcion)
  WHERE activo = true;

-- Índice para búsquedas rápidas en responsables.nombre
CREATE INDEX IF NOT EXISTS idx_responsables_nombre
  ON responsables(nombre)
  WHERE activo = true;

-- Índice para folio.ts full table scans de cotizaciones
CREATE INDEX IF NOT EXISTS idx_cotizaciones_id
  ON cotizaciones(id);

-- Índices adicionales para filtros por estado (mejora general)
CREATE INDEX IF NOT EXISTS idx_clientes_activo
  ON clientes(activo);

CREATE INDEX IF NOT EXISTS idx_productos_activo
  ON productos(activo);

CREATE INDEX IF NOT EXISTS idx_responsables_activo
  ON responsables(activo);
