-- Migration: service_templates
-- Purpose: Create table for reusable service package templates (Plantillas de Servicios)
-- Changes:
--   1. Create service_templates table to store reusable service packages
--   2. Add indexes for fast lookups
--   3. Add trigger for auto-update timestamp

-- Create service_templates table
CREATE TABLE IF NOT EXISTS service_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Comments
COMMENT ON TABLE service_templates IS 'Plantillas de servicios reutilizables para crear cotizaciones rápidamente.';
COMMENT ON COLUMN service_templates.nombre IS 'Nombre único de la plantilla (ej: "Suena la Ciudad", "Low Clika").';
COMMENT ON COLUMN service_templates.descripcion IS 'Descripción opcional de la plantilla.';
COMMENT ON COLUMN service_templates.items IS 'Array JSON de items. Estructura: [{ categoria, descripcion, cantidad, precio_unitario, responsable_nombre?, notas? }]';
COMMENT ON COLUMN service_templates.activo IS 'Indica si la plantilla está activa y disponible para usar.';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_service_templates_nombre ON service_templates(nombre);
CREATE INDEX IF NOT EXISTS idx_service_templates_activo ON service_templates(activo);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_service_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_service_templates_updated_at ON service_templates;
CREATE TRIGGER trigger_service_templates_updated_at
BEFORE UPDATE ON service_templates
FOR EACH ROW
EXECUTE FUNCTION update_service_templates_updated_at();
