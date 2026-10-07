/**
 * #130: lectura del selector compartido de "Subir factura" (modo renglones) y "Registrar pago" (modo pago por
 * proyecto). Todo se decide en SQL (`cuentas_proyectos_selector`, paginado, sin derivar saldos); aquí solo se llama y tipa.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { SelectorProyectosParams, SelectorProyectosRespuesta } from '@/lib/shared/cuentas/proyectos-selector-tipos'

export type * from '@/lib/shared/cuentas/proyectos-selector-tipos'

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
