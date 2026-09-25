/**
 * Rediseño de Cuentas B3 (docs/PLAN.md): contrato de `GET /api/cuentas/periodo`
 * y `GET /api/cuentas/resumen`, compartido por la ruta y la UI nueva (B4).
 *
 * Montos: cobros con IVA; pagos en TOTAL A TRANSFERIR (D3, D18). El neto solo
 * aparece en el cruce fiscal (`cierre`).
 */
import type { CierreProyecto } from '@/lib/shared/cierre-proyecto'
import type { FilaCierre } from '@/lib/shared/cuentas/cierre-mensual'
import type { ConceptoDerivado, CuentasProyectoDerivadas } from '@/lib/shared/cuentas/concepto'
import type { RegimenFiscal } from '@/lib/types'

export type MesPeriodo = number | 'todo'
export type FiltroEstado = 'todas' | 'pendientes' | 'cerradas'
export type FiltroTipo = 'todo' | 'cobro' | 'pago'
export type VistaCuentas = 'proyectos' | 'lista'

/** Id de URL del grupo "Sin proyecto" (supuesto 11). */
export const SIN_PROYECTO_ID = 'sin-proyecto'

export interface ConceptoVista extends ConceptoDerivado {
  /** Único en el año: 'c:<cuenta_cobrar>', 'g:<grupo>' o 's:<cuenta_pagar suelta>'. */
  key: string
  tipo: 'cobro' | 'pago'
  objetivo: 'cobro' | 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  cotizacion_id: string | null
  /** Folio de la cuenta por cobrar (solo cobros). */
  folio: string | null
  contraparte: string
  contraparte_id: string | null
  concepto: string
  /** Renglones del grupo (1 en cobros y sueltas). */
  items: number
  total: number
  pagado: number
  /** Pago sin snapshot del CFDI: el total es el estimado por régimen (supuesto 6). */
  total_estimado: boolean
  regimen_fiscal: RegimenFiscal | null
  orden_pago_id: string | null
  fecha_vencimiento: string | null
}

export interface TotalesProyecto {
  cobros_total: number
  cobrado: number
  por_cobrar: number
  pagos_total: number
  pagado: number
  por_pagar: number
}

export interface TarjetaProyecto {
  /** Folio del proyecto; SIN_PROYECTO_ID para las cuentas sin proyecto. */
  id: string
  nombre: string
  cliente: string | null
  fecha_entrega: string | null
  anio: number | null
  /** 1–12; null en "Sin fecha". */
  mes: number | null
  sin_fecha: boolean
  sin_proyecto: boolean
  cuentas: CuentasProyectoDerivadas
  totales: TotalesProyecto
}

export interface ProyectoDetalle extends TarjetaProyecto {
  conceptos: ConceptoVista[]
  cierre: CierreProyecto
  /** Cierre partido por mes de cobro o pago, con fecha límite SAT (D26, D30). */
  cierre_mensual: FilaCierre[]
}

export interface ConceptoLista extends ConceptoVista {
  proyecto: { id: string; nombre: string; mes: number | null; sin_fecha: boolean }
}

export interface MesResumen {
  mes: number
  proyectos: number
  pendientes: number
  /** Proyectos del mes que pasan el filtro de estado: 0 = pastilla atenuada. */
  visibles: number
}

export interface TotalesPeriodo {
  ingresos: { total: number; cobrado: number; por_cobrar: number }
  /** Total a transferir: IVA incluido, menos retenciones. */
  egresos: { total: number; pagado: number; por_pagar: number }
  utilidad: { bruta: number; isr_estimado: number; neta: number }
  impuestos: { iva_a_enterar: number; retenciones: number; isr_estimado: number; total: number }
}

export interface Paginado<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface PeriodoRespuesta {
  anio: number
  mes: MesPeriodo
  hoy: string
  meses: MesResumen[]
  conteo: { todas: number; pendientes: number; cerradas: number }
  totales: TotalesPeriodo
  proyectos: Paginado<TarjetaProyecto>
  /** "Sin fecha" y "Sin proyecto" (S17): solo en "Todo el año"; no suman a totales ni a meses. */
  sin_fecha: TarjetaProyecto[]
  lista: Paginado<ConceptoLista> & { proyectos: number }
  seleccionado: ProyectoDetalle | null
}

/**
 * Opciones de los filtros Cliente y Proveedor: los del año, sin importar el
 * mes ni los demás filtros. Van en su propia petición (`/api/cuentas/opciones`),
 * una vez por año, no en cada lectura del periodo (O1b, E6).
 */
export interface OpcionesFiltros {
  anio: number
  clientes: string[]
  proveedores: string[]
}

export interface ResumenRespuesta {
  hoy: string
  anios: { anio: number; pendientes: number }[]
  avisos: number
}

export type CategoriaAviso = 'vencidos' | 'por_vencer' | 'facturas_proveedor' | 'complementos' | 'por_emitir'

export interface AvisoItem {
  categoria: CategoriaAviso
  /** Key del concepto (ConceptoVista.key). */
  key: string
  proyecto_id: string
  proyecto_nombre: string
  /** Año y mes del evento, para abrir el proyecto en su periodo (null = "Sin fecha"). */
  anio: number | null
  mes: number | null
  contraparte: string
  monto: number
  detalle: string
  /** Fecha para ordenar dentro de la categoría (YYYY-MM-DD). */
  fecha: string | null
}

export interface AvisosRespuesta {
  hoy: string
  /**
   * `items` trae solo los más urgentes de la categoría (AVISOS_POR_CATEGORIA);
   * `total` es cuántos hay en realidad.
   */
  categorias: { categoria: CategoriaAviso; etiqueta: string; total: number; items: AvisoItem[] }[]
  total: number
}
