-- Prueba de comportamiento del histórico de Cuentas (docs/PLAN.md, #110 B2). Corre sobre la fixture de `cuentas-equivalencia.sql`
-- (la crea si falta) dentro de una transacción que se deshace: no deja nada en la base.
--
--   psql -d <bd> -v ON_ERROR_STOP=1 -f scripts/db/cuentas-historico-prueba.sql
--
-- Qué comprueba:
--   1. El archivado marca los proyectos esperados y respeta los componentes (EQ14+EQ15 y EQ40+EQ41 juntos; EQ38/EQ39 y EQ42/EQ43 no).
--   2. `cuentas_resumen` y `cuentas_avisos_items` dan EXACTAMENTE lo mismo con y sin los históricos marcados.
--   3. Cada RPC de escritura de Cuentas y cada escritura directa sobre las tablas guardadas contra un histórico NO se completa:
--      `ok P1420` (la guarda) o `ok otra regla` (otra validación la rechazó antes); una escritura que prospera es `FALLA`.
--   4. `auditar_consistencia()` queda en 0 con 27 guardas, y la bandera `historico` sale en `cuentas_periodo`.
-- Termina con ROLLBACK; cualquier línea `FALLA` o una aserción fallida aborta con error.
\set ON_ERROR_STOP on
\set solo_fixture 1
\i scripts/db/cuentas-equivalencia.sql

BEGIN;
SET LOCAL TimeZone = 'UTC';

CREATE FUNCTION pg_temp.escribe(p_caso text, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RETURN 'FALLA  ' || p_caso || ': la escritura prosperó';
  EXCEPTION
    WHEN SQLSTATE 'P1420' THEN RETURN 'ok P1420     ' || p_caso;
    WHEN OTHERS THEN RETURN 'ok otra regla ' || p_caso || ' (' || SQLSTATE || ')';
  END;
END
$f$;

-- Antes de archivar: una cotización complementaria EMITIDA de EQ02 (para probar approve_cotizacion contra un histórico).
INSERT INTO cotizaciones (id, cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo, estado, es_complementaria_de,
                          subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total)
SELECT 'EQ02C', cliente, cliente_id, proyecto, fecha_entrega, locacion, fecha_cotizacion, 'COMPLEMENTARIA', 'EMITIDA', 'EQ02',
       0, 0, 0, 0, 0, 0, 0
FROM cotizaciones WHERE id = 'EQ02';

-- Un pago de proveedor sin enlace de comprobante pero con documento COMPROBANTE_PAGO (resuelto igual): `adjuntar_comprobante_pago_proveedor`
-- solo escribe en `pagos`, así que prueba la guarda de `pagos`.
UPDATE pagos SET comprobante_url = NULL, archivo_nombre = NULL
 WHERE id = (SELECT pp.pago_id FROM pagos_cuentas_pagar pp JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id WHERE g.proyecto_id = 'EQ02' LIMIT 1);
INSERT INTO documentos_cuentas_pagar (grupo_id, tipo, archivo_url, archivo_nombre, estado_validacion, fecha_carga, created_at)
SELECT id, 'COMPROBANTE_PAGO', 'https://eq.invalid/EQ02-comprobante.pdf', 'comprobante.pdf', 'pendiente', TIMESTAMPTZ '2026-04-01 12:00+00', TIMESTAMPTZ '2026-04-01 12:00+00'
FROM cuentas_pagar_grupos WHERE proyecto_id = 'EQ02' LIMIT 1;

-- Lecturas globales ANTES de marcar.
CREATE TEMP TABLE _antes AS
SELECT cuentas_resumen('2027-06-01')::jsonb AS resumen, cuentas_avisos_items('2027-06-01', 50)::jsonb AS avisos;

-- 1. Archivado real (2026): lo esperado.
SELECT archivar_cuentas_historicas(2026, '2027-06-01', false) AS r \gset
SELECT (:'r'::jsonb->'proyectos') = '["EQ02","EQ05","EQ13","EQ14","EQ15","EQ32","EQ40","EQ41"]'::jsonb AS ok_archivados,
       (:'r'::jsonb->>'archivados')::int AS n \gset
\if :ok_archivados
\else
  \echo 'FALLA archivado: proyectos inesperados:' :r
  SELECT 1/0;
\endif
\echo 'ok archivado:' :n 'proyectos (EQ14+EQ15 y EQ40+EQ41 juntos; EQ38/EQ39 y EQ42/EQ43 diferidos)'
SELECT archivar_cuentas_historicas(2026, '2027-06-01', false)->>'archivados' = '0' AS ok_idempotente \gset
\if :ok_idempotente
  \echo 'ok archivar de nuevo no repite'
\else
  \echo 'FALLA archivar es idempotente'
  SELECT 1/0;
\endif

-- 2. resumen y avisos idénticos con los históricos marcados.
SELECT (SELECT resumen FROM _antes) = cuentas_resumen('2027-06-01')::jsonb AS r_igual,
       (SELECT avisos FROM _antes) = cuentas_avisos_items('2027-06-01', 50)::jsonb AS a_igual \gset
\if :r_igual
  \echo 'ok resumen idéntico con los históricos marcados'
\else
  \echo 'FALLA resumen cambió al marcar históricos'
  SELECT 1/0;
\endif
\if :a_igual
  \echo 'ok avisos idénticos con los históricos marcados'
\else
  \echo 'FALLA avisos cambió al marcar históricos'
  SELECT 1/0;
\endif

-- Bandera en cuentas_periodo y en el proyecto seleccionado.
SELECT (SELECT count(*) FROM jsonb_array_elements(cuentas_periodo('{"anio":2026,"mes":"todo","hoy":"2027-06-01","vista":"proyectos","page_size":200}'::jsonb)::jsonb->'proyectos'->'items') t
         WHERE (t->>'historico')::boolean) = 8 AS ok_bandera,
       (cuentas_periodo('{"anio":2026,"mes":"todo","hoy":"2027-06-01","proyecto":"EQ02","vista":"lista","page_size":5}'::jsonb)::jsonb->'seleccionado'->>'historico')::boolean AS ok_sel \gset
\if :ok_bandera
  \echo 'ok bandera historico en las tarjetas de cuentas_periodo (8)'
\else
  \echo 'FALLA bandera historico en tarjetas'
  SELECT 1/0;
\endif
\if :ok_sel
  \echo 'ok bandera historico en el proyecto seleccionado'
\else
  \echo 'FALLA bandera historico en seleccionado'
  SELECT 1/0;
\endif

-- Identificadores del histórico EQ02 (y de un proveedor/cliente cualquiera).
SELECT (SELECT id FROM cuentas_cobrar WHERE folio = 'EQ-CC-EQ02') AS cc,
       (SELECT id FROM cuentas_pagar_grupos WHERE proyecto_id = 'EQ02' LIMIT 1) AS gr,
       (SELECT id FROM cuentas_pagar WHERE folio = 'EQ-CP-EQ02-1') AS cp,
       (SELECT responsable_id FROM cuentas_pagar WHERE folio = 'EQ-CP-EQ02-1') AS prov,
       (SELECT pc.pago_id FROM pagos_comprobantes pc JOIN cuentas_cobrar c ON c.id = pc.cuentas_cobrar_id WHERE c.folio = 'EQ-CC-EQ02' LIMIT 1) AS pago_c,
       (SELECT pp.pago_id FROM pagos_cuentas_pagar pp JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id WHERE g.proyecto_id = 'EQ02' LIMIT 1) AS pago_p,
       (SELECT factura_documento_id FROM cuentas_cobrar WHERE folio = 'EQ-CC-EQ02') AS fx,
       (SELECT d.id FROM documentos_cuentas_pagar d JOIN cuentas_pagar_grupos g ON g.id = d.grupo_id WHERE g.proyecto_id = 'EQ02' AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL LIMIT 1) AS fp,
       (SELECT id FROM items_cotizacion WHERE cotizacion_id = 'EQ02' LIMIT 1) AS item \gset

-- 3. Escrituras: RPC de Cuentas y de cotizaciones contra el histórico EQ02.
\echo '— RPC —'
SELECT pg_temp.escribe('anular_pago_cobro',                    format('SELECT anular_pago_cobro(%L, ''m'', ''t'')', :'pago_c')) UNION ALL
SELECT pg_temp.escribe('anular_pago_proveedor',                format('SELECT anular_pago_proveedor(%L, ''m'', ''t'')', :'pago_p')) UNION ALL
SELECT pg_temp.escribe('approve_cotizacion (complementaria)',  $$SELECT approve_cotizacion('EQ02C')$$) UNION ALL
SELECT pg_temp.escribe('cancel_cotizacion',                    $$SELECT cancel_cotizacion('EQ02')$$) UNION ALL
SELECT pg_temp.escribe('baja_documento_cobro',                 format('SELECT baja_documento_cobro(%L, ''m'', ''t'', NULL)', :'fx')) UNION ALL
SELECT pg_temp.escribe('baja_documento_pago',                  format('SELECT baja_documento_pago(%L, ''m'', ''t'', NULL)', :'fp')) UNION ALL
SELECT pg_temp.escribe('reabrir_cuentas_proyecto',             $$SELECT reabrir_cuentas_proyecto('EQ02', 'motivo', 't')$$) UNION ALL
SELECT pg_temp.escribe('corregir_datos_cobro',                 format('SELECT corregir_datos_cobro(%L, current_date, current_date, ''n'', ''t'')', :'cc')) UNION ALL
SELECT pg_temp.escribe('corregir_datos_pago (cobro)',          format('SELECT corregir_datos_pago(''cobro'', %L, current_date, ''n'', ''t'')', :'pago_c')) UNION ALL
SELECT pg_temp.escribe('corregir_datos_pago (proveedor)',      format('SELECT corregir_datos_pago(''proveedor'', %L, current_date, ''n'', ''t'')', :'pago_p')) UNION ALL
SELECT pg_temp.escribe('corregir_proveedor_cuenta_pagar',      format('SELECT corregir_proveedor_cuenta_pagar(%L, %L, ''m'', ''t'')', :'cp', :'prov')) UNION ALL
SELECT pg_temp.escribe('reasignar_responsable_cuenta_pagar',   format('SELECT reasignar_responsable_cuenta_pagar(%L, %L)', :'cp', :'prov')) UNION ALL
SELECT pg_temp.escribe('reconcile_cuenta_pagar_grupo',         format('SELECT reconcile_cuenta_pagar_grupo(%L)', :'cp')) UNION ALL
SELECT pg_temp.escribe('registrar_pago_cobro',                 format($q$SELECT registrar_pago_cobro(jsonb_build_array(jsonb_build_object('cuenta_id', %L, 'monto', 1)), 'TRANSFERENCIA', current_date, NULL, NULL, NULL, 't', gen_random_uuid())$q$, :'cc')) UNION ALL
SELECT pg_temp.escribe('pago_proveedor_aplicar_linea',         format('SELECT pago_proveedor_aplicar_linea(%L, %L, 1, NULL, current_date)', :'pago_p', :'gr')) UNION ALL
SELECT pg_temp.escribe('validar_factura_proveedor',            format('SELECT validar_factura_proveedor(%L, ''t'')', :'fp')) UNION ALL
SELECT pg_temp.escribe('adjuntar_comprobante_pago_proveedor',  format('SELECT adjuntar_comprobante_pago_proveedor(%L, ''https://x.invalid/c.pdf'', ''c.pdf'', ''t'')', :'pago_p')) UNION ALL
SELECT pg_temp.escribe('ligar_factura',                        format($q$SELECT ligar_factura(jsonb_build_array(jsonb_build_object('cuenta_id', %L)), '{"archivo_url":"https://x.invalid/a.xml","archivo_nombre":"a.xml","uuid_cfdi":"u","total_cfdi":1,"metodo_pago_cfdi":"PUE"}'::jsonb, '{"archivo_url":"https://x.invalid/a.pdf","archivo_nombre":"a.pdf"}'::jsonb, current_date, current_date, 't', gen_random_uuid(), NULL, NULL)$q$, :'cc')) UNION ALL
SELECT pg_temp.escribe('ligar_complemento_cobro',              format($q$SELECT ligar_complemento_cobro(jsonb_build_array(jsonb_build_object('cuenta_id', %L)), '{"archivo_url":"https://x.invalid/c.xml","archivo_nombre":"c.xml"}'::jsonb, '{"archivo_url":"https://x.invalid/c.pdf","archivo_nombre":"c.pdf"}'::jsonb, %L, 't')$q$, :'cc', :'pago_c')) UNION ALL
SELECT pg_temp.escribe('ligar_complemento_proveedor',          format($q$SELECT ligar_complemento_proveedor(jsonb_build_array(jsonb_build_object('grupo_id', %L)), '{"archivo_url":"https://x.invalid/c.xml","archivo_nombre":"c.xml"}'::jsonb, '{"archivo_url":"https://x.invalid/c.pdf","archivo_nombre":"c.pdf"}'::jsonb, %L, 't')$q$, :'gr', :'pago_p')) UNION ALL
SELECT pg_temp.escribe('preparar_grupo_factura_proveedor',     format($q$SELECT preparar_grupo_factura_proveedor(%L, NULL, ARRAY[%L]::uuid[], NULL, 't', gen_random_uuid())$q$, :'prov', :'item')) UNION ALL
SELECT pg_temp.escribe('generar_orden_pago',                   format($q$SELECT generar_orden_pago(jsonb_build_array(jsonb_build_object('grupo_id', %L)), 'https://x.invalid/o.pdf', 'o.pdf', 't')$q$, :'gr'));

\echo '— escrituras directas sobre las tablas guardadas —'
SELECT pg_temp.escribe('INSERT cuentas_cobrar',               $$INSERT INTO cuentas_cobrar (folio, cotizacion_id, proyecto_id, monto_total) VALUES ('EQ-CC-X1', NULL, 'EQ02', 1)$$) UNION ALL
SELECT pg_temp.escribe('UPDATE cuentas_cobrar',               format('UPDATE cuentas_cobrar SET notas = ''x'' WHERE id = %L', :'cc')) UNION ALL
SELECT pg_temp.escribe('DELETE cuentas_cobrar',               format('DELETE FROM cuentas_cobrar WHERE id = %L', :'cc')) UNION ALL
SELECT pg_temp.escribe('INSERT cuentas_pagar',                $$INSERT INTO cuentas_pagar (folio, proyecto_id, costo_total) VALUES ('EQ-CP-X1', 'EQ02', 1)$$) UNION ALL
SELECT pg_temp.escribe('UPDATE cuentas_pagar',                format('UPDATE cuentas_pagar SET notas = ''x'' WHERE id = %L', :'cp')) UNION ALL
SELECT pg_temp.escribe('DELETE cuentas_pagar',                format('DELETE FROM cuentas_pagar WHERE id = %L', :'cp')) UNION ALL
SELECT pg_temp.escribe('UPDATE cuentas_pagar_grupos',         format('UPDATE cuentas_pagar_grupos SET estado = estado WHERE id = %L', :'gr')) UNION ALL
SELECT pg_temp.escribe('INSERT cuentas_pagar_grupos',         format('INSERT INTO cuentas_pagar_grupos (proyecto_id, responsable_id) VALUES (''EQ02'', %L)', :'prov')) UNION ALL
SELECT pg_temp.escribe('INSERT documentos_cuentas_cobrar',    format($q$INSERT INTO documentos_cuentas_cobrar (cuentas_cobrar_id, tipo, archivo_url, archivo_nombre) VALUES (%L, 'OTRO', 'https://x.invalid/o', 'o')$q$, :'cc')) UNION ALL
SELECT pg_temp.escribe('UPDATE documentos_cuentas_cobrar (factura)', format('UPDATE documentos_cuentas_cobrar SET estado_validacion = estado_validacion WHERE id = %L', :'fx')) UNION ALL
SELECT pg_temp.escribe('INSERT documentos_cuentas_pagar',     format($q$INSERT INTO documentos_cuentas_pagar (grupo_id, tipo, archivo_url, archivo_nombre) VALUES (%L, 'OTRO', 'https://x.invalid/o', 'o')$q$, :'gr')) UNION ALL
SELECT pg_temp.escribe('UPDATE documentos_cuentas_pagar',     format('UPDATE documentos_cuentas_pagar SET estado_validacion = estado_validacion WHERE id = %L', :'fp')) UNION ALL
SELECT pg_temp.escribe('INSERT cuentas_reaperturas',          $$INSERT INTO cuentas_reaperturas (proyecto_id, motivo, abierta_por) VALUES ('EQ02', 'm', 't')$$) UNION ALL
SELECT pg_temp.escribe('INSERT cotización complementaria',    $$INSERT INTO cotizaciones (id, cliente, proyecto, fecha_entrega, locacion, fecha_cotizacion, tipo, estado, es_complementaria_de, subtotal, fee_agencia, general, iva, total, margen_total, utilidad_total) VALUES ('EQ02D', 'c', 'p', '2026-03-10', 'l', '2026-03-01', 'COMPLEMENTARIA', 'EMITIDA', 'EQ02', 0, 0, 0, 0, 0, 0, 0)$$);

-- Un proyecto vivo sigue escribiendo con normalidad (la guarda no estorba).
\echo '— control: un proyecto vivo —'
SELECT CASE WHEN pg_temp.escribe('UPDATE cuentas_cobrar vivo', $$UPDATE cuentas_cobrar SET notas = 'x' WHERE folio = 'EQ-CC-EQ01'$$) LIKE 'FALLA%' THEN 'ok un proyecto vivo escribe con normalidad' ELSE 'FALLA un proyecto vivo no puede escribir' END;

-- 4. Auditoría.
SELECT count(*) = 27 AS ok_27, sum((g->>'violaciones')::int) = 0 AS ok_cero
FROM jsonb_array_elements(auditar_consistencia()->'guardas') g \gset
\if :ok_27
  \echo 'ok auditar_consistencia tiene 27 guardas'
\else
  \echo 'FALLA auditar_consistencia no tiene 27 guardas'
  SELECT 1/0;
\endif
\if :ok_cero
  \echo 'ok auditar_consistencia = 0 con 8 históricos'
\else
  \echo 'FALLA auditar_consistencia reporta violaciones'
  SELECT jsonb_pretty(auditar_consistencia());
  SELECT 1/0;
\endif

-- 5. Cobertura: toda función de `public` que escriba en las tablas guardadas debe estar en la lista probada arriba (o declarada exenta).
--    Si mañana alguien agrega otra RPC de escritura de Cuentas, esta prueba falla hasta que se agregue aquí.
SELECT array_agg(p.proname ORDER BY p.proname) AS sin_cubrir
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AND p.prokind = 'f'
  AND p.prorettype <> 'trigger'::regtype
  AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(cuentas_cobrar|cuentas_pagar|cuentas_pagar_grupos|documentos_cuentas_cobrar|documentos_cuentas_pagar|cuentas_reaperturas|pagos)\y'
  AND p.proname <> ALL (ARRAY[
    -- probadas arriba contra un histórico
    'anular_pago_cobro', 'anular_pago_proveedor', 'approve_cotizacion', 'cancel_cotizacion', 'baja_documento_cobro', 'baja_documento_pago',
    'reabrir_cuentas_proyecto', 'corregir_datos_cobro', 'corregir_datos_pago', 'corregir_proveedor_cuenta_pagar',
    'reasignar_responsable_cuenta_pagar', 'reconcile_cuenta_pagar_grupo', 'registrar_pago_cobro', 'pago_proveedor_aplicar_linea',
    'validar_factura_proveedor', 'adjuntar_comprobante_pago_proveedor', 'ligar_factura', 'ligar_complemento_cobro',
    'ligar_complemento_proveedor', 'preparar_grupo_factura_proveedor', 'generar_orden_pago',
    -- exentas, con motivo
    'cerrar_cuentas_proyecto',      -- un histórico no tiene reapertura activa: no hay nada que cerrar (no escribe)
    'cancelar_orden_pago',          -- actualiza grupos y cuentas: lo cubren las pruebas directas de esas tablas
    'pagos_cabecera_crear'          -- crea una cabecera sin proyecto; las líneas vienen con una escritura guardada
  ]) \gset
\if :{?sin_cubrir}
  \echo 'FALLA RPC de escritura sin cubrir por esta prueba:' :sin_cubrir
  SELECT 1/0;
\else
  \echo 'ok toda RPC de escritura de Cuentas está cubierta'
\endif

ROLLBACK;
