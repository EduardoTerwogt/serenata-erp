-- B7 (docs/PLAN.md, F9, K12): `auditar_consistencia()` reúne las guardas permanentes
-- del modelo (dinero, renglones, K4, K1, folios) en una función de solo lectura que
-- devuelve, por guarda, cuántas violaciones hay y hasta 5 ids de ejemplo. La corre el
-- cron diario (`/api/keep-alive`) y la ve el administrador en Admin. Sustituye a
-- `scripts/db/guardas-modelo.sql` (retirado en el mismo PR).
--
-- Aditiva e idempotente (CREATE OR REPLACE); solo lectura sobre datos de negocio.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.auditar_consistencia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
g_cobro_pagado AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE abs(cc.monto_pagado - COALESCE((
    SELECT SUM(p.monto) FROM pagos_comprobantes p
    WHERE p.cuentas_cobrar_id = cc.id AND p.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_pagado AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(p.monto_neto) FROM pagos_cuentas_pagar p
    WHERE p.grupo_id = g.id AND p.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_transferido AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(COALESCE(g.monto_transferido, 0) - COALESCE((
    SELECT SUM(p.monto_transferido) FROM pagos_cuentas_pagar p
    WHERE p.grupo_id = g.id AND p.anulado_at IS NULL), 0)) > 0.01
),
g_hijas_grupo AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(cp.monto_pagado) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_total AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_total - COALESCE((
    SELECT SUM(cp.costo_total) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_vacio AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
),
g_cp_costo_total AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE abs(cp.costo_total - round(i.costo_unitario * i.cantidad, 2)) > 0.01
),
g_orden_total AS (
  SELECT o.id::text AS id
  FROM ordenes_pago o
  WHERE abs(o.total_monto - COALESCE((
    SELECT SUM(c.neto_cubierto) FROM ordenes_pago_conceptos c
    WHERE c.orden_pago_id = o.id), 0)) > 0.01
),
g_item_importe AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.importe - round(i.cantidad * i.precio_unitario, 2)) > 0.01
),
g_item_margen AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.margen - (i.importe - round(i.costo_unitario * i.cantidad, 2))) > 0.01
),
g_cobro_total AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  JOIN cotizaciones c ON c.id = cc.cotizacion_id
  WHERE abs(cc.monto_total - c.total) > 0.01
),
g_k4_sin_cuenta AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  JOIN cotizaciones c ON c.id = i.cotizacion_id AND c.estado = 'APROBADA'
  WHERE i.costo_unitario > 0
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.item_id = i.id)
),
g_k4_cuenta_sin_item AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = cp.item_id)
),
g_k4_item_cero AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE i.costo_unitario <= 0
),
g_cp_sin_grupo AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
),
g_folio_cc AS (
  SELECT cc.id::text AS id FROM cuentas_cobrar cc
  WHERE cc.folio IS NULL
     OR cc.folio IN (SELECT folio FROM cuentas_cobrar GROUP BY folio HAVING count(*) > 1)
),
g_folio_cp AS (
  SELECT cp.id::text AS id FROM cuentas_pagar cp
  WHERE cp.folio IS NULL
     OR cp.folio IN (SELECT folio FROM cuentas_pagar GROUP BY folio HAVING count(*) > 1)
),
  resultado(clave, descripcion, violaciones, ejemplos) AS (
    VALUES
      ('cobro_pagado', 'cuentas por cobrar: monto_pagado = Σ pagos vigentes', (SELECT count(*) FROM g_cobro_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_pagado', 'grupos de pago: monto_pagado = Σ pagos vigentes (neto)', (SELECT count(*) FROM g_grupo_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_transferido', 'grupos de pago: monto_transferido = Σ pagos vigentes (transferido)', (SELECT count(*) FROM g_grupo_transferido), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_transferido ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_hijas', 'grupos de pago: monto_pagado = Σ monto_pagado de sus renglones', (SELECT count(*) FROM g_hijas_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_hijas_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_total', 'grupos de pago: monto_total = Σ costo_total de sus renglones', (SELECT count(*) FROM g_grupo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_vacio', 'grupos de pago sin renglones', (SELECT count(*) FROM g_grupo_vacio), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_vacio ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_costo_total', 'cuentas por pagar: costo_total = costo_unitario × cantidad del renglón', (SELECT count(*) FROM g_cp_costo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_costo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('orden_total', 'órdenes de pago: total_monto = Σ desglose', (SELECT count(*) FROM g_orden_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_orden_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_importe', 'renglones: importe = cantidad × precio', (SELECT count(*) FROM g_item_importe), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_importe ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_margen', 'renglones: margen = importe − costo total', (SELECT count(*) FROM g_item_margen), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_margen ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cobro_total', 'cuentas por cobrar: monto_total = total de la cotización', (SELECT count(*) FROM g_cobro_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_sin_cuenta', 'renglón aprobado con costo_unitario > 0 sin cuenta por pagar', (SELECT count(*) FROM g_k4_sin_cuenta), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_sin_cuenta ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_cuenta_sin_item', 'cuenta por pagar sin renglón', (SELECT count(*) FROM g_k4_cuenta_sin_item), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_cuenta_sin_item ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_item_cero', 'cuenta por pagar de un renglón con costo_unitario <= 0', (SELECT count(*) FROM g_k4_item_cero), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_item_cero ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_sin_grupo', 'cuenta por pagar con proveedor y sin grupo', (SELECT count(*) FROM g_cp_sin_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_sin_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cc', 'folio de cuenta por cobrar nulo o duplicado', (SELECT count(*) FROM g_folio_cc), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cc ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cp', 'folio de cuenta por pagar nulo o duplicado', (SELECT count(*) FROM g_folio_cp), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cp ORDER BY id LIMIT 5) m), '{}'::text[]))
  )
  SELECT jsonb_build_object(
    'ejecutado_en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'total_violaciones', COALESCE(sum(violaciones), 0),
    'guardas', COALESCE(jsonb_agg(jsonb_build_object(
      'clave', clave, 'descripcion', descripcion, 'violaciones', violaciones, 'ejemplos', to_jsonb(ejemplos)
    ) ORDER BY clave), '[]'::jsonb)
  )
  FROM resultado;
$function$;

REVOKE EXECUTE ON FUNCTION public.auditar_consistencia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_consistencia() TO service_role;

COMMIT;
