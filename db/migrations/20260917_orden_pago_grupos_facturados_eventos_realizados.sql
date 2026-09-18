-- Bloque 3 de la iniciativa de agrupación de Cuentas por Pagar
-- (docs/PLAN.md). Reemplaza la fuente de datos de "generar-orden-pago":
-- antes eran cuentas_pagar individuales en PENDIENTE con evento ya
-- realizado (cuentas_pagar_pendientes_eventos_realizados,
-- db/migrations/20260914_cuentas_pagar_pendientes_eventos_realizados.sql).
--
-- Caso nuevo: cuentas que pertenecen a un grupo FACTURADO, donde
-- **todas** las cotizaciones que le aportan items a ese grupo (la
-- principal y cualquier complementaria) deben tener su evento ya
-- realizado -- el grupo es una sola obligación conjunta, no se paga
-- parcialmente porque una complementaria todavía no se realiza (regla de
-- negocio confirmada con el usuario).
--
-- Caso legacy (UNION ALL): cuentas SIN grupo_id -- el Bloque 3 no debe
-- dejar inalcanzable lo que ya era pagable antes de esta iniciativa. Entre
-- que este bloque se mergea y que el Bloque 5 corre la migración
-- retroactiva, cualquier cuenta_pagar PENDIENTE preexistente todavía no
-- tiene grupo_id -- sin este caso, esas cuentas quedarían invisibles para
-- generar-orden-pago hasta que el Bloque 5 corra. Mismo criterio exacto
-- que el mecanismo anterior (PENDIENTE + evento realizado), incluye
-- también las cuentas sin responsable_id ("Sin asignar") tal como ya
-- hacía buildOrdenPagoPreview (agrupa bajo 'sin_responsable').
--
-- Mismo shape de salida que cuentas_pagar_pendientes_eventos_realizados()
-- (cp.* + cotizaciones/proyectos anidados) para que buildOrdenPagoPreview
-- (lib/server/ordenes-pago/build.ts) siga funcionando sin cambios.
CREATE OR REPLACE FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados()
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
    WHERE cp.grupo_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.id = cp.grupo_id AND g.estado = 'FACTURADO'
      )
      -- Ninguna cuenta hermana del mismo grupo puede pertenecer a una
      -- cotización cuyo evento todavía no se realizó.
      AND NOT EXISTS (
        SELECT 1
        FROM cuentas_pagar cp2
        JOIN cotizaciones c2 ON c2.id = cp2.cotizacion_id
        WHERE cp2.grupo_id = cp.grupo_id
          AND (c2.fecha_entrega IS NULL OR c2.fecha_entrega > to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'))
      )

    UNION ALL

    SELECT
      cp.*,
      jsonb_build_object('fecha_entrega', c.fecha_entrega, 'proyecto', c.proyecto) AS cotizaciones,
      CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('proyecto', p.proyecto) ELSE NULL END AS proyectos
    FROM cuentas_pagar cp
    JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE cp.grupo_id IS NULL
      AND cp.estado = 'PENDIENTE'
      AND c.fecha_entrega IS NOT NULL
      AND c.fecha_entrega <= to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados() TO service_role;
