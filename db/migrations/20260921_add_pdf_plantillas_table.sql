-- Editor de PDFs (docs/PLAN.md, Bloque 3 / Track D) -- capa de persistencia del
-- modelo de 3 capas "Diseño activo vs. borrador" (docs/PLAN.md, sección
-- homónima). Una fila por tipo_documento, creada solo cuando ese documento se
-- migra al renderer nuevo (Bloques 7-9) -- sin fila = sigue en el generador
-- hardcodeado viejo.
--
-- Capas:
--   - Baseline: vive en código (lib/server/pdf/default-templates/{tipo}.ts),
--     nunca en esta tabla -- se lee solo para copiar a active_schema al migrar
--     un documento o al "Restaurar plantilla", nunca como referencia viva.
--   - active_schema: el diseño realmente aplicado hoy, siempre concreto.
--   - draft_schema: cambios sin aplicar (autosave). null = sin cambios
--     pendientes ("Descartar cambios" vuelve a null).
--
-- RLS service_role-only, mismo patrón que usuarios (20260422_add_usuarios_table.sql).

CREATE TABLE IF NOT EXISTS pdf_plantillas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento    TEXT        NOT NULL UNIQUE
    CHECK (tipo_documento IN ('cotizacion', 'orden_pago', 'hoja_llamado', 'reporte_cierre')),
  active_schema     JSONB       NOT NULL,
  draft_schema      JSONB       NULL,
  draft_updated_at  TIMESTAMPTZ NULL,
  draft_updated_by  UUID        REFERENCES usuarios(id),
  applied_at        TIMESTAMPTZ NULL,
  applied_by        UUID        REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: solo el service role accede (nunca cliente anon) -- mismo patrón que usuarios.
ALTER TABLE pdf_plantillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON pdf_plantillas
  USING (auth.role() = 'service_role');

COMMENT ON TABLE pdf_plantillas IS 'Modelo de 3 capas del Editor de PDFs (docs/PLAN.md): active_schema es el diseño aplicado, draft_schema el autosave sin aplicar. El baseline de código no se guarda aquí -- solo se copia a active_schema al migrar un documento o al Restaurar plantilla.';
COMMENT ON COLUMN pdf_plantillas.active_schema IS 'Diseño realmente aplicado hoy. Siempre concreto, nunca null.';
COMMENT ON COLUMN pdf_plantillas.draft_schema IS 'Cambios sin aplicar (autosave). null = sin cambios pendientes.';
