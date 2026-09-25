# Plan de la iniciativa activa

**Iniciativa:** Rediseño de la sección Cuentas (Claude Design → implementación)
**Estado:** Listo para aprobar. Supuestos confirmados y auditoría final
hecha (sesión 14); no quedan dudas de producto ni de negocio.
- Sesión 10 (2026-09-25): diseño final recibido y auditado.
- Sesión 11 (2026-09-25): auditoría end-to-end contra producción (BD, RPCs,
  rutas, UI). Sus hallazgos están en §5.1 y las decisiones D10–D17 que
  salieron de ella, en §3.
- Sesión 12 (2026-09-25): **diseño final** recibido como paquete de handoff
  (`design_handoff_cuentas/`, con escritorio, móvil, capturas y README).
  - Se re-auditó el plan contra ese diseño y salieron D18–D21.
  - La comparación del diseño con las reglas vigentes está en §5.2 y §5.3.
- Sesión 13 (2026-09-25): auditoría de regresiones del plan completo contra
  el código y la BD. Salieron R1–R13 (§5.4), D22–D23 y las reglas
  transversales de §7.0.
- Sesión 14 (2026-09-25): el usuario **confirmó los supuestos de la §4**.
  Auditoría final: A1–A5 (§5.5), decisiones de arquitectura ya integradas en
  los bloques.
- Sesión 15 (2026-09-25): auditoría de optimización (§5.6), O1–O10
  integrados. D24: el corte (B8) va antes de B7.
- Sesión 16 (2026-09-25): revisión de reutilización contra el repo (§5.7):
  U1–U10 y dos huecos corregidos (A2 incompleto; totales del CFDI sin guardar).
- Falta que el usuario apruebe el plan para pasarlo a "Aprobado".

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
pantalla actual (sesión 9). El **diseño final** llegó en la sesión 12 como
paquete de handoff `design_handoff_cuentas/`, dentro del zip
`Serenata_ERP_Cuentas_recreation.zip`:
- `README.md`: reglas, pantallas, tokens y 9 pendientes que el diseño no
  define (ver §5.3).
- `capturas/escritorio/` (13 PNG) y `capturas/movil/` (21 PNG, incluidos los
  estados y el tema oscuro). **Son la referencia visual definitiva.**
- `abrir-directo/Cuentas-Escritorio.html` y `Cuentas-Movil.html`: prototipos
  autocontenidos que se abren con doble clic.
- `codigo-fuente/`: `Cuentas-Escritorio.dc.html`, `Cuentas-Movil.dc.html`,
  `Cuentas-Movil-Pantallas.dc.html`, `cuentas-data.js` (reglas del prototipo:
  `compute`, `conceptDetail`, `ordenPreview`) y `support.js`. No se abren
  solos, porque dependen de `_ds/`, que no viene incluido.

Respecto a `Cuentas-v2` (sesión 10), la lógica de `cuentas-data.js` solo
agrega `ordenPreview`, la generación de orden con selección por responsable.
Lo nuevo es la **versión móvil completa**, la generación de orden rediseñada y
el README. `Cuentas-v2`, la ronda 1 (A/B/C) y `Cuentas Actual` quedan
sustituidos.

El diseño decide **forma y flujo**. Los números salen de las fórmulas vigentes
(decisión 006 y `lib/shared/cierre-proyecto.ts`), no de la aritmética
simplificada del mock. Las operaciones de dinero siguen yendo por RPC atómica
(principio crítico 2).

**El diseño no es código para copiar.** Se recrea con los componentes y
tokens de Serenata (README, "Sobre los archivos"). La lógica de
`cuentas-data.js` es una especificación de reglas, **sujeta a las decisiones
de este plan**: donde choca con la decisión 006, con D4 o con D15, gana el
plan (§5.2).

**Referencia del diseño en el repo:** B0 copia `design_handoff_cuentas/`
completo a `docs/design/cuentas/`. Los prototipos de `abrir-directo/` se
abren sin servidor.

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
| Generar orden: preview de todo lo elegible, sin elegir | Modal con **tarjetas por responsable colapsadas**, casilla para incluir o excluir, cruce fiscal por responsable, sección **"No incluidas"** con motivo, pie fijo con total a transferir y confirmación "Orden generada" |
| Móvil: la pantalla de escritorio encogida y el menú del sidebar | **Diseño móvil propio:** hojas inferiores para proyecto, detalle, filtros y periodo; pantallas empujadas para Avisos y Órdenes; carrusel de totales; barra de pestañas inferior (D19); "Tomar foto o adjuntar" y "Compartir PDF" |

## 3. Decisiones confirmadas por el usuario (sesión 10)

| # | Tema | Decisión |
|---|---|---|
| D1 | Archivo final | ~~Solo `Cuentas-v2`~~ → sustituido en la sesión 12 por el handoff `design_handoff_cuentas/` (escritorio + móvil). |
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

**Decisiones de la sesión 12** (diseño final):

| # | Tema | Decisión |
|---|---|---|
| D18 | Monto del pago a proveedor en pantalla | **Todo en total a transferir** (reafirma D3): tablas, "Pagado / Total", encabezado del detalle, barra, saldo, formulario y avisos. El diseño muestra el neto en las tablas y el encabezado; se corrige en la implementación. El neto solo aparece en el cruce fiscal. |
| D19 | Barra de pestañas móvil | **Solo dentro de `/cuentas`.** El resto de la app conserva su navegación móvil actual. "Más" abre la hoja "Secciones" con los mismos items y permisos que `SidebarLayout`. |
| D20 | Base del monto de una orden | **Total a transferir**, en "Nueva orden", el modal, el PDF **y el historial**. El historial del diseño muestra neto; se corrige. Las 8 órdenes viejas son de prueba (D10) y se muestran como están, sin columna `base_monto` (O6). Confirma el supuesto 5. |
| D21 | Reasignar responsable | **Solo en conceptos sueltos.** En un concepto agrupado, el select del encabezado se desactiva y se reasigna **renglón por renglón** desde el desglose del grupo, con `reasignar_responsable_cuenta_pagar` sin cambios (grupo `ABIERTO`, o proyecto reabierto por admin, D5). |

**Decisiones de la sesión 13** (auditoría de regresiones):

| # | Tema | Decisión |
|---|---|---|
| D22 | Cancelar una cotización aprobada (hoy falla, R1) | Solo se permite **sin dinero ni órdenes**: sin cobros, sin pagos a proveedor y sin cuentas dentro de una orden de pago. Tampoco si alguna de sus cuentas pertenece a un grupo ya facturado (no `ABIERTO`): la factura del proveedor dejaría de cuadrar (misma guarda que la reasignación, decisión 011, A4). Si se permite, borra proyecto, cuentas, grupos y documentos en una sola transacción, en el orden correcto de llaves foráneas. |
| D23 | Encabezado móvil en `/cuentas` | **Se oculta**: en Cuentas móvil solo queda la barra de pestañas (D19), como en el diseño. El resto de la app no cambia. |

**Decisión de la sesión 15:**

| # | Tema | Decisión |
|---|---|---|
| D24 | Orden de corte | **B8 (corte a la UI nueva) va antes de B7 (reabrir y correcciones).** Así se acorta el tiempo con dos UIs en paralelo. La UI actual tampoco tiene reabrir ni anular pagos, así que no hay regresión. B7 se construye solo sobre la UI nueva. |

## 4. Supuestos (confirmados por el usuario en la sesión 14)

1. **Correcciones sobre un proyecto reabierto:** solo admin, igual que reabrir.
   Mientras el proyecto está reabierto, el resto de los usuarios lo ve pero no
   puede corregir.
2. **"Por vencer" = faltan 10 días o menos** (como en el diseño; hoy son 3).
3. **"Facturas por emitir" (aviso):** cobros sin factura cuyo evento ya pasó o
   es en los próximos 30 días.
4. **Facturas ya subidas (backfill de D2):** se reprocesa el XML guardado para
   leer `MetodoPago`. Si no se puede leer, la cuenta queda como "Método de pago
   desconocido" y el detalle pide marcar PUE o PPD a mano. No se adivina.
5. ~~Orden de pago en total a transferir~~ → **confirmado como D20.**
6. **Total a transferir de un grupo:** cuando hay factura validada se toma el
   total del CFDI y se guarda como snapshot. Mientras no hay factura se estima
   con el régimen del proveedor (`calcularEjemploFactura`). Si después cambia el
   régimen, el monto ya facturado no se mueve.
7. ~~Móvil: responsive básico~~ → **sustituido:** el diseño final trae
   móvil completo y se implementa tal cual (D19).
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
13. **Elegibles para orden** (diseño, `ordenPreview`): pagos **con saldo** y
    factura, sin orden, cuyo evento ya pasó.
    - Incluye el grupo con pago parcial directo (`EN_PROCESO_PAGO` sin
      orden). Hoy la RPC de candidatos solo toma `FACTURADO`.
    - La orden cubre el **saldo**, no el total. Hoy `buildOrdenPagoPreview`
      suma `x_pagar` completo aunque haya pago previo.
    - "Evento ya pasó" se mide por **cada cotización** del grupo (decisión
      011, D12), no por la fecha del proyecto como en el mock. El motivo
      "Evento el <fecha>" muestra la fecha más tardía.
14. **PDF de la orden** (pendiente 1 del README): se conserva el formato
    vigente (`lib/server/pdf/orden-pago-pdf.ts`, decisión 015). Se le agregan
    el cruce fiscal por responsable (subtotal, IVA, retenciones y total a
    transferir) y el total general a transferir. No hace falta otra ronda de
    Claude Design salvo que el usuario la pida.
15. **Límite de archivo: 4 MB por archivo** (diseño; hoy son 10 MB). Una
    función de Vercel no acepta cuerpos mayores de ~4.5 MB, así que XML y PDF
    se suben **en peticiones separadas**, no juntos en un solo `FormData` como
    hoy.
16. **Descargar y "Compartir PDF" usan el enlace de Drive** (`pdf_url`),
    confirmado por el usuario en la sesión 12.
    - Los archivos viven en Drive; Supabase solo guarda el enlace, como todos
      los documentos del sistema.
    - En móvil, "Compartir" pasa el **enlace** a la Web Share API. Si el
      navegador no la soporta, lo copia al portapapeles.
    - `uploadFileToDrive` no fija permisos: cada archivo hereda los de su
      carpeta. El enlace abre para quien tenga acceso a "Ordenes de Pago" en
      Drive. Si hay que compartirlo con alguien de fuera, se comparte la
      carpeta desde Drive. No hay cambios de código ni ruta nueva.
17. **Comprobante del pago a proveedor (D11):** se adjunta en el formulario de
    "Registrar pago", como en el diseño, y no en Documentos. Si se registró
    sin comprobante, el siguiente paso es "Subir comprobante" y se adjunta
    desde el historial de pagos ("Ver" / "Adjuntar").
18. **Moneda con 2 decimales** (`$174,000.00`, pendiente 9 del README):
    convención vigente en `lib/quotations/format.ts` y en los PDF.
19. **Corte a móvil en el breakpoint `md` (768px)** de la app, no en los 720px
    del prototipo, para no crear un segundo breakpoint.
20. **`?v=2` solo para usuarios con la sección `admin`** mientras duran B4–B6.
    La vista nueva escribe sobre datos reales de producción; así se prueba sin
    exponer una UI a medias al resto del equipo. En B8 se abre a todos.
21. **Las tablas nuevas no se reflejan en Google Sheets**: `pagos_cuentas_pagar`,
    `cuentas_reaperturas` y `cuentas_correcciones`. Las columnas nuevas de
    tablas que ya se reflejan tampoco se agregan. Sheets es espejo de
    consulta (principio 1); si hace falta, se amplía en otra iniciativa.

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
| Cobro | `PAGADO` + método del XML vigente null | Sin complemento | Indicar PUE o PPD (supuesto 4) |
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
  del Dashboard (neto, D14). Cuentas usa las etiquetas del diseño ("Egresos",
  "Pagado", "Por pagar") con una nota "IVA incluido, menos retenciones". **El
  Dashboard no se toca** (O9).

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
| H9 | Las órdenes existentes guardan `total_monto` en neto; las nuevas serán en total a transferir. | Sin cambio: son datos de prueba (D10, O6) |
| H10 | `calcularCierreProyecto` siempre estima con el régimen del proveedor. Con el snapshot del CFDI (supuesto 6), cierre y saldo mostrarían números distintos. | B2 |
| H11 | `serenata-erp-test` tiene 0 cuentas sueltas, 0 órdenes y 0 XML: no reproduce las formas de datos de producción. | B0 (seed) |
| H12 | Faltan columnas para B7: baja lógica en `documentos_cuentas_*`, anulación en `pagos_comprobantes`, y ampliar el CHECK de `pago_operations.dominio`. `cuentas_pagar.estado` no tiene CHECK. | B2, B7 |
| H13 | Existen 1 cobro y 1 pago sin `proyecto_id`. | Supuesto 11 |

Referencia de volumen en producción (2026-09-25):
- 27 proyectos, 34 cobros y 86 cuentas por pagar (47 sueltas y 30 grupos);
- 8 órdenes (6 `GENERADA` desde abril);
- 6 XML de factura de cobro.

### 5.2 Reglas del prototipo que NO se adoptan

El README del handoff describe la aritmética del mock. Estas reglas chocan
con decisiones ya tomadas y **no se implementan así**:

| Regla del prototipo | Qué se hace | Por qué |
|---|---|---|
| Utilidad bruta = Ingresos − Egresos | `calcularCierreProyecto`: margen + fee de cotizaciones aprobadas | D4, decisión 006. Ingresos y Egresos llevan IVA de terceros. |
| IVA a enterar = (cobros − pagos) × 16% | IVA cobrado − IVA trasladado por proveedores | Decisión 006. La resta del mock mezcla montos con y sin IVA. |
| Fecha límite SAT = día 17 del mes siguiente al **evento** | Día 17 del mes siguiente al **cobro o pago** | D15 (flujo de efectivo). |
| Cruce fiscal de la orden sobre el neto **sumado por responsable** | Cruce por **grupo** (proyecto + proveedor) y luego suma | Decisión 011: una factura por proyecto. Retener sobre la suma cambia el redondeo y no cuadra con los CFDI. |
| Pagado / Total del pago y saldo en neto | En total a transferir | D18 |
| Historial de órdenes en neto | En total a transferir | D20 |
| "Un solo pago cierra los N conceptos del grupo" | Se permiten pagos parciales al grupo (la RPC vigente lo permite). El texto se ajusta a "El pago se reparte entre los N conceptos del grupo". | Decisión 011: el grupo se paga completo en renglones, no en un solo depósito. |
| Evento realizado por fecha del proyecto | Por fecha de cada cotización | Decisión 011, D12, supuesto 13. |
| Reabrir visible para todos | Solo admin lo ve y lo ejecuta | D6 |

### 5.3 Pendientes del README del handoff y cómo se resuelven

| # | Pendiente del README | Resolución |
|---|---|---|
| 1 | PDF de la orden sin diseño | Supuesto 14 (B6) |
| 2 | Monto de órdenes: neto o a transferir | D20 |
| 3 | Pasar conceptos a `en_orden` al generar | RPC `generar_orden_pago` (B1b, B6) |
| 4 | Fecha actual fija | `hoy_cdmx()` en SQL y helper de fecha CDMX en TS (B3) |
| 5 | Datos y API | Modelo §5, RPCs y rutas de B1–B7 |
| 6 | Validación CFDI, almacenamiento y complemento | B1 (parsers, UUID, complemento por pago), Drive vigente, supuesto 15 |
| 7 | Pestañas móviles Inicio/Proyectos/Cotizaciones | D19: navegan a las rutas existentes |
| 8 | Estados de escritorio sin captura | Se toman de las capturas móviles; B4 agrega captura de escritorio de cada uno en la validación |
| 9 | Formato de moneda | Supuesto 18 |

### 5.4 Auditoría de regresiones (sesión 13)

Se revisó cada bloque contra el código, las RPCs vivas en producción
(`pg_proc`), las llaves foráneas y los consumidores. **Criterio: que ningún
bloque rompa algo que hoy funciona, incluida la UI actual, que convive hasta
B8.**

| # | Hallazgo | Evidencia | Dónde se atiende |
|---|---|---|---|
| R1 | **Bug vigente: cancelar una cotización APROBADA falla.** `cancel_cotizacion` borra `proyectos` antes que `cuentas_pagar`/`cuentas_cobrar`, y las FK `*_proyecto_id_fkey` no tienen cascada. Además solo revisa cobros pagados: ignora pagos a proveedor, órdenes y `cuentas_pagar_grupos`, que quedarían huérfanos. | Reproducido en `serenata-erp-test` con SH175, dentro de una transacción revertida: `violates foreign key constraint "cuentas_pagar_proyecto_id_fkey"`. | B1b (D22) |
| R2 | **La UI actual se rompería antes de B8.** B1 haría obligatorio `pago_id` en `subir-complemento` (lo usa `TabDocumentos`). B6 cambiaría la forma de `GET/POST generar-orden-pago` (la usa `OrdenPagoModal`) y "reemplazaría" `/api/cuentas-cobrar/alertas` (la usa `CuentasPage`). | `useCuentasCobrar.ts:124,143`, `useCuentasPagar.ts:164,218` | §7.0, regla 1 |
| R3 | **"Vencido" dejaría de actualizarse después de B8.** `sync_estados_cuentas_cobrar_vencidas()` solo se llama desde `GET /api/cuentas-cobrar` y `GET /alertas`, y B8 retira las dos. Sheets y el Dashboard leen el `estado` guardado. | `app/api/cuentas-cobrar/route.ts:6`, `alertas/route.ts:15` | B3 y B6 |
| R4 | **CHEQUE fallaría en cobros.** El tipo de pago se valida también **dentro** de `registrar_pago_cuenta_cobrar` (`IF p_tipo_pago NOT IN ('TRANSFERENCIA','EFECTIVO')`) y en la ruta, no solo en el CHECK de la tabla. | `pg_proc`; `registrar-pago/route.ts:32` | B1 |
| R5 | **Sobrecargas de RPC.** Si se agregan parámetros a `registrar_pago_grupo_factura` / `_cuenta_pagar` creando otra firma, PostgREST puede no saber cuál llamar, y las firmas viejas dejan una vía para pagar en neto sin pasar por `pagos_cuentas_pagar`. Hoy ya hay 2 firmas de cada una. | `pg_proc` | B2 |
| R6 | **Estado de orden incorrecto con saldo previo.** El estado se calcula con `bool_or(monto_pagado > 0)`: una orden que incluye un grupo con pago parcial previo (supuesto 13) nacería "Parcial". Y "cancelar regresa a `FACTURADO`" perdería ese pago previo. | `registrar_pago_grupo_factura` en `pg_proc` | B2 y B6 |
| R7 | **Fecha de pago en UTC y sin dato del usuario.** Las RPCs de pago a proveedor fijan `fecha_pago = CURRENT_DATE`. `dashboard_egresos_por_bucket` agrupa por esa fecha. | `pg_proc` | B2 |
| R8 | **Anular un cobro no bajaría el saldo.** `registrar_pago_cuenta_cobrar` suma `pagos_comprobantes` sin filtro. Un pago anulado seguiría contando. | `pg_proc` | B7 |
| R9 | **Drive está apagado en Preview.** La prueba manual de B8 (subidas, complemento, órdenes) no se puede hacer ahí. | `docs/ACTIVE_WORK.md`, deuda técnica | B8 |
| R10 | **RLS en tablas nuevas.** Todas las tablas de cuentas tienen RLS activo y 0 políticas: solo `service_role` las toca (principio 1). Una tabla nueva sin RLS quedaría expuesta a `anon`. | `pg_class.relrowsecurity` | §7.0, regla 2 |
| R11 | **Complemento con varios documentos.** Un complemento puede traer varios `Pago` y varios `DoctoRelacionado`. Validar con `MontoTotalPagos` compararía contra otra cosa. | CFDI 4.0 / Pagos 2.0 | B1 |
| R12 | **`?v=2` en producción.** La vista nueva escribe sobre datos reales y la ve quien conozca la URL. | — | Supuesto 20 |
| R13 | **Encabezado móvil duplicado.** `SidebarLayout` pinta un encabezado fijo con menú en móvil (`md:hidden`); con la barra de pestañas habría dos navegaciones. | `SidebarLayout.tsx:69-83` | D23, B4 |

Sin regresión confirmada en: Dashboard (sigue en neto, D14); Reporte de
Cierre y `documentos-autofill` (suman `monto_pagado`, que sigue en neto);
`approve_cotizacion` y `reconcile_cuenta_pagar_grupo` (no cambian); Portal
(cambia a propósito, D14; la validación de su factura sigue contra
`monto_total` neto); reconciliación de pagos del cliente (`reconcilePago.ts`
depende de `operation_id`, no del monto).

### 5.5 Auditoría final (sesión 14)

Revisión del plan completo, ya con los supuestos confirmados, buscando
ambigüedades de implementación. No salió ninguna duda de producto ni de
negocio. Estas son decisiones de arquitectura, tomadas y ya integradas:

| # | Hueco | Decisión | Bloque |
|---|---|---|---|
| A1 | **Dos lugares para el comprobante del pago a proveedor.** Hoy `registrar-pago` sube el archivo y crea una fila `COMPROBANTE_PAGO` en `documentos_cuentas_pagar` **fuera** de la RPC. El plan agregaba `pagos_cuentas_pagar.comprobante`. D11 no decía cuál cuenta. | La fuente de verdad es `pagos_cuentas_pagar.comprobante_url` (el enlace de Drive). Se sube antes y se pasa a la RPC, así queda en la misma transacción que el pago. `registrar-pago` deja de crear la fila de documento. Las 2 filas `COMPROBANTE_PAGO` que existen cuentan para D11 en el backfill. "Adjuntar después" actualiza el pago con una RPC. | B2, B5 |
| A2 | **El plan no decía dónde se guarda el snapshot del total a transferir.** | Se escribe en el **mismo `UPDATE`** que da la factura por buena, con el `Total` del CFDI. Una factura en `revision` no cambia el estado, así que sigue el estimado. **Corregido en la sesión 16:** son cinco puntos de entrada, no tres; la validación manual también factura, y el total se lee del documento (U7). | B2 |
| A3 | **B3 no puede ir en paralelo a B2.** Egresos y "Por pagar" de las tarjetas leen `total_a_transferir` y `monto_transferido`, que nacen en B2. | Secuencial: B2 → B3. | Dependencias |
| A4 | **Cancelar una complementaria con renglones en un grupo ya facturado** quitaría conceptos de una factura ya validada. | Se bloquea (D22 ampliada). | B1b |
| A5 | **El job `live` ya es inestable en `main`** (deuda técnica: `bulk` y escala), y el plan agrega varios tests `live` de concurrencia. | Si reaparece durante B1b, se diagnostica la causa raíz antes de sumar tests nuevos. No se reintenta a ciegas ni se marca como flake. | B1b |

**Acción pendiente del usuario** (no bloquea el arranque): antes de B8,
encender Drive en Preview (R9). Los pasos exactos se dan al inicio de B8.

### 5.6 Auditoría de optimización (sesión 15)

Se buscaron decisiones correctas pero mejorables: duplicación de lógica,
trabajo sin valor dado D10 y puntos frágiles. Todas quedan integradas en
los bloques.

| # | Qué había | Mejora | Por qué |
|---|---|---|---|
| O1 | "Pendiente", filtros y conteos por mes en **SQL** (B3), mientras el estado visible y el siguiente paso se derivaban en **TS** (`concepto.ts`): dos implementaciones de la misma regla. | **Una sola derivación, en TS, del lado del servidor.** La RPC (`cuentas_por_proyecto` extendida, U1) devuelve los conceptos crudos del año (más "Sin fecha"). La ruta deriva con `concepto.ts` y después filtra, busca, cuenta por mes, calcula totales y pagina. Al cliente solo llega el periodo pedido. Se elimina `cuentas_conceptos` y los filtros en SQL. | Principio 7. Evita que "Pendientes" en SQL y el chip en la UI digan cosas distintas. |
| O1b | Riesgo de O1: el dataset de carga de test tiene 2,196 proyectos y unos 13,000 conceptos en un año. | **Presupuesto:** p95 < 800 ms de `GET /api/cuentas/periodo` con ese dataset, medido en B3. Si no se cumple, la derivación pasa a una función SQL con un test de paridad contra `concepto.ts` que la mantenga igual. | Decidir con datos, no a ojo. |
| O2 | "Vencido" se actualiza **escribiendo en cada GET** (`sync_estados_...` en `periodo` y `avisos`, R3). | En pantalla, "Vencido" se **deriva al leer** (`fecha_vencimiento < hoy CDMX`). El `estado` guardado lo actualiza el **cron diario existente** (`/api/keep-alive`, 02:00 CDMX, U4), que llama a `sync_estados_cuentas_cobrar_vencidas()`, para Sheets y el Dashboard. | Sin escrituras ni bloqueos en lecturas. R3 queda resuelto sin depender de que alguien abra la pantalla. |
| O3 | `concepto.ts` nacía en B1 con montos en neto y B2 los cambia a total a transferir, así que había que rehacerlo. | `concepto.ts` recibe una **entrada normalizada** (`total`, `pagado`, documentos, orden, método), sin saber en qué unidad vienen los montos. Cada fuente arma esa entrada. | Los tests de B1 siguen valiendo después de B2. |
| O4 | `generar_orden_pago` sin idempotencia. Un doble envío fallaba bien en la RPC, pero **subía un segundo PDF huérfano** a Drive. | `withIdempotency` en la ruta (U3), que envuelve PDF + RPC. Un reenvío devuelve la misma orden. | No quedan órdenes ni PDFs duplicados. |
| O5 | Script de backfill de `MetodoPago` que lee Drive desde local. | **Se elimina.** Son 6 facturas de prueba (D10): quedan con el método en "desconocido" y se marca PUE o PPD a mano (supuesto 4). | Menos trabajo, sin credenciales de Drive locales. |
| O6 | Columna `ordenes_pago.base_monto` solo para rotular 8 órdenes de prueba. | **Se elimina** (D10). | YAGNI. |
| O7 | Escritorio y móvil como pantallas separadas. | **Un árbol de componentes por pantalla.** `Modal` con `mobile="sheet"` y `ResponsiveTableCard` (U5). | La mitad del código de UI y ninguna divergencia de reglas entre dispositivos. |
| O8 | Corte en B8 después de B7. | D24: el corte va antes de B7. | Menos tiempo con dos UIs. |
| O9 | El plan proponía renombrar "por pagar" en el Dashboard. | El Dashboard no se toca; la aclaración vive en Cuentas. | D14: "el Dashboard no cambia". |
| O10 | "Validación visual contra capturas" sin definir cómo. | Playwright toma capturas de cada estado (escritorio y móvil, claro y oscuro) y se adjuntan al PR. Se revisan **lado a lado** con el handoff. **No** es diff de píxeles: los datos son distintos. | Criterio de aceptación verificable. |

### 5.7 Revisión de reutilización contra el repo (sesión 16)

Revisión de cada pieza nueva del plan contra lo que ya existe en el repo y
en la BD viva. **Criterio: extender antes que crear** (principio 7).

| # | El plan creaba | Ya existe | Decisión |
|---|---|---|---|
| U1 | RPC nueva `cuentas_anio` | `cuentas_por_proyecto()` ya devuelve por proyecto los cobros, los pagos con grupo y régimen, y margen, fee e IVA de las cotizaciones aprobadas: justo lo que pide `calcularCierreProyecto`. La usa `/api/cuentas/por-proyecto`, que ya aplica el cierre. | **Se extiende** `cuentas_por_proyecto(p_year DEFAULT NULL)` con campos **aditivos**: `fecha_entrega`, banderas de documentos, pagos, orden, `total_a_transferir` y cuentas sin proyecto en "Sin fecha". Sin parámetro, se comporta igual que hoy (R2). La lógica de `por-proyecto/route.ts` pasa a `lib/server/cuentas/periodo.ts` y la comparten las dos rutas. `cuentas_anios()` sí es nueva (es chica). |
| U2 | Endpoints de detalle para B5 (sin especificar) | `GET /api/cuentas-cobrar/[id]/documentos` (cuenta, documentos y pagos), `GET /api/cuentas-pagar/[id]/documentos` (grupo, documentos y orden) y `GET /historial-responsable` | **Se reutilizan**, agregando campos: pagos de `pagos_cuentas_pagar`, método PUE/PPD y complemento por pago. No hay endpoint de detalle nuevo. |
| U3 | `p_operation_id` en `generar_orden_pago` (O4) | `withIdempotency` (`lib/server/idempotency.ts`, a nivel ruta, ya en los `registrar-pago`) y `lib/client/pagoIdempotency.ts` (fingerprint) | Generar y cancelar orden, anular pago y reabrir usan **`withIdempotency`** en la ruta, que envuelve PDF + RPC. La RPC conserva el candado `FOR UPDATE`. `generar_orden_pago` no lleva `p_operation_id`. |
| U4 | Cron nuevo en `vercel.json` (O2) | `/api/keep-alive`: cron diario (08:00 UTC = 02:00 CDMX), con `CRON_SECRET`, que ya hace el sync de Sheets | **Se agrega** la llamada a `sync_estados_cuentas_cobrar_vencidas()` en `keep-alive`, **antes** del sync de Sheets. Sin cron nuevo: se aprovecha el que ya corre y ya está autenticado. |
| U5 | Tablas → tarjetas "por CSS y props" y `ResponsiveDialog` nuevo (O7) | `components/ResponsiveTableCard.tsx` (tabla en escritorio y tarjetas en móvil) y `components/ui/Modal.tsx` | Entradas, Salidas, Lista e historial de órdenes usan **`ResponsiveTableCard`**. En lugar de `ResponsiveDialog`, **`Modal` recibe `mobile="sheet"`** y en móvil se pinta como hoja inferior. `BottomSheet` es su pieza interna y también la usan Periodo y Filtros. |
| U6 | Derivación de cobros en `concepto.ts` | `lib/server/cuentas/status.ts` (`calcularEstadoCuentaCobrarDetallado`, `calcularSaldoPendiente`), `selectors.ts` (`agruparCuentasPagarPorGrupo`, `sumMontoPendiente`), `calcularCrucePagoProveedor` / `calcularEjemploFactura` | `concepto.ts` **llama** a estas funciones. No reimplementa estado de cobro, saldo, agrupación ni cruce fiscal. `status.ts` pasa a `lib/shared/cuentas/` para usarse también en el cliente. |
| U7 | `metodo_pago_cfdi` y `uuid_cfdi` en `cuentas_cobrar`, y el snapshot tomaba el total "del CFDI" que **no se guarda en ningún lado** | `documentos_cuentas_*` guardan cada archivo con su `estado_validacion` | **Los datos del CFDI se guardan en la fila del documento XML**: `uuid_cfdi`, `total_cfdi` y, en cobros, `metodo_pago_cfdi`. Si una factura se reemplaza (B7), método y UUID salen del documento vigente sin copiar nada. La validación manual (PATCH) ya encuentra el total ahí. |
| U8 | Hoja "Más" con las secciones | Los items de navegación viven como `const` dentro de `SidebarLayout.tsx` | Se **extraen** a `lib/navigation/items.ts` y los usan el sidebar y "Más". Una sola lista y un solo filtro por permisos. |
| U9 | Formato de moneda | `fmtCurrency` (`lib/quotations/format.ts`) y `formatCuentasCurrency` (sin `$` ni máximo de decimales) | La UI nueva usa **`fmtCurrency`**. `formatCuentasCurrency` se retira en B8 junto con la UI vieja. |
| U10 | `pagos_cuentas_pagar` junto a `pagos_comprobantes` | `pagos_comprobantes` (cobros) | **Se mantienen separadas, a propósito.** Unirlas mezclaría dos libros con reglas distintas: la RPC de cobro suma todo `pagos_comprobantes`, y los pagos a proveedor llevan conversión a neto y orden. Misma forma de columnas para leerlas igual. |

También se reutilizan sin cambios: `StatusBadge` (ya tiene los 4 tonos y
80px de ancho mínimo), `FilterTabs`, `SearchInput`, `Select`, `DateField`,
`Button`, `useFileUpload`, `factura-validation.ts`, `uploadFileToDrive`,
`orden-pago-pdf.ts` / `buildOrdenPagoPreview` (se extienden) y
`tests/e2e/utils/cuentas-mocks.ts`. **No** se refactoriza el autocompletado
de cliente de cotizaciones para sacar `SearchableSelect`: está acoplado a
react-hook-form y a la lógica de proyectos. Sería ampliar el alcance.

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
  TextField, DateField, Button, Metric, TableFooter, Icon. Navegación:
  `components/navigation/Sidebar.tsx`, `components/layout/AppShell.tsx` y los
  items de `app/components/SidebarLayout.tsx`, que la hoja "Más" reutiliza.
  **Faltan:**
  - `ProgressBar`;
  - `Field` reutilizable (hoy vive local en `TabInformacion`);
  - `Checkbox` y `Switch` ("Agrupar por mes");
  - `BottomSheet` (hojas móviles con grabber, 88–92% de alto);
  - `CuentasTabBar` (barra móvil, solo en Cuentas, D19). `SidebarLayout` oculta
    su encabezado móvil en `/cuentas` (D23, R13); sin efecto en otras rutas;
  - `SearchableSelect` (Cliente y Proveedor con buscador);
  - iconos nuevos en `Icon.tsx`: `bell`, `folder`, `layers`,
    `sliders-horizontal`, `file-down`, `circle-check`, `arrow-right-circle`,
    `camera`, `paperclip`, `info`, `users`, `share`, `arrow-down-left` y
    `arrow-up-right`. Los que ya existen con otro nombre (`warning`, `close`,
    `dashboard`, `cuentas`, `calendar`, `lock`) se reutilizan.
- **Subidas:** `lib/server/uploads/factura-validation.ts` y el flujo de
  Documentos actual (Drive).
- **Tests:** `tests/e2e/critical/cuentas-*.spec.ts`,
  `tests/e2e/utils/cuentas-mocks.ts` y los tests de hooks de cuentas.

## 7. Bloques

### 7.0 Reglas transversales (aplican a todos los bloques)

1. **Contratos aditivos hasta B8 (R2).** Ningún bloque cambia la forma ni
   vuelve obligatorio un campo de una ruta que usa la UI actual:
   - lo nuevo va en rutas nuevas (`/api/cuentas/...`) o en campos opcionales;
   - las rutas viejas siguen vivas y se retiran en B8 tras buscar
     consumidores con grep;
   - si un cambio de dinero exige tocar la UI actual (B2), se toca en el mismo
     PR y con su E2E.
2. **Migraciones (R10, decisión 011):**
   - numeradas en `db/migrations/` y registradas en `_manifest.json`;
   - toda tabla nueva con `ENABLE ROW LEVEL SECURITY` y sin políticas, como
     las demás tablas de cuentas;
   - `CREATE OR REPLACE` parte de la definición viva en `pg_proc`, con diff
     explícito;
   - se aplican a test y a producción **en el mismo bloque**;
   - jobs `fresh-db` y `Migrations` en verde.
3. **Una sola firma por RPC de dinero (R5).** Al cambiar parámetros se hace
   `DROP FUNCTION` de las firmas viejas y se crea la nueva, en la misma
   migración, con el wrapper de idempotencia (`pago_operations`) incluido.
4. **"Hoy" siempre en CDMX:** `hoy_cdmx()` en SQL y un helper en TS.
5. **Escritorio y móvil, claro y oscuro,** en cada bloque de UI (B4–B7),
   contra las capturas del handoff.

Cada bloque va en su propio PR hacia `main` y se mergea en verde. La UI actual
sigue funcionando hasta el Bloque 8: la nueva se construye al lado, en la
misma ruta detrás de `?v=2`, y se cambia al final.

**B0 — Referencia, reglas y datos de prueba.**
- `design_handoff_cuentas/` completo a `docs/design/cuentas/`: README,
  capturas, `abrir-directo/` y `codigo-fuente/`, unos 4 MB. No se generan
  capturas: el handoff ya las trae.
- Decisión nueva `docs/decisions/017-rediseno-cuentas.md` con D2–D24, A1–A5,
  O1–O10, el
  modelo de la sección 5, §5.2 (reglas del prototipo que no se adoptan) y los
  supuestos aceptados.
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
  p_usuario)`, atómica (H1, H2). `p_candidatos` es la **selección** (ids de
  grupos y sueltas de los responsables incluidos, supuesto 13); no se toma
  "todo lo elegible" en el servidor. La RPC:
  - bloquea los candidatos con `FOR UPDATE`;
  - revalida su estado;
  - inserta la orden;
  - marca grupos **y** sueltas.
  Si otro proceso ya los tomó, falla explícito. El PDF se sube antes; si la
  RPC falla, queda un archivo huérfano en Drive y se registra en el log. La
  ruta la llama en lugar de las tres escrituras sueltas.
  - Idempotente con `withIdempotency` en la ruta, que envuelve PDF + RPC (O4,
    U3).
  - En B1b la ruta pasa todo lo elegible como selección. La selección por
    responsable llega en B6 sin cambiar la firma.
  - El total lo calcula la ruta a partir de los candidatos. Nunca viene del
    cliente.
- **`cancel_cotizacion` corregida (R1, D22):**
  - bloquea si hay cobros o pagos a proveedor registrados, cuentas en una
    orden o cuentas en un grupo no `ABIERTO` (A4);
  - si procede, borra en orden de llaves foráneas: documentos, cuentas por
    pagar, grupos, cuentas por cobrar (sus pagos y documentos caen en
    cascada) y al final el proyecto;
  - solo borra el proyecto si la cotización es la principal; una
    complementaria solo borra sus propias cuentas y recalcula los grupos que
    tocaba con `reconcile_cuenta_pagar_grupo`;
  - test `live` de cancelar principal y complementaria, más el caso
    bloqueado.
- `registrar_pago_cuenta_pagar` conserva `EN_PROCESO_PAGO` si la cuenta está
  en una orden (H3). Se parte de la definición vigente en `pg_proc`
  (norma de la decisión 011).
- `PUT /api/cuentas-cobrar` y `PUT /api/cuentas-pagar`: **se retiran** (H4).
  No tienen consumidores en la UI (confirmado con grep); sus tests se
  eliminan junto con la ruta. Editar notas llega en B7 con PATCH y Zod.
- CHECK de `cuentas_pagar.estado` (H12).
- Tests: concurrencia de dos generaciones en `live` y suelta con pago parcial
  en orden.

**B1 — Derivación y datos fiscales base.**
- `lib/shared/cuentas/concepto.ts`: estado visible, siguiente paso, vencimiento
  (derivado con "hoy" en CDMX, O2) y cuentas cerradas.
  - Entrada normalizada, sin saber en qué unidad vienen los montos (O3).
  - Tests unitarios con cada fila de la tabla de la sección 5.
- `concepto.ts` llama a `status.ts`, `selectors.ts` y
  `calcularCrucePagoProveedor` (U6); `status.ts` se mueve a
  `lib/shared/cuentas/`.
- Migración:
  - `uuid_cfdi`, `total_cfdi` y `metodo_pago_cfdi` (`PUE`/`PPD`/null) en la
    fila del XML de `documentos_cuentas_cobrar`; `uuid_cfdi` y `total_cfdi`
    en la de `documentos_cuentas_pagar` (H6, U7);
  - `CHEQUE` en el CHECK de `pagos_comprobantes.tipo_pago`, **en la
    validación interna de `registrar_pago_cuenta_cobrar`**, en la ruta y en
    Zod (R4);
  - `documentos_cuentas_cobrar.pago_id` (FK a `pagos_comprobantes`): un
    complemento por pago (D16).
- `factura-parser` lee `MetodoPago`. Todas las rutas que suben una factura
  (cobro, grupo, suelta y portal) guardan UUID, total y, en cobros, método en
  la fila del documento (U7).
- `complemento-parser` reescrito con `fast-xml-parser` (H5). Lee
  `IdDocumento`, `ImpPagado`, `FechaPago` y `MontoTotalPagos`.
- `subir-complemento`:
  - Zod;
  - recibe el `pago_id`;
  - toma el `DoctoRelacionado` cuyo `IdDocumento` sea el UUID de la factura y
    compara su `ImpPagado` con el pago (±0.01), no `MontoTotalPagos` (R11);
  - `pago_id` es **opcional** en la ruta vigente (R2). Si falta, se asigna al
    pago más reciente sin complemento, que es lo que ya hace la UI actual;
  - si algo no cuadra, guarda con `estado_validacion = 'revision'`, igual que
    las facturas.
- Sin script de backfill (O5): las facturas existentes quedan con
  `metodo_pago_cfdi` null en su documento y se marca PUE o PPD a mano (supuesto 4). Solo las
  facturas subidas desde B1 se leen del XML.

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
  - Las firmas viejas se eliminan en la misma migración (§7.0, regla 3).
  - Recibe `p_comprobante_url` y lo guarda en el pago (A1).
  - `fecha_pago` de la cuenta = fecha capturada del pago que la salda, no
    `CURRENT_DATE` (R7).
  - `pagos_cuentas_pagar.orden_pago_id` guarda la orden vigente al momento
    del pago. El estado de la orden se calcula con los pagos **de esa
    orden** frente al saldo que cubría al generarse, no con
    `bool_or(monto_pagado > 0)` (R6).
- Snapshot de `total_a_transferir` desde `total_cfdi` del documento (U7), en
  el mismo `UPDATE` que da la factura por buena, en los **cinco** puntos de
  entrada (A2 corregido):
  - grupo: `grupos/[id]/subir-factura`, `portal/cuentas/grupos/[id]/factura`
    y la validación manual `grupos/[id]/documentos/[docId]` (PATCH a
    `validado`, que hoy también llama a `marcarGrupoFacturado`);
  - suelta: `cuentas-pagar/[id]/subir-factura` y su validación manual
    `cuentas-pagar/[id]/documentos/[docId]`.
  Test por punto de entrada.
- `calcularCierreProyecto` usa el snapshot del CFDI cuando existe y el
  estimado solo si no hay factura (H10). Test de ambos casos.
- Portal de proveedores en total a transferir (D14): `app/api/portal/cuentas`
  y `app/portal/page.tsx`. El Dashboard no cambia.
- Ruta de registrar pago con Zod actualizado.
- En la UI actual solo cambian la etiqueta y el prellenado del monto.
- Test de cuadre: Σ neto de items = monto transferido × neto / total, al
  centavo.

**B3 — Lectura por periodo (backend).**
- `cuentas_por_proyecto(p_year DEFAULT NULL)` extendida (O1, U1), con campos
  aditivos: `fecha_entrega`, banderas de documentos, pagos, orden,
  `total_a_transferir` y cuentas sin proyecto. Sin parámetro devuelve lo
  mismo que hoy, así que la UI actual no cambia. No filtra más allá del año ni
  deriva.
- La lógica de `/api/cuentas/por-proyecto` pasa a
  `lib/server/cuentas/periodo.ts` y la comparten la ruta vieja y la nueva.
- RPC `cuentas_anios()`: años con datos, para el select.
- La ruta deriva con `concepto.ts` y luego filtra, busca (folio, proyecto,
  cliente, contraparte y concepto), cuenta pendientes por mes, arma los
  totales con `calcularCierreProyecto` y pagina la Lista. Al cliente solo
  llega el periodo pedido.
- Presupuesto p95 < 800 ms con el dataset de carga de test (O1b). Si no se
  cumple, la derivación pasa a SQL con un test de paridad.
- Índice por `proyectos.fecha_entrega` (D12).
- Helper SQL `hoy_cdmx()` que usan las RPCs nuevas. Se corrigen las dos RPCs
  vigentes que usan UTC (H7), partiendo de su versión en `pg_proc`.
- `/api/keep-alive` (cron diario existente) llama a
  `sync_estados_cuentas_cobrar_vencidas()` antes del sync de Sheets (O2, U4,
  R3). La ruta nueva no escribe al leer.
- Ruta `GET /api/cuentas/periodo`, con `requireSection('cuentas')` y Zod.
- `cuentas_por_proyecto` sin parámetro sigue sirviendo a la UI actual hasta
  B8.

**Regla para B4–B7:** cada bloque entrega **escritorio y móvil** de sus
pantallas, en **tema claro y oscuro**, con las capturas del handoff como
criterio de aceptación (O10). Móvil no se deja para el final: es **el mismo
árbol de componentes** con variantes de layout (O7), no pantallas
duplicadas.

**B4 — Pantalla principal nueva (`?v=2`).**
- Primitivos nuevos (§6): ProgressBar, Field, Checkbox, Switch, BottomSheet
  (interno de `Modal mobile="sheet"`, U5), SearchableSelect, CuentasTabBar e
  iconos. Cada uno con su test.
- Tablas con `ResponsiveTableCard` (U5); moneda con `fmtCurrency` (U9).
- Items de navegación extraídos a `lib/navigation/items.ts` (U8).
- **Escritorio** (capturas 01, 02, 07 y 08):
  - encabezado con Avisos (contador) y Orden de pago;
  - pastillas de mes con contador, "Todo el año" y select de año con
    pendientes;
  - Por proyecto / Lista, Filtros (panel de 640px con 4 columnas), chips y
    búsqueda expandible;
  - 4 tarjetas de totales;
  - tarjetas de proyecto y maestro-detalle (detalle a la izquierda, lista a la
    derecha; tocar el proyecto seleccionado lo deselecciona);
  - tablas Entradas y Salidas con siguiente paso y vencimiento;
  - Lista agrupable por mes, con pie "Mostrando N conceptos de M proyectos".
- **Móvil** (capturas 01–03, 09, 10, 12–14 y 17, 18, 20):
  - encabezado de 27px con Avisos y Órdenes;
  - botón de periodo que abre la hoja Periodo (año y cuadrícula de 3 × 4);
  - búsqueda, filtros en hoja con chips y SearchableSelect ("Ver N
    proyectos");
  - carrusel de totales con scroll-snap;
  - tarjeta de proyecto sin folio;
  - proyecto abierto en hoja al 92%, **sin** siguiente paso en las filas;
  - Lista en tarjetas;
  - `CuentasTabBar` (D19).
- Reglas de interacción del README:
  - "Pendientes" cambia el periodo a "Todo el año";
  - elegir un Cliente limpia "Por pagar" y elegir un Proveedor limpia "Por
    cobrar";
  - "Agrupar por mes" solo en "Todo el año";
  - métricas de la tarjeta: Por cobrar / Por pagar si está abierta, Ingreso /
    Egreso si está cerrada.
- Cierre del proyecto con el formato nuevo (§5.2) y el aviso de estimación
  (Art. 14 LISR).
- Estado en la URL (supuesto 8).
- Estados vacíos: sin resultados, año archivado (todo cerrado) y "Sin fecha".
- Tokens `--sn-*`; moneda con 2 decimales (supuesto 18).

**B5 — Detalle del concepto.** Modal de 780px en escritorio (capturas 03–06)
y hoja al 88% en móvil (06–08, 15, 19), con la franja "Siguiente paso".
- Encabezado con avance, en total a transferir para pagos (D18).
- Datos: los endpoints de detalle existentes, extendidos con campos nuevos
  (U2). El registro de pagos usa `lib/client/pagoIdempotency.ts` y
  `reconcilePago.ts`, como hoy.
- Información:
  - Cobro: campos y notas.
  - Pago: select de responsable **solo en sueltos** (D21); en un grupo, el
    desglose lleva la reasignación por renglón. Además: grupo de
    facturación, régimen, cruce fiscal, contacto, orden vinculada e historial
    de reasignaciones.
- Documentos: checklist requerido/opcional según D11, "Válida" según
  `estado_validacion`, aviso de grupo.
  - Complemento: **un renglón por pago** (D16), requerido solo si la factura
    es PPD; si el método es desconocido, se pide elegir.
  - Comprobante de pago del proveedor: requerido una vez pagado.
- Registrar pago:
  - cobro y pago con tipo y fecha;
  - bloqueado sin factura, con botón "Ir a Documentos" (captura móvil 15);
  - estado saldada;
  - historial de pagos;
  - comprobante en el formulario ("Tomar foto o adjuntar", `accept` de imagen
    y PDF con `capture`), y "Adjuntar" después desde el historial
    (supuesto 17). Ruta nueva para adjuntar el comprobante a un pago ya
    registrado.
- Subidas de 4 MB por archivo, XML y PDF en peticiones separadas
  (supuesto 15). Se ajustan `factura-validation.ts` y los hooks de subida.

**B6 — Avisos y órdenes.** Escritorio: capturas 09–13. Móvil: 04, 05, 11,
16 y 21.
- Ruta `GET /api/cuentas/avisos` con las 5 categorías (supuestos 2 y 3),
  derivadas con `concepto.ts` (O1, O2).
  `/api/cuentas-cobrar/alertas` sigue viva para la UI actual hasta B8 (R2).
- Escritorio: panel lateral de 400px "Avisos y órdenes". Móvil: pantallas
  empujadas "‹ Cuentas".
  - Tocar un aviso limpia filtros, fija año y mes del evento y abre el
    proyecto.
  - Órdenes: tarjeta "Nueva orden" y las últimas 5 con "Ver todo (N)". En
    móvil, filtro de estado en hoja con contadores.
- **Generar orden** (modal de 820px / hoja al 92%):
  - **Ruta nueva** `GET/POST /api/cuentas/ordenes/preview` y `/generar`
    (R2). `generar-orden-pago` conserva su contrato para `OrdenPagoModal`
    hasta B8; por dentro también llama a `generar_orden_pago`. Devuelve
    elegibles y "No incluidas" con motivo (supuesto 13), agrupados por
    responsable y proyecto.
  - Cruce fiscal por grupo, sumado por responsable (§5.2), con
    `calcularEjemploFactura` o el snapshot del CFDI.
  - Tarjetas colapsadas: la casilla incluye o excluye, y tocar la fila la
    expande.
  - Pie fijo con los totales recalculados.
  - El confirmar de D8 es el propio pie del modal (resumen + "Generar orden
    PDF"), no un segundo diálogo.
  - `POST` recibe la selección, genera el PDF (supuesto 14), lo sube a Drive
    y llama `generar_orden_pago` (B1b). Luego muestra "Orden generada" con
    Descargar o Compartir el enlace de Drive (supuesto 16).
  - `buildOrdenPagoPreview` pasa a usar el saldo en lugar de `x_pagar` y
    agrega el cruce fiscal.
- Migración de órdenes:
  - estado `CANCELADA`, con `cancelada_at/por/motivo`;
  - RPC `cancelar_orden_pago`: atómica, simétrica a `generar_orden_pago`
    (B1b), solo si **ningún pago está registrado contra esa orden**
    (`pagos_cuentas_pagar.orden_pago_id`). Cada grupo o suelta vuelve al
    estado que corresponde a su saldo (`FACTURADO`/`PENDIENTE` sin pagos,
    `EN_PROCESO_PAGO` con pago previo), no a un estado fijo (R6). Quita el
    `orden_pago_id`.
- `VENCIDA` derivada a 15 días desde `fecha_generacion` en hora CDMX (D7), sin
  columna. Aplica también a las órdenes existentes (D13).
- `buscar_ordenes_pago` extendida: filtros estado/mes/proveedor/proyecto,
  búsqueda por folio, desglose por orden y conteo de cuentas.
- Historial (modal de 960px / pantalla móvil): filas que se expanden por
  proveedor, monto en total a transferir (D20), descarga con el enlace de
  Drive (supuesto 16).

**B7 — Reabrir, volver a cerrar y correcciones (D5, D6).**
- Tabla `cuentas_reaperturas` (proyecto, abierta por/cuándo/motivo, cerrada
  por/cuándo) y bitácora `cuentas_correcciones`.
- Migración (H12):
  - `anulado_at/por/motivo` en `pagos_comprobantes`.
    `registrar_pago_cuenta_cobrar` y toda suma de pagos filtran
    `anulado_at IS NULL` (R8);
  - `eliminado_at/por/motivo` y `reemplazado_por` en
    `documentos_cuentas_cobrar` y `documentos_cuentas_pagar`;
  - el CHECK de `pago_operations.dominio` acepta las operaciones de anulación.
- Admin según el supuesto 10: `requireSection('admin')` en la ruta y
  `p_usuario` en la RPC.
- UI (escritorio y móvil): Reabrir y Volver a cerrar solo para admin,
  motivo obligatorio y chip "Reabierta". Las correcciones solo aparecen con el
  proyecto reabierto.
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
  de alertas, `formatCuentasCurrency` y la ruta `alertas` si ya no los usa
  nadie (buscar antes). `cuentas_por_proyecto` **no** se retira: la usa la
  vista nueva (U1).
- También `cuentas_pagar_pendientes_eventos_realizados` y las secuencias
  `seq_cc_2026` / `seq_cp_2026`, si siguen sin uso.
- E2E de Cuentas reescritos al flujo nuevo, en escritorio y en viewport móvil
  (390px).
- `ARCHITECTURE.md` actualizado.
- Prueba manual del usuario en el Preview. **Requisito (R9):** encender Drive
  en Preview con una carpeta de pruebas (token de
  `/api/integrations/drive/authorize` con una cuenta de pruebas, variables en
  el entorno Preview de Vercel), o la prueba de subidas y órdenes no es
  posible. Se prepara al inicio de B8, no al final.
- `?v=2` se abre a todos los usuarios (supuesto 20).
- Va antes de B7 (D24). Las cuentas quedan con cierre automático; reabrir y
  corregir llegan en B7.

**Dependencias:** B0 → B1b → B1 → B2 → B3 → B4 → B5 → B6 → **B8 → B7**
(A3, D24). B7 se construye sobre la UI nueva ya en producción. B6 depende también de B2 (montos de la orden) y de B1b
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
  - Mitigación: B3 trae solo el año pedido, pagina lo que manda al cliente y
    tiene presupuesto p95 medido con el dataset de carga (O1b).
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

- **Límite de cuerpo de Vercel (~4.5 MB).** La subida actual manda XML y PDF
  juntos con un límite de 10 MB por archivo, así que puede fallar en
  producción con un 413 poco claro.
  - Mitigación: supuesto 15, más un mensaje explícito si se excede.
- **Alcance móvil.** Duplica el trabajo de layout de B4–B7.
  - Mitigación: una sola capa de datos y derivación, componentes de
    presentación separados por breakpoint, capturas del handoff como criterio
    de aceptación.
- **Selección parcial de la orden.** Si la UI manda ids que ya no son
  elegibles (otra persona generó una orden en medio), la RPC falla
  explícito, la UI recarga el preview y lo avisa.

**P2**
- El build depende de Google Fonts (deuda conocida).
- `codigo-fuente/` del handoff no abre sin `_ds/`. Para ver el diseño se usan
  `abrir-directo/` y las capturas.
- Estados de escritorio sin captura (pendiente 8 del README): se validan
  contra la captura móvil equivalente.
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
- **E2E critical** (escritorio y móvil 390px):
  - periodo y filtros, incluidas "Pendientes → Todo el año" y la limpieza
    cruzada de Cliente y Proveedor;
  - maestro-detalle;
  - detalle con sus 3 tabs;
  - registrar pago de cobro y de proveedor (total a transferir);
  - generar orden con un responsable excluido, "No incluidas" y cancelar
    orden;
  - barra de pestañas y hoja "Más" en móvil;
  - reabrir, anular pago y volver a cerrar.
- **E2E live:** registrar y anular pago en concurrencia; dos generaciones de
  orden simultáneas (B1b); generar y cancelar orden contra la base de test.
- **Visual (O10):** capturas de Playwright de cada estado (escritorio y
  móvil, claro y oscuro) adjuntas al PR y revisadas lado a lado con el
  handoff. No es diff de píxeles.
- **Rendimiento (O1b):** p95 de `GET /api/cuentas/periodo` < 800 ms con el
  dataset de carga de test.
- **Manual:** el usuario en el Preview de B8 con datos reales de test, en
  escritorio y en su teléfono.
- **Regla de siempre:** tsc, lint, `npm test`, build, smoke, critical y `live`
  en verde en cada PR.

## 10. Tracker

| Bloque | Estado |
|---|---|
| Réplica del estado actual | Hecho (sesión 9) |
| Rediseño en Claude Design | Hecho (usuario) |
| Auditoría del diseño y plan | Hecho (sesión 10) |
| Auditoría end-to-end y decisiones D10–D17 | Hecho (sesión 11) |
| Diseño final (handoff) y re-auditoría, D18–D21 | Hecho (sesión 12) |
| Auditoría de regresiones R1–R13, D22–D23 | Hecho (sesión 13) |
| Supuestos confirmados y auditoría final A1–A5 | Hecho (sesión 14) |
| Auditoría de optimización O1–O10, D24 | Hecho (sesión 15) |
| Revisión de reutilización U1–U10 y huecos A2/U7 | Hecho (sesión 16). Falta aprobar |
| B0 Referencia, reglas y seed | Pendiente |
| B1b Blindaje previo | Pendiente |
| B1 Derivación y datos fiscales | Pendiente |
| B2 Pagos en total a transferir | Pendiente |
| B3 Lectura por periodo | Pendiente |
| B4 Pantalla principal | Pendiente |
| B5 Detalle | Pendiente |
| B6 Avisos y órdenes | Pendiente |
| B8 Corte y limpieza (antes de B7, D24) | Pendiente |
| B7 Reabrir y correcciones | Pendiente |

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
