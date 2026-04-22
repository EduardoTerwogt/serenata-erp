-- Migración: Habilitar Row Level Security en todas las tablas de datos
-- Ejecutar manualmente en Supabase SQL Editor
--
-- Contexto:
-- Todo el acceso a datos va por API routes server-side con supabaseAdmin (service_role).
-- El service_role bypasea RLS automáticamente, por lo que no se necesitan políticas permisivas.
-- El cliente browser (supabaseBrowser / anon key) SOLO se usa para presencia en realtime,
-- no para consultar datos. Habilitar RLS sin políticas bloquea todo acceso anon a datos.

-- Tablas principales del ERP
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_cotizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsables ENABLE ROW LEVEL SECURITY;

-- Tablas de documentos y pagos
ALTER TABLE public.documentos_cuentas_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_cuentas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_comprobantes ENABLE ROW LEVEL SECURITY;

-- Tablas de plantillas y servicios
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;

-- Tablas de planeación
ALTER TABLE public.planeacion_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planeacion_event_notas ENABLE ROW LEVEL SECURITY;

-- Tabla de logs (solo escritura server-side)
ALTER TABLE public.extraction_logs ENABLE ROW LEVEL SECURITY;

-- Reservas de folio (solo acceso server-side vía RPCs con SECURITY DEFINER)
ALTER TABLE public.cotizacion_folio_reservations ENABLE ROW LEVEL SECURITY;

-- NOTA: No se crean políticas adicionales porque:
-- 1. El rol service_role siempre bypasea RLS (acceso total para el servidor)
-- 2. El rol anon no debe acceder a ninguna tabla de datos directamente
-- 3. Las RPCs con SECURITY DEFINER siguen funcionando independientemente del RLS
