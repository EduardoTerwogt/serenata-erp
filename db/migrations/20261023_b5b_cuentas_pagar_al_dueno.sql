-- B5b etapa 2a (docs/PLAN.md, J3, D12): `cuentas_pagar` deja de guardar copias.
--
-- Nombre y contacto del proveedor, descripción, cantidad y margen del renglón se
-- leen del dueño (`proveedores`, `items_cotizacion`) por `responsable_id` e
-- `item_id`. Las columnas de pago de la cuenta suelta (`orden_pago_id`,
-- `total_a_transferir`, `monto_transferido`, `metodo_pago`) ya no las escribe
-- nadie desde B5a: orden, factura y transferencias viven en el grupo.
--
-- Contiene DROP: el MCP de Supabase no lo ejecuta, se corre a mano (SQL Editor)
-- en test y producción, igual que 20261016 y 20261021, una sola vez y en una sola
-- transacción. Orden M1: datos y llaves, luego se reescriben todos los lectores y
-- escritores y al final se borran las columnas.
--
-- Integridad (K1, clase 5, J8, K14): `item_id` pasa a uuid NOT NULL, UNIQUE y con
-- FK RESTRICT; FKs compuestas diferibles al renglón y al grupo; y las reglas
-- "proveedor ⇒ grupo" y "proveedor de la cuenta = proveedor del renglón" se
-- validan al COMMIT. Antes corrige los restos de datos que no las cumplen y
-- falla explícito si alguno tiene pagos o documentos.
--
-- También cierra la etapa 1: retira lo que quedó inerte (`buscar_*`, la
-- derivación vieja del estado de cobro y el sync de vencidas) y
-- `cuentas_cobrar.estado_anterior`, y el pago a cuenta suelta (20261020).

BEGIN;

-- 1. Retiros de funciones (J5, G9, B5a, B5b etapa 1) y firmas viejas.
DO $retiro$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('buscar_cuentas_pagar', 'buscar_cuentas_pagar_grupos', 'buscar_cuentas_cobrar',
                        'cuentas_cobrar_estado_calculado', 'sync_estados_cuentas_cobrar_vencidas',
                        'registrar_pago_cuenta_pagar')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.f;
  END LOOP;
END
$retiro$;

DROP FUNCTION IF EXISTS public.corregir_proveedor_cuenta_pagar(uuid, uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.reasignar_responsable_cuenta_pagar(uuid, uuid, text, text, text, text, text);

-- 2. Datos que la integridad nueva no admite. Fallan explícito si hay dinero de
-- por medio (pagos o documentos de la cuenta suelta); no borran nada con pagos.
DO $datos$
DECLARE
  v_n int;
BEGIN
  -- K1: toda cuenta con proveedor vive en un grupo. Las que no (legado) se agrupan
  -- con la misma función de siempre.
  SELECT count(*) INTO v_n
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
    AND (EXISTS (SELECT 1 FROM pagos_cuentas_pagar p WHERE p.cuenta_pagar_id = cp.id)
         OR EXISTS (SELECT 1 FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'datos_con_dinero: % cuentas sueltas con proveedor tienen pagos o documentos; resolverlas a mano antes de migrar', v_n;
  END IF;
  PERFORM reconcile_cuenta_pagar_grupo(cp.id)
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL;

  -- J8/K14: toda cuenta nace de un renglón. Una sin item_id es un resto sin dueño.
  SELECT count(*) INTO v_n
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
    AND (EXISTS (SELECT 1 FROM pagos_cuentas_pagar p WHERE p.cuenta_pagar_id = cp.id)
         OR EXISTS (SELECT 1 FROM documentos_cuentas_pagar d WHERE d.cuentas_pagar_id = cp.id)
         OR cp.monto_pagado > 0);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'datos_con_dinero: % cuentas sin item_id tienen pagos o documentos; resolverlas a mano antes de migrar', v_n;
  END IF;
  DELETE FROM cuentas_pagar WHERE item_id IS NULL;
END
$datos$;

-- 3. Llaves (clase 5, J8, K14). item_id pasa a uuid con FK y UNIQUE.
DROP INDEX IF EXISTS public.cuentas_pagar_cotizacion_item_unique;
DROP INDEX IF EXISTS public.idx_cuentas_pagar_item_id;
ALTER TABLE public.cuentas_pagar ALTER COLUMN item_id TYPE uuid USING item_id::uuid;
ALTER TABLE public.cuentas_pagar ALTER COLUMN item_id SET NOT NULL;

ALTER TABLE public.items_cotizacion
  ADD CONSTRAINT items_cotizacion_id_cotizacion_key UNIQUE (id, cotizacion_id);
ALTER TABLE public.cuentas_pagar_grupos
  ADD CONSTRAINT cuentas_pagar_grupos_id_proyecto_responsable_key UNIQUE (id, proyecto_id, responsable_id);

ALTER TABLE public.cuentas_pagar
  ADD CONSTRAINT cuentas_pagar_item_id_key UNIQUE (item_id),
  ADD CONSTRAINT cuentas_pagar_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items_cotizacion(id) ON DELETE RESTRICT,
  ADD CONSTRAINT cuentas_pagar_item_cotizacion_fkey FOREIGN KEY (item_id, cotizacion_id)
    REFERENCES public.items_cotizacion(id, cotizacion_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT cuentas_pagar_grupo_coherente_fkey FOREIGN KEY (grupo_id, proyecto_id, responsable_id)
    REFERENCES public.cuentas_pagar_grupos(id, proyecto_id, responsable_id) DEFERRABLE INITIALLY DEFERRED;

-- 4. Invariantes (K1 y proveedor del renglón = proveedor de la cuenta), validadas
-- al COMMIT: reasignar mueve responsable_id y grupo_id en pasos distintos.
CREATE OR REPLACE FUNCTION public.cuentas_pagar_validar_invariantes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cuenta cuentas_pagar;
BEGIN
  IF TG_TABLE_NAME = 'items_cotizacion' THEN
    SELECT cp.* INTO v_cuenta FROM cuentas_pagar cp WHERE cp.item_id = NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_cuenta.responsable_id IS DISTINCT FROM NEW.responsable_id THEN
      RAISE EXCEPTION 'responsable_distinto: el renglón % y su cuenta por pagar tienen proveedores distintos; reasigna desde Cuentas', NEW.id
        USING ERRCODE = 'P1417';
    END IF;
    RETURN NULL;
  END IF;

  -- La fila pudo cambiar o borrarse antes del COMMIT: se valida la vigente.
  SELECT cp.* INTO v_cuenta FROM cuentas_pagar cp WHERE cp.id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_cuenta.responsable_id IS NOT NULL AND v_cuenta.grupo_id IS NULL THEN
    RAISE EXCEPTION 'cuenta_sin_grupo: la cuenta % tiene proveedor pero no grupo', v_cuenta.id USING ERRCODE = 'P1417';
  END IF;
  IF EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = v_cuenta.item_id AND i.responsable_id IS DISTINCT FROM v_cuenta.responsable_id) THEN
    RAISE EXCEPTION 'responsable_distinto: la cuenta % y su renglón tienen proveedores distintos', v_cuenta.id USING ERRCODE = 'P1417';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_cuentas_pagar_invariantes ON public.cuentas_pagar;
CREATE CONSTRAINT TRIGGER trigger_cuentas_pagar_invariantes
  AFTER INSERT OR UPDATE OF responsable_id, grupo_id, item_id ON public.cuentas_pagar
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_pagar_validar_invariantes();

DROP TRIGGER IF EXISTS trigger_items_cotizacion_responsable_cuenta ON public.items_cotizacion;
CREATE CONSTRAINT TRIGGER trigger_items_cotizacion_responsable_cuenta
  AFTER UPDATE OF responsable_id ON public.items_cotizacion
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.responsable_id IS DISTINCT FROM NEW.responsable_id)
  EXECUTE FUNCTION public.cuentas_pagar_validar_invariantes();

-- 5. Lectores y escritores, ya sin copias.
CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date)
 RETURNS TABLE(proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text, fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean, margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean, concepto_creado timestamp with time zone, key text, tipo text, objetivo text, id text, proyecto_id text, cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer, total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text, fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric, venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean, complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric, utilidad_proyecto numeric, neto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
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
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.item_id, c.x_pagar, c.created_at
    FROM cuentas_pagar c WHERE c.proyecto_id IS NULL OR c.proyecto_id IN (SELECT id FROM py)
  ),
  g AS (
    SELECT gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total, gr.total_a_transferir, gr.monto_transferido,
           gr.orden_pago_id, gr.created_at
    FROM cuentas_pagar_grupos gr WHERE gr.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  cot AS (
    SELECT COALESCE(c.es_complementaria_de, c.id) AS pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee, ROUND(SUM(c.iva), 2) AS iva,
           -- #99: utilidad_total = margen + fee − descuento (calculations.ts).
           ROUND(SUM(c.utilidad_total), 2) AS utilidad
    FROM cotizaciones c
    WHERE c.estado = 'APROBADA' AND COALESCE(c.es_complementaria_de, c.id) IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden,
           COALESCE(cot.utilidad, 0) AS utilidad
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    WHERE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
       OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id)
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807, 0
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
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           round(c.monto_total, 2) AS v_total, round(COALESCE(c.monto_pagado, 0), 2) AS v_pagado,
           -- #99: parte sin IVA del cobro (netoCobro en periodo.ts).
           CASE WHEN ct.id IS NULL THEN round(c.monto_total * 100 / 116, 2)
                WHEN COALESCE(ct.total, 0) <= 0 THEN round(c.monto_total, 2)
                ELSE round(c.monto_total * (ct.total - COALESCE(ct.iva, 0)) / ct.total, 2) END AS v_neto,
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
    LEFT JOIN cotizaciones ct ON ct.id = c.cotizacion_id
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
    -- Sueltas: sin factura, pago ni orden propios (B5a: todo va por grupo).
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.x_pagar,
           NULL::numeric, 0::numeric, NULL::uuid, c.created_at
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
           (array_agg(i.descripcion ORDER BY c.created_at, c.id))[1] AS descripcion
    FROM cp c
    LEFT JOIN items_cotizacion i ON i.id = c.item_id
    WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, si.descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN items_cotizacion si ON si.id = s.item_id::uuid
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
         NULL::numeric, NULL::numeric, NULL::numeric,
         c.p_utilidad, c.v_neto
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey, p.p_orden, p.p_nombre, p.p_cliente, p.p_fecha,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen, p.p_fee, p.p_iva, p.p_reabierta,
         p.created_at,
         CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id, 'pago', p.objetivo, p.id::text, p.proyecto_id,
         CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END, NULL,
         CASE WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.prov_nombre, 'Proveedor')
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
         p.c_iva, p.c_iva_ret, p.c_isr_ret,
         p.p_utilidad, p.c_subtotal
  FROM pago_d p;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_por_proyecto(p_year integer, p_proyecto text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '8MB'
AS $function$
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
  --              fecha_factura, facturas_xml, pagos, cotizacion_total,
  --              cotizacion_iva (#99; null sin cotización)
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
    SELECT cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, cp.item_id,
           cp.x_pagar, cp.monto_pagado, cp.created_at
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
           (array_agg(i.descripcion ORDER BY cp.created_at, cp.id))[1] AS descripcion
    FROM cp
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
    WHERE cp.grupo_id IS NOT NULL
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
        f.docs, pg.pagos, ct.total, ct.iva
      ) ORDER BY cc.created_at, cc.id)
      FROM cc
      LEFT JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
      LEFT JOIN cc_facturas f ON f.id = cc.id
      LEFT JOIN cc_pagos pg ON pg.id = cc.id
    ), '[]'::json),
    'pagos', COALESCE((
      SELECT json_agg(json_build_array(
        cp.id, cp.cotizacion_id, cp.proyecto_id, cp.grupo_id, cp.responsable_id, COALESCE(pr.nombre, 'Sin asignar'),
        it.descripcion, cp.x_pagar, COALESCE(cp.monto_pagado, 0), NULL::numeric,
        0::numeric, NULL::uuid, pr.regimen_fiscal,
        d.facturas, d.comprobantes, pf.fechas
      ) ORDER BY cp.created_at, cp.id)
      FROM cp
      LEFT JOIN proveedores pr ON pr.id = cp.responsable_id
      LEFT JOIN items_cotizacion it ON it.id = cp.item_id
      LEFT JOIN p_docs d ON d.id = cp.id
      LEFT JOIN p_fechas pf ON pf.id = cp.id
      WHERE cp.grupo_id IS NULL
    ), '[]'::json),
    'grupos', COALESCE((
      SELECT json_agg(json_build_array(
        g.id, g.proyecto_id, g.responsable_id, pr.nombre, pr.regimen_fiscal,
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
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_orden_candidatos(p_limite_no_incluidas integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '8MB'
AS $function$
DECLARE
  v_hoy    text := to_char(hoy_cdmx(), 'YYYY-MM-DD');
  v_result jsonb;
BEGIN
  WITH
  obj AS (
    -- Grupos con saldo y sin orden.
    SELECT 'grupo'::text AS tipo, g.id, g.proyecto_id, g.responsable_id,
           round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) AS saldo,
           g.total_a_transferir, COALESCE(g.monto_transferido, 0) AS monto_transferido,
           g.estado
    FROM cuentas_pagar_grupos g
    WHERE g.orden_pago_id IS NULL
      AND g.estado <> 'PAGADO'
      AND round(g.monto_total - COALESCE(g.monto_pagado, 0), 2) > 0
    UNION ALL
    -- Sueltas (sin grupo) con saldo: solo las que no tienen proveedor, que
    -- salen como "no incluidas" (K1: con proveedor, la cuenta va en un grupo).
    SELECT 'cuenta', cp.id, cp.proyecto_id, cp.responsable_id,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2),
           NULL::numeric, 0::numeric,
           cp.estado
    FROM cuentas_pagar cp
    WHERE cp.grupo_id IS NULL
      AND cp.responsable_id IS NULL
      AND cp.estado <> 'PAGADO'
      AND round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) > 0
  ),
  -- Renglones de cada objetivo (hijas del grupo o la propia suelta).
  ren AS (
    -- Dos joins por igualdad (no un OR, que obliga a un nested loop).
    SELECT 'grupo'::text AS tipo, cp.grupo_id AS obj_id, cp.id AS cuenta_id, i.descripcion AS item_descripcion, i.cantidad,
           cp.cotizacion_id, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2) AS saldo
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'grupo' AND o.id = cp.grupo_id
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
    UNION ALL
    SELECT 'cuenta', cp.id, cp.id, i.descripcion, i.cantidad,
           cp.cotizacion_id, cp.created_at,
           round(cp.x_pagar - COALESCE(cp.monto_pagado, 0), 2)
    FROM cuentas_pagar cp
    JOIN obj o ON o.tipo = 'cuenta' AND o.id = cp.id
    LEFT JOIN items_cotizacion i ON i.id = cp.item_id
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
          'nombre', COALESCE(c.pr_nombre, 'Sin nombre'),
          'regimen_fiscal', c.regimen_fiscal,
          'banco', c.pr_banco, 'clabe', c.pr_clabe,
          'correo', c.pr_correo, 'telefono', c.pr_telefono
        ),
        'saldo', c.saldo, 'total_a_transferir', c.total_a_transferir, 'monto_transferido', c.monto_transferido,
        'items', it.items
      ) ORDER BY c.pr_nombre, c.fecha_max, c.proyecto_id, c.id)
      FROM cal c
      LEFT JOIN items it ON it.tipo = c.tipo AND it.obj_id = c.id
      WHERE c.motivo IS NULL
    ), '[]'::jsonb),
    'no_incluidas', COALESCE((
      SELECT jsonb_agg(x.fila ORDER BY x.orden)
      FROM (
        SELECT jsonb_build_object(
                 'tipo', c.tipo, 'id', c.id, 'proyecto_id', c.proyecto_id, 'proyecto_nombre', c.proyecto_nombre,
                 'responsable_nombre', COALESCE(c.pr_nombre, 'Sin asignar'),
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
        WHERE c.motivo IS NOT NULL
      ) x
      WHERE x.orden <= GREATEST(COALESCE(p_limite_no_incluidas, 100), 0)
    ), '[]'::jsonb),
    'no_incluidas_total', (SELECT count(*) FROM cal WHERE motivo IS NOT NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_cotizacion(p_id text)
 RETURNS TABLE(id text, estado character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cot          cotizaciones;
  v_es_principal boolean;
  v_ids          text[];
  v_blq          text;
  v_motivo       text;
  v_grupos       uuid[];
  v_cid          text;
BEGIN
  SELECT * INTO v_cot FROM cotizaciones c WHERE c.id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion no encontrada: %', p_id;
  END IF;

  IF v_cot.estado NOT IN ('EMITIDA', 'APROBADA') THEN
    RAISE EXCEPTION 'No se pueden cancelar cotizaciones en estado: %', v_cot.estado;
  END IF;

  v_es_principal := v_cot.es_complementaria_de IS NULL;

  -- Cotizaciones con cuentas que se van a borrar: las complementarias
  -- APROBADA (solo si es principal) y la propia cotización al final.
  IF v_es_principal THEN
    PERFORM 1 FROM cotizaciones c WHERE c.es_complementaria_de = p_id ORDER BY c.id FOR UPDATE;
    SELECT COALESCE(array_agg(c.id ORDER BY c.id), '{}') INTO v_ids
    FROM cotizaciones c
    WHERE c.es_complementaria_de = p_id AND c.estado = 'APROBADA';
  ELSE
    v_ids := '{}';
  END IF;
  v_ids := v_ids || p_id;

  -- Bloquear las cuentas antes de revisar las guardas: un pago concurrente
  -- espera a que termine la cancelación (o la cancelación a que termine él).
  PERFORM 1 FROM cuentas_cobrar cc WHERE cc.cotizacion_id = ANY(v_ids) ORDER BY cc.id FOR UPDATE;
  PERFORM 1 FROM cuentas_pagar cp WHERE cp.cotizacion_id = ANY(v_ids) ORDER BY cp.id FOR UPDATE;

  -- Guardas (D22, A4). Se revisan todas antes de tocar nada.
  SELECT cc.cotizacion_id, 'ya tiene cobros registrados' INTO v_blq, v_motivo
  FROM cuentas_cobrar cc
  WHERE cc.cotizacion_id = ANY(v_ids) AND COALESCE(cc.monto_pagado, 0) > 0
  ORDER BY cc.cotizacion_id LIMIT 1;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'ya tiene pagos a proveedor registrados' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = ANY(v_ids) AND COALESCE(cp.monto_pagado, 0) > 0
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'tiene cuentas en una orden de pago' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
    WHERE cp.cotizacion_id = ANY(v_ids) AND g.orden_pago_id IS NOT NULL
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NULL THEN
    SELECT cp.cotizacion_id, 'tiene cuentas en un grupo ya facturado o en pago' INTO v_blq, v_motivo
    FROM cuentas_pagar cp
    JOIN cuentas_pagar_grupos g ON g.id = cp.grupo_id
    WHERE cp.cotizacion_id = ANY(v_ids) AND g.estado <> 'ABIERTO'
    ORDER BY cp.cotizacion_id LIMIT 1;
  END IF;

  IF v_blq IS NOT NULL THEN
    RAISE EXCEPTION 'cancelacion_bloqueada: la cotización % %', v_blq, v_motivo USING ERRCODE = 'P1413';
  END IF;

  -- Borrado, complementarias primero y la cotización pedida al final.
  FOREACH v_cid IN ARRAY v_ids LOOP
    SELECT COALESCE(array_agg(DISTINCT cp.grupo_id), '{}') INTO v_grupos
    FROM cuentas_pagar cp
    WHERE cp.cotizacion_id = v_cid AND cp.grupo_id IS NOT NULL;

    PERFORM 1 FROM cuentas_pagar_grupos g WHERE g.id = ANY(v_grupos) ORDER BY g.id FOR UPDATE;

    -- documentos_cuentas_pagar (por cuenta) y los pagos/documentos de
    -- cuentas_cobrar caen en cascada.
    DELETE FROM cuentas_pagar cp WHERE cp.cotizacion_id = v_cid;
    DELETE FROM cuentas_cobrar cc WHERE cc.cotizacion_id = v_cid;

    UPDATE cuentas_pagar_grupos g SET
      monto_total = (SELECT COALESCE(SUM(cp.x_pagar), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = g.id),
      updated_at = now()
    WHERE g.id = ANY(v_grupos);

    -- Un grupo ABIERTO puede tener documentos en revisión (su llave hacia el
    -- grupo no tiene cascada): se borran con él.
    DELETE FROM documentos_cuentas_pagar d
    WHERE d.grupo_id = ANY(v_grupos)
      AND EXISTS (
        SELECT 1 FROM cuentas_pagar_grupos g
        WHERE g.id = d.grupo_id AND g.estado = 'ABIERTO'
          AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
      );
    DELETE FROM cuentas_pagar_grupos g
    WHERE g.id = ANY(v_grupos) AND g.estado = 'ABIERTO'
      AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id);

    UPDATE cotizaciones c SET estado = 'CANCELADA' WHERE c.id = v_cid;
  END LOOP;

  IF v_es_principal THEN
    -- Complementarias no aprobadas (D31).
    UPDATE cotizaciones c SET estado = 'CANCELADA'
    WHERE c.es_complementaria_de = p_id AND c.estado = 'EMITIDA';

    DELETE FROM historial_cambios_responsable_item h
    WHERE h.cotizacion_id IN (SELECT c.id FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR');
    DELETE FROM historial_responsable h
    WHERE h.cotizacion_id IN (SELECT c.id FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR');
    -- items_cotizacion y planeacion_event_notas caen en cascada.
    DELETE FROM cotizaciones c WHERE c.es_complementaria_de = p_id AND c.estado = 'BORRADOR';

    -- El proyecto es de la principal. Si todavía le cuelga alguna cuenta
    -- ajena a estas cotizaciones, la llave foránea falla y se revierte todo:
    -- falla explícito, nunca borra dinero que no conoce.
    DELETE FROM proyectos pr WHERE pr.id = p_id;
  END IF;

  RETURN QUERY SELECT p_id, 'CANCELADA'::varchar;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_cotizacion(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cotizacion        record;
  v_proyecto          record;
  v_items             record;
  v_es_complementaria boolean;
  v_proyecto_id       text;
  v_cuentas_pagar     jsonb := '[]'::jsonb;
  v_cuenta_cobrar     jsonb;
  v_cuenta_pagar_id    uuid;
BEGIN
  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotizacion % no encontrada', p_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_cotizacion.estado = 'APROBADA' THEN
    RETURN jsonb_build_object(
      'already_approved', true,
      'cotizacion_id',    p_id
    );
  END IF;

  IF v_cotizacion.estado <> 'EMITIDA' THEN
    RETURN jsonb_build_object('error', 'estado_invalido', 'estado_actual', v_cotizacion.estado);
  END IF;

  v_es_complementaria := (
    v_cotizacion.tipo = 'COMPLEMENTARIA' AND
    v_cotizacion.es_complementaria_de IS NOT NULL
  );

  IF v_es_complementaria THEN
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
    INSERT INTO proyectos (id, cliente, cliente_id, proyecto, fecha_entrega, locacion,
                           horarios, punto_encuentro, notas, estado)
    VALUES (
      p_id,
      v_cotizacion.cliente,
      v_cotizacion.cliente_id,
      v_cotizacion.proyecto,
      v_cotizacion.fecha_entrega,
      v_cotizacion.locacion,
      NULL, NULL, NULL,
      'PREPRODUCCION'
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente       = EXCLUDED.cliente,
      cliente_id    = EXCLUDED.cliente_id,
      proyecto      = EXCLUDED.proyecto,
      fecha_entrega = EXCLUDED.fecha_entrega,
      locacion      = EXCLUDED.locacion,
      ultima_actualizacion = now()
    RETURNING * INTO v_proyecto;

    v_proyecto_id := p_id;
  END IF;

  DELETE FROM cuentas_pagar WHERE cotizacion_id = p_id;

  -- Nombre, descripción, cantidad, margen y contacto se leen del dueño
  -- (proveedores, items_cotizacion) por item_id y responsable_id (J3).
  INSERT INTO cuentas_pagar (
    cotizacion_id, proyecto_id, item_id, responsable_id, x_pagar, estado
  )
  SELECT
    p_id,
    v_proyecto_id,
    i.id,
    i.responsable_id,
    i.x_pagar * i.cantidad,
    'PENDIENTE'
  FROM items_cotizacion i
  WHERE i.cotizacion_id = p_id
    AND i.x_pagar > 0;

  FOR v_cuenta_pagar_id IN
    SELECT id FROM cuentas_pagar
    WHERE cotizacion_id = p_id AND responsable_id IS NOT NULL
  LOOP
    PERFORM reconcile_cuenta_pagar_grupo(v_cuenta_pagar_id);
  END LOOP;

  SELECT jsonb_agg(row_to_json(cp)) INTO v_cuentas_pagar
  FROM cuentas_pagar cp
  WHERE cp.cotizacion_id = p_id;

  -- El estado del cobro es una columna generada (D15): no se escribe.
  INSERT INTO cuentas_cobrar (cotizacion_id, cliente, cliente_id, proyecto, monto_total, proyecto_id)
  VALUES (
    p_id,
    v_cotizacion.cliente,
    v_cotizacion.cliente_id,
    v_cotizacion.proyecto,
    v_cotizacion.total,
    v_proyecto_id
  )
  ON CONFLICT (cotizacion_id) DO UPDATE SET
    cliente     = EXCLUDED.cliente,
    cliente_id  = EXCLUDED.cliente_id,
    proyecto    = EXCLUDED.proyecto,
    monto_total = EXCLUDED.monto_total,
    proyecto_id = EXCLUDED.proyecto_id
  RETURNING row_to_json(cuentas_cobrar) INTO v_cuenta_cobrar;

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

CREATE OR REPLACE FUNCTION public.reasignar_responsable_cuenta_pagar(p_cuenta_pagar_id uuid, p_responsable_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cuenta cuentas_pagar;
  v_nombre text;
BEGIN
  SELECT * INTO v_cuenta FROM cuentas_pagar WHERE id = p_cuenta_pagar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar % no encontrada', p_cuenta_pagar_id USING ERRCODE = 'P0002';
  END IF;

  IF p_responsable_id IS NOT NULL THEN
    SELECT p.nombre INTO v_nombre FROM proveedores p WHERE p.id = p_responsable_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proveedor_no_encontrado: %', p_responsable_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- items_cotizacion todavía guarda el nombre (sale en B5c); se toma del dueño.
  IF v_cuenta.item_id IS NOT NULL THEN
    UPDATE items_cotizacion SET
      responsable_id = p_responsable_id,
      responsable_nombre = v_nombre
    WHERE id = v_cuenta.item_id;
  END IF;

  UPDATE cuentas_pagar SET responsable_id = p_responsable_id WHERE id = p_cuenta_pagar_id;

  -- Si esto hace RAISE EXCEPTION (P1412), revierte TODO lo de arriba.
  RETURN reconcile_cuenta_pagar_grupo(p_cuenta_pagar_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.corregir_proveedor_cuenta_pagar(p_cuenta_pagar_id uuid, p_responsable_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
       SET monto_pagado = 0, estado = 'PENDIENTE', fecha_pago = NULL, updated_at = now()
     WHERE id = v_cuenta.id;
  END IF;

  v_result := reasignar_responsable_cuenta_pagar(p_cuenta_pagar_id, p_responsable_id);

  INSERT INTO cuentas_correcciones (reapertura_id, proyecto_id, tipo, objetivo, objetivo_id, motivo, detalle, usuario)
  VALUES (v_reapertura, v_cuenta.proyecto_id, 'reasignar_proveedor', 'cuenta', v_cuenta.id, btrim(p_motivo),
          jsonb_build_object('responsable_anterior', v_anterior, 'responsable_nuevo', p_responsable_id,
                             'grupo_anterior', v_cuenta.grupo_id, 'grupo_nuevo', v_result->'grupo_id'), p_usuario);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_orden_pago(p_orden_id uuid, p_motivo text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orden   ordenes_pago;
  v_grupos  int;
  v_cuentas int;
  v_grupo_ids uuid[];
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido: cancelar una orden pide un motivo' USING ERRCODE = 'P1415';
  END IF;

  SELECT * INTO v_orden FROM ordenes_pago WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada: la orden % no existe', p_orden_id USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'orden_cancelada: la orden % ya está cancelada', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- Mismo orden de bloqueo que generar_orden_pago y los pagos: grupos y sus
  -- hijas por id.
  PERFORM 1 FROM cuentas_pagar_grupos WHERE orden_pago_id = p_orden_id ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(g.id ORDER BY g.id), '{}') INTO v_grupo_ids FROM cuentas_pagar_grupos g WHERE g.orden_pago_id = p_orden_id;
  PERFORM 1 FROM cuentas_pagar WHERE grupo_id = ANY(v_grupo_ids) ORDER BY id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM pagos_cuentas_pagar WHERE orden_pago_id = p_orden_id AND anulado_at IS NULL) THEN
    RAISE EXCEPTION 'orden_con_pagos: la orden % ya tiene pagos registrados', p_orden_id USING ERRCODE = 'P1415';
  END IF;

  -- R6: cada grupo regresa al estado que le toca por su saldo.
  UPDATE cuentas_pagar_grupos
     SET orden_pago_id = NULL,
         estado = CASE WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO' ELSE 'FACTURADO' END,
         updated_at = now()
   WHERE orden_pago_id = p_orden_id AND estado <> 'PAGADO';
  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  -- Hijas: con pago parcial quedan EN_PROCESO_PAGO, como las deja
  -- registrar_pago_grupo_factura.
  UPDATE cuentas_pagar
     SET estado = CASE
           WHEN estado = 'PAGADO' THEN estado
           WHEN COALESCE(monto_pagado, 0) > 0 THEN 'EN_PROCESO_PAGO'
           ELSE 'PENDIENTE'
         END,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);
  GET DIAGNOSTICS v_cuentas = ROW_COUNT;

  -- Un grupo ya PAGADO no se toca arriba; también suelta su orden.
  UPDATE cuentas_pagar_grupos SET orden_pago_id = NULL, updated_at = now() WHERE orden_pago_id = p_orden_id;

  UPDATE ordenes_pago
     SET estado = 'CANCELADA',
         cancelada_at = now(),
         cancelada_por = COALESCE(NULLIF(p_usuario, ''), 'sistema'),
         cancelada_motivo = btrim(p_motivo)
   WHERE id = p_orden_id;

  RETURN jsonb_build_object('orden_pago_id', p_orden_id, 'grupos', v_grupos, 'cuentas', v_cuentas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generar_orden_pago(p_candidatos jsonb, p_pdf_url text, p_pdf_nombre text, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cand        record;
  v_grupo       cuentas_pagar_grupos;
  v_saldo       numeric;
  v_total       numeric := 0;
  v_orden_id    uuid;
  v_grupo_ids   uuid[] := '{}';
  v_n           int;
BEGIN
  IF p_candidatos IS NULL OR jsonb_typeof(p_candidatos) <> 'array' OR jsonb_array_length(p_candidatos) = 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: la orden necesita al menos un candidato' USING ERRCODE = 'P1414';
  END IF;

  -- Forma del payload y duplicados, antes de bloquear nada. Solo grupos: las
  -- órdenes de pago son por grupo de facturación (PLAN.md, A9).
  SELECT count(*) INTO v_n
  FROM jsonb_array_elements(p_candidatos) e
  WHERE e->>'tipo' IS DISTINCT FROM 'grupo'
     OR e->>'id' IS NULL
     OR e->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR jsonb_typeof(e->'monto_esperado') <> 'number'
     OR (e->>'monto_esperado')::numeric <= 0;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: % candidato(s) mal formados', v_n USING ERRCODE = 'P1414';
  END IF;

  SELECT count(*) - count(DISTINCT e->>'id') INTO v_n
  FROM jsonb_array_elements(p_candidatos) e;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'candidatos_invalidos: hay candidatos repetidos' USING ERRCODE = 'P1414';
  END IF;

  -- Grupos, en orden de id para que dos órdenes concurrentes bloqueen en el
  -- mismo orden y no se crucen (deadlock).
  FOR v_cand IN
    SELECT (e->>'id')::uuid AS id, (e->>'monto_esperado')::numeric AS esperado
    FROM jsonb_array_elements(p_candidatos) e
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

  INSERT INTO ordenes_pago (fecha_generacion, pdf_url, pdf_nombre, estado, total_monto, created_by)
  VALUES (hoy_cdmx(), p_pdf_url, p_pdf_nombre, 'GENERADA', round(v_total, 2), COALESCE(NULLIF(p_usuario, ''), 'sistema'))
  RETURNING id INTO v_orden_id;

  -- Desglose inmutable (S1). El nombre del proveedor sale del dueño (J3).
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

  -- Marcar grupos y sus hijas (las ya pagadas conservan PAGADO). La orden vive
  -- solo en el grupo.
  UPDATE cuentas_pagar_grupos
     SET estado = 'EN_PROCESO_PAGO', orden_pago_id = v_orden_id, updated_at = now()
   WHERE id = ANY(v_grupo_ids);

  UPDATE cuentas_pagar
     SET estado = CASE WHEN estado = 'PAGADO' THEN estado ELSE 'EN_PROCESO_PAGO' END,
         updated_at = now()
   WHERE grupo_id = ANY(v_grupo_ids);

  RETURN jsonb_build_object(
    'orden_pago_id', v_orden_id,
    'total_monto', round(v_total, 2),
    'grupos', coalesce(array_length(v_grupo_ids, 1), 0)
  );
END;
$function$;

-- 6. Las copias salen.
ALTER TABLE public.cuentas_pagar
  DROP COLUMN IF EXISTS responsable_nombre,
  DROP COLUMN IF EXISTS item_descripcion,
  DROP COLUMN IF EXISTS cantidad,
  DROP COLUMN IF EXISTS margen,
  DROP COLUMN IF EXISTS telefono,
  DROP COLUMN IF EXISTS correo,
  DROP COLUMN IF EXISTS clabe,
  DROP COLUMN IF EXISTS banco,
  DROP COLUMN IF EXISTS orden_pago_id,
  DROP COLUMN IF EXISTS total_a_transferir,
  DROP COLUMN IF EXISTS monto_transferido,
  DROP COLUMN IF EXISTS metodo_pago;

ALTER TABLE public.cuentas_cobrar DROP COLUMN IF EXISTS estado_anterior;

-- 7. Permisos de las funciones recreadas (las existentes los conservan).
REVOKE ALL ON FUNCTION public.reasignar_responsable_cuenta_pagar(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reasignar_responsable_cuenta_pagar(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.corregir_proveedor_cuenta_pagar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_proveedor_cuenta_pagar(uuid, uuid, text, text) TO service_role;

COMMIT;
