-- Bloque 2 de la iniciativa "Agrupar Cuentas por Pagar por proveedor+proyecto
-- para facturación" (docs/PLAN.md). Cierra un hueco real confirmado en el
-- código: app/api/items/[id]/route.ts reasigna el proveedor de un item
-- (incluso DESPUÉS de que la cotización ya está APROBADA) con un
-- `.update()` directo sobre items_cotizacion y cuentas_pagar, sin RPC ni
-- guard de ningún tipo -- a diferencia de patch_item_cotizacion, que sí
-- tiene guard pero no toca cuentas_pagar.
--
-- Con cuentas_pagar_grupos, reasignar el proveedor de una cuenta cuyo grupo
-- ya tiene una factura/pago real (no está ABIERTO) dejaría
-- cuenta.responsable_id != grupo.responsable_id si se permitiera en
-- silencio. Esta RPC hace ambas escrituras (items_cotizacion +
-- cuentas_pagar) y la reconciliación del grupo DENTRO de una sola
-- transacción: si reconcile_cuenta_pagar_grupo() hace RAISE EXCEPTION
-- (código P1412, ver 20260917_cuentas_pagar_grupos.sql) porque el grupo
-- viejo ya no está ABIERTO, Postgres revierte también las dos escrituras
-- anteriores de esta misma función -- no solo la reconciliación.

CREATE OR REPLACE FUNCTION reasignar_responsable_cuenta_pagar(
  p_cuenta_pagar_id uuid,
  p_responsable_id uuid,
  p_responsable_nombre text,
  p_telefono text,
  p_correo text,
  p_clabe text,
  p_banco text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuenta cuentas_pagar;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar % no encontrada', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;

  -- cuentas_pagar.item_id es TEXT (quirk preexistente del schema) mientras
  -- que items_cotizacion.id es UUID -- cast explícito, la comparación
  -- directa sin cast no resuelve en Postgres.
  IF v_cuenta.item_id IS NOT NULL THEN
    UPDATE items_cotizacion SET
      responsable_id = p_responsable_id,
      responsable_nombre = p_responsable_nombre
    WHERE id = v_cuenta.item_id::uuid;
  END IF;

  UPDATE cuentas_pagar SET
    responsable_id = p_responsable_id,
    responsable_nombre = COALESCE(p_responsable_nombre, 'Sin asignar'),
    telefono = p_telefono,
    correo = p_correo,
    clabe = p_clabe,
    banco = p_banco
  WHERE id = p_cuenta_pagar_id;

  -- Si esto hace RAISE EXCEPTION (P1412), revierte TODO lo de arriba.
  RETURN reconcile_cuenta_pagar_grupo(p_cuenta_pagar_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION reasignar_responsable_cuenta_pagar(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reasignar_responsable_cuenta_pagar(uuid, uuid, text, text, text, text, text) TO service_role;
