/** #131: contrato de `GET /api/cuentas/contrapartes` (SQL `cuentas_contrapartes_pendientes`) con el desplegable de Acciones. */
export type PendienteContraparte = 'factura' | 'complemento' | 'saldo' | 'todos'

export interface ContrapartePendiente {
  id: string
  nombre: string
  /** Cuántas cosas pendientes tiene; 0 con `todos` (no se cuenta). */
  pendientes: number
}

export interface ContrapartesPendientes {
  /** Cuántas coinciden en total; la lista trae hasta 50. */
  total: number
  contrapartes: ContrapartePendiente[]
}
