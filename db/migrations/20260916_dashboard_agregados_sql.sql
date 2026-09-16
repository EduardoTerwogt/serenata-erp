-- EF-3 3B-10 (F13): agregados SQL del Dashboard ejecutivo, reemplazando
-- las 4 lecturas de tabla completa que hoy trae getResumenDashboard() para
-- luego sumar/contar en Node (getCuentasCobrar/getCuentasPagar/
-- getCotizaciones/getProyectos, lib/server/repositories/dashboard.ts).
-- getPagosComprobantesEnRango() (ingresos por periodo) queda fuera de
-- alcance: ya filtra server-side por rango, no es una lectura de tabla
-- completa. Redondeo: mismo criterio que calcularSaldoPendiente()+round2()
-- (lib/server/cuentas/status.ts, lib/server/shared/decimal.ts) -- política
-- canónica de 3B-1, ROUND(numeric,2) de Postgres.

-- KPIs de cuentas: por_cobrar (cuentas_cobrar) y por_pagar (cuentas_pagar),
-- ambos "GREATEST(saldo,0)" por fila antes de sumar -- mismo criterio que
-- calcularSaldoPendiente().
CREATE OR REPLACE FUNCTION public.dashboard_kpis_cuentas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'por_cobrar', (
      SELECT ROUND(COALESCE(SUM(GREATEST(ROUND(cc.monto_total - COALESCE(cc.monto_pagado, 0), 2), 0)), 0), 2)
      FROM cuentas_cobrar cc
      WHERE cc.estado <> 'PAGADO'
    ),
    'por_pagar', (
      SELECT ROUND(COALESCE(SUM(GREATEST(ROUND(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2), 0)), 0), 2)
      FROM cuentas_pagar cp
      WHERE cp.estado <> 'PAGADO'
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_cuentas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis_cuentas() TO service_role;

-- Egresos por bucket (cuentas_pagar liquidadas, fecha_pago en rango) --
-- p_buckets es el array de {label,inicio,fin} que bucketsDePeriodo() ya
-- arma en orden cronológico ascendente; el cliente lee el ÚLTIMO elemento
-- del array de salida como el periodo vigente, así que WITH ORDINALITY +
-- ORDER BY explícito son obligatorios (jsonb_array_elements() no garantiza
-- que el orden de salida respete el del array de entrada). Ingresos por
-- bucket se queda calculado en JS desde getPagosComprobantesEnRango() --
-- ya eficiente, fuera de alcance de este bloque.
CREATE OR REPLACE FUNCTION public.dashboard_egresos_por_bucket(p_buckets jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      (
        SELECT ROUND(COALESCE(SUM(cp.x_pagar), 0), 2)
        FROM cuentas_pagar cp
        WHERE cp.estado = 'PAGADO'
          AND cp.fecha_pago >= (b.value ->> 'inicio')::timestamptz
          AND cp.fecha_pago < (b.value ->> 'fin')::timestamptz
      )
      ORDER BY b.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(p_buckets) WITH ORDINALITY AS b(value, ordinality);
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_egresos_por_bucket(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_egresos_por_bucket(jsonb) TO service_role;

-- Conteo de cotizaciones del periodo actual por estado -- alimenta tanto
-- kpis.cotizacionesAprobadas/cotizacionesBorrador como
-- actividad.cotizacionesAprobadas (hoy la misma variable de JS reusada dos
-- veces, dashboard.ts:244-245,270).
CREATE OR REPLACE FUNCTION public.dashboard_actividad_cotizaciones(p_inicio date, p_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'aprobadas', COUNT(*) FILTER (WHERE estado = 'APROBADA'),
    'borrador', COUNT(*) FILTER (WHERE estado = 'BORRADOR')
  )
  FROM cotizaciones
  WHERE created_at >= p_inicio::timestamptz AND created_at < p_fin::timestamptz;
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_actividad_cotizaciones(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_actividad_cotizaciones(date, date) TO service_role;

-- Proyectos creados en el periodo + proyectos en curso (arrancados antes
-- del periodo, sin cierre real) -- mismo criterio que dashboard.ts:247-250.
CREATE OR REPLACE FUNCTION public.dashboard_actividad_proyectos(p_inicio date, p_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'creados', (
      SELECT COUNT(*) FROM proyectos
      WHERE created_at >= p_inicio::timestamptz AND created_at < p_fin::timestamptz
    ),
    'en_curso', (
      SELECT COUNT(*) FROM proyectos
      WHERE fecha_inicio_real IS NOT NULL
        AND fecha_inicio_real < p_inicio
        AND fecha_cierre_real IS NULL
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_actividad_proyectos(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_actividad_proyectos(date, date) TO service_role;

-- Top 6 cotizaciones más recientes -- ORDER BY explícito dentro de la
-- subconsulta Y en el jsonb_agg externo (un agregado no hereda el orden de
-- su subconsulta sin su propia cláusula ORDER BY, mismo patrón que
-- buscar_cuentas_pagar/buscar_cotizaciones).
CREATE OR REPLACE FUNCTION public.dashboard_cotizaciones_recientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb)
  FROM (
    SELECT id, proyecto, cliente, total, estado, created_at
    FROM cotizaciones
    ORDER BY created_at DESC, id DESC
    LIMIT 6
  ) t;
$$;
REVOKE EXECUTE ON FUNCTION public.dashboard_cotizaciones_recientes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_cotizaciones_recientes() TO service_role;
