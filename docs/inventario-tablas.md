# Inventario de tablas (2026-10-01)

Insumo de la iniciativa "Simplificación del modelo de datos" (`docs/PLAN.md`).
**Es un inventario, no una propuesta**: describe lo que hay y marca dónde la
información está repartida. Ninguna fusión está decidida.

## Cómo se obtuvo

- **Base:** producción (`fwmyoqokcjtldiofuxdg`), esquema `public`, 40 tablas
  base, consultado el 2026-10-01 con `pg_class`, `pg_constraint`, `pg_proc` y
  `pg_trigger`.
- **Filas:** estimación de `pg_stat_user_tables` (`proveedores` se contó con
  `count(*)`). Producción **no está en uso real** (solo pruebas manuales), así
  que las filas bajas y los ceros **no son evidencia de que una tabla sobre**.
- **Escribe/lee desde código:** archivos de `app/`, `lib/` y `components/` (sin
  `__tests__`) con `.from('<tabla>')`. Una tabla con "solo RPCs" no se toca
  directo desde TypeScript.
- **Funciones SQL que la nombran:** funciones de `public` cuyo cuerpo menciona
  la tabla (coincidencia de texto: incluye lecturas y escrituras; no distingue
  cuál). El número en negritas es el conteo.
- **No incluido:** vistas, políticas RLS, tipos y las dos tablas de test que aún
  no existen en producción (ver "Tablas que solo existen en test").

## Resumen en una línea

40 tablas; 11 alimentan la derivación de Cuentas (`cuentas_conceptos`); las dos más referenciadas
por funciones SQL son `cuentas_pagar` (22 funciones) y `cotizaciones` (21).

## Tablas por dominio

### Cotizaciones

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `cotizaciones` | 94 | 27 | repositories, quotations, projects (9 archivos) | clientes | cuentas_cobrar, cuentas_pagar, historial_cambios_responsable_item, historial_responsable, items_cotizacion, planeacion_event_notas, proyectos | — | **21**: approve_cotizacion, bulk_replace_items_cotizacion, buscar_cotizaciones, buscar_cuentas_pagar, buscar_cuentas_pagar_grupos, cancel_cotizacion, cuentas_conceptos, cuentas_orden_candidatos, cuentas_por_proyecto, dashboard_actividad_cotizaciones, dashboard_cotizaciones_recientes, delete_item_cotizacion, emitir_cotizacion, patch_cotizacion_general, patch_cotizacion_totales, patch_item_cotizacion, preview_next_cotizacion_folio_principal, recalcular_totales_cotizacion, reserve_next_cotizacion_folio, save_cotizacion, upsert_items_cotizacion |
| `items_cotizacion` | 288 | 14 | repositories, projects, app/api/items/[id] | cotizaciones, proveedores | historial_cambios_responsable_item | — | **10**: approve_cotizacion, bulk_replace_items_cotizacion, buscar_cotizaciones, cancel_cotizacion, delete_item_cotizacion, patch_item_cotizacion, reasignar_responsable_cuenta_pagar, recalcular_totales_cotizacion, save_cotizacion, upsert_items_cotizacion |
| `cotizacion_folio_reservations` | 92 | 7 | lib/server/quotations | — | — | — | **3**: consume_cotizacion_folio_reservation, preview_next_cotizacion_folio_principal, reserve_next_cotizacion_folio |
| `folio_contadores` | 2 | 3 | (solo RPC) | — | — | — | **1**: siguiente_folio |
| `bulk_import_operations` | 8 | 4 | app/api/cotizaciones/[id]/items/bulk/estado | — | — | — | **1**: bulk_replace_items_cotizacion |
| `productos` | 46 | 7 | quotations, app/api/productos | — | — | — | — |
| `service_templates` | 4 | 7 | repositories | — | — | 1 | — |

### Clientes, proveedores y responsables

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `clientes` | 29 | 10 | repositories, quotations, app/api/clientes | — | cliente_id_backfill_clasificacion, cotizaciones, cuentas_cobrar, historial_responsable, proyectos | — | **1**: cuentas_opciones |
| `proveedores` | 10 | 16 | repositories, cuentas, app/api/items/[id] (6 archivos) | proveedores (self) | cuentas_pagar, cuentas_pagar_grupos, historial_cambios_responsable_item, historial_responsable, items_cotizacion, proveedor_documentos, proveedores, proyecto_tareas | — | **11**: bulk_replace_items_cotizacion, buscar_cuentas_pagar_grupos, confirmar_match_proveedor, cuentas_conceptos, cuentas_opciones, cuentas_orden_candidatos, cuentas_por_proyecto, generar_orden_pago, match_proveedor_por_nombre, proveedor_documentos_resumen, proveedores_pagina_por_nombre |
| `proveedor_documentos` | 2 | 8 | repositories | proveedores | — | — | **2**: confirmar_match_proveedor, proveedor_documentos_resumen |
| `historial_responsable` | 18 | 11 | repositories, projects, app/api/proveedores/[id]/historial | clientes, cotizaciones, proveedores | — | — | **1**: cancel_cotizacion |
| `historial_cambios_responsable_item` | 6 | 9 | repositories | cotizaciones, items_cotizacion, proveedores | — | — | **1**: cancel_cotizacion |
| `cliente_id_backfill_clasificacion` | 168 | 8 | (ninguno; migración de datos) | clientes | — | — | — |

### Proyectos

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `proyectos` | 28 | 16 | repositories, cuentas | clientes, cotizaciones, tipo_proyecto_etapas, tipos_proyecto | cuentas_cobrar, cuentas_pagar, cuentas_pagar_grupos, cuentas_reaperturas, proyecto_documentos, proyecto_tareas | — | **12**: approve_cotizacion, buscar_cuentas_pagar, buscar_cuentas_pagar_grupos, buscar_ordenes_pago, cancel_cotizacion, cuentas_anios, cuentas_conceptos, cuentas_orden_candidatos, cuentas_periodo, cuentas_por_proyecto, dashboard_actividad_proyectos, reabrir_cuentas_proyecto |
| `proyecto_documentos` | 0 | 11 | repositories | proyectos | — | — | — |
| `proyecto_tareas` | 0 | 12 | repositories | proveedores, proyectos | proyecto_tarea_checklist | — | — |
| `proyecto_tarea_checklist` | 0 | 5 | repositories | proyecto_tareas | — | — | — |
| `tipos_proyecto` | 3 | 4 | repositories | — | proyectos, tipo_proyecto_etapas, tipo_proyecto_tarea_default | — | — |
| `tipo_proyecto_etapas` | 12 | 6 | repositories | tipos_proyecto | proyectos | — | — |
| `tipo_proyecto_tarea_default` | 0 | 8 | repositories | tipos_proyecto | — | — | — |

### Cuentas por cobrar

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `cuentas_cobrar` | 35 | 16 | repositories, quotations, cuentas | clientes, cotizaciones, proyectos | documentos_cuentas_cobrar, pagos_comprobantes | 2 | **13**: anular_pago_cobro, approve_cotizacion, baja_documento_cobro, buscar_cuentas_cobrar, cancel_cotizacion, corregir_datos_cobro, corregir_datos_pago, cuentas_anios, cuentas_conceptos, cuentas_por_proyecto, dashboard_kpis_cuentas, registrar_pago_cuenta_cobrar, sync_estados_cuentas_cobrar_vencidas |
| `pagos_comprobantes` | 2 | 12 | repositories, cuentas | cuentas_cobrar | documentos_cuentas_cobrar | — | **5**: anular_pago_cobro, corregir_datos_pago, cuentas_conceptos, cuentas_por_proyecto, registrar_pago_cuenta_cobrar |
| `documentos_cuentas_cobrar` | 12 | 19 | repositories, cuentas | cuentas_cobrar, documentos_cuentas_cobrar (reemplazo), pagos_comprobantes | documentos_cuentas_cobrar | — | **3**: baja_documento_cobro, cuentas_conceptos, cuentas_por_proyecto |

### Cuentas por pagar

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `cuentas_pagar` | 89 | 27 | repositories, cuentas, app/api/items/[id] (5 archivos) | cotizaciones, cuentas_pagar_grupos, ordenes_pago, proveedores, proyectos | documentos_cuentas_pagar, pagos_cuentas_pagar | 2 | **22**: anular_pago_proveedor, approve_cotizacion, baja_documento_pago, buscar_cuentas_pagar, buscar_cuentas_pagar_grupos, cancel_cotizacion, cancelar_orden_pago, corregir_datos_pago, corregir_proveedor_cuenta_pagar, cuentas_anios, cuentas_conceptos, cuentas_orden_candidatos, cuentas_por_proyecto, dashboard_egresos_por_bucket, dashboard_kpis_cuentas, generar_orden_pago, reasignar_responsable_cuenta_pagar, recalcular_estado_orden_pago, reconcile_cuenta_pagar_grupo, registrar_pago_cuenta_pagar, registrar_pago_grupo_factura, validar_factura_proveedor |
| `cuentas_pagar_grupos` | 33 | 11 | repositories, cuentas, comprobante de pago (4 archivos) | ordenes_pago, proveedores, proyectos | cuentas_pagar, documentos_cuentas_pagar, pagos_cuentas_pagar | — | **14**: anular_pago_proveedor, baja_documento_pago, buscar_cuentas_pagar_grupos, cancel_cotizacion, cancelar_orden_pago, corregir_datos_pago, corregir_proveedor_cuenta_pagar, cuentas_conceptos, cuentas_orden_candidatos, cuentas_por_proyecto, generar_orden_pago, reconcile_cuenta_pagar_grupo, registrar_pago_grupo_factura, validar_factura_proveedor |
| `ordenes_pago` | 8 | 11 | lib/server/cuentas | — | cuentas_pagar, cuentas_pagar_grupos, ordenes_pago_conceptos, pagos_cuentas_pagar | — | **4**: buscar_ordenes_pago, cancelar_orden_pago, generar_orden_pago, recalcular_estado_orden_pago |
| `ordenes_pago_conceptos` | 47 | 11 | (solo RPCs) | ordenes_pago | — | — | **3**: buscar_ordenes_pago, generar_orden_pago, recalcular_estado_orden_pago |
| `pagos_cuentas_pagar` | 2 | 18 | cuentas, comprobante, registrar-pago/estado (4 archivos) | cuentas_pagar, cuentas_pagar_grupos, ordenes_pago | — | — | **11**: adjuntar_comprobante_pago_proveedor, anular_pago_proveedor, buscar_ordenes_pago, cancelar_orden_pago, corregir_datos_pago, corregir_proveedor_cuenta_pagar, cuentas_conceptos, cuentas_por_proyecto, recalcular_estado_orden_pago, registrar_pago_cuenta_pagar, registrar_pago_grupo_factura |
| `documentos_cuentas_pagar` | 11 | 17 | repositories, cuentas, registrar-pago/estado (4 archivos) | cuentas_pagar, cuentas_pagar_grupos, documentos_cuentas_pagar (reemplazo) | documentos_cuentas_pagar | — | **10**: baja_documento_pago, cancel_cotizacion, corregir_proveedor_cuenta_pagar, cuentas_conceptos, cuentas_orden_candidatos, cuentas_por_proyecto, generar_orden_pago, registrar_pago_cuenta_pagar, registrar_pago_grupo_factura, validar_factura_proveedor |

### Control de cuentas (reaperturas, correcciones, idempotencia de pagos)

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `cuentas_reaperturas` | 0 | 7 | repositories | proyectos | cuentas_correcciones | — | **5**: cerrar_cuentas_proyecto, cuentas_conceptos, cuentas_por_proyecto, cuentas_reapertura_activa, reabrir_cuentas_proyecto |
| `cuentas_correcciones` | 0 | 10 | (solo RPCs) | cuentas_reaperturas | — | — | **7**: anular_pago_cobro, anular_pago_proveedor, baja_documento_cobro, baja_documento_pago, corregir_datos_cobro, corregir_datos_pago, corregir_proveedor_cuenta_pagar |
| `pago_operations` | 0 | 5 | 3 rutas registrar-pago/estado | — | — | — | **3**: registrar_pago_cuenta_cobrar, registrar_pago_cuenta_pagar, registrar_pago_grupo_factura |

### Planeación y extracción AI

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `planeacion_pendientes` | 39 | 12 | app/api/planeacion (3 rutas) | — | — | — | — |
| `planeacion_event_notas` | 0 | 8 | app/api/planeacion (2 rutas) | cotizaciones | — | 1 | **1**: cancel_cotizacion |
| `extraction_logs` | 0 | 10 | app/api/planeacion (2 rutas) | — | — | — | — |
| `gastos_fijos` | 0 | 5 | repositories | — | — | — | — |

### Infraestructura

| Tabla | Filas | Cols | Escribe/lee desde código | FK salientes | FK entrantes | Triggers | Funciones SQL que la nombran |
|---|---|---|---|---|---|---|---|
| `idempotency_keys` | 1 | 6 | lib/server, keep-alive, registrar-pago/estado (6 archivos) | — | — | — | — |
| `rate_limits` | 0 | 3 | keep-alive | — | — | — | **1**: check_rate_limit |
| `sheets_sync_status` | 1 | 10 | app/api/integrations/sheets/status | — | — | — | **3**: acquire_sheets_sync_lock, release_sheets_sync_lock, renew_sheets_sync_lease |
| `usuarios` | 2 | 8 | repositories | — | — | — | **1**: admin_update_usuario |

## Tablas que solo existen en test (frente 2, PR #100)

| Tabla | Para qué | Estado |
|---|---|---|
| `cuentas_conceptos_base` | Conceptos de Cuentas ya derivados (45 columnas, una fila por concepto) | Solo en test; en producción al cerrar A4 |
| `cuentas_conceptos_pendientes` | Cola de proyectos por refrescar, vive dentro de la transacción | Solo en test |

Ambas existen **porque** los conceptos de Cuentas se reparten en 11 tablas fuente
(ver `docs/decisions/019-cuentas-conceptos-materializada.md`). Si esta
iniciativa reduce esa dispersión, la necesidad de `cuentas_conceptos_base`
puede cambiar: por eso el frente 2 queda en pausa (`docs/archive/frente2-cuentas-conceptos-pausado.md`).

## Observaciones (hipótesis a validar, no conclusiones)

Cada una indica **dónde mirar**; ninguna dice qué hacer.

1. **Cuentas por cobrar y por pagar son dos modelos paralelos.**
   `pagos_comprobantes` (12 columnas) y `pagos_cuentas_pagar` (18) guardan pagos
   con la misma idea (`anulado_at/por/motivo`, comprobante, fecha, tipo).
   `documentos_cuentas_cobrar` (19) y `documentos_cuentas_pagar` (17)
   comparten ~14 columnas (`tipo`, `archivo_url`, `estado_validacion`,
   `uuid_cfdi`, `total_cfdi`, `operation_id`, `eliminado_*`, `reemplazado_por`).
   Pregunta: ¿pagos y documentos pueden ser una tabla con un discriminador, o
   las diferencias (grupos, órdenes de pago) lo impiden?
2. **`cuentas_pagar` y `cuentas_pagar_grupos` duplican estado.** Ambas guardan
   `estado`, `monto_pagado`, `orden_pago_id`, `total_a_transferir` y
   `monto_transferido`. La invariante `monto_total = Σ x_pagar` necesitó un
   trigger propio (migración 20261008) y una RPC de reconciliación
   (`reconcile_cuenta_pagar_grupo`): señal de que el mismo dato vive en dos
   lugares.
3. **Datos de terceros copiados.** `cuentas_pagar` (27 columnas) guarda
   `responsable_nombre`, `telefono`, `correo`, `clabe` y `banco` además de
   `responsable_id`; `cuentas_cobrar` guarda `cliente` y `proyecto` como texto
   además de `cliente_id` y `proyecto_id`; `ordenes_pago_conceptos` copia
   `responsable_nombre`, `proyecto_id` y `cotizacion_folio`. Parte puede ser
   intencional (snapshot al momento del pago): hay que separar lo que debe
   congelarse de lo que es copia accidental.
4. **`ordenes_pago` se referencia desde cuatro tablas** (`cuentas_pagar`,
   `cuentas_pagar_grupos`, `pagos_cuentas_pagar`, `ordenes_pago_conceptos`).
   Un cambio de estado de la orden toca varias.
5. **Dos historiales de responsable** (`historial_responsable`, 18 filas, y
   `historial_cambios_responsable_item`, 6 filas) con propósitos distintos en
   apariencia (participación en eventos vs. bitácora de reasignaciones). Falta
   confirmar que no se solapan; ambas solo las escribe `repositories` y las
   lee `cancel_cotizacion`.
6. **Dos mecanismos de idempotencia:** `idempotency_keys` (6 archivos de
   código) y `pago_operations` (3 rutas de pago + 3 RPCs). Candidatas a
   unificar o a justificar por escrito.
7. **Posible residuo:** `cliente_id_backfill_clasificacion` (168 filas, sin
   lecturas en código ni funciones): parece un artefacto de la migración de
   `cliente_id` (`docs/decisions/014-cliente-id-fk-clasificacion.md`); confirmar
   si ya se puede archivar.
8. **Tablas sin filas en producción** (por falta de uso real, no
   necesariamente sobrantes): `cuentas_reaperturas`, `cuentas_correcciones`,
   `extraction_logs`, `gastos_fijos`, `proyecto_documentos`, `proyecto_tareas`,
   `proyecto_tarea_checklist`, `tipo_proyecto_tarea_default`, `rate_limits`,
   `pago_operations`. Antes de decidir nada hay que ver cuáles tienen UI o ruta
   activa y cuáles son funcionalidad a medias (`docs/ROADMAP.md` → "Features a
   medias").
9. **Dispersión de las reglas.** Las funciones que mencionan una tabla son un
   buen indicador de "dónde hay que buscar": `cuentas_pagar` (22),
   `cotizaciones` (21), `cuentas_cobrar` (13), `proyectos` (12),
   `proveedores` (11), `pagos_cuentas_pagar` (11). Las reglas de dinero y
   estados viven en esas funciones y, en paralelo, en TypeScript
   (`concepto.ts`, `periodo.ts`, `avisos.ts`; paridad obligatoria, decisión 017).

## Lo que este inventario no responde todavía

- Qué tablas tienen **usuarios finales** hoy (qué pantalla las usa).
- Qué columnas están **sin uso** (nunca leídas ni escritas).
- Qué fusiones **romperían una invariante** que hoy protege la BD (R1, D22,
  D28, `docs/decisions/006` y `011`).
- Costo real de migrar (RPCs, triggers, tests live, derivación TS y SQL).

Esas cuatro preguntas son el alcance de la fase 2 del plan.

---

# Fase 2 — Uso real, evidencia y matriz (2026-10-01, #105)

Producción (`fwmyoqokcjtldiofuxdg`), consultas de solo lectura. Producción
sigue siendo **datos de prueba**: los desfases de abajo prueban que el diseño
*permite* que el dato diverja, no que haya pérdida real.

## Hallazgos con evidencia

| # | Hallazgo | Evidencia (prod) | Quién lo toca |
|---|---|---|---|
| H1 | `proyectos` repite `cliente`, `proyecto`, `fecha_entrega`, `locacion`, `cliente_id` de su cotización principal (relación 1:1, `proyectos.id = cotizaciones.id`). | 28/28 proyectos con id = cotización; **2 ya difieren** (SH007, SH080: fecha/locación editadas en Proyectos). | Proyectos edita los 5 campos (`updateProyectoWithRollback`); Cuentas lee `proyectos.fecha_entrega`. |
| H2 | `cuentas_cobrar.cliente` y `.proyecto` son texto copiado además de `cliente_id`/`proyecto_id`. | 0 desfases hoy; 1 cobro **sin `proyecto_id`**. Renombrar un proyecto los desincroniza. | 2 funciones (`buscar_cuentas_cobrar`, `cuentas_por_proyecto`), Sheets, TS. |
| H3 | `cuentas_pagar` copia `telefono`, `correo`, `clabe`, `banco` del proveedor. | **10/82** filas con proveedor ya difieren de `proveedores`. Todos los lectores hacen `COALESCE(proveedor_vivo, copia)`: la copia solo es respaldo. | `cuentas_orden_candidatos`, `reasignar_responsable_cuenta_pagar`, `corregir_proveedor_cuenta_pagar` (parámetros), `detalle.ts`/`detalle-armar.ts`, `correcciones.ts`, Sheets. |
| H4 | `cuentas_pagar` copia `item_descripcion`, `cantidad`, `margen` del renglón, y **`item_id` es `text` sin FK** hacia `items_cotizacion.id` (uuid). | Renglones aprobados están congelados (guard `20260911`), así que solo 1 difiere; 0 huérfanos hoy, pero nada lo impide. | 6 funciones leen `item_descripcion`; Sheets. |
| H5 | **Mismo nombre, distinto significado:** `items_cotizacion.x_pagar` es **unitario**; `cuentas_pagar.x_pagar` es **total** (`x_pagar × cantidad`, migración `20260918`). | Confirmado en `approve_cotizacion` y en el trigger `20261008` (`monto_total = Σ cp.x_pagar`). | 22 funciones nombran `cuentas_pagar`. Riesgo de lectura equivocada en cualquier cambio futuro. |
| H6 | `items_cotizacion.margen` y `cotizaciones.margen_total` son derivados guardados. | **13 renglones** guardan la fórmula vieja (`importe − x_pagar`), incluidos aprobados (SH004, SH071, SH072) → su utilidad en Cuentas sale de un margen viejo. `20260918` decidió no rehacerlos por ser prueba. | `recalcular_totales_cotizacion`, `save/upsert/bulk_replace`, `approve`, Cuentas (`cot.margen`). |
| H7 | `historial_responsable` es **caché**: se borra y regenera desde `items_cotizacion` + `proyectos` al cerrar el proyecto (`projects/equipo.ts`), con `proyecto_nombre`, `cliente` y `fecha_evento` copiados como texto. Sin FK en `proyecto_id`. | 18 filas; 100 % derivable. | Modal de proveedor (join), `/api/proveedores/[id]/historial`, `cuentas-pagar.ts`, rollback de `projects/service.ts`, `cancel_cotizacion`, Sheets. |
| H8 | `clientes.proyectos` (array de texto) es lista derivada de cotizaciones. | 29/29 clientes con array; solo lo escribe `quotations/persistence.ts` y lo lee el autocompletado de Cotizaciones. | Se obtiene con `distinct proyecto from cotizaciones where cliente_id = …`. |
| H9 | `cuentas_pagar` tiene **dos caminos**: renglón en grupo y renglón "suelto" (legado). En renglones con grupo, `total_a_transferir`, `monto_transferido` y `orden_pago_id` repiten o no usan el dato del grupo; `monto_pagado`/`estado`/`fecha_pago` **sí** se usan: el pago del grupo se prorratea a cada renglón (corregido en la auditoría del plan, A1). | Con grupo: 42 filas, 0 desfases de orden/llave, `total_a_transferir` siempre null. **Sueltas: 47** (41 en orden sin factura, 3 sin proveedor, 1 pagada, …). Todas datos de prueba. | ~10 RPCs con rama `grupo_id IS NULL`, `UNION ALL` en órdenes, portal (grupos sintéticos), derivación TS. Es la mayor fuente de complejidad de Cuentas. |
| H10 | Tres tablas de idempotencia con forma parecida. **Auditoría A8:** no son duplicado; son dos capas a propósito (HTTP vs resultado dentro de la transacción del dinero, decisión 008). | `idempotency_keys` (HTTP), `pago_operations` (3 RPCs de pago), `bulk_import_operations` (1 RPC). | Decisión 008. |
| H11 | **Sheets → Supabase (`sync-up`) escribe directo** sobre `cotizaciones`, `items_cotizacion`, `proyectos`, `cuentas_cobrar`, `cuentas_pagar`, etc., sin RPC ni guardas. Está en Admin ("Importa al sistema los cambios hechos en el Sheet"). | `lib/integrations/sheets/sync-up.ts`, `schema.ts` (`readonly: []` en las dos de cuentas). | Contradice los principios 1 y 2 de `CLAUDE.md`, y **cualquier columna que se borre rompe el espejo**. Prerrequisito de toda la iniciativa. |
| H12 | Residuo: `cliente_id_backfill_clasificacion`. | 168 filas, 0 lectores en código y funciones. | Ninguno. |
| H13 | Tipos e integridad. | 13 columnas `timestamp` sin zona; `fecha_entrega` como texto en cotizaciones y proyectos (D9); `planeacion_pendientes.fecha` + `fecha_iso`; sin FK: `cuentas_pagar.item_id`, `historial_responsable.proyecto_id`, `extraction_logs.proyecto_id`. | — |
| H14 | Una orden con total distinto a la suma de su desglose. | 1 de 8 (`ordenes_pago.total_monto ≠ Σ ordenes_pago_conceptos.neto_cubierto`); probable orden anterior a `ordenes_pago_conceptos`. | Revisar antes de B4. |

Consistencias que **sí** se cumplen hoy (sirven de guardas para la ejecución):
`cuentas_cobrar.monto_pagado = Σ pagos vigentes` (0 desfases),
`grupo.monto_pagado = Σ pagos vigentes` (0), sueltas igual (0),
`grupo.monto_total = Σ cp.x_pagar` (0), `cotizaciones.margen_total = Σ items.margen` (0),
`items.importe = cantidad × precio_unitario` (0), 0 renglones aprobados sin cuenta por pagar.

## Matriz por tabla

Leyenda: **Mantener** · **Adelgazar** (quitar columnas copiadas/derivadas) ·
**Derivar** (vista o consulta en vez de tabla) · **Fusionar** · **Borrar**.
Riesgo = qué pasa si sale mal: P0 dinero/impuestos, P1 función visible, P2 interno.

| Tabla | Veredicto | Qué cambia | Riesgo |
|---|---|---|---|
| `cotizaciones` | Mantener | Es el documento emitido. Totales guardados se quedan (snapshot del PDF), pero se recalculan desde renglones generados (H6). | P1 |
| `items_cotizacion` | Adelgazar | `importe` y `margen` pasan a columnas generadas (H6). | P1 |
| `proyectos` | Mantener | Dueño de los datos operativos después de aprobar (H1). Se documenta la regla; no se fusiona con cotizaciones (tiene ciclo propio y lo comparten las complementarias). | P2 |
| `clientes` | Adelgazar | Quitar `proyectos[]` (H8). | P2 |
| `proveedores` | Mantener | Fuente única de contacto y banco (H3). | — |
| `cuentas_cobrar` | Adelgazar | Quitar `cliente`/`proyecto` texto (H2). | P1 |
| `pagos_comprobantes`, `documentos_cuentas_cobrar` | Mantener | No se fusionan con los de pagar (ver ADR 020, alternativa C). | — |
| `cuentas_pagar` | Adelgazar | Quitar contacto copiado (H3), copias del renglón (H4) y columnas de la rama suelta (H9); FK real a `items_cotizacion`. Conserva el desglose de pago por renglón y el nombre `x_pagar` documentado (auditoría A1, A7). | **P0** |
| `cuentas_pagar_grupos` | Mantener (se vuelve la única obligación) | Toda cuenta con proveedor tiene grupo; las sueltas se migran a grupos de un renglón (H9). | **P0** |
| `pagos_cuentas_pagar`, `documentos_cuentas_pagar` | Adelgazar | Cuelgan solo del grupo (desaparece `cuenta_pagar_id` tras H9). | **P0** |
| `ordenes_pago`, `ordenes_pago_conceptos` | Mantener | Snapshot inmutable por decisión (S1). Arreglar H14. | P1 |
| `cuentas_reaperturas`, `cuentas_correcciones` | Mantener | Bitácora; 0 filas por falta de uso, no por sobrar. | — |
| `historial_responsable` | **Derivar** | Vista/RPC sobre renglones + proyectos finalizados (H7). | P1 |
| `historial_cambios_responsable_item` | Mantener | Bitácora real de reasignaciones (no es caché). | — |
| `idempotency_keys`, `pago_operations`, `bulk_import_operations` | Mantener | Dos capas a propósito (auditoría A8). | — |
| `cliente_id_backfill_clasificacion` | **Borrar** (archivar CSV antes) (H12). | P2 |
| `cotizacion_folio_reservations`, `folio_contadores` | Mantener | Distintos a propósito: reservas con expiración vs contadores por serie/año. | — |
| `productos`, `service_templates` | Mantener | Catálogos con UI activa. | — |
| `proyecto_tareas`, `proyecto_tarea_checklist`, `proyecto_documentos`, `tipo_proyecto_tarea_default` | Mantener (D4) | 0 filas, pero con UI que funciona (tablero, cronograma, 9 documentos PM) y el módulo de Proyectos aún en diseño. | — |
| `tipos_proyecto`, `tipo_proyecto_etapas` | Mantener | Las usa Proyectos. | — |
| `planeacion_pendientes`, `planeacion_event_notas`, `extraction_logs` | Mantener | Unificar `fecha`/`fecha_iso` (H13). | P2 |
| `gastos_fijos` | Mantener | Dashboard. | — |
| `usuarios` | Mantener | Distinto dominio de auth que el portal de proveedores. | — |
| `rate_limits`, `sheets_sync_status` | Mantener | Infraestructura. | — |

**Saldo (plan v2):** 40 → 38 tablas y ~20 columnas copiadas o derivadas menos. El número de tablas baja
poco a propósito: **la complejidad real no está en cuántas tablas hay sino en
el estado duplicado** (H3, H4, H6, H9) y en los dos caminos de
`cuentas_pagar`. Ahí está la ganancia.
