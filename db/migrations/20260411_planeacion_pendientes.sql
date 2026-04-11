-- Tabla para guardar filas de planeación que quedan en estado por_confirmar o cancelado
-- para revisión posterior en el dashboard
create table if not exists public.planeacion_pendientes (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  proyecto text not null,
  fecha text,            -- raw parseado, nullable
  fecha_iso date,        -- normalizada, nullable
  ciudad text,
  locacion text,
  estado text not null check (estado in ('por_confirmar','cancelado')),
  raw_input text,        -- línea original para debug
  created_at timestamptz not null default now()
);

-- Índice para consultas rápidas en dashboard
create index if not exists idx_planeacion_pendientes_estado on public.planeacion_pendientes(estado);
create index if not exists idx_planeacion_pendientes_cliente on public.planeacion_pendientes(cliente);
create index if not exists idx_planeacion_pendientes_created_at on public.planeacion_pendientes(created_at desc);
