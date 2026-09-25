-- Rediseño de Cuentas, B1b (docs/PLAN.md, H1, H2, S1, S2, T2, D25).
--
-- Hasta hoy `POST /api/cuentas-pagar/generar-orden-pago` hacía tres
-- escrituras sueltas: insertar la orden, marcar los grupos y marcar sus
-- hijas. No era atómico (dos clics simultáneos metían los mismos grupos en
-- dos órdenes, H1), las sueltas `PENDIENTE` entraban al PDF y al total sin
-- quedar marcadas (H2), y el total venía de un preview calculado antes de
-- bloquear nada (S2).
--
-- 1. `hoy_cdmx()`: "hoy" de negocio en hora de la Ciudad de México
--    (regla transversal 4 del plan).
-- 2. `cuentas_pagar_grupos_facturados_eventos_realizados()` (candidatos):
--    ahora solo devuelve lo que `generar_orden_pago` acepta:
--    - grupo `FACTURADO`, sin orden, con su factura XML `validado` (D25);
--    - suelta `PENDIENTE`, sin orden, **con proveedor asignado** (T2), con
--      factura XML `validado` (supuesto 9, D25) y con saldo.
--    El evento realizado se mide con `hoy_cdmx()` en vez de UTC.
-- 3. `generar_orden_pago(p_candidatos, p_pdf_url, p_pdf_nombre, p_usuario)`:
--    bloquea los candidatos, los revalida, compara su saldo con el monto
--    esperado que mandó la ruta (el mismo que imprimió en el PDF) y, en una
--    sola transacción, crea la orden, su desglose en
--    `ordenes_pago_conceptos` y marca grupos, hijas y sueltas.
--    `p_candidatos` = [{"tipo": "grupo" | "cuenta", "id": uuid,
--    "monto_esperado": numeric}, ...].
--    Errores explícitos (ERRCODE P1414) con prefijo en el mensaje:
--    - `candidatos_invalidos`: payload mal formado o repetido;
--    - `candidato_no_elegible`: ya está en otra orden, cambió de estado, no
--      tiene factura validada o no tiene proveedor;
--    - `candidatos_cambiaron`: su saldo ya no es el esperado.
--    Se acepta también un grupo `EN_PROCESO_PAGO` sin orden y con saldo
--    (pago parcial directo, supuesto 13): la RPC de candidatos todavía no lo
--    ofrece, pero B6 lo agrega sin cambiar esta firma.

BEGIN;

CREATE OR REPLACE FUNCTION public.hoy_cdmx()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'America/Mexico_City')::date;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.responsable_nombre, t.cotizacion_id), '[]'::jsonb)
  FROM (
    SELECT
      cp.*,
      jsonb_build_object('fecha_entrega', c.fecha_entrega, 'proyecto', c.proyecto) AS cotizaciones,
      CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('proyecto', p.proyecto) ELSE NULL END AS proyectos
    FROM cuentas_pagar cp
    JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE cp.grupo_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.id = cp.grupo_id
          AND g.estado = 'FACTURADO'
          AND g.orden_pago_id IS NULL
          AND EXISTS (
            SELECT 1 FROM documentos_cuentas_pagar d
            WHERE d.grupo_id = g.id
              AND d.tipo = 'FACTURA_PROVEEDOR_XML'
              AND d.estado_validacion = 'validado'
          )
      )
      -- Ninguna cuenta hermana del mismo grupo puede pertenecer a una
      -- cotización cuyo evento todavía no se realizó (decisión 011).
      AND NOT EXISTS (
        SELECT 1
        FROM cuentas_pagar cp2
        JOIN cotizaciones c2 ON c2.id = cp2.cotizacion_id
        WHERE cp2.grupo_id = cp.grupo_id
          AND (c2.fecha_entrega IS NULL OR c2.fecha_entrega > to_char(hoy_cdmx(), 'YYYY-MM-DD'))
      )

    UNION ALL

    SELECT
      cp.*,
      jsonb_build_object('fecha_entrega', c.fecha_entrega, 'proyecto', c.proyecto) AS cotizaciones,
      CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('proyecto', p.proyecto) ELSE NULL END AS proyectos
    FROM cuentas_pagar cp
    JOIN cotizaciones c ON c.id = cp.cotizacion_id
    LEFT JOIN proyectos p ON p.id = cp.proyecto_id
    WHERE cp.grupo_id IS NULL
      AND cp.estado = 'PENDIENTE'
      AND cp.orden_pago_id IS NULL
      AND cp.responsable_id IS NOT NULL
      AND cp.x_pagar - COALESCE(cp.monto_pagado, 0) > 0
      AND EXISTS (
        SELECT 1 FROM documentos_cuentas_pagar d
        WHERE d.cuentas_pagar_id = cp.id
          AND d.tipo = 'FACTURA_PROVEEDOR_XML'
          AND d.estado_validacion = 'validado'
      )
      AND c.fecha_entrega IS NOT NULL
      AND c.fecha_entrega <= to_char(hoy_cdmx(), 'YYYY-MM-DD')
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.generar_orden_pago(
  p_candidatos jsonb,
  p_pdf_url    text,
  p_pdf_nombre text,
  p_usuario    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cand        record;
  v_grupo       cuentas_pagar_grupos;
  v_cuenta      cuentas_pagar;
  v_saldo       numeric;
  v_total       numeric := 0;
  v_orden_id    uuid;
  v_grupo_ids   uuid[] := '{}';
  v_cuenta_ids  uuid[] := '{}';
  v_n           int;
BEGIN
  IF p_candidatos IS NULL OR jsonb_typeof(p_candidatos) <> 'array' OR jsonb_array_length(p_candidatos) = 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: la orden necesita al menos un candidato' USING ERRCODE = 'P1414';
  END IF;

  -- Forma del payload y duplicados, antes de bloquear nada.
  SELECT count(*) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e
  WHERE e->>'tipo' NOT IN ('grupo', 'cuenta')
     OR e->>'id' IS NULL
     OR e->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR jsonb_typeof(e->'monto_esperado') <> 'number'
     OR (e->>'monto_esperado')::numeric <= 0;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: % candidato(s) mal formados', v_n USING ERRCODE = 'P1414';
  END IF;

  SELECT count(*) - count(DISTINCT (e->>'tipo', e->>'id')) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: hay candidatos repetidos' USING ERRCODE = 'P1414';
  END IF;

  -- Grupos, en orden de id para que dos órdenes concurrentes bloqueen en el
  -- mismo orden y no se crucen (deadlock).
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
    WHERE e->>'tipo' = 'grupo'
    ORDER BY 1
  LOOP
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_cand.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % ya no existe', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_grupo.orden_pago_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % ya está en otra orden', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % está en estado %', v_cand.id, v_grupo.estado USING ERRCODE = 'P1414';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM documentos_cuentas_pagar d
      WHERE d.grupo_id = v_grupo.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
    ) THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % no tiene factura validada', v_cand.id USING ERRCODE = 'P1414';
    END IF;

    -- Las hijas se bloquean junto con el grupo: sus pagos (prorrateados por
    -- registrar_pago_grupo_factura) también bloquean el grupo primero.
    PERFORM 1 FROM cuentas_pagar WHERE grupo_id = v_grupo.id ORDER BY id FOR UPDATE;

    v_saldo := round(v_grupo.monto_total - COALESCE(v_grupo.monto_pagado, 0), 2);
    IF v_saldo <= 0 THEN
      RAISE EXCEPTION 'candidato_no_elegible: el grupo % no tiene saldo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF abs(v_saldo - round(v_cand.esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el saldo del grupo % es %, no %', v_cand.id, v_saldo, round(v_cand.esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;

    v_total := v_total + v_saldo;
    v_grupo_ids := v_grupo_ids || v_grupo.id;
  END LOOP;

  -- Sueltas (cuentas sin grupo), también en orden de id.
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
    WHERE e->>'tipo' = 'cuenta'
    ORDER BY 1
  LOOP
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_cand.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % ya no existe', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.grupo_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % pertenece a un grupo; se ordena el grupo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.orden_pago_id IS NOT NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % ya está en otra orden', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % está en estado %', v_cand.id, v_cuenta.estado USING ERRCODE = 'P1414';
    END IF;
    IF v_cuenta.responsable_id IS NULL THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene proveedor asignado', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM documentos_cuentas_pagar d
      WHERE d.cuentas_pagar_id = v_cuenta.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
    ) THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene factura validada', v_cand.id USING ERRCODE = 'P1414';
    END IF;

    v_saldo := round(v_cuenta.x_pagar - COALESCE(v_cuenta.monto_pagado, 0), 2);
    IF v_saldo <= 0 THEN
      RAISE EXCEPTION 'candidato_no_elegible: la cuenta % no tiene saldo', v_cand.id USING ERRCODE = 'P1414';
    END IF;
    IF abs(v_saldo - round(v_cand.esperado, 2)) > 0.005 THEN
      RAISE EXCEPTION 'candidatos_cambiaron: el saldo de la cuenta % es %, no %', v_cand.id, v_saldo, round(v_cand.esperado, 2)
        USING ERRCODE = 'P1414';
    END IF;

    v_total := v_total + v_saldo;
    v_cuenta_ids := v_cuenta_ids || v_cuenta.id;
  END LOOP;

  INSERT INTO ordenes_pago (fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by)
  VALUES (hoy_cdmx(), p_pdf_url, p_pdf_nombre, 'GENERADA', round(v_total, 2), COALESCE(NULLIF(p_usuario, ''), 'sistema'))
  RETURNING id INTO v_orden_id;

  -- Desglose inmutable (S1).
  INSERT INTO ordenes_pago_conceptos
    (orden_pago_id, grupo_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto)
  SELECT
    v_orden_id, g.id, g.responsable_id, pr.nombre, g.proyecto_id,
    (SELECT string_agg(DISTINCT cp.cotizacion_id, ',' ORDER BY cp.cotizacion_id) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
    round(g.monto_total - COALESCE(g.monto_pagado, 0), 2)
  FROM cuentas_pagar_grupos g
  LEFT JOIN proveedores pr ON pr.id = g.responsable_id
  WHERE g.id = ANY(v_grupo_ids);

  INSERT INTO ordenes_pago_conceptos
    (orden_pago_id, cuenta_pagar_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto)
  SELECT
    v_orden_id, cp.id, cp.responsable_id, cp.responsable_nombre, cp.proyecto_id, cp.cotizacion_id,
    round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2)
  FROM cuentas_pagar cp
  WHERE cp.id = ANY(v_cuenta_ids);

  -- Marcar grupos, sus hijas (las ya pagadas conservan PAGADO) y sueltas.
  UPDATE cuentas_pagar_grupos
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = CASE WHEN estado = 'PAGADO' THEN estado ELSE 'EN_PROCESO_PAGO' END,
         orden_pago_id = v_orden_id,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_cuenta_ids);

  RETURN jsonb_build_object(
    'orden_pago_id', v_orden_id,
    'total_monto', round(v_total, 2),
    'grupos', coalesce(array_length(v_grupo_ids, 1), 0),
    'cuentas', coalesce(array_length(v_cuenta_ids, 1), 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hoy_cdmx() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_orden_pago(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hoy_cdmx() TO service_role;
GRANT EXECUTE ON FUNCTION public.cuentas_pagar_grupos_facturados_eventos_realizados() TO service_role;
GRANT EXECUTE ON FUNCTION public.generar_orden_pago(jsonb, text, text, text) TO service_role;

COMMIT;
