-- EF-3 3B-9: agregacion SQL de /api/cuentas/por-proyecto
--
-- La ruta traia proyectos+cuentas_cobrar+cuentas_pagar completos y
-- agrupaba/sumaba en Node (app/api/cuentas/por-proyecto/route.ts:29-72).
-- La RPC hace el agrupamiento/suma en SQL; la ruta pasa a ser 1 llamada.
--
-- jsonb_agg(t) sobre la fila completa del FROM (...) t arrastraria las
-- columnas auxiliares de orden (proyecto_id/proyecto_created_at) al JSON
-- final -- el jsonb_build_object externo reconstruye explicitamente solo
-- los 5 campos publicos, dejando las auxiliares unicamente dentro del
-- FROM (...) t para el ORDER BY.
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
      COALESCE((SELECT jsonb_agg(cp ORDER BY cp.created_at DESC, cp.id DESC) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), '[]'::jsonb) AS cuentas_pagar,
      ROUND(COALESCE((SELECT SUM(cc.monto_total) FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id), 0), 2) AS total_cobrar,
      ROUND(COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id), 0), 2) AS total_pagar
    FROM proyectos p
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar cc WHERE cc.proyecto_id = p.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.proyecto_id = p.id)
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_por_proyecto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_por_proyecto() TO service_role;
