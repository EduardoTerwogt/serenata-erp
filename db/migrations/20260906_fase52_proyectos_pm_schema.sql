-- Migration: fase52_proyectos_pm_schema
-- Purpose: Fase 5.2 (Proyectos como PM) -- Bloque 1: esquema.
--   1. Catálogo abierto de tipos de proyecto (tipos_proyecto) y sus etapas
--      configurables (tipo_proyecto_etapas) -- reemplaza el enum fijo de
--      proyectos.estado, que hasta hoy asumía que todo proyecto es una
--      Grabación (Preproducción/Rodaje/Postproducción/Finalizado). Un
--      Concierto o un Diseño de Show tienen sus propias etapas.
--   2. tipo_proyecto_tarea_default: plantilla de tareas típicas por tipo,
--      que se copia al crear un proyecto nuevo de ese tipo.
--   3. proyecto_tareas + proyecto_tarea_checklist: tablero de tareas por
--      proyecto (Kanban interno). origen distingue tarea de plantilla vs.
--      agregada a mano -- señal para la futura capa de sugerencias por IA
--      (diferida, no se construye en este bloque).
--   4. proyecto_documentos: los 9 documentos del framework de Google PM
--      (Brief, Stakeholders/RACI, Ruta Crítica, Roadmap, Charter, Riesgos,
--      Plan de Comunicación, Status Report, Reporte de Cierre), mismo
--      patrón que documentos_cuentas_cobrar/documentos_cuentas_pagar
--      (una tabla, columna tipo con CHECK).
--   5. proyectos gana tipo_proyecto_id, etapa_id, fecha_inicio_real,
--      fecha_cierre_real -- ADITIVO, no se toca ni se borra la columna
--      `estado` existente todavía. El código de producción (lectura de
--      `estado`, updateProyectoWithRollback comparando 'FINALIZADO', etc.)
--      sigue funcionando exactamente igual hasta que el Bloque 2/3 migre
--      la lógica a etapa_id -- ningún feature existente se rompe con esta
--      migración por sí sola.
--   6. Backfill: se crean los 3 tipos (Grabación, Concierto, Diseño de
--      Show) con sus etapas, y todos los proyectos existentes (100%
--      Grabación hasta hoy) quedan apuntando al tipo/etapa correctos según
--      su `estado` actual -- ningún proyecto cambia de estado visible.
--
-- Todo dentro de una transacción: si algo falla, no se aplica nada.
-- Se prueba primero contra serenata-erp-test antes de producción, con
-- confirmación explícita del usuario en cada ambiente (regla de CLAUDE.md).
--
-- Aplicado a serenata-erp-test (ozrtsludmcguvgqdjicn) el 2026-09-06 vía
-- mcp__Supabase__apply_migration, con confirmación explícita del usuario.
-- Verificado: 3 tipos x 4 etapas (12 filas), última etapa de cada tipo
-- marcada es_etapa_final, el único proyecto existente (SH003, RODAJE)
-- quedó correctamente enlazado a Grabación -> Rodaje sin cambiar su
-- `estado` visible. get_advisors revisado: 0 advisories WARN nuevos
-- (los WARN existentes son de funciones/tablas previas, no de esta
-- migración); único hallazgo real -- FK proyecto_tareas.asignado_a sin
-- índice -- corregido agregando idx_proyecto_tareas_asignado_a abajo
-- (aplicado como ajuste incremental en test, incluido aquí para que
-- producción lo reciba completo en una sola pasada).
--
-- Aplicado a producción (fwmyoqokcjtldiofuxdg) el 2026-09-06 vía
-- mcp__Supabase__apply_migration, con confirmación explícita del usuario.
-- Verificado post-aplicación: 3 tipos x 4 etapas (12 filas). Los 15
-- proyectos existentes en producción (SH001-SH060) quedaron enlazados a
-- Grabación con la etapa exacta que corresponde a su `estado` actual
-- (FINALIZADO→Finalizado, PREPRODUCCION→Preproducción), sin que ningún
-- `estado` visible cambiara. get_advisors (security + performance)
-- revisado: 0 hallazgos nuevos de nivel WARN o superior -- los únicos
-- hallazgos sobre las tablas nuevas son INFO esperados (rls_enabled_no_policy,
-- mismo patrón sin políticas propias del resto del proyecto; unused_index,
-- normal en tablas recién creadas sin tráfico aún).

BEGIN;

-- ============================================================
-- 1. tipos_proyecto + tipo_proyecto_etapas
-- ============================================================

CREATE TABLE IF NOT EXISTS tipos_proyecto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tipos_proyecto IS
  'Catálogo abierto de tipos de proyecto (Grabación, Concierto, Diseño de Show, ...). Cualquier usuario puede agregar tipos nuevos desde la UI, sin tocar código.';

CREATE TABLE IF NOT EXISTS tipo_proyecto_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_proyecto_id UUID NOT NULL REFERENCES tipos_proyecto(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INT NOT NULL,
  es_etapa_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_proyecto_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_tipo_proyecto_etapas_tipo ON tipo_proyecto_etapas(tipo_proyecto_id, orden);

COMMENT ON TABLE tipo_proyecto_etapas IS
  'Etapas ordenables por tipo de proyecto -- reemplaza el enum fijo que asumía Preproducción/Rodaje/Postproducción/Finalizado para todo proyecto. es_etapa_final marca cuál etapa dispara el cierre automático (Reporte de Cierre, fecha_cierre_real), sin importar cómo se llame.';

-- ============================================================
-- 2. tipo_proyecto_tarea_default (plantilla de tareas por tipo)
-- ============================================================

CREATE TABLE IF NOT EXISTS tipo_proyecto_tarea_default (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_proyecto_id UUID NOT NULL REFERENCES tipos_proyecto(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT NULL,
  es_hito BOOLEAN NOT NULL DEFAULT false,
  dias_antes_entrega INT NULL,
  orden INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipo_proyecto_tarea_default_tipo ON tipo_proyecto_tarea_default(tipo_proyecto_id, orden);

COMMENT ON TABLE tipo_proyecto_tarea_default IS
  'Plantilla de tareas típicas por tipo de proyecto. Al crear un proyecto nuevo, estas filas se copian a proyecto_tareas (origen=plantilla) con fecha_limite calculada desde proyectos.fecha_entrega - dias_antes_entrega. Se llena vacía en esta migración -- el contenido real se define desde la UI (Bloque 3, pantalla "Tipos de proyecto"), no se hardcodea aquí.';

-- ============================================================
-- 3. proyecto_tareas + proyecto_tarea_checklist
-- ============================================================

CREATE TABLE IF NOT EXISTS proyecto_tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA')),
  asignado_a UUID NULL REFERENCES proveedores(id),
  es_hito BOOLEAN NOT NULL DEFAULT false,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('plantilla', 'manual')),
  fecha_limite DATE NULL,
  fecha_completada TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proyecto_tareas_proyecto ON proyecto_tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_tareas_estado ON proyecto_tareas(estado);
CREATE INDEX IF NOT EXISTS idx_proyecto_tareas_fecha_limite ON proyecto_tareas(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_proyecto_tareas_asignado_a ON proyecto_tareas(asignado_a);

COMMENT ON COLUMN proyecto_tareas.origen IS
  'plantilla (copiada de tipo_proyecto_tarea_default al crear el proyecto) | manual (agregada a mano). Señal para la futura capa de sugerencias por IA (diferida): tareas manuales repetidas en varios proyectos del mismo tipo son candidatas a pasar a la plantilla default.';
COMMENT ON COLUMN proyecto_tareas.es_hito IS
  'Marca los hitos del proyecto -- alimentan la vista Ruta Crítica/Cronograma y el cronograma real-vs-planeado del Reporte de Cierre (fecha_limite planeada vs. fecha_completada real). Un solo dato, dos usos.';
COMMENT ON TABLE proyecto_tareas IS
  'Tablero de tareas (Kanban) por proyecto. estado mapea a los 4 tonos de StatusBadge: COMPLETADA→approved, EN_PROGRESO→issued, PENDIENTE→draft, BLOQUEADA→cancelled -- mismo patrón que cotizaciones/cuentas, sin agregar colores nuevos.';

CREATE TABLE IF NOT EXISTS proyecto_tarea_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES proyecto_tareas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  completado BOOLEAN NOT NULL DEFAULT false,
  orden INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_proyecto_tarea_checklist_tarea ON proyecto_tarea_checklist(tarea_id);

-- ============================================================
-- 4. proyecto_documentos (framework de Google PM, 9 tipos)
-- ============================================================

CREATE TABLE IF NOT EXISTS proyecto_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'BRIEF', 'STAKEHOLDERS_RACI', 'RUTA_CRITICA', 'ROADMAP', 'CHARTER',
    'RIESGOS', 'PLAN_COMUNICACION', 'STATUS_REPORT', 'REPORTE_CIERRE'
  )),
  titulo TEXT NULL,
  contenido JSONB NOT NULL DEFAULT '{}'::jsonb,
  archivo_url TEXT NULL,
  archivo_nombre TEXT NULL,
  auto_generado_at TIMESTAMPTZ NULL,
  editado_manualmente BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uno por proyecto para todos los tipos salvo STATUS_REPORT, que se repite
-- (un status report nuevo cada vez que alguien lo pide).
CREATE UNIQUE INDEX IF NOT EXISTS idx_proyecto_documentos_unico
  ON proyecto_documentos(proyecto_id, tipo)
  WHERE tipo <> 'STATUS_REPORT';

CREATE INDEX IF NOT EXISTS idx_proyecto_documentos_proyecto ON proyecto_documentos(proyecto_id);

COMMENT ON COLUMN proyecto_documentos.editado_manualmente IS
  'false = sigue como se auto-generó (equivalente a "Precargado"/"Automático" en la UI). true = el usuario ya lo editó. No se guarda historial de versiones (decisión deliberada, evita sobreingeniería) -- solo este flag + updated_at.';
COMMENT ON TABLE proyecto_documentos IS
  'Los 9 documentos del framework de Google PM adaptado para Serenata. Mismo patrón que documentos_cuentas_cobrar/documentos_cuentas_pagar: una tabla, columna tipo con CHECK, en vez de una tabla por tipo de documento.';

-- ============================================================
-- 5. proyectos: columnas nuevas (aditivo, no se toca `estado`)
-- ============================================================

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS tipo_proyecto_id UUID NULL REFERENCES tipos_proyecto(id),
  ADD COLUMN IF NOT EXISTS etapa_id UUID NULL REFERENCES tipo_proyecto_etapas(id),
  ADD COLUMN IF NOT EXISTS fecha_inicio_real DATE NULL,
  ADD COLUMN IF NOT EXISTS fecha_cierre_real DATE NULL;

CREATE INDEX IF NOT EXISTS idx_proyectos_tipo_proyecto ON proyectos(tipo_proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_etapa ON proyectos(etapa_id);

COMMENT ON COLUMN proyectos.tipo_proyecto_id IS
  'FK a tipos_proyecto. Reemplaza gradualmente al enum fijo de `estado` -- ver etapa_id. Columna `estado` se conserva sin cambios hasta que el código (Bloque 2/3) migre por completo a etapa_id; no se rompe nada existente con esta migración.';
COMMENT ON COLUMN proyectos.etapa_id IS
  'FK a tipo_proyecto_etapas -- la etapa real del proyecto dentro de su tipo. Convive con `estado` (texto legado) hasta que el Bloque 2/3 termine la migración de lectura/escritura; ambos se mantienen sincronizados mientras tanto.';

-- ============================================================
-- 6. Backfill: 3 tipos + sus etapas, proyectos existentes → Grabación
-- ============================================================

DO $$
DECLARE
  v_grabacion_id UUID;
  v_concierto_id UUID;
  v_disenoshow_id UUID;
BEGIN
  -- Grabación (tipo de todos los proyectos existentes hasta hoy)
  INSERT INTO tipos_proyecto (nombre) VALUES ('Grabación')
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_grabacion_id;

  INSERT INTO tipo_proyecto_etapas (tipo_proyecto_id, nombre, orden, es_etapa_final) VALUES
    (v_grabacion_id, 'Preproducción', 1, false),
    (v_grabacion_id, 'Rodaje', 2, false),
    (v_grabacion_id, 'Postproducción', 3, false),
    (v_grabacion_id, 'Finalizado', 4, true)
  ON CONFLICT (tipo_proyecto_id, nombre) DO NOTHING;

  -- Concierto
  INSERT INTO tipos_proyecto (nombre) VALUES ('Concierto')
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_concierto_id;

  INSERT INTO tipo_proyecto_etapas (tipo_proyecto_id, nombre, orden, es_etapa_final) VALUES
    (v_concierto_id, 'Preproducción', 1, false),
    (v_concierto_id, 'Montaje', 2, false),
    (v_concierto_id, 'Show', 3, false),
    (v_concierto_id, 'Cierre', 4, true)
  ON CONFLICT (tipo_proyecto_id, nombre) DO NOTHING;

  -- Diseño de Show
  INSERT INTO tipos_proyecto (nombre) VALUES ('Diseño de Show')
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id INTO v_disenoshow_id;

  INSERT INTO tipo_proyecto_etapas (tipo_proyecto_id, nombre, orden, es_etapa_final) VALUES
    (v_disenoshow_id, 'Brief', 1, false),
    (v_disenoshow_id, 'Diseño', 2, false),
    (v_disenoshow_id, 'Revisión Cliente', 3, false),
    (v_disenoshow_id, 'Entrega', 4, true)
  ON CONFLICT (tipo_proyecto_id, nombre) DO NOTHING;

  -- Backfill de proyectos existentes: todos son Grabación hasta hoy.
  UPDATE proyectos p
  SET tipo_proyecto_id = v_grabacion_id,
      etapa_id = e.id
  FROM tipo_proyecto_etapas e
  WHERE e.tipo_proyecto_id = v_grabacion_id
    AND e.nombre = CASE p.estado
      WHEN 'PREPRODUCCION' THEN 'Preproducción'
      WHEN 'RODAJE' THEN 'Rodaje'
      WHEN 'POSTPRODUCCION' THEN 'Postproducción'
      WHEN 'FINALIZADO' THEN 'Finalizado'
    END
    AND p.tipo_proyecto_id IS NULL;
END $$;

-- ============================================================
-- 7. RLS (mismo patrón sin políticas propias que el resto del proyecto --
--    todo el acceso va por supabaseAdmin/service_role)
-- ============================================================

ALTER TABLE tipos_proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_proyecto_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_proyecto_tarea_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_tarea_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_documentos ENABLE ROW LEVEL SECURITY;

COMMIT;
