-- Migración: corregir índices de búsqueda a GIN trigram (paridad con producción)
--
-- Contexto (Fase 4.5, Punto 1): 20260411_performance_indexes_fase5b.sql crea
-- índices btree simples (idx_clientes_nombre, idx_productos_descripcion,
-- idx_responsables_nombre) para acelerar búsquedas ILIKE. En producción esos
-- tres índices NO existen -- fueron reemplazados directo en el dashboard por
-- índices GIN con pg_trgm (idx_clientes_nombre_gin, idx_productos_descripcion_gin,
-- idx_responsables_nombre_gin), sin que ese cambio quedara documentado como
-- migración. Este archivo alinea el repo con lo que producción realmente tiene:
-- quita los btree de fase5b y crea los GIN trigram equivalentes.
--
-- Debe ordenar después de 20260422_enable_rls_missing_tables.sql (última
-- migración existente) y después de 20260101_base_schema_missing_tables.sql.

create extension if not exists pg_trgm;

drop index if exists idx_clientes_nombre;
drop index if exists idx_productos_descripcion;
drop index if exists idx_responsables_nombre;

create index if not exists idx_clientes_nombre_gin
  on public.clientes using gin (nombre gin_trgm_ops)
  where activo = true;

create index if not exists idx_productos_descripcion_gin
  on public.productos using gin (descripcion gin_trgm_ops)
  where activo = true;

create index if not exists idx_responsables_nombre_gin
  on public.responsables using gin (nombre gin_trgm_ops);
