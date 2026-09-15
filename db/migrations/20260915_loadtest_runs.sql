-- EF-3A 3A-4: registro persistente de corridas de carga -- necesario para
-- que el barrido de huérfanos (una corrida que murió a medio camino en un
-- runner de GitHub Actions, sin disco persistente entre corridas) pueda
-- recuperar el ID real de la carpeta de Drive de esa corrida y borrarla,
-- sin depender de ningún estado local.
--
-- drive_folder_id guarda el ID real de Drive (nunca el nombre
-- `loadtest-${runId}`) -- scripts/loadtest/create-drive-run-folder.mjs lo
-- llena tras crear la carpeta real vía
-- POST /api/internal/loadtest-drive-folder. cleaned_at se llena al
-- terminar el cleanup exitoso de esa corrida (bulk-cleanup.mjs).

CREATE TABLE IF NOT EXISTS loadtest_runs (
  run_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  drive_folder_id text,
  cleaned_at timestamptz
);

ALTER TABLE loadtest_runs ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito -- solo accesible via service_role, mismo
-- patrón que rate_limits (20260909_rate_limits.sql) y el resto de las
-- tablas del repo.
