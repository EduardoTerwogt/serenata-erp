import { ItemCotizacion, Proyecto, Responsable } from '@/lib/types'

export interface ProyectoDetalle extends Proyecto {
  items?: ItemCotizacion[]
  cotizacion_ids?: string[]
}

export interface ProyectoFormValues {
  fecha_entrega: string
  locacion: string
  horarios: string
  punto_encuentro: string
  notas: string
  estado: Proyecto['estado']
}

export async function fetchProjectDetail(id: string): Promise<ProyectoDetalle> {
  const res = await fetch(`/api/proyectos/${id}`)
  if (!res.ok) throw new Error('Proyecto no encontrado')
  return res.json()
}

export async function fetchProjectDetailBundle(id: string): Promise<{ proyecto: ProyectoDetalle; responsables: Responsable[] }> {
  const [proyecto, responsables] = await Promise.all([
    fetchProjectDetail(id),
    fetch('/api/responsables').then(async r => {
      if (!r.ok) throw new Error('Error cargando responsables')
      return r.json()
    }),
  ])

  return { proyecto, responsables }
}

export function buildItemNotasMap(items: ItemCotizacion[]): Record<string, string> {
  return Object.fromEntries(items.map(item => [item.id, item.notas || '']))
}

export function buildProjectFormDefaults(proyecto: ProyectoDetalle): ProyectoFormValues {
  return {
    fecha_entrega: proyecto.fecha_entrega || '',
    locacion: proyecto.locacion || '',
    horarios: proyecto.horarios || '',
    punto_encuentro: proyecto.punto_encuentro || '',
    notas: proyecto.notas || '',
    estado: proyecto.estado,
  }
}

export async function updateProjectDetail(
  id: string,
  data: ProyectoFormValues,
  items: ItemCotizacion[],
  itemNotas: Record<string, string>
): Promise<ProyectoDetalle> {
  const notas_por_item = Object.fromEntries(items.map(item => [item.id, itemNotas[item.id] ?? '']))

  const res = await fetch(`/api/proyectos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      notas_por_item,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error actualizando proyecto' }))
    throw new Error(err.error || 'Error actualizando proyecto')
  }

  return res.json()
}

export async function updateProjectItemResponsable(itemId: string, responsableId: string, responsables: Responsable[]) {
  const responsable = responsables.find(r => r.id === responsableId)

  const res = await fetch(`/api/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responsable_id: responsableId || null,
      responsable_nombre: responsable?.nombre || null,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error actualizando responsable' }))
    throw new Error(err.error || 'Error actualizando responsable')
  }

  return {
    responsable_id: responsableId,
    responsable_nombre: responsable?.nombre || null,
  }
}
