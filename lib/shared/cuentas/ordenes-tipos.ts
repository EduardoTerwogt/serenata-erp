/**
 * Rediseño de Cuentas B6 (docs/PLAN.md §7 B6): contrato de "Nueva orden" y
 * del historial de órdenes. Montos en total a transferir (D20); el neto
 * (Costo total, decisión 006) viaja aparte porque es lo que la RPC revalida.
 */
import type { RegimenFiscal } from '@/lib/types'

export type MotivoNoIncluida = 'sin_proveedor' | 'sin_factura' | 'factura_revision' | 'evento_pendiente'

export interface CruceOrden {
  /** Costo total · neto al proveedor (saldo). */
  subtotal: number
  iva: number
  iva_retenido: number
  isr_retenido: number
  /** Total a transferir: snapshot del CFDI si existe, si no estimado por régimen (supuesto 6). */
  total: number
}

export interface ItemOrden {
  cuenta_id: string
  descripcion: string
  cantidad: number
  cotizacion_id: string | null
  /** Saldo neto del renglón. */
  saldo: number
}

/** Un grupo (proyecto + proveedor) o una cuenta suelta dentro de la orden. */
export interface ProyectoOrden {
  tipo: 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  proyecto_nombre: string
  folios: string[]
  fecha_evento: string | null
  items: ItemOrden[]
  /** Cruce por grupo (§5.2): una factura por proyecto. */
  cruce: CruceOrden
  /** Saldo neto que la RPC revalida bajo candado (S2). */
  monto_esperado: number
}

export interface ResponsableOrden {
  /** Id del proveedor. */
  clave: string
  nombre: string
  regimen_fiscal: RegimenFiscal | null
  banco: string | null
  clabe: string | null
  correo: string | null
  telefono: string | null
  proyectos: ProyectoOrden[]
  /** Suma de los cruces por grupo, no cruce sobre la suma (§5.2). */
  cruce: CruceOrden
}

export interface NoIncluida {
  tipo: 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  proyecto_nombre: string | null
  responsable_nombre: string | null
  /** Saldo en total a transferir (estimado si aún no hay factura). */
  monto: number
  motivo: MotivoNoIncluida
  motivo_texto: string
}

export interface PreviewOrden {
  hoy: string
  responsables: ResponsableOrden[]
  no_incluidas: NoIncluida[]
  no_incluidas_total: number
}

export interface SeleccionOrden {
  tipo: 'grupo' | 'cuenta'
  id: string
  monto_esperado: number
}

export interface OrdenGenerada {
  id: string
  pdf_url: string | null
  pdf_nombre: string
  cuentas: number
  responsables: number
  total_transferir: number
}

export type EstadoOrden = 'GENERADA' | 'PARCIALMENTE_PAGADA' | 'COMPLETADA' | 'VENCIDA' | 'CANCELADA'

export interface OrdenHistorial {
  id: string
  fecha_generacion: string
  pdf_url: string | null
  pdf_nombre: string | null
  estado: EstadoOrden
  /** Total a transferir (D20); en órdenes anteriores a B2, el monto guardado (neto). */
  monto: number
  monto_estimado: boolean
  pagado: number
  cuentas: number
  proyectos: string[]
  desglose: { proyecto_id: string | null; cotizacion_folio: string | null; responsable_id: string | null; responsable_nombre: string | null; monto: number }[]
  cancelada_at: string | null
  cancelada_motivo: string | null
}

export interface HistorialOrdenesRespuesta {
  rows: OrdenHistorial[]
  total_rows: number
  /** Por estado, con los demás filtros aplicados (hoja de filtro móvil). */
  conteos: Partial<Record<EstadoOrden, number>>
  total_sin_estado: number
}

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  GENERADA: 'Generada',
  PARCIALMENTE_PAGADA: 'Parcial',
  COMPLETADA: 'Completada',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
}
