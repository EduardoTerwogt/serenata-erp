-- Auditoría externa 2026-09-09 (Fase 3.3) -- registrar-pago (cobrar y pagar)
-- no tenía protección contra doble click/retry: dos requests con el mismo
-- monto podían crear dos pagos. La UI ya deshabilita el botón mientras
-- guarda (defensa de una sola pestaña), pero no cubre un retry de red o dos
-- pestañas abiertas. `idempotency_keys` guarda el resultado de la primera
-- ejecución de una key dada; una segunda request con la misma key recibe
-- la misma respuesta en vez de repetir el efecto.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  status_code integer,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito, mismo patrón que el resto de las tablas:
-- solo accesible via supabaseAdmin (service_role), nunca desde el navegador.
