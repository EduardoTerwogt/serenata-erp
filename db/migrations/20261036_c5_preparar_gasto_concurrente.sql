-- #130 (C5): preparar_grupo_factura_proveedor es segura en concurrencia para el gasto extra. La revisión "¿ya existe este
-- operation_id?" y el INSERT no eran atómicos: dos envíos simultáneos pasaban los dos la revisión y el segundo chocaba con
-- cuentas_pagar_operation_id_key (23505, error crudo) en vez de responder repetido. Se serializa por operation_id con un
-- advisory lock de transacción. Solo CREATE OR REPLACE (sin DROP): misma firma, mismos permisos.
BEGIN;

CREATE OR REPLACE FUNCTION public.preparar_grupo_factura_proveedor(
  p_proveedor_id uuid, p_proveedor jsonb, p_renglones uuid[], p_gasto jsonb, p_usuario text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prov      proveedores;
  v_creado    boolean := false;
  v_rfc       text;
  v_regimen   text;
  v_campo     text;
  v_existente uuid;
  v_n         integer;
  v_proyectos text[];
  v_proyecto  text;
  v_r         record;
  v_extra     cuentas_pagar;
  v_grupo     uuid;
  v_mov       integer := 0;
  v_concepto  text;
  v_costo     numeric;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operacion_requerida: falta el identificador de la operación' USING ERRCODE = 'P1415';
  END IF;
  v_n := COALESCE(array_length(p_renglones, 1), 0);
  IF (v_n > 0) = (p_gasto IS NOT NULL) THEN
    RAISE EXCEPTION 'destino_requerido: elige renglones o registra un gasto extra, no ambos ni ninguno' USING ERRCODE = 'P1415';
  END IF;
  IF p_proveedor_id IS NULL AND p_proveedor IS NULL THEN
    RAISE EXCEPTION 'proveedor_requerido: elige un proveedor o captura sus datos' USING ERRCODE = 'P1415';
  END IF;

  -- Repetición del mismo envío (doble clic, reintento tras un corte): el gasto extra ya existe.
  IF p_gasto IS NOT NULL THEN
    -- Dos envíos simultáneos con el mismo operation_id (doble clic) se serializan aquí: el segundo espera a que el primero
    -- confirme y entonces encuentra la fila, en vez de chocar con el índice único (23505).
    PERFORM pg_advisory_xact_lock(hashtextextended('gasto_op:' || p_operation_id::text, 0));
    SELECT * INTO v_extra FROM cuentas_pagar WHERE operation_id = p_operation_id;
    IF FOUND THEN
      RETURN jsonb_build_object('proveedor_id', v_extra.responsable_id, 'proveedor_creado', false, 'proyecto_id', v_extra.proyecto_id,
                                'grupo_id', v_extra.grupo_id, 'cuenta_extra_id', v_extra.id, 'reasignados', 0, 'repetido', true);
    END IF;
  END IF;

  -- Proveedor: el elegido o uno nuevo con los datos mínimos (Q3).
  IF p_proveedor_id IS NOT NULL THEN
    SELECT * INTO v_prov FROM proveedores WHERE id = p_proveedor_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proveedor_no_encontrado: %', p_proveedor_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_rfc := upper(btrim(COALESCE(p_proveedor->>'rfc', '')));
    IF v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
      RAISE EXCEPTION 'rfc_invalido: el RFC no tiene la estructura de un RFC' USING ERRCODE = 'P1415';
    END IF;
    v_regimen := lower(btrim(COALESCE(p_proveedor->>'regimen_fiscal', '')));
    IF v_regimen NOT IN ('moral', 'fisica', 'resico') THEN
      RAISE EXCEPTION 'regimen_invalido: el régimen debe ser moral, fisica o resico' USING ERRCODE = 'P1415';
    END IF;
    FOREACH v_campo IN ARRAY ARRAY['nombre', 'telefono', 'correo', 'banco'] LOOP
      IF NULLIF(btrim(COALESCE(p_proveedor->>v_campo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'proveedor_incompleto: falta %', v_campo USING ERRCODE = 'P1415';
      END IF;
    END LOOP;
    IF btrim(p_proveedor->>'correo') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'correo_invalido: el correo no tiene la forma de un correo' USING ERRCODE = 'P1415';
    END IF;
    IF regexp_replace(COALESCE(p_proveedor->>'clabe', ''), '[[:space:]]', '', 'g') !~ '^[0-9]{18}$' THEN
      RAISE EXCEPTION 'clabe_invalida: la CLABE debe tener 18 dígitos' USING ERRCODE = 'P1415';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('proveedor_rfc:' || v_rfc, 0));
    SELECT id INTO v_existente FROM proveedores WHERE rfc = v_rfc LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'proveedor_existente: %', v_existente USING ERRCODE = 'P1413';
    END IF;
    INSERT INTO proveedores (nombre, telefono, correo, banco, clabe, rfc, regimen_fiscal, roles, activo)
    VALUES (btrim(p_proveedor->>'nombre'), btrim(p_proveedor->>'telefono'), btrim(p_proveedor->>'correo'), btrim(p_proveedor->>'banco'),
            regexp_replace(p_proveedor->>'clabe', '[[:space:]]', '', 'g'), v_rfc, v_regimen, '{}', true)
    RETURNING * INTO v_prov;
    v_creado := true;
  END IF;

  IF v_n > 0 THEN
    -- Renglones de un solo proyecto.
    SELECT array_agg(DISTINCT x.proyecto_id) INTO v_proyectos FROM cuentas_pagar x WHERE x.id = ANY(p_renglones);
    IF v_proyectos IS NULL THEN
      RAISE EXCEPTION 'renglon_no_encontrado: los renglones elegidos ya no existen' USING ERRCODE = 'P0002';
    END IF;
    IF array_length(v_proyectos, 1) <> 1 THEN
      RAISE EXCEPTION 'proyectos_distintos: una factura de proveedor es de un solo proyecto' USING ERRCODE = 'P1415';
    END IF;
    v_proyecto := v_proyectos[1];

    PERFORM 1 FROM cuentas_pagar_grupos g
    WHERE g.id IN (SELECT x.grupo_id FROM cuentas_pagar x WHERE x.id = ANY(p_renglones) AND x.grupo_id IS NOT NULL)
       OR (g.proyecto_id = v_proyecto AND g.responsable_id = v_prov.id AND g.estado = 'ABIERTO')
    ORDER BY g.id FOR UPDATE;
    PERFORM 1 FROM cuentas_pagar x WHERE x.id = ANY(p_renglones) ORDER BY x.id FOR UPDATE;
    IF (SELECT count(*) FROM cuentas_pagar WHERE id = ANY(p_renglones)) <> (SELECT count(DISTINCT u) FROM unnest(p_renglones) u) THEN
      RAISE EXCEPTION 'renglon_no_encontrado: alguno de los renglones elegidos ya no existe' USING ERRCODE = 'P0002';
    END IF;

    FOR v_r IN
      SELECT x.id, x.monto_pagado, g.estado, g.orden_pago_id
      FROM cuentas_pagar x LEFT JOIN cuentas_pagar_grupos g ON g.id = x.grupo_id
      WHERE x.id = ANY(p_renglones) ORDER BY x.id
    LOOP
      IF v_r.estado IS NOT NULL AND v_r.estado <> 'ABIERTO' THEN
        RAISE EXCEPTION 'grupo_no_abierto: el renglón % ya está en un grupo facturado o en pago', v_r.id USING ERRCODE = 'P1412';
      END IF;
      IF COALESCE(v_r.monto_pagado, 0) > 0 OR v_r.orden_pago_id IS NOT NULL THEN
        RAISE EXCEPTION 'renglon_bloqueado: el renglón % tiene pagos o está en una orden de pago', v_r.id USING ERRCODE = 'P1413';
      END IF;
    END LOOP;

    FOR v_r IN
      SELECT x.id, x.item_id, x.responsable_id, pa.nombre AS anterior
      FROM cuentas_pagar x LEFT JOIN proveedores pa ON pa.id = x.responsable_id
      WHERE x.id = ANY(p_renglones) AND x.responsable_id IS DISTINCT FROM v_prov.id ORDER BY x.id
    LOOP
      PERFORM reasignar_responsable_cuenta_pagar(v_r.id, v_prov.id);
      IF v_r.item_id IS NOT NULL THEN
        INSERT INTO historial_cambios_responsable_item (item_id, cotizacion_id, responsable_anterior_id, responsable_anterior_nombre,
                                                        responsable_nuevo_id, responsable_nuevo_nombre, changed_by)
        SELECT i.id, i.cotizacion_id, v_r.responsable_id, v_r.anterior, v_prov.id, v_prov.nombre, p_usuario
        FROM items_cotizacion i WHERE i.id = v_r.item_id;
      END IF;
      v_mov := v_mov + 1;
    END LOOP;
    SELECT x.grupo_id INTO v_grupo FROM cuentas_pagar x WHERE x.id = p_renglones[1];
  ELSE
    -- Gasto extra: cuenta sin renglón en la cotización principal aprobada del proyecto (Q5, Q10).
    v_proyecto := btrim(COALESCE(p_gasto->>'proyecto_id', ''));
    v_concepto := btrim(COALESCE(p_gasto->>'concepto', ''));
    IF COALESCE(p_gasto->>'costo_total', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'gasto_invalido: el costo debe ser un monto mayor a cero' USING ERRCODE = 'P1415';
    END IF;
    v_costo := round((p_gasto->>'costo_total')::numeric, 2);
    IF v_proyecto = '' OR v_concepto = '' OR v_costo <= 0 THEN
      RAISE EXCEPTION 'gasto_invalido: faltan el proyecto, el concepto o el costo' USING ERRCODE = 'P1415';
    END IF;
    PERFORM 1 FROM cotizaciones c
    WHERE c.id = v_proyecto AND c.es_complementaria_de IS NULL AND c.estado = 'APROBADA' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proyecto_sin_cotizacion_aprobada: el proyecto % no tiene una cotización principal aprobada', v_proyecto USING ERRCODE = 'P1413';
    END IF;
    PERFORM 1 FROM cuentas_pagar_grupos g
    WHERE g.proyecto_id = v_proyecto AND g.responsable_id = v_prov.id AND g.estado = 'ABIERTO' FOR UPDATE;
    INSERT INTO cuentas_pagar (cotizacion_id, proyecto_id, responsable_id, item_id, costo_total, concepto, operation_id)
    VALUES (v_proyecto, v_proyecto, v_prov.id, NULL, v_costo, v_concepto, p_operation_id)
    RETURNING * INTO v_extra;
    v_grupo := (reconcile_cuenta_pagar_grupo(v_extra.id)->>'grupo_id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'proveedor_id', v_prov.id, 'proveedor_nombre', v_prov.nombre, 'proveedor_creado', v_creado,
    'proyecto_id', v_proyecto, 'grupo_id', v_grupo, 'cuenta_extra_id', v_extra.id, 'reasignados', v_mov,
    'monto_total', (SELECT g.monto_total FROM cuentas_pagar_grupos g WHERE g.id = v_grupo), 'repetido', false);
END;
$function$;


REVOKE EXECUTE ON FUNCTION public.preparar_grupo_factura_proveedor(uuid, jsonb, uuid[], jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_grupo_factura_proveedor(uuid, jsonb, uuid[], jsonb, text, uuid) TO service_role;

COMMIT;
