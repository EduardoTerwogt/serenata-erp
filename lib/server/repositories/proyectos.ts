import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  Proyecto,
} from '@/lib/types'

// D12/D16 (B5b): el proyecto ya no guarda cliente. Se resuelve por llave:
// proyectos.id = cotizaciones.id → cotizaciones.cliente_id → clientes. La API
// conserva los campos `cliente` y `cliente_id`.
export const PROYECTO_SELECT = '*, cotizaciones!proyectos_id_fkey(cliente, cliente_id, clientes(nombre))'

type ProyectoFila = Omit<Proyecto, 'cliente'> & {
  cotizaciones?: { cliente: string | null; cliente_id: string | null; clientes: { nombre: string | null } | null } | null
}

export function aProyecto(fila: ProyectoFila): Proyecto {
  const { cotizaciones, ...resto } = fila
  return {
    ...resto,
    cliente: cotizaciones?.clientes?.nombre ?? cotizaciones?.cliente ?? '',
    cliente_id: cotizaciones?.cliente_id ?? null,
  }
}

/** Columnas de `proyectos` que el TS puede escribir (el cliente sale de la cotización). */
export type ProyectoUpdate = Partial<Omit<Proyecto, 'id' | 'created_at' | 'cliente' | 'cliente_id' | 'cotizacion'>>

// EF-3 3B-5: PAGE_SIZE conservador (la mitad del max_rows=1000 verificado
// empíricamente contra serenata-erp-test, ver
// docs/archive/ef-3-engineering-hardening.md #3B-5) -- un .limit() del lado
// cliente NO vence el cap de PostgREST, así
// que getProyectos() lee TODAS las páginas por keyset (created_at, id) en
// vez de confiar en un límite alto que igual se trunca en 1000 filas.
const PROYECTOS_PAGE_SIZE = 500
const PROYECTOS_HARD_CAP = 20000

// El tablero Kanban de useProyectosListado.ts necesita la membresía COMPLETA
// de proyectos (agrupa por etapa_id) -- paginar este endpoint rompería el
// tablero. Lee todas las filas vía keyset; nunca devuelve un array parcial
// en silencio, lanza explícito si se agota el circuit breaker.
export async function getProyectos(): Promise<Proyecto[]> {
  let all: Proyecto[] = []
  let cursorCreatedAt: string | null = null
  let cursorId: string | null = null

  while (true) {
    let query = supabaseAdmin
      .from('proyectos')
      .select(PROYECTO_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PROYECTOS_PAGE_SIZE)

    if (cursorCreatedAt && cursorId) {
      // keyset: fila estrictamente posterior al cursor en el mismo orden
      // (created_at, id) descendente -- evita el drift de .range() offset
      // si se insertan/borran filas entre páginas durante el loop.
      query = query.or(
        `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
      )
    }

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    all = all.concat((data as unknown as ProyectoFila[]).map(aProyecto))
    if (all.length > PROYECTOS_HARD_CAP) {
      throw new Error(
        `getProyectos() superó el circuit breaker de ${PROYECTOS_HARD_CAP} filas sin agotar la tabla -- ` +
        `posible bug de paginación o crecimiento muy por encima de lo esperado. Fallando explícito ` +
        `en vez de devolver un array parcial al tablero de Proyectos.`
      )
    }

    const last = data[data.length - 1] as Proyecto
    cursorCreatedAt = last.created_at
    cursorId = last.id
    if (data.length < PROYECTOS_PAGE_SIZE) break
  }

  return all
}

export async function getProyectoById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .select(PROYECTO_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return aProyecto(data as unknown as ProyectoFila)
}

/**
 * Rediseño de Cuentas B7: las cuentas del proyecto tienen una reapertura
 * activa (una por proyecto, índice único). Las RPCs de corrección lo exigen
 * por su cuenta; esto es para lecturas y guardas previas de las rutas.
 */
export async function cuentasReabiertas(proyectoId: string | null): Promise<boolean> {
  if (!proyectoId) return false
  const { data, error } = await supabaseAdmin
    .from('cuentas_reaperturas')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .is('cerrada_at', null)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function updateProyecto(id: string, updates: ProyectoUpdate) {
  // fecha_entrega es date (F4): '' = sin fecha.
  const cambios = { ...updates }
  if ('fecha_entrega' in cambios && !cambios.fecha_entrega) cambios.fecha_entrega = null
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .update({ ...cambios, ultima_actualizacion: new Date().toISOString() })
    .eq('id', id)
    .select(PROYECTO_SELECT)
    .single()
  if (error) throw error
  return aProyecto(data as unknown as ProyectoFila)
}
