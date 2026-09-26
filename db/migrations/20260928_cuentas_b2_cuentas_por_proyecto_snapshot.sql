-- Rediseño de Cuentas, B2 (docs/PLAN.md, H10): cuentas_por_proyecto() expone
-- el snapshot del grupo (grupo_total_a_transferir, grupo_monto_transferido)
-- para que calcularCierreProyecto use el Total del CFDI cuando hay factura
-- validada. Las sueltas ya lo traen vía to_jsonb(cp). Cambio aditivo: la UI
-- actual ignora los campos nuevos. B3 extiende esta función con p_year.

CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'proyecto', t.proyecto,
        'cuentas_cobrar', t.cuentas_cobrar,
        'cuentas_pagar', t.cuentas_pagar,
        'total_cobrar', t.total_cobrar,
        'total_pagar', t.total_pagar,
        'margen_total_proyecto', t.margen_total_proyecto,
        'fee_agencia_proyecto', t.fee_agencia_proyecto,
        'utilidad_total_proyecto', t.utilidad_total_proyecto,
        'iva_total_proyecto', t.iva_total_proyecto
      )
      ORDER BY t.proyecto_created_at DESC, t.proyecto_id DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      p.id AS proyecto_id,
      p.created_at AS proyecto_created_at,
      jsonb_build_object('id', p.id, 'folio', p.id, 'nombre', p.proyecto, 'cliente', p.cliente, 'cliente_id', p.cliente_id, 'estado', p.estado) AS proyecto,
      COALESCE((SELECT jsonb_agg(cc ORDER BY cc.created_at DESC, cc.id DESC) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), '[]'::jsonb) AS cuentas_cobrar,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(cp) || jsonb_build_object(
            'grupo_estado', g.estado,
            'grupo_monto_total', g.monto_total,
            'grupo_monto_pagado', g.monto_pagado,
            'grupo_total_a_transferir', g.total_a_transferir,
            'grupo_monto_transferido', g.monto_transferido,
            'proveedor_regimen_fiscal', pr.regimen_fiscal
          )
          ORDER BY cp.created_at DESC, cp.id DESC
        )
        FROM cuentas_pagar cp
        LEFT JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
        LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
        WHERE cp.proyecto_id = p.id
      ), '[]'::jsonb) AS cuentas_pagar,
      ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
      ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar,
      ROUND(COALESCE((SELECT SUM(c.margen_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS margen_total_proyecto,
      ROUND(COALESCE((SELECT SUM(c.fee_agencia) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS fee_agencia_proyecto,
      ROUND(COALESCE((SELECT SUM(c.utilidad_total) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS utilidad_total_proyecto,
      ROUND(COALESCE((SELECT SUM(c.iva) FROM cotizaciones c WHERE c.estado = 'APROBADA' AND (c.id = p.id OR c.es_complementaria_de = p.id)), 0), 2) AS iva_total_proyecto
    FROM proyectos p
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
  ) t;
$$;
