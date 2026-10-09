-- #110 B2: histórico de Cuentas (docs/PLAN.md, decisión 025). Un proyecto pasa a «histórico» de solo consulta 190 días después del
-- último cambio registrado en el sistema, cuando todo está resuelto: lo marca `archivar_cuentas_historicas` (cron diario) y desde entonces
-- cualquier escritura de Cuentas sobre él falla con `proyecto_historico` (P1420). Los históricos siguen sumando en totales y búsqueda;
-- `cuentas_resumen` y `cuentas_avisos_items` los ignoran (todas sus categorías exigen un concepto sin resolver).
-- Reversa: UPDATE proyectos SET cuentas_historico_at = NULL; retirar los triggers `trigger_00_cuentas_historico` y volver a las funciones de
-- 20261039 (cuentas_conceptos), 20261031 (cuentas_periodo, cuentas_resumen, cuentas_avisos_items) y 20261034 (auditar_consistencia).
-- Emergencia (solo SQL de admin): limpiar `cuentas_historico_at` del proyecto e insertar en `cuentas_reaperturas` con motivo y usuario.

-- ════════ 1. Columna e índice (solo la columna; ninguna guarda sobre `proyectos`) ════════
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS cuentas_historico_at timestamptz;
COMMENT ON COLUMN public.proyectos.cuentas_historico_at IS
  'Cuentas: cuándo pasó el proyecto a histórico (solo consulta). NULL = vivo. Lo marca archivar_cuentas_historicas.';
CREATE INDEX IF NOT EXISTS idx_proyectos_cuentas_vivos ON public.proyectos (fecha_entrega, id) WHERE cuentas_historico_at IS NULL;

-- ════════ 2. Último cambio registrado de un proyecto ════════
-- Máximo de las marcas de tiempo de todo lo que Cuentas escribe sobre el proyecto. Cubre los huecos de las tablas sin `updated_at`
-- (pagos_comprobantes, pagos_cuentas_pagar), los grupos (`updated_at` sin trigger) y `editar_pago`, que modifica `pagos` sin marca
-- pero deja `cuentas_correcciones.created_at`. Una sola implementación, por lote: una pasada por tabla para muchos proyectos (el
-- archivado diario y la auditoría) o por índice para uno (medido: ~1 s para 1,000 proyectos; por proyecto serían ~4 s).
CREATE OR REPLACE FUNCTION public.cuentas_ultimo_cambio_lote(p_proyectos text[])
 RETURNS TABLE(proyecto_id text, ultimo timestamptz)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  cc AS (SELECT c.proyecto_id, max(greatest(c.created_at, c.updated_at, c.fecha_pago)) AS m
           FROM cuentas_cobrar c WHERE c.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  cp AS (SELECT c.proyecto_id, max(greatest(c.created_at, c.updated_at, c.fecha_pago)) AS m
           FROM cuentas_pagar c WHERE c.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  gr AS (SELECT g.proyecto_id, max(greatest(g.created_at, g.updated_at)) AS m
           FROM cuentas_pagar_grupos g WHERE g.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  pc AS (SELECT c.proyecto_id, max(greatest(l.created_at, h.created_at, h.anulado_at)) AS m
           FROM cuentas_cobrar c JOIN pagos_comprobantes l ON l.cuentas_cobrar_id = c.id JOIN pagos h ON h.id = l.pago_id
          WHERE c.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  pp AS (SELECT g.proyecto_id, max(greatest(l.created_at, h.created_at, h.anulado_at)) AS m
           FROM cuentas_pagar_grupos g JOIN pagos_cuentas_pagar l ON l.grupo_id = g.id JOIN pagos h ON h.id = l.pago_id
          WHERE g.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  -- Documentos de cobro: anclados a la cuenta, la factura vigente de la cuenta y lo que cuelga de esa factura (una rama por llave:
  -- un OR entre ellas impediría los índices).
  dc AS (SELECT q.proyecto_id, max(q.m) AS m FROM (
           SELECT c.proyecto_id, greatest(d.created_at, d.fecha_carga, d.eliminado_at) AS m
             FROM cuentas_cobrar c JOIN documentos_cuentas_cobrar d ON d.cuentas_cobrar_id = c.id WHERE c.proyecto_id = ANY (p_proyectos)
           UNION ALL
           SELECT c.proyecto_id, greatest(d.created_at, d.fecha_carga, d.eliminado_at)
             FROM cuentas_cobrar c JOIN documentos_cuentas_cobrar d ON d.id = c.factura_documento_id WHERE c.proyecto_id = ANY (p_proyectos)
           UNION ALL
           SELECT c.proyecto_id, greatest(d.created_at, d.fecha_carga, d.eliminado_at)
             FROM cuentas_cobrar c JOIN documentos_cuentas_cobrar d ON d.factura_documento_id = c.factura_documento_id
            WHERE c.proyecto_id = ANY (p_proyectos) AND c.factura_documento_id IS NOT NULL) q GROUP BY 1),
  dp AS (SELECT q.proyecto_id, max(q.m) AS m FROM (
           SELECT g.proyecto_id, greatest(d.created_at, d.fecha_carga, d.eliminado_at) AS m
             FROM cuentas_pagar_grupos g JOIN documentos_cuentas_pagar d ON d.grupo_id = g.id WHERE g.proyecto_id = ANY (p_proyectos)
           UNION ALL
           SELECT c.proyecto_id, greatest(d.created_at, d.fecha_carga, d.eliminado_at)
             FROM cuentas_pagar c JOIN documentos_cuentas_pagar d ON d.cuentas_pagar_id = c.id WHERE c.proyecto_id = ANY (p_proyectos)) q GROUP BY 1),
  re AS (SELECT r.proyecto_id, max(greatest(r.abierta_at, r.cerrada_at)) AS m
           FROM cuentas_reaperturas r WHERE r.proyecto_id = ANY (p_proyectos) GROUP BY 1),
  co AS (SELECT k.proyecto_id, max(k.created_at) AS m
           FROM cuentas_correcciones k WHERE k.proyecto_id = ANY (p_proyectos) GROUP BY 1)
  SELECT i.id, greatest(cc.m, cp.m, gr.m, pc.m, pp.m, dc.m, dp.m, re.m, co.m)
  FROM unnest(p_proyectos) AS i(id)
  LEFT JOIN cc ON cc.proyecto_id = i.id LEFT JOIN cp ON cp.proyecto_id = i.id LEFT JOIN gr ON gr.proyecto_id = i.id
  LEFT JOIN pc ON pc.proyecto_id = i.id LEFT JOIN pp ON pp.proyecto_id = i.id LEFT JOIN dc ON dc.proyecto_id = i.id
  LEFT JOIN dp ON dp.proyecto_id = i.id LEFT JOIN re ON re.proyecto_id = i.id LEFT JOIN co ON co.proyecto_id = i.id;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_ultimo_cambio(p_proyecto text)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT l.ultimo FROM public.cuentas_ultimo_cambio_lote(ARRAY[p_proyecto]) l;
$function$;

-- Proyectos unidos a los dados por una factura de cobro o un pago compartidos (una cuenta sin proyecto aparece como 'sin-proyecto').
CREATE OR REPLACE FUNCTION public.cuentas_vecinos_proyecto(p_proyecto text)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT v FROM (
    SELECT COALESCE(c2.proyecto_id, 'sin-proyecto') AS v
      FROM cuentas_cobrar c1 JOIN cuentas_cobrar c2 ON c2.factura_documento_id = c1.factura_documento_id
     WHERE c1.proyecto_id = p_proyecto AND c1.factura_documento_id IS NOT NULL
    UNION ALL
    SELECT COALESCE(c2.proyecto_id, 'sin-proyecto')
      FROM cuentas_cobrar c1 JOIN pagos_comprobantes p1 ON p1.cuentas_cobrar_id = c1.id
           JOIN pagos_comprobantes p2 ON p2.pago_id = p1.pago_id JOIN cuentas_cobrar c2 ON c2.id = p2.cuentas_cobrar_id
     WHERE c1.proyecto_id = p_proyecto
    UNION ALL
    SELECT g2.proyecto_id
      FROM cuentas_pagar_grupos g1 JOIN pagos_cuentas_pagar q1 ON q1.grupo_id = g1.id
           JOIN pagos_cuentas_pagar q2 ON q2.pago_id = q1.pago_id JOIN cuentas_pagar_grupos g2 ON g2.id = q2.grupo_id
     WHERE g1.proyecto_id = p_proyecto
  ) x WHERE v <> p_proyecto;
$function$;

-- ════════ 3. Archivar ════════
-- Por año (para no pasar los 8 s de PostgREST). Un proyecto es elegible si tiene al menos un concepto, todos resueltos, sin reapertura
-- activa y sin cambios en los 190 días naturales (CDMX) anteriores a p_hoy. Los proyectos unidos por factura o pago compartido forman
-- un componente: se archivan juntos y solo si todos son elegibles de ESTE año; un componente que cruza años (o toca una cuenta sin
-- proyecto) no se archiva y se reporta. Con p_dry_run no escribe nada. Para marcar bloquea (FOR UPDATE, orden por id) los proyectos de
-- los componentes completos y RECOMPRUEBA el último cambio de todos en una pasada: cualquier escritura posterior lo mueve, no se re-deriva.
CREATE OR REPLACE FUNCTION public.archivar_cuentas_historicas(p_year integer, p_hoy date, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
DECLARE
  v_corte date := p_hoy - 190;
  v_resueltos text[];
  v_elegibles text[];
  v_comp text[];
  v_completos text[] := '{}';
  v_candidatos text[];
  v_firmes text[];
  v_archivados text[] := '{}';
  v_diferidos jsonb := '[]'::jsonb;
  v_n_comp integer := 0;
BEGIN
  IF p_year IS NULL OR p_hoy IS NULL THEN
    RAISE EXCEPTION 'parametros_invalidos: p_year y p_hoy son obligatorios' USING ERRCODE = 'P1415';
  END IF;

  -- Resueltos y sin reapertura; la marca de último cambio (lo caro) se calcula en lote solo para ellos.
  SELECT COALESCE(array_agg(c.proyecto_key ORDER BY c.proyecto_key), '{}') INTO v_resueltos
  FROM (
    SELECT c.proyecto_key
    FROM cuentas_conceptos(p_year, p_hoy, 'vivos', NULL) c
    WHERE NOT c.sin_proyecto AND NOT c.sin_fecha AND c.anio = p_year
    GROUP BY c.proyecto_key
    HAVING bool_and(c.resuelto) AND NOT bool_or(c.proyecto_reabierta)
  ) c;
  SELECT COALESCE(array_agg(l.proyecto_id ORDER BY l.proyecto_id), '{}') INTO v_elegibles
  FROM cuentas_ultimo_cambio_lote(v_resueltos) l
  WHERE (l.ultimo AT TIME ZONE 'America/Mexico_City')::date <= v_corte;

  -- Componentes: cada grupo de proyectos conectados por factura o pago compartido, a partir de los elegibles (uno por componente).
  FOR v_comp IN
    WITH RECURSIVE cl(raiz, proyecto) AS (
      SELECT e, e FROM unnest(v_elegibles) e
      UNION
      SELECT cl.raiz, v FROM cl, LATERAL cuentas_vecinos_proyecto(cl.proyecto) v
    )
    SELECT DISTINCT comp FROM (SELECT array_agg(proyecto ORDER BY proyecto) AS comp FROM cl GROUP BY raiz) q
  LOOP
    v_n_comp := v_n_comp + 1;
    IF NOT (v_comp <@ v_elegibles) THEN
      v_diferidos := v_diferidos || jsonb_build_object('proyectos', to_jsonb(v_comp),
        'motivo', 'el componente incluye proyectos no elegibles (otro año, con pendientes o con cambios recientes)');
    ELSE
      v_completos := v_completos || v_comp;
    END IF;
  END LOOP;

  IF p_dry_run THEN
    v_archivados := v_completos;
  ELSIF cardinality(v_completos) > 0 THEN
    -- Bloqueo en orden fijo de todos los proyectos a marcar y recomprobación en lote.
    PERFORM 1 FROM proyectos WHERE id = ANY (v_completos) ORDER BY id FOR UPDATE;
    SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}') INTO v_candidatos
    FROM proyectos p
    WHERE p.id = ANY (v_completos) AND p.cuentas_historico_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL);
    SELECT COALESCE(array_agg(l.proyecto_id ORDER BY l.proyecto_id), '{}') INTO v_firmes
    FROM cuentas_ultimo_cambio_lote(v_candidatos) l
    WHERE (l.ultimo AT TIME ZONE 'America/Mexico_City')::date <= v_corte;
    -- Un componente se marca completo o no se marca.
    FOR v_comp IN
      SELECT DISTINCT comp FROM (
        SELECT array_agg(proyecto ORDER BY proyecto) AS comp FROM (
          WITH RECURSIVE cl(raiz, proyecto) AS (
            SELECT e, e FROM unnest(v_completos) e
            UNION
            SELECT cl.raiz, v FROM cl, LATERAL cuentas_vecinos_proyecto(cl.proyecto) v)
          SELECT raiz, proyecto FROM cl) z GROUP BY raiz) q
    LOOP
      IF v_comp <@ v_firmes THEN
        v_archivados := v_archivados || v_comp;
      ELSE
        v_diferidos := v_diferidos || jsonb_build_object('proyectos', to_jsonb(v_comp), 'motivo', 'cambió mientras se archivaba');
      END IF;
    END LOOP;
    UPDATE proyectos SET cuentas_historico_at = now() WHERE id = ANY (v_archivados);
  END IF;

  RETURN jsonb_build_object(
    'anio', p_year, 'hoy', p_hoy, 'corte', v_corte, 'dry_run', p_dry_run,
    'elegibles', cardinality(v_elegibles), 'componentes', v_n_comp,
    'archivados', cardinality(v_archivados), 'proyectos', to_jsonb(v_archivados), 'diferidos', v_diferidos);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cuentas_ultimo_cambio_lote(text[]), public.cuentas_ultimo_cambio(text), public.cuentas_vecinos_proyecto(text),
  public.archivar_cuentas_historicas(integer, date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuentas_ultimo_cambio_lote(text[]), public.cuentas_ultimo_cambio(text), public.cuentas_vecinos_proyecto(text),
  public.archivar_cuentas_historicas(integer, date, boolean) TO service_role;

-- ════════ 4. Guardas de escritura ════════
-- Error explícito `proyecto_historico` (P1420) ante cualquier escritura de Cuentas sobre un proyecto histórico. Cubre las tablas donde
-- Cuentas escribe (toda alta, pago, anulación o corrección toca al menos una): cuentas por cobrar y por pagar, grupos de pago, documentos
-- de cobro y de pago, reaperturas (alta), la alta de una cotización complementaria y la MODIFICACIÓN de un pago (`adjuntar_comprobante_
-- pago_proveedor` escribe solo en `pagos`). El alta de un pago y de sus líneas no lleva guarda: viene siempre con una escritura a una
-- cuenta o a un grupo, que sí la tiene; editar un pago exige una reapertura y esa está bloqueada.
-- Toma `FOR KEY SHARE` sobre las filas de `proyectos` implicadas (vivas o no): no frena ediciones normales, pero el archivado (que usa
-- `FOR UPDATE`) espera a que terminen las escrituras en curso, y una escritura que llega durante el archivado espera y luego falla.
-- Se llama `trigger_00_…` para correr antes de `trigger_auto_folio_*`: un alta rechazada no consume folio.
CREATE OR REPLACE FUNCTION public.cuentas_bloquear_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_proys text[];
  v_historico text;
BEGIN
  v_proys := CASE TG_TABLE_NAME
    WHEN 'cotizaciones' THEN ARRAY[v_new->>'es_complementaria_de']
    WHEN 'documentos_cuentas_cobrar' THEN ARRAY(
      SELECT DISTINCT c.proyecto_id FROM cuentas_cobrar c
       WHERE c.proyecto_id IS NOT NULL
         AND (c.id = ANY (ARRAY[(v_new->>'cuentas_cobrar_id')::uuid, (v_old->>'cuentas_cobrar_id')::uuid])
              OR c.factura_documento_id = ANY (ARRAY[(COALESCE(v_new, v_old)->>'id')::uuid,
                                                     (v_new->>'factura_documento_id')::uuid, (v_old->>'factura_documento_id')::uuid])))
    WHEN 'documentos_cuentas_pagar' THEN ARRAY(
      SELECT DISTINCT x.p FROM (
        SELECT g.proyecto_id AS p FROM cuentas_pagar_grupos g
         WHERE g.id = ANY (ARRAY[(v_new->>'grupo_id')::uuid, (v_old->>'grupo_id')::uuid])
        UNION ALL
        SELECT c.proyecto_id FROM cuentas_pagar c
         WHERE c.id = ANY (ARRAY[(v_new->>'cuentas_pagar_id')::uuid, (v_old->>'cuentas_pagar_id')::uuid])) x
       WHERE x.p IS NOT NULL)
    WHEN 'pagos' THEN ARRAY(
      SELECT DISTINCT x.p FROM (
        SELECT c.proyecto_id AS p FROM pagos_comprobantes pc JOIN cuentas_cobrar c ON c.id = pc.cuentas_cobrar_id
         WHERE pc.pago_id = (v_new->>'id')::uuid
        UNION ALL
        SELECT g.proyecto_id FROM pagos_cuentas_pagar pp JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id
         WHERE pp.pago_id = (v_new->>'id')::uuid) x
       WHERE x.p IS NOT NULL)
    ELSE ARRAY[v_new->>'proyecto_id', v_old->>'proyecto_id']
  END;
  v_proys := array_remove(v_proys, NULL);
  IF cardinality(v_proys) = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT p.id INTO v_historico FROM proyectos p
   WHERE p.id = ANY (v_proys) AND p.cuentas_historico_at IS NOT NULL ORDER BY p.id LIMIT 1;
  -- El bloqueo se toma sobre todas las filas implicadas (también las vivas) para serializar con el archivado.
  PERFORM 1 FROM proyectos p WHERE p.id = ANY (v_proys) ORDER BY p.id FOR KEY SHARE;
  IF v_historico IS NULL THEN
    SELECT p.id INTO v_historico FROM proyectos p WHERE p.id = ANY (v_proys) AND p.cuentas_historico_at IS NOT NULL ORDER BY p.id LIMIT 1;
  END IF;
  IF v_historico IS NOT NULL THEN
    RAISE EXCEPTION 'proyecto_historico: el proyecto % ya es histórico y no admite cambios en Cuentas', v_historico USING ERRCODE = 'P1420';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT OR UPDATE OR DELETE ON public.cuentas_cobrar
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT OR UPDATE OR DELETE ON public.cuentas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT OR UPDATE OR DELETE ON public.cuentas_pagar_grupos
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_cobrar
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT OR UPDATE OR DELETE ON public.documentos_cuentas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT ON public.cuentas_reaperturas
  FOR EACH ROW EXECUTE FUNCTION public.cuentas_bloquear_historico();
CREATE OR REPLACE TRIGGER trigger_00_cuentas_historico BEFORE INSERT ON public.cotizaciones
  FOR EACH ROW WHEN (NEW.es_complementaria_de IS NOT NULL) EXECUTE FUNCTION public.cuentas_bloquear_historico();
REVOKE EXECUTE ON FUNCTION public.cuentas_bloquear_historico() FROM PUBLIC, anon, authenticated;

-- ════════ 5. cuentas_conceptos: modos 'vivos' e 'historicos' (mismo cuerpo que 20261039 más el filtro) ════════
CREATE OR REPLACE FUNCTION public.cuentas_conceptos(p_year integer, p_hoy date, p_objetivo text, p_id text)
 RETURNS TABLE(proyecto_key text, proyecto_orden bigint, proyecto_nombre text, proyecto_cliente text, fecha_entrega text, anio integer, mes integer, sin_fecha boolean, sin_proyecto boolean, margen numeric, fee numeric, iva_proyecto numeric, proyecto_reabierta boolean, concepto_creado timestamp with time zone, key text, tipo text, objetivo text, id text, proyecto_id text, cotizacion_id text, folio text, contraparte text, contraparte_id text, concepto text, items integer, total numeric, pagado numeric, total_estimado boolean, regimen_fiscal text, orden_pago_id text, fecha_vencimiento text, estado text, paso text, paso_urgente boolean, saldo numeric, venc_dias integer, resuelto boolean, fecha_resuelto date, metodo_desconocido boolean, complementos jsonb, cierre_iva numeric, cierre_iva_retenido numeric, cierre_isr_retenido numeric, utilidad_proyecto numeric, neto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
#variable_conflict use_column
DECLARE
  v_masivo boolean := false;
  v_nestloop text;
BEGIN
  -- Lectura masiva (sin objetivo) que abarca ≥ 30% de los proyectos: leer cada tabla UNA vez con hash join y barrido cuesta menos
  -- tiempo que una búsqueda por índice por fila (medido con 10 años × 1,000 proyectos: toda la historia 4.2 s con lazos anidados contra
  -- 3.1 s sin ellos; un año, 10% de los proyectos, 0.5 s contra 0.65 s: ahí los índices ganan). El planificador estima mal el tamaño
  -- de las CTE, así que aquí se le quitan los lazos anidados solo mientras dura esta función y solo en ese caso. Un proyecto, una
  -- contraparte, un año o un año vacío siguen con índices.
  IF p_objetivo IS NULL OR p_objetivo IN ('vivos', 'historicos') THEN
    SELECT count(*) * 10 >= 3 * GREATEST((SELECT reltuples FROM pg_class WHERE oid = 'public.proyectos'::regclass), 1)
      INTO v_masivo
      FROM proyectos p
     WHERE (p_year IS NULL
            OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1))
            OR p.fecha_entrega IS NULL)
       AND CASE p_objetivo WHEN 'vivos' THEN p.cuentas_historico_at IS NULL
                           WHEN 'historicos' THEN p.cuentas_historico_at IS NOT NULL ELSE true END;
    IF v_masivo THEN
      v_nestloop := current_setting('enable_nestloop');
      PERFORM set_config('enable_nestloop', 'off', true);
    END IF;
  END IF;
  -- plpgsql + force_custom_plan, no LANGUAGE sql: una función SQL se planea sin los valores de sus parámetros y, con
  -- los filtros `p_objetivo IS NULL OR …`, el plan genérico hace una sonda de índice por grupo (309,077 buffers contra
  -- 3,918 con plan por llamada, medido en test con el mismo SQL). Mismo patrón que cuentas_periodo (decisión 019).
  RETURN QUERY
  WITH
  -- p_objetivo ('cobro' | 'grupo' | 'cuenta') y p_id (uuid en texto): un solo concepto; NULL = todos (B6).
  -- #110 B2: 'vivos' = todos menos los proyectos históricos (cuentas_historico_at); 'historicos' = solo los históricos.
  -- #123 (T18): 'cliente' | 'proveedor' = todos los conceptos de esa contraparte (estado de cuenta, P15).
  alvo AS (
    SELECT CASE p_objetivo
             WHEN 'cobro' THEN (SELECT c.proyecto_id FROM cuentas_cobrar c WHERE c.id = p_id::uuid)
             WHEN 'grupo' THEN (SELECT gr.proyecto_id FROM cuentas_pagar_grupos gr WHERE gr.id = p_id::uuid)
             WHEN 'cuenta' THEN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.id = p_id::uuid)
           END AS proyecto_id
  ),
  py AS (
    -- El cliente se lee por llave (D12): cotización del proyecto → clientes.
    SELECT p.id, p.proyecto AS nombre, COALESCE(cl.nombre, pct.cliente) AS cliente, p.created_at,
           EXISTS (SELECT 1 FROM cuentas_reaperturas r WHERE r.proyecto_id = p.id AND r.cerrada_at IS NULL) AS reabierta,
           p.fecha_entrega::text AS fecha_entrega
    FROM proyectos p
    LEFT JOIN cotizaciones pct ON pct.id = p.id
    LEFT JOIN clientes cl ON cl.id = pct.cliente_id
    WHERE CASE
            -- Un solo concepto: solo el proyecto al que pertenece.
            WHEN p_objetivo IN ('cobro', 'grupo', 'cuenta') THEN p.id = (SELECT proyecto_id FROM alvo)
            -- Una contraparte: los proyectos donde tiene cuentas (todos los años con p_year NULL).
            WHEN p_objetivo = 'cliente' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_cobrar c JOIN cotizaciones ct ON ct.id = c.cotizacion_id WHERE ct.cliente_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            WHEN p_objetivo = 'proveedor' THEN
              p.id IN (SELECT c.proyecto_id FROM cuentas_pagar c WHERE c.responsable_id = p_id::uuid)
              AND (p_year IS NULL OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1)) OR p.fecha_entrega IS NULL)
            ELSE (p_year IS NULL
                  OR (p.fecha_entrega >= make_date(p_year, 1, 1) AND p.fecha_entrega < make_date(p_year + 1, 1, 1))
                  OR p.fecha_entrega IS NULL)
                 AND CASE p_objetivo WHEN 'vivos' THEN p.cuentas_historico_at IS NULL
                                     WHEN 'historicos' THEN p.cuentas_historico_at IS NOT NULL ELSE true END
          END
  ),
  cc AS (
    SELECT c.id, c.proyecto_id, c.cotizacion_id, c.folio, COALESCE(cl.nombre, cct.cliente) AS cliente, cct.cliente_id,
           c.monto_total, c.monto_pagado, c.fecha_vencimiento, c.fecha_factura, c.created_at, c.factura_documento_id
    FROM (SELECT * FROM cuentas_cobrar WHERE proyecto_id IN (SELECT id FROM py)
          UNION ALL
          SELECT * FROM cuentas_cobrar WHERE proyecto_id IS NULL) c
    LEFT JOIN cotizaciones cct ON cct.id = c.cotizacion_id
    LEFT JOIN clientes cl ON cl.id = cct.cliente_id
    WHERE (p_objetivo IS NULL OR p_objetivo IN ('vivos', 'historicos')
           OR (p_objetivo = 'cobro' AND c.id = p_id::uuid) OR (p_objetivo = 'cliente' AND cct.cliente_id = p_id::uuid))
      AND (p_objetivo IS DISTINCT FROM 'historicos' OR c.proyecto_id IS NOT NULL)
  ),
  cp AS (
    SELECT c.id, c.proyecto_id, c.grupo_id, c.cotizacion_id, c.responsable_id, c.item_id, c.costo_total, c.created_at, c.concepto
    FROM (SELECT * FROM cuentas_pagar WHERE proyecto_id IN (SELECT id FROM py)
          UNION ALL
          SELECT * FROM cuentas_pagar WHERE proyecto_id IS NULL) c
    WHERE (p_objetivo IS NULL OR p_objetivo IN ('vivos', 'historicos')
           OR (p_objetivo = 'cuenta' AND c.id = p_id::uuid)
           OR (p_objetivo = 'grupo' AND c.grupo_id = p_id::uuid)
           OR (p_objetivo = 'proveedor' AND c.responsable_id = p_id::uuid))
      AND (p_objetivo IS DISTINCT FROM 'historicos' OR c.proyecto_id IS NOT NULL)
  ),
  g AS (
    SELECT gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total, gr.total_a_transferir, gr.monto_transferido,
           gr.orden_pago_id, gr.created_at
    FROM cuentas_pagar_grupos gr WHERE gr.id IN (SELECT grupo_id FROM cp WHERE grupo_id IS NOT NULL)
  ),
  cot AS (
    SELECT c.pid,
           ROUND(SUM(c.margen_total), 2) AS margen, ROUND(SUM(c.fee_agencia), 2) AS fee, ROUND(SUM(c.iva), 2) AS iva,
           -- #99: utilidad_total = margen + fee − descuento (calculations.ts).
           ROUND(SUM(c.utilidad_total), 2) AS utilidad
    FROM (SELECT x.id AS pid, x.margen_total, x.fee_agencia, x.iva, x.utilidad_total
          FROM cotizaciones x WHERE x.estado = 'APROBADA' AND x.es_complementaria_de IS NULL AND x.id IN (SELECT id FROM py)
          UNION ALL
          SELECT x.es_complementaria_de, x.margen_total, x.fee_agencia, x.iva, x.utilidad_total
          FROM cotizaciones x WHERE x.estado = 'APROBADA' AND x.es_complementaria_de IN (SELECT id FROM py)) c
    GROUP BY 1
  ),
  -- #130 (Q10): los gastos extra (cuentas sin renglón) restan de la utilidad real del proyecto; la cotización aprobada no cambia.
  ex AS (
    SELECT x.proyecto_id AS pid, ROUND(SUM(x.costo_total), 2) AS extra
    FROM cuentas_pagar x
    WHERE x.item_id IS NULL AND x.proyecto_id IN (SELECT id FROM py)
    GROUP BY 1
  ),
  -- Proyectos con cuentas, en el orden de la lectura cruda (created_at desc, id desc).
  proy AS (
    SELECT py.id AS key, py.nombre, py.cliente, py.fecha_entrega, false AS sin_proyecto, py.reabierta,
           COALESCE(cot.margen, 0) AS margen, COALESCE(cot.fee, 0) AS fee, COALESCE(cot.iva, 0) AS iva,
           row_number() OVER (ORDER BY py.created_at DESC, py.id DESC) AS orden,
           COALESCE(cot.utilidad, 0) - COALESCE(ex.extra, 0) AS utilidad
    FROM py
    LEFT JOIN cot ON cot.pid = py.id
    LEFT JOIN ex ON ex.pid = py.id
    WHERE CASE WHEN p_objetivo IS NULL OR p_objetivo IN ('vivos', 'historicos')
               THEN EXISTS (SELECT 1 FROM cc WHERE cc.proyecto_id = py.id) OR EXISTS (SELECT 1 FROM cp WHERE cp.proyecto_id = py.id)
               ELSE EXISTS (SELECT 1 FROM cuentas_cobrar c WHERE c.proyecto_id = py.id)
                 OR EXISTS (SELECT 1 FROM cuentas_pagar c WHERE c.proyecto_id = py.id) END
    UNION ALL
    -- Supuesto 11: las cuentas sin proyecto van a "Sin proyecto", al final.
    SELECT 'sin-proyecto', 'Sin proyecto', NULL, NULL, true, false, 0, 0, 0, 9223372036854775807, 0
    WHERE EXISTS (SELECT 1 FROM cc WHERE proyecto_id IS NULL) OR EXISTS (SELECT 1 FROM cp WHERE proyecto_id IS NULL)
  ),

  -- Cobros ------------------------------------------------------------------
  cc_factura AS (
    -- P27: cada cuenta apunta a su factura vigente (columna); una factura puede cubrir varias cuentas.
    SELECT c.id AS cc_id, d.estado_validacion, d.metodo_pago_cfdi, d.fecha_carga
    FROM cc c
    JOIN documentos_cuentas_cobrar d ON d.id = c.factura_documento_id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  ),
  -- Un complemento por factura y por pago (P9). Los legados siguen anclados a su cuenta.
  cc_comp AS (
    SELECT DISTINCT ON (d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo)
           d.factura_documento_id, d.cuentas_cobrar_id AS cuenta_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_cobrar d
    WHERE d.pago_id IS NOT NULL AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
      AND (d.factura_documento_id IN (SELECT factura_documento_id FROM cc WHERE factura_documento_id IS NOT NULL)
           OR d.cuentas_cobrar_id IN (SELECT id FROM cc))
    ORDER BY d.factura_documento_id, d.cuentas_cobrar_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  cc_pago AS (
    SELECT pc.cuentas_cobrar_id AS cc_id, pc.pago_id AS pago_id, h.fecha_pago, h.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           -- V4: un pago anterior a la factura (o sin fecha de factura: se pide) es anticipo.
           (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) AS requiere,
           CASE
             WHEN NOT (c.fecha_factura IS NULL OR h.fecha_pago > c.fecha_factura) THEN 'anticipo'
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pagos_comprobantes pc
    JOIN pagos h ON h.id = pc.pago_id
    JOIN cc c ON c.id = pc.cuentas_cobrar_id
    LEFT JOIN cc_comp x ON x.pago_id = pc.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
                       AND (x.factura_documento_id = c.factura_documento_id OR x.cuenta_id = c.id)
    LEFT JOIN cc_comp f ON f.pago_id = pc.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
                       AND (f.factura_documento_id = c.factura_documento_id OR f.cuenta_id = c.id)
    WHERE h.anulado_at IS NULL
  ),
  cc_pagos AS (
    SELECT cc_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', requiere, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(requiere AND estado <> 'completo') AS pendiente,
           bool_or(requiere AND estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM cc_pago
    GROUP BY cc_id
  ),
  cobro AS (
    SELECT c.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           round(c.monto_total, 2) AS v_total, round(COALESCE(c.monto_pagado, 0), 2) AS v_pagado,
           -- #99: parte sin IVA del cobro (netoCobro en periodo.ts).
           CASE WHEN ct.id IS NULL THEN round(c.monto_total * 100 / 116, 2)
                WHEN COALESCE(ct.total, 0) <= 0 THEN round(c.monto_total, 2)
                ELSE round(c.monto_total * (ct.total - COALESCE(ct.iva, 0)) / ct.total, 2) END AS v_neto,
           greatest(0, round(c.monto_total - COALESCE(c.monto_pagado, 0), 2)) AS v_saldo,
           f.estado_validacion AS f_estado, f.metodo_pago_cfdi AS metodo, f.fecha_carga AS f_fecha,
           (f.cc_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.cc_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pg.complementos, COALESCE(pg.pendiente, false) AS comp_pendiente, COALESCE(pg.en_revision, false) AS comp_revision,
           pg.fecha_max AS pagos_fecha_max
    FROM cc c
    JOIN proy pr ON pr.key = COALESCE(c.proyecto_id, 'sin-proyecto')
    LEFT JOIN cc_factura f ON f.cc_id = c.id
    LEFT JOIN cc_pagos pg ON pg.cc_id = c.id
    LEFT JOIN cotizaciones ct ON ct.id = c.cotizacion_id
  ),
  cobro_d AS (
    SELECT b.*,
           CASE WHEN b.fecha_vencimiento IS NOT NULL AND b.v_saldo > 0.005 THEN b.fecha_vencimiento - p_hoy END AS dias
    FROM cobro b
  ),
  cobro_e AS (
    SELECT b.*,
           (b.dias IS NOT NULL AND b.dias < 0) AS vencido,
           CASE
             WHEN NOT b.tiene_factura THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN b.fact_revision THEN 'en_revision' ELSE 'sin_factura' END
             WHEN b.v_saldo > 0.005 THEN
               CASE WHEN b.dias < 0 THEN 'vencido' WHEN COALESCE(b.monto_pagado, 0) > 0.005 THEN 'parcial' ELSE 'facturado' END
             WHEN b.metodo IS NULL THEN 'sin_complemento'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN 'sin_complemento'
             ELSE 'cobrado'
           END AS d_estado,
           CASE
             WHEN NOT b.tiene_factura THEN CASE WHEN b.fact_revision THEN 'revisar_factura' ELSE 'emitir_factura' END
             WHEN b.v_saldo > 0.005 THEN 'cobrar'
             WHEN b.metodo IS NULL THEN 'indicar_metodo'
             WHEN b.metodo = 'PPD' AND b.comp_pendiente THEN CASE WHEN b.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM cobro_d b
  ),

  -- Pagos a proveedor (grupos y sueltas) -------------------------------------
  obj AS (
    SELECT 'grupo'::text AS objetivo, gr.id, gr.proyecto_id, gr.responsable_id, gr.monto_total AS neto,
           gr.total_a_transferir, COALESCE(gr.monto_transferido, 0) AS transferido, gr.orden_pago_id, gr.created_at
    FROM g gr
    UNION ALL
    -- Sueltas: sin factura, pago ni orden propios (B5a: todo va por grupo).
    SELECT 'cuenta', c.id, c.proyecto_id, c.responsable_id, c.costo_total,
           NULL::numeric, 0::numeric, NULL::uuid, c.created_at
    FROM cp c WHERE c.grupo_id IS NULL
  ),
  p_factura AS (
    SELECT DISTINCT ON (d.obj_id) d.obj_id, d.estado_validacion, d.fecha_carga, d.metodo_pago_cfdi
    FROM (SELECT x.grupo_id AS obj_id, x.estado_validacion, x.fecha_carga, x.metodo_pago_cfdi
          FROM documentos_cuentas_pagar x
          WHERE x.tipo = 'FACTURA_PROVEEDOR_XML' AND x.eliminado_at IS NULL AND x.grupo_id IN (SELECT id FROM g)
          UNION ALL
          SELECT x.cuentas_pagar_id, x.estado_validacion, x.fecha_carga, x.metodo_pago_cfdi
          FROM documentos_cuentas_pagar x
          WHERE x.tipo = 'FACTURA_PROVEEDOR_XML' AND x.eliminado_at IS NULL AND x.cuentas_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL)) d
    ORDER BY d.obj_id, d.fecha_carga DESC
  ),
  -- Comprobantes (D11): documentos COMPROBANTE_PAGO y pagos con comprobante.
  -- Pagos vigentes de los grupos, leídos UNA vez (antes tres búsquedas por grupo: 60,000 buffers con 5,000 grupos).
  pcp AS MATERIALIZED (
    SELECT pp.grupo_id, pp.pago_id, h.fecha_pago, h.created_at, (h.comprobante_url IS NOT NULL) AS con_comprobante
    FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
    WHERE h.anulado_at IS NULL AND pp.grupo_id IN (SELECT id FROM g)
  ),
  p_comp AS (
    SELECT obj_id, max(ts) AS ts
    FROM (
      SELECT d.grupo_id AS obj_id, d.fecha_carga AS ts
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND d.eliminado_at IS NULL AND d.grupo_id IN (SELECT id FROM g)
      UNION ALL
      SELECT d.cuentas_pagar_id, d.fecha_carga
      FROM documentos_cuentas_pagar d
      WHERE d.tipo = 'COMPROBANTE_PAGO' AND d.eliminado_at IS NULL AND d.cuentas_pagar_id IN (SELECT id FROM cp WHERE grupo_id IS NULL)
      UNION ALL
      SELECT grupo_id, created_at FROM pcp WHERE con_comprobante
    ) t
    GROUP BY obj_id
  ),
  p_fechas AS (
    SELECT grupo_id AS obj_id, max(fecha_pago) AS fecha_max FROM pcp GROUP BY 1
  ),
  -- Complementos de proveedor (P9, P11): uno por (grupo, pago); un proveedor PPD los exige.
  p_comp_doc AS (
    SELECT DISTINCT ON (d.grupo_id, d.pago_id, d.tipo) d.grupo_id, d.pago_id, d.tipo, d.estado_validacion, d.fecha_carga
    FROM documentos_cuentas_pagar d
    WHERE d.grupo_id IN (SELECT id FROM g) AND d.pago_id IS NOT NULL
      AND d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    ORDER BY d.grupo_id, d.pago_id, d.tipo, d.fecha_carga DESC
  ),
  p_comp_pago AS (
    SELECT pp.grupo_id AS obj_id, pp.pago_id, pp.fecha_pago, pp.created_at,
           x.fecha_carga AS xml_fecha, f.fecha_carga AS pdf_fecha,
           CASE
             WHEN x.pago_id IS NULL AND f.pago_id IS NULL THEN 'falta'
             WHEN x.pago_id IS NULL THEN 'falta_xml'
             WHEN x.estado_validacion IS DISTINCT FROM 'validado' THEN 'revision'
             WHEN f.pago_id IS NULL THEN 'falta_pdf'
             ELSE 'completo'
           END AS estado
    FROM pcp pp
    LEFT JOIN p_comp_doc x ON x.grupo_id = pp.grupo_id AND x.pago_id = pp.pago_id AND x.tipo = 'COMPLEMENTO_PAGO'
    LEFT JOIN p_comp_doc f ON f.grupo_id = pp.grupo_id AND f.pago_id = pp.pago_id AND f.tipo = 'COMPLEMENTO_PAGO_PDF'
  ),
  p_comps AS (
    SELECT obj_id,
           jsonb_agg(jsonb_build_object('pago_id', pago_id, 'requiere', true, 'estado', estado) ORDER BY fecha_pago, created_at) AS complementos,
           bool_or(estado <> 'completo') AS pendiente,
           bool_or(estado = 'revision') AS en_revision,
           max(greatest(fecha_pago, (xml_fecha AT TIME ZONE 'America/Mexico_City')::date, (pdf_fecha AT TIME ZONE 'America/Mexico_City')::date)) AS fecha_max
    FROM p_comp_pago
    GROUP BY obj_id
  ),
  it AS MATERIALIZED (SELECT id, descripcion FROM items_cotizacion WHERE id IN (SELECT item_id FROM cp WHERE item_id IS NOT NULL)),
  g_items AS (
    SELECT c.grupo_id, count(*)::int AS n,
           (array_agg(COALESCE(i.descripcion, c.concepto) ORDER BY c.created_at, c.id))[1] AS descripcion
    FROM cp c
    LEFT JOIN it i ON i.id = c.item_id
    WHERE c.grupo_id IS NOT NULL
    GROUP BY c.grupo_id
  ),
  pago AS (
    SELECT o.*, pr.key AS pkey, pr.orden AS p_orden, pr.nombre AS p_nombre, pr.cliente AS p_cliente,
           pr.fecha_entrega AS p_fecha, pr.sin_proyecto AS p_sin, pr.margen AS p_margen, pr.fee AS p_fee, pr.iva AS p_iva,
           pr.reabierta AS p_reabierta, pr.utilidad AS p_utilidad,
           prov.nombre AS prov_nombre, prov.regimen_fiscal AS regimen,
           s.cotizacion_id AS s_cotizacion, si.descripcion AS s_descripcion,
           gi.n AS g_n, gi.descripcion AS g_descripcion,
           f.estado_validacion AS f_estado, f.fecha_carga AS f_fecha, f.metodo_pago_cfdi AS metodo,
           (f.obj_id IS NOT NULL AND f.estado_validacion = 'validado') AS tiene_factura,
           (f.obj_id IS NOT NULL AND f.estado_validacion IS DISTINCT FROM 'validado') AS fact_revision,
           pc.ts AS comp_ts, pf.fecha_max AS pagos_fecha_max,
           pcm.complementos AS comps, COALESCE(pcm.pendiente, false) AS comp_pendiente,
           COALESCE(pcm.en_revision, false) AS comp_revision, pcm.fecha_max AS comps_fecha_max
    FROM obj o
    JOIN proy pr ON pr.key = COALESCE(o.proyecto_id, 'sin-proyecto')
    LEFT JOIN proveedores prov ON prov.id = o.responsable_id
    LEFT JOIN cp s ON o.objetivo = 'cuenta' AND s.id = o.id
    LEFT JOIN it si ON si.id = s.item_id::uuid
    LEFT JOIN g_items gi ON o.objetivo = 'grupo' AND gi.grupo_id = o.id
    LEFT JOIN p_factura f ON f.obj_id = o.id
    LEFT JOIN p_comp pc ON pc.obj_id = o.id
    LEFT JOIN p_fechas pf ON pf.obj_id = o.id
    LEFT JOIN p_comps pcm ON pcm.obj_id = o.id
  ),
  -- Cruce por régimen del neto (espejo de calcularEjemploFactura): IVA 16%,
  -- retención de IVA 2/3 e ISR 10% (física) o 1.25% (RESICO); moral no retiene.
  pago_f AS (
    SELECT p.*, round(p.neto, 2) AS c_subtotal, round(round(p.neto, 2) * 0.16, 2) AS c_iva,
           CASE WHEN p.regimen IN ('fisica', 'resico') THEN round(round(p.neto, 2) * (2.0 / 3.0 * 0.16), 2) ELSE 0 END AS c_iva_ret,
           CASE p.regimen WHEN 'fisica' THEN round(round(p.neto, 2) * 0.10, 2)
                          WHEN 'resico' THEN round(round(p.neto, 2) * 0.0125, 2)
                          ELSE 0 END AS c_isr_ret
    FROM pago p
  ),
  pago_m AS (
    SELECT p.*,
           CASE WHEN p.total_a_transferir IS NULL THEN round(p.c_subtotal + p.c_iva - p.c_iva_ret - p.c_isr_ret, 2)
                ELSE round(p.total_a_transferir, 2) END AS v_total,
           round(p.transferido, 2) AS v_pagado,
           (p.objetivo = 'grupo' OR p.responsable_id IS NOT NULL) AS tiene_proveedor
    FROM pago_f p
  ),
  pago_e AS (
    SELECT p.*,
           greatest(0, round(p.v_total - p.v_pagado, 2)) AS v_saldo
    FROM pago_m p
  ),
  pago_d AS (
    SELECT p.*,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'sin_proveedor'
             WHEN p.fact_revision THEN 'en_revision'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'sin_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    WHEN p.v_pagado > 0.005 THEN 'parcial'
                    ELSE 'facturado' END
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN 'sin_complemento'
             ELSE 'pagado'
           END AS d_estado,
           CASE
             WHEN NOT p.tiene_proveedor AND p.v_saldo > 0.005 THEN 'asignar_proveedor'
             WHEN p.fact_revision THEN 'revisar_factura'
             WHEN p.v_saldo > 0.005 THEN
               CASE WHEN NOT p.tiene_factura THEN 'subir_factura'
                    WHEN p.orden_pago_id IS NOT NULL THEN 'en_orden'
                    ELSE 'pagar' END
             WHEN NOT p.tiene_factura THEN 'subir_factura'
             WHEN p.comp_ts IS NULL THEN 'subir_comprobante'
             WHEN p.metodo = 'PPD' AND p.comp_pendiente THEN CASE WHEN p.comp_revision THEN 'revisar_complemento' ELSE 'subir_complemento' END
           END AS d_paso
    FROM pago_e p
  )

  SELECT c.pkey, c.p_orden, c.p_nombre, c.p_cliente, c.p_fecha,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 1, 4)::int END,
         CASE WHEN c.p_fecha IS NOT NULL THEN substr(c.p_fecha, 6, 2)::int END,
         c.p_fecha IS NULL, c.p_sin, c.p_margen, c.p_fee, c.p_iva, c.p_reabierta,
         c.created_at,
         'c:' || c.id, 'cobro', 'cobro', c.id::text, c.proyecto_id, c.cotizacion_id, c.folio::text,
         COALESCE(c.cliente, c.p_cliente, 'Cliente'), c.cliente_id::text,
         -- nombreCobro (concepto.ts).
         CASE WHEN c.cotizacion_id IS NULL THEN 'Sin cotización'
              WHEN c.proyecto_id IS NULL OR c.cotizacion_id = c.proyecto_id THEN 'Cotización ' || c.cotizacion_id
              ELSE 'Complementaria ' || c.cotizacion_id END,
         1, c.v_total, c.v_pagado, false, NULL, NULL, c.fecha_vencimiento::text,
         c.d_estado, c.d_paso, (c.dias IS NOT NULL AND c.dias < 0) AND c.d_paso IN ('emitir_factura', 'revisar_factura', 'cobrar'),
         c.v_saldo, c.dias, c.d_paso IS NULL,
         CASE WHEN c.d_paso IS NULL THEN greatest((c.f_fecha AT TIME ZONE 'America/Mexico_City')::date, c.pagos_fecha_max) END,
         c.tiene_factura AND c.metodo IS NULL AND c.d_estado <> 'cobrado',
         CASE WHEN c.tiene_factura AND c.metodo = 'PPD' THEN COALESCE(c.complementos, '[]'::jsonb) ELSE '[]'::jsonb END,
         NULL::numeric, NULL::numeric, NULL::numeric,
         c.p_utilidad, c.v_neto
  FROM cobro_e c
  UNION ALL
  SELECT p.pkey, p.p_orden, p.p_nombre, p.p_cliente, p.p_fecha,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 1, 4)::int END,
         CASE WHEN p.p_fecha IS NOT NULL THEN substr(p.p_fecha, 6, 2)::int END,
         p.p_fecha IS NULL, p.p_sin, p.p_margen, p.p_fee, p.p_iva, p.p_reabierta,
         p.created_at,
         CASE WHEN p.objetivo = 'grupo' THEN 'g:' ELSE 's:' END || p.id, 'pago', p.objetivo, p.id::text, p.proyecto_id,
         CASE WHEN p.objetivo = 'cuenta' THEN p.s_cotizacion END, NULL,
         CASE WHEN p.responsable_id IS NOT NULL THEN COALESCE(p.prov_nombre, 'Proveedor')
              ELSE 'Sin asignar' END,
         p.responsable_id::text,
         CASE WHEN p.objetivo = 'cuenta' THEN COALESCE(p.s_descripcion, 'Concepto')
              WHEN p.g_n = 1 THEN COALESCE(p.g_descripcion, 'Concepto')
              ELSE COALESCE(p.g_n, 0) || ' conceptos' END,
         CASE WHEN p.objetivo = 'grupo' THEN COALESCE(p.g_n, 0) ELSE 1 END,
         p.v_total, p.v_pagado, p.total_a_transferir IS NULL, p.regimen, p.orden_pago_id::text, NULL,
         p.d_estado, p.d_paso, false, p.v_saldo, NULL, p.d_paso IS NULL,
         CASE WHEN p.d_paso IS NULL THEN greatest((p.f_fecha AT TIME ZONE 'America/Mexico_City')::date, (p.comp_ts AT TIME ZONE 'America/Mexico_City')::date, p.pagos_fecha_max, p.comps_fecha_max) END,
         false, CASE WHEN p.tiene_factura AND p.metodo = 'PPD' THEN COALESCE(p.comps, '[]'::jsonb) ELSE '[]'::jsonb END,
         p.c_iva, p.c_iva_ret, p.c_isr_ret,
         p.p_utilidad, p.c_subtotal
  FROM pago_d p;
  IF v_masivo THEN PERFORM set_config('enable_nestloop', v_nestloop, true); END IF;
END;
$function$;

-- ════════ 6. resumen y avisos ignoran los históricos (todas sus categorías exigen un concepto sin resolver) ════════
CREATE OR REPLACE FUNCTION public.cuentas_resumen(p_hoy date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH con AS MATERIALIZED (SELECT * FROM cuentas_conceptos(NULL, p_hoy, 'vivos', NULL)),
  proj AS (
    SELECT proyecto_key, min(anio) AS anio, bool_and(sin_fecha) AS sin_fecha, count(*) FILTER (WHERE NOT resuelto) AS pendientes
    FROM con GROUP BY proyecto_key
  ),
  -- Mismo criterio de avisos que cuentas_avisos_items: aquí solo se cuentan.
  avisos AS (
    SELECT (SELECT count(*) FROM con c WHERE c.tipo = 'cobro' AND c.venc_dias IS NOT NULL AND c.venc_dias <= 10)
         -- #123 (P11): también los complementos de proveedor PPD que faltan.
         + (SELECT count(*) FROM con c
            WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.complementos) e WHERE (e->>'requiere')::boolean AND e->>'estado' <> 'completo'))
         + (SELECT count(*) FROM con c WHERE c.tipo = 'cobro' AND c.paso = 'emitir_factura' AND c.fecha_entrega IS NOT NULL
              AND c.fecha_entrega <= to_char(p_hoy + 30, 'YYYY-MM-DD'))
         + (SELECT count(*) FROM con c WHERE c.tipo = 'pago' AND c.paso = 'subir_factura') AS total
  )
  SELECT jsonb_build_object(
    'hoy', to_char(p_hoy, 'YYYY-MM-DD'),
    'anios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'anio', a,
               'pendientes', (SELECT count(*) FROM proj WHERE NOT sin_fecha AND anio = a AND pendientes > 0)
             ) ORDER BY a DESC), '[]'::jsonb)
      FROM unnest(cuentas_anios()) AS a
    ),
    'avisos', (SELECT total FROM avisos)
  );
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_avisos_items(p_hoy date, p_limite integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  -- Espejo de derivarAvisos (lib/server/cuentas/avisos.ts): qué concepto
  -- entra a cada categoría; los textos los pone TS.
  WITH con AS MATERIALIZED (SELECT * FROM cuentas_conceptos(NULL, p_hoy, 'vivos', NULL)),
  items AS (
    SELECT CASE WHEN c.venc_dias < 0 THEN 'vencidos' ELSE 'por_vencer' END AS categoria, c.*, c.saldo AS monto,
           c.fecha_vencimiento AS fecha_orden
    FROM con c WHERE c.tipo = 'cobro' AND c.venc_dias IS NOT NULL AND c.venc_dias <= 10
    UNION ALL
    -- #123 (P11): cobros PPD y también pagos a proveedor PPD sin complemento.
    SELECT 'complementos', c.*, c.total, c.fecha_entrega
    FROM con c
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.complementos) e WHERE (e->>'requiere')::boolean AND e->>'estado' <> 'completo')
    UNION ALL
    SELECT 'por_emitir', c.*, c.total, c.fecha_entrega
    FROM con c
    WHERE c.tipo = 'cobro' AND c.paso = 'emitir_factura' AND c.fecha_entrega IS NOT NULL
      AND c.fecha_entrega <= to_char(p_hoy + 30, 'YYYY-MM-DD')
    UNION ALL
    SELECT 'facturas_proveedor', c.*, CASE WHEN c.saldo > 0 THEN c.saldo ELSE c.total END, c.fecha_entrega
    FROM con c WHERE c.tipo = 'pago' AND c.paso = 'subir_factura'
  ),
  ordenados AS (
    SELECT i.*,
           row_number() OVER (PARTITION BY i.categoria
                              ORDER BY COALESCE(i.fecha_orden, '9999') COLLATE "C", i.key COLLATE "C") AS n
    FROM items i
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'categoria', o.categoria, 'key', o.key, 'proyecto_id', o.proyecto_key, 'proyecto_nombre', o.proyecto_nombre,
               'anio', o.anio, 'mes', o.mes, 'fecha_entrega', o.fecha_entrega, 'contraparte', o.contraparte,
               'concepto', o.concepto, 'monto', o.monto, 'venc_dias', o.venc_dias, 'fecha_vencimiento', o.fecha_vencimiento
             ) ORDER BY o.categoria, o.n)
      FROM ordenados o WHERE o.n <= p_limite), '[]'::jsonb),
    'totales', COALESCE((SELECT jsonb_object_agg(categoria, n) FROM (SELECT categoria, count(*) AS n FROM items GROUP BY categoria) t), '{}'::jsonb)
  );
$function$;

-- ════════ 7. cuentas_periodo: cada proyecto trae `historico` (la UI muestra la insignia y deshabilita acciones) ════════
CREATE OR REPLACE FUNCTION public.cuentas_periodo(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_hoy       date := COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx());
  v_anio      int := COALESCE(NULLIF(p->>'anio', '')::int, extract(year FROM COALESCE(NULLIF(p->>'hoy', '')::date, hoy_cdmx()))::int);
  v_mes_txt   text := NULLIF(p->>'mes', '');
  v_estado    text := COALESCE(NULLIF(p->>'estado', ''), 'todas');
  v_tipo      text := COALESCE(NULLIF(p->>'tipo', ''), 'todo');
  v_cliente   text := NULLIF(p->>'cliente', '');
  v_proveedor text := NULLIF(p->>'proveedor', '');
  -- normalizarBusqueda: sin acentos, minúsculas y sin espacios en los extremos.
  v_q         text := regexp_replace(lower(regexp_replace(normalize(replace(COALESCE(p->>'q', ''), chr(31), ''), NFD), '[̀-ͯ]', '', 'g')), '^\s+|\s+$', '', 'g');
  v_vista     text := COALESCE(NULLIF(p->>'vista', ''), 'proyectos');
  v_page      int := GREATEST(COALESCE(NULLIF(p->>'page', '')::int, 1), 1);
  v_size      int := LEAST(GREATEST(COALESCE(NULLIF(p->>'page_size', '')::int, 60), 1), 200);
  v_proyecto  text := NULLIF(p->>'proyecto', '');
  v_result    jsonb;
BEGIN
  WITH
  con AS MATERIALIZED (
    SELECT * FROM cuentas_conceptos(v_anio, v_hoy)
  ),
  -- Por proyecto, sobre todos sus conceptos (D17, totales y cierre fiscal).
  proj AS MATERIALIZED (
    SELECT c.proyecto_key AS key,
           min(c.proyecto_orden) AS orden,
           min(c.proyecto_nombre) AS nombre,
           min(c.proyecto_cliente) AS cliente,
           min(c.fecha_entrega) AS fecha_entrega,
           min(c.anio) AS anio,
           min(c.mes) AS mes,
           bool_and(c.sin_fecha) AS sin_fecha,
           bool_and(c.sin_proyecto) AS sin_proyecto,
           bool_and(c.proyecto_reabierta) AS reabierta,
           count(*) FILTER (WHERE NOT c.resuelto) AS pendientes,
           bool_or(c.estado = 'vencido') AS hay_vencidos,
           max(c.fecha_resuelto) AS fecha_resuelto_max,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(c.total) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(c.pagado, c.total)) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(c.saldo) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS por_pagar,
           -- #99: antes de IVA (cobros) y neto (pagos).
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(c.neto) FILTER (WHERE c.tipo = 'pago'), 0), 2) AS pagos_neto,
           -- calcularCierreProyecto: cruce por grupo o suelta, redondeado y sumado.
           round(COALESCE(sum(c.cierre_iva), 0), 2) AS iva_pagado,
           round(COALESCE(sum(c.cierre_iva_retenido), 0), 2) AS iva_retenido_total,
           round(COALESCE(sum(c.cierre_isr_retenido), 0), 2) AS isr_retenido_total,
           min(c.utilidad_proyecto) AS utilidad, min(c.iva_proyecto) AS iva_proyecto
    FROM con c
    GROUP BY c.proyecto_key
  ),
  pj AS MATERIALIZED (
    SELECT x.*,
           EXISTS (SELECT 1 FROM proyectos hp WHERE hp.id = x.key AND hp.cuentas_historico_at IS NOT NULL) AS historico,
           -- D17: cerradas = sin pendientes y sin reapertura activa.
           x.pendientes = 0 AND NOT x.reabierta AS cerradas,
           CASE WHEN x.pendientes = 0 AND NOT x.reabierta THEN x.fecha_resuelto_max END AS fecha_cierre,
           -- #99: utilidad bruta con descuento (Σ utilidad_total).
           round(x.utilidad, 2) AS utilidad_bruta,
           round(greatest(0, round(x.utilidad, 2)) * 0.30, 2) AS isr_serenata,
           round(round(x.utilidad, 2) - round(greatest(0, round(x.utilidad, 2)) * 0.30, 2), 2) AS utilidad_neta,
           round(x.iva_proyecto - x.iva_pagado, 2) AS iva_neto
    FROM proj x
  ),
  -- S16: sin mes, el actual si es el año en curso; si no, el último con proyectos.
  mes_ef AS (
    SELECT CASE
             WHEN v_mes_txt = 'todo' THEN NULL
             WHEN v_mes_txt ~ '^\d+$' THEN v_mes_txt::int
             WHEN v_anio = extract(year FROM v_hoy)::int THEN extract(month FROM v_hoy)::int
             ELSE (SELECT max(mes) FROM pj WHERE NOT sin_fecha AND anio = v_anio)
           END AS mes
  ),
  -- Conceptos que pasan tipo, cliente, proveedor y búsqueda.
  -- Búsqueda (normalizarBusqueda): los cinco campos se normalizan juntos,
  -- separados por U+001F (la búsqueda no lo puede contener), en una sola
  -- pasada por concepto. normalize() es lo caro: un texto solo ASCII
  -- (bytes = caracteres) no tiene acentos y se salta.
  fc AS MATERIALIZED (
    SELECT c.*
    FROM con c
    CROSS JOIN LATERAL (
      SELECT concat_ws(chr(31), c.proyecto_key, c.proyecto_nombre, COALESCE(c.proyecto_cliente, ''), c.contraparte, c.concepto) AS texto
    ) b
    WHERE (v_tipo = 'todo' OR c.tipo = v_tipo)
      AND (v_cliente IS NULL OR (c.tipo = 'cobro' AND c.contraparte = v_cliente))
      AND (v_proveedor IS NULL OR (c.tipo = 'pago' AND c.contraparte = v_proveedor))
      AND (v_q = ''
           OR strpos(CASE WHEN octet_length(b.texto) = char_length(b.texto) THEN lower(b.texto)
                          ELSE lower(regexp_replace(normalize(b.texto, NFD), '[̀-ͯ]', '', 'g')) END,
                     v_q) > 0)
  ),
  dec AS MATERIALIZED (
    SELECT pj.*,
           (v_estado = 'todas' OR (v_estado = 'pendientes' AND NOT pj.cerradas) OR (v_estado = 'cerradas' AND pj.cerradas)) AS estado_ok
    FROM pj
    WHERE pj.key IN (SELECT proyecto_key FROM fc)
  ),
  del_anio AS (
    SELECT * FROM dec WHERE NOT sin_fecha AND anio = v_anio
  ),
  alcance AS MATERIALIZED (
    SELECT d.* FROM del_anio d, mes_ef m WHERE m.mes IS NULL OR d.mes = m.mes
  ),
  -- Proyectos a mostrar: los del periodo, y en "Todo el año" también "Sin fecha" (S17).
  vis AS MATERIALIZED (
    SELECT a.*, row_number() OVER (ORDER BY a.mes, a.cerradas, a.orden) AS pos, false AS es_sin_fecha
    FROM alcance a WHERE a.estado_ok
    UNION ALL
    SELECT d.*, 1000000 + row_number() OVER (ORDER BY d.orden), true
    FROM dec d, mes_ef m
    WHERE m.mes IS NULL AND d.sin_fecha AND d.estado_ok
  ),
  -- Orden de la lista: el de las tarjetas y, dentro del proyecto, cobros,
  -- luego grupos, luego sueltas, cada uno por creación. Se numeran solo las
  -- llaves (ordenar la fila completa costaba ~60 ms); la fila entera se
  -- vuelve a leer solo para la página pedida.
  filas AS MATERIALIZED (
    SELECT f.key, f.proyecto_key,
           row_number() OVER (ORDER BY v.pos, f.tipo = 'pago', f.objetivo = 'cuenta', f.concepto_creado, f.id) AS n
    FROM fc f
    JOIN vis v ON v.key = f.proyecto_key
    WHERE v_estado <> 'pendientes' OR NOT f.resuelto
  ),
  tarjetas AS (
    SELECT v.pos, v.es_sin_fecha,
           jsonb_build_object(
             'id', v.key, 'nombre', v.nombre, 'cliente', v.cliente, 'fecha_entrega', v.fecha_entrega,
             'anio', v.anio, 'mes', v.mes, 'sin_fecha', v.sin_fecha, 'sin_proyecto', v.sin_proyecto, 'historico', v.historico,
             'cuentas', jsonb_build_object('cerradas', v.cerradas, 'reabiertas', v.reabierta, 'pendientes', v.pendientes,
                                           'hay_vencidos', v.hay_vencidos, 'fecha_cierre', v.fecha_cierre),
             'totales', jsonb_build_object('cobros_total', v.cobros_total, 'cobrado', v.cobrado, 'por_cobrar', v.por_cobrar,
                                           'pagos_total', v.pagos_total, 'pagado', v.pagado, 'por_pagar', v.por_pagar,
                                           'cobros_sin_iva', v.cobros_sin_iva, 'pagos_neto', v.pagos_neto)
           ) AS t
    FROM vis v
  ),
  -- Totales del periodo: conceptos filtrados de los proyectos del alcance y su cierre.
  tot_c AS (
    SELECT round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobrado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS por_cobrar,
           round(COALESCE(sum(f.total) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_total,
           round(COALESCE(sum(least(f.pagado, f.total)) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagado,
           round(COALESCE(sum(f.saldo) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS por_pagar,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'cobro'), 0), 2) AS cobros_sin_iva,
           round(COALESCE(sum(f.neto) FILTER (WHERE f.tipo = 'pago'), 0), 2) AS pagos_neto
    FROM fc f WHERE f.proyecto_key IN (SELECT key FROM alcance)
  ),
  tot_p AS (
    SELECT round(COALESCE(sum(iva_neto), 0), 2) AS iva,
           round(COALESCE(sum(iva_retenido_total + isr_retenido_total), 0), 2) AS retenciones,
           round(COALESCE(sum(isr_serenata), 0), 2) AS isr,
           round(COALESCE(sum(utilidad_bruta), 0), 2) AS bruta,
           round(COALESCE(sum(utilidad_neta), 0), 2) AS neta,
           -- #99: flujo con IVA de los mismos proyectos que la utilidad (sin filtros de concepto).
           round(COALESCE(sum(cobros_total - pagos_total), 0), 2) AS flujo
    FROM alcance
  ),
  -- B6: proyecto abierto en el panel (antes se armaba en TypeScript, periodo.ts / seleccionarProyecto).
  -- Mismas reglas: conceptos que pasan el filtro, o todos si ninguno pasa; totales, cuentas y cierre
  -- salen de TODOS los conceptos del proyecto.
  sel AS MATERIALIZED (
    SELECT * FROM pj WHERE v_proyecto IS NOT NULL AND key = v_proyecto
  ),
  sel_todos AS MATERIALIZED (
    SELECT c.* FROM con c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_filtrados AS MATERIALIZED (
    SELECT c.* FROM fc c WHERE v_proyecto IS NOT NULL AND c.proyecto_key = v_proyecto
  ),
  sel_c AS MATERIALIZED (
    SELECT x.*, row_number() OVER (ORDER BY (x.tipo = 'pago'), (x.objetivo = 'cuenta'), x.concepto_creado, x.id) AS n
    FROM (SELECT * FROM sel_filtrados
          UNION ALL
          SELECT * FROM sel_todos WHERE NOT EXISTS (SELECT 1 FROM sel_filtrados)) x
  ),
  -- calcularCierreProyecto: un renglón por grupo de facturación o por cuenta suelta.
  sel_cierre AS (
    SELECT s.key,
           jsonb_build_object(
             'quien_cuanto_cuando', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'clave', t.id, 'proveedor_id', t.contraparte_id,
                        'proveedor_nombre', t.contraparte,
                        'regimen_fiscal', t.regimen_fiscal, 'neto', t.neto, 'iva_trasladado', t.cierre_iva,
                        'iva_retenido', t.cierre_iva_retenido, 'isr_retenido', t.cierre_isr_retenido,
                        'total_a_transferir', t.total, 'total_es_snapshot', NOT t.total_estimado
                      ) ORDER BY (t.objetivo = 'cuenta'), t.concepto_creado, t.id)
               FROM sel_todos t WHERE t.tipo = 'pago'), '[]'::jsonb),
             'iva_retenido_total', s.iva_retenido_total, 'isr_retenido_total', s.isr_retenido_total,
             'iva_cobrado', s.iva_proyecto, 'iva_pagado', s.iva_pagado, 'iva_neto_a_enterar', s.iva_neto,
             'utilidad_bruta', s.utilidad_bruta, 'isr_serenata_estimado', s.isr_serenata,
             'utilidad_neta', s.utilidad_neta, 'utilidad_libre_estimada', s.utilidad_neta
           ) AS cierre
    FROM sel s
  ),
  -- Entradas del cierre mensual: cobros con sus pagos vigentes y pagos a proveedor (total a transferir) por grupo o suelta.
  sel_cobros AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'total', t.total,
             'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', pc.monto) ORDER BY h.fecha_pago, h.created_at)
                                FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                WHERE pc.cuentas_cobrar_id = t.id::uuid AND h.anulado_at IS NULL), '[]'::jsonb)
           ) ORDER BY t.concepto_creado, t.id), '[]'::jsonb) AS j
    FROM sel_todos t WHERE t.tipo = 'cobro'
  ),
  sel_pagos AS (
    SELECT COALESCE(jsonb_object_agg(k.id, k.f), '{}'::jsonb) AS j
    FROM (
      SELECT p.grupo_id::text AS id,
             jsonb_agg(jsonb_build_object('fecha', h.fecha_pago::text, 'monto', p.monto_transferido) ORDER BY h.fecha_pago, h.created_at) AS f
      FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
      WHERE h.anulado_at IS NULL
        AND p.grupo_id = ANY (SELECT t.id::uuid FROM sel_todos t WHERE t.tipo = 'pago' AND t.objetivo = 'grupo')
      GROUP BY 1
    ) k
  )
  SELECT jsonb_build_object(
    'anio', v_anio,
    'mes', COALESCE(to_jsonb(m.mes), '"todo"'::jsonb),
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'meses', (
      SELECT jsonb_agg(jsonb_build_object(
               'mes', s.m,
               'proyectos', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m),
               'pendientes', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND NOT d.cerradas),
               'visibles', (SELECT count(*) FROM del_anio d WHERE d.mes = s.m AND d.estado_ok)
             ) ORDER BY s.m)
      FROM generate_series(1, 12) AS s(m)
    ),
    'conteo', (
      SELECT jsonb_build_object('todas', count(*), 'pendientes', count(*) FILTER (WHERE NOT cerradas), 'cerradas', count(*) FILTER (WHERE cerradas))
      FROM alcance
    ),
    'totales', (
      SELECT jsonb_build_object(
        'ingresos', jsonb_build_object('total', c.cobros_total, 'cobrado', c.cobrado, 'por_cobrar', c.por_cobrar, 'sin_iva', c.cobros_sin_iva),
        'egresos', jsonb_build_object('total', c.pagos_total, 'pagado', c.pagado, 'por_pagar', c.por_pagar, 'neto', c.pagos_neto),
        'utilidad', jsonb_build_object('bruta', t.bruta, 'isr_estimado', t.isr, 'neta', t.neta, 'flujo', t.flujo),
        'impuestos', jsonb_build_object('iva_a_enterar', t.iva, 'retenciones', t.retenciones, 'isr_estimado', t.isr,
                                        'total', round(t.iva + t.retenciones, 2))
      )
      FROM tot_c c, tot_p t
    ),
    'proyectos', CASE WHEN v_vista = 'proyectos' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM (
                   SELECT t, pos FROM tarjetas WHERE NOT es_sin_fecha ORDER BY pos
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x), '[]'::jsonb),
        'total', (SELECT count(*) FROM vis WHERE NOT es_sin_fecha),
        'page', v_page, 'page_size', v_size)
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size) END,
    'sin_fecha', CASE WHEN v_vista = 'proyectos'
      THEN COALESCE((SELECT jsonb_agg(t ORDER BY pos) FROM tarjetas WHERE es_sin_fecha), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'lista', CASE WHEN v_vista = 'lista' THEN jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END,
                   'proyecto', jsonb_build_object('id', f.proyecto_key, 'nombre', f.proyecto_nombre, 'mes', f.mes, 'sin_fecha', f.sin_fecha)
                 ) ORDER BY n.n)
                 FROM filas n JOIN fc f ON f.key = n.key
                 WHERE n.n > (v_page - 1) * v_size AND n.n <= v_page * v_size), '[]'::jsonb),
        'total', (SELECT count(*) FROM filas),
        'page', v_page, 'page_size', v_size,
        'proyectos', (SELECT count(DISTINCT proyecto_key) FROM filas))
      ELSE jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', 1, 'page_size', v_size, 'proyectos', 0) END
    ,
    'seleccionado', (
      SELECT jsonb_build_object(
        'id', s.key, 'nombre', s.nombre, 'cliente', s.cliente, 'fecha_entrega', s.fecha_entrega,
        'anio', s.anio, 'mes', s.mes, 'sin_fecha', s.sin_fecha, 'sin_proyecto', s.sin_proyecto, 'historico', s.historico,
        'cuentas', jsonb_build_object('cerradas', s.cerradas, 'reabiertas', s.reabierta, 'pendientes', s.pendientes,
                                      'hay_vencidos', s.hay_vencidos, 'fecha_cierre', s.fecha_cierre),
        'totales', jsonb_build_object('cobros_total', s.cobros_total, 'cobrado', s.cobrado, 'por_cobrar', s.por_cobrar,
                                      'pagos_total', s.pagos_total, 'pagado', s.pagado, 'por_pagar', s.por_pagar,
                                      'cobros_sin_iva', s.cobros_sin_iva, 'pagos_neto', s.pagos_neto),
        'conceptos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'key', f.key, 'tipo', f.tipo, 'objetivo', f.objetivo, 'id', f.id, 'proyecto_id', f.proyecto_id,
                   'cotizacion_id', f.cotizacion_id, 'folio', f.folio, 'contraparte', f.contraparte,
                   'contraparte_id', f.contraparte_id, 'concepto', f.concepto, 'items', f.items, 'total', f.total,
                   'neto', f.neto, 'pagado', f.pagado, 'total_estimado', f.total_estimado, 'regimen_fiscal', f.regimen_fiscal,
                   'orden_pago_id', f.orden_pago_id, 'fecha_vencimiento', f.fecha_vencimiento, 'estado', f.estado,
                   'paso', f.paso, 'paso_urgente', f.paso_urgente, 'saldo', f.saldo, 'venc_dias', f.venc_dias,
                   'resuelto', f.resuelto, 'fecha_resuelto', f.fecha_resuelto, 'metodo_desconocido', f.metodo_desconocido,
                   'complementos', f.complementos,
                   'compartido', CASE f.tipo
                     WHEN 'cobro' THEN (SELECT jsonb_build_object(
                         'factura_id', cc.factura_documento_id,
                         'facturas_cuentas', CASE WHEN cc.factura_documento_id IS NULL THEN 0
                                                  ELSE (SELECT count(*) FROM cuentas_cobrar x WHERE x.factura_documento_id = cc.factura_documento_id) END,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pc.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id)) ORDER BY pc.pago_id)
                                            FROM pagos_comprobantes pc JOIN pagos h ON h.id = pc.pago_id
                                            WHERE pc.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_comprobantes y WHERE y.pago_id = pc.pago_id) > 1), '[]'::jsonb))
                       FROM cuentas_cobrar cc WHERE cc.id = f.id::uuid)
                     WHEN 'pago' THEN CASE WHEN f.objetivo = 'grupo' THEN (SELECT jsonb_build_object(
                         'factura_id', NULL::uuid, 'facturas_cuentas', 0,
                         'pagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('pago_id', pp.pago_id,
                                                  'lineas', (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id)) ORDER BY pp.pago_id)
                                            FROM pagos_cuentas_pagar pp JOIN pagos h ON h.id = pp.pago_id
                                            WHERE pp.grupo_id = f.id::uuid AND h.anulado_at IS NULL
                                              AND (SELECT count(*) FROM pagos_cuentas_pagar y WHERE y.pago_id = pp.pago_id) > 1), '[]'::jsonb))) END
                   END
                 ) ORDER BY f.n) FROM sel_c f), '[]'::jsonb),
        'cierre', sc.cierre,
        'cierre_mensual', cuentas_cierre_mensual(sc.cierre, (SELECT j FROM sel_cobros), (SELECT j FROM sel_pagos))
      )
      FROM sel s JOIN sel_cierre sc ON sc.key = s.key
    )
  ) INTO v_result
  FROM mes_ef m;

  RETURN v_result;
END;
$function$;

-- ════════ 8. auditar_consistencia: 24 → 27 guardas (solo reportan) ════════
CREATE OR REPLACE FUNCTION public.auditar_consistencia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET work_mem TO '16MB'
AS $function$
  WITH
g_cobro_pagado AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE abs(cc.monto_pagado - COALESCE((
    SELECT SUM(p.monto) FROM pagos_comprobantes p JOIN pagos h ON h.id = p.pago_id
    WHERE p.cuentas_cobrar_id = cc.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_pagado AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(p.monto_neto) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_grupo_transferido AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(COALESCE(g.monto_transferido, 0) - COALESCE((
    SELECT SUM(p.monto_transferido) FROM pagos_cuentas_pagar p JOIN pagos h ON h.id = p.pago_id
    WHERE p.grupo_id = g.id AND h.anulado_at IS NULL), 0)) > 0.01
),
g_hijas_grupo AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_pagado - COALESCE((
    SELECT SUM(cp.monto_pagado) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_total AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE abs(g.monto_total - COALESCE((
    SELECT SUM(cp.costo_total) FROM cuentas_pagar cp
    WHERE cp.grupo_id = g.id), 0)) > 0.01
),
g_grupo_vacio AS (
  SELECT g.id::text AS id
  FROM cuentas_pagar_grupos g
  WHERE NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.grupo_id = g.id)
),
g_cp_costo_total AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE abs(cp.costo_total - round(i.costo_unitario * i.cantidad, 2)) > 0.01
),
g_orden_total AS (
  SELECT o.id::text AS id
  FROM ordenes_pago o
  WHERE abs(o.total_monto - COALESCE((
    SELECT SUM(c.neto_cubierto) FROM ordenes_pago_conceptos c
    WHERE c.orden_pago_id = o.id), 0)) > 0.01
),
g_item_importe AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.importe - round(i.cantidad * i.precio_unitario, 2)) > 0.01
),
g_item_margen AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  WHERE abs(i.margen - (i.importe - round(i.costo_unitario * i.cantidad, 2))) > 0.01
),
g_cobro_total AS (
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  JOIN cotizaciones c ON c.id = cc.cotizacion_id
  WHERE abs(cc.monto_total - c.total) > 0.01
),
g_k4_sin_cuenta AS (
  SELECT i.id::text AS id
  FROM items_cotizacion i
  JOIN cotizaciones c ON c.id = i.cotizacion_id AND c.estado = 'APROBADA'
  WHERE i.costo_unitario > 0
    AND NOT EXISTS (SELECT 1 FROM cuentas_pagar cp WHERE cp.item_id = i.id)
),
g_k4_cuenta_sin_item AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE (cp.item_id IS NULL AND NULLIF(btrim(cp.concepto), '') IS NULL)
     OR (cp.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items_cotizacion i WHERE i.id = cp.item_id))
),
g_gasto_extra_proyecto AS (
  -- #130: un gasto extra cuelga de la cotización principal aprobada de su proyecto.
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.item_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cp.proyecto_id AND c.id = cp.cotizacion_id AND c.estado = 'APROBADA')
),
g_k4_item_cero AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  JOIN items_cotizacion i ON i.id = cp.item_id
  WHERE i.costo_unitario <= 0
),
g_cp_sin_grupo AS (
  SELECT cp.id::text AS id
  FROM cuentas_pagar cp
  WHERE cp.responsable_id IS NOT NULL AND cp.grupo_id IS NULL
),
g_folio_cc AS (
  SELECT cc.id::text AS id FROM cuentas_cobrar cc
  WHERE cc.folio IS NULL
     OR cc.folio IN (SELECT folio FROM cuentas_cobrar GROUP BY folio HAVING count(*) > 1)
),
g_folio_cp AS (
  SELECT cp.id::text AS id FROM cuentas_pagar cp
  WHERE cp.folio IS NULL
     OR cp.folio IN (SELECT folio FROM cuentas_pagar GROUP BY folio HAVING count(*) > 1)
),
g_factura_ligada AS (
  -- #123: una cuenta ligada apunta a una FACTURA_XML vigente.
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE cc.factura_documento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM documentos_cuentas_cobrar d
                    WHERE d.id = cc.factura_documento_id AND d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL)
),
g_factura_cliente AS (
  -- Las cuentas de una factura son del mismo cliente (P2).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
  JOIN cotizaciones ct ON ct.id = cc.cotizacion_id
  WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL
  GROUP BY d.id
  HAVING count(DISTINCT ct.cliente_id) > 1
),
g_factura_suma AS (
  -- Una factura "validada" suma lo que dice su XML (tolerancia de 0.01 por cotización, P26).
  SELECT x.id::text AS id
  FROM (
    SELECT d.id, d.total_cfdi, count(*) AS n, sum(cc.monto_total) AS suma
    FROM documentos_cuentas_cobrar d
    JOIN cuentas_cobrar cc ON cc.factura_documento_id = d.id
    WHERE d.tipo = 'FACTURA_XML' AND d.eliminado_at IS NULL AND d.estado_validacion = 'validado' AND d.total_cfdi IS NOT NULL
    GROUP BY d.id, d.total_cfdi
  ) x
  WHERE abs(round(x.total_cfdi - x.suma, 2)) > round(0.01 * x.n, 2)
),
g_pago_coherente AS (
  -- Un pago tiene líneas, todas de su lado y de una sola contraparte (T17).
  SELECT h.id::text AS id
  FROM pagos h
  WHERE (NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id)
         AND NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'cobro' AND EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = h.id))
     OR (h.lado = 'proveedor' AND EXISTS (SELECT 1 FROM pagos_comprobantes pc WHERE pc.pago_id = h.id))
     OR (h.lado = 'cobro' AND (
           SELECT count(DISTINCT ct.cliente_id) FROM pagos_comprobantes pc
           JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
           JOIN cotizaciones ct ON ct.id = cc.cotizacion_id WHERE pc.pago_id = h.id) > 1)
     OR (h.lado = 'proveedor' AND (
           SELECT count(DISTINCT g.responsable_id) FROM pagos_cuentas_pagar pp
           JOIN cuentas_pagar_grupos g ON g.id = pp.grupo_id WHERE pp.pago_id = h.id) > 1)
),
g_complemento AS (
  -- Un complemento vigente referencia una factura vigente y un pago con línea en una cuenta de esa factura (P9).
  SELECT d.id::text AS id
  FROM documentos_cuentas_cobrar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL AND d.factura_documento_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM documentos_cuentas_cobrar f WHERE f.id = d.factura_documento_id AND f.eliminado_at IS NULL)
    AND (d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_comprobantes pc JOIN cuentas_cobrar cc ON cc.id = pc.cuentas_cobrar_id
                        WHERE pc.pago_id = d.pago_id AND cc.factura_documento_id = d.factura_documento_id))
  UNION ALL
  SELECT d.id::text
  FROM documentos_cuentas_pagar d
  WHERE d.tipo IN ('COMPLEMENTO_PAGO', 'COMPLEMENTO_PAGO_PDF') AND d.eliminado_at IS NULL
    AND (d.grupo_id IS NULL OR d.pago_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM pagos_cuentas_pagar pp WHERE pp.pago_id = d.pago_id AND pp.grupo_id = d.grupo_id))
),
g_factura_fecha AS (
  -- Fecha de factura y factura vigente van juntas (las cachés solo las escriben las RPC).
  SELECT cc.id::text AS id
  FROM cuentas_cobrar cc
  WHERE (cc.factura_documento_id IS NOT NULL AND cc.fecha_factura IS NULL)
     OR (cc.factura_documento_id IS NULL AND cc.fecha_factura IS NOT NULL)
),
g_historico_modificado AS (
  -- Un histórico quedó resuelto al archivarse y no admite escrituras: si algo cambió después, podría haber dejado de estarlo.
  SELECT p.id::text AS id
  FROM proyectos p
  JOIN cuentas_ultimo_cambio_lote(ARRAY(SELECT h.id FROM proyectos h WHERE h.cuentas_historico_at IS NOT NULL)) l ON l.proyecto_id = p.id
  WHERE p.cuentas_historico_at IS NOT NULL AND l.ultimo > p.cuentas_historico_at
),
g_historico_reabierto AS (
  SELECT r.proyecto_id::text AS id
  FROM cuentas_reaperturas r JOIN proyectos p ON p.id = r.proyecto_id
  WHERE r.cerrada_at IS NULL AND p.cuentas_historico_at IS NOT NULL
),
g_componente_mixto AS (
  -- Un histórico unido por factura o pago compartido con un proyecto vivo (o una cuenta sin proyecto): debían archivarse juntos.
  SELECT DISTINCT a.proyecto_id::text AS id
  FROM (
    SELECT c1.proyecto_id, c2.proyecto_id AS otro
      FROM cuentas_cobrar c1 JOIN cuentas_cobrar c2 ON c2.factura_documento_id = c1.factura_documento_id AND c2.id <> c1.id
     WHERE c1.factura_documento_id IS NOT NULL
    UNION ALL
    SELECT c1.proyecto_id, c2.proyecto_id
      FROM pagos_comprobantes p1 JOIN cuentas_cobrar c1 ON c1.id = p1.cuentas_cobrar_id
           JOIN pagos_comprobantes p2 ON p2.pago_id = p1.pago_id AND p2.id <> p1.id JOIN cuentas_cobrar c2 ON c2.id = p2.cuentas_cobrar_id
    UNION ALL
    SELECT g1.proyecto_id, g2.proyecto_id
      FROM pagos_cuentas_pagar q1 JOIN cuentas_pagar_grupos g1 ON g1.id = q1.grupo_id
           JOIN pagos_cuentas_pagar q2 ON q2.pago_id = q1.pago_id AND q2.id <> q1.id JOIN cuentas_pagar_grupos g2 ON g2.id = q2.grupo_id
  ) a
  JOIN proyectos pa ON pa.id = a.proyecto_id
  LEFT JOIN proyectos pb ON pb.id = a.otro
  WHERE pa.cuentas_historico_at IS NOT NULL AND (a.otro IS NULL OR pb.cuentas_historico_at IS NULL)
),
  resultado(clave, descripcion, violaciones, ejemplos) AS (
    VALUES
      ('historico_modificado', 'proyectos históricos con cambios posteriores al archivado (podrían dejar de estar resueltos)', (SELECT count(*) FROM g_historico_modificado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_historico_modificado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('historico_reabierto', 'proyectos históricos con una reapertura activa', (SELECT count(*) FROM g_historico_reabierto), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_historico_reabierto ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('componente_mixto', 'proyectos históricos unidos por factura o pago compartido con un proyecto vivo', (SELECT count(*) FROM g_componente_mixto), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_componente_mixto ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cobro_pagado', 'cuentas por cobrar: monto_pagado = Σ pagos vigentes', (SELECT count(*) FROM g_cobro_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_pagado', 'grupos de pago: monto_pagado = Σ pagos vigentes (neto)', (SELECT count(*) FROM g_grupo_pagado), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_pagado ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_transferido', 'grupos de pago: monto_transferido = Σ pagos vigentes (transferido)', (SELECT count(*) FROM g_grupo_transferido), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_transferido ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_hijas', 'grupos de pago: monto_pagado = Σ monto_pagado de sus renglones', (SELECT count(*) FROM g_hijas_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_hijas_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_total', 'grupos de pago: monto_total = Σ costo_total de sus renglones', (SELECT count(*) FROM g_grupo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('grupo_vacio', 'grupos de pago sin renglones', (SELECT count(*) FROM g_grupo_vacio), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_grupo_vacio ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_costo_total', 'cuentas por pagar: costo_total = costo_unitario × cantidad del renglón', (SELECT count(*) FROM g_cp_costo_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_costo_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('orden_total', 'órdenes de pago: total_monto = Σ desglose', (SELECT count(*) FROM g_orden_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_orden_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_importe', 'renglones: importe = cantidad × precio', (SELECT count(*) FROM g_item_importe), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_importe ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('item_margen', 'renglones: margen = importe − costo total', (SELECT count(*) FROM g_item_margen), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_item_margen ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cobro_total', 'cuentas por cobrar: monto_total = total de la cotización', (SELECT count(*) FROM g_cobro_total), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cobro_total ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_sin_cuenta', 'renglón aprobado con costo_unitario > 0 sin cuenta por pagar', (SELECT count(*) FROM g_k4_sin_cuenta), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_sin_cuenta ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_cuenta_sin_item', 'cuenta por pagar sin renglón ni concepto de gasto extra', (SELECT count(*) FROM g_k4_cuenta_sin_item), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_cuenta_sin_item ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('gasto_extra_proyecto', 'gasto extra: cuelga de la cotización principal aprobada de su proyecto', (SELECT count(*) FROM g_gasto_extra_proyecto), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_gasto_extra_proyecto ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('k4_item_cero', 'cuenta por pagar de un renglón con costo_unitario <= 0', (SELECT count(*) FROM g_k4_item_cero), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_k4_item_cero ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('cp_sin_grupo', 'cuenta por pagar con proveedor y sin grupo', (SELECT count(*) FROM g_cp_sin_grupo), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_cp_sin_grupo ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cc', 'folio de cuenta por cobrar nulo o duplicado', (SELECT count(*) FROM g_folio_cc), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cc ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('folio_cp', 'folio de cuenta por pagar nulo o duplicado', (SELECT count(*) FROM g_folio_cp), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_folio_cp ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_ligada', 'cuentas por cobrar: la factura ligada es una FACTURA_XML vigente', (SELECT count(*) FROM g_factura_ligada), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_ligada ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_cliente', 'facturas de cobro: todas sus cuentas son de un solo cliente', (SELECT count(*) FROM g_factura_cliente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_cliente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_suma', 'facturas de cobro validadas: Σ cotizaciones = total del XML (±0.01 por cotización)', (SELECT count(*) FROM g_factura_suma), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_suma ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('pago_coherente', 'pagos: con líneas, de su lado y de una sola contraparte', (SELECT count(*) FROM g_pago_coherente), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_pago_coherente ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('complemento_valido', 'complementos: factura vigente y pago con línea en ella', (SELECT count(*) FROM g_complemento), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_complemento ORDER BY id LIMIT 5) m), '{}'::text[])),
      ('factura_fecha', 'cuentas por cobrar: fecha de factura si y solo si hay factura ligada', (SELECT count(*) FROM g_factura_fecha), COALESCE((SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM g_factura_fecha ORDER BY id LIMIT 5) m), '{}'::text[]))
  )
  SELECT jsonb_build_object(
    'ejecutado_en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'total_violaciones', COALESCE(sum(violaciones), 0),
    'guardas', COALESCE(jsonb_agg(jsonb_build_object(
      'clave', clave, 'descripcion', descripcion, 'violaciones', violaciones, 'ejemplos', to_jsonb(ejemplos)
    ) ORDER BY clave), '[]'::jsonb)
  )
  FROM resultado;
$function$;
