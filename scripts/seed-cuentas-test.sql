-- Seed de Cuentas para serenata-erp-test (rediseño de Cuentas, B0 / H11).
--
-- serenata-erp-test no tenía cuentas sueltas, órdenes ni XML, así que no
-- reproducía las formas de datos de producción que el rediseño tiene que
-- manejar. Este script las crea con el esquema vigente:
--
--   SEEDCU01  sueltas en una orden vieja sin pagar y sin factura; suelta
--             sin proveedor dentro y fuera de la orden (T2); cobro con
--             anticipo sin factura (D32).
--   SEEDCU02  grupo con pago parcial sin orden; cobro con factura XML y
--             PDF en `pendiente` (T1).
--   SEEDCU03  cobro pagado en dos pagos (el caso PPD de D16) con
--             complemento que solo trae el XML (D27); grupo pagado con
--             factura y comprobante.
--   SEEDCU04  cobro con la factura XML en `revision` (D25).
--   SEEDCU05  principal con una complementaria APROBADA (-A) y otra
--             EMITIDA (-B) (D28, D31).
--   (sin proyecto)  una cuenta por cobrar y una por pagar sin
--             `proyecto_id` ni `cotizacion_id`.
--
-- El esquema de hoy no guarda el MetodoPago del XML: el PPD de SEEDCU03
-- queda solo en el nombre del archivo. B1 agrega esa columna y extiende
-- este seed.
--
-- Las filas se insertan directo, sin RPCs, a propósito: varias de estas
-- formas son justo las que las RPCs corregidas ya no producirían (H2, H3,
-- T2), y hay que poder reproducirlas.
--
-- Idempotente: borra todo lo marcado con el prefijo SEEDCU (ids, folios y
-- nombres) y lo vuelve a crear con los mismos ids. No toca nada más.
--
-- Uso: pegarlo completo en el SQL Editor de serenata-erp-test, o correrlo
-- con `psql "$TEST_DATABASE_URL" -f scripts/seed-cuentas-test.sql`.
-- Se niega a correr fuera de test: la tabla `loadtest_runs` solo existe
-- en serenata-erp-test.

DO $seed$
DECLARE
  c_cliente   constant uuid := '5eedc000-0000-4000-8000-00000000c001';
  c_prov_a    constant uuid := '5eedc000-0000-4000-8000-00000000a001';
  c_prov_b    constant uuid := '5eedc000-0000-4000-8000-00000000a002';
  c_orden     constant uuid := '5eedc000-0000-4000-8000-00000000f001';
  c_grp_02    constant uuid := '5eedc000-0000-4000-8000-00000000b002';
  c_grp_03    constant uuid := '5eedc000-0000-4000-8000-00000000b003';
  c_grp_05a   constant uuid := '5eedc000-0000-4000-8000-00000000b05a';
  c_cc_01     constant uuid := '5eedc000-0000-4000-8000-00000000cc01';
  c_cc_02     constant uuid := '5eedc000-0000-4000-8000-00000000cc02';
  c_cc_03     constant uuid := '5eedc000-0000-4000-8000-00000000cc03';
  c_cc_04     constant uuid := '5eedc000-0000-4000-8000-00000000cc04';
  c_cc_05     constant uuid := '5eedc000-0000-4000-8000-00000000cc05';
  c_cc_05a    constant uuid := '5eedc000-0000-4000-8000-0000000cc05a';
  c_cc_sp     constant uuid := '5eedc000-0000-4000-8000-00000000cc99';
  v_ids       text[] := ARRAY['SEEDCU01','SEEDCU02','SEEDCU03','SEEDCU04','SEEDCU05','SEEDCU05-A','SEEDCU05-B'];
BEGIN
  IF to_regclass('public.loadtest_runs') IS NULL THEN
    RAISE EXCEPTION 'seed-cuentas-test: esta base no es serenata-erp-test (no existe loadtest_runs). No se corre.';
  END IF;

  -- ── Limpieza (hijos → padres) ─────────────────────────────────────────
  DELETE FROM documentos_cuentas_pagar
   WHERE cuentas_pagar_id IN (SELECT id FROM cuentas_pagar WHERE folio LIKE 'SEEDCU-%' OR cotizacion_id = ANY(v_ids) OR proyecto_id = ANY(v_ids))
      OR grupo_id IN (SELECT id FROM cuentas_pagar_grupos WHERE proyecto_id = ANY(v_ids));
  DELETE FROM cuentas_pagar
   WHERE folio LIKE 'SEEDCU-%' OR cotizacion_id = ANY(v_ids) OR proyecto_id = ANY(v_ids);
  DELETE FROM cuentas_pagar_grupos WHERE proyecto_id = ANY(v_ids);
  -- Desglose de la orden (B1b): su llave hacia ordenes_pago no tiene cascada.
  IF to_regclass('public.ordenes_pago_conceptos') IS NOT NULL THEN
    DELETE FROM ordenes_pago_conceptos
     WHERE orden_pago_id IN (SELECT id FROM ordenes_pago WHERE id = c_orden OR pdf_nombre LIKE 'SEEDCU %');
  END IF;
  DELETE FROM ordenes_pago WHERE id = c_orden OR pdf_nombre LIKE 'SEEDCU %';
  -- pagos_comprobantes y documentos_cuentas_cobrar caen en cascada.
  DELETE FROM cuentas_cobrar
   WHERE folio LIKE 'SEEDCU-%' OR cotizacion_id = ANY(v_ids) OR proyecto_id = ANY(v_ids);
  DELETE FROM historial_responsable WHERE cotizacion_id = ANY(v_ids);
  DELETE FROM historial_cambios_responsable_item WHERE cotizacion_id = ANY(v_ids);
  DELETE FROM proyectos WHERE id = ANY(v_ids);
  DELETE FROM cotizaciones WHERE id = ANY(v_ids);  -- items en cascada
  DELETE FROM proveedores WHERE id IN (c_prov_a, c_prov_b);
  DELETE FROM clientes WHERE id = c_cliente;

  -- ── Catálogos ─────────────────────────────────────────────────────────
  INSERT INTO clientes (id, nombre, tipo, contacto, correo, activo)
  VALUES (c_cliente, 'SEEDCU Cliente Demo', 'Agencia', 'Contacto Seed', 'seed-cliente@example.com', true);

  INSERT INTO proveedores (id, nombre, telefono, correo, banco, clabe, roles, regimen_fiscal, activo)
  VALUES
    (c_prov_a, 'SEEDCU Proveedor Persona Física', '5550000001', 'seed-prov-a@example.com', 'BBVA', '012180001234567891', ARRAY['Producción'], 'fisica', true),
    (c_prov_b, 'SEEDCU Proveedor Moral', '5550000002', 'seed-prov-b@example.com', 'Santander', '014180009876543210', ARRAY['Equipo'], 'moral', true);

  -- ── Cotizaciones, items y proyectos ──────────────────────────────────
  INSERT INTO cotizaciones (id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo, es_complementaria_de, estado, subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total)
  VALUES
    ('SEEDCU01',   'SEEDCU Cliente Demo', c_cliente, 'Seed · Orden vieja y sueltas', '2026-06-10', 'CDMX', '2026-05-20', 'PRINCIPAL',     NULL,       'APROBADA', 30000, 4500, 34500, 5520, 40020, 9500, 9500),
    ('SEEDCU02',   'SEEDCU Cliente Demo', c_cliente, 'Seed · Grupo con pago parcial', '2026-08-14', 'CDMX', '2026-07-30', 'PRINCIPAL',     NULL,       'APROBADA', 30000, 4500, 34500, 5520, 40020, 10000, 10000),
    ('SEEDCU03',   'SEEDCU Cliente Demo', c_cliente, 'Seed · Cobro PPD en dos pagos', '2026-07-05', 'Guadalajara', '2026-06-18', 'PRINCIPAL', NULL,     'APROBADA', 20000, 3000, 23000, 3680, 26680, 8000, 8000),
    ('SEEDCU04',   'SEEDCU Cliente Demo', c_cliente, 'Seed · Factura en revisión', '2026-09-12', 'CDMX', '2026-08-28', 'PRINCIPAL',        NULL,       'APROBADA', 10000, 1500, 11500, 1840, 13340, 4000, 4000),
    ('SEEDCU05',   'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias', '2026-09-20', 'Monterrey', '2026-09-01', 'PRINCIPAL', NULL, 'APROBADA', 20000, 3000, 23000, 3680, 26680, 7000, 7000),
    ('SEEDCU05-A', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias', '2026-09-20', 'Monterrey', '2026-09-08', 'COMPLEMENTARIA', 'SEEDCU05', 'APROBADA', 5000, 750, 5750, 920, 6670, 2000, 2000),
    ('SEEDCU05-B', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias', '2026-09-20', 'Monterrey', '2026-09-15', 'COMPLEMENTARIA', 'SEEDCU05', 'EMITIDA',  4000, 600, 4600, 736, 5336, 1500, 1500);

  -- items: id = 5eedc000-...-<cot><n>; cuentas_pagar.item_id apunta aquí.
  INSERT INTO items_cotizacion (id, cotizacion_id, categoria, descripcion, cantidad, precio_unitario, importe, responsable_nombre, responsable_id, x_pagar, margen, orden)
  VALUES
    ('5eedc000-0000-4000-8000-000000001011', 'SEEDCU01',   'Producción', 'Coordinación de producción', 1, 12000, 12000, 'SEEDCU Proveedor Persona Física', c_prov_a, 8000, 4000, 1),
    ('5eedc000-0000-4000-8000-000000001012', 'SEEDCU01',   'Producción', 'Asistente de producción',    2,  5000, 10000, 'SEEDCU Proveedor Persona Física', c_prov_a, 3500, 3000, 2),
    ('5eedc000-0000-4000-8000-000000001013', 'SEEDCU01',   'Logística',  'Transporte (sin proveedor)', 1,  4000,  4000, NULL, NULL, 2000, 2000, 3),
    ('5eedc000-0000-4000-8000-000000001014', 'SEEDCU01',   'Logística',  'Catering (sin proveedor)',   1,  4000,  4000, NULL, NULL, 3000, 1000, 4),
    ('5eedc000-0000-4000-8000-000000001021', 'SEEDCU02',   'Equipo',     'Renta de cámara',            2,  9000, 18000, 'SEEDCU Proveedor Moral', c_prov_b, 6000, 6000, 1),
    ('5eedc000-0000-4000-8000-000000001022', 'SEEDCU02',   'Equipo',     'Iluminación',                1, 12000, 12000, 'SEEDCU Proveedor Moral', c_prov_b, 8000, 4000, 2),
    ('5eedc000-0000-4000-8000-000000001031', 'SEEDCU03',   'Producción', 'Dirección de fotografía',    1, 20000, 20000, 'SEEDCU Proveedor Persona Física', c_prov_a, 12000, 8000, 1),
    ('5eedc000-0000-4000-8000-000000001041', 'SEEDCU04',   'Equipo',     'Audio',                      1, 10000, 10000, 'SEEDCU Proveedor Moral', c_prov_b, 6000, 4000, 1),
    ('5eedc000-0000-4000-8000-000000001051', 'SEEDCU05',   'Producción', 'Producción general',         1, 20000, 20000, 'SEEDCU Proveedor Persona Física', c_prov_a, 13000, 7000, 1),
    ('5eedc000-0000-4000-8000-00000000105a', 'SEEDCU05-A', 'Equipo',     'Equipo adicional',           1,  5000,  5000, 'SEEDCU Proveedor Moral', c_prov_b, 3000, 2000, 1),
    ('5eedc000-0000-4000-8000-00000000105b', 'SEEDCU05-B', 'Equipo',     'Segundo día de equipo',      1,  4000,  4000, 'SEEDCU Proveedor Moral', c_prov_b, 2500, 1500, 1);

  INSERT INTO proyectos (id, cliente, cliente_id, proyecto, fecha_entrega, locacion, estado)
  VALUES
    ('SEEDCU01', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Orden vieja y sueltas',        '2026-06-10', 'CDMX',        'PREPRODUCCION'),
    ('SEEDCU02', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Grupo con pago parcial',       '2026-08-14', 'CDMX',        'PREPRODUCCION'),
    ('SEEDCU03', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Cobro PPD en dos pagos',       '2026-07-05', 'Guadalajara', 'PREPRODUCCION'),
    ('SEEDCU04', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Factura en revisión',          '2026-09-12', 'CDMX',        'PREPRODUCCION'),
    ('SEEDCU05', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias', '2026-09-20', 'Monterrey',   'PREPRODUCCION');

  -- ── Orden de pago vieja, sin pagar (GENERADA hace >15 días) ──────────
  INSERT INTO ordenes_pago (id, fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by, created_at)
  VALUES (c_orden, '2026-06-20', NULL, 'SEEDCU O.P 20-Jun SEEDCU01.pdf', 'GENERADA', 17000, 'seed-cuentas-test', '2026-06-20 12:00');

  -- ── Grupos de proveedor ───────────────────────────────────────────────
  INSERT INTO cuentas_pagar_grupos (id, proyecto_id, responsable_id, estado, monto_total, monto_pagado, orden_pago_id)
  VALUES
    (c_grp_02,  'SEEDCU02', c_prov_b, 'EN_PROCESO_PAGO', 20000,  8000, NULL),  -- pago parcial sin orden
    (c_grp_03,  'SEEDCU03', c_prov_a, 'PAGADO',          12000, 12000, NULL),
    (c_grp_05a, 'SEEDCU05', c_prov_b, 'ABIERTO',          3000,     0, NULL);  -- de la complementaria -A

  -- ── Cuentas por pagar ─────────────────────────────────────────────────
  -- x_pagar = Costo Total (Costo Unitario × Cantidad, decisión 006).
  INSERT INTO cuentas_pagar (id, folio, cotizacion_id, proyecto_id, item_id, responsable_id, responsable_nombre, item_descripcion, cantidad, x_pagar, margen, estado, monto_pagado, orden_pago_id, grupo_id, banco, clabe, fecha_pago)
  VALUES
    -- SEEDCU01: sueltas dentro de la orden vieja, sin factura (H2, H3).
    ('5eedc000-0000-4000-8000-00000000d011', 'SEEDCU-CP-011', 'SEEDCU01', 'SEEDCU01', '5eedc000-0000-4000-8000-000000001011', c_prov_a, 'SEEDCU Proveedor Persona Física', 'Coordinación de producción', 1, 8000, 4000, 'EN_PROCESO_PAGO', 0, c_orden, NULL, 'BBVA', '012180001234567891', NULL),
    ('5eedc000-0000-4000-8000-00000000d012', 'SEEDCU-CP-012', 'SEEDCU01', 'SEEDCU01', '5eedc000-0000-4000-8000-000000001012', c_prov_a, 'SEEDCU Proveedor Persona Física', 'Asistente de producción',    2, 7000, 3000, 'EN_PROCESO_PAGO', 0, c_orden, NULL, 'BBVA', '012180001234567891', NULL),
    -- SEEDCU01: sin proveedor, dentro de la orden (T2).
    ('5eedc000-0000-4000-8000-00000000d013', 'SEEDCU-CP-013', 'SEEDCU01', 'SEEDCU01', '5eedc000-0000-4000-8000-000000001013', NULL, 'Sin asignar', 'Transporte (sin proveedor)', 1, 2000, 2000, 'EN_PROCESO_PAGO', 0, c_orden, NULL, NULL, NULL, NULL),
    -- SEEDCU01: sin proveedor, fuera de orden (T2).
    ('5eedc000-0000-4000-8000-00000000d014', 'SEEDCU-CP-014', 'SEEDCU01', 'SEEDCU01', '5eedc000-0000-4000-8000-000000001014', NULL, 'Sin asignar', 'Catering (sin proveedor)',   1, 3000, 1000, 'PENDIENTE',       0, NULL,    NULL, NULL, NULL, NULL),
    -- SEEDCU02: hijas del grupo con pago parcial, prorrateado como lo hace registrar_pago_grupo_factura.
    ('5eedc000-0000-4000-8000-00000000d021', 'SEEDCU-CP-021', 'SEEDCU02', 'SEEDCU02', '5eedc000-0000-4000-8000-000000001021', c_prov_b, 'SEEDCU Proveedor Moral', 'Renta de cámara', 2, 12000, 6000, 'EN_PROCESO_PAGO', 4800, NULL, c_grp_02, 'Santander', '014180009876543210', NULL),
    ('5eedc000-0000-4000-8000-00000000d022', 'SEEDCU-CP-022', 'SEEDCU02', 'SEEDCU02', '5eedc000-0000-4000-8000-000000001022', c_prov_b, 'SEEDCU Proveedor Moral', 'Iluminación',     1,  8000, 4000, 'EN_PROCESO_PAGO', 3200, NULL, c_grp_02, 'Santander', '014180009876543210', NULL),
    -- SEEDCU03: grupo pagado.
    ('5eedc000-0000-4000-8000-00000000d031', 'SEEDCU-CP-031', 'SEEDCU03', 'SEEDCU03', '5eedc000-0000-4000-8000-000000001031', c_prov_a, 'SEEDCU Proveedor Persona Física', 'Dirección de fotografía', 1, 12000, 8000, 'PAGADO', 12000, NULL, c_grp_03, 'BBVA', '012180001234567891', '2026-07-20'),
    -- SEEDCU04: suelta pendiente.
    ('5eedc000-0000-4000-8000-00000000d041', 'SEEDCU-CP-041', 'SEEDCU04', 'SEEDCU04', '5eedc000-0000-4000-8000-000000001041', c_prov_b, 'SEEDCU Proveedor Moral', 'Audio', 1, 6000, 4000, 'PENDIENTE', 0, NULL, NULL, 'Santander', '014180009876543210', NULL),
    -- SEEDCU05: principal (suelta) y complementaria -A (en grupo ABIERTO, proyecto_id = la principal).
    ('5eedc000-0000-4000-8000-00000000d051', 'SEEDCU-CP-051', 'SEEDCU05',   'SEEDCU05', '5eedc000-0000-4000-8000-000000001051', c_prov_a, 'SEEDCU Proveedor Persona Física', 'Producción general', 1, 13000, 7000, 'PENDIENTE', 0, NULL, NULL,      'BBVA',      '012180001234567891', NULL),
    ('5eedc000-0000-4000-8000-00000000d05a', 'SEEDCU-CP-05A', 'SEEDCU05-A', 'SEEDCU05', '5eedc000-0000-4000-8000-00000000105a', c_prov_b, 'SEEDCU Proveedor Moral',          'Equipo adicional',   1,  3000, 2000, 'PENDIENTE', 0, NULL, c_grp_05a, 'Santander', '014180009876543210', NULL),
    -- Sin proyecto ni cotización (forma legacy).
    ('5eedc000-0000-4000-8000-00000000d099', 'SEEDCU-CP-099', NULL, NULL, NULL, c_prov_a, 'SEEDCU Proveedor Persona Física', 'Gasto sin proyecto', 1, 1500, 0, 'PENDIENTE', 0, NULL, NULL, 'BBVA', '012180001234567891', NULL);

  -- Desglose de la orden vieja, como lo dejó el backfill de B1b.
  IF to_regclass('public.ordenes_pago_conceptos') IS NOT NULL THEN
    INSERT INTO ordenes_pago_conceptos (orden_pago_id, cuenta_pagar_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, created_at)
    SELECT c_orden, cp.id, cp.responsable_id, cp.responsable_nombre, cp.proyecto_id, cp.cotizacion_id, cp.x_pagar, '2026-06-20 12:00'
    FROM cuentas_pagar cp WHERE cp.orden_pago_id = c_orden;
  END IF;

  -- ── Documentos de proveedor ───────────────────────────────────────────
  INSERT INTO documentos_cuentas_pagar (cuentas_pagar_id, grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, fecha_carga)
  VALUES
    (NULL, c_grp_02, 'FACTURA_PROVEEDOR_XML', 'https://example.com/seedcu/SEEDCU02_prov.xml', 'SEEDCU02_Factura_Prov.xml', 'validado',  '2026-08-20 10:00'),
    (NULL, c_grp_02, 'FACTURA_PROVEEDOR',     'https://example.com/seedcu/SEEDCU02_prov.pdf', 'SEEDCU02_Factura_Prov.pdf', 'pendiente', '2026-08-20 10:00'),
    (NULL, c_grp_03, 'FACTURA_PROVEEDOR_XML', 'https://example.com/seedcu/SEEDCU03_prov.xml', 'SEEDCU03_Factura_Prov.xml', 'validado',  '2026-07-10 10:00'),
    (NULL, c_grp_03, 'COMPROBANTE_PAGO',      'https://example.com/seedcu/SEEDCU03_pago.pdf', 'SEEDCU03_Comprobante.pdf',  'pendiente', '2026-07-20 10:00');

  -- ── Cuentas por cobrar ────────────────────────────────────────────────
  INSERT INTO cuentas_cobrar (id, folio, cotizacion_id, proyecto_id, cliente, cliente_id, proyecto, monto_total, monto_pagado, estado, fecha_factura, fecha_vencimiento, fecha_pago)
  VALUES
    (c_cc_01,  'SEEDCU-CC-01',  'SEEDCU01',   'SEEDCU01', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Orden vieja y sueltas',        40020,  5000, 'FACTURA_PENDIENTE', NULL, NULL, NULL),  -- anticipo sin factura (D32)
    (c_cc_02,  'SEEDCU-CC-02',  'SEEDCU02',   'SEEDCU02', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Grupo con pago parcial',       40020,     0, 'FACTURADO',         '2026-08-18', '2026-09-17', NULL),  -- XML pendiente (T1), ya vencida
    (c_cc_03,  'SEEDCU-CC-03',  'SEEDCU03',   'SEEDCU03', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Cobro PPD en dos pagos',       26680, 26680, 'PAGADO',            '2026-07-06', '2026-08-05', '2026-08-01'),
    (c_cc_04,  'SEEDCU-CC-04',  'SEEDCU04',   'SEEDCU04', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Factura en revisión',          13340,     0, 'FACTURADO',         '2026-09-15', '2026-10-15', NULL),  -- XML en revision (D25)
    (c_cc_05,  'SEEDCU-CC-05',  'SEEDCU05',   'SEEDCU05', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias', 26680,    0, 'FACTURA_PENDIENTE', NULL, NULL, NULL),
    (c_cc_05a, 'SEEDCU-CC-05A', 'SEEDCU05-A', 'SEEDCU05', 'SEEDCU Cliente Demo', c_cliente, 'Seed · Principal con complementarias',  6670,    0, 'FACTURA_PENDIENTE', NULL, NULL, NULL),
    (c_cc_sp,  'SEEDCU-CC-99',  NULL,         NULL,       'SEEDCU Cliente Demo', c_cliente, 'Seed · Cobro sin proyecto',             5000,    0, 'FACTURA_PENDIENTE', NULL, NULL, NULL);

  INSERT INTO pagos_comprobantes (cuentas_cobrar_id, monto, tipo_pago, fecha_pago, comprobante_url, archivo_nombre, notas)
  VALUES
    (c_cc_01,  5000, 'TRANSFERENCIA', '2026-05-25', 'https://example.com/seedcu/SEEDCU01_anticipo.pdf', 'SEEDCU01_anticipo.pdf', 'Anticipo antes de factura (D32)'),
    (c_cc_03, 13340, 'TRANSFERENCIA', '2026-07-20', 'https://example.com/seedcu/SEEDCU03_pago1.pdf',    'SEEDCU03_pago1.pdf',    'Pago 1 de 2 (PPD)'),
    (c_cc_03, 13340, 'TRANSFERENCIA', '2026-08-01', 'https://example.com/seedcu/SEEDCU03_pago2.pdf',    'SEEDCU03_pago2.pdf',    'Pago 2 de 2 (PPD)');

  INSERT INTO documentos_cuentas_cobrar (cuentas_cobrar_id, tipo, archivo_url, archivo_nombre, estado_validacion, fecha_carga)
  VALUES
    (c_cc_02, 'FACTURA_XML',      'https://example.com/seedcu/SEEDCU02.xml',         'SEEDCU02_Factura.xml',             'pendiente', '2026-08-18 09:00'),
    (c_cc_02, 'FACTURA_PDF',      'https://example.com/seedcu/SEEDCU02.pdf',         'SEEDCU02_Factura.pdf',             'pendiente', '2026-08-18 09:00'),
    (c_cc_03, 'FACTURA_XML',      'https://example.com/seedcu/SEEDCU03.xml',         'SEEDCU03_Factura_PPD.xml',         'validado',  '2026-07-06 09:00'),
    (c_cc_03, 'FACTURA_PDF',      'https://example.com/seedcu/SEEDCU03.pdf',         'SEEDCU03_Factura_PPD.pdf',         'pendiente', '2026-07-06 09:00'),
    (c_cc_03, 'COMPLEMENTO_PAGO', 'https://example.com/seedcu/SEEDCU03_rep1.xml',    'SEEDCU03_Complemento_pago1.xml',   'validado',  '2026-07-22 09:00'),  -- sin su PDF (D27)
    (c_cc_04, 'FACTURA_XML',      'https://example.com/seedcu/SEEDCU04.xml',         'SEEDCU04_Factura.xml',             'revision',  '2026-09-15 09:00');

  RAISE NOTICE 'seed-cuentas-test: listo (5 proyectos, 1 orden, 3 grupos, 11 cuentas por pagar, 7 por cobrar).';
END
$seed$;
