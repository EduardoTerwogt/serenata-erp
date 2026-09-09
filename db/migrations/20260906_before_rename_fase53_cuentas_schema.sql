-- Migration: fase53_cuentas_schema
-- Purpose: Fase 5.3 (Cuentas) -- Bloque 1: esquema.
--   1. cuentas_cobrar.proyecto_id, simétrico al que ya existe en cuentas_pagar.
--   2. estado_validacion en documentos_cuentas_cobrar/documentos_cuentas_pagar.
--   3. Corrige el CHECK de documentos_cuentas_cobrar.tipo (faltaba
--      'COMPLEMENTO_PAGO_PDF', ya en el enum de TypeScript).
--   4. Tabla historial_cambios_responsable_item (log append-only).
--
-- Aplicado a producción (fwmyoqokcjtldiofuxdg) el 2026-09-06 vía
-- mcp__Supabase__apply_migration, con confirmación explícita del usuario.
-- Verificado post-aplicación: 19/19 filas de cuentas_cobrar con proyecto_id
-- resuelto, documentos con estado_validacion='pendiente', tabla nueva vacía
-- con RLS habilitado (mismo patrón sin políticas que el resto del proyecto,
-- ver 20260422_enable_rls_all_tables.sql). Advisories de seguridad
-- revisados: ninguno nuevo introducido por esta migración.
--
-- Todo dentro de una transacción: si algo falla, no se aplica nada.

BEGIN;

-- ============================================================
-- 1. cuentas_cobrar.proyecto_id
-- ============================================================

ALTER TABLE cuentas_cobrar
  ADD COLUMN IF NOT EXISTS proyecto_id TEXT NULL REFERENCES proyectos(id);

COMMENT ON COLUMN cuentas_cobrar.proyecto_id IS
  'FK a proyectos.id. Resuelto desde la cotización: es_complementaria_de si es COMPLEMENTARIA, si no cotizacion_id (la PRINCIPAL comparte id con su proyecto). Simétrico a cuentas_pagar.proyecto_id.';

-- Backfill de filas existentes usando la misma regla que ya usa approve_cotizacion
-- para calcular v_proyecto_id.
UPDATE cuentas_cobrar cc
SET proyecto_id = COALESCE(c.es_complementaria_de, c.id)
FROM cotizaciones c
WHERE c.id = cc.cotizacion_id
  AND cc.proyecto_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_proyecto_id ON cuentas_cobrar(proyecto_id);

-- Actualiza approve_cotizacion para que el upsert de cuentas_cobrar incluya
-- proyecto_id, reutilizando v_proyecto_id que la función ya calcula.
-- (Cuerpo idéntico al vigente en producción salvo esta columna.)
CREATE OR REPLACE FUNCTION public.approve_cotizacion(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cotizacion        record;
  v_proyecto          record;
  v_items             record;
  v_es_complementaria boolean;
  v_proyecto_id       text;
  v_cuentas_pagar     jsonb := '[]'::jsonb;
  v_cuenta_cobrar     jsonb;
BEGIN
  -- 1. Cargar cotización con bloqueo para evitar aprobaciones concurrentes
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion % no encontrada', p_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotencia: ya aprobada → retornar sin tocar nada
  IF v_cotizacion.estado = 'APROBADA' THEN
    RETURN jsonb_build_object(
      'already_approved', true,
      'cotizacion_id',    p_id
    );
  END IF;

  -- 3. Determinar si es complementaria
  v_es_complementaria := (
    v_cotizacion.tipo = 'COMPLEMENTARIA' AND
    v_cotizacion.es_complementaria_de IS NOT NULL
  );

  -- 4. Proyecto
  IF v_es_complementaria THEN
    -- Para complementaria: el proyecto ya debe existir
    SELECT * INTO v_proyecto
    FROM proyectos
    WHERE id = v_cotizacion.es_complementaria_de;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proyecto base % no encontrado para cotizacion complementaria %',
        v_cotizacion.es_complementaria_de, p_id
        USING ERRCODE = 'P0002';
    END IF;

    v_proyecto_id := v_proyecto.id;
  ELSE
    -- Para principal: upsert del proyecto
    INSERT INTO proyectos (id, cliente, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.cliente,
      v_cotizacion.proyecto,
      v_cotizacion.fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente       = EXCLUDED.cliente,
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  -- 5. Borrar cuentas_pagar anteriores de esta cotización y recrearlas
  DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;

  INSERT INTO cuentas_pagar (
    cotizacion_id, proyecto_id, item_id,
    responsable_nombre, responsable_id,
    item_descripcion, cantidad, x_pagar, margen,
    estado
  )
  SELECT
    p_id,
    v_proyecto_id,
    i.id,
    COALESCE(i.responsable_nombre, 'Sin asignar'),
    i.responsable_id,
    i.descripcion,
    i.cantidad,
    i.x_pagar,
    i.margen,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.x_pagar > 0;

  -- Capturar cuentas_pagar creadas para retornarlas
  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- 6. Upsert cuenta_cobrar (ahora con proyecto_id)
  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, proyecto, monto_total, estado, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    'FACTURA_PENDIENTE',
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    proyecto    = EXCLUDED.proyecto,
    monto_total = EXCLUDED.monto_total,
    proyecto_id = EXCLUDED.proyecto_id
  RETURNING row_to_json(cuentas_cobrar) INTO v_cuenta_cobrar;

  -- 7. Marcar cotización como APROBADA
  UPDATE cotizaciones SET estado = 'APROBADA' WHERE id = p_id;

  RETURN jsonb_build_object(
    'already_approved', false,
    'cotizacion_id',    p_id,
    'proyecto_id',      v_proyecto_id,
    'cuentas_pagar',    COALESCE(v_cuentas_pagar, '[]'::jsonb),
    'cuenta_cobrar',    v_cuenta_cobrar
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

-- ============================================================
-- 2. estado_validacion en documentos_cuentas_cobrar / documentos_cuentas_pagar
-- ============================================================

ALTER TABLE documentos_cuentas_cobrar
  ADD COLUMN IF NOT EXISTS estado_validacion TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN ('pendiente', 'validado', 'revision'));

ALTER TABLE documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS estado_validacion TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN ('pendiente', 'validado', 'revision'));

COMMENT ON COLUMN documentos_cuentas_cobrar.estado_validacion IS
  'pendiente (aún no revisado) | validado (coincide con la cuenta) | revision (discrepancia detectada). Mismo vocabulario que el badge de CuentasScreen.jsx.';
COMMENT ON COLUMN documentos_cuentas_pagar.estado_validacion IS
  'pendiente (aún no revisado) | validado (coincide con la cuenta) | revision (discrepancia detectada). Mismo vocabulario que el badge de CuentasScreen.jsx.';

-- Corrige el CHECK de tipo en documentos_cuentas_cobrar: falta COMPLEMENTO_PAGO_PDF
-- (ya está en el enum de TypeScript, lib/types.ts:199).
ALTER TABLE documentos_cuentas_cobrar DROP CONSTRAINT documentos_cuentas_cobrar_tipo_check;
ALTER TABLE documentos_cuentas_cobrar ADD CONSTRAINT documentos_cuentas_cobrar_tipo_check
  CHECK (tipo IN ('FACTURA_PDF', 'FACTURA_XML', 'COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF', 'OTRO'));

-- ============================================================
-- 3. historial_cambios_responsable_item (log append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS historial_cambios_responsable_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items_cotizacion(id),
  cotizacion_id TEXT NOT NULL REFERENCES cotizaciones(id),
  responsable_anterior_id UUID NULL REFERENCES responsables(id),
  responsable_anterior_nombre TEXT NULL,
  responsable_nuevo_id UUID NULL REFERENCES responsables(id),
  responsable_nuevo_nombre TEXT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_historial_cambios_resp_item_id ON historial_cambios_responsable_item(item_id);
CREATE INDEX IF NOT EXISTS idx_historial_cambios_resp_cotizacion_id ON historial_cambios_responsable_item(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_historial_cambios_resp_changed_at ON historial_cambios_responsable_item(changed_at DESC);

COMMENT ON TABLE historial_cambios_responsable_item IS
  'Log append-only de reasignaciones de responsable en items_cotizacion. Nunca se borra ni reconstruye. No confundir con historial_responsable (snapshot de historial de proyectos por responsable, tabla distinta que no se toca).';

ALTER TABLE historial_cambios_responsable_item ENABLE ROW LEVEL SECURITY;
-- Sin políticas adicionales, mismo patrón que 20260422_enable_rls_all_tables.sql:
-- todo el acceso va por supabaseAdmin (service_role), que bypasea RLS.

COMMIT;
