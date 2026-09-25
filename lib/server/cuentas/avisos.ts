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

export function derivarAvisos(proyectos: ProyectoDetalle[], hoy: string): AvisosRespuesta {
  const limiteEmitir = sumarDias(hoy, DIAS_POR_EMITIR)
  const items: AvisoItem[] = []

  for (const p of proyectos) {
    const base = { proyecto_id: p.id, proyecto_nombre: p.nombre, anio: p.anio, mes: p.mes }
    const evento = p.fecha_entrega ? `Evento ${fechaCorta(p.fecha_entrega)}` : 'Sin fecha de evento'
    for (const c of p.conceptos) {
      const item = (categoria: CategoriaAviso, detalle: string, monto: number, fecha: string | null) =>
        items.push({ categoria, key: c.key, ...base, contraparte: c.contraparte, monto, detalle, fecha })

      if (c.tipo === 'cobro') {
        const v = c.vencimiento
        if (v?.vencido) item('vencidos', v.texto, c.saldo, v.fecha)
        else if (v && v.dias <= DIAS_POR_VENCER) item('por_vencer', v.texto, c.saldo, v.fecha)

        if (c.complementos.some((cp) => cp.requiere && cp.estado !== 'completo')) item('complementos', evento, c.total, p.fecha_entrega)

        if (c.paso === 'emitir_factura' && p.fecha_entrega && p.fecha_entrega <= limiteEmitir) item('por_emitir', evento, c.total, p.fecha_entrega)
      } else if (c.paso === 'subir_factura') {
        item('facturas_proveedor', c.concepto, c.saldo > 0 ? c.saldo : c.total, p.fecha_entrega)
      }
    }
  }

  const categorias = ORDEN.map((categoria) => ({
    categoria,
    etiqueta: ETIQUETAS[categoria],
    items: items
      .filter((i) => i.categoria === categoria)
      .sort((a, b) => comparar(a.fecha ?? '9999', b.fecha ?? '9999') || comparar(a.key, b.key)),
  })).filter((c) => c.items.length > 0)

  return { hoy, categorias, total: categorias.reduce((s, c) => s + c.items.length, 0) }
}
