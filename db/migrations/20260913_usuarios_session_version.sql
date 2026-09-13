-- EF-2 1B-2a: revocación de sesión de staff, espejo del diseño ya probado
-- para el Portal (20260909_portal_session_version.sql). session_version
-- se guarda en la fila del usuario y se firma dentro del JWT (1B-2b); si
-- no coinciden, la sesión ya no es válida sin esperar a que expire.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

-- admin_update_usuario: única vía para que el panel de administración
-- modifique un usuario de staff -- reemplaza el UPDATE directo que hacía
-- `updateUsuario()` desde app/api/admin/usuarios/[id]/route.ts. Bumpea
-- session_version en la misma transacción cuando cambia active, sections,
-- password_hash o email (los 4 campos que invalidan una sesión ya
-- emitida) -- solo `name` puede cambiar sin invalidar ninguna sesión.
--
-- p_updates es un objeto JSON que solo trae las claves que realmente
-- cambian (mismo contrato que updateUsuario() en TypeScript) -- se usa
-- presencia de clave (p_updates ? 'active'), no COALESCE, para distinguir
-- "no tocar este campo" de "poner explícitamente false/vacío".
--
-- Devuelve exactamente las mismas columnas que updateUsuario() devuelve
-- hoy (nunca password_hash): id, email, name, sections, active, created_at.
CREATE OR REPLACE FUNCTION public.admin_update_usuario(p_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual    record;
  v_name      text;
  v_email     text;
  v_sections  text[];
  v_active    boolean;
  v_password  text;
  v_bump      boolean := false;
  v_out       jsonb;
BEGIN
  SELECT id, name, email, sections, active, password_hash
  INTO v_actual
  FROM usuarios
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_update_usuario: usuario % no existe', p_id
      USING ERRCODE = 'P0001';
  END IF;

  v_name := CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE v_actual.name END;
  v_email := CASE WHEN p_updates ? 'email' THEN p_updates->>'email' ELSE v_actual.email END;
  v_sections := CASE WHEN p_updates ? 'sections'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'sections'))
    ELSE v_actual.sections END;
  v_active := CASE WHEN p_updates ? 'active' THEN (p_updates->>'active')::boolean ELSE v_actual.active END;
  v_password := CASE WHEN p_updates ? 'password_hash' THEN p_updates->>'password_hash' ELSE v_actual.password_hash END;

  IF v_active IS DISTINCT FROM v_actual.active
     OR v_sections IS DISTINCT FROM v_actual.sections
     OR v_password IS DISTINCT FROM v_actual.password_hash
     OR v_email IS DISTINCT FROM v_actual.email THEN
    v_bump := true;
  END IF;

  UPDATE usuarios
  SET name = v_name,
      email = v_email,
      sections = v_sections,
      active = v_active,
      password_hash = v_password,
      session_version = session_version + CASE WHEN v_bump THEN 1 ELSE 0 END
  WHERE id = p_id
  RETURNING jsonb_build_object(
    'id', id,
    'email', email,
    'name', name,
    'sections', sections,
    'active', active,
    'created_at', created_at
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_usuario(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_usuario(uuid, jsonb) TO service_role;
