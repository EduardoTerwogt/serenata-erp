# Plan de la iniciativa activa

**Estado:** Plan v4 — "Simplificación del modelo de datos" (2026-10-01; v4 tras exploración adicional; 1 confirmación para E3).

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Rediseño de la sección Cuentas" (2026-09-26)
— historia en `docs/archive/rediseno-cuentas.md`.

**Iniciativa en pausa:** "Frente 2 — `cuentas_conceptos` sin recálculo por
RPC" (epic #110, PR #100, rama `claude/wonderful-hamilton-260e2w`) — estado exacto y
cómo retomarla en `docs/archive/frente2-cuentas-conceptos-pausado.md`.

---

# Simplificación del modelo de datos

**Epic en GitHub:** #109. Fase 2: #105 · Fase 3: #106 · deuda relacionada: #108.

## Origen

El 2026-10-01 el usuario revisó el Schema Visualizer de Supabase y percibió
**demasiadas tablas**, datos repetidos e información dispersa que podría vivir
junta. Pidió analizarlo como iniciativa (análisis y plan en una sesión,
implementación en otra) con una condición dura: **hoy muchos puntos de la app
están conectados a la BD, nada debe romperse ni quedar suelto.**

## Qué se sabe hoy

- Inventario (fase 1) y matriz con evidencia (fase 2):
  `docs/inventario-tablas.md`.
- Alternativas y recomendación (fase 3): `docs/decisions/020-simplificacion-modelo-datos.md`
  (Propuesta). Recomendada: **B** — un dueño por dato + el grupo como única
  obligación de pago.
- Conclusión central: **el problema es estado duplicado, no número de
  tablas.** 40 → 32 tablas (plan v4),
  ~20 columnas copiadas o derivadas menos, y desaparece la rama "suelta" de
  `cuentas_pagar` en ~10 RPCs.
- Evidencia de que el diseño actual ya deja divergir datos: contacto de
  proveedor distinto en 10 de 82 cuentas por pagar; 13 renglones con margen de
  la fórmula vieja (incluidos 3 aprobados que alimentan Cuentas); 2 proyectos
  con datos distintos a su cotización; `cuentas_pagar.item_id` sin FK.
- **Hallazgo bloqueante (H11):** Sheets → Supabase (`sync-up`, botón en Admin)
  escribe directo sobre cotizaciones, proyectos y cuentas sin RPC. Rompe con
  cualquier cambio de columnas y hoy ya puede saltarse invariantes.

## Objetivo

Que cada dato tenga **un solo dueño** (los demás lo leen por llave o lo
congelan a propósito como snapshot documentado), sin perder invariantes de
dinero e impuestos y sin romper ninguna pantalla, RPC, test, espejo de Sheets
ni el portal de proveedores.

## Fuera de alcance

- Cambiar reglas de negocio (`docs/decisions/006`).
- Unificar cobrar y pagar en tablas únicas (ADR 020, alternativa C).
- Rediseñar pantallas. Solo cambia lo que la UI lee por debajo.
- Tareas, cronograma y documentos de proyecto (D4): se conservan intactos.
- Doble modelo de estado de `proyectos` (F14): se resuelve al diseñar Proyectos.

## Decisiones del usuario (2026-10-01)

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Alternativa | **B** (ADR 020). |
| D2 | Sheets | No se usa: **se retira por completo** (sync-up, sync-down, setup, status, `sheets_sync_status`). |
| D3 | Datos de prueba | **Se limpian por completo** (SH072/SH080 ya verificados, #99). |
| D4 | Tareas y documentos de proyecto | **Se conservan**; el módulo de Proyectos sigue en diseño. |
| D5 | Proyecto vs cotización | La cotización conserva lo emitido en el PDF; lo operativo vive en `proyectos`. |
| D6 | Frente 2 | En pausa hasta cerrar esta iniciativa. |
| D7 | Cómputo de Supabase | **No se sube** si genera costo extra. Test y prod siguen en Micro. |
| D8 | Planeación | **El módulo se retira completo** (2026-10-01): tablas, rutas, UI, permisos y tests. |

## Fases

| Fase | Qué | Salida | Estado |
|---|---|---|---|
| 1. Inventario | Tablas, columnas, quién las toca | `docs/inventario-tablas.md` | Hecha |
| 2. Uso real y riesgo | Evidencia y matriz | `docs/inventario-tablas.md` → "Fase 2" | Hecha |
| 3. Propuestas | 3 alternativas | ADR 020 | Hecha |
| 4. Decisión y plan | D1–D7, dos auditorías, plan v3 | Este archivo | **Listo para aprobar** |
| 5. Ejecución | B0–B6 | Un PR por bloque | Pendiente |

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
| E3 | **Folios CC/CP fuera** (`cuentas_cobrar.folio`, `cuentas_pagar.folio`, `folio_contadores`, `generate_folio_cc/cp`, `siguiente_folio`, 2 triggers). La columna "Folio" de Cuentas y el Dashboard muestran el **folio del proyecto/cotización** (SH…), no el CC/CP; el detalle titula con el id del proyecto. Solo los usan la búsqueda `ILIKE` de `buscar_cuentas_*` y un respaldo en la ruta de carpeta de Drive de complementos (`cuenta.folio \|\| cotizacion_id`). | `Conceptos.tsx:133`, `DetalleConcepto.tsx:38`, `dashboard/page.tsx`, `subir-complemento/route.ts:88`. | −1 | B5 (**requiere confirmación 4**) |
| E4 | **Unificar `bulk_import_operations` y `pago_operations`** en una tabla `operaciones` (`operation_id`, `dominio`, `entidad_id`, `result`). Matiz a A8: la capa HTTP (`idempotency_keys`) sigue aparte, pero estas dos son **la misma capa** (resultado guardado dentro de la transacción) con la misma forma; hoy son dos tablas por historia, no por diseño. | Definiciones en `20260909_idempotency_keys.sql`/`20260912_*`. | −1 | B3 |

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

## Resultado esperado (v4)

- **40 → 32 tablas** (−20 %): salen `cliente_id_backfill_clasificacion`,
  `historial_responsable` (pasa a vista), `sheets_sync_status`,
  `planeacion_pendientes`, `planeacion_event_notas`, `extraction_logs`,
  `folio_contadores` (E3, si se confirma; si no, 33) y `bulk_import_operations`
  (absorbida en `operaciones`).
- **Un solo motor de reglas de Cuentas** (SQL), **una sola vía de pago** (el
  grupo), **cada dato con un dueño**:

| Dato | Dueño único | Deja de vivir en |
|---|---|---|
| Contacto y banco del proveedor | `proveedores` | `cuentas_pagar` |
| Descripción, cantidad, margen y proveedor del renglón | `items_cotizacion` | `cuentas_pagar` |
| Estado de pago | `cuentas_pagar_grupos` (+ desglose por renglón, A1) | columnas de la rama suelta |
| Cliente y nombre operativos | `proyectos` / `clientes` | texto en `cuentas_cobrar`, `historial_responsable`, `clientes.proyectos` |
| Lo emitido en el PDF | `cotizaciones` (D5) | — |
| Reglas de dinero de Cuentas | funciones SQL | `lib/shared/cuentas/concepto.ts` |
| Copia de consulta en Sheets | — | se retira (D2) |

- Además: fechas como `date` y `timestamptz` (sin errores de día por zona
  horaria), estados con `CHECK`, clientes sin duplicados, índices limpios,
  tablas de operación que ya no crecen sin límite y un chequeo diario de
  consistencia del dinero.
- Sin cambios: reglas de negocio (006), UI, Planeación, Portal, tareas y
  documentos de proyecto, cobrar/pagar separados, idempotencia en dos capas.

## Cómo se garantiza que nada se rompa

1. **Mapa de dependencias en cero** por nombre de columna antes de borrar
   cualquier cosa (A10): todo el repo + `pg_get_functiondef` + triggers +
   vistas + políticas + `pg_depend`.
2. **Guardas de consistencia en 0** en test y prod antes y después de cada
   migración (lista en B0).
3. **Funciones reescritas desde `pg_get_functiondef` de producción**, una vez
   cada una (A4).
4. **Test = prod** en esquema (B0) y un solo PR con cambios de BD a la vez (A3).
5. Por bloque: test → PR con `test`, `fresh-db`, `smoke-and-critical`, `live`
   verdes → prod el mismo día → guardas en 0. Migraciones de datos son no-op en
   BD vacía.
6. **Recorrido manual en el Preview** al cerrar B5: Cotizaciones (crear,
   emitir, aprobar, cancelar), Proyectos (editar, cerrar), Cuentas (cobro,
   factura de proveedor, orden, pago, anulación, reapertura, reasignar
   suelto), Portal, Proveedores (historial), Dashboard.
7. **Después de salir a uso real**, vuelve a ser obligatorio expandir y
   contraer en PRs separados (F3).

## Plan de ejecución (v4)

Un PR por bloque. Estimación: 5 sesiones.

### B0 — Red de seguridad y test = prod

- `scripts/db/guardas-modelo.sql`: Σ pagos vigentes = `monto_pagado` (cobros,
  grupos, Σ hijas = grupo); `grupo.monto_total = Σ x_pagar`;
  `cp.x_pagar = item.x_pagar × item.cantidad`; total de orden = Σ desglose;
  importe y margen por fórmula; `cuentas_cobrar.monto_total = cotización.total`;
  renglón aprobado ⇔ cuenta por pagar; cuenta con proveedor ⇒ grupo.
- `scripts/db/mapa-dependencias.mjs <tabla.columna>`.
- Test: retirar objetos del frente 2 (migración de reversa "solo test",
  anotada en `docs/archive/frente2-cuentas-conceptos-pausado.md`), comparar
  esquema con prod, `VACUUM ANALYZE` (F11).
- Línea base: guardas en ambos y latencia de `cuentas_periodo` en test.
- Respaldo de prod con `pg_dump` (gratis) antes de B2.

### B1 — Retirar Sheets y Planeación (D2, D8)

- Sheets: lista completa de F12; migración borra `sheets_sync_status` y sus 3 RPCs.
- Planeación: lista completa de E1; plantillas pasan a la sección
  `cotizaciones` (E2) **en el mismo PR**, antes de quitar `planeacion` de
  `AppSection`; migración borra las 3 tablas, el trigger y su función, y
  reescribe `cancel_cotizacion` (desde prod) sin la referencia.
- `docs/ROADMAP.md`, `ARCHITECTURE.md`, `CLAUDE.md` (encabezado: "extracción
  AI de eventos") al día.

### B2 — Reinicio de datos (D3)

- `scripts/db/reset-transaccional.sql`, idempotente. Se niega a correr si no
  recibe el ref del proyecto como confirmación explícita, y **se borra del
  repo el día de la salida a uso real** (protege contra correrlo por error
  con datos reales).
- Vacía: cotizaciones, renglones, reservas de folio, proyectos (y sus
  tareas/documentos, hoy en 0), todas las de Cuentas, órdenes, historiales,
  reaperturas, correcciones, idempotencia, rate limits; reinicia
  `folio_contadores` (si E3 no se aprueba).
- Conserva **solo `usuarios`** (confirmado 2026-10-01) más la configuración
  de sistema que siembra la migración `20260906_post_rename_fase52_proyectos_pm_schema.sql`
  (`tipos_proyecto` Grabación/Concierto/Diseño de Show, `tipo_proyecto_etapas`,
  `tipo_proyecto_tarea_default`): no son datos de prueba y sin ellas
  Proyectos no funciona. Se borran clientes, proveedores, productos,
  plantillas de servicios y gastos fijos.
- Folios: `folio_contadores` a 0 y reservas vacías → la siguiente cotización es
  SH001 y CC/CP empiezan en 1 (confirmado).
- **Solo producción.** La BD de test conserva su dataset de carga (2,203
  proyectos); en B5 se re-siembra con el mismo volumen (F10).
- Borra `cliente_id_backfill_clasificacion` (CSV a `docs/archive/`).
- Drive: paso a paso para ti (F13). Desde aquí, pruebas manuales en el Preview
  (F2).

### B3 — Integridad, tipos y operación

- `cuentas_pagar.item_id` → `uuid` + FK; quitar la búsqueda por descripción
  de `app/api/items/[id]/route.ts`; 
- `CHECK` de `importe`/`margen` con tolerancia de centavo (A6); `CHECK` de
  `cotizaciones.estado` y `.tipo` (F6).
- `clientes`: único por `lower(trim(nombre))` y autosave que lo respeta (F6).
- 13 columnas → `timestamptz`, revisando cada consumidor (F5).
- `bulk_import_operations` + `pago_operations` → `operaciones` (E4): las 3 RPCs de pago, `bulk_replace_items_cotizacion` y las 4 rutas `…/estado`.
- Índices: borrar `idx_cotizaciones_id`; GIN sin uso solo si el mapa da 0 (F7).
- `/api/keep-alive`: purga de reservas vencidas y operaciones > 30 días (F8).
- `COMMENT ON COLUMN` en ambos `x_pagar` (A7).

### B4 — Un solo motor de Cuentas (#108)

Derivación del proyecto seleccionado y del detalle a SQL; el test de paridad
vigente confirma resultados idénticos sobre el dataset de carga antes de
retirar el TS. `concepto.ts` queda con tipos y presentación.

### B5 — Cuentas en un PR (P0)

Una reescritura por función, desde prod, y en la misma migración:
- Pagos, facturas y órdenes solo por grupo (fuera la rama suelta de las RPCs
  de A1/v2); el suelto "por asignar" y su UI se quedan (A9). Restricción
  `responsable_id IS NOT NULL ⇒ grupo_id IS NOT NULL`.
- Lectores a dueños únicos (contacto, renglón, proyecto/cliente según D5).
- `fecha_entrega` → `date` en proyectos y cotizaciones; las funciones de
  Cuentas dejan la regex (F4).
- `historial_responsable` → vista con `security_invoker` (A11);
  `clientes.proyectos` → consulta.
- Borrar las columnas de la tabla "Deja de vivir en" (lista de v2: contacto,
  copias del renglón, `responsable_nombre`, `orden_pago_id`,
  `total_a_transferir`, `monto_transferido`, `metodo_pago`;
  `cuenta_pagar_id` de pagos y documentos; texto de `cuentas_cobrar`;
  `clientes.proyectos`; tabla `historial_responsable`), con el mapa en 0.
- Si se confirma E3: folios CC/CP, `folio_contadores`, sus funciones y
  triggers; búsqueda por folio de proyecto/cotización; ruta de Drive de
  complementos por `cotizacion_id`.
- Seeds, generador de loadtest y tipos al día; **re-sembrar test** (F10).
- Medir latencia antes/después (A15); recorrido manual en el Preview.

### B6 — Cierre

- `auditar_consistencia()` en el cron diario, visible en Admin (F9).
- `ARCHITECTURE.md`, `CLAUDE.md` (principio 1 sin Sheets), decisiones 006,
  008, 011, 017; ADR 020 con el resultado real; nota de F14 para el diseño de
  Proyectos.
- Re-evaluar el frente 2 (D6).
- Dejar escrito el checklist de salida a uso real: correr el reinicio por
  última vez, guardas en 0, borrar el script de reinicio.
- Cerrar #105, #106, #107 (con lo aprendido), #108, #109; archivar este plan.

## Confirmaciones (2026-10-01)

1. Catálogos en el reinicio: **se conservan solo `usuarios`** (más la
   configuración de tipos de proyecto que siembra una migración).
2. Folios: **SH001 y CC/CP desde 1** tras el reinicio.
3. El reinicio **no toca la BD de test**.
4. **Pendiente:** ¿los folios CC-/CP- (p. ej. `CC-2026-043`) se usan fuera de la app (contador, facturas, comunicación con proveedores)? Si no, se eliminan (E3).

## Riesgos

- **P0:** B5 cambia el flujo de pago a proveedores. Mitigación: datos
  reiniciados (una sola forma), un solo motor (B4), guardas deterministas,
  `live` sobre 2,203 proyectos re-sembrados, respaldo de B0.
- **P1:** `live` intermitente por cómputo Micro (#107, D7). Mitigación: F11; la
  corrección del dinero la deciden guardas y paridad, no la latencia.
- **P1:** borrar algo que aún se lee. Mitigación: mapa por nombre de columna.
- **P1:** correr el reinicio con datos reales. Mitigación: guarda del script
  (B2) y respaldo.
- **P2:** módulo de Proyectos en diseño (D4, F14): solo FKs, tipos y lectores.

## Tracker

| Bloque | Estado |
|---|---|
| Fases 1–3 (#105, #106) | Hecho (2026-10-01) |
| Decisiones D1–D7 | Hecho (2026-10-01) |
| Auditoría v1 → v2 y final v2 → v3 | Hecho (2026-10-01) |
| Aprobación del plan v3 | **Pendiente del usuario** |
| B0 Red de seguridad y test = prod | Pendiente |
| Exploración adicional (v4) | Hecho (2026-10-01) |
| B1 Retirar Sheets y Planeación | Pendiente |
| B2 Reinicio de datos | Pendiente |
| B3 Integridad, tipos y operación | Pendiente |
| B4 Un solo motor de Cuentas (#108) | Pendiente |
| B5 Cuentas en un PR | Pendiente |
| B6 Cierre | Pendiente |
