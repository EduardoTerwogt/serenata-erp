-- EF-3 3B-12: agregacion SQL del resumen de documentos de proveedores
--
-- /api/proveedores/documentos-resumen traia TODAS las filas de
-- proveedor_documentos (proveedor_id, tipo, estado_validacion) sin limite y
-- cruzaba con getProveedores() en Node para calcular dos enteros
-- (incompleta, conErrores). Es un conteo -- no hace falta traer cada fila.
--
-- Preserva la semantica "duplicados no importan": completa se calcula via
-- COUNT(DISTINCT tr.tipo) sobre los tipos requeridos presentes (no cuenta
-- filas de documento una por una), con_error via EXISTS (no COUNT), y el
-- mismo filtro portal_estado IS NOT NULL.
CREATE OR REPLACE FUNCTION public.proveedor_documentos_resumen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tipos_requeridos AS (
    SELECT unnest(ARRAY['CONSTANCIA_SITUACION_FISCAL','INE','COMPROBANTE_DOMICILIO','COMPROBANTE_BANCARIO']) AS tipo
  ),
  por_proveedor AS (
    SELECT
      p.id,
      (SELECT COUNT(DISTINCT tr.tipo) FROM tipos_requeridos tr
       WHERE EXISTS (SELECT 1 FROM proveedor_documentos pd WHERE pd.proveedor_id = p.id AND pd.tipo = tr.tipo)
      ) = (SELECT COUNT(*) FROM tipos_requeridos) AS completa,
      EXISTS (SELECT 1 FROM proveedor_documentos pd WHERE pd.proveedor_id = p.id AND pd.estado_validacion = 'revision') AS con_error
    FROM proveedores p
    WHERE p.portal_estado IS NOT NULL
  )
  SELECT jsonb_build_object(
    'incompleta', COUNT(*) FILTER (WHERE NOT completa),
    'conErrores', COUNT(*) FILTER (WHERE con_error)
  )
  FROM por_proveedor;
$$;

REVOKE EXECUTE ON FUNCTION public.proveedor_documentos_resumen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proveedor_documentos_resumen() TO service_role;
