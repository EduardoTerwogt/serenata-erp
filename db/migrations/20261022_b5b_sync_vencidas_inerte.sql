-- B5b, etapa 1 (continuación de 20261021): `sync_estados_cuentas_cobrar_vencidas`
-- escribía `cuentas_cobrar.estado`, que ahora es una columna generada
-- (D15), y `plpgsql_check` lo marca como error. Ya nadie la llama (se quitó del
-- cron `/api/keep-alive`); `buscar_cuentas_cobrar`, que se retira, todavía la
-- invoca. Queda inerte hasta que el script manual de cierre de B5b la borre junto
-- con `buscar_cuentas_cobrar`, `buscar_cuentas_pagar`,
-- `buscar_cuentas_pagar_grupos` y `cuentas_cobrar_estado_calculado`.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sync_estados_cuentas_cobrar_vencidas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Retirada (D15): el estado del cobro es derivado; no hay nada que sincronizar.
  NULL;
END;
$function$;

COMMIT;
