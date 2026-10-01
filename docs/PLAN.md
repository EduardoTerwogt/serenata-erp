# Plan de la iniciativa activa

**Estado:** Aprobado (2026-10-01) — plan v8 de "Simplificación del modelo de datos". Siguiente: B0.

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
  tablas.** 40 → 34 tablas (plan v8),
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
| D9 | Listados sin UI (J5) | **Se retiran** `buscar_cuentas_cobrar`, `buscar_cuentas_pagar_grupos` y sus `GET` de lista; nada externo los usa. |
| D10 | `VENCIDO` guardado (J6) | **Deja de guardarse**; se deriva al leer. |
| D11 | Unificar tablas de operaciones (E4, J9) | **Se descarta.** 34 tablas. |

## Fases

| Fase | Qué | Salida | Estado |
|---|---|---|---|
| 1. Inventario | Tablas, columnas, quién las toca | `docs/inventario-tablas.md` | Hecha |
| 2. Uso real y riesgo | Evidencia y matriz | `docs/inventario-tablas.md` → "Fase 2" | Hecha |
| 3. Propuestas | 3 alternativas | ADR 020 | Hecha |
| 4. Decisión y plan | D1–D11, seis auditorías, plan v8 | Este archivo | **Aprobado (2026-10-01)** |
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

## Resultado esperado (v8)

- **40 → 34 tablas** (−15 %): salen `cliente_id_backfill_clasificacion`,
  `historial_responsable` (pasa a vista), `sheets_sync_status`,
  `planeacion_pendientes`, `planeacion_event_notas` y `extraction_logs`.
  `bulk_import_operations` y `pago_operations` se quedan (E4 descartado, J9).
  Los folios CC/CP y `folio_contadores` se quedan (identificadores externos).
- **Una sola vía de pago** (el grupo) y **cada dato con un dueño**; con B6
  (opcional), además **un solo motor de reglas de Cuentas** (SQL):

| Dato | Dueño único | Deja de vivir en |
|---|---|---|
| Contacto y banco del proveedor | `proveedores` | `cuentas_pagar` |
| Descripción, cantidad, margen y proveedor del renglón | `items_cotizacion` | `cuentas_pagar` |
| Estado de pago | `cuentas_pagar_grupos` (+ desglose por renglón, A1) | columnas de la rama suelta |
| Cliente y nombre operativos | `proyectos` / `clientes` | texto en `cuentas_cobrar`, `historial_responsable`, `clientes.proyectos` |
| Lo emitido en el PDF | `cotizaciones` (D5) | — |
| Reglas de dinero de Cuentas (B6, opcional) | funciones SQL | `lib/shared/cuentas/concepto.ts` |
| Copia de consulta en Sheets | — | se retira (D2) |
| "Vencido" de un cobro | derivado al leer (fecha + saldo, J6) | `cuentas_cobrar.estado = 'VENCIDO'` y su cron |

- **Consultas más rápidas** por los índices faltantes (G1–G3), que hoy obligan a
  leer tablas completas en cada cotización y en Cuentas.
- Además: `proyectos.fecha_entrega` como `date`, formato de fecha garantizado en
  cotizaciones, `timestamptz` (sin errores de día por zona horaria), estados con `CHECK`, clientes sin duplicados, índices limpios,
  tablas de operación que ya no crecen sin límite y un chequeo diario de
  consistencia del dinero.
- Se retiran (aprobado): Sheets y Planeación con su UI.
- Sin cambios: reglas de negocio (006), el resto de la UI, Portal, tareas y
  documentos de proyecto, Calendar, folios CC/CP, cobrar/pagar separados,
  idempotencia HTTP.

## Cómo se garantiza que nada se rompa

1. **Mapa de dependencias en cero** por nombre de columna antes de borrar
   cualquier cosa (A10): todo el repo + `pg_get_functiondef` + triggers +
   vistas + políticas + `pg_depend`; y **`plpgsql_check` en 0 errores** sobre
   todas las funciones tras cada migración, en test y en `fresh-db` (J4).
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

## Plan de ejecución (v8)

6 PRs: B0 · B1+B3 · B5a · B5b · B6 (motor único) · B7 (cierre); B2 es la
ejecución del script de reinicio. Estimación: 5 sesiones. Plan v8.

### B0 — Red de seguridad, test = prod, índices y foto dorada

- `scripts/db/guardas-modelo.sql`: Σ pagos vigentes = `monto_pagado` (cobros,
  grupos, Σ hijas = grupo); `grupo.monto_total = Σ x_pagar`;
  `cp.x_pagar = item.x_pagar × item.cantidad`; total de orden = Σ desglose;
  importe y margen por fórmula; `cuentas_cobrar.monto_total = cotización.total`;
  renglón aprobado ⇔ cuenta por pagar; cuenta con proveedor ⇒ grupo; folios
  CC/CP únicos y no nulos.
- `scripts/db/mapa-dependencias.mjs <tabla.columna>`.
- **`plpgsql_check` (J4):** extensión en test y en `fresh-db` (migración
  aditiva); paso de CI que exige 0 errores en todas las funciones de `public`.
- **Retirar `sync-up` de Sheets (J7):** ruta
  `app/api/integrations/sheets/sync-up/` y su botón en `AdminSheets.tsx`, para
  que nada reimporte datos de prueba tras el reinicio. El resto de Sheets sigue
  en B1+B3.
- **`hoy_cdmx()` con fecha fija opcional (J2):** respeta
  `current_setting('app.hoy', true)`; sin el ajuste se comporta igual que hoy.
- Test: retirar objetos del frente 2 con un script SQL aplicado solo a test
  (no es migración: `20261009`/`20261010` no están en `main`; I3), anotado en
  `docs/archive/frente2-cuentas-conceptos-pausado.md`; comparar esquema con
  prod extendiendo `scripts/check-schema-parity.mjs` (columnas, índices,
  `md5(pg_get_functiondef)`; J11); `VACUUM ANALYZE` (F11).
- **Datos de test al día (I1, J1, J8):** agrupar las 5 sueltas con proveedor
  (`reconcile_cuenta_pagar_grupo`), recalcular los 2 márgenes viejos, revisar
  los 2 cobros con total distinto, ligar o corregir las 3 cuentas sin
  `item_id` y la 1 con `x_pagar` desfasado (13 filas); **alinear nombre y
  contacto copiados** (`cuentas_pagar`, `items_cotizacion.responsable_nombre`)
  con `proveedores` y corregir la causa en el generador o los specs. Una guarda
  vigila "copia = dueño" hasta B5b.
- **Índices faltantes (G1)** en test y prod: `items_cotizacion(cotizacion_id,
  orden)`, `items_cotizacion(responsable_id)`, `cuentas_pagar(cotizacion_id)`,
  `cuentas_pagar(responsable_id)`, `cotizaciones(es_complementaria_de)`
  parcial, y los FKs del advisor que sigan vivos tras el plan; cada uno
  justificado con `EXPLAIN` e `index_advisor` sobre las consultas más caras de
  `pg_stat_statements`.
  Medir `live` 3 veces antes y después (#107).
- Línea base: guardas en ambos y latencia de `cuentas_periodo` en test.
- **Foto dorada (H1, I2, J2):** la salida de las RPCs de lectura por año se
  toma **como SQL en una sola transacción** con
  `set_config('app.hoy', '<fecha fija>', true)`, **solo sobre los proyectos del
  dataset de carga**; `scripts/db/foto-dorada.mjs` la guarda en JSON y compara
  contra una foto nueva (diferencias campo por campo). Se toma después de I1.
  Excluye `buscar_cuentas_cobrar`/`buscar_cuentas_pagar_grupos` (se retiran, J5).
- Script de reinicio (B2) incluido en este PR.
- **Respaldo (G7):** `supabase db dump` de prod (paso a paso para ti) antes de
  B2 y antes de B5a.
- **Drive en Preview (G8):** pasos para que lo actives con la cuenta de pruebas.

### B2 — Reinicio de datos (D3)

- `scripts/db/reset-transaccional.sql`, idempotente. Se niega a correr si no
  recibe el ref del proyecto como confirmación explícita, y **se borra del
  repo el día de la salida a uso real** (protege contra correrlo por error
  con datos reales).
- Vacía: cotizaciones, renglones, reservas de folio, proyectos (y sus
  tareas/documentos, hoy en 0), todas las de Cuentas, órdenes, historiales,
  reaperturas, correcciones, idempotencia, rate limits, Planeación
  (`planeacion_pendientes`, `planeacion_event_notas`, `extraction_logs`) y
  `sheets_sync_status` (I4); reinicia `folio_contadores`.
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
- **Antes de ejecutar (H3):** carpetas de prueba de Drive de prod en la
  papelera (paso a paso para ti, F13); sin eso no se corre. Desde aquí, pruebas
  manuales en el Preview (F2).

### B1 + B3 (un PR) — Retiros e integridad

**Retiros (D2, D8):**

- Sheets: lista completa de F12; migración borra `sheets_sync_status` y sus 3 RPCs.
- Planeación: código, rutas, UI, navegación, proxy, permisos y tests de E1;
  plantillas pasan a la sección `cotizaciones` (E2) **en el mismo PR**, antes
  de quitar `planeacion` de `AppSection`. Las 3 tablas se borran en B5b, junto
  con la reescritura de `cancel_cotizacion` (G4).
- `docs/ROADMAP.md`, `ARCHITECTURE.md`, `CLAUDE.md` (encabezado: "extracción
  AI de eventos") al día.

**Integridad y operación** (sin tocar funciones de Cuentas):

- `CHECK` de `importe`/`margen` con tolerancia de centavo (A6); `CHECK` de
  `cotizaciones.estado` y `.tipo` (F6); `CHECK` de formato de
  `cotizaciones.fecha_entrega` (`AAAA-MM-DD` o nulo) y `save_cotizacion`
  normaliza `''` → `NULL` (G5).
- `clientes`: único por `lower(trim(nombre))` y autosave que consulta por esa
  expresión (F6, G2).
- `timestamptz` en las columnas que **no** leen funciones de Cuentas
  (`service_templates`, `gastos_fijos`, `proveedor_documentos`); las de Cuentas
  van en B5b (F5).
- RLS `(select auth…)` en `usuarios` y `realtime.messages` (G3).
- Índices: borrar `idx_cotizaciones_id`; los sin uso solo con evidencia de test (G10).
- `/api/keep-alive`: purga de reservas de folio vencidas (F8).
- `COMMENT ON COLUMN` en ambos `x_pagar` (A7).

### B5a — Escrituras de dinero solo por grupo (P0)

Una reescritura por función, desde prod: `registrar_pago_cuenta_pagar`,
`registrar_pago_grupo_factura`,
`anular_pago_proveedor`, `baja_documento_pago`, `adjuntar_comprobante_pago_proveedor`,
`generar_orden_pago` (sin `UNION ALL`), `cancelar_orden_pago`,
`recalcular_estado_orden_pago`, `validar_factura_proveedor`, `corregir_*`
**excepto `corregir_proveedor_cuenta_pagar`** (va con `reasignar_*` en B5b, J3).
- **Regla J3:** toda función reescrita aquí ya lee nombre, contacto y
  descripción de su dueño (`proveedores`, `items_cotizacion`), nunca de la
  copia en `cuentas_pagar`; p. ej. `generar_orden_pago` toma
  `proveedores.nombre` para el snapshot de `ordenes_pago_conceptos`.
- Pagos, facturas y órdenes solo por grupo; el suelto "por asignar" sigue (A9).
- Dejan de escribir `orden_pago_id`, `total_a_transferir`, `monto_transferido`
  y `metodo_pago` de `cuentas_pagar` (se borran en B5b).
- Restricción `responsable_id IS NOT NULL ⇒ grupo_id IS NOT NULL`.
- Guardas en 0 y paridad; recorrido manual de pagos en el Preview.

### B5b — Lecturas, copias y borrado (P0)

Funciones disjuntas de B5a: `approve_cotizacion`, `reasignar_responsable_cuenta_pagar`,
`corregir_proveedor_cuenta_pagar` (J3), `cancel_cotizacion`, `cuentas_conceptos`,
`cuentas_por_proyecto`, `cuentas_orden_candidatos`,
`cuentas_periodo`/`resumen`/`avisos_items`/`anios`, `buscar_ordenes_pago`,
`cuentas_cobrar_estado_calculado` (J6), `dashboard_*`; portal y TS.
- **Retiros sin reemplazo (J5):** `buscar_cuentas_cobrar`,
  `buscar_cuentas_pagar_grupos` y los `GET` de lista de `/api/cuentas-cobrar` y
  `/api/cuentas-pagar` (sin consumidor en la UI); `tests/e2e/live/basic.spec.ts`
  pasa a `cuentas_periodo`/detalle.
- **`VENCIDO` deja de guardarse (J6):** sale
  `sync_estados_cuentas_cobrar_vencidas` (y su llamada en `/api/keep-alive`);
  `cuentas_cobrar_estado_calculado` y `subir-factura` ya no producen `VENCIDO`;
  las filas en `VENCIDO` pasan a su estado real; `CHECK` sin `VENCIDO`. La UI
  sigue mostrando "Vencido" (derivado por fecha y saldo en `cuentas_conceptos`).
- Lectores a dueños únicos (contacto, renglón, proyecto/cliente según D5).
- `cuentas_pagar.item_id` → `uuid NOT NULL` + FK (J8); fuera la búsqueda por descripción de
  `app/api/items/[id]/route.ts` (G4).
- `proyectos.fecha_entrega` → `date`; las funciones dejan la regex (F4, G5).
- `timestamptz` en las columnas de Cuentas y órdenes (F5).
- `historial_responsable` → vista con `security_invoker` (A11);
  `clientes.proyectos` → consulta.
- Borrar: columnas de la tabla "Deja de vivir en" (contacto, copias del
  renglón, `responsable_nombre`, `orden_pago_id`, `total_a_transferir`,
  `monto_transferido`, `metodo_pago`; `cuenta_pagar_id` de pagos y
  documentos; texto de `cuentas_cobrar`; `clientes.proyectos`), tablas
  `historial_responsable` y de Planeación (E1), función `buscar_cuentas_pagar`
  (G9); código muerto `createCuentaCobrar` y `getCuentasPagarPorGrupo` (J11).
  Mapa en 0 y `plpgsql_check` en 0.
- Foto dorada sin diferencias (H1) **antes** de re-sembrar.
- Seeds, generador de loadtest y tipos al día; **re-sembrar test** (F10) y
  tomar una foto dorada nueva para B6 (I2).
- Medir latencia antes/después (A15); recorrido manual completo en el Preview.

### B6 — Un solo motor de Cuentas (#108), después de B5b (H2)

Independiente: la iniciativa ya cumplió su meta si se detiene antes.

Derivación del proyecto seleccionado y del detalle a SQL; el test de paridad
vigente confirma resultados idénticos sobre el dataset de carga antes de
retirar el TS. `concepto.ts` queda con tipos y presentación.

### B7 — Cierre

- `auditar_consistencia()` en el cron diario, visible en Admin (F9).
- `ARCHITECTURE.md`, `CLAUDE.md` (principio 1 sin Sheets), decisiones 006,
  008, 011, 017; ADR 020 con el resultado real; nota de F14 para el diseño de
  Proyectos.
- Re-evaluar el frente 2 (D6) — con los índices de B0 puede que ya no haga falta.
- Checklist de salida a uso real: correr el reinicio por última vez, guardas
  en 0, carpetas de prueba de Drive fuera (H3), borrar el script de reinicio y
  **decidir la estrategia de respaldo**
  (plan Free sin respaldos, G7).
- Cerrar #105, #106, #107 (con lo aprendido), #108, #109; archivar este plan.

## Confirmaciones (2026-10-01)

1. Catálogos en el reinicio: **se conservan solo `usuarios`** (más la
   configuración de tipos de proyecto que siembra una migración).
2. Folios: **SH001 y CC/CP desde 1** tras el reinicio.
3. El reinicio **no toca la BD de test**.
4. Folios CC-/CP-: **se usan fuera de la app** → se conservan (E3 descartado). Se agrega una guarda: folios únicos y sin huecos de `NULL`.

## Riesgos

- **P0:** B5 cambia el flujo de pago a proveedores. Mitigación: datos
  reiniciados (una sola forma), paridad SQL/TS como oráculo (H2), foto dorada
  (H1), guardas deterministas,
  `live` sobre 2,203 proyectos re-sembrados, respaldo de B0.
- **P0 (fuera de alcance, antes de uso real):** plan Free sin respaldos (G7).
- **P1:** `live` intermitente por cómputo (#107, D7). Mitigación: índices de B0 (G1), F11; la
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
| Aprobación del plan v7 | Hecho (2026-10-01) |
| Auditoría final 5 (v7 → v8) y decisiones J5, J6, J9 | Hecho (2026-10-01) |
| B0 Red de seguridad, test = prod, índices y foto dorada | Pendiente |
| B2 Reinicio de datos (script; tras limpiar Drive) | Pendiente |
| B1 + B3 Retiros e integridad | Pendiente |
| B5a Escrituras de dinero solo por grupo | Pendiente |
| B5b Lecturas, copias y borrado | Pendiente |
| B6 Un solo motor de Cuentas (#108) | Pendiente |
| B7 Cierre | Pendiente |
