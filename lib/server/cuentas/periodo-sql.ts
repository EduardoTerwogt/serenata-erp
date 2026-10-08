/**
 * Rediseño de Cuentas O1b (docs/PLAN.md): la lectura por periodo se deriva en
 * SQL (`cuentas_periodo`, db/migrations/20261003_cuentas_o1b_derivacion_sql.sql)
 * y llega con estados y pasos como códigos. Este módulo, puro, les pone
 * etiqueta, tono y texto con las MISMAS tablas de concepto.ts, así que la UI
 * recibe exactamente el contrato de `PeriodoRespuesta`.
 *
 * SQL es la única fuente de las reglas (B6). El doble TS de tests/support/cuentas-motor
 * lo compara el e2e live `cuentas-paridad-sql.spec.ts` sobre la BD de test.
 */
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PASO,
  TONO_ESTADO,
  textoVencimiento,
  type ComplementoPagoDerivado,
  type ConceptoDerivado,
  type EstadoConcepto,
  type PasoConcepto,
} from '@/lib/shared/cuentas/concepto'
import type { CompartidoConcepto, ConceptoLista, ConceptoVista, PeriodoRespuesta, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import type { RegimenFiscal } from '@/lib/types'

/** Concepto de la lista tal como lo devuelve `cuentas_periodo`. */
export interface ConceptoSql {
  key: string
  tipo: 'cobro' | 'pago'
  objetivo: 'cobro' | 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  cotizacion_id: string | null
  folio: string | null
  contraparte: string
  contraparte_id: string | null
  concepto: string
  items: number
  total: number
  neto: number
  pagado: number
  total_estimado: boolean
  regimen_fiscal: RegimenFiscal | null
  orden_pago_id: string | null
  fecha_vencimiento: string | null
  estado: EstadoConcepto
  paso: PasoConcepto | null
  paso_urgente: boolean
  saldo: number
  /** Días al vencimiento (negativo = atraso); null = sin vencimiento o sin saldo. */
  venc_dias: number | null
  resuelto: boolean
  fecha_resuelto: string | null
  metodo_desconocido: boolean
  complementos: ComplementoPagoDerivado[]
  compartido?: CompartidoConcepto | null
  proyecto: ConceptoLista['proyecto']
}

/** Proyecto abierto en el panel tal como lo devuelve `cuentas_periodo` (B6): sus conceptos no llevan `proyecto`. */
export type ProyectoSql = Omit<ProyectoDetalle, 'conceptos'> & { conceptos: Omit<ConceptoSql, 'proyecto'>[] }

export type PeriodoSql = Omit<PeriodoRespuesta, 'lista' | 'seleccionado'> & {
  lista: Omit<PeriodoRespuesta['lista'], 'items'> & { items: ConceptoSql[] }
  seleccionado: ProyectoSql | null
}

export function conceptoVistaDesdeSql(c: Omit<ConceptoSql, 'proyecto'>): ConceptoVista {
  const { venc_dias, ...resto } = c
  return {
    ...resto,
    etiqueta: ETIQUETA_ESTADO[c.estado],
    tono: TONO_ESTADO[c.estado],
    paso_etiqueta: c.paso ? ETIQUETA_PASO[c.paso] : null,
    vencimiento:
      venc_dias === null || c.fecha_vencimiento === null
        ? null
        : { fecha: c.fecha_vencimiento, dias: venc_dias, vencido: venc_dias < 0, texto: textoVencimiento(venc_dias) },
  }
}

/** Fila de `cuentas_conceptos` (un concepto concreto, B6): el concepto más el cruce fiscal del neto. */
export type FilaConceptoSql = Omit<ConceptoSql, 'proyecto'> & {
  cierre_iva: number | null
  cierre_iva_retenido: number | null
  cierre_isr_retenido: number | null
}

/** Estado, paso, saldo, vencimiento y complementos del detalle: lo mismo que la lista, de la misma fila. */
export function conceptoDerivadoDesdeSql(fila: FilaConceptoSql): ConceptoDerivado {
  const v = conceptoVistaDesdeSql(fila)
  return {
    estado: v.estado,
    etiqueta: v.etiqueta,
    tono: v.tono,
    paso: v.paso,
    paso_etiqueta: v.paso_etiqueta,
    paso_urgente: v.paso_urgente,
    saldo: v.saldo,
    vencimiento: v.vencimiento,
    resuelto: v.resuelto,
    fecha_resuelto: v.fecha_resuelto,
    metodo_desconocido: v.metodo_desconocido,
    complementos: v.complementos,
  }
}

export function conceptoDesdeSql(c: ConceptoSql): ConceptoLista {
  const { proyecto, ...resto } = c
  return { ...conceptoVistaDesdeSql(resto), proyecto }
}

/** Respuesta de `cuentas_periodo` → contrato de la ruta, con el proyecto seleccionado ya derivado en SQL. */
export function decodificarPeriodoSql(data: unknown): PeriodoRespuesta {
  const periodo = data as PeriodoSql
  return {
    ...periodo,
    lista: { ...periodo.lista, items: periodo.lista.items.map(conceptoDesdeSql) },
    seleccionado: periodo.seleccionado
      ? { ...periodo.seleccionado, conceptos: periodo.seleccionado.conceptos.map(conceptoVistaDesdeSql) }
      : null,
  }
}
