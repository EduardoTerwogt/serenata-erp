-- Engineering Hardening EF-1, 1E-3a (inerte -- ningún caller la invoca
-- todavía, eso es 1E-3b/1E-3c). Idempotencia financiera atómica: agrega un
-- overload de cada RPC de pago que recibe `p_operation_id` y persiste su
-- resultado en `pago_operations`, sin tocar ni una línea de los overloads
-- existentes (2 args CxP / 7 args CxC) -- el nuevo overload simplemente los
-- llama para toda la lógica de negocio (lock, validaciones, recálculo de
-- orden_pago) y envuelve el resultado con la bookkeeping de idempotencia.
--
-- Diseño (plan Engineering Hardening v13.1 §9):
-- * pago_operations(operation_id PK, dominio, cuenta_id, result,
--   created_at) -- sin fingerprint financiero adicional (decisión ya
--   cerrada en rondas previas del plan): la identidad es el operation_id,
--   punto.
-- * P1411: si un operation_id ya resuelto se reutiliza con un
--   dominio/cuenta_id distinto, se rechaza -- nunca se confunde un pago de
--   una cuenta con el de otra. Validado DENTRO de cada overload.
-- * Si el operation_id no existe todavía, corre la función original sin
--   ningún cambio de comportamiento y, solo si tiene éxito, inserta su
--   propio resultado en pago_operations -- un fallo (excepción del
--   overload viejo) nunca deja fila en pago_operations, así que un retry
--   real con el mismo operation_id puede volver a intentarlo limpio.
-- * `operation_id` en documentos_cuentas_pagar/documentos_cuentas_cobrar
--   (nullable): permite, en la activación (1E-3b/c), reconstruir el
--   contrato HTTP exacto de una operación ya resuelta (qué documento se
--   subió) desde el endpoint de reconciliación, sin adivinar.

CREATE TABLE IF NOT EXISTS pago_operations (
  operation_id uuid PRIMARY KEY,
  dominio text NOT NULL CHECK (dominio IN ('cuentas_pagar', 'cuentas_cobrar')),
  cuenta_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pago_operations ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito, mismo patrón que idempotency_keys/
-- bulk_import_operations: solo accesible vía supabaseAdmin (service_role).

ALTER TABLE documentos_cuentas_pagar ADD COLUMN IF NOT EXISTS operation_id uuid NULL;
ALTER TABLE documentos_cuentas_cobrar ADD COLUMN IF NOT EXISTS operation_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_cp_operation_id ON documentos_cuentas_pagar(operation_id);
CREATE INDEX IF NOT EXISTS idx_documentos_cc_operation_id ON documentos_cuentas_cobrar(operation_id);

-- Overload CxP: 3 parámetros (2 existentes + p_operation_id).
create or replace function registrar_pago_cuenta_pagar(
  p_cuenta_id uuid,
  p_monto numeric,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing pago_operations;
  v_result jsonb;
begin
  select * into v_existing from pago_operations where operation_id = p_operation_id;
  if found then
    if v_existing.dominio <> 'cuentas_pagar' or v_existing.cuenta_id <> p_cuenta_id then
      raise exception 'registrar_pago_cuenta_pagar: operation_id % ya pertenece a %/%, no a cuentas_pagar/%',
        p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
        using errcode = 'P1411';
    end if;
    return v_existing.result;
  end if;

  -- Toda la lógica de negocio (lock, validaciones, recálculo de orden de
  -- pago) vive sin cambios en el overload de 2 args -- este solo la invoca.
  v_result := registrar_pago_cuenta_pagar(p_cuenta_id, p_monto);

  insert into pago_operations (operation_id, dominio, cuenta_id, result)
  values (p_operation_id, 'cuentas_pagar', p_cuenta_id, v_result);

  return v_result;
end;
$$;

-- Overload CxC: 8 parámetros (7 existentes + p_operation_id).
create or replace function registrar_pago_cuenta_cobrar(
  p_cuenta_id uuid,
  p_monto numeric,
  p_tipo_pago text,
  p_fecha_pago date,
  p_comprobante_url text,
  p_archivo_nombre text,
  p_notas text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing pago_operations;
  v_result jsonb;
begin
  select * into v_existing from pago_operations where operation_id = p_operation_id;
  if found then
    if v_existing.dominio <> 'cuentas_cobrar' or v_existing.cuenta_id <> p_cuenta_id then
      raise exception 'registrar_pago_cuenta_cobrar: operation_id % ya pertenece a %/%, no a cuentas_cobrar/%',
        p_operation_id, v_existing.dominio, v_existing.cuenta_id, p_cuenta_id
        using errcode = 'P1411';
    end if;
    return v_existing.result;
  end if;

  v_result := registrar_pago_cuenta_cobrar(
    p_cuenta_id, p_monto, p_tipo_pago, p_fecha_pago, p_comprobante_url, p_archivo_nombre, p_notas
  );

  insert into pago_operations (operation_id, dominio, cuenta_id, result)
  values (p_operation_id, 'cuentas_cobrar', p_cuenta_id, v_result);

  return v_result;
end;
$$;

-- Permisos endurecidos desde el nacimiento -- nunca heredan el EXECUTE
-- default de PUBLIC (mismo patrón que 20260909_harden_rpc_permissions.sql).
REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cuenta_pagar(uuid, numeric, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cuenta_cobrar(uuid, numeric, text, date, text, text, text, uuid) TO service_role;
