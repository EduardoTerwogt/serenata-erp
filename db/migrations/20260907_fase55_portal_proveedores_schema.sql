-- Fase 5.5 -- Portal de proveedores (self-service, con matching automático
-- de identidad). Ver plan-arquitectura-fase5-serenata.md sección 4 y el
-- documento maestro sección 7 para el contexto de la decisión.
--
-- Principio: la identidad del portal ES la misma fila de `proveedores`,
-- nunca una tabla de "usuarios de portal" separada -- mismo criterio que ya
-- rige Cuentas/Proveedores (Fase 5.3): un solo registro maestro.

-- 1. Columnas de portal en proveedores ---------------------------------

ALTER TABLE proveedores ADD COLUMN password_hash text NULL;
ALTER TABLE proveedores ADD COLUMN portal_estado text NULL
  CHECK (portal_estado IN ('pendiente_confirmacion', 'activo'));
ALTER TABLE proveedores ADD COLUMN match_candidato_id uuid NULL
  REFERENCES proveedores(id);

COMMENT ON COLUMN proveedores.password_hash IS
  'Hash PBKDF2 (mismo formato que usuarios.password_hash, ver lib/auth-utils.ts) del password que el proveedor crea en el signup del portal. NULL = proveedor cargado por staff que nunca hizo signup.';
COMMENT ON COLUMN proveedores.portal_estado IS
  'pendiente_confirmacion = hizo signup y está esperando responder si un candidato de match es él; activo = ya puede loguear normalmente. NULL = sin cuenta de portal.';
COMMENT ON COLUMN proveedores.match_candidato_id IS
  'Transitorio: candidato de fuzzy-match propuesto tras el signup, mientras portal_estado = pendiente_confirmacion. Se limpia (NULL) al confirmar o rechazar.';

-- correo ya existe (columna previa) y se reusa como login del portal.
-- Único solo entre filas que sí tienen cuenta de portal -- no afecta a los
-- proveedores cargados por staff que puedan compartir o no tener correo.
CREATE UNIQUE INDEX idx_proveedores_correo_portal
  ON proveedores(correo)
  WHERE password_hash IS NOT NULL;

-- 2. Documentos legales del proveedor -----------------------------------
-- Mismo patrón que documentos_cuentas_cobrar/documentos_cuentas_pagar/
-- proyecto_documentos: una tabla, columna `tipo` con CHECK, no una tabla
-- por tipo de documento.

CREATE TABLE proveedor_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'CONSTANCIA_SITUACION_FISCAL',
    'INE',
    'COMPROBANTE_DOMICILIO',
    'COMPROBANTE_BANCARIO'
  )),
  archivo_url text NOT NULL,
  archivo_nombre text NOT NULL,
  estado_validacion text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN ('pendiente', 'validado', 'revision')),
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_proveedor_documentos_proveedor ON proveedor_documentos(proveedor_id);
CREATE INDEX idx_proveedor_documentos_tipo ON proveedor_documentos(tipo);

COMMENT ON TABLE proveedor_documentos IS
  'Documentos legales subidos por el proveedor vía el Portal (Fase 5.5): constancia de situación fiscal, INE, comprobante de domicilio, comprobante bancario.';

-- 3. Matching de identidad por nombre (fuzzy) ---------------------------
-- pg_trgm ya está instalado en este proyecto (usado para búsqueda desde
-- 20260423_fix_search_indexes_trgm.sql) -- se reusa el mismo índice GIN
-- trigram sobre proveedores.nombre, no se agrega ninguna librería ni
-- servicio externo de matching.

CREATE OR REPLACE FUNCTION match_proveedor_por_nombre(p_nombre text, p_excluir_id uuid)
RETURNS TABLE (id uuid, nombre text, score real)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id, p.nombre, similarity(p.nombre, p_nombre) AS score
  FROM proveedores p
  WHERE p.id != p_excluir_id
    AND (p.portal_estado IS NULL OR p.portal_estado != 'activo')
    AND similarity(p.nombre, p_nombre) > 0.35
  ORDER BY score DESC
  LIMIT 3;
$$;

COMMENT ON FUNCTION match_proveedor_por_nombre IS
  'Fase 5.5: candidatos de fuzzy-match para vincular un signup nuevo del Portal con un proveedor ya cargado por staff. Excluye proveedores con portal_estado = activo (esa identidad ya está reclamada).';

-- 4. RLS (mismo patrón sin políticas propias que el resto del proyecto --
-- todo el acceso va por supabaseAdmin/service_role)
ALTER TABLE proveedor_documentos ENABLE ROW LEVEL SECURITY;
