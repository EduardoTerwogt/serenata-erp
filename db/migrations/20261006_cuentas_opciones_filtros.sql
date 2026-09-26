-- Rediseño de Cuentas, O1b (docs/PLAN.md §5.11, E6): las opciones de los
-- filtros (clientes y proveedores del año) salen de cuentas_periodo.
--
-- Solo dependen del año, pero viajaban en cada lectura del periodo: ~300 KB
-- de los ~305 KB de cada respuesta con el dataset de carga, más ~35 ms de
-- orden con ICU en la BD, en cada cambio de filtro, mes o página. Con eso el
-- p95 < 800 ms quedaba sin margen ante cualquier pico de red.
--
-- 1. cuentas_opciones(p_year): las mismas listas, sobre la misma derivación
--    (cuentas_conceptos), para pedirse una vez por año.
-- 2. cuentas_periodo: idéntica a la de 20261005 sin la llave 'opciones'.

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_opciones(p_year integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  WITH con AS MATERIALIZED (
    -- La contraparte no depende de "hoy"; se pasa solo porque la firma lo pide.
    SELECT tipo, contraparte, contraparte_id FROM cuentas_conceptos(p_year, hoy_cdmx())
  )
  SELECT jsonb_build_object(
    'anio', p_year,
    'clientes', COALESCE((SELECT jsonb_agg(x ORDER BY x COLLATE "es-x-icu")
                          FROM (SELECT DISTINCT contraparte AS x FROM con WHERE tipo = 'cobro') s), '[]'::jsonb),
    'proveedores', COALESCE((SELECT jsonb_agg(x ORDER BY x COLLATE "es-x-icu")
                             FROM (SELECT DISTINCT contraparte AS x FROM con WHERE tipo = 'pago' AND contraparte_id IS NOT NULL) s), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[\u0300-\u036f]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_result    jsonb;
BEGIN
  WITH
  con AS MATERIALIZED (
    SELECT * FROM cuentas_conceptos(v_anio, v_hoy)
  ),
  -- Por proyecto, sobre todos sus conceptos (D17, totales y cierre fiscal).
  proj AS MATERIALIZED (
    SELECT c.proyecto_key AS key,
           min(c.proyecto_orden) AS orden,
           min(c.proyecto_nombre) AS nombre,
           min(c.proyecto_cliente) AS cliente,
           min(c.fecha_entrega) AS fecha_entrega,
           min(c.anio) AS anio,
           min(c.mes) AS mes,
           bool_and(c.sin_fecha) AS sin_fecha,
           bool_and(c.sin_proyecto) AS sin_proyecto,
           bool_and(c.proyecto_reabierta) AS reabierta,
           count(*) FILTER (WHERE NOT c.resuelto) AS pendientes,
           bool_or(c.estado = 'vencido') AS hay_vencidos,
           max(c.fecha_resuelto) AS fecha_resuelto_max,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS por_pagar,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.cierre_iva_retenido), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.margen) AS margen, min(c.fee) AS fee, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           round(x.margen + x.fee, 2) AS utilidad_bruta,
           round(greatest(0, round(x.margen + x.fee, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.margen + x.fee, 2) - round(greatest(0, round(x.margen + x.fee, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto
    FROM proj x
  ),
  -- S16: sin mes, el actual si es el año en curso; si no, el último con proyectos.
  mes_ef AS (
    SELECT CASE
             WHEN v_mes_txt = 'todo' THEN NULL
             WHEN v_mes_txt ~ '^\d+$' THEN v_mes_txt::int
             WHEN v_anio = extract(year FROM v_hoy)::int THEN extract(month FROM v_hoy)::int
             ELSE (SELECT max(mes) FROM pj WHERE NOT sin_fecha AND anio = v_anio)
           END AS mes
  ),
  -- Conceptos que pasan tipo, cliente, proveedor y búsqueda.
  -- Búsqueda (normalizarBusqueda): los cinco campos se normalizan juntos,
  -- separados por U+001F (la búsqueda no lo puede contener), en una sola
  -- pasada por concepto. normalize() es lo caro: un texto solo ASCII
  -- (bytes = caracteres) no tiene acentos y se salta.
  fc AS MATERIALIZED (
    SELECT c.*
    FROM con c
    CROSS JOIN LATERAL (
      SELECT concat_ws(chr(31), c.proyecto_key, c.proyecto_nombre, COALESCE(c.proyecto_cliente, ''), c.contraparte, c.concepto) AS texto
    ) b
    WHERE (v_tipo = 'todo' OR c.tipo = v_tipo)
      AND (v_cliente IS NULL OR (c.tipo = 'cobro' AND c.contraparte = v_cliente))
      AND (v_proveedor IS NULL OR (c.tipo = 'pago' AND c.contraparte = v_proveedor))
      AND (v_q = ''
           OR strpos(CASE WHEN octet_length(b.texto) = char_length(b.texto) THEN lower(b.texto)
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[\u0300-\u036f]', '', 'g')) END,
                     v_q) > 0)
  ),
  dec AS MATERIALIZED (
    SELECT pj.*,
           (v_estado = 'todas' OR (v_estado = 'pendientes' AND NOT pj.cerradas) OR (v_estado = 'cerradas' AND pj.cerradas)) AS estado_ok
    FROM pj
    WHERE pj.key IN (SELECT proyecto_key FROM fc)
  ),
  del_anio AS (
    SELECT * FROM dec WHERE NOT sin_fecha AND anio = v_anio
  ),
  alcance AS MATERIALIZED (
    SELECT d.* FROM del_anio d, mes_ef m WHERE m.mes IS NULL OR d.mes = m.mes
  ),
  -- Proyectos a mostrar: los del periodo, y en "Todo el año" también "Sin fecha" (S17).
  vis AS MATERIALIZED (
    SELECT a.*, row_number() OVER (ORDER BY a.mes, a.cerradas, a.orden) AS pos, false AS es_sin_fecha
    FROM alcance a WHERE a.estado_ok
    UNION ALL
    SELECT d.*, 1000000 + row_number() OVER (ORDER BY d.orden), true
    FROM dec d, mes_ef m
    WHERE m.mes IS NULL AND d.sin_fecha AND d.estado_ok
  ),
  -- Orden de la lista: el de las tarjetas y, dentro del proyecto, cobros,
  -- luego grupos, luego sueltas, cada uno por creación. Se numeran solo las
  -- llaves (ordenar la fila completa costaba ~60 ms); la fila entera se
  -- vuelve a leer solo para la página pedida.
  filas AS MATERIALIZED (
    SELECT f.key, f.proyecto_key,
           row_number() OVER (ORDER BY v.pos, f.tipo = 'pago', f.objetivo = 'cuenta', f.concepto_creado, f.id) AS n
    FROM fc f
    JOIN vis v ON v.key = f.proyecto_key
    WHERE v_estado <> 'pendientes' OR NOT f.resuelto
  ),
  tarjetas AS (
    SELECT v.pos, v.es_sin_fecha,
           jsonb_build_object(
             'id', v.key, 'nombre', v.nombre, 'cliente', v.cliente, 'fecha_entrega', v.fecha_entrega,
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar)
           ) AS t
    FROM vis v
  ),
  -- Totales del periodo: conceptos filtrados de los proyectos del alcance y su cierre.
  tot_c AS (
    SELECT round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta
    FROM alcance
  )
  SELECT jsonb_build_object(
    'anio', v_anio,
    'mes', COALESCE(to_jsonb(m.mes), '"todo"'::jsonb),
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'meses', (
      SELECT jsonb_agg(jsonb_build_object(
               'mes', s.m,
               'proyectos', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m),
               'pendientes', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND NOT d.cerradas),
               'visibles', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND d.estado_ok)
             ) ORDER BY s.m)
      FROM generate_series(1, 12) AS s(m)
    ),
    'conteo', (
      SELECT jsonb_build_object('todas', count(*), 'pendientes', count(*) FILTER (WHERE NOT cerradas), 'cerradas', count(*) FILTER (WHERE cerradas))
      FROM alcance
    ),
    'totales', (
      SELECT jsonb_build_object(
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones + t.isr, 2))
      )
      FROM tot_c c, tot_p t
    ),
    'proyectos', CASE WHEN v_vista = 'proyectos' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM (
                   SELECT t, pos FROM tarjetas WHERE NOT es_sin_fecha ORDER BY pos
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x), '[]'::jsonb),
        'total', (SELECT count(*) FROM vis WHERE NOT es_sin_fecha),
        'page', v_page, 'page_size', v_size)
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size) END,
    'sin_fecha', CASE WHEN v_vista = 'proyectos'
      THEN COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM tarjetas WHERE es_sin_fecha), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'lista', CASE WHEN v_vista = 'lista' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_opciones(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_opciones(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_periodo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_periodo(jsonb) TO service_role;

COMMIT;
