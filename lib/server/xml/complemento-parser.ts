/**
 * Parser del complemento de pago (CFDI tipo "P", Pagos 1.0 y 2.0).
 *
 * Rediseño de Cuentas B1 (docs/PLAN.md, H5, R11): reescrito con
 * fast-xml-parser, igual que factura-parser.ts. La versión anterior era por
 * regex y no leía IdDocumento. Un complemento puede traer varios Pago y
 * cada Pago varios DoctoRelacionado, así que se validan por documento: el
 * DoctoRelacionado cuyo IdDocumento es el UUID de la factura, y su
 * ImpPagado contra el pago registrado. Nunca MontoTotalPagos, que suma
 * pagos de otras facturas.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export interface DoctoRelacionadoData {
  id_documento: string
  imp_pagado?: number
}

export interface PagoComplementoData {
  fecha_pago?: string
  moneda?: string
  monto?: number
  doctos: DoctoRelacionadoData[]
}

export interface ComplementoPagoData {
  /** UUID de timbrado del propio complemento. */
  uuid?: string
  /** Fecha del primer Pago (compatibilidad con la versión anterior). */
  fecha_pago?: string
  monto_total_pagos?: number
  moneda?: string
  pagos: PagoComplementoData[]
  error?: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseAttributeValue: false,
  isArray: (tagName) => tagName === 'Pago' || tagName === 'DoctoRelacionado',
})

function num(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

interface PagoNodo {
  FechaPago?: string
  MonedaP?: string
  Monto?: string
  DoctoRelacionado?: { IdDocumento?: string; ImpPagado?: string }[]
}

export function parseComplementoPagoXML(xmlContent: string): ComplementoPagoData {
  const validacion = XMLValidator.validate(xmlContent)
  if (validacion !== true) {
    return { pagos: [], error: `XML mal formado: ${validacion.err?.msg ?? 'estructura inválida'}` }
  }

  try {
    const parsed = xmlParser.parse(xmlContent)
    const comprobante = parsed?.Comprobante
    const pagosNodo = comprobante?.Complemento?.Pagos
    if (!pagosNodo || typeof pagosNodo !== 'object') {
      return { pagos: [], error: 'El XML no parece ser un complemento de pago CFDI' }
    }

    const pagos: PagoComplementoData[] = ((pagosNodo.Pago ?? []) as PagoNodo[]).map((p) => ({
      fecha_pago: typeof p.FechaPago === 'string' ? p.FechaPago.split('T')[0] : undefined,
      moneda: p.MonedaP,
      monto: num(p.Monto),
      doctos: (p.DoctoRelacionado ?? [])
        .filter((d) => typeof d.IdDocumento === 'string' && d.IdDocumento.trim() !== '')
        .map((d) => ({ id_documento: (d.IdDocumento as string).trim(), imp_pagado: num(d.ImpPagado) })),
    }))

    // Pagos 2.0 lo trae en Totales; la versión anterior lo leía como atributo de Pagos.
    const montoTotal = num(pagosNodo.Totales?.MontoTotalPagos) ?? num(pagosNodo.MontoTotalPagos)

    return {
      uuid: comprobante?.Complemento?.TimbreFiscalDigital?.UUID,
      fecha_pago: pagos[0]?.fecha_pago,
      monto_total_pagos: montoTotal,
      moneda: pagos[0]?.moneda,
      pagos,
    }
  } catch (error) {
    return {
      pagos: [],
      error: `Error parseando complemento XML: ${error instanceof Error ? error.message : 'desconocido'}`,
    }
  }
}

const TOLERANCIA_CENTAVOS = 0.01

export interface ResultadoValidacionComplemento {
  estado_validacion: 'validado' | 'revision'
  detalle_validacion: string | null
}

/**
 * D16/R11: el complemento es válido cuando uno de sus DoctoRelacionado
 * apunta a la factura (IdDocumento = UUID de la factura) y su ImpPagado
 * coincide con el pago registrado (±0.01). Si algo no cuadra, queda en
 * 'revision' y se valida a mano, igual que las facturas. Una factura sin
 * UUID guardado (anterior a B1) no se puede validar sola (T10).
 */
export function validarComplementoPago(
  data: ComplementoPagoData,
  uuidFactura: string | null | undefined,
  montoPago: number | null | undefined
): ResultadoValidacionComplemento {
  if (data.error) {
    return { estado_validacion: 'revision', detalle_validacion: `No se pudo leer el complemento: ${data.error}` }
  }
  if (!uuidFactura) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: 'La factura no tiene UUID guardado (se subió antes de B1): valida el complemento a mano.',
    }
  }
  const objetivo = uuidFactura.trim().toUpperCase()
  const docto = data.pagos.flatMap((p) => p.doctos).find((d) => d.id_documento.toUpperCase() === objetivo)
  if (!docto) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: `El complemento no incluye la factura ${uuidFactura} en sus documentos relacionados.`,
    }
  }
  if (montoPago == null) {
    return { estado_validacion: 'revision', detalle_validacion: 'No hay un pago registrado al cual vincular el complemento.' }
  }
  if (docto.imp_pagado == null) {
    return { estado_validacion: 'revision', detalle_validacion: 'El complemento no declara ImpPagado para la factura.' }
  }
  if (Math.abs(docto.imp_pagado - montoPago) > TOLERANCIA_CENTAVOS) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: `ImpPagado no coincide: complemento $${docto.imp_pagado.toFixed(2)} vs pago $${Number(montoPago).toFixed(2)}.`,
    }
  }
  return { estado_validacion: 'validado', detalle_validacion: null }
}
