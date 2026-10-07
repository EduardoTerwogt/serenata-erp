/**
 * #130: lectura del selector compartido de "Subir factura" (modo renglones) y "Registrar pago" (modo pago por
 * proyecto). Todo se decide en SQL (`cuentas_proyectos_selector`, paginado, sin derivar saldos); aquí solo se llama y tipa.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'

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

export interface ProyectoSelector {
  proyecto_id: string
  proyecto: string | null
  cliente: string | null
  fecha_entrega: string | null
  /** modo renglones */
  de_contraparte?: boolean
  renglones?: RenglonSelector[]
  /** modo pago */
  contrapartes?: { id: string; nombre: string; facturas: number; saldo: number }[]
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

export async function cargarSelectorProyectos(p: SelectorProyectosParams): Promise<SelectorProyectosRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_proyectos_selector', {
    p_modo: p.modo,
    p_lado: p.lado ?? null,
    p_q: p.q ?? null,
    p_contraparte: p.contraparte ?? null,
    p_solo_pendientes: p.soloPendientes,
    p_page: p.page,
    p_page_size: p.pageSize,
  })
  if (error) throw error
  return data as SelectorProyectosRespuesta
}
