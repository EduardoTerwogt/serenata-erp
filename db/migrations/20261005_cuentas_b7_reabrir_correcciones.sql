-- Rediseño de Cuentas, B7 (docs/PLAN.md, D5, D6, H12, R8, S12, T7;
-- supuestos 1, 10 y 21): reabrir, volver a cerrar y correcciones.
--
-- 1. Tablas: cuentas_reaperturas (una activa por proyecto; quién, cuándo y
--    motivo obligatorio) y cuentas_correcciones (bitácora de cada
--    corrección). RLS activo sin políticas, como el resto: solo service_role.
-- 2. Columnas (H12): anulación en pagos_comprobantes (motivo obligatorio,
--    igual en pagos_cuentas_pagar) y baja lógica con reemplazo en
--    documentos_cuentas_cobrar / documentos_cuentas_pagar.
-- 3. Reabrir / volver a cerrar. Que las cuentas estén cerradas o ya sin
--    pendientes (valores derivados, D17) lo valida la ruta con la misma
--    derivación que la pantalla; la RPC solo registra.
-- 4-7. Correcciones, cada una una RPC atómica que exige el proyecto
--    reabierto (cuentas_reapertura_activa) y deja registro: anular pagos de
--    cobro y de proveedor, quitar o reemplazar documentos, editar fechas y
--    notas, y reasignar el proveedor de un concepto ya pagado (S12). Admin
--    lo valida la ruta (requireSection('admin')) y pasa p_usuario.
--    Anular es idempotente por pago (anular dos veces devuelve el estado
--    actual), así que no pasa por pago_operations: su CHECK de dominio no
--    cambia.
-- 8. Todo lo que lee el documento vigente o suma pagos ignora bajas y
--    anulados: registrar_pago_* (R8), validar_factura_proveedor,
--    generar_orden_pago, cuentas_orden_candidatos, la lectura cruda
--    (cuentas_por_proyecto) y la derivación (cuentas_conceptos,
--    cuentas_periodo), que además marcan las cuentas reabiertas.
--    cancel_cotizacion no cambia: un pago anulado sigue bloqueando la
--    cancelación, así nunca se borra su registro.

BEGIN;

-- ── 1. Reaperturas y bitácora ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cuentas_reaperturas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id  text NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  motivo       text NOT NULL CHECK (btrim(motivo) <> ''),
  abierta_por  text NOT NULL,
  abierta_at   timestamptz NOT NULL DEFAULT now(),
  cerrada_por  text,
  cerrada_at   timestamptz,
  CONSTRAINT cuentas_reaperturas_cierre_check CHECK ((cerrada_at IS NULL) = (cerrada_por IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_reaperturas_activa_unique
  ON public.cuentas_reaperturas (proyecto_id) WHERE cerrada_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cuentas_correcciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reapertura_id  uuid NOT NULL REFERENCES public.cuentas_reaperturas(id) ON DELETE CASCADE,
  proyecto_id    text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('anular_pago', 'quitar_documento', 'reemplazar_documento',
                                               'editar_datos', 'editar_pago', 'reasignar_proveedor')),
  objetivo       text NOT NULL CHECK (objetivo IN ('cobro', 'grupo', 'cuenta')),
  objetivo_id    uuid NOT NULL,
  motivo         text,
  detalle        jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_correcciones_proyecto ON public.cuentas_correcciones (proyecto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cuentas_correcciones_reapertura ON public.cuentas_correcciones (reapertura_id);

ALTER TABLE public.cuentas_reaperturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_correcciones ENABLE ROW LEVEL SECURITY;

-- ── 2. Anulación y baja lógica (H12) ──────────────────────────────────────
ALTER TABLE public.pagos_comprobantes
  ADD COLUMN IF NOT EXISTS anulado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por    text,
  ADD COLUMN IF NOT EXISTS anulado_motivo text;
ALTER TABLE public.pagos_comprobantes DROP CONSTRAINT IF EXISTS pagos_comprobantes_anulado_check;
ALTER TABLE public.pagos_comprobantes ADD CONSTRAINT pagos_comprobantes_anulado_check
  CHECK (anulado_at IS NULL OR (anulado_motivo IS NOT NULL AND btrim(anulado_motivo) <> ''));
ALTER TABLE public.pagos_cuentas_pagar DROP CONSTRAINT IF EXISTS pagos_cuentas_pagar_anulado_check;
ALTER TABLE public.pagos_cuentas_pagar ADD CONSTRAINT pagos_cuentas_pagar_anulado_check
  CHECK (anulado_at IS NULL OR (anulado_motivo IS NOT NULL AND btrim(anulado_motivo) <> ''));

ALTER TABLE public.documentos_cuentas_cobrar
  ADD COLUMN IF NOT EXISTS eliminado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS eliminado_por    text,
  ADD COLUMN IF NOT EXISTS eliminado_motivo text,
  ADD COLUMN IF NOT EXISTS reemplazado_por  uuid REFERENCES public.documentos_cuentas_cobrar(id) ON DELETE SET NULL;
ALTER TABLE public.documentos_cuentas_cobrar DROP CONSTRAINT IF EXISTS documentos_cuentas_cobrar_eliminado_check;
ALTER TABLE public.documentos_cuentas_cobrar ADD CONSTRAINT documentos_cuentas_cobrar_eliminado_check
  CHECK (eliminado_at IS NULL OR (eliminado_motivo IS NOT NULL AND btrim(eliminado_motivo) <> ''));

ALTER TABLE public.documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS eliminado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS eliminado_por    text,
  ADD COLUMN IF NOT EXISTS eliminado_motivo text,
  ADD COLUMN IF NOT EXISTS reemplazado_por  uuid REFERENCES public.documentos_cuentas_pagar(id) ON DELETE SET NULL;
ALTER TABLE public.documentos_cuentas_pagar DROP CONSTRAINT IF EXISTS documentos_cuentas_pagar_eliminado_check;
ALTER TABLE public.documentos_cuentas_pagar ADD CONSTRAINT documentos_cuentas_pagar_eliminado_check
  CHECK (eliminado_at IS NULL OR (eliminado_motivo IS NOT NULL AND btrim(eliminado_motivo) <> ''));

-- ── 3. Reabrir y volver a cerrar (D5, D6, supuesto 10) ────────────────────
-- Guarda de toda corrección: el proyecto tiene una reapertura activa. La
-- bloquea FOR SHARE, así "Volver a cerrar" (FOR UPDATE) espera a que la
-- corrección en curso termine y nunca cierra a media corrección.
CREATE OR REPLACE FUNCTION public.cuentas_reapertura_activa(p_proyecto_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'proyecto_no_reabierto: una cuenta sin proyecto no tiene reapertura' USING ERRCODE = 'P1416';
  END IF;
  SELECT id INTO v_id FROM cuentas_reaperturas
  WHERE proyecto_id = p_proyecto_id AND cerrada_at IS NULL
  FOR SHARE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'proyecto_no_reabierto: las cuentas del proyecto % no están reabiertas', p_proyecto_id USING ERRCODE = 'P1416';
  END IF;
  RETURN v_id;
END;
$$;

-- Solo registra la reapertura. Un admin reabre con o sin pendientes
-- (decisión del usuario, sesión 20). Idempotente: si ya hay una activa, la
-- devuelve.
CREATE OR REPLACE FUNCTION public.reabrir_cuentas_proyecto(p_proyecto_id text, p_motivo text, p_usuario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r cuentas_reaperturas;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: reabrir exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  IF p_usuario IS NULL OR btrim(p_usuario) = '' THEN
    RAISE EXCEPTION 'usuario_requerido: reabrir exige el usuario' USING ERRCODE = 'P1415';
  END IF;
  PERFORM 1 FROM proyectos WHERE id = p_proyecto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proyecto_no_encontrado: %', p_proyecto_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_r FROM cuentas_reaperturas WHERE proyecto_id = p_proyecto_id AND cerrada_at IS NULL;
  IF FOUND THEN
    RETURN jsonb_build_object('reapertura_id', v_r.id, 'proyecto_id', p_proyecto_id, 'ya_reabierta', true);
  END IF;

  INSERT INTO cuentas_reaperturas (proyecto_id, motivo, abierta_por)
  VALUES (p_proyecto_id, btrim(p_motivo), p_usuario)
  RETURNING * INTO v_r;
  RETURN jsonb_build_object('reapertura_id', v_r.id, 'proyecto_id', p_proyecto_id, 'ya_reabierta', false);
END;
$$;

-- Termina la reapertura: sin pendientes las cuentas quedan cerradas; con
-- pendientes se cierran solas al resolverlos (D17). Idempotente: sin
-- reapertura activa no hace nada.
CREATE OR REPLACE FUNCTION public.cerrar_cuentas_proyecto(p_proyecto_id text, p_usuario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r cuentas_reaperturas;
BEGIN
  IF p_usuario IS NULL OR btrim(p_usuario) = '' THEN
    RAISE EXCEPTION 'usuario_requerido: volver a cerrar exige el usuario' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_r FROM cuentas_reaperturas
  WHERE proyecto_id = p_proyecto_id AND cerrada_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reapertura_id', NULL, 'proyecto_id', p_proyecto_id, 'ya_cerrada', true);
  END IF;
  UPDATE cuentas_reaperturas SET cerrada_at = now(), cerrada_por = p_usuario WHERE id = v_r.id;
  RETURN jsonb_build_object('reapertura_id', v_r.id, 'proyecto_id', p_proyecto_id, 'ya_cerrada', false);
END;
$$;

-- ── 4. Anular pagos (R8) ──────────────────────────────────────────────────
-- Estado guardado de un cobro según sus montos y fechas: la misma regla que
-- sync_estados_cuentas_cobrar_vencidas (H7), para una sola cuenta.
CREATE OR REPLACE FUNCTION public.cuentas_cobrar_estado_calculado(p_cuenta cuentas_cobrar, p_pagado numeric)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN round(p_cuenta.monto_total - p_pagado, 2) <= 0 AND p_cuenta.monto_total > 0 THEN 'PAGADO'
    WHEN p_cuenta.fecha_vencimiento IS NOT NULL AND p_cuenta.fecha_vencimiento < hoy_cdmx()
         AND round(p_cuenta.monto_total - p_pagado, 2) > 0 THEN 'VENCIDO'
    WHEN NOT (p_cuenta.estado <> 'FACTURA_PENDIENTE' AND p_cuenta.fecha_factura IS NOT NULL) THEN 'FACTURA_PENDIENTE'
    WHEN p_pagado > 0 THEN 'PARCIALMENTE_PAGADO'
    ELSE 'FACTURADO'
  END;
$$;

-- El pago queda con su motivo, no se borra. Idempotente por pago: anular
-- uno ya anulado devuelve el estado actual (no hace falta pago_operations).
CREATE OR REPLACE FUNCTION public.anular_pago_cobro(p_pago_id uuid, p_motivo text, p_usuario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pago        pagos_comprobantes;
  v_cuenta      cuentas_cobrar;
  v_reapertura  uuid;
  v_pagado      numeric;
  v_estado      text;
  v_ya          boolean;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos_comprobantes WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;
  -- Mismo orden de bloqueo que registrar_pago_cuenta_cobrar: la cuenta primero.
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = v_pago.cuentas_cobrar_id FOR UPDATE;
  SELECT * INTO v_pago FROM pagos_comprobantes WHERE id = p_pago_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);
  v_ya := v_pago.anulado_at IS NOT NULL;

  IF NOT v_ya THEN
    UPDATE pagos_comprobantes
       SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo)
     WHERE id = p_pago_id;

    SELECT COALESCE(sum(monto), 0) INTO v_pagado
    FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cuenta.id AND anulado_at IS NULL;
    v_estado := cuentas_cobrar_estado_calculado(v_cuenta, v_pagado);

    UPDATE cuentas_cobrar SET
      monto_pagado = v_pagado,
      estado = v_estado,
      fecha_pago = CASE WHEN v_estado = 'PAGADO' THEN (
                     SELECT max(fecha_pago) FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cuenta.id AND anulado_at IS NULL
                   ) END,
      updated_at = now()
    WHERE id = v_cuenta.id;

    INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
    VALUES (v_reapertura, v_cuenta.proyecto_id, 'anular_pago', 'cobro', v_cuenta.id, btrim(p_motivo),
            jsonb_build_object('pago_id', p_pago_id, 'monto', v_pago.monto, 'fecha_pago', v_pago.fecha_pago), p_usuario);
  ELSE
    v_pagado := v_cuenta.monto_pagado;
    v_estado := v_cuenta.estado;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'cuenta_id', v_cuenta.id, 'monto_pagado_total', v_pagado,
                            'estado_nuevo', v_estado, 'ya_anulado', v_ya);
END;
$$;

-- Revierte un pago a proveedor: resta lo transferido y el neto aplicado,
-- reparte de nuevo el neto entre las hijas del grupo (proporcional a
-- x_pagar, residuo en la última, el mismo reparto que deja el prorrateo de
-- registrar_pago_grupo_factura) y recalcula el estado de la orden (R6).
CREATE OR REPLACE FUNCTION public.anular_pago_proveedor(p_pago_id uuid, p_motivo text, p_usuario text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pago         pagos_cuentas_pagar;
  v_grupo        cuentas_pagar_grupos;
  v_cuenta       cuentas_pagar;
  v_proyecto     text;
  v_reapertura   uuid;
  v_ya           boolean;
  v_transferido  numeric;
  v_neto         numeric;
  v_total        numeric;
  v_orden        uuid;
  v_estado       text;
  v_hija         record;
  v_hijas        integer;
  v_i            integer := 0;
  v_restante     numeric;
  v_monto_hija   numeric;
  v_orden_estado text;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: anular un pago exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: el pago % no existe', p_pago_id USING ERRCODE = 'P0002';
  END IF;

  -- Mismo orden de bloqueo que registrar_pago_*: el grupo o la cuenta primero.
  IF v_pago.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_pago.grupo_id FOR UPDATE;
    v_proyecto := v_grupo.proyecto_id;
  ELSE
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_pago.cuenta_pagar_id FOR UPDATE;
    v_proyecto := v_cuenta.proyecto_id;
  END IF;
  SELECT * INTO v_pago FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_proyecto);
  v_ya := v_pago.anulado_at IS NOT NULL;

  IF v_ya THEN
    RETURN jsonb_build_object('pago_id', p_pago_id, 'grupo_id', v_pago.grupo_id, 'cuenta_pagar_id', v_pago.cuenta_pagar_id, 'ya_anulado', true);
  END IF;

  UPDATE pagos_cuentas_pagar
     SET anulado_at = now(), anulado_por = p_usuario, anulado_motivo = btrim(p_motivo)
   WHERE id = p_pago_id;

  IF v_pago.grupo_id IS NOT NULL THEN
    v_transferido := GREATEST(0, round(COALESCE(v_grupo.monto_transferido, 0) - v_pago.monto_transferido, 2));
    v_neto := GREATEST(0, round(COALESCE(v_grupo.monto_pagado, 0) - v_pago.monto_neto, 2));
    v_total := v_grupo.total_a_transferir;
    v_orden := v_grupo.orden_pago_id;
    v_estado := CASE
      WHEN v_total IS NOT NULL AND v_transferido > 0 AND v_transferido >= v_total - 0.01 THEN 'PAGADO'
      WHEN v_transferido > 0 OR v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
      ELSE 'FACTURADO'
    END;

    SELECT count(*) INTO v_hijas FROM cuentas_pagar WHERE grupo_id = v_grupo.id;
    v_restante := v_neto;
    FOR v_hija IN SELECT * FROM cuentas_pagar WHERE grupo_id = v_grupo.id ORDER BY id FOR UPDATE LOOP
      v_i := v_i + 1;
      IF v_i = v_hijas THEN
        v_monto_hija := v_restante;
      ELSIF v_grupo.monto_total > 0 THEN
        v_monto_hija := round(v_neto * v_hija.x_pagar / v_grupo.monto_total, 2);
        v_restante := v_restante - v_monto_hija;
      ELSE
        v_monto_hija := 0;
      END IF;
      UPDATE cuentas_pagar SET
        monto_pagado = v_monto_hija,
        estado = CASE
          WHEN v_monto_hija >= v_hija.x_pagar AND v_hija.x_pagar > 0 THEN 'PAGADO'
          WHEN v_monto_hija > 0 OR v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
          ELSE 'PENDIENTE'
        END,
        fecha_pago = CASE WHEN v_monto_hija >= v_hija.x_pagar AND v_hija.x_pagar > 0 THEN fecha_pago END,
        updated_at = now()
      WHERE id = v_hija.id;
    END LOOP;

    UPDATE cuentas_pagar_grupos SET
      monto_transferido = v_transferido, monto_pagado = v_neto, estado = v_estado, updated_at = now()
    WHERE id = v_grupo.id;
  ELSE
    v_transferido := GREATEST(0, round(COALESCE(v_cuenta.monto_transferido, 0) - v_pago.monto_transferido, 2));
    v_neto := GREATEST(0, round(COALESCE(v_cuenta.monto_pagado, 0) - v_pago.monto_neto, 2));
    v_total := v_cuenta.total_a_transferir;
    v_orden := v_cuenta.orden_pago_id;
    v_estado := CASE
      WHEN v_total IS NOT NULL AND v_transferido > 0 AND v_transferido >= v_total - 0.01 THEN 'PAGADO'
      WHEN v_orden IS NOT NULL THEN 'EN_PROCESO_PAGO'
      ELSE 'PENDIENTE'
    END;
    UPDATE cuentas_pagar SET
      monto_transferido = v_transferido, monto_pagado = v_neto, estado = v_estado,
      fecha_pago = CASE WHEN v_estado = 'PAGADO' THEN fecha_pago END,
      updated_at = now()
    WHERE id = v_cuenta.id;
  END IF;

  IF v_pago.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_pago.orden_pago_id);
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_proyecto, 'anular_pago', CASE WHEN v_pago.grupo_id IS NOT NULL THEN 'grupo' ELSE 'cuenta' END,
          COALESCE(v_pago.grupo_id, v_pago.cuenta_pagar_id), btrim(p_motivo),
          jsonb_build_object('pago_id', p_pago_id, 'monto_transferido', v_pago.monto_transferido,
                             'monto_neto', v_pago.monto_neto, 'fecha_pago', v_pago.fecha_pago), p_usuario);

  RETURN jsonb_build_object(
    'pago_id', p_pago_id, 'grupo_id', v_pago.grupo_id, 'cuenta_pagar_id', v_pago.cuenta_pagar_id,
    'monto_transferido_total', v_transferido, 'monto_pagado_total', v_neto, 'estado_nuevo', v_estado,
    'orden_pago_id', v_pago.orden_pago_id, 'orden_pago_estado', v_orden_estado, 'ya_anulado', false
  );
END;
$$;

-- ── 5. Quitar o reemplazar documentos (baja lógica, T7) ───────────────────
CREATE OR REPLACE FUNCTION public.baja_documento_cobro(
  p_documento_id uuid, p_motivo text, p_usuario text, p_reemplazado_por uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc        documentos_cuentas_cobrar;
  v_cuenta     cuentas_cobrar;
  v_reapertura uuid;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: quitar un documento exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_no_encontrado: %', p_documento_id USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = v_doc.cuentas_cobrar_id FOR UPDATE;
  SELECT * INTO v_doc FROM documentos_cuentas_cobrar WHERE id = p_documento_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);

  IF v_doc.eliminado_at IS NOT NULL THEN
    RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
  END IF;
  IF p_reemplazado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_cobrar
    WHERE id = p_reemplazado_por AND id <> p_documento_id
      AND cuentas_cobrar_id = v_doc.cuentas_cobrar_id AND eliminado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'reemplazo_invalido: % no es un documento vigente de la misma cuenta', p_reemplazado_por USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_cobrar
     SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = btrim(p_motivo), reemplazado_por = p_reemplazado_por
   WHERE id = p_documento_id;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, CASE WHEN p_reemplazado_por IS NULL THEN 'quitar_documento' ELSE 'reemplazar_documento' END,
          'cobro', v_cuenta.id, btrim(p_motivo),
          jsonb_build_object('documento_id', p_documento_id, 'tipo', v_doc.tipo, 'archivo', v_doc.archivo_nombre,
                             'reemplazado_por', p_reemplazado_por), p_usuario);

  RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', false);
END;
$$;

-- Quitar la factura validada de un grupo o suelta sin pagos le quita el
-- snapshot (supuesto 6) y un grupo FACTURADO vuelve a ABIERTO. Con pagos, el
-- snapshot se queda (lo transferido ya se calculó con él) y la factura nueva
-- no lo mueve (validar_factura_proveedor). En una orden no se quita: primero
-- se cancela la orden (el PDF ya se emitió con esa factura).
CREATE OR REPLACE FUNCTION public.baja_documento_pago(
  p_documento_id uuid, p_motivo text, p_usuario text, p_reemplazado_por uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc         documentos_cuentas_pagar;
  v_grupo       cuentas_pagar_grupos;
  v_cuenta      cuentas_pagar;
  v_proyecto    text;
  v_orden       uuid;
  v_transferido numeric;
  v_reapertura  uuid;
  v_factura     boolean;
  v_otra        boolean;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: quitar un documento exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_no_encontrado: %', p_documento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_doc.grupo_id FOR UPDATE;
    v_proyecto := v_grupo.proyecto_id; v_orden := v_grupo.orden_pago_id; v_transferido := COALESCE(v_grupo.monto_transferido, 0);
  ELSE
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_doc.cuentas_pagar_id FOR UPDATE;
    v_proyecto := v_cuenta.proyecto_id; v_orden := v_cuenta.orden_pago_id; v_transferido := COALESCE(v_cuenta.monto_transferido, 0);
  END IF;
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id FOR UPDATE;
  v_reapertura := cuentas_reapertura_activa(v_proyecto);

  IF v_doc.eliminado_at IS NOT NULL THEN
    RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', true);
  END IF;
  IF p_reemplazado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar
    WHERE id = p_reemplazado_por AND id <> p_documento_id AND eliminado_at IS NULL
      AND grupo_id IS NOT DISTINCT FROM v_doc.grupo_id AND cuentas_pagar_id IS NOT DISTINCT FROM v_doc.cuentas_pagar_id
  ) THEN
    RAISE EXCEPTION 'reemplazo_invalido: % no es un documento vigente del mismo concepto', p_reemplazado_por USING ERRCODE = 'P1415';
  END IF;

  v_factura := v_doc.tipo = 'FACTURA_PROVEEDOR_XML' AND v_doc.estado_validacion = 'validado';
  SELECT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.id <> p_documento_id AND d.eliminado_at IS NULL AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado'
      AND d.grupo_id IS NOT DISTINCT FROM v_doc.grupo_id AND d.cuentas_pagar_id IS NOT DISTINCT FROM v_doc.cuentas_pagar_id
  ) INTO v_otra;
  IF v_factura AND NOT v_otra AND v_orden IS NOT NULL THEN
    RAISE EXCEPTION 'en_orden: la factura está en una orden de pago; cancela primero la orden' USING ERRCODE = 'P1413';
  END IF;

  UPDATE documentos_cuentas_pagar
     SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = btrim(p_motivo), reemplazado_por = p_reemplazado_por
   WHERE id = p_documento_id;

  IF v_factura AND NOT v_otra AND v_transferido = 0 THEN
    IF v_doc.grupo_id IS NOT NULL THEN
      IF v_grupo.estado = 'FACTURADO' AND EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.proyecto_id = v_grupo.proyecto_id AND g.responsable_id = v_grupo.responsable_id
          AND g.estado = 'ABIERTO' AND g.id <> v_grupo.id
      ) THEN
        RAISE EXCEPTION 'grupo_abierto_existente: el proveedor ya tiene otro grupo abierto en el proyecto; no se puede reabrir este'
          USING ERRCODE = 'P1413';
      END IF;
      UPDATE cuentas_pagar_grupos
         SET total_a_transferir = NULL,
             estado = CASE WHEN estado = 'FACTURADO' THEN 'ABIERTO' ELSE estado END,
             updated_at = now()
       WHERE id = v_grupo.id;
    ELSE
      UPDATE cuentas_pagar SET total_a_transferir = NULL, updated_at = now() WHERE id = v_cuenta.id;
    END IF;
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_proyecto, CASE WHEN p_reemplazado_por IS NULL THEN 'quitar_documento' ELSE 'reemplazar_documento' END,
          CASE WHEN v_doc.grupo_id IS NOT NULL THEN 'grupo' ELSE 'cuenta' END, COALESCE(v_doc.grupo_id, v_doc.cuentas_pagar_id), btrim(p_motivo),
          jsonb_build_object('documento_id', p_documento_id, 'tipo', v_doc.tipo, 'archivo', v_doc.archivo_nombre,
                             'reemplazado_por', p_reemplazado_por), p_usuario);

  RETURN jsonb_build_object('documento_id', p_documento_id, 'ya_eliminado', false);
END;
$$;

-- ── 6. Editar fechas y notas ──────────────────────────────────────────────
-- Del cobro: fecha de factura, vencimiento y notas (los tres, tal cual los
-- manda el formulario). El estado guardado se recalcula con la regla de H7.
CREATE OR REPLACE FUNCTION public.corregir_datos_cobro(
  p_cuenta_id uuid, p_fecha_factura date, p_fecha_vencimiento date, p_notas text, p_usuario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cuenta     cuentas_cobrar;
  v_nueva      cuentas_cobrar;
  v_reapertura uuid;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_cobrar WHERE id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_no_encontrada: %', p_cuenta_id USING ERRCODE = 'P0002';
  END IF;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);

  v_nueva := v_cuenta;
  v_nueva.fecha_factura := p_fecha_factura;
  v_nueva.fecha_vencimiento := p_fecha_vencimiento;
  UPDATE cuentas_cobrar SET
    fecha_factura = p_fecha_factura,
    fecha_vencimiento = p_fecha_vencimiento,
    notas = NULLIF(btrim(COALESCE(p_notas, '')), ''),
    estado = cuentas_cobrar_estado_calculado(v_nueva, COALESCE(v_cuenta.monto_pagado, 0)),
    updated_at = now()
  WHERE id = p_cuenta_id;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, 'editar_datos', 'cobro', p_cuenta_id, NULL,
          jsonb_build_object(
            'antes', jsonb_build_object('fecha_factura', v_cuenta.fecha_factura, 'fecha_vencimiento', v_cuenta.fecha_vencimiento, 'notas', v_cuenta.notas),
            'despues', jsonb_build_object('fecha_factura', p_fecha_factura, 'fecha_vencimiento', p_fecha_vencimiento, 'notas', NULLIF(btrim(COALESCE(p_notas, '')), ''))
          ), p_usuario);

  RETURN jsonb_build_object('cuenta_id', p_cuenta_id);
END;
$$;

-- De un pago registrado (cobro o proveedor): fecha y notas. Si la cuenta
-- quedó pagada, su fecha de pago es la del último pago vigente (R7).
CREATE OR REPLACE FUNCTION public.corregir_datos_pago(
  p_dominio text, p_pago_id uuid, p_fecha_pago date, p_notas text, p_usuario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pc         pagos_comprobantes;
  v_pp         pagos_cuentas_pagar;
  v_cobro      cuentas_cobrar;
  v_grupo      cuentas_pagar_grupos;
  v_cuenta     cuentas_pagar;
  v_proyecto   text;
  v_reapertura uuid;
  v_max        date;
  v_antes      jsonb;
BEGIN
  IF p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'fecha_requerida: la fecha del pago es obligatoria' USING ERRCODE = 'P1415';
  END IF;
  IF p_dominio = 'cobro' THEN
    SELECT * INTO v_pc FROM pagos_comprobantes WHERE id = p_pago_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO v_cobro FROM cuentas_cobrar WHERE id = v_pc.cuentas_cobrar_id FOR UPDATE;
    SELECT * INTO v_pc FROM pagos_comprobantes WHERE id = p_pago_id FOR UPDATE;
    IF v_pc.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'pago_anulado: %', p_pago_id USING ERRCODE = 'P1413'; END IF;
    v_proyecto := v_cobro.proyecto_id;
    v_reapertura := cuentas_reapertura_activa(v_proyecto);
    v_antes := jsonb_build_object('fecha_pago', v_pc.fecha_pago, 'notas', v_pc.notas);
    UPDATE pagos_comprobantes SET fecha_pago = p_fecha_pago, notas = NULLIF(btrim(COALESCE(p_notas, '')), '') WHERE id = p_pago_id;
    IF v_cobro.estado = 'PAGADO' THEN
      SELECT max(fecha_pago) INTO v_max FROM pagos_comprobantes WHERE cuentas_cobrar_id = v_cobro.id AND anulado_at IS NULL;
      UPDATE cuentas_cobrar SET fecha_pago = v_max, updated_at = now() WHERE id = v_cobro.id;
    END IF;
  ELSIF p_dominio = 'proveedor' THEN
    SELECT * INTO v_pp FROM pagos_cuentas_pagar WHERE id = p_pago_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0002'; END IF;
    IF v_pp.grupo_id IS NOT NULL THEN
      SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_pp.grupo_id FOR UPDATE;
      v_proyecto := v_grupo.proyecto_id;
    ELSE
      SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_pp.cuenta_pagar_id FOR UPDATE;
      v_proyecto := v_cuenta.proyecto_id;
    END IF;
    SELECT * INTO v_pp FROM pagos_cuentas_pagar WHERE id = p_pago_id FOR UPDATE;
    IF v_pp.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'pago_anulado: %', p_pago_id USING ERRCODE = 'P1413'; END IF;
    v_reapertura := cuentas_reapertura_activa(v_proyecto);
    v_antes := jsonb_build_object('fecha_pago', v_pp.fecha_pago, 'notas', v_pp.notas);
    UPDATE pagos_cuentas_pagar SET fecha_pago = p_fecha_pago, notas = NULLIF(btrim(COALESCE(p_notas, '')), '') WHERE id = p_pago_id;
    SELECT max(fecha_pago) INTO v_max FROM pagos_cuentas_pagar
    WHERE anulado_at IS NULL AND grupo_id IS NOT DISTINCT FROM v_pp.grupo_id AND cuenta_pagar_id IS NOT DISTINCT FROM v_pp.cuenta_pagar_id;
    UPDATE cuentas_pagar SET fecha_pago = v_max, updated_at = now()
    WHERE estado = 'PAGADO' AND ((v_pp.grupo_id IS NOT NULL AND grupo_id = v_pp.grupo_id) OR id = v_pp.cuenta_pagar_id);
  ELSE
    RAISE EXCEPTION 'dominio_invalido: %', p_dominio USING ERRCODE = 'P1415';
  END IF;

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_proyecto, 'editar_pago',
          CASE WHEN p_dominio = 'cobro' THEN 'cobro' WHEN v_pp.grupo_id IS NOT NULL THEN 'grupo' ELSE 'cuenta' END,
          CASE WHEN p_dominio = 'cobro' THEN v_cobro.id ELSE COALESCE(v_pp.grupo_id, v_pp.cuenta_pagar_id) END, NULL,
          jsonb_build_object('pago_id', p_pago_id, 'antes', v_antes,
                             'despues', jsonb_build_object('fecha_pago', p_fecha_pago, 'notas', NULLIF(btrim(COALESCE(p_notas, '')), ''))),
          p_usuario);

  RETURN jsonb_build_object('pago_id', p_pago_id);
END;
$$;

-- ── 7. Reasignar el proveedor de una cuenta ya pagada (S12) ───────────────
-- Exige los pagos del concepto ya anulados y su orden cancelada. Da de baja
-- las facturas del concepto: el grupo vuelve a ABIERTO sin snapshot (o la
-- suelta pierde su snapshot) y la cuenta se reasigna con la RPC vigente,
-- sin cambiar su guarda.
CREATE OR REPLACE FUNCTION public.corregir_proveedor_cuenta_pagar(
  p_cuenta_pagar_id uuid, p_responsable_id uuid, p_responsable_nombre text,
  p_telefono text, p_correo text, p_clabe text, p_banco text,
  p_motivo text, p_usuario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cuenta     cuentas_pagar;
  v_grupo      cuentas_pagar_grupos;
  v_reapertura uuid;
  v_activos    boolean;
  v_orden      uuid;
  v_anterior   uuid;
  v_result     jsonb;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: reasignar un concepto pagado exige un motivo' USING ERRCODE = 'P1415';
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_no_encontrada: %', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;
  IF v_cuenta.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_cuenta.grupo_id FOR UPDATE;
    v_orden := v_grupo.orden_pago_id;
  END IF;
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  IF v_cuenta.grupo_id IS NULL THEN
    v_orden := v_cuenta.orden_pago_id;
  END IF;
  v_reapertura := cuentas_reapertura_activa(v_cuenta.proyecto_id);
  v_anterior := v_cuenta.responsable_id;

  SELECT EXISTS (
    SELECT 1 FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL
      AND ((v_cuenta.grupo_id IS NOT NULL AND p.grupo_id = v_cuenta.grupo_id) OR (v_cuenta.grupo_id IS NULL AND p.cuenta_pagar_id = v_cuenta.id))
  ) INTO v_activos;
  IF v_activos THEN
    RAISE EXCEPTION 'pagos_activos: anula primero los pagos del concepto' USING ERRCODE = 'P1413';
  END IF;
  IF v_orden IS NOT NULL THEN
    RAISE EXCEPTION 'en_orden: el concepto está en una orden de pago; cancela primero la orden' USING ERRCODE = 'P1413';
  END IF;

  IF v_cuenta.grupo_id IS NOT NULL THEN
    UPDATE documentos_cuentas_pagar
       SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = 'Reasignación de proveedor: ' || btrim(p_motivo)
     WHERE grupo_id = v_grupo.id AND eliminado_at IS NULL AND tipo IN ('FACTURA_PROVEEDOR_XML', 'FACTURA_PROVEEDOR');
    IF v_grupo.estado <> 'ABIERTO' THEN
      IF EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.proyecto_id = v_grupo.proyecto_id AND g.responsable_id = v_grupo.responsable_id
          AND g.estado = 'ABIERTO' AND g.id <> v_grupo.id
      ) THEN
        RAISE EXCEPTION 'grupo_abierto_existente: el proveedor ya tiene otro grupo abierto en el proyecto; no se puede reabrir este'
          USING ERRCODE = 'P1413';
      END IF;
      UPDATE cuentas_pagar_grupos
         SET estado = 'ABIERTO', total_a_transferir = NULL, monto_transferido = 0, monto_pagado = 0, updated_at = now()
       WHERE id = v_grupo.id;
    END IF;
  ELSE
    UPDATE documentos_cuentas_pagar
       SET eliminado_at = now(), eliminado_por = p_usuario, eliminado_motivo = 'Reasignación de proveedor: ' || btrim(p_motivo)
     WHERE cuentas_pagar_id = v_cuenta.id AND eliminado_at IS NULL AND tipo IN ('FACTURA_PROVEEDOR_XML', 'FACTURA_PROVEEDOR');
    UPDATE cuentas_pagar
       SET total_a_transferir = NULL, monto_transferido = 0, monto_pagado = 0, estado = 'PENDIENTE', fecha_pago = NULL, updated_at = now()
     WHERE id = v_cuenta.id;
  END IF;

  v_result := reasignar_responsable_cuenta_pagar(
    p_cuenta_pagar_id, p_responsable_id, p_responsable_nombre, p_telefono, p_correo, p_clabe, p_banco
  );

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, 'reasignar_proveedor', 'cuenta', v_cuenta.id, btrim(p_motivo),
          jsonb_build_object('responsable_anterior', v_anterior, 'responsable_nuevo', p_responsable_id,
                             'grupo_anterior', v_cuenta.grupo_id, 'grupo_nuevo', v_result->'grupo_id'), p_usuario);

  RETURN v_result;
END;
$$;

-- ── 8. Lo que lee el documento vigente o suma pagos ignora bajas y anulados ─
-- R8: el saldo de un cobro solo suma pagos vigentes.
CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta_cobrar(
  p_cuenta_id       uuid,
  p_monto           numeric,
  p_tipo_pago       text,
  p_fecha_pago      date,
  p_comprobante_url text DEFAULT '',
  p_archivo_nombre  text DEFAULT '',
  p_notas           text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing      pago_operations;
  v_cuenta        record;
  v_total_pagado  numeric;
  v_nuevo_total   numeric;
  v_nuevo_estado  text;
  v_pago_id       uuid;
  v_result        jsonb;
BEGIN
  -- Idempotencia (pago_operations): un reintento con el mismo operation_id
  -- devuelve el resultado guardado sin volver a registrar el pago.
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_cobrar' OR v_existing.cuenta_id <> p_cuenta_id THEN
        RAISE EXCEPTION 'registrar_pago_cuenta_cobrar: operation_id % ya pertenece a %/%, no a cuentas_cobrar/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  SELECT * INTO v_cuenta
  FROM cuentas_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada: %', p_cuenta_id;
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_pagado
  FROM pagos_comprobantes
  WHERE cuentas_cobrar_id = p_cuenta_id
    AND anulado_at IS NULL;

  v_nuevo_total := v_total_pagado + p_monto;

  IF v_nuevo_total > v_cuenta.monto_total THEN
    RAISE EXCEPTION 'Monto excede el total de la cuenta. Total: %, ya pagado: %, nuevo pago: %',
      v_cuenta.monto_total, v_total_pagado, p_monto;
  END IF;

  INSERT INTO pagos_comprobantes (
    cuentas_cobrar_id, monto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas
  ) VALUES (
    p_cuenta_id, p_monto, p_tipo_pago, p_fecha_pago,
    p_comprobante_url, p_archivo_nombre, p_notas
  )
  RETURNING id INTO v_pago_id;

  IF v_nuevo_total >= v_cuenta.monto_total THEN
    v_nuevo_estado := 'PAGADO';
  ELSIF v_nuevo_total > 0 THEN
    v_nuevo_estado := 'PARCIALMENTE_PAGADO';
  ELSE
    v_nuevo_estado := v_cuenta.estado;
  END IF;

  UPDATE cuentas_cobrar SET
    monto_pagado = v_nuevo_total,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN p_fecha_pago ELSE fecha_pago END,
    updated_at = NOW()
  WHERE id = p_cuenta_id;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'monto_pagado_total', v_nuevo_total,
    'monto_pendiente', GREATEST(0, v_cuenta.monto_total - v_nuevo_total),
    'estado_nuevo', v_nuevo_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_cobrar', p_cuenta_id, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- La factura validada que habilita pagar y ordenar es la vigente.
CREATE OR REPLACE FUNCTION public.registrar_pago_grupo_factura(
  p_grupo_id        uuid,
  p_monto           numeric,
  p_tipo_pago       text DEFAULT 'TRANSFERENCIA',
  p_fecha_pago      date DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_archivo_nombre  text DEFAULT NULL,
  p_notas           text DEFAULT NULL,
  p_usuario         text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing           pago_operations;
  v_grupo              cuentas_pagar_grupos;
  v_fecha              date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_saldo_transfer     numeric;
  v_nuevo_transferido  numeric;
  v_es_ultimo          boolean;
  v_neto_saldo         numeric;
  v_neto_aplicado      numeric;
  v_nuevo_neto         numeric;
  v_estado_grupo       text;
  v_restante           numeric;
  v_hija               record;
  v_incremento         numeric;
  v_nuevo_monto_hija   numeric;
  v_estado_hija        text;
  v_hijas_count        integer;
  v_hijas_procesadas   integer := 0;
  v_pago_id            uuid;
  v_orden_estado       text;
  v_result             jsonb;
BEGIN
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_pagar_grupos' OR v_existing.cuenta_id <> p_grupo_id THEN
        RAISE EXCEPTION 'registrar_pago_grupo_factura: operation_id % ya pertenece a %/%, no a cuentas_pagar_grupos/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_grupo_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo de cuentas por pagar % no encontrado', p_grupo_id USING ERRCODE = 'P0002';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;
  IF v_grupo.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN
    RAISE EXCEPTION 'grupo_no_facturable: el grupo % está en estado %, no se puede pagar', p_grupo_id, v_grupo.estado
      USING ERRCODE = 'P1413';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.grupo_id = p_grupo_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'sin_factura_validada: el grupo % no tiene factura validada', p_grupo_id USING ERRCODE = 'P1413';
  END IF;
  IF v_grupo.total_a_transferir IS NULL THEN
    RAISE EXCEPTION 'sin_total_a_transferir: el grupo % no tiene total a transferir', p_grupo_id USING ERRCODE = 'P1413';
  END IF;

  v_saldo_transfer := round(v_grupo.total_a_transferir - v_grupo.monto_transferido, 2);
  IF p_monto > v_saldo_transfer + 0.01 THEN
    RAISE EXCEPTION 'Monto excede el total a transferir del grupo. Total: %, ya transferido: %, nuevo pago: %',
      v_grupo.total_a_transferir, v_grupo.monto_transferido, p_monto;
  END IF;

  v_nuevo_transferido := round(v_grupo.monto_transferido + p_monto, 2);
  v_es_ultimo := v_nuevo_transferido >= v_grupo.total_a_transferir - 0.01;
  v_neto_saldo := round(v_grupo.monto_total - COALESCE(v_grupo.monto_pagado, 0), 2);
  -- H8/S18: el último pago aplica exactamente el neto que falta, sin proporción.
  v_neto_aplicado := CASE
    WHEN v_es_ultimo THEN v_neto_saldo
    ELSE LEAST(v_neto_saldo, round(p_monto * v_grupo.monto_total / NULLIF(v_grupo.total_a_transferir, 0), 2))
  END;
  v_nuevo_neto := round(COALESCE(v_grupo.monto_pagado, 0) + v_neto_aplicado, 2);

  INSERT INTO pagos_cuentas_pagar (
    grupo_id, monto_transferido, monto_neto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas, orden_pago_id, operation_id, created_by
  ) VALUES (
    p_grupo_id, p_monto, v_neto_aplicado, p_tipo_pago, v_fecha,
    NULLIF(p_comprobante_url, ''), NULLIF(p_archivo_nombre, ''), p_notas, v_grupo.orden_pago_id, p_operation_id, p_usuario
  )
  RETURNING id INTO v_pago_id;

  -- Prorrateo vigente del neto entre las hijas (residuo exacto en la última).
  SELECT count(*) INTO v_hijas_count FROM cuentas_pagar WHERE grupo_id = p_grupo_id;
  IF v_hijas_count = 0 THEN
    RAISE EXCEPTION 'El grupo % no tiene cuentas asociadas', p_grupo_id;
  END IF;
  v_restante := v_neto_aplicado;
  FOR v_hija IN
    SELECT * FROM cuentas_pagar WHERE grupo_id = p_grupo_id ORDER BY id FOR UPDATE
  LOOP
    v_hijas_procesadas := v_hijas_procesadas + 1;
    IF v_hijas_procesadas = v_hijas_count THEN
      v_incremento := v_restante;
    ELSIF v_neto_saldo > 0 THEN
      v_incremento := ROUND(v_neto_aplicado * (v_hija.x_pagar - COALESCE(v_hija.monto_pagado, 0)) / v_neto_saldo, 2);
      v_restante := v_restante - v_incremento;
    ELSE
      v_incremento := 0;
    END IF;

    v_nuevo_monto_hija := COALESCE(v_hija.monto_pagado, 0) + v_incremento;
    v_estado_hija := CASE
      WHEN v_nuevo_monto_hija >= v_hija.x_pagar THEN 'PAGADO'
      WHEN v_nuevo_monto_hija > 0 THEN 'EN_PROCESO_PAGO'
      ELSE v_hija.estado
    END;

    UPDATE cuentas_pagar SET
      monto_pagado = v_nuevo_monto_hija,
      estado = v_estado_hija,
      -- R7: la fecha del pago que la salda, no CURRENT_DATE.
      fecha_pago = CASE WHEN v_estado_hija = 'PAGADO' AND v_hija.estado <> 'PAGADO' THEN v_fecha ELSE fecha_pago END,
      updated_at = now()
    WHERE id = v_hija.id;
  END LOOP;

  v_estado_grupo := CASE WHEN v_es_ultimo THEN 'PAGADO' ELSE 'EN_PROCESO_PAGO' END;
  UPDATE cuentas_pagar_grupos SET
    monto_pagado = v_nuevo_neto,
    monto_transferido = v_nuevo_transferido,
    estado = v_estado_grupo,
    updated_at = now()
  WHERE id = p_grupo_id;

  IF v_grupo.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_grupo.orden_pago_id);
  END IF;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'grupo_id', p_grupo_id,
    'neto_aplicado', v_neto_aplicado,
    'monto_pagado_total', v_nuevo_neto,
    'monto_transferido_total', v_nuevo_transferido,
    'saldo_pendiente', GREATEST(0, round(v_grupo.total_a_transferir - v_nuevo_transferido, 2)),
    'saldo_neto', GREATEST(0, round(v_grupo.monto_total - v_nuevo_neto, 2)),
    'estado_nuevo', v_estado_grupo,
    'orden_pago_id', v_grupo.orden_pago_id,
    'orden_pago_estado', v_orden_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_pagar_grupos', p_grupo_id, v_result);
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta_pagar(
  p_cuenta_id       uuid,
  p_monto           numeric,
  p_tipo_pago       text DEFAULT 'TRANSFERENCIA',
  p_fecha_pago      date DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_archivo_nombre  text DEFAULT NULL,
  p_notas           text DEFAULT NULL,
  p_usuario         text DEFAULT NULL,
  p_operation_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing           pago_operations;
  v_cuenta             cuentas_pagar;
  v_fecha              date := COALESCE(p_fecha_pago, hoy_cdmx());
  v_saldo_transfer     numeric;
  v_nuevo_transferido  numeric;
  v_es_ultimo          boolean;
  v_neto_saldo         numeric;
  v_neto_aplicado      numeric;
  v_nuevo_neto         numeric;
  v_nuevo_estado       text;
  v_pago_id            uuid;
  v_orden_estado       text;
  v_result             jsonb;
BEGIN
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM pago_operations WHERE operation_id = p_operation_id;
    IF FOUND THEN
      IF v_existing.dominio <> 'cuentas_pagar' OR v_existing.cuenta_id <> p_cuenta_id THEN
        RAISE EXCEPTION 'registrar_pago_cuenta_pagar: operation_id % ya pertenece a %/%, no a cuentas_pagar/%',
          p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
          USING ERRCODE = 'P1411';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar no encontrada: %', p_cuenta_id;
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_tipo_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE') THEN
    RAISE EXCEPTION 'Tipo de pago inválido: %. Use TRANSFERENCIA, EFECTIVO o CHEQUE', p_tipo_pago;
  END IF;
  IF v_cuenta.grupo_id IS NOT NULL THEN
    RAISE EXCEPTION 'cuenta_en_grupo: la cuenta % pertenece a un grupo; se paga el grupo', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF v_cuenta.responsable_id IS NULL THEN
    RAISE EXCEPTION 'sin_proveedor: la cuenta % no tiene proveedor asignado', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM documentos_cuentas_pagar d
    WHERE d.cuentas_pagar_id = p_cuenta_id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'sin_factura_validada: la cuenta % no tiene factura validada', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;
  IF v_cuenta.total_a_transferir IS NULL THEN
    RAISE EXCEPTION 'sin_total_a_transferir: la cuenta % no tiene total a transferir', p_cuenta_id USING ERRCODE = 'P1413';
  END IF;

  v_saldo_transfer := round(v_cuenta.total_a_transferir - v_cuenta.monto_transferido, 2);
  IF p_monto > v_saldo_transfer + 0.01 THEN
    RAISE EXCEPTION 'Monto excede el total a transferir. Total: %, ya transferido: %, nuevo pago: %',
      v_cuenta.total_a_transferir, v_cuenta.monto_transferido, p_monto;
  END IF;

  v_nuevo_transferido := round(v_cuenta.monto_transferido + p_monto, 2);
  v_es_ultimo := v_nuevo_transferido >= v_cuenta.total_a_transferir - 0.01;
  v_neto_saldo := round(v_cuenta.x_pagar - COALESCE(v_cuenta.monto_pagado, 0), 2);
  v_neto_aplicado := CASE
    WHEN v_es_ultimo THEN v_neto_saldo
    ELSE LEAST(v_neto_saldo, round(p_monto * v_cuenta.x_pagar / NULLIF(v_cuenta.total_a_transferir, 0), 2))
  END;
  v_nuevo_neto := round(COALESCE(v_cuenta.monto_pagado, 0) + v_neto_aplicado, 2);

  -- H3: con saldo, una suelta dentro de una orden sigue EN_PROCESO_PAGO.
  v_nuevo_estado := CASE
    WHEN v_es_ultimo THEN 'PAGADO'
    WHEN v_cuenta.orden_pago_id IS NOT NULL THEN 'EN_PROCESO_PAGO'
    ELSE 'PENDIENTE'
  END;

  INSERT INTO pagos_cuentas_pagar (
    cuenta_pagar_id, monto_transferido, monto_neto, tipo_pago, fecha_pago,
    comprobante_url, archivo_nombre, notas, orden_pago_id, operation_id, created_by
  ) VALUES (
    p_cuenta_id, p_monto, v_neto_aplicado, p_tipo_pago, v_fecha,
    NULLIF(p_comprobante_url, ''), NULLIF(p_archivo_nombre, ''), p_notas, v_cuenta.orden_pago_id, p_operation_id, p_usuario
  )
  RETURNING id INTO v_pago_id;

  UPDATE cuentas_pagar SET
    monto_pagado = v_nuevo_neto,
    monto_transferido = v_nuevo_transferido,
    estado = v_nuevo_estado,
    fecha_pago = CASE WHEN v_nuevo_estado = 'PAGADO' THEN v_fecha ELSE fecha_pago END,
    updated_at = now()
  WHERE id = p_cuenta_id;

  IF v_cuenta.orden_pago_id IS NOT NULL THEN
    v_orden_estado := recalcular_estado_orden_pago(v_cuenta.orden_pago_id);
  END IF;

  v_result := jsonb_build_object(
    'pago_id', v_pago_id,
    'cuenta_id', p_cuenta_id,
    'neto_aplicado', v_neto_aplicado,
    'monto_pagado_total', v_nuevo_neto,
    'monto_transferido_total', v_nuevo_transferido,
    'saldo_pendiente', GREATEST(0, round(v_cuenta.total_a_transferir - v_nuevo_transferido, 2)),
    'saldo_neto', GREATEST(0, round(v_cuenta.x_pagar - v_nuevo_neto, 2)),
    'estado_nuevo', v_nuevo_estado,
    'orden_pago_id', v_cuenta.orden_pago_id,
    'orden_pago_estado', v_orden_estado
  );

  IF p_operation_id IS NOT NULL THEN
    INSERT INTO pago_operations (operation_id, dominio, cuenta_id, result)
    VALUES (p_operation_id, 'cuentas_pagar', p_cuenta_id, v_result);
  END IF;

  RETURN v_result;
END;
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
      WHERE d.grupo_id = v_grupo.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
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
      WHERE d.cuentas_pagar_id = v_cuenta.id AND d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.estado_validacion = 'validado' AND d.eliminado_at IS NULL
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
    (orden_pago_id, grupo_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, transferir_cubierto)
  SELECT
    v_orden_id, g.id, g.responsable_id, pr.nombre, g.proyecto_id,
    (SELECT string_agg(DISTINCT cp.cotizacion_id, ',' ORDER BY cp.cotizacion_id) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
    round(g.monto_total - COALESCE(g.monto_pagado, 0), 2),
    CASE WHEN g.total_a_transferir IS NULL THEN NULL ELSE round(g.total_a_transferir - g.monto_transferido, 2) END
  FROM cuentas_pagar_grupos g
  LEFT JOIN proveedores pr ON pr.id = g.responsable_id
  WHERE g.id = ANY(v_grupo_ids);

  INSERT INTO ordenes_pago_conceptos
    (orden_pago_id, cuenta_pagar_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, transferir_cubierto)
  SELECT
    v_orden_id, cp.id, cp.responsable_id, cp.responsable_nombre, cp.proyecto_id, cp.cotizacion_id,
    round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2),
    CASE WHEN cp.total_a_transferir IS NULL THEN NULL ELSE round(cp.total_a_transferir - cp.monto_transferido, 2) END
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

CREATE OR REPLACE FUNCTION public.validar_factura_proveedor(p_documento_id uuid, p_usuario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc     documentos_cuentas_pagar;
  v_grupo   cuentas_pagar_grupos;
  v_cuenta  cuentas_pagar;
  v_estado  text;
BEGIN
  SELECT * INTO v_doc FROM documentos_cuentas_pagar WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_invalida: documento % no encontrado', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.tipo <> 'FACTURA_PROVEEDOR_XML' THEN
    RAISE EXCEPTION 'factura_invalida: el documento % no es una factura XML de proveedor', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.eliminado_at IS NOT NULL THEN
    RAISE EXCEPTION 'factura_invalida: el documento % está dado de baja', p_documento_id USING ERRCODE = 'P1415';
  END IF;
  IF v_doc.total_cfdi IS NULL THEN
    RAISE EXCEPTION 'sin_total_cfdi: la factura % no tiene total guardado; vuelve a subir el XML', p_documento_id USING ERRCODE = 'P1415';
  END IF;

  UPDATE documentos_cuentas_pagar
     SET estado_validacion = 'validado', detalle_validacion = NULL
   WHERE id = p_documento_id;

  IF v_doc.grupo_id IS NOT NULL THEN
    SELECT * INTO v_grupo FROM cuentas_pagar_grupos WHERE id = v_doc.grupo_id FOR UPDATE;
    IF v_grupo.estado = 'ABIERTO' THEN
      UPDATE cuentas_pagar_grupos
         SET estado = 'FACTURADO', total_a_transferir = v_doc.total_cfdi, updated_at = now()
       WHERE id = v_grupo.id;
      v_estado := 'FACTURADO';
    ELSE
      -- Ya facturado: el snapshot solo se reemplaza si todavía no hay pagos.
      IF v_grupo.total_a_transferir IS NULL OR v_grupo.monto_transferido = 0 THEN
        UPDATE cuentas_pagar_grupos SET total_a_transferir = v_doc.total_cfdi, updated_at = now() WHERE id = v_grupo.id;
      END IF;
      v_estado := v_grupo.estado;
    END IF;
  ELSE
    SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = v_doc.cuentas_pagar_id FOR UPDATE;
    IF v_cuenta.total_a_transferir IS NULL OR v_cuenta.monto_transferido = 0 THEN
      UPDATE cuentas_pagar SET total_a_transferir = v_doc.total_cfdi, updated_at = now() WHERE id = v_cuenta.id;
    END IF;
    v_estado := v_cuenta.estado;
  END IF;

  RETURN jsonb_build_object(
    'documento_id', v_doc.id,
    'grupo_id', v_doc.grupo_id,
    'cuenta_pagar_id', v_doc.cuentas_pagar_id,
    'total_a_transferir', v_doc.total_cfdi,
    'estado', v_estado,
    'validado_por', p_usuario
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_orden_candidatos(p_limite_no_incluidas integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '8MB'
AS $$
DECLARE
  v_hoy    text := to_char(hoy_cdmx(), 'YYYY-MM-DD');
  v_result jsonb;
BEGIN
  WITH
  obj AS (
    -- Grupos con saldo y sin orden.
    SELECT 'grupo'::text AS tipo, g.id, g.proyecto_id, g.responsable_id,
           NULL::text AS responsable_nombre_cp,
           round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) AS saldo,
           g.total_a_transferir, COALESCE(g.monto_transferido, 0) AS monto_transferido,
           g.estado
    FROM cuentas_pagar_grupos g
    WHERE g.orden_pago_id IS NULL
      AND g.estado <> 'PAGADO'
      AND round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) > 0
    UNION ALL
    -- Sueltas (sin grupo) con saldo y sin orden.
    SELECT 'cuenta', cp.id, cp.proyecto_id, cp.responsable_id,
           cp.responsable_nombre,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2),
           cp.total_a_transferir, COALESCE(cp.monto_transferido, 0),
           cp.estado
    FROM cuentas_pagar cp
    WHERE cp.grupo_id IS NULL
      AND cp.orden_pago_id IS NULL
      AND cp.estado <> 'PAGADO'
      AND round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) > 0
  ),
  -- Renglones de cada objetivo (hijas del grupo o la propia suelta).
  ren AS (
    -- Dos joins por igualdad (no un OR, que obliga a un nested loop).
    SELECT 'grupo'::text AS tipo, cp.grupo_id AS obj_id, cp.id AS cuenta_id, cp.item_descripcion, cp.cantidad,
           cp.cotizacion_id, cp.responsable_nombre, cp.correo, cp.telefono, cp.banco, cp.clabe, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) AS saldo
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'grupo' AND o.id = cp.grupo_id
    UNION ALL
    SELECT 'cuenta', cp.id, cp.id, cp.item_descripcion, cp.cantidad,
           cp.cotizacion_id, cp.responsable_nombre, cp.correo, cp.telefono, cp.banco, cp.clabe, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2)
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'cuenta' AND o.id = cp.id
  ),
  evento AS (
    SELECT r.tipo, r.obj_id,
           bool_or(c.fecha_entrega IS NULL OR c.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$') AS sin_fecha,
           max(c.fecha_entrega) FILTER (WHERE c.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$') AS fecha_max,
           array_agg(DISTINCT r.cotizacion_id ORDER BY r.cotizacion_id) AS folios
    FROM ren r
    LEFT JOIN cotizaciones c ON c.id = r.cotizacion_id
    GROUP BY r.tipo, r.obj_id
  ),
  factura AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           bool_or(d.estado_validacion = 'validado') AS validada
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND d.eliminado_at IS NULL
      AND (d.grupo_id IN (SELECT id FROM obj WHERE tipo = 'grupo') OR d.cuentas_pagar_id IN (SELECT id FROM obj WHERE tipo = 'cuenta'))
    GROUP BY 1
  ),
  cal AS (
    SELECT o.*, e.sin_fecha, e.fecha_max, e.folios,
           p.proyecto AS proyecto_nombre,
           pr.nombre AS pr_nombre, pr.regimen_fiscal, pr.banco AS pr_banco, pr.clabe AS pr_clabe,
           pr.correo AS pr_correo, pr.telefono AS pr_telefono,
           CASE
             WHEN o.responsable_id IS NULL THEN 'sin_proveedor'
             WHEN f.obj_id IS NULL THEN 'sin_factura'
             WHEN NOT f.validada THEN 'factura_revision'
             -- Un grupo solo se ordena FACTURADO o con pago parcial directo.
             WHEN o.tipo = 'grupo' AND o.estado NOT IN ('FACTURADO', 'EN_PROCESO_PAGO') THEN 'sin_factura'
             WHEN e.sin_fecha OR e.fecha_max > v_hoy THEN 'evento_pendiente'
           END AS motivo
    FROM obj o
    LEFT JOIN evento e ON e.tipo = o.tipo AND e.obj_id = o.id
    LEFT JOIN factura f ON f.obj_id = o.id
    LEFT JOIN proyectos p ON p.id = o.proyecto_id
    LEFT JOIN proveedores pr ON pr.id = o.responsable_id
  ),
  primer AS (
    -- Datos de contacto de respaldo (sueltas legacy sin proveedor en catálogo).
    SELECT DISTINCT ON (r.tipo, r.obj_id) r.tipo, r.obj_id, r.responsable_nombre, r.correo, r.telefono, r.banco, r.clabe
    FROM ren r
    ORDER BY r.tipo, r.obj_id, r.created_at, r.cuenta_id
  ),
  items AS (
    -- Renglones con saldo, agregados una sola vez y solo para las elegibles.
    SELECT r.tipo, r.obj_id,
           jsonb_agg(jsonb_build_object(
             'cuenta_id', r.cuenta_id, 'descripcion', r.item_descripcion, 'cantidad', r.cantidad,
             'cotizacion_id', r.cotizacion_id, 'saldo', r.saldo
           ) ORDER BY r.created_at, r.cuenta_id) AS items
    FROM ren r
    JOIN cal c ON c.tipo = r.tipo AND c.id = r.obj_id AND c.motivo IS NULL
    WHERE r.saldo > 0
    GROUP BY r.tipo, r.obj_id
  )
  SELECT jsonb_build_object(
    'hoy', v_hoy,
    'elegibles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
        'folios', to_jsonb(c.folios), 'fecha_evento', c.fecha_max,
        'responsable', jsonb_build_object(
          'id', c.responsable_id,
          'nombre', COALESCE(c.pr_nombre, pm.responsable_nombre, 'Sin nombre'),
          'regimen_fiscal', c.regimen_fiscal,
          'banco', COALESCE(c.pr_banco, pm.banco), 'clabe', COALESCE(c.pr_clabe, pm.clabe),
          'correo', COALESCE(c.pr_correo, pm.correo), 'telefono', COALESCE(c.pr_telefono, pm.telefono)
        ),
        'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
        'items', it.items
      ) ORDER BY COALESCE(c.pr_nombre, pm.responsable_nombre), c.fecha_max, c.proyecto_id, c.id)
      FROM cal c
      LEFT JOIN primer pm ON pm.tipo = c.tipo AND pm.obj_id = c.id
      LEFT JOIN items it ON it.tipo = c.tipo AND it.obj_id = c.id
      WHERE c.motivo IS NULL
    ), '[]'::jsonb),
    'no_incluidas', COALESCE((
      SELECT jsonb_agg(x.fila ORDER BY x.orden)
      FROM (
        SELECT jsonb_build_object(
                 'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
                 'responsable_nombre', COALESCE(c.pr_nombre, pm.responsable_nombre),
                 'regimen_fiscal', c.regimen_fiscal,
                 'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
                 'motivo', c.motivo, 'fecha_evento', c.fecha_max
               ) AS fila,
               row_number() OVER (
                 -- Primero lo que ya se podría pagar si se resuelve el motivo:
                 -- eventos realizados, del más reciente al más viejo.
                 ORDER BY (c.sin_fecha OR c.fecha_max > v_hoy), c.fecha_max DESC NULLS LAST, c.proyecto_id, c.id
               ) AS orden
        FROM cal c
        LEFT JOIN primer pm ON pm.tipo = c.tipo AND pm.obj_id = c.id
        WHERE c.motivo IS NOT NULL
      ) x
      WHERE x.orden <= GREATEST(COALESCE(p_limite_no_incluidas, 100), 0)
    ), '[]'::jsonb),
    'no_incluidas_total', (SELECT count(*) FROM cal WHERE motivo IS NOT NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Lectura cruda (seleccionado y referencia TS): reapertura, bajas y anulados.
CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto(p_year integer, p_proyecto text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '8MB'
AS $$
DECLARE
  v_desde text;
  v_hasta text;
  v_result json;
BEGIN
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'cuentas_por_proyecto: p_year es obligatorio' USING ERRCODE = '22004';
  END IF;

  v_desde := lpad(p_year::text, 4, '0') || '-01-01';
  v_hasta := lpad((p_year + 1)::text, 4, '0') || '-01-01';

  -- Forma plana y posicional (O1b): cuatro listas de filas-arreglo, en json
  -- (no jsonb: construirlo cuesta la mitad). El orden de columnas es el
  -- contrato con lib/server/cuentas/periodo-rpc.ts, que las decodifica:
  --   proyectos: id, nombre, cliente, cliente_id, fecha_entrega, margen, fee,
  --              utilidad, iva, reabierta (B7)
  --   cobros:    id, cotizacion_id, proyecto_id, folio, cliente, cliente_id,
  --              proyecto, monto_total, monto_pagado, fecha_vencimiento,
  --              fecha_factura, facturas_xml, pagos
  --   pagos:     (solo cuentas SUELTAS) id, cotizacion_id, proyecto_id,
  --              grupo_id, responsable_id, responsable_nombre,
  --              item_descripcion, x_pagar, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, regimen_fiscal,
  --              facturas_xml, comprobantes, pagos_realizados
  --   grupos:    id, proyecto_id, responsable_id, responsable_nombre,
  --              regimen_fiscal, monto_total, monto_pagado, total_a_transferir,
  --              monto_transferido, orden_pago_id, facturas_xml, comprobantes,
  --              pagos_realizados, n_items, descripcion
  -- pagos_realizados = [{fecha, monto}] de pagos_cuentas_pagar no anulados,
  -- monto en total a transferir.
  -- Las cuentas hijas de un grupo no viajan (O1b): la lectura por periodo
  -- solo usa cuántas son y la descripción de la primera; el desglose del grupo
  -- lo trae el endpoint de detalle. Son la mitad del volumen del año.
  -- proyecto_id null = "Sin proyecto" (supuesto 11). Documentos y pagos son
  -- objetos (pocos); null = ninguno.
  WITH
  py AS (
    -- Proyectos del año, más los que no tienen una fecha válida ("Sin fecha", D9).
    SELECT p.id, p.proyecto, p.cliente, p.cliente_id, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE ((p.fecha_entrega >= v_desde AND p.fecha_entrega < v_hasta AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
           OR p.fecha_entrega IS NULL
           OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$')
      AND (p_proyecto IS NULL OR p.id = p_proyecto)
  ),
  cc AS (
    SELECT cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
           cc.monto_total, cc.monto_pagado, cc.fecha_vencimiento, cc.fecha_factura, cc.created_at
    FROM cuentas_cobrar cc
    WHERE (cc.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cc.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.responsable_nombre,
           cp.item_descripcion, cp.x_pagar, cp.monto_pagado, cp.total_a_transferir, cp.monto_transferido,
           cp.orden_pago_id, cp.created_at
    FROM cuentas_pagar cp
    WHERE (cp.proyecto_id IS NULL AND (p_proyecto IS NULL OR p_proyecto = 'sin-proyecto'))
       OR cp.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT g.id, g.proyecto_id, g.responsable_id, g.monto_total, g.monto_pagado, g.total_a_transferir,
           g.monto_transferido, g.orden_pago_id, g.created_at
    FROM cuentas_pagar_grupos g
    WHERE g.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  -- Cobros: facturas XML, y complementos por pago (D16, D27).
  cc_facturas AS (
    SELECT d.cuentas_cobrar_id AS id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga, 'metodo_pago', d.metodo_pago_cfdi)) AS docs
    FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.cuentas_cobrar_id IN (SELECT id FROM cc) AND d.eliminado_at IS NULL
    GROUP BY d.cuentas_cobrar_id
  ),
  comp AS (
    SELECT d.pago_id,
           json_agg(json_build_object('estado_validacion', d.estado_validacion, 'fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO') AS xml,
           json_agg(json_build_object('fecha_carga', d.fecha_carga)) FILTER (WHERE d.tipo = 'COMPLEMENTO_PAGO_PDF') AS pdf
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND d.cuentas_cobrar_id IN (SELECT id FROM cc)
    GROUP BY d.pago_id
  ),
  cc_pagos AS (
    SELECT pc.cuentas_cobrar_id AS id,
           json_agg(json_build_object(
             'id', pc.id, 'monto', pc.monto, 'fecha_pago', pc.fecha_pago, 'tipo_pago', pc.tipo_pago,
             'complemento_xml', COALESCE(comp.xml, '[]'::json), 'complemento_pdf', COALESCE(comp.pdf, '[]'::json)
           ) ORDER BY pc.fecha_pago, pc.created_at) AS pagos
    FROM pagos_comprobantes pc
    LEFT JOIN comp ON comp.pago_id = pc.id
    WHERE pc.cuentas_cobrar_id IN (SELECT id FROM cc) AND pc.anulado_at IS NULL
    GROUP BY pc.cuentas_cobrar_id
  ),
  dp AS (
    SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo IN ('FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO') AND d.eliminado_at IS NULL
      AND (d.grupo_id IN (SELECT id FROM g) OR d.cuentas_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
    UNION ALL
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id), 'PAGO', NULL, p.created_at
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL AND p.comprobante_url IS NOT NULL
      AND (p.grupo_id IN (SELECT id FROM g) OR p.cuenta_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
  ),
  p_docs AS (
    SELECT id,
           json_agg(json_build_object('estado_validacion', estado_validacion, 'fecha_carga', fecha_carga)) FILTER (WHERE tipo = 'FACTURA_PROVEEDOR_XML') AS facturas,
           json_agg(json_build_object('fecha_carga', fecha_carga)) FILTER (WHERE tipo IN ('COMPROBANTE_PAGO', 'PAGO')) AS comprobantes
    FROM dp GROUP BY id
  ),
  p_fechas AS (
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id) AS id,
           json_agg(json_build_object('fecha', p.fecha_pago, 'monto', p.monto_transferido) ORDER BY p.fecha_pago, p.created_at) AS fechas
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL
      AND (p.grupo_id IN (SELECT id FROM g) OR p.cuenta_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL))
    GROUP BY 1
  ),
  g_items AS (
    SELECT cp.grupo_id AS id, count(*) AS n,
           (array_agg(cp.item_descripcion ORDER BY cp.created_at, cp.id))[1] AS descripcion,
           (array_agg(cp.responsable_nombre ORDER BY cp.created_at, cp.id))[1] AS responsable_nombre
    FROM cp WHERE cp.grupo_id IS NOT NULL
    GROUP BY cp.grupo_id
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee,
           ROUND(SUM(c.utilidad_total), 2) AS utilidad, ROUND(SUM(c.iva), 2) AS iva
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  )
  SELECT json_build_object(
    'proyectos', COALESCE((
      SELECT json_agg(json_build_array(
        py.id, py.proyecto, py.cliente, py.cliente_id, py.fecha_entrega,
        COALESCE(cot.margen, 0), COALESCE(cot.fee, 0), COALESCE(cot.utilidad, 0), COALESCE(cot.iva, 0), py.reabierta
      ) ORDER BY py.created_at DESC, py.id DESC)
      FROM py
      LEFT JOIN cot ON cot.pid = py.id
      WHERE py.id IN (SELECT cc.proyecto_id FROM cc UNION SELECT cp.proyecto_id FROM cp)
    ), '[]'::json),
    'cobros', COALESCE((
      SELECT json_agg(json_build_array(
        cc.id, cc.cotizacion_id, cc.proyecto_id, cc.folio, cc.cliente, cc.cliente_id, cc.proyecto,
        cc.monto_total, COALESCE(cc.monto_pagado, 0), cc.fecha_vencimiento, cc.fecha_factura,
        f.docs, pg.pagos
      ) ORDER BY cc.created_at, cc.id)
      FROM cc
      LEFT JOIN cc_facturas f ON f.id = cc.id
      LEFT JOIN cc_pagos pg ON pg.id = cc.id
    ), '[]'::json),
    'pagos', COALESCE((
      SELECT json_agg(json_build_array(
        cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.responsable_nombre,
        cp.item_descripcion, cp.x_pagar, COALESCE(cp.monto_pagado, 0), cp.total_a_transferir,
        cp.monto_transferido, cp.orden_pago_id, pr.regimen_fiscal,
        d.facturas, d.comprobantes, pf.fechas
      ) ORDER BY cp.created_at, cp.id)
      FROM cp
      LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
      LEFT JOIN p_docs d ON d.id = cp.id
      LEFT JOIN p_fechas pf ON pf.id = cp.id
      WHERE cp.grupo_id IS NULL
    ), '[]'::json),
    'grupos', COALESCE((
      SELECT json_agg(json_build_array(
        g.id, g.proyecto_id, g.responsable_id, COALESCE(pr.nombre, gi.responsable_nombre), pr.regimen_fiscal,
        g.monto_total, COALESCE(g.monto_pagado, 0), g.total_a_transferir, g.monto_transferido, g.orden_pago_id,
        d.facturas, d.comprobantes, pf.fechas, COALESCE(gi.n, 0), gi.descripcion
      ) ORDER BY g.created_at, g.id)
      FROM g
      LEFT JOIN g_items gi ON gi.id = g.id
      LEFT JOIN proveedores pr ON pr.id = g.responsable_id
      LEFT JOIN p_docs d ON d.id = g.id
      LEFT JOIN p_fechas pf ON pf.id = g.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Derivación en SQL (paridad con concepto.ts / periodo.ts): cuentas_conceptos
-- gana proyecto_reabierta (cambia su RETURNS TABLE: se recrea).
DROP FUNCTION IF EXISTS public.cuentas_conceptos(integer, date);
CREATE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
RETURNS TABLE (
  proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text,
  fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean,
  margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean,
  concepto_creado timestamptz, key text, tipo text, objetivo text, id text, proyecto_id text,
  cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer,
  total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text,
  fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric,
  venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean,
  complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
AS $$
  WITH
  py AS (
    SELECT p.id, p.proyecto AS nombre, p.cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           CASE WHEN p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_entrega END AS fecha_entrega
    FROM proyectos p
    WHERE p_year IS NULL
       OR (p.fecha_entrega >= lpad(p_year::text, 4, '0') || '-01-01'
           AND p.fecha_entrega < lpad((p_year + 1)::text, 4, '0') || '-01-01'
           AND p.fecha_entrega ~ '^\d{4}-\d{2}-\d{2}$')
       OR p.fecha_entrega IS NULL
       OR p.fecha_entrega !~ '^\d{4}-\d{2}-\d{2}$'
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, c.cliente, c.cliente_id, c.monto_total, c.monto_pagado,
           c.fecha_vencimiento, c.fecha_factura, c.created_at
    FROM cuentas_cobrar c WHERE c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py)
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.responsable_nombre, c.item_descripcion,
           c.x_pagar, c.total_a_transferir, c.monto_transferido, c.orden_pago_id, c.created_at
    FROM cuentas_pagar c WHERE c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total, gr.total_a_transferir, gr.monto_transferido,
           gr.orden_pago_id, gr.created_at
    FROM cuentas_pagar_grupos gr WHERE gr.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee, ROUND(SUM(c.iva), 2) AS iva
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id)
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807
    WHERE EXISTS (SELECT 1 FROM cc WHERE proyecto_id IS NULL) OR EXISTS (SELECT 1 FROM cp WHERE proyecto_id IS NULL)
  ),

  -- Cobros ------------------------------------------------------------------
  cc_factura AS (
    SELECT DISTINCT ON (d.cuentas_cobrar_id) d.cuentas_cobrar_id AS cc_id, d.estado_validacion, d.metodo_pago_cfdi, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.tipo = 'FACTURA_XML' AND d.cuentas_cobrar_id IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY d.cuentas_cobrar_id, d.fecha_carga DESC
  ),
  cc_comp AS (
    SELECT DISTINCT ON (d.pago_id, d.tipo) d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    ORDER BY d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  cc_pago AS (
    SELECT pc.cuentas_cobrar_id AS cc_id, pc.id AS pago_id, pc.fecha_pago, pc.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           -- V4: un pago anterior a la factura (o sin fecha de factura: se pide) es anticipo.
           (c.fecha_factura IS NULL OR pc.fecha_pago > c.fecha_factura) AS requiere,
           CASE
             WHEN NOT (c.fecha_factura IS NULL OR pc.fecha_pago > c.fecha_factura) THEN 'anticipo'
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_comprobantes pc
    JOIN cc c ON c.id = pc.cuentas_cobrar_id
    LEFT JOIN cc_comp x ON x.pago_id = pc.id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN cc_comp f ON f.pago_id = pc.id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
    WHERE pc.anulado_at IS NULL
  ),
  cc_pagos AS (
    SELECT cc_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', requiere, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(requiere AND estado <> 'completo') AS pendiente,
           bool_or(requiere AND estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, ((xml_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, ((pdf_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM cc_pago
    GROUP BY cc_id
  ),
  cobro AS (
    SELECT c.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta,
           round(c.monto_total, 2) AS v_total, round(COALESCE(c.monto_pagado, 0), 2) AS v_pagado,
           greatest(0, round(c.monto_total - COALESCE(c.monto_pagado, 0), 2)) AS v_saldo,
           f.estado_validacion AS f_estado, f.metodo_pago_cfdi AS metodo, f.fecha_carga AS f_fecha,
           (f.cc_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.cc_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pg.complementos, COALESCE(pg.pendiente, false) AS comp_pendiente, COALESCE(pg.en_revision, false) AS comp_revision,
           pg.fecha_max AS pagos_fecha_max
    FROM cc c
    JOIN proy pr ON pr.key = COALESCE(c.proyecto_id, 'sin-proyecto')
    LEFT JOIN cc_factura f ON f.cc_id = c.id
    LEFT JOIN cc_pagos pg ON pg.cc_id = c.id
  ),
  cobro_d AS (
    SELECT b.*,
           CASE WHEN b.fecha_vencimiento IS NOT NULL AND b.v_saldo > 0.005 THEN b.fecha_vencimiento - p_hoy END AS dias
    FROM cobro b
  ),
  cobro_e AS (
    SELECT b.*,
           (b.dias IS NOT NULL AND b.dias < 0) AS vencido,
           CASE
             WHEN NOT b.tiene_factura THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN b.fact_revision THEN 'en_revision' ELSE 'sin_factura' END
             WHEN b.v_saldo > 0.005 THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN COALESCE(b.monto_pagado, 0) > 0.005 THEN 'parcial' ELSE 'facturado' END
             WHEN b.metodo IS NULL THEN 'sin_complemento'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN 'sin_complemento'
             ELSE 'cobrado'
           END AS d_estado,
           CASE
             WHEN NOT b.tiene_factura THEN CASE WHEN b.fact_revision THEN 'revisar_factura' ELSE 'emitir_factura' END
             WHEN b.v_saldo > 0.005 THEN 'cobrar'
             WHEN b.metodo IS NULL THEN 'indicar_metodo'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN CASE WHEN b.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM cobro_d b
  ),

  -- Pagos a proveedor (grupos y sueltas) -------------------------------------
  obj AS (
    SELECT 'grupo'::text AS objetivo, gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total AS neto,
           gr.total_a_transferir, COALESCE(gr.monto_transferido, 0) AS transferido, gr.orden_pago_id, gr.created_at
    FROM g gr
    UNION ALL
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.x_pagar,
           c.total_a_transferir, COALESCE(c.monto_transferido, 0), c.orden_pago_id, c.created_at
    FROM cp c WHERE c.grupo_id IS NULL
  ),
  p_factura AS (
    SELECT DISTINCT ON (COALESCE(d.grupo_id, d.cuentas_pagar_id)) COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id,
           d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.tipo = 'FACTURA_PROVEEDOR_XML' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
    ORDER BY COALESCE(d.grupo_id, d.cuentas_pagar_id), d.fecha_carga DESC
  ),
  -- Comprobantes (D11): documentos COMPROBANTE_PAGO y pagos con comprobante.
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT COALESCE(d.grupo_id, d.cuentas_pagar_id) AS obj_id, d.fecha_carga AT TIME ZONE 'UTC' AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND COALESCE(d.grupo_id, d.cuentas_pagar_id) IS NOT NULL AND d.eliminado_at IS NULL
      UNION ALL
      SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id), p.created_at
      FROM pagos_cuentas_pagar p
      WHERE p.anulado_at IS NULL AND p.comprobante_url IS NOT NULL AND COALESCE(p.grupo_id, p.cuenta_pagar_id) IS NOT NULL
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT COALESCE(p.grupo_id, p.cuenta_pagar_id) AS obj_id, max(p.fecha_pago) AS fecha_max
    FROM pagos_cuentas_pagar p
    WHERE p.anulado_at IS NULL AND COALESCE(p.grupo_id, p.cuenta_pagar_id) IS NOT NULL
    GROUP BY 1
  ),
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(c.item_descripcion ORDER BY c.created_at, c.id))[1] AS descripcion,
           (array_agg(c.responsable_nombre ORDER BY c.created_at, c.id))[1] AS responsable_nombre
    FROM cp c WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, s.responsable_nombre AS s_responsable_nombre, s.item_descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion, gi.responsable_nombre AS g_responsable_nombre,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN g_items gi ON o.objetivo = 'grupo' AND gi.grupo_id = o.id
    LEFT JOIN p_factura f ON f.obj_id = o.id
    LEFT JOIN p_comp pc ON pc.obj_id = o.id
    LEFT JOIN p_fechas pf ON pf.obj_id = o.id
  ),
  -- Cruce por régimen del neto (espejo de calcularEjemploFactura): IVA 16%,
  -- retención de IVA 2/3 e ISR 10% (física) o 1.25% (RESICO); moral no retiene.
  pago_f AS (
    SELECT p.*, round(p.neto, 2) AS c_subtotal, round(round(p.neto, 2) * 0.16, 2) AS c_iva,
           CASE WHEN p.regimen IN ('fisica', 'resico') THEN round(round(p.neto, 2) * (2.0 / 3.0 * 0.16), 2) ELSE 0 END AS c_iva_ret,
           CASE p.regimen WHEN 'fisica' THEN round(round(p.neto, 2) * 0.10, 2)
                          WHEN 'resico' THEN round(round(p.neto, 2) * 0.0125, 2)
                          ELSE 0 END AS c_isr_ret
    FROM pago p
  ),
  pago_m AS (
    SELECT p.*,
           CASE WHEN p.total_a_transferir IS NULL THEN round(p.c_subtotal + p.c_iva - p.c_iva_ret - p.c_isr_ret, 2)
                ELSE round(p.total_a_transferir, 2) END AS v_total,
           round(p.transferido, 2) AS v_pagado,
           (p.objetivo = 'grupo' OR p.responsable_id IS NOT NULL) AS tiene_proveedor
    FROM pago_f p
  ),
  pago_e AS (
    SELECT p.*,
           greatest(0, round(p.v_total - p.v_pagado, 2)) AS v_saldo
    FROM pago_m p
  ),
  pago_d AS (
    SELECT p.*,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'sin_proveedor'
             WHEN p.fact_revision THEN 'en_revision'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'sin_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    WHEN p.v_pagado > 0.005 THEN 'parcial'
                    ELSE 'facturado' END
             ELSE 'pagado'
           END AS d_estado,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'asignar_proveedor'
             WHEN p.fact_revision THEN 'revisar_factura'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'subir_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    ELSE 'pagar' END
             WHEN NOT p.tiene_factura THEN 'subir_factura'
             WHEN p.comp_ts IS NULL THEN 'subir_comprobante'
           END AS d_paso
    FROM pago_e p
  )

  SELECT c.pkey, c.p_orden, c.p_nombre, c.p_cliente, c.p_fecha,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen, c.p_fee, c.p_iva, c.p_reabierta,
         c.created_at,
         'c:' || c.id, 'cobro', 'cobro', c.id::text, c.proyecto_id, c.cotizacion_id, c.folio,
         COALESCE(c.cliente, c.p_cliente, 'Cliente'), c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END,
         1, c.v_total, c.v_pagado, false, NULL, NULL, c.fecha_vencimiento::text,
         c.d_estado, c.d_paso, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo, c.dias, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest(((c.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
         c.tiene_factura AND c.metodo IS NULL AND c.d_estado <> 'cobrado',
         CASE WHEN c.tiene_factura AND c.metodo = 'PPD' THEN COALESCE(c.complementos, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULL::numeric, NULL::numeric, NULL::numeric
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey, p.p_orden, p.p_nombre, p.p_cliente, p.p_fecha,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen, p.p_fee, p.p_iva, p.p_reabierta,
         p.created_at,
         CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id, 'pago', p.objetivo, p.id::text, p.proyecto_id,
         CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END, NULL,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.prov_nombre, p.g_responsable_nombre, 'Proveedor')
              WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.s_responsable_nombre, 'Proveedor')
              ELSE 'Sin asignar' END,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END,
         p.v_total, p.v_pagado, p.total_a_transferir IS NULL, p.regimen, p.orden_pago_id::text, NULL,
         p.d_estado, p.d_paso, false, p.v_saldo, NULL, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest(((p.f_fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max) END,
         false, '[]'::jsonb,
         p.c_iva, p.c_iva_ret, p.c_isr_ret
  FROM pago_d p;
$$;

CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET work_mem = '16MB'
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[\u0300-\u036f]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_result    jsonb;
BEGIN
  WITH
  con AS MATERIALIZED (
    SELECT * FROM cuentas_conceptos(v_anio, v_hoy)
  ),
  -- Por proyecto, sobre todos sus conceptos (D17, totales y cierre fiscal).
  proj AS MATERIALIZED (
    SELECT c.proyecto_key AS key,
           min(c.proyecto_orden) AS orden,
           min(c.proyecto_nombre) AS nombre,
           min(c.proyecto_cliente) AS cliente,
           min(c.fecha_entrega) AS fecha_entrega,
           min(c.anio) AS anio,
           min(c.mes) AS mes,
           bool_and(c.sin_fecha) AS sin_fecha,
           bool_and(c.sin_proyecto) AS sin_proyecto,
           bool_and(c.proyecto_reabierta) AS reabierta,
           count(*) FILTER (WHERE NOT c.resuelto) AS pendientes,
           bool_or(c.estado = 'vencido') AS hay_vencidos,
           max(c.fecha_resuelto) AS fecha_resuelto_max,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS por_pagar,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.cierre_iva_retenido), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.margen) AS margen, min(c.fee) AS fee, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           round(x.margen + x.fee, 2) AS utilidad_bruta,
           round(greatest(0, round(x.margen + x.fee, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.margen + x.fee, 2) - round(greatest(0, round(x.margen + x.fee, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto
    FROM proj x
  ),
  -- S16: sin mes, el actual si es el año en curso; si no, el último con proyectos.
  mes_ef AS (
    SELECT CASE
             WHEN v_mes_txt = 'todo' THEN NULL
             WHEN v_mes_txt ~ '^\d+$' THEN v_mes_txt::int
             WHEN v_anio = extract(year FROM v_hoy)::int THEN extract(month FROM v_hoy)::int
             ELSE (SELECT max(mes) FROM pj WHERE NOT sin_fecha AND anio = v_anio)
           END AS mes
  ),
  -- Conceptos que pasan tipo, cliente, proveedor y búsqueda.
  -- Búsqueda (normalizarBusqueda): los cinco campos se normalizan juntos,
  -- separados por U+001F (la búsqueda no lo puede contener), en una sola
  -- pasada por concepto. normalize() es lo caro: un texto solo ASCII
  -- (bytes = caracteres) no tiene acentos y se salta.
  fc AS MATERIALIZED (
    SELECT c.*
    FROM con c
    CROSS JOIN LATERAL (
      SELECT concat_ws(chr(31), c.proyecto_key, c.proyecto_nombre, COALESCE(c.proyecto_cliente, ''), c.contraparte, c.concepto) AS texto
    ) b
    WHERE (v_tipo = 'todo' OR c.tipo = v_tipo)
      AND (v_cliente IS NULL OR (c.tipo = 'cobro' AND c.contraparte = v_cliente))
      AND (v_proveedor IS NULL OR (c.tipo = 'pago' AND c.contraparte = v_proveedor))
      AND (v_q = ''
           OR strpos(CASE WHEN octet_length(b.texto) = char_length(b.texto) THEN lower(b.texto)
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[\u0300-\u036f]', '', 'g')) END,
                     v_q) > 0)
  ),
  dec AS MATERIALIZED (
    SELECT pj.*,
           (v_estado = 'todas' OR (v_estado = 'pendientes' AND NOT pj.cerradas) OR (v_estado = 'cerradas' AND pj.cerradas)) AS estado_ok
    FROM pj
    WHERE pj.key IN (SELECT proyecto_key FROM fc)
  ),
  del_anio AS (
    SELECT * FROM dec WHERE NOT sin_fecha AND anio = v_anio
  ),
  alcance AS MATERIALIZED (
    SELECT d.* FROM del_anio d, mes_ef m WHERE m.mes IS NULL OR d.mes = m.mes
  ),
  -- Proyectos a mostrar: los del periodo, y en "Todo el año" también "Sin fecha" (S17).
  vis AS MATERIALIZED (
    SELECT a.*, row_number() OVER (ORDER BY a.mes, a.cerradas, a.orden) AS pos, false AS es_sin_fecha
    FROM alcance a WHERE a.estado_ok
    UNION ALL
    SELECT d.*, 1000000 + row_number() OVER (ORDER BY d.orden), true
    FROM dec d, mes_ef m
    WHERE m.mes IS NULL AND d.sin_fecha AND d.estado_ok
  ),
  -- Orden de la lista: el de las tarjetas y, dentro del proyecto, cobros,
  -- luego grupos, luego sueltas, cada uno por creación. Se numeran solo las
  -- llaves (ordenar la fila completa costaba ~60 ms); la fila entera se
  -- vuelve a leer solo para la página pedida.
  filas AS MATERIALIZED (
    SELECT f.key, f.proyecto_key,
           row_number() OVER (ORDER BY v.pos, f.tipo = 'pago', f.objetivo = 'cuenta', f.concepto_creado, f.id) AS n
    FROM fc f
    JOIN vis v ON v.key = f.proyecto_key
    WHERE v_estado <> 'pendientes' OR NOT f.resuelto
  ),
  tarjetas AS (
    SELECT v.pos, v.es_sin_fecha,
           jsonb_build_object(
             'id', v.key, 'nombre', v.nombre, 'cliente', v.cliente, 'fecha_entrega', v.fecha_entrega,
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar)
           ) AS t
    FROM vis v
  ),
  -- Totales del periodo: conceptos filtrados de los proyectos del alcance y su cierre.
  tot_c AS (
    SELECT round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta
    FROM alcance
  )
  SELECT jsonb_build_object(
    'anio', v_anio,
    'mes', COALESCE(to_jsonb(m.mes), '"todo"'::jsonb),
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'meses', (
      SELECT jsonb_agg(jsonb_build_object(
               'mes', s.m,
               'proyectos', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m),
               'pendientes', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND NOT d.cerradas),
               'visibles', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND d.estado_ok)
             ) ORDER BY s.m)
      FROM generate_series(1, 12) AS s(m)
    ),
    'conteo', (
      SELECT jsonb_build_object('todas', count(*), 'pendientes', count(*) FILTER (WHERE NOT cerradas), 'cerradas', count(*) FILTER (WHERE cerradas))
      FROM alcance
    ),
    'totales', (
      SELECT jsonb_build_object(
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones + t.isr, 2))
      )
      FROM tot_c c, tot_p t
    ),
    'opciones', jsonb_build_object(
      'clientes', COALESCE((SELECT jsonb_agg(x ORDER BY x COLLATE "es-x-icu")
                            FROM (SELECT DISTINCT contraparte AS x FROM con WHERE tipo = 'cobro') s), '[]'::jsonb),
      'proveedores', COALESCE((SELECT jsonb_agg(x ORDER BY x COLLATE "es-x-icu")
                               FROM (SELECT DISTINCT contraparte AS x FROM con WHERE tipo = 'pago' AND contraparte_id IS NOT NULL) s), '[]'::jsonb)
    ),
    'proyectos', CASE WHEN v_vista = 'proyectos' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM (
                   SELECT t, pos FROM tarjetas WHERE NOT es_sin_fecha ORDER BY pos
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x), '[]'::jsonb),
        'total', (SELECT count(*) FROM vis WHERE NOT es_sin_fecha),
        'page', v_page, 'page_size', v_size)
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size) END,
    'sin_fecha', CASE WHEN v_vista = 'proyectos'
      THEN COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM tarjetas WHERE es_sin_fecha), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'lista', CASE WHEN v_vista = 'lista' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$$;

-- ── Permisos: solo service_role ───────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.cuentas_reapertura_activa(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_reapertura_activa(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reabrir_cuentas_proyecto(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_cuentas_proyecto(text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cerrar_cuentas_proyecto(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_cuentas_proyecto(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_cobrar_estado_calculado(cuentas_cobrar, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_cobrar_estado_calculado(cuentas_cobrar, numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public.anular_pago_cobro(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago_cobro(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.anular_pago_proveedor(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago_proveedor(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.baja_documento_cobro(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.baja_documento_cobro(uuid, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.baja_documento_pago(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.baja_documento_pago(uuid, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.corregir_datos_cobro(uuid, date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_datos_cobro(uuid, date, date, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.corregir_datos_pago(text, uuid, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_datos_pago(text, uuid, date, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.corregir_proveedor_cuenta_pagar(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_proveedor_cuenta_pagar(uuid, uuid, text, text, text, text, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_conceptos(integer, date) TO service_role;

COMMIT;
