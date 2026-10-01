-- Foto dorada "antes = después" de las RPCs de lectura (PLAN.md, B0 / H1, K3).
--
-- Llama a cada RPC de lectura con parámetros fijos y una FECHA FIJA, y devuelve
-- la huella (md5 + bytes) de cada salida. No cambia nada: reemplaza hoy_cdmx()
-- por la fecha fija dentro de un bloque DO y termina con RAISE EXCEPTION, que
-- deshace toda la transacción (la función vuelve a ser la de siempre) y es la
-- forma de devolver el resultado de una sola sentencia. El "error" es esperado:
-- su mensaje empieza con FOTO_DORADA: y trae el JSON.
--
--   - Pegado a mano / MCP: devuelve las huellas (compacto).
--   - scripts/db/foto-dorada.mjs: reemplaza `v_hash;` por `v_full;` con
--     --completo para guardar el JSON de cada llamada y comparar campo por campo.
--
-- Excluye las RPCs que el plan retira (J5): buscar_cuentas_cobrar,
-- buscar_cuentas_pagar_grupos y buscar_cuentas_pagar (retiradas en 20261023). Tomarla después de alinear los datos de test.

DO $foto$
DECLARE
  c_hoy constant date := DATE '2026-10-01';
  v_full jsonb := '{}'::jsonb;
  v_hash jsonb := '{}'::jsonb;
  v_anios int[];
  v_y int;
  v_ini date := c_hoy - 30;
BEGIN
  EXECUTE $f$CREATE OR REPLACE FUNCTION public.hoy_cdmx() RETURNS date LANGUAGE sql STABLE AS 'SELECT DATE ''2026-10-01'''$f$;

  v_anios := cuentas_anios();
  v_full := v_full || jsonb_build_object('cuentas_anios', to_jsonb(v_anios));

  FOREACH v_y IN ARRAY v_anios LOOP
    v_full := v_full || jsonb_build_object(
      'cuentas_opciones/' || v_y, cuentas_opciones(v_y),
      'cuentas_por_proyecto/' || v_y, to_jsonb(cuentas_por_proyecto(v_y, NULL)),
      'cuentas_orden_candidatos/' || v_y, cuentas_orden_candidatos(100),
      'cuentas_periodo/' || v_y || '/proyectos-todo', cuentas_periodo(jsonb_build_object('anio', v_y, 'mes', 'todo', 'vista', 'proyectos', 'hoy', c_hoy, 'page', 1, 'page_size', 60)),
      'cuentas_periodo/' || v_y || '/proyectos-mes', cuentas_periodo(jsonb_build_object('anio', v_y, 'vista', 'proyectos', 'hoy', c_hoy, 'page', 1, 'page_size', 60)),
      'cuentas_periodo/' || v_y || '/proyectos-pendientes', cuentas_periodo(jsonb_build_object('anio', v_y, 'mes', 'todo', 'estado', 'pendientes', 'vista', 'proyectos', 'hoy', c_hoy, 'page', 2, 'page_size', 60)),
      'cuentas_periodo/' || v_y || '/lista-todo', cuentas_periodo(jsonb_build_object('anio', v_y, 'mes', 'todo', 'vista', 'lista', 'hoy', c_hoy, 'page', 1, 'page_size', 100)),
      'cuentas_periodo/' || v_y || '/lista-cobros', cuentas_periodo(jsonb_build_object('anio', v_y, 'mes', 'todo', 'tipo', 'cobro', 'vista', 'lista', 'hoy', c_hoy, 'page', 3, 'page_size', 50)),
      'cuentas_periodo/' || v_y || '/lista-pagos', cuentas_periodo(jsonb_build_object('anio', v_y, 'mes', 'todo', 'tipo', 'pago', 'vista', 'lista', 'hoy', c_hoy, 'page', 3, 'page_size', 50))
    );
  END LOOP;

  v_full := v_full || jsonb_build_object(
    'cuentas_resumen', cuentas_resumen(c_hoy),
    'cuentas_avisos_items', cuentas_avisos_items(c_hoy, 50),
    'dashboard_kpis_cuentas', dashboard_kpis_cuentas(),
    'dashboard_cotizaciones_recientes', dashboard_cotizaciones_recientes(),
    'dashboard_actividad_cotizaciones', dashboard_actividad_cotizaciones(v_ini, c_hoy),
    'dashboard_actividad_proyectos', dashboard_actividad_proyectos(v_ini, c_hoy),
    'dashboard_egresos_por_bucket', dashboard_egresos_por_bucket(jsonb_build_array(
      jsonb_build_object('inicio', c_hoy - 30, 'fin', c_hoy), jsonb_build_object('inicio', c_hoy - 60, 'fin', c_hoy - 31))),
    'buscar_cotizaciones/todas', buscar_cotizaciones(NULL, NULL, 1, 50),
    'buscar_cotizaciones/aprobadas', buscar_cotizaciones(NULL, 'APROBADA', 2, 50),
    'buscar_ordenes_pago', buscar_ordenes_pago('{}'::jsonb, 1, 50),
    'proveedor_documentos_resumen', proveedor_documentos_resumen()
  );

  SELECT jsonb_object_agg(k, jsonb_build_object('md5', md5(v::text), 'bytes', length(v::text)) ORDER BY k)
    INTO v_hash FROM jsonb_each(v_full) AS t(k, v);

  RAISE EXCEPTION 'FOTO_DORADA:%', v_hash;
END
$foto$;
