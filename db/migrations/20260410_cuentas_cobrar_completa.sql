-- Migration: cuentas_cobrar_completa
-- Purpose: Add columns to cuentas_cobrar and create supporting tables for payment tracking
-- Changes:
--   1. Add new columns to cuentas_cobrar (estado, folio, fecha_factura, deadline_pago, monto_pagado, updated_at)
--   2. Create pagos_comprobantes table (track multiple payment proofs per account)
--   3. Create documentos_cuentas_cobrar table (track uploaded documents: factura, complemento, etc)
--   4. Create sequence for folio generation

-- Step 1: Modify cuentas_cobrar table
ALTER TABLE cuentas_cobrar
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'FACTURA_PENDIENTE'
    CHECK (estado IN ('FACTURA_PENDIENTE', 'FACTURADO', 'PARCIALMENTE_PAGADO', 'PAGADO')),
  ADD COLUMN IF NOT EXISTS folio VARCHAR(20) UNIQUE NULL,
  ADD COLUMN IF NOT EXISTS fecha_factura DATE NULL,
  ADD COLUMN IF NOT EXISTS deadline_pago DATE NULL,
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- Comments
COMMENT ON COLUMN cuentas_cobrar.estado IS 'Estado del pago: FACTURA_PENDIENTE, FACTURADO, PARCIALMENTE_PAGADO, PAGADO';
COMMENT ON COLUMN cuentas_cobrar.folio IS 'Folio único interno (CC-2026-00001). Generado automáticamente al crear.';
COMMENT ON COLUMN cuentas_cobrar.fecha_factura IS 'Fecha de emisión de la factura (extraída del XML).';
COMMENT ON COLUMN cuentas_cobrar.deadline_pago IS 'Fecha límite de pago (fecha_factura + 30 días).';
COMMENT ON COLUMN cuentas_cobrar.monto_pagado IS 'Suma total de pagos registrados (suma de pagos_comprobantes.monto).';
COMMENT ON COLUMN cuentas_cobrar.updated_at IS 'Última actualización del registro.';

-- Step 2: Create sequence for folio generation
CREATE SEQUENCE IF NOT EXISTS seq_cc_2026 START WITH 1;

-- Step 3: Create pagos_comprobantes table
-- Tracks individual payment proofs (multiple per cuenta_cobrar)
CREATE TABLE IF NOT EXISTS pagos_comprobantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuentas_cobrar_id UUID NOT NULL REFERENCES cuentas_cobrar(id) ON DELETE CASCADE,
  monto NUMERIC(15,2) NOT NULL,
  tipo_pago TEXT NOT NULL CHECK (tipo_pago IN ('TRANSFERENCIA', 'EFECTIVO')),
  fecha_pago DATE NOT NULL,
  comprobante_url TEXT NULL,
  archivo_nombre TEXT NULL,
  notas TEXT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_comprobantes_cuenta ON pagos_comprobantes(cuentas_cobrar_id);
CREATE INDEX IF NOT EXISTS idx_pagos_comprobantes_fecha ON pagos_comprobantes(fecha_pago);

COMMENT ON TABLE pagos_comprobantes IS 'Registro de comprobantes de pago. Una cuenta puede tener múltiples comprobantes (pagos parciales).';
COMMENT ON COLUMN pagos_comprobantes.cuentas_cobrar_id IS 'FK a cuentas_cobrar.';
COMMENT ON COLUMN pagos_comprobantes.monto IS 'Monto pagado en este comprobante.';
COMMENT ON COLUMN pagos_comprobantes.tipo_pago IS 'TRANSFERENCIA o EFECTIVO.';
COMMENT ON COLUMN pagos_comprobantes.comprobante_url IS 'Ruta al archivo en Google Drive.';

-- Step 4: Create documentos_cuentas_cobrar table
-- Tracks all documents: factura PDF, factura XML, complemento, etc
CREATE TABLE IF NOT EXISTS documentos_cuentas_cobrar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuentas_cobrar_id UUID NOT NULL REFERENCES cuentas_cobrar(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('FACTURA_PDF', 'FACTURA_XML', 'COMPLEMENTO_PAGO', 'OTRO')),
  archivo_url TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_size BIGINT NULL,
  fecha_carga TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_cc_cuenta ON documentos_cuentas_cobrar(cuentas_cobrar_id);
CREATE INDEX IF NOT EXISTS idx_documentos_cc_tipo ON documentos_cuentas_cobrar(tipo);

COMMENT ON TABLE documentos_cuentas_cobrar IS 'Registro de documentos adjuntos: facturas, complementos, comprobantes.';
COMMENT ON COLUMN documentos_cuentas_cobrar.tipo IS 'Tipo de documento: FACTURA_PDF, FACTURA_XML, COMPLEMENTO_PAGO, OTRO.';
COMMENT ON COLUMN documentos_cuentas_cobrar.archivo_url IS 'Ruta al archivo en Google Drive.';

-- Step 5: Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cuentas_cobrar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cuentas_cobrar_updated_at ON cuentas_cobrar;
CREATE TRIGGER trigger_cuentas_cobrar_updated_at
BEFORE UPDATE ON cuentas_cobrar
FOR EACH ROW
EXECUTE FUNCTION update_cuentas_cobrar_updated_at();

-- Step 6: RPC to generate folio
CREATE OR REPLACE FUNCTION generate_folio_cc()
RETURNS VARCHAR AS $$
DECLARE
  v_next_num INTEGER;
  v_folio VARCHAR(20);
BEGIN
  v_next_num := nextval('seq_cc_2026');
  v_folio := 'CC-2026-' || LPAD(v_next_num::TEXT, 5, '0');
  RETURN v_folio;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Trigger to auto-generate folio
CREATE OR REPLACE FUNCTION auto_generate_folio_cc()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.folio IS NULL THEN
    NEW.folio := generate_folio_cc();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_folio_cc ON cuentas_cobrar;
CREATE TRIGGER trigger_auto_folio_cc
BEFORE INSERT ON cuentas_cobrar
FOR EACH ROW
EXECUTE FUNCTION auto_generate_folio_cc();
