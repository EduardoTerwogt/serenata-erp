-- Retira todo lo creado por `escala-generador.sql` (prefijo ESC). Se niega a
-- correr fuera de una BD de pruebas. Contiene DELETE: en serenata-erp-test lo
-- corre una persona en el SQL Editor (el MCP no ejecuta DELETE).
DO $lim$
BEGIN
  IF NOT (to_regclass('public.loadtest_runs') IS NOT NULL OR current_setting('app.escala_local', true) = 'on') THEN
    RAISE EXCEPTION 'escala-limpiar: solo corre en serenata-erp-test o en una BD local con app.escala_local = on';
  END IF;
  -- Una cotización aprobada está congelada (triggers de protección, solo se cancela con cancel_cotizacion): se
  -- apagan solo durante esta limpieza (transaccional: si algo falla, quedan encendidos) y se reactivan al final.
  ALTER TABLE cotizaciones DISABLE TRIGGER trigger_cotizacion_aprobada;
  ALTER TABLE items_cotizacion DISABLE TRIGGER trigger_items_cotizacion_aprobada;
  -- #123: la factura de cobro es cabecera sin ancla (PDF y complementos cuelgan de ella) y cada pago es una
  -- cabecera `pagos` (created_by = 'escala') con sus líneas: facturas y pagos se retiran explícitamente.
  UPDATE cuentas_cobrar SET factura_documento_id = NULL WHERE folio LIKE 'ESC-CC-%' AND factura_documento_id IS NOT NULL;
  DELETE FROM documentos_cuentas_cobrar
   WHERE cuentas_cobrar_id IN (SELECT id FROM cuentas_cobrar WHERE folio LIKE 'ESC-CC-%')
      OR archivo_url LIKE 'https://esc.invalid/ESC-CC-%';
  DELETE FROM cuentas_cobrar WHERE folio LIKE 'ESC-CC-%';  -- las líneas de pago caen en cascada
  DELETE FROM cuentas_pagar WHERE folio LIKE 'ESC-CP-%';
  DELETE FROM pagos_cuentas_pagar WHERE grupo_id IN (SELECT id FROM cuentas_pagar_grupos WHERE proyecto_id LIKE 'ESC%');
  DELETE FROM documentos_cuentas_pagar WHERE grupo_id IN (SELECT id FROM cuentas_pagar_grupos WHERE proyecto_id LIKE 'ESC%');
  DELETE FROM cuentas_pagar_grupos WHERE proyecto_id LIKE 'ESC%';
  DELETE FROM pagos WHERE created_by = 'escala';
  DELETE FROM items_cotizacion WHERE cotizacion_id LIKE 'ESC%';
  DELETE FROM proyectos WHERE id LIKE 'ESC%';
  DELETE FROM cotizaciones WHERE id LIKE 'ESC%';
  DELETE FROM proveedores WHERE nombre LIKE 'ESC Proveedor %';
  DELETE FROM clientes WHERE nombre LIKE 'ESC Cliente %';
  SET CONSTRAINTS ALL IMMEDIATE;  -- vacía los eventos diferidos pendientes: sin esto ALTER TABLE falla
  ALTER TABLE cotizaciones ENABLE TRIGGER trigger_cotizacion_aprobada;
  ALTER TABLE items_cotizacion ENABLE TRIGGER trigger_items_cotizacion_aprobada;
END
$lim$;
