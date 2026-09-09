-- Auditoría externa 2026-09-09 (Fase 1.2) -- account takeover en el Portal
-- de Proveedores. app/api/portal/signup/confirmar/route.ts confiaba en un
-- `candidato_id` enviado por el navegador para decidir a qué proveedor
-- existente fusionar la sesión (correo + password_hash del signup se
-- copiaban sobre esa fila). Cualquiera podía mandar el uuid de OTRO
-- proveedor -- descubrible via /api/portal/documentos, que ya lo devuelve
-- al cliente durante el matching -- y terminar controlando el login de ese
-- proveedor.
--
-- Esta RPC hace la fusión atómica leyendo `match_candidato_id` desde la
-- propia fila del proveedor autenticado (nunca de un parámetro del
-- cliente), bloqueando ambas filas con FOR UPDATE y validando estados
-- antes de tocar nada.

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
  -- 1. Bloquear la fila de la sesión (el signup) y validar que en verdad
  --    tiene un match pendiente de confirmar.
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

  -- 2. Bloquear el candidato -- el que ofreció el propio servidor durante
  --    el matching, nunca uno que decida el cliente en este request.
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

  -- 3. Reasignar documentos del signup al candidato que sobrevive.
  UPDATE proveedor_documentos
  SET proveedor_id = v_candidato.id
  WHERE proveedor_id = v_nuevo.id;

  -- 4. Borrar la fila temporal del signup (mismo orden que el código JS
  --    que reemplaza: antes de copiar el correo, para no violar el índice
  --    único de correo+password_hash mientras ambas filas coexisten).
  DELETE FROM proveedores WHERE id = v_nuevo.id;

  -- 5. Copiar credenciales al candidato.
  UPDATE proveedores
  SET correo = v_nuevo.correo,
      password_hash = v_nuevo.password_hash,
      portal_estado = 'activo',
      match_candidato_id = NULL
  WHERE id = v_candidato.id
  RETURNING row_to_json(proveedores) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_match_proveedor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_match_proveedor(uuid) TO service_role;
