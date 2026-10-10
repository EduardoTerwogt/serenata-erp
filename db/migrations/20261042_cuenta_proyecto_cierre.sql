-- #140: cuenta de proyecto clara (docs/PLAN.md, B1). Solo CREATE OR REPLACE de dos funciones de lectura: sin DDL, sin DROP, firmas iguales
-- (los permisos EXECUTE se conservan). Las tablas y los datos no cambian.
--   1. cuentas_cierre_mensual: ya no genera las filas `proveedores` ni `isr` (la cuenta del proyecto muestra el ISR solo como referencia y
--      a los proveedores por su cuenta); el pendiente de IVA negativo se rotula «IVA acreditable por aplicar»; las retenciones
--      pendientes dicen cuándo vencen.
--   2. cuentas_periodo: `cierre` gana `sat_total` y `cuadre_diferencia`, y la retención de IVA de un grupo con factura real es el residuo
--      del Total del CFDI cuando cae dentro de tolerancia (si no, la estimada por régimen). Todo lo demás, idéntico a 20261040.
-- Reversa: volver a las funciones de 20261028 (cuentas_cierre_mensual) y 20261040 (cuentas_periodo).

CREATE OR REPLACE FUNCTION public.cuentas_cierre_mensual(p_cierre jsonb, p_cobros jsonb, p_pagos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  total_cobros double precision := 0;
  cobrado_mes jsonb := '{}'::jsonb;
  cobrado double precision := 0;
  falta_cobrar boolean;
  iva_trasladado_mes jsonb := '{}'::jsonb;
  iva_acreditable_mes jsonb := '{}'::jsonb;
  retenciones_mes jsonb := '{}'::jsonb;
  falta_pagar boolean := false;
  iva_mes jsonb := '{}'::jsonb;
  filas jsonb := '[]'::jsonb;
  iva_cobrado double precision := COALESCE((p_cierre->>'iva_cobrado')::double precision, 0);
  iva_neto double precision := COALESCE((p_cierre->>'iva_neto_a_enterar')::double precision, 0);
  q record;
  c record;
  f record;
  r record;
  pagos jsonb;
  total double precision;
  pagado double precision;
  iva jsonb;
  ret jsonb;
  a_favor boolean;
  cuando text;
  ret_total double precision;
  v double precision;
BEGIN
  FOR c IN SELECT x.total, x.pagos FROM jsonb_to_recordset(COALESCE(p_cobros, '[]'::jsonb)) AS x(total double precision, pagos jsonb) LOOP
    total_cobros := total_cobros + greatest(0, c.total);
  END LOOP;
  total_cobros := cuentas_js_round2(total_cobros);
  FOR c IN SELECT x.total, x.pagos FROM jsonb_to_recordset(COALESCE(p_cobros, '[]'::jsonb)) AS x(total double precision, pagos jsonb) LOOP
    cobrado_mes := cuentas_cm_por_mes(c.pagos, c.total, cobrado_mes, 1);
  END LOOP;
  FOR r IN SELECT k, (cobrado_mes->>k)::double precision AS v FROM jsonb_object_keys(cobrado_mes) AS k LOOP
    cobrado := cobrado + r.v;
  END LOOP;
  falta_cobrar := total_cobros - cobrado > 0.005;

  IF total_cobros > 0 THEN
    FOR r IN SELECT k, (cobrado_mes->>k)::double precision AS v FROM jsonb_object_keys(cobrado_mes) AS k LOOP
      iva_trasladado_mes := jsonb_set(iva_trasladado_mes, ARRAY[r.k], to_jsonb((r.v * iva_cobrado) / total_cobros), true);
    END LOOP;
  END IF;

  FOR q IN SELECT x.clave, x.total_a_transferir, x.iva_trasladado, x.iva_retenido, x.isr_retenido
           FROM jsonb_to_recordset(COALESCE(p_cierre->'quien_cuanto_cuando', '[]'::jsonb))
                AS x(clave text, total_a_transferir double precision, iva_trasladado double precision, iva_retenido double precision, isr_retenido double precision) LOOP
    pagos := COALESCE(p_pagos->q.clave, '[]'::jsonb);
    total := q.total_a_transferir;
    pagado := 0;
    FOR r IN SELECT greatest(0, x.monto) AS monto FROM jsonb_to_recordset(pagos) AS x(fecha text, monto double precision) LOOP
      pagado := pagado + r.monto;
    END LOOP;
    IF total - pagado > 0.005 THEN falta_pagar := true; END IF;
    IF total <= 0 THEN CONTINUE; END IF;
    iva_acreditable_mes := cuentas_cm_por_mes(pagos, total, iva_acreditable_mes, q.iva_trasladado / total);
    retenciones_mes := cuentas_cm_por_mes(pagos, total, retenciones_mes, (q.iva_retenido + q.isr_retenido) / total);
  END LOOP;

  FOR r IN SELECT DISTINCT k FROM (SELECT jsonb_object_keys(iva_trasladado_mes) AS k UNION ALL SELECT jsonb_object_keys(iva_acreditable_mes)) u LOOP
    iva_mes := jsonb_set(iva_mes, ARRAY[r.k],
      to_jsonb(COALESCE((iva_trasladado_mes->>r.k)::double precision, 0) - COALESCE((iva_acreditable_mes->>r.k)::double precision, 0)), true);
  END LOOP;

  iva := cuentas_cm_repartir(iva_neto, iva_mes, falta_cobrar OR falta_pagar);
  FOR f IN SELECT e->>'mes' AS mes, (e->>'monto')::double precision AS monto FROM jsonb_array_elements(iva->'filas') WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
    a_favor := f.monto < 0;
    filas := filas || jsonb_build_array(jsonb_build_object(
      'concepto', 'iva',
      'quien', CASE WHEN a_favor THEN 'IVA a favor' ELSE 'IVA a enterar' END || ' · ' || cuentas_mes_label(f.mes),
      'sub', CASE WHEN a_favor THEN 'Se acredita en la declaración mensual de la empresa (art. 6 LIVA)'
                  ELSE 'SAT · a más tardar el ' || cuentas_fecha_corta(cuentas_fecha_limite_sat(f.mes)) END,
      'monto', f.monto, 'mes', f.mes,
      'fecha_limite', CASE WHEN a_favor THEN NULL ELSE cuentas_fecha_limite_sat(f.mes) END,
      'a_favor', a_favor));
  END LOOP;
  IF (iva->>'pendiente')::double precision <> 0 OR (jsonb_array_length(iva->'filas') = 0 AND iva_neto <> 0) THEN
    a_favor := (iva->>'pendiente')::double precision < 0;
    cuando := CASE WHEN falta_cobrar AND falta_pagar THEN 'Al cobrar y al pagar' WHEN falta_pagar THEN 'Al pagar' ELSE 'Al cobrar' END;
    filas := filas || jsonb_build_array(jsonb_build_object(
      'concepto', 'iva', 'quien', CASE WHEN a_favor THEN 'IVA acreditable por aplicar' ELSE 'IVA a enterar' END,
      'sub', CASE WHEN a_favor THEN 'Se descuenta en el mes en que pagues' ELSE cuando END,
      'monto', (iva->>'pendiente')::double precision, 'mes', NULL, 'fecha_limite', NULL, 'a_favor', a_favor));
  END IF;

  ret_total := cuentas_js_round2(COALESCE((p_cierre->>'iva_retenido_total')::double precision, 0) + COALESCE((p_cierre->>'isr_retenido_total')::double precision, 0));
  ret := cuentas_cm_repartir(ret_total, retenciones_mes, falta_pagar);
  FOR f IN SELECT e->>'mes' AS mes, (e->>'monto')::double precision AS monto FROM jsonb_array_elements(ret->'filas') WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
    filas := filas || jsonb_build_array(jsonb_build_object(
      'concepto', 'retenciones', 'quien', 'Retenciones a enterar · ' || cuentas_mes_label(f.mes),
      'sub', 'SAT · a más tardar el ' || cuentas_fecha_corta(cuentas_fecha_limite_sat(f.mes)),
      'monto', f.monto, 'mes', f.mes, 'fecha_limite', cuentas_fecha_limite_sat(f.mes), 'a_favor', false));
  END LOOP;
  IF (ret->>'pendiente')::double precision <> 0 THEN
    filas := filas || jsonb_build_array(jsonb_build_object(
      'concepto', 'retenciones', 'quien', 'Retenciones a enterar', 'sub', '17 del mes siguiente al pago', 'monto', (ret->>'pendiente')::double precision,
      'mes', NULL, 'fecha_limite', NULL, 'a_favor', false));
  END IF;

  RETURN filas;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[̀-ͯ]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_proyecto  text := NULLIF(p->>'proyecto', '');
  v_result    jsonb;
BEGIN
  WITH
  -- #140: `ret_iva_cierre` = retención de IVA que cierra el cuadre. Con factura real es el residuo del Total del CFDI
  -- (neto + IVA − Total − ISR retenido) si cae dentro de la tolerancia del validador (max(0.01, 0.03 % del neto) + 0.03); sin
  -- factura (o fuera de tolerancia) es la estimada por régimen. La tolerancia espeja la de la factura (lib/validation).
  con AS MATERIALIZED (
    SELECT c.*,
           CASE WHEN c.tipo = 'pago'
                 AND abs(r.residuo - c.cierre_iva_retenido) <= greatest(0.01, 0.0003 * c.neto) + 0.03
                THEN r.residuo ELSE c.cierre_iva_retenido END AS ret_iva_cierre
    FROM cuentas_conceptos(v_anio, v_hoy) c
    CROSS JOIN LATERAL (SELECT round(c.neto + c.cierre_iva - c.total - c.cierre_isr_retenido, 2) AS residuo) r
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
           -- #99: antes de IVA (cobros) y neto (pagos).
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_neto,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.ret_iva_cierre), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.utilidad_proyecto) AS utilidad, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           EXISTS (SELECT 1 FROM proyectos hp WHERE hp.id = x.key AND hp.cuentas_historico_at IS NOT NULL) AS historico,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           -- #99: utilidad bruta con descuento (Σ utilidad_total).
           round(x.utilidad, 2) AS utilidad_bruta,
           round(greatest(0, round(x.utilidad, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.utilidad, 2) - round(greatest(0, round(x.utilidad, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto,
           -- #140: lo que es del SAT (IVA neto + retenciones) y el control del cuadre:
           -- cobrado con IVA = a transferir + SAT + utilidad antes de ISR; ≠ 0 señala una factura fuera de tolerancia o un dato roto.
           round(x.iva_proyecto - x.iva_pagado + x.iva_retenido_total + x.isr_retenido_total, 2) AS sat_total,
           round(x.cobros_total - x.pagos_total - (x.iva_proyecto - x.iva_pagado + x.iva_retenido_total + x.isr_retenido_total) - round(x.utilidad, 2), 2) AS cuadre_diferencia
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
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[̀-ͯ]', '', 'g')) END,
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
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto, 'historico', v.historico,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar,
                                           'cobros_sin_iva', v.cobros_sin_iva, 'pagos_neto', v.pagos_neto)
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
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_neto
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta,
           -- #99: flujo con IVA de los mismos proyectos que la utilidad (sin filtros de concepto).
           round(COALESCE(sum(cobros_total - pagos_total), 0), 2) AS flujo
    FROM alcance
  ),
  -- B6: proyecto abierto en el panel (antes se armaba en TypeScript, periodo.ts / seleccionarProyecto).
  -- Mismas reglas: conceptos que pasan el filtro, o todos si ninguno pasa; totales, cuentas y cierre
  -- salen de TODOS los conceptos del proyecto.
  sel AS MATERIALIZED (
    SELECT * FROM pj WHERE v_proyecto IS NOT NULL AND key = v_proyecto
  ),
  sel_todos AS MATERIALIZED (
    SELECT c.* FROM con c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_filtrados AS MATERIALIZED (
    SELECT c.* FROM fc c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_c AS MATERIALIZED (
    SELECT x.*, row_number() OVER (ORDER BY (x.tipo = 'pago'), (x.objetivo = 'cuenta'), x.concepto_creado, x.id) AS n
    FROM (SELECT * FROM sel_filtrados
          UNION ALL
          SELECT * FROM sel_todos WHERE NOT EXISTS (SELECT 1 FROM sel_filtrados)) x
  ),
  -- calcularCierreProyecto: un renglón por grupo de facturación o por cuenta suelta.
  sel_cierre AS (
    SELECT s.key,
           jsonb_build_object(
             'quien_cuanto_cuando', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'clave', t.id, 'proveedor_id', t.contraparte_id,
                        'proveedor_nombre', t.contraparte,
                        'regimen_fiscal', t.regimen_fiscal, 'neto', t.neto, 'iva_trasladado', t.cierre_iva,
                        'iva_retenido', t.ret_iva_cierre, 'isr_retenido', t.cierre_isr_retenido,
                        'total_a_transferir', t.total, 'total_es_snapshot', NOT t.total_estimado
                      ) ORDER BY (t.objetivo = 'cuenta'), t.concepto_creado, t.id)
               FROM sel_todos t WHERE t.tipo = 'pago'), '[]'::jsonb),
             'iva_retenido_total', s.iva_retenido_total, 'isr_retenido_total', s.isr_retenido_total,
             'iva_cobrado', s.iva_proyecto, 'iva_pagado', s.iva_pagado, 'iva_neto_a_enterar', s.iva_neto,
             'sat_total', s.sat_total, 'cuadre_diferencia', s.cuadre_diferencia,
             'utilidad_bruta', s.utilidad_bruta, 'isr_serenata_estimado', s.isr_serenata,
             'utilidad_neta', s.utilidad_neta, 'utilidad_libre_estimada', s.utilidad_neta
           ) AS cierre
    FROM sel s
  ),
  -- Entradas del cierre mensual: cobros con sus pagos vigentes y pagos a proveedor (total a transferir) por grupo o suelta.
  sel_cobros AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'total', t.total,
             'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', pc.monto) ORDER BY h.fecha_pago, h.created_at)
                                FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                WHERE pc.cuentas_cobrar_id = t.id::uuid AND h.anulado_at IS NULL), '[]'::jsonb)
           ) ORDER BY t.concepto_creado, t.id), '[]'::jsonb) AS j
    FROM sel_todos t WHERE t.tipo = 'cobro'
  ),
  sel_pagos AS (
    SELECT COALESCE(jsonb_object_agg(k.id, k.f), '{}'::jsonb) AS j
    FROM (
      SELECT p.grupo_id::text AS id,
             jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', p.monto_transferido) ORDER BY h.fecha_pago, h.created_at) AS f
      FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
      WHERE h.anulado_at IS NULL
        AND p.grupo_id = ANY (SELECT t.id::uuid FROM sel_todos t WHERE t.tipo = 'pago' AND t.objetivo = 'grupo')
      GROUP BY 1
    ) k
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
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar, 'sin_iva', c.cobros_sin_iva),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar, 'neto', c.pagos_neto),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta, 'flujo', t.flujo),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones, 2))
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
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
    ,
    'seleccionado', (
      SELECT jsonb_build_object(
        'id', s.key, 'nombre', s.nombre, 'cliente', s.cliente, 'fecha_entrega', s.fecha_entrega,
        'anio', s.anio, 'mes', s.mes, 'sin_fecha', s.sin_fecha, 'sin_proyecto', s.sin_proyecto, 'historico', s.historico,
        'cuentas', jsonb_build_object('cerradas', s.cerradas, 'reabiertas', s.reabierta, 'pendientes', s.pendientes,
                                      'hay_vencidos', s.hay_vencidos, 'fecha_cierre', s.fecha_cierre),
        'totales', jsonb_build_object('cobros_total', s.cobros_total, 'cobrado', s.cobrado, 'por_cobrar', s.por_cobrar,
                                      'pagos_total', s.pagos_total, 'pagado', s.pagado, 'por_pagar', s.por_pagar,
                                      'cobros_sin_iva', s.cobros_sin_iva, 'pagos_neto', s.pagos_neto),
        'conceptos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END
                 ) ORDER BY f.n) FROM sel_c f), '[]'::jsonb),
        'cierre', sc.cierre,
        'cierre_mensual', cuentas_cierre_mensual(sc.cierre, (SELECT j FROM sel_cobros), (SELECT j FROM sel_pagos))
      )
      FROM sel s JOIN sel_cierre sc ON sc.key = s.key
    )
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$function$;
