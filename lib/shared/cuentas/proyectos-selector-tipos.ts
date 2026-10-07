/**
 * #130: contrato de `GET /api/cuentas/proyectos-selector` (SQL `cuentas_proyectos_selector`) entre la ruta y las ventanas
 * Subir factura (modo renglones) y Registrar pago por proyecto (modo pago). El cliente solo pinta lo que decide SQL.
 */
import type { LadoCuentas } from './estado-cuenta-tipos'

export interface RenglonSelector {
  cuenta_id: string
  descripcion: string
  costo_total: number
  gasto_extra: boolean
  responsable_id: string | null
  responsable: string | null
  grupo_id: string | null
  grupo_estado: string | null
  /** Con pagos, en una orden o en un grupo ya facturado: no se puede reasignar (D21). */
  bloqueado: boolean
}

export interface ContraparteSaldo {
  id: string
  nombre: string
  facturas: number
  saldo: number
}

export interface ProyectoSelector {
  proyecto_id: string
  proyecto: string | null
  cliente: string | null
  fecha_entrega: string | null
  /** modo renglones */
  de_contraparte?: boolean
  renglones?: RenglonSelector[]
  /** modo pago */
  contrapartes?: ContraparteSaldo[]
}

export interface SelectorProyectosRespuesta {
  modo: 'renglones' | 'pago'
  total: number
  page: number
  page_size: number
  proyectos: ProyectoSelector[]
}

export interface SelectorProyectosParams {
  modo: 'renglones' | 'pago'
  lado?: LadoCuentas
  q?: string
  contraparte?: string
  soloPendientes: boolean
  page: number
  pageSize: number
}
