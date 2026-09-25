-- Rediseño de Cuentas, B1b (docs/PLAN.md, S1): desglose inmutable de cada
-- orden de pago.
--
-- Hasta hoy el desglose de una orden era el `orden_pago_id` de grupos y
-- sueltas: cancelar la orden lo quita y reingresar a otra orden lo pisa, así
-- que el historial perdía qué cubría cada orden y por cuánto. Esta tabla es
-- un snapshot que escribe `generar_orden_pago` y que nadie actualiza ni
-- borra, tampoco al cancelar la orden.
--
-- `grupo_id` / `cuenta_pagar_id` / `responsable_id` no llevan llave foránea
-- a propósito: el snapshot tiene que sobrevivir a que la fila viva cambie o
-- desaparezca. `orden_pago_id` sí la lleva (sin cascada): una orden con
-- desglose no se puede borrar.
--
-- RLS activo y sin políticas, como el resto de las tablas de cuentas: solo
-- service_role la lee y escribe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ordenes_pago_conceptos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_pago_id      uuid NOT NULL REFERENCES public.ordenes_pago(id),
  grupo_id           uuid,
  cuenta_pagar_id    uuid,
  responsable_id     uuid,
  responsable_nombre text,
  proyecto_id        text,
  cotizacion_folio   text,
  neto_cubierto      numeric(14, 2) NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ordenes_pago_conceptos_grupo_o_cuenta_check
    CHECK ((grupo_id IS NOT NULL) <> (cuenta_pagar_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ordenes_pago_conceptos_orden
  ON public.ordenes_pago_conceptos (orden_pago_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_conceptos_responsable
  ON public.ordenes_pago_conceptos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_conceptos_proyecto
  ON public.ordenes_pago_conceptos (proyecto_id);

ALTER TABLE public.ordenes_pago_conceptos ENABLE ROW LEVEL SECURITY;

-- Backfill de las órdenes existentes desde los `orden_pago_id` actuales
-- (D10: basta con que el historial no quede vacío). Un grupo cubre su
-- `monto_total` y una suelta su `x_pagar`: al generarse ninguna tenía pago
-- previo. Las hijas de un grupo van dentro del grupo, no por separado.
-- Idempotente: no repite un concepto que ya está en el desglose de su orden.
INSERT INTO public.ordenes_pago_conceptos
  (orden_pago_id, grupo_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, created_at)
SELECT
  g.orden_pago_id,
  g.id,
  g.responsable_id,
  pr.nombre,
  g.proyecto_id,
  (SELECT string_agg(DISTINCT cp.cotizacion_id, ',' ORDER BY cp.cotizacion_id)
     FROM public.cuentas_pagar cp WHERE cp.grupo_id = g.id),
  g.monto_total,
  COALESCE(o.created_at::timestamptz, now())
FROM public.cuentas_pagar_grupos g
JOIN public.ordenes_pago o ON o.id = g.orden_pago_id
LEFT JOIN public.proveedores pr ON pr.id = g.responsable_id
WHERE g.orden_pago_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.ordenes_pago_conceptos x WHERE x.grupo_id = g.id AND x.orden_pago_id = g.orden_pago_id);

INSERT INTO public.ordenes_pago_conceptos
  (orden_pago_id, cuenta_pagar_id, responsable_id, responsable_nombre, proyecto_id, cotizacion_folio, neto_cubierto, created_at)
SELECT
  cp.orden_pago_id,
  cp.id,
  cp.responsable_id,
  cp.responsable_nombre,
  cp.proyecto_id,
  cp.cotizacion_id,
  cp.x_pagar,
  COALESCE(o.created_at::timestamptz, now())
FROM public.cuentas_pagar cp
JOIN public.ordenes_pago o ON o.id = cp.orden_pago_id
WHERE cp.orden_pago_id IS NOT NULL
  AND cp.grupo_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.ordenes_pago_conceptos x WHERE x.cuenta_pagar_id = cp.id AND x.orden_pago_id = cp.orden_pago_id);

COMMIT;
