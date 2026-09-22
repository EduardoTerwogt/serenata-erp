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
 * internos (`id`, `*_id`) sin valor como texto interpolado, los flags de
 * cálculo (`iva_activo`, `descuento_tipo`) y los 3 bloques legales
 * hardcodeados de Cotización (`cotizacion-pdf-helpers.ts:163-176`), que son
 * `legal:true` con contenido fijo editable en el schema, no datos.
 */

export type TipoDocumento = 'cotizacion' | 'orden_pago' | 'hoja_llamado' | 'reporte_cierre'

export interface VariableDef {
  path: string
  label: string
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
  id: leaf('string', 'Folio de cotización'),
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
  iva_activo: leaf('boolean', 'IVA activo'),
  total: leaf('number', 'Total'),
  porcentaje_fee: leaf('number', 'Porcentaje de fee'),
  descuento_valor: leaf('number', 'Valor de descuento'),
  // Monto ya calculado (calculateDiscount() en cotizacion-pdf-helpers.ts) --
  // 0 cuando no hay descuento, lo que además sirve como su propio
  // `visibleIf` en el banner de totales.
  descuento_monto: leaf('number', 'Monto de descuento'),
  notas: leaf('string', 'Notas'),
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
  }),
  responsables: arr({
    nombre: leaf('string', 'Nombre del responsable'),
    telefono: leaf('string', 'Teléfono del responsable'),
  }),
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
