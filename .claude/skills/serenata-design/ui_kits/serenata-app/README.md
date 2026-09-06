# Serenata · Fase 5 — UI kit

Recreación navegable de las secciones que Fase 5 rediseña. Un shell (`index.html`) une las pantallas; cada sección también existe como archivo suelto para revisarla aislada y para el handoff por partes.

Autorado para **1920px**, dark-only, en español (México). Todo se compone con los primitivos de `components/` — este kit no reimplementa botones, tablas ni badges.

## Archivos

| Archivo | Sección del brief |
|---|---|
| `index.html` | Shell completo, arranca en Inicio |
| `login.html` | 11 · Login |
| `cotizaciones.html` | 1.1 · Lista de Cotizaciones |
| `cotizacion-detalle.html` | 1.2 · Detalle de Cotización |
| `proyectos.html` | 2 · Proyectos |
| `cuentas.html` | 3 · Cuentas Cobrar / Pagar |
| `portal.html` | 4 · Portal de Colaboradores |
| `responsables.html` | 6 · Responsables |
| `planeacion.html` | 7 · Planeación |
| `plantillas.html` | 8 · Plantillas de Servicios |
| `admin.html` | 9 y 10 · Admin (Usuarios y Google Sheets) |

JSX: `App.jsx` (shell y ruteo), `parts.jsx` (piezas compartidas), un archivo por pantalla, `data.js` (datos de muestra).

## Qué está diseñado

**1.1 Lista de Cotizaciones** — filtro por estado con conteo, buscador por folio/cliente/proyecto, folio en tipografía display para que se lea como código, etiqueta "Complementaria de {folio}" bajo el proyecto, y alerta "Sin items" en la columna de total.

**1.2 Detalle de Cotización** — datos generales con autocompletado de cliente y proyecto; notas marcadas como internas; tabla de partidas editable con categoría, descripción autocompletada desde catálogo, cantidad, precio, responsable y X Pagar, con agregar/eliminar fila, plantilla de servicios y copiar desde otra cotización, que abre una ventana con la lista de cotizaciones para elegir de cuál traer las partidas; panel de totales debajo de las partidas, a ancho completo, con el desglose en el orden del brief (subtotal, fee de agencia, general, IVA, total final) recalculado en vivo; acciones distintas por estado (Borrador / Emitida / Aprobada / Cancelada); confirmación explícita al cancelar que nombra el proyecto y las cuentas que se borran; mensaje de éxito con link al PDF en Drive; indicador de presencia que dice quién está en el documento y en qué sección.

**2 Proyectos** — Tablero (kanban por los cuatro estados), Lista y Calendario sobre los mismos datos. Tarjeta con folio, nombre, cliente, entrega, avatares y avance. El panel de detalle conserva todos los campos actuales y agrega plantillas auto-llenables (Brief, Stakeholders, Ruta crítica, Roadmap), documentos, reporte de cierre al pasar a FINALIZADO, y el asistente conversacional sobre historial de proyectos con las fuentes que citó. La nota de sincronización con cuentas por pagar está visible junto a las partidas.

**3 Cuentas** — tabs Cobrar / Pagar con conteo, tarjetas de métrica, y dos formas de navegar: agrupada por proyecto (la principal) o lista plana. Modal de detalle con Información / Documentos / Registrar pago. El cruce fiscal está dentro de Información y distingue los dos escenarios de proveedor. La documentación etiqueta cada archivo por lo que es (factura al cliente, factura del proveedor, complemento de pago, comprobante) con estado de validación y fecha. La ficha semanal de órdenes de pago agrupa por responsable con sus datos bancarios y el total de la semana.

**4 Portal de Colaboradores** — Mis datos (personales, roles como etiquetas removibles, bancarios y régimen fiscal), Documentación con zona de arrastre, Subir factura con el resultado de validación desglosado en los tres puntos que pide el brief, e Historial con estado por factura.

**5 Dashboard Ejecutivo** (vista Inicio) — cuatro KPI clicables, balance por periodo en barras agrupadas donde cada mes navega a Cuentas, cruce del periodo con utilidad antes de ISR, cobertura de gastos fijos vs. facturación, actividad del periodo, y cotizaciones recientes con un control para ver el estado de error por fuente.

**11 Login** — tarjeta centrada sobre la textura de marca, error de credenciales, estado de carga, sin registro público.

**6 Responsables** — buscador por nombre y grilla de tarjetas con inicial como avatar, badge Activo/Inactivo, roles como etiquetas y datos de contacto. El detalle abre el mismo formulario que el alta (nombre requerido, teléfono, correo, roles agregados y removibles uno por uno, banco, CLABE de 18 dígitos, notas) más el toggle Activo/Inactivo y el historial de proyectos con proyecto, cliente, fecha del evento, rol desempeñado y monto, con el total acumulado del colaborador.

**7 Planeación** — banner de pendientes que lleva a la sub-sección de eventos sin completar, donde descartar es soft-delete y se dice explícitamente. El wizard son los cuatro pasos del brief con indicador numerado: elegir proyecto existente o nuevo, pegar el mensaje informal, revisar y corregir lo que extrajo la IA — con su nota contextual separada visualmente de cualquier nota manual — y confirmar el resumen antes de crear la cotización en borrador.

**8 Plantillas de Servicios** — grilla con nombre, descripción, los primeros tres items con su precio y "+N más", más Duplicar y Eliminar con confirmación por tarjeta. El editor usa exactamente la misma tabla editable que las partidas de una cotización y muestra el subtotal de la plantilla.

**9 Admin · Usuarios** — tabla con "(tú)" en el usuario actual, correo, secciones asignadas como etiquetas, estado y acciones Editar / Activar-Desactivar, deshabilitada sobre el propio usuario. El modal valida nombre, correo, contraseña ("dejar vacío para no cambiar" al editar) y al menos una sección, con los errores dentro del modal.

**10 Admin · Google Sheets** — instrucciones de configuración en pasos numerados, el spreadsheetId copiable, las tres acciones con estado de carga, y el resultado con link al Sheet, resumen de filas insertadas/actualizadas/borradas/errores y una fila por pestaña con su marca de éxito o fallo. "Crear Sheet" está cableado al estado de error para poder revisarlo.

## Reglas de negocio implementadas en los cálculos

- `X Pagar` es el monto neto al responsable. El proveedor agrega sus impuestos encima.
- Fee de agencia 15% por default sobre el subtotal.
- IVA del cliente: 16% sobre subtotal + fee, después del descuento.
- Escenario A · persona moral: IVA 16% acreditable, sin retenciones.
- Escenario B · persona física con honorarios: IVA 16%, retención de IVA de 2/3 (10.6667%) y retención de ISR de 10%, ambas sobre el subtotal.
- ISR de Serenata: 30% sobre utilidad, mostrado en el cruce del periodo del dashboard.

## Cobertura

Están las once secciones del brief. Las que Fase 5 no rediseña de fondo (6, 7, 8, 9 y 10) se diseñaron conservando lo que ya existe hoy, sin agregarles funcionalidad nueva.

## Decisiones que tomé y conviene revisar

- **Gráficas.** El sistema no tenía ninguna. Elegí barras agrupadas monocromas: naranja de marca para ingresos y el teal de la textura (`--sn-texture-teal`) como única segunda serie. Sin ejes, sin cuadrícula, tooltip al hover.
- **Estados nuevos.** El design system prohíbe agregar tonos de badge, así que los estados de proyecto y de cuentas se mapean a los cuatro existentes (`parts.jsx` → `SN5_STATES`). PREPRODUCCIÓN y RODAJE/POSTPRODUCCIÓN comparten tono; la distinción la carga el encabezado de columna en el tablero.
- **Folio como código.** Se resuelve con la display face a 13px con tracking abierto, no con una fuente monoespaciada — el sistema no tiene una.
- **Detalle de proyecto y de cuenta como modal**, no como panel lateral: el sistema no tiene precedente de drawer.
- **Orden de descuento.** Lo aplico sobre subtotal + fee, antes del IVA, así que queda entre el fee y el renglón "General". El brief no lo especifica.
- **Activo/Inactivo.** El sistema no tiene componente Switch (el toggle Light/Dark se retiró), así que el estado se cambia con el mismo control segmentado de los filtros.
- **Plantillas y complementarias.** El brief pide confirmar esa integración antes de rediseñarla, así que la dejé fuera del editor y lo anoté en el archivo.
