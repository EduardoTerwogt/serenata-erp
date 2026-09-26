-- Rediseño de Cuentas, B5 (docs/PLAN.md, A1, supuesto 17): adjuntar el
-- comprobante a un pago a proveedor ya registrado sin él ("Adjuntar" desde el
-- historial de pagos). El comprobante vive en el propio pago
-- (pagos_cuentas_pagar.comprobante_url, A1).
--
-- Solo llena un comprobante que falta: reemplazar uno existente es una
-- corrección y llega en B7 con proyecto reabierto. Un pago anulado no se toca.

BEGIN;

CREATE OR REPLACE FUNCTION public.adjuntar_comprobante_pago_proveedor(
  p_pago_id uuid,
  p_comprobante_url text,
  p_archivo_nombre text,
  p_usuario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pago pagos_cuentas_pagar;
BEGIN
  IF p_comprobante_url IS NULL OR btrim(p_comprobante_url) = '' THEN
    RAISE EXCEPTION 'comprobante_requerido: falta el enlace del comprobante' USING ERRCODE = 'P1413';
  END IF;

  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  IF v_pago.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'pago_anulado: el pago % está anulado', p_pago_id USING ERRCODE = 'P1413';
  END IF;
  IF v_pago.comprobante_url IS NOT NULL THEN
    RAISE EXCEPTION 'comprobante_existente: el pago % ya tiene comprobante', p_pago_id USING ERRCODE = 'P1413';
  END IF;

  UPDATE pagos_cuentas_pagar
     SET comprobante_url = p_comprobante_url,
         archivo_nombre = p_archivo_nombre
   WHERE id = p_pago_id;

  RETURN jsonb_build_object(
    'pago_id', p_pago_id,
    'grupo_id', v_pago.grupo_id,
    'cuenta_pagar_id', v_pago.cuenta_pagar_id,
    'comprobante_url', p_comprobante_url,
    'usuario', COALESCE(NULLIF(p_usuario, ''), 'sistema')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjuntar_comprobante_pago_proveedor(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjuntar_comprobante_pago_proveedor(uuid, text, text, text) TO service_role;

COMMIT;
