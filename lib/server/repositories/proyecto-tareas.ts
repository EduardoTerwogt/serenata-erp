import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ProyectoTarea, ProyectoTareaChecklistItem } from '@/lib/types'
import { calcularFechaLimite } from '@/lib/server/projects/pm-helpers'
import { getTareasDefaultByTipo } from '@/lib/server/repositories/tipos-proyecto'

function conNombreAsignado(row: Record<string, unknown>): ProyectoTarea {
  const proveedor = row.proveedores as { nombre?: string } | null
  const { proveedores: _proveedores, ...rest } = row
  void _proveedores
  return { ...(rest as unknown as ProyectoTarea), asignado_a_nombre: proveedor?.nombre ?? null }
}

export async function getTareasByProyecto(proyectoId: string): Promise<ProyectoTarea[]> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tareas')
    .select('*, proveedores(nombre)')
    .eq('proyecto_id', proyectoId)
    .order('fecha_limite', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data || []).map(conNombreAsignado)
}

export async function getTareaById(id: string): Promise<ProyectoTarea> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tareas')
    .select('*, proveedores(nombre)')
    .eq('id', id)
    .single()
  if (error) throw error
  return conNombreAsignado(data as Record<string, unknown>)
}

export async function createTarea(
  proyectoId: string,
  tarea: {
    titulo: string
    descripcion?: string | null
    asignado_a?: string | null
    es_hito?: boolean
    fecha_limite?: string | null
    origen?: 'plantilla' | 'manual'
  }
): Promise<ProyectoTarea> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tareas')
    .insert({ ...tarea, proyecto_id: proyectoId, origen: tarea.origen ?? 'manual' })
    .select('*, proveedores(nombre)')
    .single()
  if (error) throw error
  return conNombreAsignado(data as Record<string, unknown>)
}

export async function updateTarea(
  id: string,
  updates: Partial<Pick<ProyectoTarea, 'titulo' | 'descripcion' | 'estado' | 'asignado_a' | 'es_hito' | 'fecha_limite'>>
): Promise<ProyectoTarea> {
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }

  if (updates.estado) {
    payload.fecha_completada = updates.estado === 'COMPLETADA' ? new Date().toISOString() : null
  }

  const { data, error } = await supabaseAdmin
    .from('proyecto_tareas')
    .update(payload)
    .eq('id', id)
    .select('*, proveedores(nombre)')
    .single()
  if (error) throw error
  return conNombreAsignado(data as Record<string, unknown>)
}

export async function deleteTarea(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('proyecto_tareas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getChecklistByTarea(tareaId: string): Promise<ProyectoTareaChecklistItem[]> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tarea_checklist')
    .select('*')
    .eq('tarea_id', tareaId)
    .order('orden', { ascending: true })
  if (error) throw error
  return data as ProyectoTareaChecklistItem[]
}

export async function createChecklistItem(
  tareaId: string,
  item: { texto: string; orden?: number }
): Promise<ProyectoTareaChecklistItem> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tarea_checklist')
    .insert({ ...item, tarea_id: tareaId })
    .select()
    .single()
  if (error) throw error
  return data as ProyectoTareaChecklistItem
}

export async function updateChecklistItem(
  id: string,
  updates: Partial<Pick<ProyectoTareaChecklistItem, 'texto' | 'completado' | 'orden'>>
): Promise<ProyectoTareaChecklistItem> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_tarea_checklist')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ProyectoTareaChecklistItem
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('proyecto_tarea_checklist')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * Copia la plantilla de tareas típicas del tipo de proyecto hacia
 * proyecto_tareas (origen='plantilla'), calculando fecha_limite desde la
 * fecha de entrega del proyecto. Se llama una sola vez, al asignar el tipo
 * de proyecto (ver POST /api/proyectos/[id]/tipo) -- idempotencia la
 * garantiza el caller (solo se asigna tipo si aún no tenía uno).
 */
export async function copyTareasDefaultToProyecto(
  proyectoId: string,
  tipoProyectoId: string,
  fechaEntrega: string | null
): Promise<ProyectoTarea[]> {
  const plantilla = await getTareasDefaultByTipo(tipoProyectoId)
  if (plantilla.length === 0) return []

  const rows = plantilla.map((t) => ({
    proyecto_id: proyectoId,
    titulo: t.titulo,
    descripcion: t.descripcion,
    es_hito: t.es_hito,
    origen: 'plantilla' as const,
    fecha_limite: calcularFechaLimite(fechaEntrega, t.dias_antes_entrega),
  }))

  const { data, error } = await supabaseAdmin
    .from('proyecto_tareas')
    .insert(rows)
    .select('*, proveedores(nombre)')
  if (error) throw error
  return (data || []).map(conNombreAsignado)
}

export interface TareaAgregada extends ProyectoTarea {
  proyecto_nombre: string
  proyecto_cliente: string
}

/**
 * Vista agregada de tareas de todos los proyectos activos (pantalla
 * "Tareas" del listado general) -- vencidas y pendientes primero.
 *
 * NOTA: filtra por `estado != FINALIZADO`, el enum legado -- correcto para
 * proyectos de tipo Grabación (único tipo que existía cuando se creó ese
 * campo). Concierto/Diseño de Show no tienen equivalente legado hoy (ver
 * pm-helpers.estadoLegadoParaEtapa), así que sus tareas no se excluyen
 * automáticamente al cerrar todavía -- se resuelve cuando Bloque 3/4
 * termine de migrar el filtro a etapa.es_etapa_final.
 */
// EF-3 3B-5: mismo PAGE_SIZE/HARD_CAP conservadores que getProyectos()
// (ver docs/archive/ef-3-engineering-hardening.md #3B-5) -- alimenta las tabs
// Tareas/Estatus del mismo tablero Kanban, necesita membresía completa.
const TAREAS_AGREGADAS_PAGE_SIZE = 500
const TAREAS_AGREGADAS_HARD_CAP = 20000

export async function getTareasAgregadas(): Promise<TareaAgregada[]> {
  let all: Record<string, unknown>[] = []
  let cursorFechaLimite: string | null = null
  let cursorId: string | null = null

  while (true) {
    let query = supabaseAdmin
      .from('proyecto_tareas')
      .select('*, proveedores(nombre), proyectos!inner(proyecto, cliente, estado)')
      .neq('estado', 'COMPLETADA')
      .neq('proyectos.estado', 'FINALIZADO')
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(TAREAS_AGREGADAS_PAGE_SIZE)

    // 2 ramas explícitas -- NULLS LAST pone TODAS las filas con
    // fecha_limite IS NULL después de TODAS las no-nulas, así que "después
    // del cursor" depende de si el cursor mismo ya cruzó al bloque NULL.
    if (cursorFechaLimite !== null) {
      // cursor con fecha_limite no nula: la página siguiente incluye tanto
      // las filas con fecha_limite mayor (o igual + id mayor, desempate)
      // como TODAS las filas NULL -- van después de cualquier no-nula bajo
      // NULLS LAST, sin importar el valor del cursor.
      query = query.or(
        `fecha_limite.gt.${cursorFechaLimite},and(fecha_limite.eq.${cursorFechaLimite},id.gt.${cursorId}),fecha_limite.is.null`
      )
    } else if (cursorId !== null) {
      // cursor ya dentro del bloque NULL: no hay nada "después" salvo más
      // filas NULL con id mayor -- ya estamos al final del orden.
      query = query.is('fecha_limite', null).gt('id', cursorId)
    }
    // cursorFechaLimite/cursorId ambos null: primera página, sin filtro de cursor.

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    all = all.concat(data as Record<string, unknown>[])
    if (all.length > TAREAS_AGREGADAS_HARD_CAP) {
      throw new Error(
        `getTareasAgregadas() superó el circuit breaker de ${TAREAS_AGREGADAS_HARD_CAP} filas sin agotar la tabla -- ` +
        `posible bug de paginación o crecimiento muy por encima de lo esperado. Fallando explícito ` +
        `en vez de devolver un array parcial al tablero de Proyectos.`
      )
    }

    const last = data[data.length - 1] as Record<string, unknown>
    cursorFechaLimite = (last.fecha_limite as string | null) ?? null
    cursorId = last.id as string
    if (data.length < TAREAS_AGREGADAS_PAGE_SIZE) break
  }

  return all.map((row) => {
    const proyecto = row.proyectos as { proyecto: string; cliente: string }
    const { proyectos: _proyectos, ...rest } = row
    void _proyectos
    return {
      ...conNombreAsignado(rest),
      proyecto_nombre: proyecto.proyecto,
      proyecto_cliente: proyecto.cliente,
    }
  })
}
