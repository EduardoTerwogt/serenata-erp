-- Migración: Habilitar Row Level Security en todas las tablas de datos
-- Ejecutar manualmente en Supabase SQL Editor
--
-- Contexto:
-- Todo el acceso a datos va por API routes server-side con supabaseAdmin (service_role).
-- El service_role bypasea RLS automáticamente, por lo que no se necesitan políticas permisivas.
-- El cliente browser (supabaseBrowser / anon key) SOLO se usa para presencia en realtime,
-- no para consultar datos. Habilitar RLS sin políticas bloquea todo acceso anon a datos.
--
-- Usa DO $$ ... $$ para aplicar solo en tablas que existen, sin fallar en las que no.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cotizaciones',
    'items_cotizacion',
    'clientes',
    'productos',
    'proyectos',
    'cuentas_cobrar',
    'cuentas_pagar',
    'responsables',
    'documentos_cuentas_cobrar',
    'documentos_cuentas_pagar',
    'ordenes_pago',
    'pagos_comprobantes',
    'service_templates',
    'planeacion_pendientes',
    'planeacion_event_notas',
    'extraction_logs',
    'cotizacion_folio_reservations'
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

-- NOTA: No se crean políticas adicionales porque:
-- 1. El rol service_role siempre bypasea RLS (acceso total para el servidor)
-- 2. El rol anon no debe acceder a ninguna tabla de datos directamente
-- 3. Las RPCs con SECURITY DEFINER siguen funcionando independientemente del RLS
