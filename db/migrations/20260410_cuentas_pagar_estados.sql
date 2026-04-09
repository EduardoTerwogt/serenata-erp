-- Migration: cuentas_pagar_estados
-- Purpose: Add columns to cuentas_pagar and create supporting tables for payment tracking and orders
-- Changes:
--   1. Modify cuentas_pagar table (add folio, estado, monto_pagado, orden_pago_id, updated_at)
--   2. Create ordenes_pago table (track generated payment orders for accountant)
--   3. Create documentos_cuentas_pagar table (track uploaded documents: factura proveedor, comprobante pago)
--   4. Create sequence for folio generation

-- Step 1: Modify cuentas_pagar table
ALTER TABLE cuentas_pagar
  ADD COLUMN IF NOT EXISTS folio VARCHAR(20) UNIQUE NULL,
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_PROCESO_PAGO', 'PAGADO')),
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orden_pago_id UUID NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- Comments
COMMENT ON COLUMN cuentas_pagar.folio IS 'Folio único interno (CP-2026-00001). Generado automáticamente al crear.';
COMMENT ON COLUMN cuentas_pagar.estado IS 'Estado del pago: PENDIENTE, EN_PROCESO_PAGO (bloqueado), PAGADO.';
COMMENT ON COLUMN cuentas_pagar.monto_pagado IS 'Monto pagado hasta ahora.';
COMMENT ON COLUMN cuentas_pagar.orden_pago_id IS 'FK a ordenes_pago si está incluida en una orden de pago.';
COMMENT ON COLUMN cuentas_pagar.updated_at IS 'Última actualización del registro.';

-- Step 2: Create ordenes_pago table
-- Tracks generated payment orders sent to accountant
CREATE TABLE IF NOT EXISTS ordenes_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_generacion DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_url TEXT NULL,
  pdf_nombre TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'GENERADA'
    CHECK (estado IN ('GENERADA', 'PARCIALMENTE_PAGADA', 'COMPLETADA')),
  total_monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_pago_fecha ON ordenes_pago(fecha_generacion);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_estado ON ordenes_pago(estado);

COMMENT ON TABLE ordenes_pago IS 'Registro de órdenes de pago generadas (PDF para contador).';
COMMENT ON COLUMN ordenes_pago.fecha_generacion IS 'Fecha en que se generó la orden.';
COMMENT ON COLUMN ordenes_pago.pdf_url IS 'Ruta al PDF en Google Drive.';
COMMENT ON COLUMN ordenes_pago.estado IS 'GENERADA, PARCIALMENTE_PAGADA, COMPLETADA.';
COMMENT ON COLUMN ordenes_pago.total_monto IS 'Total de monto incluido en la orden.';
COMMENT ON COLUMN ordenes_pago.created_by IS 'Email del usuario que generó la orden.';

-- Step 3: Create documentos_cuentas_pagar table
-- Tracks all documents: factura proveedor, comprobante de pago
CREATE TABLE IF NOT EXISTS documentos_cuentas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuentas_pagar_id UUID NOT NULL REFERENCES cuentas_pagar(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('FACTURA_PROVEEDOR', 'COMPROBANTE_PAGO', 'OTRO')),
  archivo_url TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  fecha_carga TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_cp_cuenta ON documentos_cuentas_pagar(cuentas_pagar_id);
CREATE INDEX IF NOT EXISTS idx_documentos_cp_tipo ON documentos_cuentas_pagar(tipo);

COMMENT ON TABLE documentos_cuentas_pagar IS 'Registro de documentos: factura de proveedor, comprobantes de pago.';
COMMENT ON COLUMN documentos_cuentas_pagar.tipo IS 'FACTURA_PROVEEDOR o COMPROBANTE_PAGO.';
COMMENT ON COLUMN documentos_cuentas_pagar.archivo_url IS 'Ruta al archivo en Google Drive.';

-- Step 4: Create sequence for folio generation
CREATE SEQUENCE IF NOT EXISTS seq_cp_2026 START WITH 1;

-- Step 5: Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cuentas_pagar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cuentas_pagar_updated_at ON cuentas_pagar;
CREATE TRIGGER trigger_cuentas_pagar_updated_at
BEFORE UPDATE ON cuentas_pagar
FOR EACH ROW
EXECUTE FUNCTION update_cuentas_pagar_updated_at();

-- Step 6: RPC to generate folio
CREATE OR REPLACE FUNCTION generate_folio_cp()
RETURNS VARCHAR AS $$
DECLARE
  v_next_num INTEGER;
  v_folio VARCHAR(20);
BEGIN
  v_next_num := nextval('seq_cp_2026');
  v_folio := 'CP-2026-' || LPAD(v_next_num::TEXT, 5, '0');
  RETURN v_folio;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Trigger to auto-generate folio
CREATE OR REPLACE FUNCTION auto_generate_folio_cp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.folio IS NULL THEN
    NEW.folio := generate_folio_cp();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_folio_cp ON cuentas_pagar;
CREATE TRIGGER trigger_auto_folio_cp
BEFORE INSERT ON cuentas_pagar
FOR EACH ROW
EXECUTE FUNCTION auto_generate_folio_cp();

-- Step 8: Add foreign key for orden_pago_id
ALTER TABLE cuentas_pagar
  ADD CONSTRAINT fk_cuentas_pagar_orden_pago
    FOREIGN KEY (orden_pago_id)
    REFERENCES ordenes_pago(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_orden ON cuentas_pagar(orden_pago_id);
