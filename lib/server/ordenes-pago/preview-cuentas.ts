/**
 * Rediseño de Cuentas B6 (docs/PLAN.md §7 B6, §5.2, D20, supuestos 6, 13 y
 * 14): arma "Nueva orden" a partir de cuentas_orden_candidatos(). Puro, sin
 * acceso a datos: lo usan la ruta de preview, la de generar y los mocks e2e.
 *
 * - Cruce fiscal por grupo (una factura por proyecto, decisión 011) y luego
 *   sumado por responsable; nunca retenciones sobre la suma.
 * - Total a transferir: saldo del snapshot del CFDI (total − transferido) si
 *   existe; si no, el estimado por régimen (`calcularEjemploFactura`).
 * - El monto que se revalida (`monto_esperado`) es el saldo neto, igual que
 *   en generar_orden_pago (S2).
 */
import type { OrdenPagoPreviewResult } from '@/lib/server/ordenes-pago/preview-tipos'
import { round2 } from '@/lib/shared/decimal'
import { cruceSaldo, sumarCruces, totalesOrden } from '@/lib/shared/cuentas/orden-cruce'
import type { MotivoNoIncluida, NoIncluida, PreviewOrden, ProyectoOrden, ResponsableOrden, SeleccionOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import type { RegimenFiscal } from '@/lib/types'

export interface CandidatoCrudo {
  tipo: 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  proyecto_nombre: string | null
  folios: string[] | null
  fecha_evento: string | null
  responsable: {
    id: string | null
    nombre: string
    regimen_fiscal: RegimenFiscal | null
    banco: string | null
    clabe: string | null
    correo: string | null
    telefono: string | null
  }
  saldo: number
  total_a_transferir: number | null
  monto_transferido: number | null
  items: { cuenta_id: string; descripcion: string | null; cantidad: number | null; cotizacion_id: string | null; saldo: number }[] | null
}

export interface NoIncluidaCruda {
  tipo: 'grupo' | 'cuenta'
  id: string
  proyecto_id: string | null
  proyecto_nombre: string | null
  responsable_nombre: string | null
  regimen_fiscal: RegimenFiscal | null
  saldo: number
  total_a_transferir: number | null
  monto_transferido: number | null
  motivo: MotivoNoIncluida
  fecha_evento: string | null
}

export interface CandidatosCrudos {
  hoy: string
  elegibles: CandidatoCrudo[]
  no_incluidas: NoIncluidaCruda[]
  no_incluidas_total: number
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (iso: string) => `${iso.slice(8, 10)} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

export function textoMotivo(motivo: MotivoNoIncluida, fechaEvento: string | null): string {
  switch (motivo) {
    case 'sin_proveedor':
      return 'Falta asignar proveedor'
    case 'sin_factura':
      return 'Falta factura del proveedor'
    case 'factura_revision':
      return 'Factura en revisión'
    case 'evento_pendiente':
      // Supuesto 13: la fecha más tardía de las cotizaciones del grupo.
      return fechaEvento ? `Evento el ${fechaCorta(fechaEvento)}` : 'Evento sin fecha'
  }
}

/** Renglones con saldo; el residuo de redondeo va al último para que sumen el saldo del grupo. */
function renglones(c: CandidatoCrudo): ProyectoOrden['items'] {
  const items = (c.items ?? []).map((it) => ({
    cuenta_id: it.cuenta_id,
    descripcion: it.descripcion || 'Concepto',
    cantidad: Number(it.cantidad ?? 1),
    cotizacion_id: it.cotizacion_id,
    saldo: round2(Number(it.saldo)),
  }))
  if (items.length) {
    const residuo = round2(Number(c.saldo) - items.reduce((s, it) => s + it.saldo, 0))
    if (residuo !== 0) items[items.length - 1].saldo = round2(items[items.length - 1].saldo + residuo)
  }
  return items
}

export function armarPreviewOrden(crudo: CandidatosCrudos): PreviewOrden {
  const porResponsable = new Map<string, ResponsableOrden>()
  for (const c of crudo.elegibles) {
    // La RPC solo marca elegible lo que tiene proveedor asignado (T2).
    const clave = c.responsable.id ?? `sin:${c.id}`
    let r = porResponsable.get(clave)
    if (!r) {
      r = {
        clave,
        nombre: c.responsable.nombre,
        regimen_fiscal: c.responsable.regimen_fiscal,
        banco: c.responsable.banco,
        clabe: c.responsable.clabe,
        correo: c.responsable.correo,
        telefono: c.responsable.telefono,
        proyectos: [],
        cruce: sumarCruces([]),
      }
      porResponsable.set(clave, r)
    }
    const saldo = round2(Number(c.saldo))
    r.proyectos.push({
      tipo: c.tipo,
      id: c.id,
      proyecto_id: c.proyecto_id,
      proyecto_nombre: c.proyecto_nombre ?? 'Sin proyecto',
      folios: c.folios ?? [],
      fecha_evento: c.fecha_evento,
      items: renglones(c),
      cruce: cruceSaldo(saldo, c.responsable.regimen_fiscal, c.total_a_transferir, c.monto_transferido),
      monto_esperado: saldo,
    })
  }
  const responsables = Array.from(porResponsable.values()).map((r) => ({ ...r, cruce: sumarCruces(r.proyectos.map((p) => p.cruce)) }))

  const no_incluidas: NoIncluida[] = crudo.no_incluidas.map((n) => ({
    tipo: n.tipo,
    id: n.id,
    proyecto_id: n.proyecto_id,
    proyecto_nombre: n.proyecto_nombre,
    responsable_nombre: n.responsable_nombre,
    monto: cruceSaldo(round2(Number(n.saldo)), n.regimen_fiscal, n.total_a_transferir, n.monto_transferido).total,
    motivo: n.motivo,
    motivo_texto: textoMotivo(n.motivo, n.fecha_evento),
  }))

  return { hoy: crudo.hoy, responsables, no_incluidas, no_incluidas_total: Number(crudo.no_incluidas_total) }
}

/** Todos los candidatos elegibles del preview, en la forma que recibe generar_orden_pago. */
export function seleccionCompleta(preview: PreviewOrden): SeleccionOrden[] {
  return preview.responsables.flatMap((r) => r.proyectos.map((p) => ({ tipo: p.tipo, id: p.id, monto_esperado: p.monto_esperado })))
}

/**
 * Filtra el preview recalculado en el servidor a lo que el usuario eligió.
 * Si algo de la selección ya no es elegible o cambió su saldo, no se
 * adivina: `cambiaron` pide recargar el preview (S2).
 */
export function aplicarSeleccion(preview: PreviewOrden, seleccion: SeleccionOrden[]): { preview: PreviewOrden; cambiaron: boolean } {
  const vigentes = new Map(seleccionCompleta(preview).map((c) => [`${c.tipo}:${c.id}`, c.monto_esperado]))
  const pedidos = new Set<string>()
  let cambiaron = false
  for (const s of seleccion) {
    const k = `${s.tipo}:${s.id}`
    pedidos.add(k)
    const vigente = vigentes.get(k)
    if (vigente === undefined || Math.abs(vigente - round2(s.monto_esperado)) > 0.005) cambiaron = true
  }
  const responsables = preview.responsables
    .map((r) => {
      const proyectos = r.proyectos.filter((p) => pedidos.has(`${p.tipo}:${p.id}`))
      return { ...r, proyectos, cruce: sumarCruces(proyectos.map((p) => p.cruce)) }
    })
    .filter((r) => r.proyectos.length > 0)
  return { preview: { ...preview, responsables }, cambiaron }
}

export const totalesPreview = (preview: PreviewOrden) => totalesOrden(preview)

/**
 * Forma que consume el PDF vigente (lib/server/pdf/orden-pago-pdf.ts, decisión
 * 015) con el cruce por responsable y el total general a transferir
 * (supuesto 14). Un "evento" del PDF es un grupo (proyecto + proveedor).
 */
export function aPreviewPdf(preview: PreviewOrden): OrdenPagoPreviewResult {
  const responsables = preview.responsables.map((r) => ({
    responsable: { id: r.clave, nombre: r.nombre, correo: r.correo, telefono: r.telefono, banco: r.banco, clabe: r.clabe },
    eventos: r.proyectos.map((p) => ({
      cotizacion_folio: p.folios.join(', ') || p.proyecto_id || '',
      proyecto: p.proyecto_nombre,
      fecha_entrega: p.fecha_evento,
      items: p.items.map((it) => ({ cuenta_id: it.cuenta_id, descripcion: it.descripcion, cantidad: it.cantidad, monto: it.saldo })),
      subtotal: p.monto_esperado,
    })),
    total_responsable: r.cruce.subtotal,
    cruce: r.cruce,
  }))
  const t = totalesPreview(preview)
  return {
    responsables,
    resumen: {
      responsables: t.responsables,
      eventos: t.cuentas,
      items_totales: responsables.reduce((s, r) => s + r.eventos.reduce((a, e) => a + e.items.length, 0), 0),
      total_general: t.cruce.subtotal,
      total_transferir: t.cruce.total,
    },
    cuentas_ids: preview.responsables.flatMap((r) => r.proyectos.flatMap((p) => p.items.map((it) => it.cuenta_id))),
    candidatos: seleccionCompleta(preview),
  }
}
