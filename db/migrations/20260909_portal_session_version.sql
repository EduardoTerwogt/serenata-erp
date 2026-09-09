-- Auditoría externa 2026-09-09 (Fase 2.5) -- las sesiones del Portal de
-- Proveedores duraban 60 días y no había forma de invalidar una cookie
-- firmada antes de que expirara (cambio de password, bloqueo de un
-- proveedor). session_version se guarda en la fila del proveedor y se
-- firma dentro del token; si no coinciden, la sesión ya no es válida sin
-- esperar a que expire. Se aprovecha para también rechazar sesiones de
-- proveedores con activo = false, que antes no se revisaba en absoluto.

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

-- La fusión de identidad del portal (confirmar_match_proveedor, Fase 1.2)
-- le copia credenciales nuevas a la fila del candidato -- eso cuenta como
-- cambio de credenciales, así que bumpea su session_version.
CREATE OR REPLACE FUNCTION public.confirmar_match_proveedor(p_proveedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo      record;
  v_candidato  record;
  v_out        jsonb;
BEGIN
  SELECT id, correo, password_hash, portal_estado, match_candidato_id
  INTO v_nuevo
  FROM proveedores
  WHERE id = p_proveedor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirmar_match_proveedor: proveedor % no existe', p_proveedor_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_nuevo.portal_estado IS DISTINCT FROM 'pendiente_confirmacion' OR v_nuevo.match_candidato_id IS NULL THEN
    RAISE EXCEPTION 'confirmar_match_proveedor: no hay match pendiente de confirmar para este proveedor'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, portal_estado, password_hash
  INTO v_candidato
  FROM proveedores
  WHERE id = v_nuevo.match_candidato_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirmar_match_proveedor: el candidato ya no existe'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_candidato.password_hash IS NOT NULL OR v_candidato.portal_estado = 'activo' THEN
    RAISE EXCEPTION 'confirmar_match_proveedor: el candidato ya tiene un portal activo'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE proveedor_documentos
  SET proveedor_id = v_candidato.id
  WHERE proveedor_id = v_nuevo.id;

  DELETE FROM proveedores WHERE id = v_nuevo.id;

  UPDATE proveedores
  SET correo = v_nuevo.correo,
      password_hash = v_nuevo.password_hash,
      portal_estado = 'activo',
      match_candidato_id = NULL,
      session_version = session_version + 1
  WHERE id = v_candidato.id
  RETURNING row_to_json(proveedores) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_match_proveedor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_match_proveedor(uuid) TO service_role;
