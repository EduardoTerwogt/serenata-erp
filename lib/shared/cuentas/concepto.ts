/**
 * Rediseño de Cuentas B1 (docs/PLAN.md §5; decisión 017): derivación ÚNICA
 * del estado visible, el siguiente paso, el vencimiento y el cierre de cada
 * concepto (un cobro, un grupo de proveedor o una cuenta suelta).
 *
 * - No agrega estados a la BD: deriva de montos, documentos y fechas. El
 *   `estado` guardado no manda (hoy EN_PROCESO_PAGO significa "en orden" y
 *   "pago parcial" a la vez).
 * - Entrada normalizada (O3): `total` y `pagado` llegan ya en la unidad que
 *   corresponde (cobro con IVA; pago en neto hasta B2 y en total a
 *   transferir después). Esta función no convierte montos.
 * - "Tiene factura" = XML de factura vigente `validado` (D25). Cualquier otro
 *   estado del XML, incluido `pendiente`, es "En revisión" (T1). PDF y
 *   comprobantes no se validan: basta con que existan.
 * - Documento vigente (T7): el más reciente de su tipo por `fecha_carga`
 *   (desde B7, además sin baja lógica).
 * - "Hoy" siempre llega como fecha de negocio CDMX (regla transversal 4).
 */
import { round2 } from '@/lib/shared/decimal'

export type EstadoValidacionXml = 'pendiente' | 'validado' | 'revision'
export type MetodoPagoCfdi = 'PUE' | 'PPD'

export interface DocumentoXmlInput {
  estado_validacion: EstadoValidacionXml
  /** Timestamp de carga tal como lo guarda la BD (sin zona = UTC) o fecha YYYY-MM-DD. */
  fecha_carga: string
  /** Solo facturas de cobro: MetodoPago del CFDI; null = desconocido (supuesto 4). */
  metodo_pago?: MetodoPagoCfdi | null
  /** Desde B7: baja lógica. Un documento dado de baja nunca es el vigente. */
  eliminado?: boolean
}

export interface ArchivoInput {
  fecha_carga: string
  eliminado?: boolean
}

export interface PagoCobroInput {
  id: string
  monto: number
  /** Fecha capturada del pago (YYYY-MM-DD). */
  fecha_pago: string
  /** Archivos de complemento vinculados a este pago (D16, D27). */
  complemento_xml?: DocumentoXmlInput[]
  complemento_pdf?: ArchivoInput[]
}

export interface ConceptoCobroInput {
  tipo: 'cobro'
  total: number
  pagado: number
  fecha_vencimiento?: string | null
  /** Fecha de emisión de la factura (cuentas_cobrar.fecha_factura). */
  fecha_factura?: string | null
  facturas_xml: DocumentoXmlInput[]
  pagos: PagoCobroInput[]
}

export interface ConceptoPagoInput {
  tipo: 'pago'
  total: number
  pagado: number
  /** Suelta sin responsable ("Sin asignar", decisión 011). Un grupo siempre tiene proveedor. */
  tiene_proveedor: boolean
  orden_pago_id?: string | null
  facturas_xml: DocumentoXmlInput[]
  /** Comprobantes del pago al proveedor (D11): documentos COMPROBANTE_PAGO o pagos con comprobante. */
  comprobantes: ArchivoInput[]
  /** Fechas de los pagos registrados (YYYY-MM-DD), para la fecha de cierre. */
  fechas_pago?: string[]
}

export type ConceptoInput = ConceptoCobroInput | ConceptoPagoInput

export type EstadoConcepto =
  | 'sin_factura'
  | 'en_revision'
  | 'facturado'
  | 'parcial'
  | 'vencido'
  | 'sin_complemento'
  | 'cobrado'
  | 'sin_proveedor'
  | 'en_orden'
  | 'pagado'

export type PasoConcepto =
  | 'emitir_factura'
  | 'revisar_factura'
  | 'cobrar'
  | 'subir_complemento'
  | 'revisar_complemento'
  | 'indicar_metodo'
  | 'asignar_proveedor'
  | 'subir_factura'
  | 'pagar'
  | 'en_orden'
  | 'subir_comprobante'

export type TonoEstado = 'aprobada' | 'emitida' | 'borrador' | 'cancelada'

export const ETIQUETA_ESTADO: Record<EstadoConcepto, string> = {
  sin_factura: 'Sin factura',
  en_revision: 'En revisión',
  facturado: 'Facturado',
  parcial: 'Parcial',
  vencido: 'Vencido',
  sin_complemento: 'Sin complemento',
  cobrado: 'Cobrado',
  sin_proveedor: 'Sin proveedor',
  en_orden: 'En orden',
  pagado: 'Pagado',
}

export const TONO_ESTADO: Record<EstadoConcepto, TonoEstado> = {
  sin_factura: 'borrador',
  en_revision: 'borrador',
  facturado: 'emitida',
  parcial: 'emitida',
  vencido: 'cancelada',
  sin_complemento: 'borrador',
  cobrado: 'aprobada',
  sin_proveedor: 'borrador',
  en_orden: 'emitida',
  pagado: 'aprobada',
}

export const ETIQUETA_PASO: Record<PasoConcepto, string> = {
  emitir_factura: 'Emitir factura',
  revisar_factura: 'Revisar factura',
  cobrar: 'Cobrar',
  subir_complemento: 'Subir complemento',
  revisar_complemento: 'Revisar complemento',
  indicar_metodo: 'Indicar PUE o PPD',
  asignar_proveedor: 'Asignar proveedor',
  subir_factura: 'Subir factura',
  pagar: 'Pagar',
  en_orden: 'En orden de pago',
  subir_comprobante: 'Subir comprobante',
}

export type EstadoComplementoPago = 'completo' | 'anticipo' | 'falta' | 'falta_xml' | 'falta_pdf' | 'revision'

export interface ComplementoPagoDerivado {
  pago_id: string
  /** Solo los pagos posteriores a la fecha de la factura PPD requieren complemento (V4). */
  requiere: boolean
  estado: EstadoComplementoPago
}

export interface VencimientoDerivado {
  fecha: string
  /** Días que faltan (negativo = días de atraso). */
  dias: number
  vencido: boolean
  texto: string
}

export interface ConceptoDerivado {
  estado: EstadoConcepto
  etiqueta: string
  tono: TonoEstado
  paso: PasoConcepto | null
  paso_etiqueta: string | null
  /** El paso va en rojo (cobro vencido). */
  paso_urgente: boolean
  saldo: number
  vencimiento: VencimientoDerivado | null
  /** Sin siguiente paso: cuenta resuelta (D11, D17). */
  resuelto: boolean
  /** Fecha de negocio (CDMX) del último evento que dejó el concepto resuelto (S19). */
  fecha_resuelto: string | null
  /** Solo cobros: la factura vigente trae método desconocido. */
  metodo_desconocido: boolean
  /** Solo cobros PPD: estado del complemento de cada pago (D16, D27, V4). */
  complementos: ComplementoPagoDerivado[]
}

const TOLERANCIA = 0.005

// Construir un Intl.DateTimeFormat cuesta decenas de µs: con miles de
// conceptos resueltos por año dominaba la derivación (O1b). Uno solo por módulo.
const FORMATO_CDMX = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Convierte un timestamp de la BD (sin zona = UTC) o una fecha YYYY-MM-DD a fecha de negocio CDMX. */
export function fechaNegocioCdmx(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  const tieneZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor)
  const fecha = new Date(tieneZona ? valor : `${valor.replace(' ', 'T')}Z`)
  if (Number.isNaN(fecha.getTime())) return valor.slice(0, 10)
  return FORMATO_CDMX.format(fecha)
}

function vigente<T extends { fecha_carga: string; eliminado?: boolean }>(docs: T[] | undefined): T | null {
  const activos = (docs ?? []).filter((d) => !d.eliminado)
  if (activos.length === 0) return null
  return activos.reduce((a, b) => (b.fecha_carga > a.fecha_carga ? b : a))
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

function textoVencimiento(dias: number): string {
  if (dias < 0) return `Vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

function maxFecha(fechas: (string | null | undefined)[]): string | null {
  const validas = fechas.filter((f): f is string => Boolean(f)).map(fechaNegocioCdmx)
  if (validas.length === 0) return null
  return validas.reduce((a, b) => (b > a ? b : a))
}

function construir(
  estado: EstadoConcepto,
  paso: PasoConcepto | null,
  extra: Partial<ConceptoDerivado> & { saldo: number }
): ConceptoDerivado {
  return {
    estado,
    etiqueta: ETIQUETA_ESTADO[estado],
    tono: TONO_ESTADO[estado],
    paso,
    paso_etiqueta: paso ? ETIQUETA_PASO[paso] : null,
    paso_urgente: false,
    vencimiento: null,
    resuelto: paso === null,
    fecha_resuelto: null,
    metodo_desconocido: false,
    complementos: [],
    ...extra,
  }
}

function derivarComplementos(input: ConceptoCobroInput): ComplementoPagoDerivado[] {
  const fechaFactura = input.fecha_factura ?? null
  return input.pagos.map((pago) => {
    // V4: un pago anterior (o del mismo día que la emisión, sin fecha de
    // factura no hay forma de saberlo) es anticipo y no lleva complemento.
    const requiere = fechaFactura ? pago.fecha_pago > fechaFactura : true
    if (!requiere) return { pago_id: pago.id, requiere, estado: 'anticipo' as const }
    const xml = vigente(pago.complemento_xml)
    const pdf = vigente(pago.complemento_pdf)
    let estado: EstadoComplementoPago
    if (!xml && !pdf) estado = 'falta'
    else if (!xml) estado = 'falta_xml'
    else if (xml.estado_validacion !== 'validado') estado = 'revision'
    else if (!pdf) estado = 'falta_pdf'
    else estado = 'completo'
    return { pago_id: pago.id, requiere, estado }
  })
}

export function derivarCobro(input: ConceptoCobroInput, hoy: string): ConceptoDerivado {
  const total = Number(input.total || 0)
  const pagado = Number(input.pagado || 0)
  const saldo = Math.max(0, round2(total - pagado))
  const conSaldo = saldo > TOLERANCIA

  const factura = vigente(input.facturas_xml)
  const tieneFactura = factura?.estado_validacion === 'validado'
  const enRevision = Boolean(factura) && !tieneFactura

  let vencimiento: VencimientoDerivado | null = null
  if (input.fecha_vencimiento && conSaldo) {
    const dias = diasEntre(hoy, input.fecha_vencimiento)
    vencimiento = { fecha: input.fecha_vencimiento, dias, vencido: dias < 0, texto: textoVencimiento(dias) }
  }
  const vencido = Boolean(vencimiento?.vencido)

  // V1: sin factura validada nunca es "Cobrado", aunque esté PAGADO por anticipo.
  // T6: si además está vencido, el chip dice "Vencido" y el paso sigue siendo la factura.
  if (!tieneFactura) {
    const paso: PasoConcepto = enRevision ? 'revisar_factura' : 'emitir_factura'
    const estado: EstadoConcepto = vencido ? 'vencido' : enRevision ? 'en_revision' : 'sin_factura'
    return construir(estado, paso, { saldo, vencimiento, paso_urgente: vencido })
  }

  const metodo = factura?.metodo_pago ?? null
  const complementos = metodo === 'PPD' ? derivarComplementos(input) : []

  if (conSaldo) {
    const estado: EstadoConcepto = vencido ? 'vencido' : pagado > TOLERANCIA ? 'parcial' : 'facturado'
    return construir(estado, 'cobrar', {
      saldo,
      vencimiento,
      paso_urgente: vencido,
      metodo_desconocido: metodo === null,
      complementos,
    })
  }

  if (metodo === null) {
    return construir('sin_complemento', 'indicar_metodo', { saldo, metodo_desconocido: true })
  }

  if (metodo === 'PPD') {
    const pendientes = complementos.filter((c) => c.requiere && c.estado !== 'completo')
    if (pendientes.length > 0) {
      const paso: PasoConcepto = pendientes.some((c) => c.estado === 'revision') ? 'revisar_complemento' : 'subir_complemento'
      return construir('sin_complemento', paso, { saldo, complementos })
    }
  }

  const fechaResuelto = maxFecha([
    factura?.fecha_carga,
    ...input.pagos.map((p) => p.fecha_pago),
    ...input.pagos.flatMap((p) => [vigente(p.complemento_xml)?.fecha_carga, vigente(p.complemento_pdf)?.fecha_carga]),
  ])
  return construir('cobrado', null, { saldo, complementos, fecha_resuelto: fechaResuelto })
}

export function derivarPago(input: ConceptoPagoInput): ConceptoDerivado {
  const total = Number(input.total || 0)
  const pagado = Number(input.pagado || 0)
  const saldo = Math.max(0, round2(total - pagado))
  const conSaldo = saldo > TOLERANCIA

  // T2: sin proveedor tiene prioridad sobre todo lo demás mientras no esté saldada.
  if (!input.tiene_proveedor && conSaldo) {
    return construir('sin_proveedor', 'asignar_proveedor', { saldo })
  }

  const factura = vigente(input.facturas_xml)
  const tieneFactura = factura?.estado_validacion === 'validado'
  const enRevision = Boolean(factura) && !tieneFactura

  // "En revisión" tiene prioridad sobre Facturado, En orden y Pagado (§5).
  if (enRevision) return construir('en_revision', 'revisar_factura', { saldo })

  if (conSaldo) {
    // Sin factura tiene prioridad sobre "En orden" (§5).
    if (!tieneFactura) return construir('sin_factura', 'subir_factura', { saldo })
    if (input.orden_pago_id) return construir('en_orden', 'en_orden', { saldo })
    return construir(pagado > TOLERANCIA ? 'parcial' : 'facturado', 'pagar', { saldo })
  }

  // Saldada: D11 pide factura y comprobante para cerrar.
  if (!tieneFactura) return construir('pagado', 'subir_factura', { saldo })
  const comprobante = vigente(input.comprobantes)
  if (!comprobante) return construir('pagado', 'subir_comprobante', { saldo })

  const fechaResuelto = maxFecha([factura?.fecha_carga, comprobante.fecha_carga, ...(input.fechas_pago ?? [])])
  return construir('pagado', null, { saldo, fecha_resuelto: fechaResuelto })
}

export function derivarConcepto(input: ConceptoInput, hoy: string): ConceptoDerivado {
  return input.tipo === 'cobro' ? derivarCobro(input, hoy) : derivarPago(input)
}

export interface CuentasProyectoDerivadas {
  /** D17: todos los conceptos sin siguiente paso y sin reapertura activa. */
  cerradas: boolean
  reabiertas: boolean
  pendientes: number
  /** Algún concepto vencido: el chip del proyecto va en rojo. */
  hay_vencidos: boolean
  /** Fecha de "Cerradas automáticamente el …" (S19). */
  fecha_cierre: string | null
}

export function derivarCuentasProyecto(
  conceptos: ConceptoDerivado[],
  opciones: { reabierta?: boolean } = {}
): CuentasProyectoDerivadas {
  const pendientes = conceptos.filter((c) => !c.resuelto).length
  const reabiertas = Boolean(opciones.reabierta)
  const cerradas = pendientes === 0 && !reabiertas
  return {
    cerradas,
    reabiertas,
    pendientes,
    hay_vencidos: conceptos.some((c) => c.estado === 'vencido'),
    fecha_cierre: cerradas ? maxFecha(conceptos.map((c) => c.fecha_resuelto)) : null,
  }
}
