-- Bloque 3 (docs/PLAN.md): clasifica cada fila existente con `cliente` texto
-- en 3 cubetas (safe_match/ambiguous/no_match) ANTES de escribir cualquier
-- cliente_id -- ver docs/decisions/014-cliente-id-fk-clasificacion.md para
-- el diseño completo y el hallazgo de Paso 0. Solo `safe_match` se asigna
-- automáticamente. Reproducible desde Postgres vacío (CI): clientes vacía
-- -> todo clasifica no_match, sin error.
BEGIN;

CREATE OR REPLACE FUNCTION _clasificar_cliente_texto(p_texto text)
RETURNS TABLE(clasificacion text, cliente_id_asignado uuid, candidatos jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_exactos uuid[];
  v_fuzzy jsonb;
BEGIN
  SELECT array_agg(id) INTO v_exactos FROM clientes WHERE lower(trim(nombre)) = lower(trim(p_texto));

  IF v_exactos IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'score', similarity(c.nombre, p_texto)) ORDER BY similarity(c.nombre, p_texto) DESC)
    INTO v_fuzzy FROM clientes c WHERE similarity(c.nombre, p_texto) > 0.35 LIMIT 5;

    IF v_fuzzy IS NULL THEN
      RETURN QUERY SELECT 'no_match', NULL::uuid, '[]'::jsonb;
    ELSE
      RETURN QUERY SELECT 'ambiguous', NULL::uuid, v_fuzzy;
    END IF;
  ELSIF array_length(v_exactos, 1) = 1 THEN
    RETURN QUERY SELECT 'safe_match', v_exactos[1], jsonb_build_array(jsonb_build_object('id', v_exactos[1], 'nombre', p_texto, 'score', 1.0));
  ELSE
    RETURN QUERY SELECT 'ambiguous', NULL::uuid, (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'score', 1.0)) FROM clientes c WHERE c.id = ANY(v_exactos));
  END IF;
END;
$$;

INSERT INTO cliente_id_backfill_clasificacion (tabla, fila_id, cliente_texto, clasificacion, cliente_id_asignado, candidatos)
SELECT 'cotizaciones', c.id, c.cliente, r.clasificacion, r.cliente_id_asignado, r.candidatos
FROM cotizaciones c, LATERAL _clasificar_cliente_texto(c.cliente) r WHERE c.cliente_id IS NULL;

INSERT INTO cliente_id_backfill_clasificacion (tabla, fila_id, cliente_texto, clasificacion, cliente_id_asignado, candidatos)
SELECT 'proyectos', p.id, p.cliente, r.clasificacion, r.cliente_id_asignado, r.candidatos
FROM proyectos p, LATERAL _clasificar_cliente_texto(p.cliente) r WHERE p.cliente_id IS NULL;

INSERT INTO cliente_id_backfill_clasificacion (tabla, fila_id, cliente_texto, clasificacion, cliente_id_asignado, candidatos)
SELECT 'cuentas_cobrar', cc.id::text, cc.cliente, r.clasificacion, r.cliente_id_asignado, r.candidatos
FROM cuentas_cobrar cc, LATERAL _clasificar_cliente_texto(cc.cliente) r WHERE cc.cliente_id IS NULL;

INSERT INTO cliente_id_backfill_clasificacion (tabla, fila_id, cliente_texto, clasificacion, cliente_id_asignado, candidatos)
SELECT 'historial_responsable', hr.id::text, hr.cliente, r.clasificacion, r.cliente_id_asignado, r.candidatos
FROM historial_responsable hr, LATERAL _clasificar_cliente_texto(hr.cliente) r WHERE hr.cliente_id IS NULL;

-- Aplicar SOLO safe_match.
UPDATE cotizaciones c SET cliente_id = b.cliente_id_asignado FROM cliente_id_backfill_clasificacion b WHERE b.tabla = 'cotizaciones' AND b.fila_id = c.id AND b.clasificacion = 'safe_match';
UPDATE proyectos p SET cliente_id = b.cliente_id_asignado FROM cliente_id_backfill_clasificacion b WHERE b.tabla = 'proyectos' AND b.fila_id = p.id AND b.clasificacion = 'safe_match';
UPDATE cuentas_cobrar cc SET cliente_id = b.cliente_id_asignado FROM cliente_id_backfill_clasificacion b WHERE b.tabla = 'cuentas_cobrar' AND b.fila_id = cc.id::text AND b.clasificacion = 'safe_match';
UPDATE historial_responsable hr SET cliente_id = b.cliente_id_asignado FROM cliente_id_backfill_clasificacion b WHERE b.tabla = 'historial_responsable' AND b.fila_id = hr.id::text AND b.clasificacion = 'safe_match';

DROP FUNCTION _clasificar_cliente_texto(text);

COMMIT;
