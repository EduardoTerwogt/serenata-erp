/**
 * Rediseño de Cuentas B1 (decisión 017): tipos, etiquetas y textos del estado visible, el
 * siguiente paso, el vencimiento y el cierre de cada concepto (un cobro, un grupo de proveedor
 * o una cuenta suelta). Desde B6 la DERIVACIÓN vive solo en SQL (`cuentas_conceptos`); el motor
 * TypeScript equivalente es un doble de pruebas en tests/support/cuentas-motor/concepto.ts.
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
export type EstadoValidacionXml = 'pendiente' | 'validado' | 'revision'
export type MetodoPagoCfdi = 'PUE' | 'PPD'

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
  emitir_factura: 'Subir factura',
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

export function textoVencimiento(dias: number): string {
  if (dias < 0) return `Vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/**
 * Nombre de un cobro en la lista y el detalle: su cotización, o
 * "Complementaria" si es de otro folio que el del proyecto. Un cobro sin
 * cotización (dato heredado) dice "Sin cotización". Mismo texto en SQL
 * (cuentas_conceptos).
 */
export function nombreCobro(cotizacionId: string | null, proyectoId: string | null): string {
  if (!cotizacionId) return 'Sin cotización'
  return !proyectoId || cotizacionId === proyectoId ? `Cotización ${cotizacionId}` : `Complementaria ${cotizacionId}`
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
