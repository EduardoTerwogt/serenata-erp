/** #123 (B5, P12, P29): contrato de los pagos que `GET /api/portal/cuentas` muestra al proveedor (solo lectura). */

export type ComplementoPortal = 'no_aplica' | 'pendiente' | 'recibido'

export interface CubrePortal {
  grupo_id: string
  proyecto_id: string | null
  /** Nombre de la factura que cubre ese grupo (el XML sin extensión). */
  factura: string | null
  /** Total a transferir aplicado a ese grupo en este pago. */
  monto: number
}

export interface PagoPortal {
  pago_id: string
  fecha_pago: string
  tipo_pago: string
  /** Lo que este pago aplicó al grupo que se está viendo. */
  monto: number
  /** Todo lo que cubrió el mismo pago (una transferencia puede pagar varias facturas del proveedor). */
  cubre: CubrePortal[]
  /** PPD: el proveedor debe enviar su complemento de pago de este pago (P11). */
  complemento: ComplementoPortal
}
