-- Bloque 1 de la iniciativa "Agrupar Cuentas por Pagar por proveedor+proyecto
-- para facturación" (docs/PLAN.md). Hoy `cuentas_pagar` es 1:1 por item de
-- cotización, así que un proveedor con varios items en el mismo proyecto
-- recibe una solicitud de factura por cada item por separado -- error de
-- negocio confirmado por el usuario. Esta migración crea la capa de
-- agrupación (`cuentas_pagar_grupos`) y la función de reconciliación que la
-- mantiene consistente. `cuentas_pagar` sigue siendo el ledger detallado por
-- item (trazabilidad, márgenes, reportes históricos intactos) -- el grupo es
-- una capa encima, no un reemplazo.
--
-- Esta migración NO toca ninguna ruta ni RPC existente todavía (approve_cotizacion,
-- subir-factura, registrar-pago, etc. siguen exactamente igual). Los puntos de
-- entrada que llaman a la función de este archivo se agregan en el Bloque 2.

CREATE TABLE IF NOT EXISTS cuentas_pagar_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
  responsable_id UUID NOT NULL REFERENCES proveedores(id),
  estado TEXT NOT NULL DEFAULT 'ABIERTO'
    CHECK (estado IN ('ABIERTO', 'FACTURADO', 'EN_PROCESO_PAGO', 'PAGADO')),
  monto_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_pagado NUMERIC(15,2) NOT NULL DEFAULT 0,
  orden_pago_id UUID NULL REFERENCES ordenes_pago(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantiza un único grupo ABIERTO activo por proveedor+proyecto a la vez --
-- es lo que hace segura la creación bajo concurrencia (dos cotizaciones
-- complementarias aprobándose casi al mismo tiempo para el mismo
-- proveedor+proyecto no pueden crear dos grupos ABIERTO).
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_pagar_grupos_abierto_unique
  ON cuentas_pagar_grupos (proyecto_id, responsable_id)
  WHERE estado = 'ABIERTO';

-- Todas las demás tablas del schema tienen RLS habilitado (sin policies --
-- el acceso siempre pasa por service_role en rutas server-side, el mismo
-- patrón que ya usa el repo). Sin esto, el linter de Supabase marca la tabla
-- como ERROR (rls_disabled_in_public) -- confirmado con get_advisors tras
-- aplicar esta migración a serenata-erp-test.
ALTER TABLE cuentas_pagar_grupos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_grupos_proyecto ON cuentas_pagar_grupos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_grupos_responsable ON cuentas_pagar_grupos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_grupos_orden_pago ON cuentas_pagar_grupos(orden_pago_id);

COMMENT ON TABLE cuentas_pagar_grupos IS 'Agrupa cuentas_pagar del mismo proveedor dentro del mismo proyecto para pedir/validar una sola factura y un solo pago sobre el total acumulado.';
COMMENT ON COLUMN cuentas_pagar_grupos.monto_total IS 'Caché de SUM(cuentas_pagar.x_pagar) de las cuentas del grupo -- recalculada en cada punto de escritura, nunca fuente de verdad independiente.';

-- `grupo_id` nullable siempre: una cuenta sin responsable_id (caso "Sin
-- asignar", real en el sistema) nunca tiene grupo -- sigue el flujo legacy
-- por item hasta que se le asigne un proveedor real.
ALTER TABLE cuentas_pagar
  ADD COLUMN IF NOT EXISTS grupo_id UUID NULL REFERENCES cuentas_pagar_grupos(id);

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_grupo ON cuentas_pagar(grupo_id);

-- documentos_cuentas_pagar pasa a poder colgar de un grupo en vez de una
-- cuenta individual. Los documentos ya existentes (facturas subidas
-- históricamente) no se tocan -- siguen con cuentas_pagar_id como hoy. Los
-- documentos nuevos de facturación agrupada (Bloque 3) siempre usan grupo_id.
ALTER TABLE documentos_cuentas_pagar
  ALTER COLUMN cuentas_pagar_id DROP NOT NULL;

ALTER TABLE documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS grupo_id UUID NULL REFERENCES cuentas_pagar_grupos(id);

ALTER TABLE documentos_cuentas_pagar
  ADD CONSTRAINT documentos_cuentas_pagar_cuenta_o_grupo_check
  CHECK (
    (cuentas_pagar_id IS NOT NULL AND grupo_id IS NULL)
    OR (cuentas_pagar_id IS NULL AND grupo_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_documentos_cp_grupo ON documentos_cuentas_pagar(grupo_id);

-- Función única de reconciliación: dado el estado actual de una cuenta_pagar
-- (proyecto_id, responsable_id), hace que su pertenencia a cuentas_pagar_grupos
-- sea consistente. La llaman approve_cotizacion (Bloque 2, cuentas nuevas) y
-- reasignar_responsable_cuenta_pagar (Bloque 2, reasignación de proveedor).
--
-- Regla crítica: cuando el grupo viejo de una cuenta ya no está ABIERTO (ya
-- tiene una factura o un pago real), esta función hace RAISE EXCEPTION en vez
-- de devolver un jsonb de error. Es deliberado: reasignar_responsable_cuenta_pagar
-- (Bloque 2) escribe items_cotizacion y cuentas_pagar ANTES de llamar a esta
-- función, dentro de la misma transacción -- un jsonb de error no revertiría
-- esas escrituras previas, solo RAISE EXCEPTION hace que Postgres revierta
-- todo. Código custom P1412 (distinto del P1411 que ya usa
-- operation_id_cruzado en registrar_pago_cuenta_pagar) para que la ruta lo
-- distinga y responda 409.
CREATE OR REPLACE FUNCTION reconcile_cuenta_pagar_grupo(p_cuenta_pagar_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuenta        cuentas_pagar;
  v_grupo_actual  cuentas_pagar_grupos;
  v_grupo_id      UUID;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar % no encontrada', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;

  -- Sin proveedor: no se agrupa. Si tenía grupo antes (reasignación a "Sin
  -- asignar"), se limpia -- el grupo viejo se recalcula/borra si queda vacío.
  IF v_cuenta.responsable_id IS NULL THEN
    IF v_cuenta.grupo_id IS NOT NULL THEN
      SELECT * INTO v_grupo_actual FROM cuentas_pagar_grupos WHERE id = v_cuenta.grupo_id FOR UPDATE;
      UPDATE cuentas_pagar SET grupo_id = NULL WHERE id = p_cuenta_pagar_id;
      UPDATE cuentas_pagar_grupos SET
        monto_total = (SELECT COALESCE(SUM(x_pagar), 0) FROM cuentas_pagar WHERE grupo_id = v_grupo_actual.id),
        updated_at = now()
      WHERE id = v_grupo_actual.id;
      DELETE FROM cuentas_pagar_grupos
      WHERE id = v_grupo_actual.id AND estado = 'ABIERTO'
        AND NOT EXISTS (SELECT 1 FROM cuentas_pagar WHERE grupo_id = v_grupo_actual.id);
    END IF;
    RETURN jsonb_build_object('grupo_id', NULL);
  END IF;

  IF v_cuenta.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo_actual FROM cuentas_pagar_grupos WHERE id = v_cuenta.grupo_id FOR UPDATE;

    -- Ya está en el grupo correcto: solo refrescar monto_total (caché, nunca
    -- fuente de verdad -- se recalcula cada vez que se toca el grupo).
    IF v_grupo_actual.proyecto_id = v_cuenta.proyecto_id
       AND v_grupo_actual.responsable_id = v_cuenta.responsable_id THEN
      UPDATE cuentas_pagar_grupos SET
        monto_total = (SELECT COALESCE(SUM(x_pagar), 0) FROM cuentas_pagar WHERE grupo_id = v_grupo_actual.id),
        updated_at = now()
      WHERE id = v_grupo_actual.id;
      RETURN jsonb_build_object('grupo_id', v_grupo_actual.id);
    END IF;

    -- El proveedor (o el proyecto) cambió: la cuenta ya no corresponde a su
    -- grupo actual. Si ese grupo YA tiene una factura/pago real (no está
    -- ABIERTO), no se puede reubicar en silencio -- ver comentario de arriba.
    IF v_grupo_actual.estado <> 'ABIERTO' THEN
      RAISE EXCEPTION 'grupo_no_abierto: cuenta % pertenece a un grupo en estado %', p_cuenta_pagar_id, v_grupo_actual.estado
        USING ERRCODE = 'P1412';
    END IF;

    -- Sacar del grupo viejo (aún ABIERTO) y recalcular su total
    UPDATE cuentas_pagar SET grupo_id = NULL WHERE id = p_cuenta_pagar_id;
    UPDATE cuentas_pagar_grupos SET
      monto_total = (SELECT COALESCE(SUM(x_pagar), 0) FROM cuentas_pagar WHERE grupo_id = v_grupo_actual.id),
      updated_at = now()
    WHERE id = v_grupo_actual.id;
    -- Si quedó vacío, se borra (evita grupos ABIERTO fantasma con 0 cuentas)
    DELETE FROM cuentas_pagar_grupos
    WHERE id = v_grupo_actual.id AND estado = 'ABIERTO'
      AND NOT EXISTS (SELECT 1 FROM cuentas_pagar WHERE grupo_id = v_grupo_actual.id);
  END IF;

  -- Buscar o crear el grupo ABIERTO para el (proyecto_id, responsable_id) actual
  INSERT INTO cuentas_pagar_grupos (proyecto_id, responsable_id)
  VALUES (v_cuenta.proyecto_id, v_cuenta.responsable_id)
  ON CONFLICT (proyecto_id, responsable_id) WHERE estado = 'ABIERTO' DO NOTHING
  RETURNING id INTO v_grupo_id;

  IF v_grupo_id IS NULL THEN
    SELECT id INTO v_grupo_id FROM cuentas_pagar_grupos
    WHERE proyecto_id = v_cuenta.proyecto_id AND responsable_id = v_cuenta.responsable_id AND estado = 'ABIERTO';
  END IF;

  UPDATE cuentas_pagar SET grupo_id = v_grupo_id WHERE id = p_cuenta_pagar_id;
  UPDATE cuentas_pagar_grupos SET
    monto_total = (SELECT COALESCE(SUM(x_pagar), 0) FROM cuentas_pagar WHERE grupo_id = v_grupo_id),
    updated_at = now()
  WHERE id = v_grupo_id;

  RETURN jsonb_build_object('grupo_id', v_grupo_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_cuenta_pagar_grupo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reconcile_cuenta_pagar_grupo(UUID) TO service_role;
