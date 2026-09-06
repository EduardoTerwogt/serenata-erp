import { ItemCotizacion, Proyecto, Proveedor } from '@/lib/types'

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

export interface ProjectDetailBundle {
  proyecto: ProyectoDetalle
  responsables: Proveedor[]
}

export type ProjectItemNotasMap = Record<string, string>

export interface ProjectItemResponsableUpdate {
  responsable_id: string
  responsable_nombre: string | null
}
