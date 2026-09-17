-- Bloque 6 de la iniciativa de agrupación de Cuentas por Pagar
-- (docs/PLAN.md). La vista "Por proyecto" (app/components/cuentas/CuentasPorProyecto.tsx)
-- tiene el mismo problema que la vista "Lista": dentro de cada proyecto,
-- la sub-tabla "Por pagar" muestra un renglón por item de cotización en
-- vez de uno por proveedor. A diferencia de la Lista (que ahora usa
-- buscar_cuentas_pagar_grupos, con paginación/búsqueda server-side reales),
-- aquí cada proyecto ya carga su arreglo completo de cuentas_pagar de una
-- vez -- agrupar por grupo_id es trivial en JS (mismo patrón que
-- GrupoFacturacionCard/TabInformacion.tsx), así que esta migración solo
-- agrega el contexto de grupo que faltaba a cada item (grupo_id ya existía
-- como columna propia de cuentas_pagar desde el Bloque 1, así que
-- jsonb_agg(cp) ya lo incluía -- lo que faltaba es el estado/monto_total/
-- monto_pagado del GRUPO, que vive en otra tabla y nunca se joineaba aquí).
-- Sin esto, agrupar en JS solo por grupo_id daría totales correctos (suma
-- de x_pagar/monto_pagado de los items) pero nunca podría distinguir un
-- grupo ABIERTO de uno FACTURADO -- ambos casos, el estado a nivel item
-- sigue siendo 'PENDIENTE'.
CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'proyecto', t.proyecto,
        'cuentas_cobrar', t.cuentas_cobrar,
        'cuentas_pagar', t.cuentas_pagar,
        'total_cobrar', t.total_cobrar,
        'total_pagar', t.total_pagar
      )
      ORDER BY t.proyecto_created_at DESC, t.proyecto_id DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      p.id AS proyecto_id,
      p.created_at AS proyecto_created_at,
      jsonb_build_object('id', p.id, 'folio', p.id, 'nombre', p.proyecto, 'cliente', p.cliente, 'estado', p.estado) AS proyecto,
      COALESCE((SELECT jsonb_agg(cc ORDER BY cc.created_at DESC, cc.id DESC) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), '[]'::jsonb) AS cuentas_cobrar,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(cp) || jsonb_build_object(
            'grupo_estado', g.estado,
            'grupo_monto_total', g.monto_total,
            'grupo_monto_pagado', g.monto_pagado
          )
          ORDER BY cp.created_at DESC, cp.id DESC
        )
        FROM cuentas_pagar cp
        LEFT JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
        WHERE cp.proyecto_id = p.id
      ), '[]'::jsonb) AS cuentas_pagar,
      ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
      ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar
    FROM proyectos p
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto() TO service_role;
