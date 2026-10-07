/**
 * #123 (B3/B4): contrato de `POST /api/cuentas/facturas/preview` (y de la confirmación) entre la ruta y la ventana
 * "Subir factura". El cuadre lo calcula SQL (`factura_cuadre`, T9) y el cliente solo lo pinta (T6).
 */
import type { CandidatoFacturaCobro, CandidatoFacturaProveedor, LadoCuentas } from './estado-cuenta-tipos'

export type TipoDocumentoCuentas = 'factura_cobro' | 'factura_proveedor' | 'complemento_cobro' | 'complemento_proveedor'

export interface ContraparteRfc {
  id: string
  nombre: string
  rfc: string | null
}

export interface CfdiPreview {
  uuid: string | null
  fecha: string | null
  total: number | null
  subtotal: number | null
  metodo_pago: 'PUE' | 'PPD' | null
  rfc_emisor: string | null
  rfc_receptor: string | null
  conceptos: string[]
  /** Folios SH que nombran los conceptos (P4). */
  folios: string[]
}

export interface CuadreCobro {
  total_cfdi: number
  n: number
  suma: number
  /** total del XML − suma de las cotizaciones: > 0 faltan, < 0 sobran. */
  diferencia: number
  tolerancia: number
  estado: 'validado' | 'revision'
  detalle: string | null
  otro_cliente: boolean
  ya_ligadas: string[]
  no_encontradas: number
}

export interface CuadreProveedor {
  estado: string
  detalle: string | null
  monto_total: number
}

/** #130: renglones "por asignar" de un proyecto que suman el neto (subtotal) del XML dentro de la tolerancia. */
export interface PropuestaRenglones {
  proyecto_id: string
  proyecto: string | null
  renglones: string[]
  neto: number
}

export interface ProveedorParecido {
  id: string
  nombre: string
  score: number
}

/** #130: datos del XML para prellenar el alta del proveedor; el usuario completa banco, CLABE, correo y teléfono. */
export interface EmisorPreview {
  rfc: string | null
  nombre: string | null
  regimen_codigo: string | null
  regimen_sugerido: 'moral' | 'fisica' | 'resico' | null
}

export interface ReceptorPreview {
  rfc: string | null
  nombre: string | null
}

export interface PreviewFactura {
  tipo: 'factura_cobro' | 'factura_proveedor'
  lado: LadoCuentas
  cfdi: CfdiPreview
  rfc_contraparte: string | null
  contraparte: ContraparteRfc | null
  /** Más de una contraparte con ese RFC: el usuario elige. */
  ambiguas: ContraparteRfc[]
  ofrecer_guardar_rfc: boolean
  rfc_distinto: boolean
  candidatos: (CandidatoFacturaCobro | CandidatoFacturaProveedor)[]
  /** Cuentas de cobro que los folios del XML nombran (P4). */
  preseleccion: string[]
  cuadre: CuadreCobro | CuadreProveedor | null
  /** Ya existe una factura vigente con ese UUID. */
  duplicada: { id: string } | null
  /** #130: tolerancia (en pesos) con la que se propone por el neto del XML. */
  tolerancia: number
  propuesta: PropuestaRenglones[]
  /** Proveedores con nombre parecido al del emisor, para ofrecer "es este proveedor". */
  coincidencias_nombre: ProveedorParecido[]
  emisor: EmisorPreview | null
  receptor: ReceptorPreview | null
  /** Cliente ya elegido: ¿tiene constancia guardada? (null si no aplica). */
  cliente_tiene_constancia: boolean | null
}

export interface RelacionadoPreview {
  uuid_factura: string
  monto_pagado: number
  factura: { id: string; estado_validacion: string | null; metodo_pago: string | null; total_cfdi: number | null } | null
}

export interface PreviewComplemento {
  tipo: 'complemento_cobro' | 'complemento_proveedor'
  lado: LadoCuentas
  cfdi: { uuid: string | null; fecha: string | null }
  relacionados: RelacionadoPreview[]
}

export type PreviewCuentas = PreviewFactura | PreviewComplemento

export const esComplementoPreview = (p: PreviewCuentas): p is PreviewComplemento => p.tipo === 'complemento_cobro' || p.tipo === 'complemento_proveedor'
export const esCandidatoCobro = (c: CandidatoFacturaCobro | CandidatoFacturaProveedor): c is CandidatoFacturaCobro => 'cuenta_id' in c
export const esCuadreCobro = (c: CuadreCobro | CuadreProveedor): c is CuadreCobro => 'diferencia' in c
