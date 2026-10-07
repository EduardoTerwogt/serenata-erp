-- #130 (C2): propuesta de renglones para una factura de proveedor. Dado el subtotal (neto) del XML y la tolerancia
-- de Admin → Datos fiscales, devuelve los proyectos cuyos renglones "por asignar" (sin proveedor) suman ese neto.
-- Solo propone (el usuario revisa y elige); la validación fiscal sigue siendo la del grupo. El total CFDI = subtotal +
-- IVA − retenciones del mismo XML, así que comparar el neto da la misma respuesta sin repetir la fórmula fiscal.
-- Sin búsqueda de subconjuntos: el conjunto completo de "por asignar" de un proyecto, o nada.
BEGIN;

CREATE OR REPLACE FUNCTION public.propuesta_renglones_factura(p_subtotal numeric, p_tolerancia numeric DEFAULT 1.00)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'proyecto_id', x.proyecto_id, 'proyecto', p.proyecto, 'renglones', to_jsonb(x.ids), 'neto', x.neto
         ) ORDER BY abs(x.neto - p_subtotal), x.proyecto_id), '[]'::jsonb)
  FROM (
    SELECT cp.proyecto_id, array_agg(cp.id ORDER BY cp.id) AS ids, round(sum(cp.costo_total), 2) AS neto
    FROM cuentas_pagar cp
    WHERE cp.responsable_id IS NULL AND cp.item_id IS NOT NULL
    GROUP BY cp.proyecto_id
  ) x
  JOIN proyectos p ON p.id = x.proyecto_id
  WHERE p_subtotal > 0 AND abs(x.neto - p_subtotal) <= GREATEST(COALESCE(p_tolerancia, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.propuesta_renglones_factura(numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propuesta_renglones_factura(numeric, numeric) TO service_role;

COMMIT;
