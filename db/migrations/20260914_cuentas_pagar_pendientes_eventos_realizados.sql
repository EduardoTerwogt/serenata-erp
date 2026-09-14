-- EF-3 3B-8: RPC de eventos realizados pendientes (columnas reales)
--
-- getCuentasPagarPendientesEventosRealizados() (lib/server/repositories/
-- cuentas-pagar.ts) filtraba fecha_entrega<=hoy en JS despues de traer
-- TODAS las cuentas PENDIENTE con joins. Unico caller confirmado:
-- app/api/cuentas-pagar/generar-orden-pago/route.ts.
--
-- NOTA DE ESQUEMA (verificado contra information_schema, no asumido):
-- cotizaciones.fecha_entrega es TEXT ('YYYY-MM-DD'), no date -- el JS
-- actual compara como string ISO (comparacion lexicografica, equivalente
-- a orden cronologico solo porque el formato es fijo). Comparar contra
-- (now())::date directo fallaria en Postgres (text <= date no tiene
-- operador). Se compara texto contra texto (to_char) para paridad exacta
-- con el comportamiento actual, sin castear una columna que puede tener
-- valores no parseables como date.
CREATE OR REPLACE FUNCTION public.cuentas_pagar_pendientes_eventos_realizados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.responsable_nombre, t.cotizacion_id), '[]'::jsonb)
  FROM (
    SELECT
      cp.*,
      jsonb_build_object('fecha_entrega', c.fecha_entrega, 'proyecto', c.proyecto) AS cotizaciones,
      CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('proyecto', p.proyecto) ELSE NULL END AS proyectos
    FROM cuentas_pagar cp
    JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE cp.estado = 'PENDIENTE'
      AND c.fecha_entrega IS NOT NULL
      AND c.fecha_entrega <= to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_pendientes_eventos_realizados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_pagar_pendientes_eventos_realizados() TO service_role;
