-- #123 B6a (docs/PLAN.md): datos fiscales de Serenata desde su Constancia de Situación Fiscal.
--
-- El RFC de Serenata deja de vivir en una variable de entorno (`SERENATA_RFC`, puente de B3): se sube la constancia
-- en Admin, se leen y validan RFC, razón social y régimen, y se guardan aquí. Una sola fila vigente a la vez; las
-- anteriores quedan como historial. Solo entra service_role (RLS sin policies), igual que `pagos`.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.datos_fiscales_serenata (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc               text        NOT NULL,
  razon_social      text        NOT NULL,
  -- Régimen tal como lo dice la constancia (texto libre del SAT).
  regimen_fiscal    text,
  -- Se deriva del RFC (12 posiciones = moral, 13 = física) y reemplaza el supuesto fijo de "persona moral".
  tipo_persona      text        NOT NULL,
  codigo_postal     text,
  constancia_url    text,
  constancia_nombre text,
  vigente           boolean     NOT NULL DEFAULT true,
  actualizado_por   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT datos_fiscales_serenata_rfc_check
    CHECK (rfc = upper(btrim(rfc)) AND rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  CONSTRAINT datos_fiscales_serenata_tipo_check
    CHECK (tipo_persona IN ('moral', 'fisica')),
  CONSTRAINT datos_fiscales_serenata_tipo_rfc_check
    CHECK ((tipo_persona = 'moral' AND char_length(rfc) = 12) OR (tipo_persona = 'fisica' AND char_length(rfc) = 13))
);

-- A lo más una vigente: la unicidad la garantiza la base, no la aplicación.
CREATE UNIQUE INDEX IF NOT EXISTS uq_datos_fiscales_serenata_vigente
  ON public.datos_fiscales_serenata (vigente) WHERE vigente;

ALTER TABLE public.datos_fiscales_serenata ENABLE ROW LEVEL SECURITY;  -- sin policies: solo entra service_role
REVOKE ALL ON public.datos_fiscales_serenata FROM anon, authenticated;

-- Guardar una constancia nueva: la anterior pasa a historial y la nueva queda vigente, en una sola transacción.
CREATE OR REPLACE FUNCTION public.guardar_datos_fiscales_serenata(
  p_rfc text, p_razon_social text, p_regimen_fiscal text, p_codigo_postal text,
  p_constancia_url text, p_constancia_nombre text, p_usuario text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rfc  text := upper(btrim(p_rfc));
  v_tipo text;
  v_id   uuid;
BEGIN
  IF v_rfc IS NULL OR v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
    RAISE EXCEPTION 'rfc_invalido: el RFC no tiene la estructura de un RFC' USING ERRCODE = 'P1413';
  END IF;
  IF p_razon_social IS NULL OR btrim(p_razon_social) = '' THEN
    RAISE EXCEPTION 'razon_social_requerida: falta la razón social' USING ERRCODE = 'P1413';
  END IF;
  v_tipo := CASE char_length(v_rfc) WHEN 12 THEN 'moral' ELSE 'fisica' END;

  UPDATE public.datos_fiscales_serenata SET vigente = false WHERE vigente;
  INSERT INTO public.datos_fiscales_serenata (rfc, razon_social, regimen_fiscal, tipo_persona, codigo_postal, constancia_url, constancia_nombre, actualizado_por)
  VALUES (v_rfc, btrim(p_razon_social), NULLIF(btrim(p_regimen_fiscal), ''), v_tipo, NULLIF(btrim(p_codigo_postal), ''), p_constancia_url, p_constancia_nombre, p_usuario)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_datos_fiscales_serenata(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_datos_fiscales_serenata(text, text, text, text, text, text, text) TO service_role;

COMMIT;
