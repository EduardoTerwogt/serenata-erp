-- Invariante de los grupos de facturación (decisión 011):
--   cuentas_pagar_grupos.monto_total = Σ cuentas_pagar.x_pagar de sus renglones.
--
-- Hallazgo (issue #99, "Ajuste −$2,800" en SH072): en producción 2 grupos
-- guardaban un monto_total mayor a la suma de sus renglones y 1 grupo ABIERTO
-- no tenía renglones. Causa raíz: la complementaria SH072-B se aprobó y luego
-- se canceló el 2026-09-18 con la cancel_cotizacion de entonces, que borraba
-- las cuentas sin recalcular los grupos (corregido en
-- 20260925_cancel_cotizacion_cascada.sql). Los datos quedaron desfasados.
--
-- Hasta ahora cada RPC recalculaba el grupo a mano. Aquí el invariante lo
-- garantiza la BD: un trigger recalcula el grupo viejo y el nuevo en cualquier
-- INSERT, DELETE o cambio de x_pagar / grupo_id de cuentas_pagar, venga de
-- donde venga. El recálculo explícito de las RPCs queda como no-op.
-- total_a_transferir (snapshot del CFDI) no se toca.
--
-- Además repara los datos existentes: recalcula monto_total donde no cuadra y
-- borra los grupos ABIERTO sin renglones (con sus documentos), igual que
-- cancel_cotizacion. Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION public.cuentas_pagar_recalcular_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.grupo_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.grupo_id];
  ELSE
    v_ids := ARRAY[OLD.grupo_id, NEW.grupo_id];
  END IF;

  -- Serializa el recálculo por grupo (orden por id, sin interbloqueos). Sin este
  -- bloqueo, dos transacciones sobre renglones distintos del mismo grupo suman
  -- con su propia foto de datos y la última en confirmar pisa a la otra
  -- (live: 1,500 en vez de 1,700). Tras esperar el bloqueo, el UPDATE siguiente
  -- ya ve lo que confirmó la otra transacción.
  PERFORM 1 FROM cuentas_pagar_grupos g
  WHERE g.id = ANY(v_ids)
  ORDER BY g.id
  FOR UPDATE;

  UPDATE cuentas_pagar_grupos g SET
    monto_total = s.suma,
    updated_at = now()
  FROM (
    SELECT gid, (SELECT COALESCE(SUM(cp.x_pagar), 0) FROM cuentas_pagar cp WHERE cp.grupo_id = gid) AS suma
    FROM unnest(v_ids) AS gid
    WHERE gid IS NOT NULL
  ) s
  WHERE g.id = s.gid AND g.monto_total IS DISTINCT FROM s.suma;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cuentas_pagar_recalcular_grupo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_cuentas_pagar_recalcular_grupo ON public.cuentas_pagar;
CREATE TRIGGER trigger_cuentas_pagar_recalcular_grupo
AFTER INSERT OR DELETE OR UPDATE OF x_pagar, grupo_id ON public.cuentas_pagar
FOR EACH ROW EXECUTE FUNCTION public.cuentas_pagar_recalcular_grupo();

-- Reparación de datos existentes.
UPDATE cuentas_pagar_grupos g SET
  monto_total = s.suma,
  updated_at = now()
FROM (
  SELECT g2.id, COALESCE((SELECT SUM(cp.x_pagar) FROM cuentas_pagar cp WHERE cp.grupo_id = g2.id), 0) AS suma
  FROM cuentas_pagar_grupos g2
) s
WHERE g.id = s.id AND g.monto_total IS DISTINCT FROM s.suma;

DELETE FROM documentos_cuentas_pagar d
WHERE d.grupo_id IN (
  SELECT g.id FROM cuentas_pagar_grupos g
  WHERE g.estado = 'ABIERTO'
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
);

DELETE FROM cuentas_pagar_grupos g
WHERE g.estado = 'ABIERTO'
  AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id);

COMMIT;
