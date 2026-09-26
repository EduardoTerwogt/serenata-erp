/**
 * Rediseño de Cuentas O1b (docs/PLAN.md): la lectura por periodo se deriva en
 * SQL (`cuentas_periodo`, db/migrations/20261003_cuentas_o1b_derivacion_sql.sql)
 * y llega con estados y pasos como códigos. Este módulo, puro, les pone
 * etiqueta, tono y texto con las MISMAS tablas de concepto.ts, así que la UI
 * recibe exactamente el contrato de `PeriodoRespuesta`.
 *
 * `construirPeriodo` (periodo.ts) sigue siendo la referencia: el e2e live
 * `cuentas-paridad-sql.spec.ts` compara ambas sobre la BD de test.
 */
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PASO,
  TONO_ESTADO,
  textoVencimiento,
  type ComplementoPagoDerivado,
  type EstadoConcepto,
  type PasoConcepto,
} from '@/lib/shared/cuentas/concepto'
import type { ConceptoLista, PeriodoRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
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
  proyecto: ConceptoLista['proyecto']
}

export type PeriodoSql = Omit<PeriodoRespuesta, 'lista' | 'seleccionado'> & {
  lista: Omit<PeriodoRespuesta['lista'], 'items'> & { items: ConceptoSql[] }
}

export function conceptoDesdeSql(c: ConceptoSql): ConceptoLista {
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

/** Respuesta de `cuentas_periodo` → contrato de la ruta (sin `seleccionado`, que arma la ruta). */
export function decodificarPeriodoSql(data: unknown): Omit<PeriodoRespuesta, 'seleccionado'> {
  const periodo = data as PeriodoSql
  return { ...periodo, lista: { ...periodo.lista, items: periodo.lista.items.map(conceptoDesdeSql) } }
}
