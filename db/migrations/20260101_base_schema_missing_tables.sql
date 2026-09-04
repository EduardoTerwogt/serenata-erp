-- Migración: reconstruir el esquema base que faltaba en el historial del repo
--
-- Contexto (Fase 4.5, Punto 1): las migraciones existentes (20260327 en adelante)
-- asumen que 10 tablas ya existen -- cotizaciones, clientes, productos,
-- responsables, proyectos, items_cotizacion, cuentas_cobrar, cuentas_pagar,
-- historial_responsable, cotizacion_collaboration_events -- pero nunca las crean:
-- se crearon fuera del repo, directo en el dashboard de producción, antes de que
-- empezara el historial de migraciones versionado. Este archivo reconstruye esas
-- 10 tablas leyendo el esquema real de producción (information_schema/pg_catalog
-- contra el proyecto serenata-erp, ref fwmyoqokcjtldiofuxdg, solo lectura),
-- incluyendo únicamente las columnas/constraints/índices que YA existían antes de
-- que las migraciones posteriores empezaran a alterarlas -- las columnas que sí
-- fueron agregadas por una migración existente (ej. cotizaciones.drive_file_id,
-- cuentas_cobrar.estado/folio, cuentas_pagar.item_id/folio/orden_pago_id) se
-- omiten aquí a propósito para que esa migración las siga agregando ella misma,
-- sin duplicar historia.
--
-- Debe ordenar ANTES que 20260327_p0_p1_cotizaciones_stability.sql (nombrada con
-- fecha 2026-01-01 para eso). No modifica producción: solo se aplica al proyecto
-- de prueba y a cualquier ambiente nuevo que reproduzca el esquema desde cero.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ── Tablas sin dependencias ────────────────────────────────────────────────

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text,
  contacto text,
  correo text,
  telefono text,
  notas text,
  activo boolean default true,
  created_at timestamptz default now(),
  proyectos text[] default '{}'::text[]
);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null unique,
  categoria text,
  precio_unitario numeric default 0,
  x_pagar_sugerido numeric default 0,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.responsables (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  correo text,
  banco text,
  clabe text,
  roles text[],
  notas text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ── cotizaciones (raíz de casi todas las FKs de negocio) ────────────────────

create table if not exists public.cotizaciones (
  id text primary key,
  cliente text not null,
  proyecto text not null,
  fecha_entrega text,
  locacion text,
  fecha_cotizacion date,
  tipo text default 'PRINCIPAL',
  es_complementaria_de text,
  estado text default 'BORRADOR',
  subtotal numeric default 0,
  fee_agencia numeric default 0,
  general numeric default 0,
  iva numeric default 0,
  total numeric default 0,
  margen_total numeric default 0,
  utilidad_total numeric default 0,
  created_at timestamptz default now(),
  fecha_aprobacion timestamptz,
  porcentaje_fee numeric default 0.15,
  iva_activo boolean default true,
  descuento_tipo text default 'monto' check (descuento_tipo in ('monto', 'porcentaje')),
  descuento_valor numeric default 0
);

-- ── Tablas que dependen de cotizaciones/responsables ────────────────────────

create table if not exists public.proyectos (
  id text primary key references public.cotizaciones(id),
  cliente text not null,
  proyecto text not null,
  fecha_entrega text,
  locacion text,
  horarios text,
  punto_encuentro text,
  estado text default 'PREPRODUCCION',
  notas text,
  created_at timestamptz default now(),
  ultima_actualizacion timestamptz default now()
);

create table if not exists public.items_cotizacion (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id text references public.cotizaciones(id) on delete cascade,
  categoria text,
  descripcion text not null,
  cantidad numeric default 1,
  precio_unitario numeric default 0,
  importe numeric default 0,
  responsable_nombre text,
  responsable_id uuid references public.responsables(id),
  x_pagar numeric default 0,
  margen numeric default 0,
  orden integer default 0,
  notas text
);

create table if not exists public.cuentas_cobrar (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id text references public.cotizaciones(id),
  cliente text not null,
  proyecto text not null,
  monto_total numeric default 0,
  fecha_vencimiento date,
  fecha_pago timestamptz,
  notas text,
  created_at timestamptz default now()
);

create table if not exists public.cuentas_pagar (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id text references public.cotizaciones(id),
  proyecto_id text references public.proyectos(id),
  responsable_id uuid references public.responsables(id),
  responsable_nombre text not null,
  item_descripcion text,
  cantidad numeric default 1,
  x_pagar numeric default 0,
  margen numeric default 0,
  telefono text,
  correo text,
  clabe text,
  banco text,
  fecha_pago timestamptz,
  metodo_pago text,
  notas text,
  created_at timestamptz default now()
);

create table if not exists public.historial_responsable (
  id uuid primary key default gen_random_uuid(),
  responsable_id uuid references public.responsables(id) on delete cascade,
  cotizacion_id text references public.cotizaciones(id),
  proyecto_nombre text not null,
  cliente text not null,
  fecha_evento text,
  rol_en_proyecto text,
  x_pagar numeric default 0,
  created_at timestamptz default now(),
  proyecto_id text,
  unique (responsable_id, cotizacion_id, rol_en_proyecto)
);

create table if not exists public.cotizacion_collaboration_events (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id text not null references public.cotizaciones(id) on delete cascade,
  user_id text not null,
  user_email text not null default '',
  user_name text not null default 'Usuario',
  event_type text not null check (event_type in ('join', 'leave', 'start_edit_section', 'stop_edit_section', 'save')),
  section text check (section in ('notas', 'general', 'partidas', 'totales')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ── Índices base (no cubiertos por ninguna de las 24 migraciones existentes) ─

create index if not exists idx_historial_responsable_proyecto_id
  on public.historial_responsable (proyecto_id);

create index if not exists idx_collab_events_cotizacion_created_at
  on public.cotizacion_collaboration_events (cotizacion_id, created_at desc);
