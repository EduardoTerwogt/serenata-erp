/**
 * Rediseño de Cuentas (docs/PLAN.md, B3/B6, supuestos 2 y 3, D25, D27):
 * avisos derivados de los conceptos, sobre todos los años.
 *
 * - Cobros vencidos: cobro con saldo y vencimiento pasado.
 * - Cobros por vencer: cobro con saldo que vence en 10 días o menos.
 * - Facturas de proveedor faltantes: pago cuyo siguiente paso es subir la factura.
 * - Complementos faltantes: cobro PPD con algún pago que pide complemento y no
 *   lo tiene completo (en revisión, o le falta el XML o el PDF), aunque la
 *   cuenta siga en Parcial.
 * - Facturas por emitir: cobro sin factura cuyo evento ya pasó o es en los
 *   próximos 30 días.
 */
import { textoVencimiento } from '@/lib/shared/cuentas/concepto'
import type { AvisoItem, AvisosRespuesta, CategoriaAviso, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'

const DIAS_POR_VENCER = 10
const DIAS_POR_EMITIR = 30

const ETIQUETAS: Record<CategoriaAviso, string> = {
  vencidos: 'Cobros vencidos',
  por_vencer: 'Cobros por vencer',
  facturas_proveedor: 'Facturas de proveedor faltantes',
  complementos: 'Complementos de pago faltantes',
  por_emitir: 'Facturas por emitir',
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const ORDEN: CategoriaAviso[] = ['vencidos', 'por_vencer', 'facturas_proveedor', 'complementos', 'por_emitir']

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/**
 * Un concepto que entra a una categoría, con lo necesario para su texto. Lo
 * producen derivarAvisos (TS) y cuentas_avisos_items (SQL, O1b) con el mismo
 * criterio; el texto, el orden y el agrupado viven solo aquí.
 */
export interface CandidatoAviso {
  categoria: CategoriaAviso
  key: string
  proyecto_id: string
  proyecto_nombre: string
  anio: number | null
  mes: number | null
  fecha_entrega: string | null
  contraparte: string
  concepto: string
  monto: number
  /** Solo vencidos y por vencer. */
  venc_dias: number | null
  fecha_vencimiento: string | null
}

function aItem(c: CandidatoAviso): AvisoItem {
  const evento = c.fecha_entrega ? `Evento ${fechaCorta(c.fecha_entrega)}` : 'Sin fecha de evento'
  const [detalle, fecha] =
    c.categoria === 'vencidos' || c.categoria === 'por_vencer'
      ? [textoVencimiento(c.venc_dias ?? 0), c.fecha_vencimiento]
      : c.categoria === 'facturas_proveedor'
        ? [c.concepto, c.fecha_entrega]
        : [evento, c.fecha_entrega]
  return {
    categoria: c.categoria,
    key: c.key,
    proyecto_id: c.proyecto_id,
    proyecto_nombre: c.proyecto_nombre,
    anio: c.anio,
    mes: c.mes,
    contraparte: c.contraparte,
    monto: c.monto,
    detalle,
    fecha,
  }
}

/** Avisos que viajan por categoría: los más urgentes; el resto solo se cuenta. */
export const AVISOS_POR_CATEGORIA = 50

/**
 * Ordena por fecha y key, deja los primeros AVISOS_POR_CATEGORIA de cada
 * categoría y les pone texto. `totales` = cuántos hay por categoría cuando
 * los candidatos ya llegan recortados (cuentas_avisos_items); si no, se
 * cuentan aquí.
 */
export function agruparAvisos(
  candidatos: CandidatoAviso[],
  hoy: string,
  totales?: Partial<Record<CategoriaAviso, number>>
): AvisosRespuesta {
  const items = candidatos.map(aItem)
  const categorias = ORDEN.map((categoria) => {
    const todos = items
      .filter((i) => i.categoria === categoria)
      .sort((a, b) => comparar(a.fecha ?? '9999', b.fecha ?? '9999') || comparar(a.key, b.key))
    return {
      categoria,
      etiqueta: ETIQUETAS[categoria],
      total: totales ? (totales[categoria] ?? 0) : todos.length,
      items: todos.slice(0, AVISOS_POR_CATEGORIA),
    }
  }).filter((c) => c.total > 0)

  return { hoy, categorias, total: categorias.reduce((s, c) => s + c.total, 0) }
}

export function derivarAvisos(proyectos: ProyectoDetalle[], hoy: string): AvisosRespuesta {
  const limiteEmitir = sumarDias(hoy, DIAS_POR_EMITIR)
  const candidatos: CandidatoAviso[] = []

  for (const p of proyectos) {
    const base = { proyecto_id: p.id, proyecto_nombre: p.nombre, anio: p.anio, mes: p.mes, fecha_entrega: p.fecha_entrega }
    for (const c of p.conceptos) {
      const agregar = (categoria: CategoriaAviso, monto: number) =>
        candidatos.push({
          categoria,
          key: c.key,
          ...base,
          contraparte: c.contraparte,
          concepto: c.concepto,
          monto,
          venc_dias: c.vencimiento?.dias ?? null,
          fecha_vencimiento: c.vencimiento?.fecha ?? null,
        })

      if (c.tipo === 'cobro') {
        const v = c.vencimiento
        if (v?.vencido) agregar('vencidos', c.saldo)
        else if (v && v.dias <= DIAS_POR_VENCER) agregar('por_vencer', c.saldo)

        if (c.complementos.some((cp) => cp.requiere && cp.estado !== 'completo')) agregar('complementos', c.total)

        if (c.paso === 'emitir_factura' && p.fecha_entrega && p.fecha_entrega <= limiteEmitir) agregar('por_emitir', c.total)
      } else if (c.paso === 'subir_factura') {
        agregar('facturas_proveedor', c.saldo > 0 ? c.saldo : c.total)
      }
    }
  }

  return agruparAvisos(candidatos, hoy)
}
