-- Frente 2 · A3 (docs/PLAN.md): las lecturas de Cuentas salen de la tabla.
--
-- cuentas_conceptos(p_year, p_hoy) es la entrada de cuentas_periodo,
-- cuentas_resumen, cuentas_avisos_items y cuentas_opciones. Deja de derivar
-- al vuelo (~250–330 ms por llamada) y lee cuentas_conceptos_base vía
-- cuentas_conceptos_leer, que recalcula lo que depende de la fecha (venc_dias,
-- vencido, paso_urgente) y el orden de proyectos. La tabla la mantienen
-- frescos los triggers de 20261010.
--
-- La derivación de referencia sigue en cuentas_conceptos_derivar;
-- cuentas_conceptos_diferencias compara la tabla contra ella (test live).
-- Misma firma y mismo resultado: los llamadores no cambian.

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
RETURNS TABLE (
  proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text,
  fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean,
  margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean,
  concepto_creado timestamptz, key text, tipo text, objetivo text, id text, proyecto_id text,
  cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer,
  total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text,
  fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric,
  venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean,
  complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric,
  utilidad_proyecto numeric, neto numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM cuentas_conceptos_leer(p_year, p_hoy);
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) TO service_role;

COMMIT;
