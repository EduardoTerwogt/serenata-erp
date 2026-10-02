/** Doble de pruebas (B6): réplica en TypeScript de `cuentas_avisos_items`; solo la usan los mocks e2e y el spec live de paridad. */
import { agruparAvisos, type CandidatoAviso } from '@/lib/server/cuentas/avisos'
import type { AvisosRespuesta, CategoriaAviso, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'

const DIAS_POR_VENCER = 10
const DIAS_POR_EMITIR = 30

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
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
