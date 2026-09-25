# Plan de la iniciativa activa

**Iniciativa:** Rediseño de la sección Cuentas (Claude Design → implementación)
**Estado:** Borrador en refinamiento.
- Sesión 10 (2026-09-25): diseño final recibido y auditado.
- Sesión 11 (2026-09-25): auditoría end-to-end contra producción (BD, RPCs,
  rutas, UI). Sus hallazgos están en §5.1 y las decisiones D10–D17 que
  salieron de ella, en §3.
- Falta que el usuario confirme los supuestos de la §4 y apruebe los bloques.

Para retomar, ver `docs/ACTIVE_WORK.md` → "Cómo retomar". El zip del diseño
no está en el repo hasta B0: pedírselo al usuario.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Siguiente"/"Después").

---

## 1. Contexto

Se rediseñó `/cuentas` en Claude Design sobre una réplica exacta de la
pantalla actual (sesión 9). El diseño final es **`Cuentas-v2.dc.html`**, más
su lógica y datos de ejemplo en `cuentas-data.js`. Llegó en el zip
`Serenata_ERP_Cuentas_recreation.zip`. Los archivos A (Carpetas), B
(Maestro-detalle) y C (Por paso) fueron la ronda 1 y quedan descartados.
`Cuentas Actual` es la réplica de hoy. Confirmado por el usuario.

El diseño decide **forma y flujo**. Los números salen de las fórmulas vigentes
(decisión 006 y `lib/shared/cierre-proyecto.ts`), no de la aritmética
simplificada del mock. Las operaciones de dinero siguen yendo por RPC atómica
(principio crítico 2).

**Referencia del diseño en el repo:** el Bloque 0 copia `Cuentas-v2.dc.html`,
`cuentas-data.js`, `support.js`, `_ds/` y capturas PNG de cada estado a
`docs/design/cuentas-v2/`. Así cualquier sesión puede abrirlo sin el zip.
Para verlo en local hay que servir la carpeta por HTTP: carga React, Babel y
lucide desde unpkg.

## 2. Qué cambia respecto a hoy

| Hoy | Diseño v2 |
|---|---|
| Tabs Cobrar / Pagar separados | Cobros y pagos juntos por proyecto: "Entradas · clientes" y "Salidas · proveedores" |
| Sin periodo | Periodo por **mes del evento** (pills Ene–Dic con número de pendientes, "Todo el año", selector de año con pendientes). Proyectos sin fecha de evento van al grupo **"Sin fecha"** |
| Métricas: pendiente/total cobrado, pagado y alertas | 4 tarjetas del periodo: Ingresos (cobrado/por cobrar), Egresos (pagado/por pagar), Utilidad bruta (ISR estimado, neta), Impuestos (IVA, retenciones, ISR) |
| Acordeón por proyecto | Tarjeta por proyecto con estado "n pendientes / Cerrada"; al hacer clic, vista **maestro-detalle** (lista de proyectos + panel del proyecto) |
| Lista separada de cobrar y de pagar | Lista única de conceptos: icono entrada/salida, contraparte con su tipo, **Siguiente paso** y vencimiento. Se agrupa por mes con "Todo el año" |
| Estados crudos (`PARCIALMENTE_PAGADO`) | Estados legibles (Sin factura, Facturado, Parcial, Vencido, Sin complemento, Cobrado, En orden, Pagado) y columna **Siguiente paso** |
| Sin filtro por estado | Panel **Filtros**: Estado (Todas/Pendientes/Cerradas), Tipo (Todo/Por cobrar/Por pagar), Cliente y Proveedor con búsqueda. Chips removibles y "Limpiar filtros" |
| Modal de alertas (solo cobros) | Bandeja lateral **Avisos**: cobros vencidos, cobros por vencer, facturas de proveedor faltantes, complementos faltantes y facturas por emitir |
| Botón "Ficha de órdenes de pago" + modal de preview | Bandeja **Órdenes**: "Nueva orden de pago" con resumen y botón, más las últimas 5. **Historial** en modal con filtros (estado, mes, proveedor, proyecto), búsqueda por folio y filas que se expanden al desglose |
| Proyecto sin concepto de cierre | Las cuentas de un proyecto se **cierran solas** cuando todo está cobrado, pagado y con los documentos de D11 ("Cuentas cerradas", D17). **Reabrir** (solo admin) y **Volver a cerrar** |
| Cierre del proyecto: una fila por proveedor | Cierre: Proveedores (agregado), IVA a enterar, Retenciones y ISR estimado, cada uno con su fecha límite ante el SAT, más el resumen de utilidad |
| Detalle: 3 tabs sin contexto | Encabezado con estado, concepto, barra de avance, siguiente paso y saldo. Info con cruce fiscal y bloque "Contacto y pago". Documentos como checklist (requerido/opcional, "Válida"). Pago con estados bloqueado/saldada e historial |
| Pago a proveedor: monto y comprobante | Monto, **tipo** (Transferencia/Efectivo/**Cheque**), **fecha**, comprobante, notas e **historial de pagos** |

## 3. Decisiones confirmadas por el usuario (sesión 10)

| # | Tema | Decisión |
|---|---|---|
| D1 | Archivo final | Solo `Cuentas-v2`. |
| D2 | Complemento de pago | Solo se exige si la factura es **PPD**. Se lee `MetodoPago` del XML de la factura: PPD → hace falta complemento para cerrar; PUE → no. |
| D3 | Pagos a proveedor | **Todo en total a transferir**: neto + IVA − retenciones. Captura, "Pagado / Total", barra de avance, saldo y órdenes van en ese monto. |
| D4 | Números de las tarjetas | Se respeta la forma del diseño, pero los valores salen de las **fórmulas vigentes** (decisión 006 / `calcularCierreProyecto`). |
| D5 | Reabrir | **Habilita correcciones:** anular un pago, reemplazar o quitar documentos, editar fechas y notas, y reasignar el proveedor en una cuenta ya pagada. |
| D6 | Quién reabre | **Solo admin.** Queda registro de quién, cuándo y el motivo (obligatorio). |
| D7 | Estados de orden | **Cancelada:** acción manual que libera las cuentas. **Vencida:** se calcula sola cuando la orden sigue sin pagarse **15 días** después de generada. |
| D8 | Generar orden | **Confirmación breve** antes de generar: proveedores, cuentas y total. |
| D9 | Proyectos sin fecha de evento | Grupo aparte **"Sin fecha"**. |

**Decisiones de la sesión 11** (salieron de la auditoría end-to-end, §5.1):

| # | Tema | Decisión |
|---|---|---|
| D10 | Datos actuales de Cuentas en producción | **Son de prueba.** Se conservan como están y no se hace backfill fino: sin preservar casos históricos ni reconstruir montos transferidos reales. Los backfills existen solo para que ninguna fila rompa la UI nueva. |
| D11 | Documentos obligatorios para cerrar | **Cobro:** factura, más un complemento por cada pago si la factura es PPD. **Pago:** factura del proveedor y comprobante de pago. Sin ellos, el concepto conserva su siguiente paso y el proyecto no se cierra. |
| D12 | Fecha que define el mes | **`proyectos.fecha_entrega`**: el proyecto completo, con sus complementarias, cae en ese mes. Para decidir qué entra a una orden de pago se sigue usando la fecha de cada cotización (regla vigente de la decisión 011). |
| D13 | Órdenes viejas sin pagar | **Salen como "Vencida"** con la regla de 15 días, sin excepción para las anteriores al corte. |
| D14 | Neto o total a transferir fuera de Cuentas | El **Dashboard sigue en neto** (mide costo). El **Portal de proveedores pasa a total a transferir** (el proveedor ve lo que recibe). |
| D15 | Fechas límite ante el SAT en el cierre | Día 17 del mes siguiente al **cobro** (IVA trasladado y pago provisional de ISR) o al **pago al proveedor** (IVA e ISR retenidos). Es flujo de efectivo, no el mes del evento como en el mock. Sin cobro o pago, se muestra "Al cobrar" o "Al pagar", no una fecha. |
| D16 | Complemento de pago (PPD) | **Uno por cada pago registrado**, vinculado a ese pago y validado contra el UUID de la factura y el monto pagado. |
| D17 | Terminología | La UI dice "Cuentas cerradas" / "Cuentas reabiertas", nunca "Proyecto cerrado": "Cierre de proyecto" ya existe (Reporte de Cierre, etapa final, `proyectos.fecha_cierre_real`) y es otra cosa. |

## 4. Supuestos por confirmar (se aplican si no se objetan)

1. **Correcciones sobre un proyecto reabierto:** solo admin, igual que reabrir.
   Mientras el proyecto está reabierto, el resto de los usuarios lo ve pero no
   puede corregir.
2. **"Por vencer" = faltan 10 días o menos** (como en el diseño; hoy son 3).
3. **"Facturas por emitir" (aviso):** cobros sin factura cuyo evento ya pasó o
   es en los próximos 30 días.
4. **Facturas ya subidas (backfill de D2):** se reprocesa el XML guardado para
   leer `MetodoPago`. Si no se puede leer, la cuenta queda como "Método de pago
   desconocido" y el detalle pide marcar PUE o PPD a mano. No se adivina.
5. **Orden de pago (PDF y totales):** en total a transferir, por coherencia con
   D3.
6. **Total a transferir de un grupo:** cuando hay factura validada se toma el
   total del CFDI y se guarda como snapshot. Mientras no hay factura se estima
   con el régimen del proveedor (`calcularEjemploFactura`). Si después cambia el
   régimen, el monto ya facturado no se mueve.
7. **Móvil:** responsive básico. El maestro-detalle se apila en una columna y la
   lista pasa a tarjetas. El diseño no trae pantallas móviles.
8. **El estado de la vista vive en la URL** (año, mes, vista, filtros,
   búsqueda y proyecto seleccionado). Así se puede compartir y recargar sin
   perderlo.
9. **Cuenta suelta (legacy) sin factura: no se paga**, igual que un grupo.
   Por D10 no hay datos reales que proteger. Las cuentas sueltas siguen
   naciendo cuando un renglón no tiene proveedor asignado (decisión 011).
10. **"Admin" = la sección `admin` de `usuarios.sections`.** No hay roles. La
    ruta lo valida con `requireSection('admin')` y pasa `p_usuario` a la RPC
    para la bitácora: la RPC corre con `service_role` y no ve la sesión.
11. **Cuentas sin `proyecto_id`** (hoy 1 cobro y 1 pago) se muestran en un
    grupo "Sin proyecto" dentro de "Sin fecha", no se ocultan.
12. **Pagos anteriores a B2** (D10): su total a transferir se estima con el
    régimen del proveedor y el historial muestra "monto histórico estimado".

## 5. Modelo de dominio (lo que el diseño asume y hoy no existe)

**Concepto:** una fila de Entradas o Salidas.
- Cobro: una `cuentas_cobrar`. Una cotización complementaria es otro concepto
  del mismo proyecto.
- Pago: un `cuentas_pagar_grupos`, que puede traer n items (se muestra
  "Iluminación · 3 conceptos"). Una `cuentas_pagar` sin grupo (legacy: sin
  responsable, o con papeles o pagos previos a la agrupación) es un concepto
  por sí misma.

**Estado visible y siguiente paso.** Se derivan en **una sola función
compartida**, `lib/shared/cuentas/concepto.ts`, con los estados de BD que ya
existen. No se agregan estados nuevos a las tablas.

| Tipo | Estado en BD (+ condición) | Estado visible | Siguiente paso |
|---|---|---|---|
| Cobro | `FACTURA_PENDIENTE` | Sin factura | Emitir factura |
| Cobro | `FACTURADO` | Facturado | Cobrar |
| Cobro | `PARCIALMENTE_PAGADO` | Parcial | Cobrar |
| Cobro | `VENCIDO` | Vencido | Cobrar (en rojo, "Vencido hace n días") |
| Cobro | `PAGADO`, pero a un pago PPD le falta su complemento (D16) | Sin complemento | Subir complemento |
| Cobro | `PAGADO` + `metodo_pago_cfdi` null | Sin complemento | Indicar PUE o PPD (supuesto 4) |
| Cobro | `PAGADO` + (PUE o cada pago con su complemento) | Cobrado | — |
| Pago | grupo `ABIERTO` / suelta `PENDIENTE` sin factura | Sin factura | Subir factura |
| Pago | grupo `FACTURADO` / suelta `PENDIENTE` con factura, sin orden | Facturado | Pagar |
| Pago | con `orden_pago_id` y saldo > 0 | En orden | En orden de pago |
| Pago | grupo `EN_PROCESO_PAGO` **sin** orden (pago parcial directo; la RPC lo permite desde `FACTURADO`) | Parcial | Pagar |
| Pago | suelta `EN_PROCESO_PAGO` o en orden **sin** factura | Sin factura | Subir factura (tiene prioridad sobre "En orden") |
| Pago | `PAGADO` sin comprobante de pago (D11) | Pagado | Subir comprobante |
| Pago | `PAGADO` con factura y comprobante | Pagado | — |

En un cobro PPD con pagos parciales, el complemento de cada pago ya
registrado se pide desde ese momento: el aviso "Complementos faltantes" lo
lista aunque la cuenta siga en Parcial.

La derivación se hace con `monto_pagado` frente al total y con los
documentos, **no con `estado` solo**. `estado = EN_PROCESO_PAGO` hoy significa
dos cosas: "en orden" y "pago parcial" (`registrar_pago_grupo_factura` lo
pone a las hijas con pago parcial). Tests: una fila por renglón de esta
tabla.

**Cuentas cerradas (D17):** todos sus conceptos sin siguiente paso **y** sin
reapertura activa. Los documentos de D11 cuentan: un concepto pagado sin
comprobante sigue abierto.
- Es un valor derivado: no hay columna "cerrado". Solo se guarda la reapertura
  (D5/D6).
- La fecha "Cerrada automáticamente el …" es la del último evento que dejó
  todo resuelto: último pago, complemento, comprobante o factura.

**Periodo (D12):** el mes sale de `proyectos.fecha_entrega`, un texto con
formato `YYYY-MM-DD` o null (verificado en producción). Un valor que no
cumpla el formato va a "Sin fecha".

**Cifras del periodo (D4):**
- Ingresos = Σ `monto_total` de los cobros, con IVA, partido en cobrado y por
  cobrar.
- Egresos = Σ total a transferir de los pagos (D3), partido en pagado y por
  pagar.
- Utilidad bruta, ISR estimado y neta, IVA a enterar y retenciones salen de
  `calcularCierreProyecto` sumado por proyecto.
- Por eso **Ingresos − Egresos ≠ Utilidad bruta** (el IVA es de terceros). La
  UI no las presenta como una resta.
- **Dónde se calcula:** la RPC trae los datos por proyecto y la **ruta**
  aplica `calcularCierreProyecto` y suma, como ya hace
  `/api/cuentas/por-proyecto`. No se porta la lógica fiscal a SQL: sería un
  segundo motor (principio 7).
- El egreso de Cuentas (total a transferir) no coincide con el "por pagar"
  del Dashboard (neto, D14). Se rotula distinto: "Por transferir" frente a
  "Costo por pagar".

### 5.1 Hallazgos de la auditoría end-to-end (sesión 11)

Verificados contra producción (`serenata-erp`) y test por MCP, solo lectura.
Cada uno ya está reflejado en los bloques.

| # | Hallazgo | Dónde se atiende |
|---|---|---|
| H1 | `generar-orden-pago` **no es atómico**: sube el PDF, inserta la orden y luego actualiza los grupos sin guarda `estado='FACTURADO'`. Dos clics simultáneos meten los mismos grupos en dos órdenes. | B1b |
| H2 | La RPC de candidatos incluye cuentas sueltas `PENDIENTE` (`UNION ALL`), pero el POST solo marca `grupoIds`. Esas cuentas entran al PDF y al total **sin quedar marcadas**, y vuelven a entrar en la siguiente orden. | B1b |
| H3 | `registrar_pago_cuenta_pagar` regresa a `PENDIENTE` una suelta con pago parcial aunque esté en una orden. Así vuelve a ser candidata a otra orden. | B1b |
| H4 | `PUT /api/cuentas-cobrar` acepta `estado` y `monto_pagado` directos, sin Zod ni RPC. `PUT /api/cuentas-pagar` acepta `orden_pago_id`. La UI no las usa, pero cualquier usuario con la sección `cuentas` puede llamarlas. | B1b |
| H5 | `subir-complemento` no valida el XML y no tiene Zod. `complemento-parser.ts` **no se usa en ningún lado**, está hecho con regex (la clase de bug que ya se corrigió en `factura-parser`) y no lee `IdDocumento`. | B1 |
| H6 | El UUID de la factura (`uuid_timbrado`) se extrae pero **no se guarda**, así que no se puede validar un complemento contra su factura. | B1 |
| H7 | "Hoy" en UTC en `sync_estados_cuentas_cobrar_vencidas` y en `cuentas_pagar_grupos_facturados_eventos_realizados`. | B3 (helper CDMX) |
| H8 | Estado de la orden calculado con `monto_pagado >= x_pagar` (neto). Si la conversión transferido → neto no cierra exacta en el último pago, la orden nunca llega a `COMPLETADA`. | B2 |
| H9 | Las órdenes existentes guardan `total_monto` en neto; las nuevas serán en total a transferir. | B6 (columna `base_monto`) |
| H10 | `calcularCierreProyecto` siempre estima con el régimen del proveedor. Con el snapshot del CFDI (supuesto 6), cierre y saldo mostrarían números distintos. | B2 |
| H11 | `serenata-erp-test` tiene 0 cuentas sueltas, 0 órdenes y 0 XML: no reproduce las formas de datos de producción. | B0 (seed) |
| H12 | Faltan columnas para B7: baja lógica en `documentos_cuentas_*`, anulación en `pagos_comprobantes`, y ampliar el CHECK de `pago_operations.dominio`. `cuentas_pagar.estado` no tiene CHECK. | B2, B7 |
| H13 | Existen 1 cobro y 1 pago sin `proyecto_id`. | Supuesto 11 |

Referencia de volumen en producción (2026-09-25):
- 27 proyectos, 34 cobros y 86 cuentas por pagar (47 sueltas y 30 grupos);
- 8 órdenes (6 `GENERADA` desde abril);
- 6 XML de factura de cobro.

## 6. Infraestructura que se reutiliza

- **RPCs de dinero** (no se recrean, se extienden):
  - `registrar_pago_cuenta_cobrar`;
  - `registrar_pago_grupo_factura` / `registrar_pago_cuenta_pagar`;
  - `reasignar_responsable_cuenta_pagar`;
  - `reconcile_cuenta_pagar_grupo`;
  - `pago_operations` (idempotencia).
- **Lectura:**
  - `cuentas_por_proyecto` (hoy sin parámetros; trae todo);
  - `buscar_cuentas_cobrar`, `buscar_cuentas_pagar_grupos` y
    `buscar_ordenes_pago`;
  - `cuentas_pagar_grupos_facturados_eventos_realizados` (candidatos a orden).
- **Fiscal:**
  - `lib/shared/cierre-proyecto.ts` y `calcularEjemploFactura`;
  - `lib/server/xml/factura-parser.ts` (se le agregan `MetodoPago` y se
    guarda el UUID);
  - `complemento-parser.ts` existe pero sin uso y con regex: se reescribe con
    `fast-xml-parser`, como `factura-parser`.
- **Estados de cobro:** `lib/server/cuentas/status.ts` y
  `sync_estados_cuentas_cobrar_vencidas`.
- **UI** (`components/ui`): FilterTabs, StatusBadge, SearchInput, Modal, Select,
  TextField, DateField, Button, Metric, TableFooter. Falta ProgressBar, un Field
  reutilizable (hoy vive local en `TabInformacion`) y los iconos nuevos del
  diseño en `Icon.tsx` (folder, bell, layers, sliders-horizontal, file-down,
  circle-dashed, circle-check, triangle-alert, rotate-ccw, lock, paperclip,
  arrow-down-left, arrow-up-right, upload).
- **Subidas:** `lib/server/uploads/factura-validation.ts` y el flujo de
  Documentos actual (Drive).
- **Tests:** `tests/e2e/critical/cuentas-*.spec.ts`,
  `tests/e2e/utils/cuentas-mocks.ts` y los tests de hooks de cuentas.

## 7. Bloques

Cada bloque va en su propio PR hacia `main` y se mergea en verde. La UI actual
sigue funcionando hasta el Bloque 8: la nueva se construye al lado, en la
misma ruta detrás de `?v=2`, y se cambia al final.

**B0 — Referencia, reglas y datos de prueba.**
- Diseño a `docs/design/cuentas-v2/`.
  - El zip **no trae capturas de v2**, solo las de la réplica: se generan con
    Playwright sirviendo el mock.
  - Se descartan `Cuentas-A/B/C` y `Cuentas Rediseño.dc.html` (ronda 1).
- Decisión nueva `docs/decisions/017-rediseno-cuentas.md` con D2, D3,
  D5–D17, el modelo de la sección 5 y los supuestos aceptados.
- Seed para `serenata-erp-test` con las formas de datos de producción (H11):
  - sueltas en orden sin factura;
  - grupo con pago parcial sin orden;
  - orden vieja sin pagar;
  - cobro PPD con dos pagos;
  - cuentas sin `proyecto_id`.
  El script es idempotente y vive en `scripts/`. Con él, este bloque ya no es
  solo documentación: va con PR.

**B1b — Blindaje previo (bugs vigentes).** Va antes de todo lo demás porque
son bugs de hoy, no del rediseño.
- RPC `generar_orden_pago(p_candidatos, p_pdf_url, p_pdf_nombre, p_total,
  p_usuario)`, atómica (H1, H2):
  - bloquea los candidatos con `FOR UPDATE`;
  - revalida su estado;
  - inserta la orden;
  - marca grupos **y** sueltas.
  Si otro proceso ya los tomó, falla explícito. El PDF se sube antes; si la
  RPC falla, queda un archivo huérfano en Drive y se registra en el log. La
  ruta la llama en lugar de las tres escrituras sueltas.
- `registrar_pago_cuenta_pagar` conserva `EN_PROCESO_PAGO` si la cuenta está
  en una orden (H3). Se parte de la definición vigente en `pg_proc`
  (norma de la decisión 011).
- `PUT /api/cuentas-cobrar` y `PUT /api/cuentas-pagar`: se retiran (sin
  consumidores en la UI; confirmar con grep) o se reducen a `notas` con Zod
  (H4).
- CHECK de `cuentas_pagar.estado` (H12).
- Tests: concurrencia de dos generaciones en `live` y suelta con pago parcial
  en orden.

**B1 — Derivación y datos fiscales base.**
- `lib/shared/cuentas/concepto.ts`: estado visible, siguiente paso, vencimiento
  y cuentas cerradas. Tests unitarios con cada fila de la tabla de la sección 5.
- Migración:
  - `cuentas_cobrar.metodo_pago_cfdi` (`PUE`/`PPD`/null) y
    `cuentas_cobrar.uuid_cfdi` (H6);
  - `pagos_comprobantes.tipo_pago` acepta `CHEQUE`;
  - `documentos_cuentas_cobrar.pago_id` (FK a `pagos_comprobantes`): un
    complemento por pago (D16).
- `factura-parser` lee `MetodoPago`; `subir-factura` de cobrar guarda el
  método y el UUID.
- `complemento-parser` reescrito con `fast-xml-parser` (H5). Lee
  `IdDocumento`, `ImpPagado`, `FechaPago` y `MontoTotalPagos`.
- `subir-complemento`:
  - Zod;
  - recibe el `pago_id`;
  - valida que `IdDocumento` sea el UUID de la factura y que `ImpPagado`
    coincida con el pago (±0.01);
  - si algo no cuadra, guarda con `estado_validacion = 'revision'`, igual que
    las facturas.
- Script de backfill idempotente (supuesto 4, D10): lee los XML de Drive y
  reporta los que no pudo leer. Corre desde local con credenciales de Drive
  porque Drive está apagado en Preview.

**B2 — Pagos a proveedor en total a transferir (D3).** Bloque de mayor riesgo;
va solo.
- Migración:
  - `total_a_transferir` (snapshot, supuesto 6) y `monto_transferido` en
    `cuentas_pagar_grupos` **y** en `cuentas_pagar` (se usan solo en las
    sueltas);
  - tabla `pagos_cuentas_pagar` con `grupo_id` o `cuenta_pagar_id` (CHECK
    exclusivo, como en `documentos_cuentas_pagar`): monto transferido, monto
    neto aplicado, tipo (`TRANSFERENCIA`/`EFECTIVO`/`CHEQUE`), fecha,
    comprobante, notas, `created_by`, `anulado_at/por/motivo`;
  - backfill simple (D10, supuesto 12): snapshot estimado para todos, y una
    fila "histórica estimada" por cada pago existente.
- RPC nueva versión de `registrar_pago_grupo_factura` / `_cuenta_pagar`: recibe
  el monto transferido, tipo, fecha y notas; valida contra el total a
  transferir; guarda el pago y **convierte a neto proporcional** para
  `cuentas_pagar.monto_pagado`.
  - Los items siguen en neto (regla 8 intacta), así que utilidad, Dashboard y
    Sheets no cambian.
  - Idempotente vía `pago_operations`.
  - **Regla del último pago (H8):** cuando el transferido acumulado llega al
    total a transferir, el neto aplicado es exactamente `monto_total − neto ya
    pagado`, sin proporción. Así el grupo y la orden cierran al centavo.
  - Una suelta o un grupo sin factura no se paga (supuesto 9).
- `calcularCierreProyecto` usa el snapshot del CFDI cuando existe y el
  estimado solo si no hay factura (H10). Test de ambos casos.
- Portal de proveedores en total a transferir (D14): `app/api/portal/cuentas`
  y `app/portal/page.tsx`. El Dashboard no cambia.
- Ruta de registrar pago con Zod actualizado.
- En la UI actual solo cambian la etiqueta y el prellenado del monto.
- Test de cuadre: Σ neto de items = monto transferido × neto / total, al
  centavo.

**B3 — Lectura por periodo (backend).**
- RPC `cuentas_periodo(p_year, p_month | 'all' | 'sin_fecha', filtros, búsqueda)`:
  - proyectos del periodo con sus conceptos (estados de BD y lo necesario para
    derivar);
  - pendientes por mes y años con pendientes;
  - totales para las tarjetas.
- Filtros y búsqueda en SQL (folio, proyecto, cliente, contraparte y concepto).
- Totales fiscales en la ruta con `calcularCierreProyecto`, no en SQL (§5).
- RPC `cuentas_conceptos(...)` paginada para la vista Lista.
- Índice por `proyectos.fecha_entrega` (D12).
- Helper SQL `hoy_cdmx()` que usan las RPCs nuevas. Se corrigen las dos RPCs
  vigentes que usan UTC (H7), partiendo de su versión en `pg_proc`.
- Rutas `GET /api/cuentas/periodo` y `GET /api/cuentas/conceptos`, con
  `requireSection('cuentas')` y Zod.
- `cuentas_por_proyecto` sigue viva hasta B8.

**B4 — Pantalla principal nueva (`?v=2`).**
- Barra de periodo, Por proyecto (tarjetas y maestro-detalle), Lista, tarjetas
  de cifras, panel de filtros con chips y búsqueda, y "Agrupar por mes".
- Cierre del proyecto con el formato nuevo.
- Estado en la URL.
- Estados vacíos ("Sin cuentas en este periodo con estos filtros").
- Tokens `--sn-*` y primitivos existentes; se agregan ProgressBar, Field e
  iconos.

**B5 — Detalle del concepto (modal nuevo).**
- Encabezado con avance.
- Información:
  - Cobro: campos y notas.
  - Pago: reasignar, grupo con desglose, cruce fiscal, contacto, orden
    vinculada e historial de reasignaciones.
- Documentos: checklist requerido/opcional según D11, "Válida" según
  `estado_validacion`, aviso de grupo.
  - Complemento: **un renglón por pago** (D16), requerido solo si la factura
    es PPD; si el método es desconocido, se pide elegir.
  - Comprobante de pago del proveedor: requerido una vez pagado.
- Registrar pago: cobro y pago con tipo y fecha, bloqueado sin factura con
  botón "Ir a Documentos", saldada, historial de pagos.

**B6 — Avisos y órdenes.**
- Ruta `GET /api/cuentas/avisos` con las 5 categorías (supuestos 2 y 3).
  Reemplaza a `/api/cuentas-cobrar/alertas`.
- Bandeja lateral: Avisos lleva al proyecto y periodo; Órdenes muestra "Nueva
  orden" con confirmación (D8) y las últimas 5.
- Migración de órdenes:
  - estado `CANCELADA`, con `cancelada_at/por/motivo`;
  - `base_monto` (`NETO` para las existentes, `TRANSFERIR` para las nuevas;
    H9). El historial la rotula;
  - RPC `cancelar_orden_pago`: atómica, simétrica a `generar_orden_pago`
    (B1b), solo sin pagos registrados. Regresa sus grupos a `FACTURADO` y sus
    sueltas a `PENDIENTE`, y quita el `orden_pago_id`.
- `VENCIDA` derivada a 15 días desde `fecha_generacion` en hora CDMX (D7), sin
  columna. Aplica también a las órdenes existentes (D13).
- `buscar_ordenes_pago` extendida: filtros estado/mes/proveedor/proyecto,
  búsqueda por folio y desglose por orden.
- Modal de historial.
- PDF de la orden en total a transferir (supuesto 5).

**B7 — Reabrir, volver a cerrar y correcciones (D5, D6).**
- Tabla `cuentas_reaperturas` (proyecto, abierta por/cuándo/motivo, cerrada
  por/cuándo) y bitácora `cuentas_correcciones`.
- Migración (H12):
  - `anulado_at/por/motivo` en `pagos_comprobantes`;
  - `eliminado_at/por/motivo` y `reemplazado_por` en
    `documentos_cuentas_cobrar` y `documentos_cuentas_pagar`;
  - el CHECK de `pago_operations.dominio` acepta las operaciones de anulación.
- Admin según el supuesto 10: `requireSection('admin')` en la ruta y
  `p_usuario` en la RPC.
- RPCs `reabrir_cuentas_proyecto` / `cerrar_cuentas_proyecto` (solo admin).
- Correcciones, todas validadas en servidor contra "proyecto reabierto y
  usuario admin":
  - RPCs atómicas de anular pago (cobro y proveedor): recalculan saldo, estado
    del concepto y estado de la orden; dejan el pago marcado, no lo borran;
  - reemplazar o quitar documentos: baja lógica, el anterior queda en el
    historial;
  - editar fechas y notas (PATCH con Zod);
  - reasignar proveedor en cuenta pagada: se amplía la guarda de
    `reasignar_responsable_cuenta_pagar`.

**B8 — Corte y limpieza.**
- `/cuentas` usa la UI nueva y se quita `?v=2`.
- Se retiran `CuentasPorProyecto`, `CuentasTable`, `OrdenPagoModal`, el modal
  de alertas y `cuentas_por_proyecto` / `alertas` si ya no los usa nadie
  (buscar antes).
- También `cuentas_pagar_pendientes_eventos_realizados` y las secuencias
  `seq_cc_2026` / `seq_cp_2026`, si siguen sin uso.
- E2E de Cuentas reescritos al flujo nuevo.
- `ARCHITECTURE.md` actualizado.
- Prueba manual del usuario en el Preview.

**Dependencias:** B0 → B1b → B1 → B2 y B3 (pueden ir en paralelo) → B4 → B5
→ B6 → B7 → B8. B6 depende también de B2 (montos de la orden) y de B1b
(`generar_orden_pago`).

## 8. Riesgos

**P0**
- **Mezclar neto y total a transferir (D3).** Si un cálculo toma el monto
  transferido como neto, se rompen la utilidad, el cierre y el Dashboard.
  - Mitigación: los items quedan en neto, el grupo y los pagos guardan el
    transferido, y la conversión vive solo en la RPC.
  - Tests de cuadre y paridad del Dashboard antes y después de B2.
- **Anular pagos (B7).** Toca saldos, estados de grupo y de orden y el
  idempotency log.
  - Mitigación: RPC atómica única por tipo, nunca lógica en Node.
  - Test live de concurrencia (anular mientras otro registra).
  - El pago anulado se conserva con su motivo.
- **Backfill de `MetodoPago` (B1).** Si se clasifica mal, se cierran proyectos
  que no debían (falta un complemento) o salen avisos falsos.
  - Mitigación: supuesto 4, sin adivinar; reporte de pendientes antes de
    activar el cierre automático.
- **Órdenes duplicadas (H1–H3, vigente hoy).** Una cuenta puede entrar a dos
  órdenes y pagarse dos veces.
  - Mitigación: B1b va primero, con test de concurrencia en `live`.

**P1**
- **Escala.** `cuentas_por_proyecto` trae todo sin paginar. Con ~1,000
  proveedores y años de historia, "Todo el año" y la lista lo resienten.
  - Mitigación: B3 filtra por periodo en SQL y pagina la lista.
- **Zona horaria.** "Hoy" para vencimientos, órdenes vencidas y "evento ya
  realizado" debe ser CDMX, igual que `siguiente_folio`. Hoy hay RPCs que usan
  UTC.
- **`fecha_entrega` es texto.** Validar el formato antes de agrupar por mes;
  los valores inválidos van a "Sin fecha".
- **Cancelar una orden ya enviada al contador.** La RPC exige que no tenga
  pagos y la UI pide confirmación.
- **Consumidores de estados y montos:**
  - Dashboard (`dashboard_kpis_cuentas`, `dashboard_egresos_por_bucket`):
    sigue en neto (D14);
  - Portal: pasa a total a transferir (D14);
  - espejo de Sheets, `documentos-autofill` y Reporte de Cierre
    (`lib/server/projects/cierre-proyecto.ts`, suma `monto_pagado` neto).
  Buscar todos los usos antes de B2 y B6.
- **Fechas SAT (D15)** dependen de fechas de cobro y pago. Si falta la fecha,
  se muestra "Al cobrar" o "Al pagar", nunca una fecha inventada.
- **Permisos.** Reabrir y corregir exigen admin en servidor, no solo ocultar
  botones.

**P2**
- El build depende de Google Fonts (deuda conocida).
- No hay diseño móvil (supuesto 7).
- El mock carga React, Babel y lucide desde unpkg; solo afecta a la
  referencia, no a la app.
- Las cifras del mock no coinciden con las reales (D4). Avisar en la prueba
  manual para que no se lean como un bug.

## 9. Validación

- **Unitarios:**
  - derivación de estados, siguiente paso y cierre (una fila por caso de la
    tabla);
  - conversión transferido → neto con la regla del último pago;
  - lectura de `MetodoPago` y UUID;
  - parser de complemento y su validación contra la factura;
  - vencida a 15 días en hora CDMX;
  - fechas SAT por cobro o pago;
  - cifras del periodo contra `calcularCierreProyecto`.
- **Migraciones:** job `fresh-db` y `Migrations` en verde.
- **Paridad:** pendientes y totales de B3 contra `cuentas_por_proyecto` y
  `dashboard_kpis_cuentas` en `serenata-erp-test`, con el seed de B0.
- **E2E critical:**
  - periodo y filtros;
  - maestro-detalle;
  - detalle con sus 3 tabs;
  - registrar pago de cobro y de proveedor (total a transferir);
  - generar y cancelar orden;
  - reabrir, anular pago y volver a cerrar.
- **E2E live:** registrar y anular pago en concurrencia; dos generaciones de
  orden simultáneas (B1b); generar y cancelar orden contra la base de test.
- **Manual:** el usuario en el Preview de B8 con datos reales de test.
- **Regla de siempre:** tsc, lint, `npm test`, build, smoke, critical y `live`
  en verde en cada PR.

## 10. Tracker

| Bloque | Estado |
|---|---|
| Réplica del estado actual | Hecho (sesión 9) |
| Rediseño en Claude Design | Hecho (usuario) |
| Auditoría del diseño y plan | Hecho (sesión 10) |
| Auditoría end-to-end y decisiones D10–D17 | Hecho (sesión 11). Falta confirmar la §4 y aprobar |
| B0 Referencia, reglas y seed | Pendiente |
| B1b Blindaje previo | Pendiente |
| B1 Derivación y datos fiscales | Pendiente |
| B2 Pagos en total a transferir | Pendiente |
| B3 Lectura por periodo | Pendiente |
| B4 Pantalla principal | Pendiente |
| B5 Detalle | Pendiente |
| B6 Avisos y órdenes | Pendiente |
| B7 Reabrir y correcciones | Pendiente |
| B8 Corte y limpieza | Pendiente |

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).

Última iniciativa cerrada: "Actualización de formatos PDF vía Claude Design"
— historia en `docs/archive/actualizacion-formatos-pdf-claude-design.md`.
