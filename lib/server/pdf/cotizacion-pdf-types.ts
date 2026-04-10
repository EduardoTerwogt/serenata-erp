export interface CotizacionPDFData {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  fecha_cotizacion: string | null
  items: Array<{
    categoria: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    importe: number
  }>
  subtotal: number
  fee_agencia: number
  general: number
  iva: number
  total: number
  iva_activo: boolean
  porcentaje_fee: number
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

export type TotalsRow = {
  label: string
  value: string
  labelColor: [number, number, number]
  valueColor: [number, number, number]
  bold: boolean
  fontSize: number
}
