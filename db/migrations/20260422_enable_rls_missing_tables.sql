-- Migración: Habilitar RLS en tablas faltantes detectadas por Supabase Advisor
-- Ejecutar manualmente en Supabase SQL Editor
--
-- Tablas detectadas por Supabase con RLS deshabilitado:
--   - public.historial_responsable
--   - public.cotizacion_collaboration_events

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'historial_responsable',
    'cotizacion_collaboration_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS habilitado en: %', t;
    ELSE
      RAISE NOTICE 'Tabla no encontrada, omitida: %', t;
    END IF;
  END LOOP;
END $$;
