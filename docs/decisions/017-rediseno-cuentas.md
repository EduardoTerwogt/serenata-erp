# 017 — Rediseño de la sección Cuentas: reglas de producto y de dominio

## Contexto

`/cuentas` se rediseñó en Claude Design sobre una réplica exacta de la
pantalla anterior (sesión 9). El diseño final llegó como paquete de handoff
y vive en `docs/design/cuentas/` desde B0: README, 13 capturas de escritorio,
21 de móvil (con estados y tema oscuro), prototipos de `abrir-directo/` y el
código fuente del prototipo (`cuentas-data.js` es la especificación de reglas).

Antes de escribir código, el plan se auditó siete veces contra el código, la
BD de producción y sus datos reales (sesiones 10–19). De ahí salieron 32
decisiones del usuario (D1–D32), 21 supuestos confirmados y los hallazgos
H, R, A, O, U, S, T y V que cambiaron el modelo. El plan de ejecución
(bloques B0–B8) vive en `docs/PLAN.md` mientras la iniciativa está abierta y
después en `docs/archive/`.

## Decisión

1. **El diseño decide forma y flujo; los números salen de las fórmulas
   vigentes** (decisión 006 y `lib/shared/cierre-proyecto.ts`), no de la
   aritmética simplificada del prototipo. Donde `cuentas-data.js` choca con
   la decisión 006, con D4 o con D15, gana este documento (§5.2).
2. **Las operaciones de dinero siguen yendo por RPC atómica** (principio
   crítico 2): generar y cancelar orden, registrar pagos, validar factura de
   proveedor y cancelar cotización con su cascada.
3. **El estado visible de un concepto se deriva** (§5) de lo guardado, de los
   documentos `validado` (D25) y de la fecha en hora CDMX. El estado guardado
   no se reescribe para que cuadre con la pantalla.
4. Las reglas de las secciones 2 a 5 de abajo son las **vigentes** para
   Cuentas. Cambiar una de ellas requiere una decisión nueva que la sustituya.

## Razón

- Tres rondas de auditoría contra producción encontraron bugs vigentes
  (órdenes de pago no atómicas, cancelación de cotización aprobada que falla,
  sueltas sin proveedor dentro de órdenes). Fijar las reglas antes del código
  evita que cada bloque las vuelva a discutir.
- Las reglas del prototipo son simplificaciones de diseño; copiarlas habría
  creado un segundo motor fiscal en paralelo al de la decisión 006.
- Todo lo que alguien podría cuestionar en seis meses ("¿por qué no se exige
  complemento a un anticipo?", "¿por qué el historial de órdenes lee un
  snapshot?") queda con su motivo y su evidencia en las tablas de abajo.

---

Las secciones siguientes se copian tal cual de `docs/PLAN.md` al cierre de la
sesión 19 (plan aprobado). Las referencias "§n" y "Bn" apuntan a ese plan.

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

**Decisiones de la sesión 17** (auditoría profunda, §5.8):

| # | Tema | Decisión |
|---|---|---|
| D25 | Documento en `revision` | **No cuenta.** Solo cuenta un documento `validado`, sea automático o marcado a mano por PATCH. Es la misma regla para cobro, grupo y suelta, y aplica a la factura, al complemento y a la elegibilidad para orden. Mientras el documento esté en `revision`, el concepto muestra el estado **"En revisión"** (tono borrador) y el siguiente paso "Revisar factura" o "Revisar complemento". Hoy `subir-factura` de cobro pone `FACTURADO` aunque el XML quede en `revision`: el estado guardado puede seguir así, pero la derivación (§5) manda. |
| D26 | Fechas SAT con varios cobros o pagos | **Una fila por mes.** El IVA a enterar, las retenciones y el ISR del cierre se parten por mes de cobro (IVA trasladado e ISR) o de pago al proveedor (IVA e ISR retenidos). Cada fila lleva su monto y su día 17 del mes siguiente. La parte sin cobro o sin pago va en una fila "Al cobrar" / "Al pagar". Refina D15. |
| D27 | Complemento de pago | **XML y PDF, los dos requeridos**, como en el diseño. Un pago PPD queda con complemento cuando tiene los dos archivos vinculados a su `pago_id` y el XML está `validado` (D25). Se suben en peticiones separadas (supuesto 15). |
| D28 | Cancelar una principal con complementarias aprobadas | **En cascada**, en la misma transacción, cancelando cada complementaria y después la principal. Se bloquea todo si **cualquiera** de esas cotizaciones tiene cobros, pagos a proveedor, cuentas en una orden o cuentas en un grupo que no esté `ABIERTO` (D22). El error nombra la cotización que bloquea. |
| D29 | Etiqueta del neto en el cruce fiscal | **"Costo total · neto al proveedor"** en lugar del "X pagar · neto al proveedor" del diseño. Sigue el glosario de la decisión 006 (principio crítico 8). |

**Decisiones de la sesión 18** (segunda auditoría, §5.9):

| # | Tema | Decisión |
|---|---|---|
| D30 | IVA negativo en un mes del cierre (D26) | Se sigue la práctica fiscal. En México el IVA se declara **por mes y por contribuyente** (art. 5-D LIVA), así que el IVA a favor que da un proyecto se compensa primero con el de los demás proyectos del mismo mes. Solo si al final la empresa queda con saldo a favor, este se acredita en los meses siguientes hasta agotarlo, o se pide su devolución (art. 6 LIVA). Por eso el cierre de un proyecto **no arrastra** su propio negativo: la fila de ese mes muestra **"IVA a favor"** con el monto, sin fecha límite y con la nota "se acredita en la declaración mensual de la empresa (art. 6 LIVA)". La suma de las filas sigue siendo igual al IVA neto del proyecto, y la tarjeta "Impuestos" del periodo suma las filas con su signo. |
| D31 | Complementarias no aprobadas de una principal cancelada | **También se cancelan** en la misma transacción de D28: `EMITIDA` pasa a `CANCELADA` y `BORRADOR` se borra con sus items. No queda ninguna complementaria colgada de un proyecto que ya no existe. |
| D32 | Pago de cliente antes de la factura (anticipo) | **Se permite.** El dinero ya entró y tiene que registrarse. La pestaña "Registrar pago" de un **cobro** no se bloquea: muestra el aviso "Aún no hay factura validada; las cuentas no cerrarán sin ella" y el concepto conserva su siguiente paso ("Emitir factura" o "Revisar factura"). La RPC tampoco bloquea. El bloqueo sin factura sigue igual para los **pagos a proveedor** (supuesto 9). Es una diferencia con el prototipo (`conceptDetail` bloquea el cobro sin factura). No cambia ninguna captura: la móvil 15 es de un pago a proveedor y se conserva tal cual. |

**Decisiones de la sesión 20** (ejecución de B7):

| # | Tema | Decisión |
|---|---|---|
| D33 | Cuándo se reabre | **Un admin reabre en cualquier momento**, con o sin pendientes, siempre con motivo. Sin esto, un pago mal capturado o una factura validada equivocada en un proyecto con pendientes no tenía corrección (a veces nunca cierra justo por ese error). El chip dice "N pendientes" y, sin pendientes, "Reabierta". La reapertura no se cierra sola: la termina el admin con "Volver a cerrar" (sin pendientes) o "Terminar correcciones" (con pendientes; las cuentas se cierran solas al resolverlos, D17). Cambia la regla del prototipo (`canReopen` = cerrada). |
| D34 | Subir otra factura sobre una validada | **Es reemplazarla, y es una corrección:** solo admin, con las cuentas reabiertas y con motivo, igual en cobros, grupos y sueltas (antes las sueltas y los cobros la aceptaban de cualquiera y sin registro). La nueva se sube y valida con el flujo normal y la anterior (XML y PDF) queda dada de baja con `reemplazado_por` hacia la nueva. Dentro de una orden de pago nunca (el PDF ya se emitió con esa factura, D7). |

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
   búsqueda y proyecto seleccionado; desde la sesión 17 también el concepto
   abierto, la hoja y la pantalla empujada, S15). Así se puede compartir y
   recargar sin perderlo, y "atrás" en móvil cierra la hoja.
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
| Cobro | **cualquier estado** (incluido `PAGADO` por anticipo, D32) sin factura XML validada | Sin factura / En revisión | Emitir factura / Revisar factura (tiene prioridad sobre todo lo demás del cobro, V1) |
| Cobro | `PAGADO`, pero a un pago PPD le falta su complemento (D16) | Sin complemento | Subir complemento |
| Cobro | `PAGADO` + método del XML vigente null | Sin complemento | Indicar PUE o PPD (supuesto 4) |
| Cobro | `PAGADO` + (PUE o cada pago con su complemento) | Cobrado | — |
| Pago | suelta sin `responsable_id` ("Sin asignar", decisión 011), en cualquier estado sin saldar (T2) | Sin proveedor | Asignar proveedor (tiene prioridad sobre todo lo demás del pago) |
| Pago | grupo `ABIERTO` / suelta `PENDIENTE` sin factura | Sin factura | Subir factura |
| Pago | grupo `FACTURADO` / suelta `PENDIENTE` con factura, sin orden | Facturado | Pagar |
| Pago | con `orden_pago_id` y saldo > 0 | En orden | En orden de pago |
| Pago | grupo `EN_PROCESO_PAGO` **sin** orden (pago parcial directo; la RPC lo permite desde `FACTURADO`) | Parcial | Pagar |
| Pago | suelta `EN_PROCESO_PAGO` o en orden **sin** factura | Sin factura | Subir factura (tiene prioridad sobre "En orden") |
| Pago | `PAGADO` sin comprobante de pago (D11) | Pagado | Subir comprobante |
| Pago | `PAGADO` con factura y comprobante | Pagado | — |
| Cobro o pago | Factura subida pero en `revision` (D25) | En revisión | Revisar factura |
| Cobro | `PAGADO`, pero el complemento de algún pago PPD está en `revision` (D25) o le falta el XML o el PDF (D27) | Sin complemento | Revisar complemento / Subir complemento |

"Tiene factura" significa lo mismo en los tres tipos: existe un documento
XML de factura vigente con `estado_validacion = 'validado'` (D25). Para un
grupo coincide con `FACTURADO`. Para una suelta y para un cobro se lee del
documento, no del estado guardado. "En revisión" tiene prioridad sobre
"Facturado", "En orden" y "Pagado".
- **Solo el XML** de la factura y del complemento se validan (T1). PDF,
  comprobantes y "OTRO" nunca pasan por D25: basta con que existan.
- Cualquier `estado_validacion` distinto de `validado` en un XML cuenta como
  "En revisión", **incluido `pendiente`**. Las 6 facturas de cobro de
  producción están en `pendiente` (D10): aparecen como "En revisión" y se
  validan a mano con el PATCH vigente.
- **Documento vigente (T7):** hasta B7, el más reciente de su tipo por
  `fecha_carga`. Desde B7, el más reciente sin `eliminado_at`.
- **Vencido y En revisión a la vez (T6):** el chip dice "Vencido" (el riesgo
  de cobranza manda) y el siguiente paso "Revisar factura".
- Una factura sin `uuid_cfdi` guardado (las anteriores a B1) no permite
  validar sola sus complementos: quedan en revisión y se validan a mano
  (T10).

**Anticipos y complemento (V4):** el complemento solo se pide para los pagos
con `fecha_pago` **posterior** a la fecha de emisión de la factura PPD
(`fecha_factura`). Los pagos anteriores son anticipos: siguen el
procedimiento de anticipos del CFDI, que queda fuera del ERP, y en el
detalle se muestran como "Anticipo · sin complemento", sin bloquear el
cierre.

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
| Una sola fecha SAT por impuesto | Una fila por mes de cobro o pago | D26 |
| "X pagar · neto al proveedor" | "Costo total · neto al proveedor" | D29, glosario de la decisión 006 |
| Solo existe "Sin factura" / "Facturado" | Además, "En revisión" (tono borrador) cuando el XML no quedó validado | D25 |
| Grupo de facturación "N conceptos · una factura · un pago" | "N conceptos · una factura" | Se permiten pagos parciales al grupo (decisión 011, T8) |
| Cobro sin factura: pestaña de pago bloqueada | No se bloquea; aviso y el siguiente paso se conserva | D32 (anticipos) |
| Sin estado para cuentas sin proveedor | "Sin proveedor" (tono borrador), siguiente paso "Asignar proveedor" | T2 |

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

### 5.8 Auditoría profunda (sesión 17)

Se revisó por áreas (BD, backend, frontend, UI contra el handoff y tests)
contra el código, `pg_proc` y las restricciones de producción (solo lectura)
y contra `cuentas-data.js`. **Criterio: que el plan no genere bugs ni deuda
y que la UI solo difiera del diseño por negocio o producto.** Todos los
hallazgos quedan integrados en los bloques.

**P0 (producían bugs):**

| # | Hallazgo | Evidencia | Decisión | Bloque |
|---|---|---|---|---|
| S1 | **El desglose de una orden no se guarda.** Hoy el desglose es el `orden_pago_id` de grupos y sueltas. Cancelar una orden lo quita y reingresar a otra orden lo sobrescribe, así que el historial (D20, filas por proveedor, filtros por proveedor o proyecto) pierde el desglose. R6 pedía comparar contra "el saldo que cubría al generarse", que no se guarda. | `buscar_ordenes_pago` solo lee `ordenes_pago`; `cancelar_orden_pago` (B6) quita el `orden_pago_id` | Tabla **`ordenes_pago_conceptos`** (snapshot inmutable): la escribe `generar_orden_pago` y nunca se borra, ni al cancelar. Historial, filtros y estado de la orden leen de ahí. | B1b, B2, B6 |
| S2 | **Carrera en el monto de la orden.** La ruta calcula el total y arma el PDF antes de que la RPC bloquee las filas. Si entra un pago en medio, orden y PDF quedan con saldos viejos. | `generar-orden-pago/route.ts` | La RPC recibe el monto esperado por candidato, lo recalcula bajo `FOR UPDATE` y falla explícito (`candidatos_cambiaron`) si difiere. El total guardado es la suma de lo validado, nunca un número suelto que manda la ruta. | B1b |
| S3 | **Cancelar una complementaria no se puede hacer con `reconcile_cuenta_pagar_grupo`:** esa RPC recibe una cuenta viva y, después del borrado, no queda ninguna que pasarle. Tampoco estaba definido cancelar la principal con complementarias aprobadas: la llave foránea de sus cuentas hacia `proyectos` falla. | Cuerpo de `reconcile_cuenta_pagar_grupo` | El recálculo de `monto_total` y el borrado del grupo `ABIERTO` vacío van **dentro** de `cancel_cotizacion`, con la misma sentencia que usa `reconcile`. La principal cancela en cascada (D28). | B1b |

**P1 y P2:**

| # | Hallazgo | Decisión | Bloque |
|---|---|---|---|
| S4 | Contradicción con O1: el select de año muestra pendientes de **cada** año y Avisos es **global**, así que las dos cosas derivan todos los años. El presupuesto solo medía `periodo`. | `GET /api/cuentas/resumen` devuelve los años con pendientes y el contador de avisos. Él y `GET /api/cuentas/avisos` entran al presupuesto de O1b, igual p95 < 800 ms, y comparten el mismo respaldo (SQL con test de paridad). El cliente los pide una vez por carga y no en cada cambio de periodo. | B3, B6 |
| S5 | "Tiene factura" no era igual en los tres tipos: el cobro pasa a `FACTURADO` con el XML en `revision`, el grupo exige `validado` y la suelta solo mira que exista el documento. | D25. Además, el snapshot de A2 solo se toma cuando el documento queda `validado`. | B1, B2 |
| S6 | **Capas del código.** `concepto.ts` (`lib/shared`) llamaría a `app/components/cuentas/selectors.ts` y a `calcularCrucePagoProveedor` (`app/components/cuentas/utils.ts`), que viven en la UI que retira B8. `por-proyecto/route.ts` importa un tipo desde el hook `useCuentasPorProyecto`. `status.ts` importa `lib/server/shared/decimal` y calcula "hoy" en UTC. | En B1 se mueven a `lib/shared/cuentas/`: `status.ts`, `selectors.ts` y `calcularCrucePagoProveedor`, dejando re-exports en la ruta vieja hasta B8. `round2` pasa a `lib/shared/decimal.ts`, también con re-export. Los tipos de la RPC pasan a `lib/types.ts`. `calcularEstadoCuentaCobrarDetallado` recibe `hoy` (fecha CDMX) como parámetro y ya no calcula la fecha por su cuenta. | B1 |
| S7 | Las firmas de las RPCs de pago no son independientes: la versión de 3 parámetros **llama por dentro** a la de 2. Borrar la "vieja" sin más rompe la nueva. `registrar_pago_cuenta_cobrar` también tiene 2 firmas y B1 la toca (R4). | La regla 3 de §7.0 se precisa: **se fusionan** en una sola función, con la idempotencia de `pago_operations` al principio, y después se hace `DROP` de las dos firmas anteriores. En B1 aplica a `registrar_pago_cuenta_cobrar` y en B2 a las dos de proveedor. | B1, B2 |
| S8 | `subir-complemento` exige XML y PDF juntos, lo que choca con el supuesto 15 y con R2. El plan decía que "la UI actual asigna el pago más reciente", pero la ruta no asigna ningún pago. | La ruta acepta XML, PDF o los dos (aditivo, R2). Ninguno es obligatorio por sí solo, pero al menos uno sí. `pago_id` es opcional hasta B8: si falta, se asigna al pago más reciente que todavía no tenga ese archivo. El complemento cuenta según D27. | B1 |
| S9 | `withIdempotency` necesita una llave que mande el cliente y espera como máximo 4.5 s, menos de lo que tardan el PDF y Drive: un doble clic recibe "ya se está procesando" en lugar de la misma orden. | El cliente manda `idempotency_key` (UUID por apertura del modal). La UI trata "ya se está procesando" como estado de espera, no como error: vuelve a consultar el preview y muestra la orden si ya existe. | B1b, B6 |
| S10 | `Modal` solo tiene `lg` (512 px) y `3xl` (768 px), sin pie fijo ni encabezado propio, y su fondo es `bg-black/60`. El diseño pide 780, 820 y 960 px, pie fijo en Generar orden, encabezado con chip y ProgressBar, y fondo `rgba(0,0,0,.28)` en hojas móviles. El panel lateral de 400 px no es un modal. | `Modal` se extiende de forma aditiva: `size` acepta `780`, `820` y `960`; se agregan los slots `header` y `footer` (fijo abajo); Escape cierra; `mobile="sheet"` con fondo `.28`. Nuevo primitivo **`Drawer`** (lateral derecho de 400 px en escritorio, pantalla empujada en móvil). Los modales existentes no cambian. | B4 |
| S11 | `ResponsiveTableCard` no tiene encabezados de grupo (Lista con "Agrupar por mes") y en móvil pinta tarjetas sueltas; el diseño agrupa las filas en una tarjeta separadas por línea. | Props opcionales: `groups` (encabezado con etiqueta y subtítulo por grupo) y `mobileLayout="list"` (una tarjeta con filas separadas). Los usos actuales no cambian. | B4 |
| S12 | B7, "reasignar el proveedor en una cuenta ya pagada" (D5), solo decía "se amplía la guarda". No definía qué pasa con los pagos, la factura, el snapshot ni la orden del proveedor anterior, que ya recibió el dinero. | **Propuesta, a confirmar al abrir B7:** una RPC de corrección atómica que exige anular antes los pagos del concepto (B7). Luego da de baja la factura del grupo, que vuelve a `ABIERTO` y pierde el snapshot, y reasigna con la RPC vigente. Si el concepto está en una orden, primero se cancela la orden. No bloquea B0–B8. | B7 |
| S13 | Barra de pestañas: el diseño usa los iconos `house`, `image`, `wallet` y `ellipsis`. `AppShell` deja `pt-16` para el encabezado móvil que D23 oculta, y no reserva espacio para la barra. | La barra usa los **mismos iconos que el sidebar** (`dashboard`, `proyectos`, `cuentas` y `cotizaciones`, por U8) más `ellipsis`, que es nuevo. Así el mismo destino no tiene dos iconos distintos. `AppShell` recibe `mobileChrome="tabbar"`: en `/cuentas` quita el `pt-16` y deja abajo la altura de la barra más `env(safe-area-inset-bottom)`. | B4 |
| S14 | En tableta (768–1279 px), el sidebar de 250 px más el maestro-detalle (1fr \| 300 px) con 5 columnas no cabe. | Por debajo de `xl`, el detalle del proyecto ocupa todo el ancho y la lista compacta de proyectos se oculta; se regresa con el chevron del encabezado del proyecto. Desde `xl`, maestro-detalle como en el diseño. Captura de validación a 1024 px. | B4 |
| S15 | En móvil, "atrás" del navegador sacaba de la app en lugar de cerrar la hoja: el estado en la URL no incluía la hoja ni la pantalla empujada. | El supuesto 8 se amplía: la URL también lleva `det` (concepto abierto), `sheet` y `page` (avisos u órdenes). Abrir una hoja o una pantalla hace `push`; cambiar filtros o periodo hace `replace`. | B4 |
| S16 | Faltaban dos reglas del prototipo: el mes inicial es el actual, y al cambiar de año el mes pasa al actual (si es el año en curso) o al último mes con datos. | Se adoptan tal cual (`controls.setYear` de `cuentas-data.js`), con "hoy" en CDMX. | B4 |
| S17 | No estaba definido si "Sin fecha" cuenta en los totales y los contadores del año. | "Sin fecha" (incluido "Sin proyecto", supuesto 11) aparece como grupo en **todos** los años y en "Todo el año", pero **no** suma a las tarjetas de totales ni a los contadores de mes. Sí cuenta en Avisos y en Filtros. | B3, B4 |
| S18 | Sin tolerancia, un último pago capturado con 0.01 de diferencia deja el grupo y la orden sin cerrar nunca. | La regla del último pago (H8) aplica cuando el transferido acumulado queda a **±0.01** del total a transferir; el monto guardado es el capturado. Nunca se permite pasarse por más de 0.01. | B2 |
| S19 | "Cerrada automáticamente el …" mezcla timestamps sin zona (`documentos_*.fecha_carga`, `pagos_comprobantes.created_at`) con fechas `date`. | La fecha de cierre se calcula con fechas de negocio (`fecha_pago` capturada, la fecha de carga convertida a CDMX) y se muestra solo como fecha. Las tablas nuevas usan `timestamptz`. | B1, B2 |
| S20 | `fmtCurrency` no pone el `$`. | Nuevo `fmtMoney` en `lib/quotations/format.ts`, que envuelve `fmtCurrency` y agrega el `$`. No se toca `fmtCurrency`. | B4 |
| S21 | Playwright solo tiene el proyecto de escritorio. | Proyecto nuevo `mobile` (viewport de 390 × 844) para los specs de Cuentas, y `colorScheme: 'dark'` para las capturas de O10. | B4, B8 |

### 5.9 Segunda auditoría contra datos reales (sesión 18)

Se repitió la revisión por áreas sobre el plan de la sesión 17, esta vez
contrastando cada regla con los **datos vivos** de producción (solo
lectura). El zip del diseño es idéntico al de la sesión 12. **No salió ningún
P0.** Todo queda integrado en los bloques.

| # | Nivel | Hallazgo | Evidencia | Decisión | Bloque |
|---|---|---|---|---|---|
| T1 | P1 | D25 no contemplaba `pendiente`, que es justo el estado de todos los XML de cobro reales. Tampoco aclaraba que PDF y comprobantes no se validan. | Producción: 6 `FACTURA_XML` de cobro en `pendiente`; 2 `COMPROBANTE_PAGO` y 8 PDF en `pendiente` | D25 aplica solo a XML; todo lo distinto de `validado` es "En revisión" (§5). | B1 |
| T2 | P1 | Faltaba el estado de las sueltas sin proveedor, y hoy entran a órdenes de pago (se le paga a nadie, sin CLABE). | Producción: 4 sueltas sin `responsable_id` dentro de órdenes y 3 `PENDIENTE` | Estado "Sin proveedor" y siguiente paso "Asignar proveedor" (§5). No son elegibles para orden: van a "No incluidas" con el motivo "Falta asignar proveedor". `generar_orden_pago` lo revalida. | B1b, B1, B6 |
| T3 | P1 | D26 no tenía fórmulas ni regla para un mes con IVA negativo. | — | Fórmulas en B4 y D30. | B4 |
| T4 | P1 | El snapshot de la factura del proveedor se escribía fuera de la transacción que la da por buena, en cinco rutas. Si la segunda escritura fallaba, quedaba factura validada sin total a transferir, y la RPC de pago no puede estimar en SQL (sería un segundo motor fiscal). | `marcarGrupoFacturado` es un `UPDATE` suelto después del `INSERT` del documento | RPC única `validar_factura_proveedor` (B2) que llaman las cinco rutas. La RPC de pago falla explícito si el total a transferir es null. | B2 |
| T5 | P1 | La cascada de D28 dejaba vivas las complementarias `EMITIDA` y `BORRADOR`. Al aprobarlas, `approve_cotizacion` falla con "Proyecto base no encontrado". | `approve_cotizacion` en `pg_proc` | D31. | B1b |
| T6 | P2 | No estaba definida la prioridad entre Vencido y En revisión. | — | Chip "Vencido", siguiente paso "Revisar factura" (§5). | B1 |
| T7 | P2 | "Documento vigente" solo se definía en B7. | — | Hasta B7, el más reciente por `fecha_carga` (§5). | B1 |
| T8 | P2 | El encabezado del grupo decía "una factura · un pago", lo que contradice los pagos parciales. | Captura de escritorio 06 | Se quita "un pago" (§5.2). | B5 |
| T9 | P2 | Registrar un cobro sin factura solo se bloqueaba en la UI, y un anticipo antes de facturar es un caso real. | `conceptDetail` del prototipo ("Anticipo 50%") | D32. | B5 |
| T10 | P2 | Las facturas anteriores a B1 no tienen UUID guardado, así que su complemento no se puede validar solo. | H6 | Queda en revisión y se valida a mano (§5); aceptable por D10. | B1 |

### 5.10 Tercera auditoría (sesión 19)

Se revisaron las consecuencias de D32 y T4 y la coherencia interna del plan
contra el cuerpo real de las RPCs en producción. **No salió ningún P0.**

| # | Nivel | Hallazgo | Evidencia | Decisión | Bloque |
|---|---|---|---|---|---|
| V1 | P1 | Un cobro pagado al 100 % por anticipo (D32), sin factura, se derivaba como "Cobrado" y cerraba las cuentas sin factura, en contra de D11. | `registrar_pago_cuenta_cobrar` pone `PAGADO` sin mirar la factura | "Sin factura" y "En revisión" tienen prioridad sobre cualquier estado guardado del cobro (§5), con su test. | B1 |
| V2 | P1 | `subir-factura` de cobro fija `estado = 'FACTURADO'`: con un anticipo previo, el estado guardado retrocede hasta que corre el cron, y el Dashboard y Sheets lo leen mal mientras tanto. | `app/api/cuentas-cobrar/[id]/subir-factura/route.ts` | La ruta calcula el estado con `calcularEstadoCuentaCobrarDetallado` (montos, factura y hoy en CDMX), no con un valor fijo. | B1 |
| V3 | P1 | El arreglo de T4 quedaba incompleto: las rutas insertan el XML ya como `validado` y después llaman a la RPC. Si la RPC falla, reaparece el hueco de T4 (factura validada sin total a transferir). El portal también inserta directo como `validado`. | Las 5 rutas de factura de proveedor | Las rutas insertan el XML como `pendiente`; **solo** `validar_factura_proveedor` lo pasa a `validado`, en la misma transacción que el snapshot y el estado del grupo. | B2 |
| V4 | P2 | Se pedía complemento incluso para pagos anteriores a la factura, un caso que no existe fiscalmente. | CFDI 4.0: el complemento ampara pagos posteriores a una factura PPD | Complemento solo para pagos posteriores a `fecha_factura`; los anteriores son "Anticipo · sin complemento" (§5). | B1, B5 |

### 5.11 Decisiones de ejecución (sesión 20)

Salieron al implementar B3–B8 y B7 contra el código y la BD de test. No
cambian reglas de producto (esas son D33 y D34).

| # | Hallazgo | Decisión | Bloque |
|---|---|---|---|
| E1 | O1b: con el dataset de carga (2,196 proyectos, ~13,000 conceptos) la derivación en TS no cumplía p95 < 800 ms. | Se activó la salida prevista en O1b: la derivación vive en SQL (`cuentas_conceptos`, `cuentas_periodo`, `cuentas_resumen`, `cuentas_avisos_items`, migración 20261003) y `concepto.ts` / `periodo.ts` / `avisos.ts` quedan como referencia, obligada por `tests/e2e/live/cuentas-paridad-sql.spec.ts`. `cuentas_periodo` usa `plan_cache_mode = force_custom_plan`: el plan genérico que plpgsql adopta tras 5 llamadas por conexión multiplicaba el tiempo. | B3, B8 |
| E2 | Avisos devolvía todos los conceptos del año (5.5 MB con el dataset de carga). | Máximo 50 por categoría; cada categoría trae su `total` y el panel dice "y N avisos más". | B6 |
| E3 | H12 pedía ampliar el CHECK de `pago_operations.dominio` para anular. | No hace falta: anular es idempotente por naturaleza (el pago ya anulado devuelve `ya_anulado`), así que no usa `pago_operations`. El CHECK queda igual. | B7 |
| E4 | ¿Un pago anulado bloquea cancelar la cotización? | Sí, `cancel_cotizacion` no cambia: el pago anulado sigue siendo un registro con historia, y cancelar borraría las cuentas que lo explican. | B7 |
| E5 | Un grupo ya pagado cuya factura se dio de baja no aceptaba la nueva (`subir-factura` exigía `ABIERTO`). | La guarda es "no hay factura vigente validada" (o D34), no el estado del grupo. `validar_factura_proveedor` conserva el snapshot si ya hay pagos. | B7 |
| E6 | El p95 < 800 ms del periodo fallaba en CI ante picos de red (mediana ~500 ms): cada respuesta pesaba ~305 KB, y ~300 KB eran las opciones de los filtros (clientes y proveedores del año), en cada cambio de filtro, mes o página. | Las opciones salen del periodo: `cuentas_opciones(p_year)` (migración 20261006) y `GET /api/cuentas/opciones?anio=`, que la pantalla pide una vez por año. El periodo baja a ~5–50 KB y ~35 ms menos en la BD. La paridad SQL/TS cubre también las opciones. | B3, B8 |
| E7 | El live de p95 fallaba de forma intermitente aunque el estado estable es 330–560 ms: la primera consulta pesada en una conexión nueva de Postgres cuesta ~300 ms más (catálogo en frío) y el test calentaba con 2 peticiones; además, con 12 muestras su "p95" era el máximo. | El usuario autorizó corregir la medición: 8 peticiones de calentamiento y 40 muestras (p95 real). El presupuesto de 800 ms no cambia. | B3 |
