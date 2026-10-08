/**
 * #123 (B5, P12, P29): lo que el Portal de proveedores ve de los pagos, solo lectura. Sale del mismo `estado_cuenta`
 * del lado proveedor que usa Cuentas (una sola consulta, P15) y por construcción es del proveedor de la sesión: un pago
 * a proveedor cubre grupos de UN solo proveedor (`contrapartes_distintas`), así que "este pago cubrió estas facturas"
 * nunca expone nada ajeno (invariante 5). Puro: sin base ni servidor.
 */
import type { EstadoCuentaRespuesta } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import type { ComplementoPortal, CubrePortal, PagoPortal } from '@/lib/shared/cuentas/portal-tipos'

const sinExtension = (nombre: string | null) => (nombre ? nombre.replace(/\.xml$/i, '') : null)

/** Pagos vigentes por grupo, de la fecha más reciente a la más antigua. Los pagos anulados no se muestran. */
export function pagosPorGrupo(estado: EstadoCuentaRespuesta): Map<string, PagoPortal[]> {
  const factura = new Map<string, EstadoCuentaRespuesta['facturas'][number]>()
  const proyecto = new Map<string, string | null>()
  for (const f of estado.facturas) {
    for (const c of f.conceptos) {
      factura.set(c.id, f)
      proyecto.set(c.id, c.proyecto_id)
    }
  }

  const porGrupo = new Map<string, PagoPortal[]>()
  for (const p of estado.pagos) {
    if (p.anulado) continue
    const cubre: CubrePortal[] = p.aplicaciones.map((a) => ({
      grupo_id: a.destino_id,
      proyecto_id: proyecto.get(a.destino_id) ?? null,
      factura: sinExtension(factura.get(a.destino_id)?.archivo_nombre ?? null),
      monto: a.monto,
    }))
    for (const a of p.aplicaciones) {
      const f = factura.get(a.destino_id)
      const complemento: ComplementoPortal =
        f?.metodo_pago !== 'PPD' ? 'no_aplica' : p.complementos.some((c) => c.factura_id === f.id && c.tipo === 'COMPLEMENTO_PAGO') ? 'recibido' : 'pendiente'
      const lista = porGrupo.get(a.destino_id) ?? []
      lista.push({ pago_id: p.id, fecha_pago: p.fecha_pago, tipo_pago: p.tipo_pago, monto: a.monto, cubre, complemento })
      porGrupo.set(a.destino_id, lista)
    }
  }
  for (const lista of Array.from(porGrupo.values())) lista.sort((x, y) => y.fecha_pago.localeCompare(x.fecha_pago))
  return porGrupo
}
