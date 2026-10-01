-- REINICIO DE DATOS DE PRODUCCIÓN (PLAN.md, B2 / D3). DESTRUCTIVO E IRREVERSIBLE.
--
-- Vacía todos los datos de negocio de PRODUCCIÓN (cotizaciones, proyectos,
-- Cuentas, clientes, proveedores, productos…) y reinicia los folios: SH001,
-- CC-AAAA-00001 y CP-AAAA-00001. Conserva SOLO `usuarios` y la configuración de
-- tipos de proyecto (`tipos_proyecto`, `tipo_proyecto_etapas`,
-- `tipo_proyecto_tarea_default`).
--
-- ANTES DE CORRERLO (todo obligatorio; sin esto no se ejecuta):
--   1. Respaldo de producción: `supabase db dump` (plan Free, sin respaldos).
--   2. Carpetas de prueba de Google Drive de producción en la papelera (H3).
--   3. Cambiar `c_confirmacion` abajo por el texto exacto que pide el error.
--
-- Cómo: pegar COMPLETO en el SQL Editor de producción (serenata-erp,
-- ref fwmyoqokcjtldiofuxdg). Es una sola transacción: la verificación final
-- (M2) hace RAISE EXCEPTION y revierte TODO si algo no quedó como debe.
--
-- Solo producción: se niega a correr si existe `loadtest_runs` (solo existe en
-- serenata-erp-test). Idempotente: correrlo dos veces deja lo mismo.
-- Este archivo se BORRA del repo el día de la salida a uso real.

DO $reset$
DECLARE
  c_confirmacion constant text := 'ESCRIBE-AQUI-LA-CONFIRMACION';
  c_esperada constant text := 'REINICIAR PRODUCCION fwmyoqokcjtldiofuxdg';
  v_tablas text[] := ARRAY[
    -- cotizaciones y proyectos
    'cotizacion_folio_reservations', 'items_cotizacion', 'cotizaciones',
    'proyecto_documentos', 'proyecto_tarea_checklist', 'proyecto_tareas', 'proyectos',
    -- Cuentas
    'cuentas_correcciones', 'cuentas_reaperturas', 'ordenes_pago_conceptos', 'pagos_cuentas_pagar',
    'pagos_comprobantes', 'documentos_cuentas_pagar', 'documentos_cuentas_cobrar',
    'cuentas_pagar', 'cuentas_pagar_grupos', 'cuentas_cobrar', 'ordenes_pago', 'pago_operations',
    -- historiales
    'historial_cambios_responsable_item',
    -- catálogos
    'clientes', 'proveedores', 'proveedor_documentos', 'productos', 'service_templates', 'gastos_fijos',
    -- operación e infraestructura de estado
    'idempotency_keys', 'rate_limits', 'bulk_import_operations',
    -- (Planeación y Sheets ya se retiraron en B1+B3: sus tablas no existen)
    -- migración de clientes (el CSV va a docs/archive/ antes de borrar la tabla)
    'cliente_id_backfill_clasificacion'
  ];
  v_t text;
  v_n bigint;
  v_siguiente text;
BEGIN
  IF c_confirmacion <> c_esperada THEN
    RAISE EXCEPTION 'Falta la confirmación. Cambia c_confirmacion por: %', c_esperada;
  END IF;
  IF to_regclass('public.loadtest_runs') IS NOT NULL THEN
    RAISE EXCEPTION 'Esto parece serenata-erp-test (existe loadtest_runs): el reinicio es solo de producción.';
  END IF;

  EXECUTE 'SET LOCAL lock_timeout = ''10s''';
  EXECUTE 'SET LOCAL statement_timeout = ''120s''';

  -- Vaciar. TRUNCATE no dispara triggers por fila (no se recalculan grupos ni se escribe historial).
  EXECUTE 'TRUNCATE TABLE ' || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(v_tablas) t)
    || ' RESTART IDENTITY';

  -- Folios CC/CP por año: sin filas, el siguiente es 00001.
  DELETE FROM public.folio_contadores;

  -- ── Verificación final (M2): cualquier falla revierte TODO ─────────────────
  IF (SELECT count(*) FROM public.usuarios) = 0 THEN
    RAISE EXCEPTION 'Verificación: usuarios quedó vacío';
  END IF;
  IF (SELECT count(*) FROM public.tipos_proyecto) = 0 THEN
    RAISE EXCEPTION 'Verificación: tipos_proyecto quedó vacío';
  END IF;
  FOREACH v_t IN ARRAY v_tablas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Verificación: % tiene % filas tras el reinicio', v_t, v_n;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.folio_contadores) <> 0 THEN
    RAISE EXCEPTION 'Verificación: folio_contadores no quedó en cero';
  END IF;
  v_siguiente := public.preview_next_cotizacion_folio_principal();
  IF v_siguiente <> 'SH001' THEN
    RAISE EXCEPTION 'Verificación: el siguiente folio de cotización es %, no SH001', v_siguiente;
  END IF;
  -- Folios CC/CP: con folio_contadores vacío, la siguiente reserva es 1 (siguiente_folio hace
  -- upsert del contador). Se prueba dentro de la transacción: este bloque se revierte si falla,
  -- y el contador de la prueba se vuelve a borrar.
  IF public.siguiente_folio('CC', now()) NOT LIKE '%-00001' OR public.siguiente_folio('CP', now()) NOT LIKE '%-00001' THEN
    RAISE EXCEPTION 'Verificación: los folios CC/CP no empiezan en 00001';
  END IF;
  DELETE FROM public.folio_contadores;

  RAISE NOTICE 'Reinicio completo. Siguiente folio: SH001, CC-AAAA-00001, CP-AAAA-00001.';
END
$reset$;
