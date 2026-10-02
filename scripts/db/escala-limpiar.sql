-- Retira todo lo creado por `escala-generador.sql` (prefijo ESC). Se niega a
-- correr fuera de una BD de pruebas. Contiene DELETE: en serenata-erp-test lo
-- corre una persona en el SQL Editor (el MCP no ejecuta DELETE).
DO $lim$
BEGIN
  IF NOT (to_regclass('public.loadtest_runs') IS NOT NULL OR current_setting('app.escala_local', true) = 'on') THEN
    RAISE EXCEPTION 'escala-limpiar: solo corre en serenata-erp-test o en una BD local con app.escala_local = on';
  END IF;
  -- Cotización aprobada congelada: pasa a EMITIDA para poder borrar sus renglones.
  UPDATE cotizaciones SET estado = 'EMITIDA' WHERE id LIKE 'ESC%' AND estado = 'APROBADA';
  DELETE FROM cuentas_cobrar WHERE folio LIKE 'ESC-CC-%';
  DELETE FROM cuentas_pagar WHERE folio LIKE 'ESC-CP-%';
  DELETE FROM cuentas_pagar_grupos WHERE proyecto_id LIKE 'ESC%';
  DELETE FROM items_cotizacion WHERE cotizacion_id LIKE 'ESC%';
  DELETE FROM proyectos WHERE id LIKE 'ESC%';
  DELETE FROM cotizaciones WHERE id LIKE 'ESC%';
  DELETE FROM proveedores WHERE nombre LIKE 'ESC Proveedor %';
  DELETE FROM clientes WHERE nombre LIKE 'ESC Cliente %';
END
$lim$;
