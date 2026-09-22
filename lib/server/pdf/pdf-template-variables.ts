/**
 * Catálogo de variables `{{variable}}` disponibles por `tipo_documento`,
 * para el panel "Variables disponibles" del editor de PDFs y para bloquear
 * "Aplicar diseño" si el schema referencia una variable inexistente
 * (docs/PLAN.md, sección "Catálogo de variables por documento").
 *
 * Los 4 shapes de datos reales siguen fragmentados a propósito
 * (`CotizacionPDFData`, `OrdenPagoPreviewResult`, `HojaDeLlamadoData`,
 * `ReporteCierrePdfData`) — este catálogo es nuevo y aislado, y solo declara
 * los paths que cada generador realmente consume. Se excluyen identificadores
 * internos (`*_id`) sin valor como texto interpolado, los flags de
 * cálculo (`descuento_tipo`) y los 3 bloques legales hardcodeados de
 * Cotización (`cotizacion-pdf-helpers.ts:163-176`), que son `legal:true` con
 * contenido fijo editable en el schema, no datos. Excepción: `cotizacion.id`
 * SÍ se incluye -- `buildHeaderBody` lo muestra al cliente como
 * "# Cotización", no es un id interno de base de datos. `iva_activo` también
 * se incluye pese a ser un flag de cálculo: condiciona la fila "IVA" del
 * banner de totales (`visibleIf`), no solo el cálculo interno.
 */

export type TipoDocumento = 'cotizacion' | 'orden_pago' | 'hoja_llamado' | 'reporte_cierre'

export interface VariableDef {
  path: string
  label: string
  // 'boolean' es para condiciones (`visibleIf`), no para interpolar en
  // texto -- Bloque 7 (piloto Cotización): filas/elementos condicionales
  // como "IVA" (solo si `iva_activo`) necesitan un path real y validado,
  // igual que cualquier otra variable.
  sampleType: 'string' | 'number' | 'date' | 'array' | 'boolean'
}

type FieldNode =
  | { kind: 'leaf'; sampleType: VariableDef['sampleType']; label: string }
  | { kind: 'object'; children: Schema }
  | { kind: 'array'; children: Schema }

type Schema = Record<string, FieldNode>

function leaf(sampleType: VariableDef['sampleType'], label: string): FieldNode {
  return { kind: 'leaf', sampleType, label }
}

function obj(children: Schema): FieldNode {
  return { kind: 'object', children }
}

function arr(children: Schema): FieldNode {
  return { kind: 'array', children }
}

// Refleja CotizacionPDFData (lib/server/pdf/cotizacion-pdf-types.ts).
const COTIZACION_SCHEMA: Schema = {
  id: leaf('string', '# Cotización (folio)'),
  cliente: leaf('string', 'Cliente'),
  proyecto: leaf('string', 'Proyecto'),
  fecha_entrega: leaf('date', 'Fecha de entrega'),
  locacion: leaf('string', 'Locación'),
  fecha_cotizacion: leaf('date', 'Fecha de cotización'),
  items: arr({
    categoria: leaf('string', 'Categoría del ítem'),
    descripcion: leaf('string', 'Descripción del ítem'),
    cantidad: leaf('number', 'Cantidad'),
    precio_unitario: leaf('number', 'Precio unitario'),
    importe: leaf('number', 'Importe'),
  }),
  subtotal: leaf('number', 'Subtotal'),
  fee_agencia: leaf('number', 'Fee de agencia'),
  general: leaf('number', 'Costos generales'),
  iva: leaf('number', 'IVA'),
  total: leaf('number', 'Total'),
  porcentaje_fee: leaf('number', 'Porcentaje de fee'),
  descuento_valor: leaf('number', 'Valor de descuento configurado (% o monto fijo, según descuento_tipo)'),
  // Bloque 7: el generador real (`calculateDiscount()`) computa el monto
  // final en pesos a partir de descuento_tipo+descuento_valor+general, no
  // existe como campo plano en CotizacionPDFData -- el banner de totales
  // necesita el monto YA calculado (no la config cruda) para mostrar y
  // condicionar (`visibleIf`) la fila "Descuento" correctamente. Se agrega
  // aquí como el campo que la capa que arma `data` para el renderer deberá
  // incluir (igual que subtotal/general/iva/total, ya precalculados fuera
  // del generador de PDF).
  descuento_monto: leaf('number', 'Monto de descuento (calculado)'),
  notas: leaf('string', 'Notas'),
  // Bloque 7: condición real de la fila "IVA (16%)" del banner de totales
  // (cotizacion-pdf-helpers.ts > buildTotalsRows) -- no es texto
  // interpolable, es la condición de `visibleIf`.
  iva_activo: leaf('boolean', 'IVA activo'),
}

// Refleja OrdenPagoPreviewResult (lib/server/ordenes-pago/build.ts:30-39).
const ORDEN_PAGO_SCHEMA: Schema = {
  responsables: arr({
    responsable: obj({
      nombre: leaf('string', 'Nombre del responsable'),
      correo: leaf('string', 'Correo del responsable'),
      telefono: leaf('string', 'Teléfono del responsable'),
      banco: leaf('string', 'Banco del responsable'),
      clabe: leaf('string', 'CLABE del responsable'),
      // Bloque 9: el generador real arma "Correo: x · Tel: y · Banco: z ·
      // CLABE: w" filtrando los campos vacíos (`.filter(Boolean).join(' ·
      // ')`) -- ese join condicional es lógica de negocio, no algo que el
      // motor de templates deba reproducir con sintaxis nueva (mismo caso
      // que `equipo_texto` en Reporte de cierre). Debe llegar ya armado en
      // `data`.
      contacto_texto: leaf('string', 'Correo/Tel/Banco/CLABE, ya armado como texto'),
    }),
    total_responsable: leaf('number', 'Total del responsable'),
    eventos: arr({
      cotizacion_folio: leaf('string', 'Folio de cotización'),
      proyecto: leaf('string', 'Proyecto del evento'),
      subtotal: leaf('number', 'Subtotal del evento'),
      items: arr({
        descripcion: leaf('string', 'Descripción del ítem'),
        cantidad: leaf('number', 'Cantidad'),
        monto: leaf('number', 'Monto'),
      }),
    }),
  }),
  resumen: obj({
    responsables: leaf('number', 'Total de responsables'),
    eventos: leaf('number', 'Total de eventos'),
    items_totales: leaf('number', 'Total de ítems'),
    total_general: leaf('number', 'Total general'),
  }),
  // Bloque 9: mismo caso que `fecha_generacion` de Hoja de llamado -- el pie
  // "Generado: {fecha}" real usa la fecha de HOY al momento de generar el
  // PDF, no un dato de la orden, así que debe inyectarse en `data` al
  // momento de renderizar.
  fecha_generacion: leaf('string', 'Fecha de generación del PDF (hoy)'),
}

// Refleja HojaDeLlamadoData (lib/server/pdf/hoja-llamado-pdf.ts).
const HOJA_LLAMADO_SCHEMA: Schema = {
  proyecto: leaf('string', 'Proyecto'),
  cliente: leaf('string', 'Cliente'),
  fecha_entrega: leaf('date', 'Fecha de entrega'),
  locacion: leaf('string', 'Locación'),
  horarios: leaf('string', 'Horarios'),
  punto_encuentro: leaf('string', 'Punto de encuentro'),
  notas: leaf('string', 'Notas generales'),
  items: arr({
    descripcion: leaf('string', 'Descripción del ítem'),
    categoria: leaf('string', 'Categoría del ítem'),
    cantidad: leaf('number', 'Cantidad'),
    responsable_nombre: leaf('string', 'Nombre del responsable'),
    notas: leaf('string', 'Notas del ítem'),
    // Bloque 8: el generador real busca el teléfono en `data.responsables`
    // por `responsable_id` (`getPhone()`) -- el motor de templates no hace
    // joins entre arrays, así que este campo debe llegar ya resuelto en
    // cada ítem cuando se arme `data` para el renderer (igual que
    // `descuento_monto` en Cotización).
    telefono: leaf('string', 'Teléfono del responsable (resuelto)'),
  }),
  // Bloque 8: las tablas CREW y EQUIPO TÉCNICO del generador real son
  // `items` FILTRADO por categoría (`categoria.toLowerCase() === 'crew'` y
  // su complemento) -- `rowsBinding` resuelve un path, no filtra un array,
  // así que ambos subconjuntos deben llegar ya separados en `data` (mismo
  // shape que `items`).
  crew_items: arr({
    descripcion: leaf('string', 'Rol (crew)'),
    responsable_nombre: leaf('string', 'Nombre del responsable'),
    notas: leaf('string', 'Notas del ítem'),
    telefono: leaf('string', 'Teléfono del responsable (resuelto)'),
  }),
  equipo_items: arr({
    descripcion: leaf('string', 'Descripción del ítem de equipo'),
    cantidad: leaf('number', 'Cantidad'),
    responsable_nombre: leaf('string', 'Nombre del responsable'),
    notas: leaf('string', 'Notas del ítem'),
  }),
  responsables: arr({
    nombre: leaf('string', 'Nombre del responsable'),
    telefono: leaf('string', 'Teléfono del responsable'),
  }),
  // Bloque 8: el pie de página real imprime "Generado el {fecha}" con la
  // fecha de HOY al momento de generar el PDF, no un dato de la cotización
  // -- no es interpolable desde datos del documento, debe inyectarse en
  // `data` al momento de renderizar (igual que un campo calculado más).
  fecha_generacion: leaf('string', 'Fecha de generación del PDF (hoy)'),
}

// Refleja ReporteCierrePdfData (lib/server/pdf/reporte-cierre-pdf.ts).
const REPORTE_CIERRE_SCHEMA: Schema = {
  proyecto: leaf('string', 'Proyecto'),
  cliente: leaf('string', 'Cliente'),
  fecha_cierre: leaf('date', 'Fecha de cierre'),
  financiero: obj({
    total_cotizado: leaf('number', 'Total cotizado'),
    total_cobrado: leaf('number', 'Total cobrado'),
    total_pagado: leaf('number', 'Total pagado'),
  }),
  // Bloque 8: la tabla financiera real es UNA fila con estos 3 valores --
  // `rowsBinding` necesita un array, así que `data.financiero` debe llegar
  // también envuelto como `[data.financiero]` (mismo objeto, 1 elemento).
  financiero_fila: arr({
    total_cotizado: leaf('number', 'Total cotizado'),
    total_cobrado: leaf('number', 'Total cobrado'),
    total_pagado: leaf('number', 'Total pagado'),
  }),
  hitos: arr({
    titulo: leaf('string', 'Título del hito'),
    planeado: leaf('date', 'Fecha planeada'),
    real: leaf('date', 'Fecha real'),
  }),
  incidencias: leaf('string', 'Incidencias'),
  equipo: arr({
    nombre: leaf('string', 'Nombre del integrante'),
    roles: leaf('array', 'Roles'),
  }),
  // Bloque 8: el generador real arma un párrafo uniendo `equipo` con sus
  // roles ("Nombre (Rol1, Rol2), Nombre2, ...") y cae a un texto fijo si
  // está vacío -- ese join/fallback es lógica de negocio, no algo que el
  // motor de templates deba reproducir con una sintaxis nueva. Debe llegar
  // ya armado en `data` (igual que `descuento_monto`/`fecha_generacion`).
  equipo_texto: leaf('string', 'Equipo y roles, ya armado como texto'),
  // Mismo caso que equipo_texto: `data.incidencias.trim() || 'Sin
  // incidencias registradas.'` ya resuelto.
  incidencias_texto: leaf('string', 'Incidencias, con fallback ya resuelto'),
}

const SCHEMAS: Record<TipoDocumento, Schema> = {
  cotizacion: COTIZACION_SCHEMA,
  orden_pago: ORDEN_PAGO_SCHEMA,
  hoja_llamado: HOJA_LLAMADO_SCHEMA,
  reporte_cierre: REPORTE_CIERRE_SCHEMA,
}

function flatten(schema: Schema, prefix: string): VariableDef[] {
  const out: VariableDef[] = []
  for (const [key, node] of Object.entries(schema)) {
    if (node.kind === 'leaf') {
      out.push({ path: `${prefix}${key}`, label: node.label, sampleType: node.sampleType })
    } else if (node.kind === 'object') {
      out.push(...flatten(node.children, `${prefix}${key}.`))
    } else {
      out.push(...flatten(node.children, `${prefix}${key}[].`))
    }
  }
  return out
}

export function getVariablesForDocumento(tipo: TipoDocumento): VariableDef[] {
  return flatten(SCHEMAS[tipo], '')
}

export function isValidVariablePath(tipo: TipoDocumento, path: string): boolean {
  return getVariablesForDocumento(tipo).some((variable) => variable.path === path)
}

/**
 * Bloque 9 (`repeating-group`, Orden de pago): valida que `path` sea un
 * arreglo de FILAS (un `arr()` del catálogo), no cualquier variable -- así
 * `rowsBinding: 'responsables'` o, anidado, `rowsBinding: 'eventos'` (con
 * prefijo `responsables[].`) se validan contra el catálogo real en vez de
 * aceptar cualquier string. Un `leaf('array', ...)` (ej. `equipo[].roles`,
 * un arreglo de strings sin sub-campos) no cuenta -- no tiene filas que
 * `renderFlowElements` pueda recorrer con `children`.
 */
export function isValidArrayPath(tipo: TipoDocumento, path: string): boolean {
  const prefix = `${path}[].`
  return getVariablesForDocumento(tipo).some((variable) => variable.path.startsWith(prefix))
}
