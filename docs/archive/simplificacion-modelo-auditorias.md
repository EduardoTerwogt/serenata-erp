# Simplificación del modelo de datos — historial de auditorías del plan

Historia de cómo se llegó al plan vigente (`docs/PLAN.md`). Se movió aquí en
v9 para que el plan quede como lista ejecutable. **No es instrucción de
ejecución:** si algo de este archivo contradice `docs/PLAN.md`, manda el plan.
Los identificadores (A1…K14) se siguen citando desde el plan.

## Auditoría del plan v1 (2026-10-01)

Revisión tipo equipo senior del plan v1 contra el código, `pg_get_functiondef`
de producción, la BD de test y las decisiones vigentes. **Veredicto: el v1 no
estaba listo** — tenía un error de hecho en el bloque de dinero y validaba en
una BD de test que no es igual a producción. Corregido en v2 y conservado en v3.

| # | Sev. | Hallazgo | Evidencia | Corrección en v2 |
|---|---|---|---|---|
| A1 | **P0** | **Error del v1:** las cuentas hijas de un grupo **no** tienen columnas muertas. `registrar_pago_grupo_factura` y `anular_pago_proveedor` prorratean `monto_pagado`, `estado` y `fecha_pago` a cada renglón (decisión 011: Σ hijas = grupo), y los leen `dashboard_kpis_cuentas`, `dashboard_egresos_por_bucket`, `cuentas_orden_candidatos` y `buscar_cuentas_pagar_grupos`. La fase 2 las vio en 0 porque prod solo tiene 2 pagos. | `UPDATE cuentas_pagar SET monto_pagado …` en ambas RPCs. | Se **conservan** `monto_pagado`, `estado` y `fecha_pago` del renglón (es el desglose por renglón que pidió la 011). Solo salen las columnas que nada más usa la rama suelta: `orden_pago_id`, `total_a_transferir`, `monto_transferido`, `metodo_pago`. |
| A2 | **P0** | **Test ≠ producción.** Test tiene 43 tablas: los objetos del frente 2 (`20261009`/`20261010`: `cuentas_conceptos_base`, cola, 15 triggers en 11 tablas, `cuentas_conceptos_derivar`) que leen columnas que este plan borra. Validar en test no valida prod, y una contracción rompería todas las escrituras en test. | `pg_trigger` de test. | B0 retira de test los objetos del frente 2 (migración de reversa documentada, solo test) y verifica esquema test = prod. El PR #100 queda en pausa sabiendo que se rehará sobre el modelo nuevo (D6). |
| A3 | P1 | **Una sola BD de test compartida** por `live` de `main` y de todo PR. Una contracción aplicada en test rompe `live` de `main` hasta el merge. | `.github/workflows` usan `TEST_SUPABASE_*`. | Regla: durante la iniciativa no hay otro PR con cambios de BD; cada contracción se aplica en test → CI → merge → prod el mismo día. Prerrequisito: resolver #107 (cómputo de test), si no `live` no es confiable como juez. |
| A4 | P1 | **Las mismas funciones se reescribían 2–3 veces** (B5a, B5b, B6 tocan `cuentas_conceptos`, `cuentas_por_proyecto`, `buscar_*`, `cuentas_orden_candidatos`, `generar_orden_pago`…). Cada reescritura de una función de dinero es un riesgo y una revisión. | Lista de funciones por hallazgo. | Se agrupa **por función**, no por tema: una expansión de Cuentas (B5) y una contracción (B6). Cada función se reescribe una vez. |
| A5 | P1 | **Las reglas de Cuentas viven dos veces** (SQL y `lib/shared/cuentas/concepto.ts` vía `periodo.ts` y `detalle-armar.ts`, paridad obligatoria, #108). Todo cambio de Cuentas en v1 se pagaba doble. | `derivarConcepto`, `derivarCobro/derivarPago`. | Nuevo B4: un solo motor (SQL) antes de tocar Cuentas; el test de paridad actual sirve de oráculo antes de retirar el TS. Cierra #108. |
| A6 | P1 | Columnas `GENERATED` para `importe`/`margen` eran una contracción disfrazada: 5 RPCs y los mappers TS las escriben, y `patch_item_cotizacion` las recalcula dentro del modelo de conflictos (decisión 002). Cualquier escritor olvidado fallaría en producción. | `importe`/`margen` en `save`, `upsert`, `bulk_replace`, `patch`, `approve`. | Recalcular + **`CHECK`** con tolerancia de centavo (los floats de JS). Mismo efecto (ningún margen viejo puede volver a guardarse, y falla explícito, principio 4) sin tocar escritores. |
| A7 | P1 | Renombrar `cuentas_pagar.x_pagar` → `costo_total` costaba 22 funciones, TS, seeds y un periodo con trigger de doble escritura, solo por el nombre. La columna no se modifica después de crearse. | Ninguna función hace `UPDATE … SET x_pagar`. | Fuera. Se documenta con `COMMENT ON COLUMN` y en el glosario de la 006, y una guarda vigila `cp.x_pagar = item.x_pagar × item.cantidad`. |
| A8 | P1 | Unificar idempotencia (B7 v1) no era quitar un duplicado: son **dos capas a propósito** (decisión 008). `idempotency_keys` es el contrato HTTP (pendiente, hash del payload, reparación); `pago_operations` guarda el resultado **en la misma transacción que el dinero**. Las rutas `registrar-pago/estado` leen las dos. | `lib/server/idempotency.ts`, rutas `estado`. | Fuera. Se documenta en la 008 por qué son dos. Saldo de tablas: 40 → 38. |
| A9 | P1 | Tras borrar los datos de prueba, las únicas "sueltas" son renglones **sin proveedor**, y la UI las sigue usando (D21 de la 017: reasignar en conceptos sueltos). Una aprobación nueva nunca crea sueltas con proveedor. | `approve_cotizacion` reconcilia cada renglón. | B5 quita las rutas **de pago, factura y orden** de las sueltas; el concepto "suelto por asignar" y su UI se quedan. |
| A10 | P1 | El mapa de dependencias del v1 no veía consumidores implícitos: `select('*')` (el portal lee `cuentas_pagar *`), embeds de PostgREST (`historial_responsable(*)`, `proyectos(proyecto)`), `lib/types.ts`, schemas Zod, `scripts/seed-cuentas-test.sql`, dataset de loadtest, fixtures e2e. | `lib/server/repositories/portal.ts`. | El script de B0 busca **por nombre de columna** en todo el repo, no por `.from()`. |
| A11 | P1 | `historial_responsable` como vista: los embeds de PostgREST sobre vistas no son confiables, una vista sin `security_invoker` queda expuesta (advisor), y hoy es un snapshot al cerrar con resolución por nombre. | `proveedores.ts:52`, `projects/equipo.ts`. | Vista con `security_invoker = true`, sin permisos para `anon`/`authenticated`; lectores con consulta explícita; misma regla de cierre y resolución; comparación fila por fila antes de borrar. |
| A12 | P1 | Limpieza de datos (B2 v1): SH072/SH080 están pendientes de tu verificación (#99); borrar órdenes y comprobantes deja archivos huérfanos en Storage/Drive; queda 1 cuenta legada sin `item_id` que `app/api/items/[id]/route.ts` aún busca por descripción. | `docs/ACTIVE_WORK.md`, ruta de items. | B2 no toca SH072/SH080 hasta tu visto bueno, borra también los archivos, y elimina la fila legada (la ruta por descripción sale en B3). |
| A13 | P2 | `timestamp` → `timestamptz` (13 columnas) es higiene, no dispersión, y asume que lo guardado es UTC. | — | Sale a deuda técnica. |
| A14 | P2 | Cuentas mezcla de dónde saca los nombres (cotización, proyecto y texto de cobro). | `cuentas_conceptos`, `cuentas_por_proyecto`. | B5 aplica D5: proyecto y cliente operativos desde `proyectos`/`clientes`; la cotización solo para el rótulo de su folio. |
| A15 | P2 | La latencia de Cuentas ya está al límite (`live` p95 < 800 ms, frente 3). Cambiar copias por joins agrega costo. | Deuda "job live inestable". | B5 mide `cuentas_periodo` antes/después sobre 2,203 proyectos; si pasa de +10 %, se revisan índices antes de seguir. |

## Auditoría final (v2 → v3, 2026-10-01)

Segunda revisión, como equipo de desarrollo y de datos, con las respuestas
D2, D3 y D7. **Veredicto: el v2 era implementable, pero con las nuevas
decisiones quedaba trabajo innecesario y faltaban mejoras baratas con impacto
real.** v3 las incorpora.

| # | Tipo | Hallazgo | Evidencia | En v3 |
|---|---|---|---|---|
| F1 | Simplifica | Con el reinicio total (D3), producción no tiene formas legadas: desaparecen la limpieza quirúrgica, la migración de sueltas, la fila sin `item_id` y los márgenes viejos. | Ninguna ruta actual crea sueltas con proveedor (`approve_cotizacion` y `reasignar_*` reconcilian; `generar_orden_pago` y `registrar_pago_cuenta_pagar` ya rechazan conceptos sin proveedor). | B2 = script de reinicio. |
| F2 | Riesgo | **Si se reinicia al inicio y se sigue probando en prod, la basura vuelve.** | Tus pruebas manuales hoy son en prod. | El reinicio es un script idempotente (`scripts/db/reset-transaccional.sql`): corre en B2 y **otra vez justo antes de salir a uso real**. Desde B2, las pruebas manuales van al Preview (BD de test). |
| F3 | Simplifica | Producción sin usuarios reales: una ventana de 2–3 min entre migración y deploy no afecta a nadie. Mantener expandir/contraer en 2 PRs para Cuentas obligaba a código de transición ("dejar de escribir lo que se borrará"). | — | B5 y B6 de v2 se juntan en **un PR** (migración en prod justo antes del merge). La regla vuelve a ser obligatoria tras salir a uso real. |
| F4 | Mejora real | **`fecha_entrega` es texto (D9) pero el 100 % de los valores ya es `AAAA-MM-DD`** (2,201/2,203 en test, el resto nulos) y la UI usa `DateField`. Cuentas valida con regex y manda lo demás a "Sin fecha". | Consulta en test y prod; `app/proyectos/[id]/page.tsx`. | `proyectos.fecha_entrega` y `cotizaciones.fecha_entrega` → `date` dentro de B5 (las funciones de Cuentas se reescriben ahí de todos modos). PostgREST devuelve `date` como `AAAA-MM-DD`: el TS no cambia de forma. Cierra la deuda D9. |
| F5 | Mejora real | **13 columnas `timestamp` sin zona** (documentos, pagos de cobro, órdenes…). JS interpreta un timestamp sin zona como hora **local**: en CDMX (UTC−6) puede mostrar el día equivocado cerca de medianoche. Con prod vacía, convertir es trivial. | `information_schema.columns`. | Vuelve al plan (B3), revisando cada consumidor de esas columnas. Revierte A13. |
| F6 | Integridad | `cotizaciones.estado`/`tipo` no tienen `CHECK` (las tablas de Cuentas sí); `clientes.nombre` no es único y el autosave crea clientes por nombre exacto (ya hubo "Proeba " con espacio). | `pg_constraint`; `quotations/persistence.ts`. | B3: `CHECK` de estados y tipo; índice único sobre `lower(trim(nombre))` en `clientes` y autosave que lo respeta. |
| F7 | Rendimiento | Índice **duplicado** `idx_cotizaciones_id` = PK (cada escritura paga dos). Dos índices GIN de trigramas (`productos`, `clientes`, 3 MB) sin un solo uso desde 2026-08-25 pese a `live`. | `pg_stat_user_indexes` en test. | B3: borrar el duplicado; los GIN solo si el mapa confirma que ninguna búsqueda los usa. |
| F8 | Operación | **Tablas que crecen sin límite:** `cotizacion_folio_reservations` (2,316 vencidas en test, nunca se purgan), `pago_operations`, `bulk_import_operations`. `idempotency_keys` y `rate_limits` sí se purgan en `/api/keep-alive`. | Consultas en test; `app/api/keep-alive/route.ts`. | B3: el cron diario existente purga reservas vencidas y operaciones de > 30 días. |
| F9 | Mejora real | Las guardas de consistencia solo correrían durante la iniciativa; después, un desfase de dinero pasaría en silencio (principio 4). | — | B6: función `auditar_consistencia()` que corre el cron diario; si algo da ≠ 0 lo registra y lo muestra en Admin. |
| F10 | Test | El dataset de carga de test (2,203 proyectos) tiene 7 sueltas, 2 márgenes viejos y 2 cobros con total ≠ cotización. Si se parchea a mano, deja de representar lo que produce el código nuevo. | Consultas en test. | Tras B5, **re-sembrar** test con el generador actualizado (`seed-volumen`), no parchearlo. |
| F11 | Infra (D7) | Sin subir cómputo, `live` sigue expuesto a #107. Palancas gratuitas: quitar los 15 triggers del frente 2 de test (multiplican escrituras en 11 tablas), `VACUUM ANALYZE` tras cada migración grande, y la regla de CI vigente (un solo re-run, solo si los logs muestran la latencia de BD subiendo en todos los endpoints a la vez). Los jobs ya van en serie (`concurrency: serenata-erp-test-shared`, 1 worker). | #107; `.github/workflows/e2e.yml`. | B0 aplica las tres. La corrección del dinero no depende de `live`: la juzgan las guardas y la paridad, que son deterministas. |
| F12 | Alcance | Retirar Sheets toca más que la ruta: `AdminSheets.tsx`, 3 RPCs de lock, `sheets_sync_status`, el paso de `load-test.yml`, `critical/admin-usuarios.spec.ts`, `docs/ENV.md`, `ARCHITECTURE.md` y el principio 1 de `CLAUDE.md`. Las credenciales de Google se quedan (Drive y Calendar). | `grep`. | B1 con esa lista completa. |
| F13 | Externo | Los archivos de prueba viven en **Google Drive** (39 PDFs de cotización, facturas, comprobantes, 8 PDFs de órdenes), no en Supabase Storage. Borrar filas no los borra. | `archivo_url` → `drive.google.com`; `storage.objects` vacío. | B2: paso a paso para que muevas a la papelera las carpetas de prueba de `GOOGLE_DRIVE_FOLDER_ID` y `GOOGLE_DRIVE_FOLDER_ID_CUENTAS`. |
| F14 | Alcance | `proyectos` tiene dos modelos de estado (`estado` legado y `etapa_id`): otra dispersión real. | `StatusBadge.tsx`, `projects/service.ts`. | **No se toca** (D4); queda anotado para el diseño del módulo de Proyectos. |
| F15 | Mantener | `cuentas_cobrar.monto_total` copia `cotizaciones.total` (snapshot al aprobar). Quitarlo toca muchas funciones por poca ganancia. | 2 diferencias en test (dataset). | Se queda; pasa a ser una guarda. |

**Lo que se revisó y está bien como está:** cobrar y pagar separados; dos
capas de idempotencia (008); `ordenes_pago_conceptos` como snapshot;
`historial_cambios_responsable_item` como bitácora; `x_pagar` sin renombrar;
RLS sin políticas (solo `service_role`); FKs con `text` (folios de negocio).

## Exploración de simplificación adicional (v3 → v4, 2026-10-01)

Revisión tabla por tabla contra buenas prácticas de modelado: ¿hay dos tablas
con el mismo ciclo de vida, la misma forma o una relación 1:1 sin motivo?

### Se aceptan

| # | Cambio | Evidencia | Tablas | Bloque |
|---|---|---|---|---|
| E1 | **Retirar Planeación (D8):** `planeacion_pendientes`, `planeacion_event_notas`, `extraction_logs`, su trigger y función, la referencia en `cancel_cotizacion`, `app/planeacion/`, `app/api/planeacion/` (8 rutas), navegación, proxy, la sección `planeacion` en `AppSection`/`authz`/`api-auth`/Admin, `tests/e2e/critical/planeacion.spec.ts` y sus mocks. | Ninguna otra parte lee esas tablas; los 2 usuarios son `admin`. | −3 | B1 |
| E2 | **Plantillas de servicios cambian de permiso.** Hoy `/plantillas-servicios`, `POST /api/service-templates` y el botón "Guardar como plantilla" exigen la sección `planeacion`; al retirarla quedarían inaccesibles. Pasan a la sección `cotizaciones`, que es donde se usan. | `lib/proxy-handler.ts:33,46`, `lib/navigation/items.ts:31`, `cotizaciones/*/page.tsx`, `QuotationItemsSection.tsx`. | — | B1 |
| E3 | ~~Folios CC/CP fuera~~ **(descartado)** (`cuentas_cobrar.folio`, `cuentas_pagar.folio`, `folio_contadores`, `generate_folio_cc/cp`, `siguiente_folio`, 2 triggers). La columna "Folio" de Cuentas y el Dashboard muestran el **folio del proyecto/cotización** (SH…), no el CC/CP; el detalle titula con el id del proyecto. Solo los usan la búsqueda `ILIKE` de `buscar_cuentas_*` y un respaldo en la ruta de carpeta de Drive de complementos (`cuenta.folio \|\| cotizacion_id`). | `Conceptos.tsx:133`, `DetalleConcepto.tsx:38`, `dashboard/page.tsx`, `subir-complemento/route.ts:88`. | — | **Descartado** (2026-10-01): los folios CC/CP se usan fuera de la app (contador, facturas, proveedores). |
| E4 | ~~Unificar `bulk_import_operations` y `pago_operations`~~ **(descartado en v8, J9)** en una tabla `operaciones` (`operation_id`, `dominio`, `entidad_id`, `result`). Matiz a A8: la capa HTTP (`idempotency_keys`) sigue aparte, pero estas dos son **la misma capa** (resultado guardado dentro de la transacción) con la misma forma; hoy son dos tablas por historia, no por diseño. | Definiciones en `20260909_idempotency_keys.sql`/`20260912_*`. | — | **Descartado** (2026-10-01): obligaba a reescribir `bulk_replace_items_cotizacion` (autosave colaborativo) y `registrar_pago_cuenta_cobrar` solo para ahorrar una tabla con 8 y 0 filas en prod. |

### Se evaluaron y se descartan (con motivo)

| Candidato | Por qué no |
|---|---|
| Meter `cuentas_cobrar` en `cotizaciones` (es 1:1 con la cotización aprobada) | Distinto patrón de escritura: `cotizaciones` se edita en colaboración con `revision` y conflictos por campo (decisión 002); la cobranza escribe en otro momento y por RPCs de dinero. Separar 1:1 por ciclo de vida es partición vertical correcta. |
| Meter `cuentas_pagar` en `items_cotizacion` (1:1 con renglón aprobado) | Mezcla documento de venta con libro de cuentas por pagar; el renglón se recrea en `bulk_replace` y el libro debe ser inmutable y auditable. Tras B5 `cuentas_pagar` ya queda delgada (llave, grupo, monto, desglose de pago). |
| Una tabla genérica de archivos (`documentos_cuentas_*`, `proveedor_documentos`, `proyecto_documentos`) | Requiere llave polimórfica (sin FK real): antipatrón; se pierde la integridad que hoy dan las FKs y los `CHECK` por tipo. |
| Una tabla "terceros" para clientes y proveedores | Atributos y ciclo distintos (portal con contraseña, régimen, banco, alias, match). |
| Bitácora genérica para `historial_cambios_responsable_item` y `cuentas_correcciones` | `cuentas_correcciones` exige una reapertura activa (FK); son 6 filas con dos lectores. Ganancia mínima. |
| `cotizacion_folio_reservations` dentro de `folio_contadores` | Las reservas con expiración sostienen la vista previa del folio al crear; con E3 `folio_contadores` desaparece de todos modos. |
| `cuentas_reaperturas` + `cuentas_correcciones` | Relación padre-hijo real (una reapertura agrupa varias correcciones). |
| `tipos_proyecto` y sus dos tablas hijas | Configuración del módulo de Proyectos (D4). |
| `productos` + `service_templates` | Catálogo de renglones vs paquetes con nombre; distinto uso. |
| `gastos_fijos`, `rate_limits`, `usuarios` | Una responsabilidad cada una, sin duplicación. |

**Nota (D4):** con Planeación fuera, la integración con Google Calendar
(`lib/integrations/google/calendar.ts`, `cotizaciones.calendar_event_id`, 0
filas) se queda sin uso activo. Se **conserva** para el diseño de Proyectos
(ROADMAP: "Google Calendar desde Proyectos"); se decide ahí.

## Auditoría final 2 (v4 → v5, 2026-10-01)

Tercera revisión (desarrollo + datos), ahora con estadísticas reales de uso
(`pg_stat_statements` y `pg_stat_user_tables` de test desde 2026-08-25,
advisors de Supabase) y el plan de la organización. **Veredicto: el v4 era
implementable, pero dejaba fuera la mejora de mayor impacto (índices), tenía
tres choques con la regla "una reescritura por función" y dos huecos
operativos.** v5 los corrige.

| # | Tipo | Hallazgo | Evidencia | En v5 |
|---|---|---|---|---|
| G1 | **Rendimiento (mayor impacto)** | **`items_cotizacion` solo tiene el índice de la PK.** Cada lectura o guardado de una cotización recorre la tabla completa. Igual con `cuentas_pagar` por `cotizacion_id` (el único índice es parcial `WHERE item_id IS NOT NULL`) y `responsable_id`, `items_cotizacion.responsable_id`, y `cotizaciones.es_complementaria_de` (7 funciones lo filtran, sin índice). | Test: `items_cotizacion` 412,578 lecturas completas / 2,681 M filas leídas; `cotizaciones` 6.5 M / 13,963 M; `cuentas_pagar` 847 K / 8,594 M. Advisor `unindexed_foreign_keys` (10). | **B0**: índices faltantes, validados con `EXPLAIN` de las 10 consultas más caras. Aditivo, sin riesgo. Es la palanca gratuita más fuerte contra #107 (D7): menos CPU por petición en Micro. |
| G2 | Rendimiento | El autosave de clientes busca por `nombre` exacto sin índice: 27,360 llamadas, 24.6 ms cada una, en cada guardado de cotización. | `pg_stat_statements`. | B3: índice único `lower(trim(nombre))` (F6) **y** la consulta del autosave usa esa misma expresión. |
| G3 | Rendimiento | Políticas RLS que re-evalúan `auth.*()`/`current_setting()` por fila: `usuarios` y las 2 de presencia en `realtime.messages` (colaboración en cotizaciones). | Advisor `auth_rls_initplan`. | B3: envolver en `(select …)`; validar con los specs de colaboración. |
| G4 | Orden | v4 reescribía funciones dos veces: `item_id` → `uuid` en B3 rompe `approve_cotizacion` y `reasignar_responsable_cuenta_pagar` (comparan `uuid = text`), que B5 vuelve a reescribir; `operaciones` (E4) en B3 tocaba las RPCs de pago que B5 reescribe; borrar las tablas de Planeación en B1 obliga a reescribir `cancel_cotizacion`, que B5 reescribe. | `pg_get_functiondef`. | `item_id`, E4 y el borrado de tablas de Planeación se mueven al bloque que ya reescribe esas funciones. B1 solo quita código, UI y permisos. |
| G5 | Riesgo | `cotizaciones.fecha_entrega` → `date` toca `save_cotizacion` y `patch_cotizacion_general`, el modelo de conflictos por campo (002) con sus arreglos de nulo vs vacío; un `''` desde la UI fallaría el cast. | 10 funciones mencionan `fecha_entrega`. | Solo `proyectos.fecha_entrega` → `date` (lo operativo; Cuentas lo usa, D12). La cotización (snapshot del PDF, D5) sigue `text` con `CHECK` de formato `AAAA-MM-DD` o nulo, y `save_cotizacion` normaliza `''` → `NULL`. Mismo beneficio, sin tocar el modelo de conflictos. |
| G6 | Revisión | B5 (v4) era un PR P0 enorme: ~20 funciones, cambios de tipo, vista, borrados. Difícil de revisar y sin punto de control intermedio en prod. | — | Se parte en **B5a (escrituras de dinero)** y **B5b (lecturas, copias y borrado)**, con conjuntos de funciones **disjuntos**: cada función se sigue reescribiendo una sola vez. |
| G7 | **Operación** | **La organización de Supabase está en plan Free:** no hay respaldos diarios restaurables ni PITR, y un proyecto inactivo se pausa (por eso existe `/api/keep-alive`). El "respaldo" de B0 en v4 suponía algo que no existe. | `get_organization` → `plan: free`. | B0 y antes de B2/B5: `supabase db dump` manual (paso a paso para ti). B6: decidir la estrategia de respaldo **antes de salir a uso real** (con dinero real, Free sin respaldos es un riesgo P0 fuera de esta iniciativa). |
| G8 | Operación | F2 manda las pruebas manuales al Preview, pero **Drive está apagado en Preview**: no se pueden probar facturas, comprobantes ni complementos ahí. | `docs/ACTIVE_WORK.md` → deuda "Drive en Preview". | B0: activar Drive en Preview con la cuenta de pruebas (gratis; pasos para ti en Vercel). |
| G9 | Limpieza | `buscar_cuentas_pagar` ya no la llama nadie (la reemplazó `buscar_cuentas_pagar_grupos`). | Ninguna referencia en código ni en otras funciones. | Se borra en B5b. |
| G10 | Índices | 37 índices sin uso según el advisor de prod (prod casi no tiene tráfico: no es evidencia). | Advisor `unused_index`. | Solo se borran los que tampoco se usan en **test** con carga real (`pg_stat_user_indexes`), más el duplicado `idx_cotizaciones_id` (F7). |

## Auditoría final 3 (v5 → v6, 2026-10-01): "sin perder funciones"

Cuarta revisión, enfocada en que **ninguna función existente se pierda** y en
simplificar la ejecución. **Veredicto: v5 estaba listo salvo tres cosas que
podían costar funciones o datos.** v6 las corrige. No quedan simplificaciones
de tablas con ganancia real: el barrido de columnas restantes (todas las de las
33 tablas) encontró lectores para cada una.

| # | Tipo | Hallazgo | Evidencia | En v6 |
|---|---|---|---|---|
| H1 | **Protección de funciones** | Faltaba un **oráculo de "antes = después"**. Las guardas prueban que el dinero cuadra, no que cada pantalla muestre lo mismo. | — | B0 guarda una **foto dorada** de las salidas de todas las RPCs de lectura (`cuentas_periodo`/`resumen`/`avisos_items`/`opciones`/`orden_candidatos`, `buscar_*`, `dashboard_*`, `proveedor_documentos_resumen`) sobre el dataset de test, por cada año. Tras cada bloque se compara: **diferencia 0**, salvo cambios intencionales listados en el PR (formato de `timestamptz`). El re-sembrado de test se hace **después** de la última comparación de B5b. |
| H2 | **Orden** | B4 (un solo motor) **destruía el mejor oráculo antes del cambio más riesgoso**: el test de paridad SQL vs TS (`cuentas-paridad-sql.spec.ts`) detecta cualquier error al reescribir `cuentas_conceptos` en B5b. Además, el ahorro que v2 le atribuía era menor: el motor TS consume la salida de `cuentas_por_proyecto`, cuyo contrato B5b conserva. | `periodo-crudo.ts`, `periodo-rpc.ts`. | B4 pasa **después de B5b** (ahora B6) y queda como mejora independiente: si se detiene ahí, la iniciativa ya cumplió su meta. |
| H3 | **Riesgo de datos** | **Drive busca carpetas por nombre** (`ensureFolderPath`: `name='…' and '<padre>' in parents`). Al reiniciar folios, la cotización real SH001 y los complementos de `/Por Cobrar/CC-2026-001` caerían **en las carpetas de prueba** con el mismo nombre. | `lib/integrations/google/drive.ts:259`; rutas `subir-factura`, `subir-complemento`, `registrar-pago`. | Limpiar Drive de prod es **condición obligatoria antes de correr el reinicio** (B2), no un pendiente opcional, y se repite en el checklist de salida a uso real. |
| H4 | Simplificación | B1 (retiros) y B3 (integridad) son de bajo riesgo, no tocan funciones de Cuentas y no dependen entre sí. | — | Se juntan en un PR. El script de reinicio viaja en el PR de B0 y se ejecuta entre B0 y ese PR. **6 PRs en vez de 7.** |
| H5 | Verificación | Funciones que el plan quita o cambia de forma, revisadas una por una contra lo que hoy usa la app. | Barrido de columnas y RPCs. | Sin pérdida: Sheets y Planeación (retiros aprobados, D2/D8); plantillas siguen accesibles (E2); folios CC/CP se quedan (E3); Calendar se conserva (D4); historial de proveedores da los mismos números (vista, A11); el Dashboard y los KPIs conservan el desglose por renglón (A1); el portal sigue mostrando descripción y montos (join, A10); "Sin asignar" sigue reasignable (A9). |

## Auditoría final 4 (v6 → v7, 2026-10-01): coherencia y ejecutabilidad

Quinta revisión. Ya no aparecen cambios de modelo: los hallazgos son de
**ejecución**, cosas que habrían frenado un bloque a la mitad, y contradicciones
que dejaron los parches anteriores en este documento. Corregidos en v7.

| # | Hallazgo | Por qué importa | En v7 |
|---|---|---|---|
| I1 | **La BD de test no cumple las restricciones nuevas.** Tiene 5 sueltas con proveedor, 2 márgenes viejos y 2 cobros con total ≠ cotización; y no se reinicia. | El `CHECK` de margen (B1+B3) y la restricción "proveedor ⇒ grupo" (B5a) fallarían al aplicarse en test. | B0 corrige esas 9 filas en test con las RPCs existentes (`reconcile_cuenta_pagar_grupo`, recálculo de margen) **antes** de la foto dorada y de la línea base de guardas. No se borra nada. |
| I2 | **La foto dorada no era estable.** `live` escribe y limpia datos en test en cada corrida, y el estado `VENCIDO` cambia con la fecha. | Dos fotos del mismo código saldrían distintas: falsos positivos. | La foto se limita a los proyectos del dataset de carga (excluye lo que crean los tests) y fija `p_hoy` en las RPCs que lo aceptan (`cuentas_resumen`, `cuentas_avisos_items`, `cuentas_periodo`); las fechas relativas se comparan contra esa fecha fija. Tras re-sembrar (B5b) se toma una foto nueva para B6. |
| I3 | "Migración de reversa solo test" para el frente 2 contradice la regla de migraciones numeradas: `20261009`/`20261010` **no están en `main`** (solo en la rama del PR #100). | Una migración numerada en `main` correría en `fresh-db` y en prod sobre objetos que no existen. | Script SQL aplicado solo a test y documentado en `docs/archive/frente2-cuentas-conceptos-pausado.md`; no es migración. |
| I4 | El reinicio (B2) corre **antes** de que se borren Planeación y Sheets, pero su lista no las incluía. | Quedarían datos de prueba de Planeación en prod hasta B5b. | B2 también vacía `planeacion_pendientes`, `planeacion_event_notas`, `extraction_logs` y `sheets_sync_status`. |
| I5 | Contradicciones del propio plan: "Sin cambios: … UI, Planeación"; "fechas como `date`" (solo cambia la del proyecto, G5); "un solo motor" como resultado garantizado (B6 es opcional). | Un plan aprobado que se contradice genera dudas en la sesión que lo ejecuta. | Texto corregido en "Resultado esperado". |

## Auditoría final 5 (v7 → v8, 2026-10-01): oráculo, orden y simplificación

Sexta revisión (desarrollo + datos), contra `pg_get_functiondef` de prod, las
BD de test y prod y el código. **Veredicto: el modelo de v7 era correcto, pero
la ejecución tenía cuatro fallas que habrían cegado el oráculo "antes =
después" o roto funciones en silencio.** v8 las corrige y aplica tres
simplificaciones aprobadas por el usuario (J5, J6, J9).

| # | Sev. | Hallazgo | Evidencia | En v8 |
|---|---|---|---|---|
| J1 | **P0** | **En test las copias no coinciden con sus dueños.** De 10,990 `cuentas_pagar` con proveedor, 10,975 tienen `responsable_nombre` y 10,988 contacto distinto a `proveedores`; 10,979 `items_cotizacion.responsable_nombre` igual. Prod: 0. Al cambiar el lector en B5b, la foto dorada marcaría ~11 K diferencias "esperadas" y taparía las reales. | Consultas en test y prod. | B0 (I1) alinea las copias con `proveedores` **antes** de la foto dorada, y busca la causa (generador de `seed-volumen` o specs que renombran proveedores) para que no se repita. |
| J2 | **P0** | **La foto dorada no era determinista.** `cuentas_periodo` no recibe `p_hoy` (recibe `jsonb`); 10 funciones usan `hoy_cdmx()` sin parámetro (`cuentas_periodo`, `cuentas_opciones`, `cuentas_orden_candidatos`, `buscar_ordenes_pago`, `cuentas_anios`…), y `buscar_cuentas_cobrar` **escribe** al leer (`sync_estados_cuentas_cobrar_vencidas`). | `pg_get_functiondef`. | `hoy_cdmx()` respeta `current_setting('app.hoy', true)` (sin efecto si no está puesto). La foto se toma como SQL en una transacción con `set_config('app.hoy', …, true)`; ninguna firma cambia. Corrige I2. |
| J3 | P1 | **Quedaban funciones con doble reescritura.** `corregir_proveedor_cuenta_pagar` (B5a) llama a `reasignar_responsable_cuenta_pagar` (B5b) con contacto y nombre; `generar_orden_pago` (B5a) copia `cp.responsable_nombre` al snapshot de la orden. | `pg_get_functiondef`. | `corregir_proveedor_cuenta_pagar` pasa a B5b. Regla: toda función reescrita en B5a ya lee nombre/contacto/descripción del dueño, nunca de la copia. |
| J4 | P1 | **`DROP COLUMN` no valida cuerpos plpgsql**: una función que aún lee la columna falla recién en runtime. El mapa por texto puede perder SQL dinámico. | Comportamiento de Postgres. | `plpgsql_check` (disponible en Supabase, gratis) en test y en `fresh-db`: 0 errores sobre todas las funciones de `public` tras cada migración. `index_advisor` respalda los índices de B0 junto a `EXPLAIN`. |
| J5 | Simplifica | `GET /api/cuentas-cobrar` y `GET /api/cuentas-pagar` (`buscar_cuentas_cobrar`, `buscar_cuentas_pagar_grupos`) no tienen consumidor en la UI desde el rediseño de Cuentas; solo `tests/e2e/live/basic.spec.ts`. Uso externo descartado por el usuario. | `grep` en `app/`, `components/`, `hooks/`. | B5b los **retira** en vez de reescribirlos; `basic.spec.ts` pasa a `cuentas_periodo`/detalle. |
| J6 | Mejora real | **`VENCIDO` guardado es estado derivado duplicado.** Lo escriben el cron y una lectura; Cuentas lo deriva por fecha (`cuentas_conceptos`) y el Dashboard solo distingue `PAGADO`. Además pisa `PARCIALMENTE_PAGADO`/`FACTURADO`. | `dashboard_kpis_cuentas`, `lib/shared/cuentas/status.ts`. | `cuentas_cobrar.estado` guarda solo hechos; "vencido" se deriva al leer. Sale `sync_estados_cuentas_cobrar_vencidas` (cron y lectura); `cuentas_cobrar_estado_calculado` y `subir-factura` dejan de producir `VENCIDO`; `CHECK` sin `VENCIDO`. Bloque B5b. |
| J7 | P1 | **Sheets puede reimportar datos de prueba tras el reinicio.** El botón "Sheets → Supabase" (`sync-up`, sin RPC, H11) sigue vivo entre B2 y B1+B3. | `AdminSheets.tsx`, `app/api/integrations/sheets/sync-up/route.ts`. | B0 retira `sync-up` (ruta y botón); el resto de Sheets sigue en B1+B3. |
| J8 | P1 | **I1 incompleto y FK débil.** Test tiene además 3 `cuentas_pagar` sin `item_id` (perderían su descripción) y 1 con `x_pagar ≠ item.x_pagar × cantidad`. | Consultas en test. | I1 cubre 13 filas. `cuentas_pagar.item_id` → `uuid NOT NULL` + FK (toda cuenta nace de un renglón, incluidas las sueltas). |
| J9 | Simplifica | E4 reescribía `bulk_replace_items_cotizacion` (autosave colaborativo) y `registrar_pago_cuenta_cobrar` solo por una tabla menos. | Prod: 8 y 0 filas. | **E4 fuera** (aprobado). 40 → 34 tablas. |
| J10 | P2 | `items_cotizacion.responsable_nombre` sigue siendo copia de `proveedores.nombre` (hoja de llamado, autosave). | `hoja-llamado-pdf.ts`. | Se documenta como parte de lo emitido en la cotización (D5); guarda solo informativa. |
| J11 | P2 | Código muerto (`createCuentaCobrar`, `getCuentasPagarPorGrupo`); `ANTHROPIC_API_KEY` la usa también el Portal (`document-parser.ts`); `check-schema-parity.mjs` solo compara nombres de migración. | `grep`. | Muertos fuera en B5b; la llave se conserva al retirar Planeación; "test = prod" extiende `check-schema-parity.mjs` (columnas, índices, `md5(pg_get_functiondef)`), no un script nuevo. |

**Verificado sin pérdida:** renglones inmutables tras aprobar (las RPCs de
items devuelven `estado_invalido`), así que leer descripción/cantidad del
renglón es seguro; los PDFs de órdenes viven en Drive y no se regeneran, y el
detalle ya prefiere el contacto de `proveedores`; la publicación de Realtime
está vacía (colaboración por Broadcast); el folio SH sale de `max()`, así que
el reinicio da SH001; ningún usuario tiene la sección `planeacion`; test sin
clientes duplicados, sin fechas mal formadas y sin cotización ≠ proyecto.

**Conclusión del equipo (v7):** las auditorías ya dan rendimientos decrecientes;
v7 no cambia el modelo respecto a v6. Lo que falte se verá con más precisión
**al abrir cada bloque** (la skill `serenata-iniciar-fase` audita el código real
antes de tocarlo), no con otra revisión en papel.


## Auditoría final 6 (v8 → v9, 2026-10-01): dueño único de verdad, nomenclatura y velocidad real

Séptima revisión (desarrollo + datos) contra `main` (`4dd6098`),
`pg_get_functiondef` de prod, `pg_stat_statements` de test y prod, índices y
datos. **Veredicto: el modelo de v8 era correcto, pero un P0 habría roto las
aprobaciones en prod entre B5a y B5b, F8 revertía un arreglo deliberado de
folios, y quedaban copias de datos y caminos lentos fuera del plan.** Con las
decisiones D12–D14 del usuario se corrige en v9.

| # | Sev. | Hallazgo | Evidencia | En v9 |
|---|---|---|---|---|
| K1 | **P0** | El `CHECK` "proveedor ⇒ grupo" de B5a rompe `approve_cotizacion` (inserta la cuenta con `grupo_id` nulo y luego reconcilia), `reasignar_responsable_cuenta_pagar` y `reconcile_cuenta_pagar_grupo` (pone `grupo_id = NULL` al mover). Un `CHECK` no se difiere: entre B5a y B5b ninguna cotización con proveedor se aprobaría. `reconcile_cuenta_pagar_grupo` y el trigger `cuentas_pagar_recalcular_grupo` no estaban en ningún bloque. | `pg_get_functiondef` de prod. | La invariante va en B5b como **constraint trigger diferido** (se valida al `COMMIT`); `reconcile` y el trigger entran a B5b. |
| K2 | P1 | F8 purgaba "reservas de folio vencidas": las 2,316 de test están **consumidas** y son la lápida que pidió `20260916_fix_folio_reservation_survives_deletion.sql`. Las no consumidas ya las borra `reserve_next_cotizacion_folio` en cada llamada. | Conteo por `consumed_at`/`expires_at` en test. | Fuera la purga de reservas; se queda la de `pago_operations`/`bulk_import_operations`. |
| K3 | P1 | J2 dejaba un gancho de pruebas permanente (`app.hoy`) en `hoy_cdmx()` de prod. `pg_stat_statements` acumula desde agosto (la consulta más cara de test es una firma vieja de `cuentas_por_proyecto()`). | — | La foto dorada reemplaza `hoy_cdmx()` dentro de su transacción y hace `ROLLBACK` (DDL transaccional): prod sin cambios. `pg_stat_statements_reset()` en la línea base de B0. |
| K4 | P1 | Guarda "renglón aprobado ⇔ cuenta por pagar" mal definida: `approve` solo crea cuenta si `x_pagar > 0`. | `approve_cotizacion`. | La guarda usa la misma condición. |
| K5 | P1 | `clientes.proyectos` alimenta las sugerencias de proyecto del formulario (`/api/clientes?q=` trae **todos** los clientes); el autosave de cliente son 3 viajes y se reescribía dos veces (B3 y B5b). Ninguna función SQL lee esa columna. | `useQuotationForm.ts`, `persistence.ts`. | Pasa a B1+B3: autosave en un `INSERT … ON CONFLICT`; sugerencias por una consulta agregada por `cliente_id`. |
| K6 | P1 | En prod ninguna consulta de la app pasa de 5 ms: los índices no cambian la velocidad que se siente hoy (sí test/CI y el crecimiento). Lo que sí se siente: `autosaveProductos` hace un upsert **por renglón, en serie**, esperado por `POST /api/cotizaciones` y `PUT /api/cotizaciones/:id`; el cliente, 3 viajes más. | `pg_stat_statements` de prod; rutas. | B1+B3: un solo upsert y `after()`; medir p50 de esas rutas antes/después. |
| K7 | P1 | `proyectos.cliente` (texto, no editable) copia `clientes.nombre`: `cliente_id` lleno al 100 % y 1/28 ya difiere; un renombre en `/clientes` no llega a Proyectos ni Cuentas. | Consulta en prod; `ProyectoUpdateSchema`. | **D12:** sale; se lee por `cliente_id`. |
| K8 | P1 | `x_pagar` significa Costo Unitario en `items_cotizacion` y Costo Total en `cuentas_pagar`; `productos.x_pagar_sugerido` y las plantillas ("X pagar") igual. De 16 funciones que leen `cuentas_pagar.x_pagar`, 14 ya se reescribían. | `approve_cotizacion`; 66 archivos. | **D13:** nomenclatura de la 006 en BD, API y UI, con columna puente (sin reescrituras dobles). |
| K9 | P1 | `lib/integrations/google/calendar.ts` sin una sola llamada, sin permiso de Calendar en OAuth, `cotizaciones.calendar_event_id` en 0 filas y sin lectores SQL. | `grep`; `auth.ts`. | **D14:** se retira (B1+B3), junto con el permiso `spreadsheets`. |
| K10 | P1 | F12 incompleto: `/api/keep-alive` corre el sync-down de Sheets; faltaban su test, `app/api/internal/env-check`, `isSheetsConfigured`, `lib/integrations/sheets/schema.ts` y los permisos OAuth. | `grep`. | Lista completa en B1+B3. |
| K11 | P1 | La vista `historial_responsable` tiene regla concreta: el snapshot solo se genera al cerrar y `proyectos.fecha_cierre_real` nunca se borra. Prod: 0 renglones aprobados con nombre sin id. | `cierre-proyecto.ts`. | Vista filtra `fecha_cierre_real IS NOT NULL`, sin resolución por nombre; sale el rollback manual no atómico de `projects/service.ts`. |
| K12 | P1 | Herramientas temporales sin destino (foto dorada, mapa, guarda "copia = dueño"). | — | B7 define cuáles quedan (guardas → `auditar_consistencia()`, `plpgsql_check`, paridad de esquema) y borra las demás. |
| K13 | P2 | `PLAN.md` de 557 líneas, ~60 % historia con puntos tachados. | — | Historia a este archivo; el plan queda ejecutable. |
| K14 | P2 | Tras J8 sobran el único parcial `(cotizacion_id, item_id)` y `idx_cuentas_pagar_item_id`; el portal ordena por fecha. | `pg_indexes`. | `UNIQUE(item_id)` con `ON DELETE RESTRICT`; índice `(responsable_id, created_at)`. |

**Además, al aplicar D12 se encontró:** `items_cotizacion.responsable_nombre`
es copia pura (la UI elige proveedor por id y el nombre viaja en un `hidden`;
prod: 0 renglones con nombre sin id, 0 distintos) → revierte J10.
`cuentas_cobrar.estado` es función pura de montos y factura
(`subir-factura` ya lo calcula así) → columna generada. Llaves repetidas para
índices (`cuentas_pagar.cotizacion_id/proyecto_id/responsable_id`,
`cuentas_cobrar.cliente_id`) se quedan solo con FK compuesta que impida
divergir.

**Revisado y se queda:** folio SH por `max()` (recorre la tabla, pero con el
volumen real del negocio no se nota); `buscar_cotizaciones` volátil (solo se
corrige si un bloque la toca).

## Auditoría final 7 (v9 → v10, 2026-10-01): estado por RPC, cobro y un solo `cliente_id`

Octava revisión (desarrollo + datos) contra `main` (`e1a90d5`),
`pg_get_functiondef` de prod y el código. **Veredicto: el modelo de v9 era
correcto; quedaban dos huecos de integridad existentes que el plan no cerraba,
dos detalles que habrían frenado un bloque y tres simplificaciones.** Con las
decisiones D15–D17 del usuario se corrige en v10.

| # | Sev. | Hallazgo | Evidencia | En v10 |
|---|---|---|---|---|
| L1 | **P1** | `PUT /api/cotizaciones/:id` acepta `estado` (incluso `APROBADA`, sin crear cuentas) y `save_cotizacion` no revisa el estado: borra o reescribe renglones de una aprobada. La UI lo oculta, el servidor no. Dos vías para emitir (PUT con `EMITIDA` y `emitir_cotizacion`). | `schemas.ts` (`CotizacionBaseSchema.estado`), `useNuevaCotizacionPage.ts`, `save_cotizacion` de prod. | B5c: `save_cotizacion`/`patch_cotizacion_general` rechazan fuera de `BORRADOR`/`EMITIDA` y no escriben `estado`; `estado` sale del schema; emitir solo por RPC. |
| L2 | **P1** | Dos reglas del estado del cobro: `registrar_pago_cuenta_cobrar` da `PARCIALMENTE_PAGADO` sin factura; `cuentas_cobrar_estado_calculado` (anular, corregir) da `FACTURA_PENDIENTE` y lee su propio `estado` (no derivable como columna generada). `baja_documento_cobro` no limpia `fecha_factura`. | `pg_get_functiondef` de prod. | **D15:** fórmula única como columna generada; quitar la factura limpia `fecha_factura`. |
| L3 | P1 | Tres copias de `cliente_id` (`cotizaciones`, `proyectos`, `cuentas_cobrar`), iguales hoy; el plan añadía FK compuesta + índice único solo para sostener la copia. | Prod: 0 desfases; solo `cuentas_por_proyecto` lee `cuentas_cobrar.cliente_id` (más `buscar_cuentas_cobrar`, que sale). | **D16:** uno solo en `cotizaciones`, congelado al aprobar. |
| L4 | P1 | El upsert de supabase-js no acepta un índice de expresión (`lower(trim(nombre))`); el `cliente_id` se escribe en un `UPDATE` aparte tras `save_cotizacion`, sin `revision`. | `persistence.ts`. | Columna generada `nombre_clave` con `UNIQUE`; `cliente_id` resuelto antes y dentro del guardado. |
| L5 | P1 | B5a no listaba las rutas y UI de pago suelto (`/api/cuentas-pagar/[id]/subir-factura`, `registrar-pago`, `registrar-pago/estado`, rama suelta de `useDetalle.ts`). | `app/api/cuentas-pagar/`. | Se retiran en B5a con sus tests. |
| L6 | P1 | La vista de historial sin filtro sumaría complementarias en borrador o canceladas. | `generarHistorialProyecto`. | Solo `APROBADA`, misma normalización de rol; snapshot → vivo como diferencia permitida. |
| L7 | Velocidad | El navegador relee la cotización con `GET` tras el `PUT` (que ya la devuelve) y tras aprobar. | `quotation-service.ts`. | B1+B3: usar la respuesta; medir p50 desde el navegador. |
| L8 | Deuda | B6 "opcional" dejaba dos motores y obligaba a hacer D13 en ambos. | — | **D17:** B6 obligatorio; B5b/B5c solo cambios mecánicos en el TS de Cuentas. |

**Verificado sin problema:** columnas puente seguras (ninguna función inserta
en `items_cotizacion`/`cuentas_pagar` sin lista de columnas ni con
`populate_record`; el TS solo escribe `notas`, `responsable_*`,
`fecha_factura`); nadie cambia `responsable_id`/`proyecto_id` de un grupo
(FK compuesta viable); prod sin cotizaciones sin `cliente_id` ni
complementarias con cliente distinto a su principal.
