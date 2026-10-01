-- Guardas de consistencia del modelo de datos (PLAN.md, B0).
--
-- Solo lectura. Una fila por guarda con el número de violaciones; todo debe
-- dar 0. Se corre en test y producción antes y después de cada migración de
-- la iniciativa "Simplificación del modelo de datos":
--
--   mcp__Supabase__execute_sql / SQL Editor, pegar el archivo completo.
--   o:  psql "$DATABASE_URL" -f scripts/db/guardas-modelo.sql
--
-- Las filas con `violaciones > 0` son la lista de trabajo; para ver los ids
-- ofensores, ejecutar el SELECT interno de esa guarda.
--
-- Tolerancia de 1 centavo (0.01) en comparaciones de dinero: los montos son
-- NUMERIC(15,2) pero se calculan con ROUND en distintas RPCs.
--
-- Guardas marcadas "temporal" caducan cuando B5c elimina las copias.

WITH
-- 1. Σ pagos vigentes = monto_pagado
g_cobro_pagado AS (
  SELECT cc.id
  FROM cuentas_cobrar cc
  WHERE abs(cc.monto_pagado - COALESCE((
    SELECT SUM(p.monto) FROM pagos_comprobantes p
    WHERE p.cuentas_cobrar_id = cc.id AND p.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_pagado AS (
  SELECT g.id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(p.monto_neto) FROM pagos_cuentas_pagar p
    WHERE p.grupo_id = g.id AND p.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_transferido AS (
  SELECT g.id
  FROM cuentas_pagar_grupos g
  WHERE abs(COALESCE(g.monto_transferido, 0) - COALESCE((
    SELECT SUM(p.monto_transferido) FROM pagos_cuentas_pagar p
    WHERE p.grupo_id = g.id AND p.anulado_at IS NULL), 0)) > 0.01
),
-- 1b. Σ hijas (renglones) = grupo
g_hijas_grupo AS (
  SELECT g.id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(cp.monto_pagado) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
-- 2. grupo.monto_total = Σ costo_total de sus renglones (trigger 20261008)
g_grupo_total AS (
  SELECT g.id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_total - COALESCE((
    SELECT SUM(cp.costo_total) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
-- 2b. grupo ABIERTO sin renglones
g_grupo_vacio AS (
  SELECT g.id
  FROM cuentas_pagar_grupos g
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
),
-- 3. cp.costo_total = item.costo_unitario × item.cantidad (Costo Total, ADR 006)
g_cp_costo_total AS (
  SELECT cp.id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE abs(cp.costo_total - round(i.costo_unitario * i.cantidad, 2)) > 0.01
),
-- 4. total de la orden = Σ desglose
g_orden_total AS (
  SELECT o.id
  FROM ordenes_pago o
  WHERE abs(o.total_monto - COALESCE((
    SELECT SUM(c.neto_cubierto) FROM ordenes_pago_conceptos c
    WHERE c.orden_pago_id = o.id), 0)) > 0.01
),
-- 5. importe = cantidad × precio; margen = importe − costo total
g_item_importe AS (
  SELECT i.id
  FROM items_cotizacion i
  WHERE abs(i.importe - round(i.cantidad * i.precio_unitario, 2)) > 0.01
),
g_item_margen AS (
  SELECT i.id
  FROM items_cotizacion i
  WHERE abs(i.margen - (i.importe - round(i.costo_unitario * i.cantidad, 2))) > 0.01
),
-- 6. cuentas_cobrar.monto_total = cotización.total
g_cobro_total AS (
  SELECT cc.id
  FROM cuentas_cobrar cc
  JOIN cotizaciones c ON c.id = cc.cotizacion_id
  WHERE abs(cc.monto_total - c.total) > 0.01
),
-- 7. K4: renglón de cotización APROBADA con costo_unitario > 0 <=> cuenta por pagar
g_k4_sin_cuenta AS (
  SELECT i.id
  FROM items_cotizacion i
  JOIN cotizaciones c ON c.id = i.cotizacion_id AND c.estado = 'APROBADA'
  WHERE i.costo_unitario > 0
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.item_id = i.id)
),
g_k4_cuenta_sin_item AS (
  SELECT cp.id
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = cp.item_id)
),
g_k4_item_cero AS (
  SELECT cp.id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE i.costo_unitario <= 0
),
-- 8. cuenta con proveedor => grupo (desde B5b también la valida un constraint trigger al COMMIT)
g_cp_sin_grupo AS (
  SELECT cp.id
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
),
-- 9. folios CC / CP únicos y no nulos
g_folio_cc AS (
  SELECT cc.id FROM cuentas_cobrar cc
  WHERE cc.folio IS NULL
     OR cc.folio IN (SELECT folio FROM cuentas_cobrar GROUP BY folio HAVING count(*) > 1)
),
g_folio_cp AS (
  SELECT cp.id FROM cuentas_pagar cp
  WHERE cp.folio IS NULL
     OR cp.folio IN (SELECT folio FROM cuentas_pagar GROUP BY folio HAVING count(*) > 1)
)
SELECT guarda, violaciones FROM (
  SELECT 1 AS n, 'cobro: monto_pagado = Σ pagos vigentes' AS guarda, count(*) AS violaciones FROM g_cobro_pagado
  UNION ALL SELECT 2, 'grupo: monto_pagado = Σ pagos vigentes (neto)', count(*) FROM g_grupo_pagado
  UNION ALL SELECT 3, 'grupo: monto_transferido = Σ pagos vigentes (transferido)', count(*) FROM g_grupo_transferido
  UNION ALL SELECT 4, 'grupo: monto_pagado = Σ monto_pagado de renglones', count(*) FROM g_hijas_grupo
  UNION ALL SELECT 5, 'grupo: monto_total = Σ costo_total de renglones', count(*) FROM g_grupo_total
  UNION ALL SELECT 6, 'grupo sin renglones', count(*) FROM g_grupo_vacio
  UNION ALL SELECT 7, 'cuenta por pagar: costo_total = item.costo_unitario × cantidad', count(*) FROM g_cp_costo_total
  UNION ALL SELECT 8, 'orden: total_monto = Σ desglose', count(*) FROM g_orden_total
  UNION ALL SELECT 9, 'renglón: importe = cantidad × precio', count(*) FROM g_item_importe
  UNION ALL SELECT 10, 'renglón: margen = importe − costo total', count(*) FROM g_item_margen
  UNION ALL SELECT 11, 'cobro: monto_total = cotización.total', count(*) FROM g_cobro_total
  UNION ALL SELECT 12, 'K4: renglón aprobado con costo_unitario > 0 sin cuenta por pagar', count(*) FROM g_k4_sin_cuenta
  UNION ALL SELECT 13, 'K4: cuenta por pagar sin item_id o con item inexistente', count(*) FROM g_k4_cuenta_sin_item
  UNION ALL SELECT 14, 'K4: cuenta por pagar de un renglón con costo_unitario <= 0', count(*) FROM g_k4_item_cero
  UNION ALL SELECT 15, 'cuenta por pagar con proveedor y sin grupo', count(*) FROM g_cp_sin_grupo
  UNION ALL SELECT 16, 'folio CC nulo o duplicado', count(*) FROM g_folio_cc
  UNION ALL SELECT 17, 'folio CP nulo o duplicado', count(*) FROM g_folio_cp
) t
ORDER BY n;
