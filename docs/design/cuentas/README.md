# Entrega: Rediseño de Cuentas (Serenata ERP)

## Resumen
Rediseño completo de la sección **Cuentas** de Serenata: cuentas por cobrar (clientes) y por pagar (proveedores) agrupadas por proyecto y por mes. El toggle anterior de Cobrar/Pagar se reemplazó por listas unificadas. Hay cierre automático y reversible de proyectos, avisos, órdenes de pago agrupadas por responsable y una versión móvil con barra de pestañas inferior.

## Cómo ver el diseño
1. **`capturas/`**: imágenes PNG de cada pantalla y estado, la referencia visual definitiva.
   - `escritorio/` (1353 × 882): 01 Por proyecto · 02 Proyecto abierto · 03–05 Detalle de cobro (Información, Registrar pago, Documentos) · 06 Detalle de pago con grupo de facturación · 07 Filtros · 08 Lista · 09 Avisos · 10 Órdenes · 11 Historial de órdenes · 12 Generar orden de pago · 13 Orden generada.
   - `movil/` (390 × 844 a 2x): 01–05 pantallas principales · 06–11 detalle y hojas · 12–16 estados · 17–21 tema oscuro.
2. **`abrir-directo/`**: versiones autocontenidas que se abren con doble clic en cualquier navegador, sin servidor ni design system.
   - `Cuentas-Escritorio.html`: escritorio interactivo. Ábrelo en una ventana de **720px de ancho o más**; con menos ancho intenta cargar la versión móvil y no funciona sin conexión.
   - `Cuentas-Movil.html`: móvil interactivo. Ábrelo en modo dispositivo del navegador (390px) o en una ventana angosta.
3. **`codigo-fuente/`**: archivos `.dc.html` y `cuentas-data.js`. Son el código fuente del prototipo. **No se abren solos**, porque dependen del design system (`_ds/`) y del entorno del proyecto de diseño. Úsalos solo para leer la estructura y los estilos exactos.

## Pendientes antes de implementar
Lo que el diseño **no** define y hay que resolver con producto o backend:

1. **PDF de la orden de pago.** El prototipo genera el nombre y la confirmación, pero el diseño del documento PDF no está definido.
2. **Montos de órdenes.** El resumen "Nueva orden" y el pie del modal muestran el **total a transferir** (con IVA y retenciones). El historial de órdenes muestra el **neto** (sin IVA). Hay que confirmar cuál se guarda y se muestra en producción.
3. **Cambio de estado al generar.** En producción, los conceptos incluidos deben pasar a `en_orden`. El prototipo no lo hace.
4. **Fecha actual.** El prototipo usa `HOY = 2026-09-24`, fijo. En producción, usar la fecha del servidor y la zona horaria de México.
5. **Datos y API.** Proyectos, conceptos, contactos, régimen fiscal, grupos de facturación y órdenes salen de `cuentas-data.js` y son de ejemplo. Falta definir el modelo y los endpoints.
6. **Documentos.** Falta definir la validación de XML/CFDI (el chip "Válida" es ilustrativo), el almacenamiento de archivos y el complemento de pago.
7. **Pestañas móviles.** Inicio, Proyectos y Cotizaciones no navegan en el prototipo; solo Cuentas está diseñada.
8. **Estados de escritorio no capturados.** Proyecto cerrado, búsqueda sin resultados y tema oscuro están diseñados en móvil y funcionan en escritorio, pero no tienen captura de escritorio.
9. **Formato de moneda.** El diseño usa 2 decimales (`$174,000.00`). La guía del design system muestra `$412,000`. Hay que confirmar cuál aplica.

## Sobre los archivos
Los archivos `.dc.html` de esta carpeta son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento esperados. **No son código de producción para copiar.** La tarea es recrearlos en el entorno del código de Serenata (framework, componentes y patrones existentes). Toda la lógica de datos del prototipo está en `cuentas-data.js`; úsala como especificación de reglas, no como implementación.

Los prototipos cargan el design system desde `_ds/apple-style-serenata-design-system-…/`. Esa carpeta no viene incluida: en el producto real se usan los componentes y tokens de Serenata que ya existen.

## Fidelidad
**Alta fidelidad.** Colores, tipografía, espaciado, estados e interacciones son finales y usan los tokens del design system de Serenata. Hay que recrearlo con precisión usando los componentes existentes (Button, Select, SearchInput, FilterTabs, Modal, Field, ProgressBar, Icon, Sidebar, UserMenu).

---

## Reglas de negocio (fuente: `cuentas-data.js`)

**Fecha de referencia del prototipo:** `HOY = 2026-09-24`.

### Conceptos y estados
Cada proyecto tiene conceptos de tipo `cobro` (cliente) o `pago` (proveedor), con `total`, `pagado` y `estado`.

| Estado | Etiqueta | Tono | Siguiente paso |
|---|---|---|---|
| sin_factura | Sin factura | borrador | Emitir factura |
| facturado | Facturado | emitida | Cobrar |
| parcial | Parcial | emitida | Cobrar |
| vencido | Vencido | cancelada | Cobrar (texto en rojo) |
| sin_complemento | Sin complemento | borrador | Subir complemento |
| cobrado | Cobrado | aprobada | — |
| sin_factura_prov | Sin factura | borrador | Subir factura |
| facturado_prov | Facturado | emitida | Pagar |
| en_orden | En orden | emitida | En orden de pago |
| pagado | Pagado | aprobada | — |

- Vencimiento: si el siguiente paso es "Cobrar" y hay fecha de vencimiento, se muestra "Vence en N días" o "Vencido hace N días" (en rojo).
- Solo se usan los 4 tonos del sistema: aprobada, emitida, borrador y cancelada.

### Proyectos
- Un proyecto está **cerrado** cuando ningún concepto tiene siguiente paso pendiente, es decir, todo está cobrado, pagado y con documentos. El cierre es automático.
- **Reabrir** marca el proyecto como reabierto (chip "Reabierta", tono emitida). **Volver a cerrar** lo regresa a cerrado. Ninguno de los dos borra datos.
- Chip del proyecto: "Cerrada" (aprobada), o "N pendientes" (emitida; cancelada si algún concepto está vencido).
- Métricas de la tarjeta: si está abierto, **Por cobrar** (naranja) y **Por pagar**. Si está cerrado, **Ingreso** y **Egreso**.
- El mes y el año del proyecto salen de la fecha del evento.

### Filtros y periodo
- Periodo: año (select) + mes (12 meses o "Todo el año"). El año actual es el predeterminado. Cada mes muestra un contador de proyectos pendientes.
- El filtro Estado tiene tres opciones: Todas, Pendientes y Cerradas. **Pendientes cambia el periodo a "Todo el año"** para mostrar los pendientes de todos los meses.
- Tipo: Todo / Por cobrar / Por pagar. Elegir un Cliente limpia "Por pagar" y elegir un Proveedor limpia "Por cobrar".
- Búsqueda: folio, nombre de proyecto, cliente, contraparte o concepto.
- En "Todo el año" hay un interruptor **Agrupar por mes**.
- Los filtros activos se muestran como chips removibles.

### Totales del periodo
- **Ingresos** = Σ total de cobros. Desglose: Cobrado / Por cobrar.
- **Egresos** = Σ total de pagos. Desglose: Pagado / Por pagar.
- **Utilidad bruta** = Ingresos − Egresos (en naranja). Desglose: ISR estimado 30% y Neta estimada 70%.
- **Impuestos** = IVA a enterar + Retenciones + ISR estimado.

### Cierre fiscal estimado (por proyecto)
- Régimen por proveedor: moral (predeterminado), física o RESICO.
- Retenciones: moral 0. Física: IVA 2/3 (10.6667%) + ISR 10%. RESICO: IVA 2/3 + ISR 1.25%.
- A transferir por proveedor = neto × 1.16 − retenciones.
- IVA a enterar = (cobros − pagos) × 16%. ISR estimado = utilidad bruta × 30%. Fecha límite: día 17 del mes siguiente al evento.
- Debe llevar este aviso: la estimación no es el pago real, y el ISR real usa el coeficiente de utilidad (Art. 14 LISR).

### Avisos
Se agrupan en: Cobros vencidos, Cobros por vencer (≤10 días), Facturas de proveedor faltantes, Complementos de pago faltantes y Facturas por emitir (evento ≤30 días). **Tocar un aviso** abre el proyecto: limpia filtros, fija año y mes del evento y selecciona el proyecto.

### Orden de pago
- **Elegibles:** pagos con saldo, factura del proveedor, que no estén en otra orden y cuyo **evento ya se realizó**.
- **No incluidas** (se listan con su motivo): "Falta factura del proveedor" o "Evento el <fecha>".
- Se agrupan por **responsable** y, dentro, por proyecto. Si el proveedor factura en grupo (`GRUPOS`), se muestran las partidas del grupo.
- Cada responsable muestra banco, CLABE, correo, partidas, subtotal por proyecto y cruce fiscal (Subtotal, IVA 16%, retenciones según régimen, A transferir).
- Cada responsable tiene una casilla para incluirlo o excluirlo, y los totales se recalculan.
- Al generar: nombre `O.P DD-Mmm <folios>` (ej. `O.P 24-Sep SH059 SH061`), estado **Generada**. La orden se agrega al historial y sus cuentas pasan a **En orden de pago**. En el prototipo solo se actualiza el historial; **en producción el concepto también debe cambiar a `en_orden`**.
- Estados de orden: Generada, Parcial (emitida), Completada (aprobada), Vencida y Cancelada (cancelada).

### Detalle de cuenta (pestañas Información / Documentos / Registrar pago)
- **Cobro. Información:** proyecto, evento, fecha de factura, vencimiento (con días), monto total, pagado, saldo pendiente (naranja si > 0) y notas.
- **Pago. Información:**
  - Select de responsable. Cambiarlo también actualiza la partida del proyecto.
  - Campos, bloque "Grupo de facturación" (si aplica), cruce fiscal y contacto (correo, teléfono, banco, CLABE).
  - Orden vinculada e historial de reasignaciones.
- **Documentos.** Cobro: Factura XML (requerido), Factura PDF (opcional) y Complemento de pago XML/PDF (se habilitan al registrar un pago). Pago: Factura XML y PDF del proveedor. Aviso de factura agrupada. Límite de 4 MB.
- **Registrar pago:**
  - Se **bloquea** sin factura (hay botón "Ir a Documentos").
  - Si la cuenta está saldada, muestra el mensaje de cuenta saldada.
  - Formulario: monto (predeterminado: saldo o total a transferir), tipo (Transferencia/Efectivo/Cheque), fecha, comprobante y notas.
  - Debajo va el historial de pagos.

---

## Pantallas — Escritorio (`Cuentas-Escritorio.dc.html`)
Estructura: Sidebar (250px) + topbar de vidrio (56px) + contenido con padding 26/30px y gap 19px.

1. **Encabezado:** título "Cuentas" (22px, `sn-display`). A la derecha, botón secundario "Avisos" con contador naranja y botón primario "Orden de pago" (tamaño lg, 36px).
2. **Periodo:**
   - Pastillas de mes: 30px de alto, radio 999, texto de 12.5px.
   - Mes activo: fondo accent y texto blanco. Meses vacíos al 55% de opacidad.
   - Cada mes lleva un contador de pendientes. Al final va el botón "Todo el año".
   - El select de año va a la derecha.
3. **Barra de vista:**
   - FilterTabs "Por proyecto / Lista".
   - Botón "Filtros" (32px, radio 9) con contador. Abre un panel de 640px con 4 columnas: Estado, Tipo, Cliente con buscador y Proveedor con buscador.
   - El pie del panel tiene "Agrupar por mes", "Limpiar filtros" y "Listo".
   - Después van los chips de filtros activos y SearchInput expandible a la derecha.
4. **Totales:** 4 tarjetas en grid `auto-fit minmax(200px,1fr)`. Cada una: radio 12, padding 10/14, etiqueta de 10.5px en mayúsculas, valor de 17px/700 y desglose de 11px.
5. **Por proyecto, sin selección:** tarjetas largas con icono de carpeta (accent si está abierto, faint si está cerrado), folio monoespaciado 11px accent, nombre 14.5px/600, "cliente · Evento fecha", chip de estado de 80px de ancho mínimo, dos métricas a la derecha y chevron.
6. **Por proyecto, con selección:**
   - Grid `1fr | minmax(220px,300px)`: el detalle va a la izquierda y la lista de proyectos a la derecha.
   - Columna derecha: lista compacta; la fila activa lleva tinte accent al 8% y un borde interno derecho de 3px accent.
   - Columna izquierda: encabezado del proyecto (folio, chip, nombre de 19px, Reabrir o Volver a cerrar) y 3 métricas.
   - Debajo, tablas **Entradas · Clientes** y **Salidas · Proveedores**. Columnas: contraparte, concepto, pagado/total, estado de 104px y siguiente paso con vencimiento.
   - Al final, **Cierre del proyecto (estimado)**. Tocar el proyecto seleccionado lo cierra.
7. **Lista:** tabla con columnas icono de tipo, folio, proyecto, contraparte y tipo, concepto, pagado/total, estado y siguiente paso. Se puede agrupar por mes. Pie: "Mostrando N conceptos de M proyectos".
8. **Panel "Avisos y órdenes":** lateral derecho de 400px con pestañas Avisos / Órdenes.
   - Órdenes muestra la tarjeta "Nueva orden de pago" (resumen de elegibles + "Revisar y generar"), las últimas 5 órdenes y "Ver todo (N)".
9. **Modal Historial de órdenes:** 960px. Filtros de Estado, Mes, Proveedor y Proyecto; búsqueda por folio; filas que se expanden por proveedor; descarga de PDF.
10. **Modal Generar orden de pago:** 820px. Tarjetas por responsable **colapsadas**, igual que en móvil (casilla que solo incluye o excluye; tocar la fila la expande con banco, CLABE, correo, partidas y cruce fiscal), sección "No incluidas" y pie **fijo abajo** (`position:sticky; bottom:0`) con resumen, total a transferir, Cancelar y Generar orden PDF. Después muestra la confirmación "Orden generada".
11. **Modal Detalle de cuenta:** 780px. Encabezado con chip, concepto, proyecto, pagado/total, ProgressBar y saldo. Debajo, las 3 pestañas.

**Responsivo:** con un ancho menor a 720px, la pantalla de escritorio cambia a la versión móvil (`Cuentas-Movil`).

## Pantallas — Móvil (`Cuentas-Movil.dc.html`)
Base de 390 × 844. La barra de pestañas inferior es de vidrio y navega entre secciones del ERP: Inicio, Proyectos, **Cuentas** (activa, accent), Cotizaciones y Más. **Más** abre la hoja "Secciones".

1. **Inicio de Cuentas:**
   - Título "Cuentas" de 27px con dos botones de 36px: Avisos (con contador) y Órdenes (accent).
   - Fila de controles: botón de periodo "Mes Año" (38px, icono de calendario, contador de pendientes, chevron), botón de búsqueda y botón de filtros con contador.
   - Chips de filtros activos con scroll horizontal.
   - Carrusel de totales: tarjetas al 74% de ancho con scroll-snap y `align-items:flex-start`. Etiqueta y valor (17px) en la misma línea, desglose de 11px.
   - FilterTabs Por proyecto / Lista.
   - **Tarjeta de proyecto** (sin folio): nombre 15px/600 y "cliente · Evento" a la izquierda, chip de estado centrado verticalmente a la derecha. Debajo, dos métricas y chevron. Padding 11/14.
2. **Proyecto abierto:** hoja inferior al 92% de alto.
   - Arriba, un grabber de 36 × 5; el encabezado lleva folio, chip, nombre y cliente, y un botón de cerrar.
   - 3 métricas.
   - Tablas de Entradas y Salidas. Cada fila: contraparte y chip, luego concepto y pagado/total, con padding 9/14. **El siguiente paso y el vencimiento no van aquí; van en el detalle.**
   - Cierre estimado, aviso de cierre automático y botón Reabrir o Volver a cerrar.
3. **Lista:** tarjetas por grupo. Cada fila: icono de tipo, contraparte y chip, luego "proyecto · concepto" y pagado/total. Sin siguiente paso ni vencimiento.
4. **Detalle de cuenta:** hoja al 88% por encima del proyecto.
   - Encabezado: eyebrow, contraparte, chip y concepto, proyecto, pagado/total, ProgressBar y porcentaje/saldo.
   - **Franja "Siguiente paso: …" con el vencimiento a la derecha.**
   - Pestañas Información / Documentos / Pago. Los campos van en 2 columnas.
   - El comprobante se sube con "Tomar foto o adjuntar".
5. **Filtros:** hoja con Estado y Tipo como chips. **Cliente y Proveedor son desplegables con buscador:** muestran el valor elegido y, al abrirse, un buscador y una lista de 200px de alto con marca en la opción activa. El botón principal dice "Ver N proyectos/conceptos" y el encabezado tiene "Limpiar".
6. **Periodo:** hoja con select de año, cuadrícula de 3 × 4 meses (46px, con contador de pendientes) y "Todo el año".
7. **Avisos:** pantalla empujada con "‹ Cuentas" para regresar. Tocar un aviso abre el proyecto.
8. **Órdenes de pago:** pantalla empujada.
   - Tarjeta "Nueva orden de pago".
   - Encabezado "Historial de órdenes" con **botón de filtro de estado**. El botón abre una hoja con los estados, sus contadores y una marca en el elegido.
   - Filas de orden que se expanden (proveedores, montos y "Descargar PDF").
9. **Generar orden de pago:** hoja al 92%.
   - **Tarjetas de responsable colapsadas:** casilla, nombre, "régimen · N cuentas · Banco ••últimos 4 de la CLABE", total en accent y chevron.
   - Tocar la fila la expande (banco, CLABE, correo, partidas, cruce). Tocar la casilla solo incluye o excluye.
   - Cada proyecto dentro de un responsable muestra **PROYECTO** (nombre) y **FECHA** del evento, sin folio, y las partidas con encabezados **CONCEPTO** / **MONTO**. Escritorio usa la misma estructura, con el título **FECHA DEL EVENTO**.
   - Pie fijo con resumen, IVA, retenciones, total a transferir y "Generar orden PDF". Después muestra la confirmación con "Compartir PDF".

**Estados documentados:** proyecto cerrado, año archivado (2024), búsqueda sin resultados, pago bloqueado sin factura y orden generada. Todo también en **tema oscuro** (`data-theme="dark"`).

---

## Estado (prototipo)
`year`, `month` (0–11 o 'all'), `estado`, `tipo`, `cliente`, `proveedor`, `q`, `agrupar`, `reopened{folio}`, `view` ('proyecto'|'lista'), `sel` (folio), `det {key, tab}`, filtros del historial, `opExcl{responsable}`, `ordExtra[]` (órdenes generadas). En móvil además: `sheet`, `page` ('avisos'|'ordenes'), `searchOpen`, `fOpen`, `opOpen{responsable}` y `ordEstado`.

## Tokens de diseño (Serenata)
- **Superficies (claro):** app `#F5F5F7`, tarjeta `#FFFFFF`, fila alterna `#FAFAFB`, topbar de vidrio `rgba(245,245,247,.72)` + blur.
- **Superficies (oscuro):** app `#1C1C1E`, tarjeta `#2C2C2E`, fila alterna `#262628`.
- **Acento:** `#FE7B01`, presionado `#E06D00`, discreto/foco `#B85800`. Tintes: `rgba(254,123,1,.08)` para selección, `.05/.07` para fondo de avisos y `.35` para borde de avisos.
- **Texto:** `#1D1D1F`, `#3A3A3C`, `#6E6E73`, `#98989D`.
- **Estados:** aprobada `#218C3E`, emitida `#1C63B7`, borrador `#6E6E73`, cancelada `#C13A20`, cada uno sobre su tinte. Las pastillas tienen 80px de ancho mínimo.
- **Tipografía:** fuente del sistema (SF Pro / Inter). Escala: 10, 10.5, 11, 12, 12.5, 13.5, 14, 14.5, 17, 19, 22, 27px. Etiquetas en MAYÚSCULAS de 10.5px/600 con tracking .04em. Folios monoespaciados de 11px en accent.
- **Espaciado:** 4 / 6 / 13 / 19 / 26 / 32 / 45. Controles de 32px (grandes 36px). Filas de tabla de 46px.
- **Radios:** input 9, botón 7–8, tarjeta 12, hoja móvil 14 (arriba), pastilla 999.
- **Sombras:** `--shadow-card`, `--shadow-raised` (menús), `--shadow-overlay` (modales y hojas). Fondo detrás de hojas móviles: `rgba(0,0,0,.28)`.
- **Movimiento:** 120 / 180 / 260ms, `cubic-bezier(.2,.8,.2,1)`. Solo se animan color y opacidad.

## Recursos
- Iconos: Lucide (sustituto temporal), siempre a través del componente `Icon`.
- Sin imágenes.
- **Todos los datos son de ejemplo:** proyectos, contactos de Audio Vivo y Estudio Luz Norte, CLABEs, fechas de factura y nombres de archivo.

## Archivos
- `capturas/escritorio/*.png`, `capturas/movil/*.png`: referencia visual.
- `abrir-directo/Cuentas-Escritorio.html`, `abrir-directo/Cuentas-Movil.html`: prototipos autocontenidos.
- `codigo-fuente/Cuentas-Escritorio.dc.html`: escritorio completo, que en pantallas angostas cambia a móvil.
- `codigo-fuente/Cuentas-Movil.dc.html`: app móvil (props `start`, `height`, `statusBar`).
- `codigo-fuente/Cuentas-Movil-Pantallas.dc.html`: lienzo con todas las pantallas móviles, estados y tema oscuro.
- `codigo-fuente/cuentas-data.js`: datos de ejemplo y todas las reglas (`compute`, `conceptDetail`, `ordenPreview`, `controls`).
- `codigo-fuente/support.js`: entorno de ejecución de los prototipos. No forma parte del diseño.

## Ajuste posterior: chip de meses (escritorio)

`chip-meses/` trae el rediseño del selector de mes de escritorio (sesión 20): un chip con el periodo que se despliega en la misma fila en la tira de meses. Reemplaza la fila de 12 pastillas de este handoff; la versión móvil no cambia. Al cambiar de año se conserva el mes elegido (D35).
