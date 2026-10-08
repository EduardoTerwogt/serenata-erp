-- #123 B2 / M1 (docs/PLAN.md): facturas y pagos ligados — paso ADITIVO.
--
-- Modelo (decisiones P27, T1, T10, T17): cabecera `pagos` (única tabla nueva) con las
-- líneas de pago que ya existen colgando de ella (`pago_id`); cada cuenta de cobro apunta a
-- su factura vigente con `cuentas_cobrar.factura_documento_id` (sin tabla puente); el
-- FACTURA_XML de cobro pasa a ser cabecera sin ancla de cuenta; el RFC se vuelve columna.
--
-- Solo agrega, relaja o sustituye restricciones. Los DROP de objetos (columnas, funciones,
-- tabla) viven en M3 y los corre una persona. Idempotente y reproducible desde un Postgres
-- vacío (el job `Migrations` lo corre en cada push).
--
-- Backfill con aserción: una cabecera `pagos` por cada línea existente (`pagos.id` = `id` de
-- la línea, así `documentos_cuentas_cobrar.pago_id` sigue apuntando sin tocar datos); cada
-- FACTURA_XML vigente se liga a su cuenta y pierde el ancla; PDF y complementos se re-anclan
-- a la factura vigente de su cuenta (sin factura conservan el ancla de cuenta: dato legado,
-- T13). Si los conteos o las sumas no cuadran antes y después, `RAISE EXCEPTION`.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. RFC como columna (P24) ───────────────────────────────────────────────
ALTER TABLE public.clientes    ADD COLUMN IF NOT EXISTS rfc text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS rfc text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_rfc_normalizado_check') THEN
    ALTER TABLE public.clientes ADD CONSTRAINT clientes_rfc_normalizado_check
      CHECK (rfc IS NULL OR (rfc = upper(btrim(rfc)) AND rfc <> ''));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_rfc_normalizado_check') THEN
    ALTER TABLE public.proveedores ADD CONSTRAINT proveedores_rfc_normalizado_check
      CHECK (rfc IS NULL OR (rfc = upper(btrim(rfc)) AND rfc <> ''));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_rfc    ON public.clientes (rfc)    WHERE rfc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proveedores_rfc ON public.proveedores (rfc) WHERE rfc IS NOT NULL;

-- ── 2. Cabecera `pagos` (T1, T17) ───────────────────────────────────────────
-- Sin monto total ni contraparte: se derivan de las líneas. `lado` es informativo; la
-- coherencia (todas las líneas del mismo lado y contraparte) la dan las RPC por lado y una
-- guarda de auditar_consistencia(). Anular = actualizar la cabecera.
CREATE TABLE IF NOT EXISTS public.pagos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lado            text NOT NULL CHECK (lado IN ('cobro', 'proveedor')),
  fecha_pago      date NOT NULL,
  tipo_pago       text NOT NULL DEFAULT 'TRANSFERENCIA' CHECK (tipo_pago IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE')),
  comprobante_url text,
  archivo_nombre  text,
  notas           text,
  operation_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  anulado_at      timestamptz,
  anulado_por     text,
  anulado_motivo  text,
  CONSTRAINT pagos_anulado_check CHECK (anulado_at IS NULL OR (anulado_motivo IS NOT NULL AND btrim(anulado_motivo) <> ''))
);
CREATE UNIQUE INDEX IF NOT EXISTS pagos_operation_id_key ON public.pagos (operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON public.pagos (fecha_pago);
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;  -- sin policies: solo entra service_role

-- ── 3. Líneas de pago: `pago_id`, CHECK monto > 0 y cabecera relajada ──────
ALTER TABLE public.pagos_comprobantes   ADD COLUMN IF NOT EXISTS pago_id uuid REFERENCES public.pagos(id);
ALTER TABLE public.pagos_cuentas_pagar  ADD COLUMN IF NOT EXISTS pago_id uuid REFERENCES public.pagos(id);
CREATE INDEX IF NOT EXISTS idx_pagos_comprobantes_pago  ON public.pagos_comprobantes (pago_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cuentas_pagar_pago ON public.pagos_cuentas_pagar (pago_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pagos_comprobantes WHERE monto <= 0) THEN
    RAISE EXCEPTION 'M1: hay pagos_comprobantes con monto <= 0; revisar antes de agregar el CHECK';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagos_comprobantes_monto_check') THEN
    ALTER TABLE public.pagos_comprobantes ADD CONSTRAINT pagos_comprobantes_monto_check CHECK (monto > 0);
  END IF;
END $$;

-- La cabecera vive en `pagos`: las columnas de cabecera de las líneas dejan de ser obligatorias
-- (las RPC nuevas ya no las escriben) y se retiran en M3.
ALTER TABLE public.pagos_comprobantes  ALTER COLUMN tipo_pago  DROP NOT NULL;
ALTER TABLE public.pagos_comprobantes  ALTER COLUMN fecha_pago DROP NOT NULL;
ALTER TABLE public.pagos_cuentas_pagar ALTER COLUMN tipo_pago  DROP NOT NULL;
ALTER TABLE public.pagos_cuentas_pagar ALTER COLUMN fecha_pago DROP NOT NULL;

-- ── 4. Factura de cobro como cabecera (P27) ─────────────────────────────────
ALTER TABLE public.documentos_cuentas_cobrar ALTER COLUMN cuentas_cobrar_id DROP NOT NULL;
ALTER TABLE public.documentos_cuentas_cobrar
  ADD COLUMN IF NOT EXISTS factura_documento_id uuid REFERENCES public.documentos_cuentas_cobrar(id),
  ADD COLUMN IF NOT EXISTS monto_pagado numeric;
ALTER TABLE public.cuentas_cobrar
  ADD COLUMN IF NOT EXISTS factura_documento_id uuid REFERENCES public.documentos_cuentas_cobrar(id);

CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_factura_documento ON public.cuentas_cobrar (factura_documento_id) WHERE factura_documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_cc_factura           ON public.documentos_cuentas_cobrar (factura_documento_id) WHERE factura_documento_id IS NOT NULL;

-- ── 5. Complementos de proveedor (P9, P11) ──────────────────────────────────
ALTER TABLE public.documentos_cuentas_pagar
  ADD COLUMN IF NOT EXISTS pago_id uuid REFERENCES public.pagos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metodo_pago_cfdi text,
  ADD COLUMN IF NOT EXISTS monto_pagado numeric;
CREATE INDEX IF NOT EXISTS idx_documentos_cp_pago ON public.documentos_cuentas_pagar (pago_id) WHERE pago_id IS NOT NULL;

ALTER TABLE public.documentos_cuentas_pagar DROP CONSTRAINT IF EXISTS documentos_cuentas_pagar_tipo_check;
ALTER TABLE public.documentos_cuentas_pagar ADD CONSTRAINT documentos_cuentas_pagar_tipo_check
  CHECK (tipo IN ('FACTURA_PROVEEDOR', 'FACTURA_PROVEEDOR_XML', 'COMPROBANTE_PAGO', 'COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF', 'OTRO'));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_cuentas_pagar_metodo_pago_cfdi_check') THEN
    ALTER TABLE public.documentos_cuentas_pagar ADD CONSTRAINT documentos_cuentas_pagar_metodo_pago_cfdi_check
      CHECK (metodo_pago_cfdi IS NULL OR metodo_pago_cfdi IN ('PUE', 'PPD'));
  END IF;
END $$;

-- ── 6. Backfill con aserción ────────────────────────────────────────────────
DO $backfill$
DECLARE
  v_pre_cobro_n   bigint;  v_pre_cobro_sum   numeric;
  v_pre_prov_n    bigint;  v_pre_prov_sum    numeric;
  v_pre_docs_n    bigint;  v_xml_vigentes    bigint;
  v_xml_ligados   bigint;
  v_post_pagos_n  bigint;
  v_n             bigint;
BEGIN
  SELECT count(*), COALESCE(sum(monto), 0) INTO v_pre_cobro_n, v_pre_cobro_sum FROM public.pagos_comprobantes;
  SELECT count(*), COALESCE(sum(monto_transferido), 0) INTO v_pre_prov_n, v_pre_prov_sum FROM public.pagos_cuentas_pagar;
  SELECT count(*) INTO v_pre_docs_n FROM public.documentos_cuentas_cobrar;
  SELECT count(*) INTO v_xml_vigentes FROM public.documentos_cuentas_cobrar WHERE tipo = 'FACTURA_XML' AND eliminado_at IS NULL;

  -- 6.1 Una cabecera por línea; `pagos.id` = `id` de la línea.
  INSERT INTO public.pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, notas, created_at,
                            anulado_at, anulado_por, anulado_motivo)
  SELECT pc.id, 'cobro', pc.fecha_pago, COALESCE(pc.tipo_pago, 'TRANSFERENCIA'), pc.comprobante_url, pc.archivo_nombre, pc.notas,
         COALESCE(pc.created_at, now()), pc.anulado_at, pc.anulado_por, pc.anulado_motivo
  FROM public.pagos_comprobantes pc
  WHERE pc.pago_id IS NULL
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.pagos_comprobantes SET pago_id = id WHERE pago_id IS NULL;

  INSERT INTO public.pagos (id, lado, fecha_pago, tipo_pago, comprobante_url, archivo_nombre, notas, operation_id, created_at, created_by,
                            anulado_at, anulado_por, anulado_motivo)
  SELECT pp.id, 'proveedor', pp.fecha_pago, COALESCE(pp.tipo_pago, 'TRANSFERENCIA'), pp.comprobante_url, pp.archivo_nombre, pp.notas,
         pp.operation_id, pp.created_at, pp.created_by, pp.anulado_at, pp.anulado_por, pp.anulado_motivo
  FROM public.pagos_cuentas_pagar pp
  WHERE pp.pago_id IS NULL
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.pagos_cuentas_pagar SET pago_id = id WHERE pago_id IS NULL;

  -- 6.2 Cada FACTURA_XML vigente se liga a su cuenta; todas las FACTURA_XML pierden el ancla de cuenta.
  UPDATE public.cuentas_cobrar cc
     SET factura_documento_id = d.id
    FROM (SELECT DISTINCT ON (cuentas_cobrar_id) id, cuentas_cobrar_id
            FROM public.documentos_cuentas_cobrar
           WHERE tipo = 'FACTURA_XML' AND eliminado_at IS NULL AND cuentas_cobrar_id IS NOT NULL
           ORDER BY cuentas_cobrar_id, created_at DESC, id) d
   WHERE d.cuentas_cobrar_id = cc.id AND cc.factura_documento_id IS NULL;

  -- 6.3 PDF y complementos se re-anclan a la factura vigente de su cuenta (sin factura, conservan el ancla de cuenta).
  UPDATE public.documentos_cuentas_cobrar d
     SET factura_documento_id = cc.factura_documento_id,
         cuentas_cobrar_id    = NULL
    FROM public.cuentas_cobrar cc
   WHERE d.cuentas_cobrar_id = cc.id
     AND d.tipo IN ('FACTURA_PDF', 'COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF')
     AND cc.factura_documento_id IS NOT NULL;

  UPDATE public.documentos_cuentas_cobrar SET cuentas_cobrar_id = NULL WHERE tipo = 'FACTURA_XML' AND cuentas_cobrar_id IS NOT NULL;

  -- 6.4 `pago_id` del complemento pasa de apuntar a pagos_comprobantes(id) a pagos(id) (mismos ids).
  ALTER TABLE public.documentos_cuentas_cobrar DROP CONSTRAINT IF EXISTS documentos_cuentas_cobrar_pago_id_fkey;
  ALTER TABLE public.documentos_cuentas_cobrar ADD CONSTRAINT documentos_cuentas_cobrar_pago_id_fkey
    FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE SET NULL;

  -- ── Aserciones ──
  SELECT count(*) INTO v_post_pagos_n FROM public.pagos;
  IF v_post_pagos_n < v_pre_cobro_n + v_pre_prov_n THEN
    RAISE EXCEPTION 'M1 backfill: pagos tiene % filas y las líneas son % + %', v_post_pagos_n, v_pre_cobro_n, v_pre_prov_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.pagos_comprobantes WHERE pago_id IS NULL OR pago_id <> id;
  IF v_n > 0 THEN RAISE EXCEPTION 'M1 backfill: % líneas de cobro sin cabecera 1:1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.pagos_cuentas_pagar WHERE pago_id IS NULL OR pago_id <> id;
  IF v_n > 0 THEN RAISE EXCEPTION 'M1 backfill: % líneas de proveedor sin cabecera 1:1', v_n; END IF;

  IF (SELECT COALESCE(sum(monto), 0) FROM public.pagos_comprobantes) <> v_pre_cobro_sum
     OR (SELECT COALESCE(sum(monto_transferido), 0) FROM public.pagos_cuentas_pagar) <> v_pre_prov_sum
     OR (SELECT count(*) FROM public.pagos_comprobantes) <> v_pre_cobro_n
     OR (SELECT count(*) FROM public.pagos_cuentas_pagar) <> v_pre_prov_n THEN
    RAISE EXCEPTION 'M1 backfill: conteos o sumas de las líneas de pago cambiaron';
  END IF;
  IF (SELECT count(*) FROM public.documentos_cuentas_cobrar) <> v_pre_docs_n THEN
    RAISE EXCEPTION 'M1 backfill: el número de documentos de cobro cambió';
  END IF;

  SELECT count(*) INTO v_xml_ligados
    FROM public.documentos_cuentas_cobrar d
   WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
     AND EXISTS (SELECT 1 FROM public.cuentas_cobrar cc WHERE cc.factura_documento_id = d.id);
  IF v_xml_ligados <> v_xml_vigentes THEN
    RAISE EXCEPTION 'M1 backfill: % de % FACTURA_XML vigentes quedaron ligadas a su cuenta', v_xml_ligados, v_xml_vigentes;
  END IF;
END
$backfill$;

-- ── 7. Restricciones sobre los datos ya migrados ────────────────────────────
-- Ancla única (precedente: documentos_cuentas_pagar_cuenta_o_grupo_check): FACTURA_XML no lleva
-- ancla; OTRO lleva cuenta; PDF y complementos llevan exactamente uno (el de cuenta solo por datos
-- legados, T13).
ALTER TABLE public.documentos_cuentas_cobrar DROP CONSTRAINT IF EXISTS documentos_cuentas_cobrar_ancla_check;
ALTER TABLE public.documentos_cuentas_cobrar ADD CONSTRAINT documentos_cuentas_cobrar_ancla_check CHECK (
  CASE tipo
    WHEN 'FACTURA_XML' THEN cuentas_cobrar_id IS NULL AND factura_documento_id IS NULL
    WHEN 'OTRO'        THEN cuentas_cobrar_id IS NOT NULL AND factura_documento_id IS NULL
    ELSE (cuentas_cobrar_id IS NOT NULL) <> (factura_documento_id IS NOT NULL)
  END
);

-- UUID fiscal único entre las facturas vigentes (T2); `operation_id` único solo para FACTURA_XML
-- (el complemento son N renglones por CFDI: su idempotencia es el único de abajo).
CREATE UNIQUE INDEX IF NOT EXISTS documentos_cc_uuid_cfdi_vigente_key
  ON public.documentos_cuentas_cobrar (uuid_cfdi)
  WHERE tipo = 'FACTURA_XML' AND eliminado_at IS NULL AND uuid_cfdi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documentos_cc_factura_operation_id_key
  ON public.documentos_cuentas_cobrar (operation_id)
  WHERE tipo = 'FACTURA_XML' AND operation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documentos_cc_complemento_vigente_key
  ON public.documentos_cuentas_cobrar (factura_documento_id, pago_id, tipo)
  WHERE tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
    AND factura_documento_id IS NOT NULL AND pago_id IS NOT NULL;

-- Complemento de proveedor: uno por (grupo, pago, tipo) entre los vigentes (P9).
CREATE UNIQUE INDEX IF NOT EXISTS documentos_cp_complemento_vigente_key
  ON public.documentos_cuentas_pagar (grupo_id, pago_id, tipo)
  WHERE tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND eliminado_at IS NULL
    AND grupo_id IS NOT NULL AND pago_id IS NOT NULL;

COMMIT;
