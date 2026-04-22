-- Tabla de usuarios del sistema (reemplaza AUTH_USERS env var)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  password_hash TEXT      NOT NULL,
  sections    TEXT[]      NOT NULL DEFAULT '{}',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: solo el service role accede (nunca cliente anon)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON usuarios
  USING (auth.role() = 'service_role');

-- Seed inicial: copiar usuarios del env var AUTH_USERS antes de eliminar esa variable.
-- Usa el script: npx tsx scripts/seed-usuarios.ts
