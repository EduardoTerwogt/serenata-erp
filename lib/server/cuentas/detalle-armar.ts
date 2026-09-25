/**
 * Rediseño de Cuentas B5 (U2): arma el detalle de un concepto a partir de las
 * filas de la BD. Módulo puro (sin acceso a datos): lo usan la carga real
 * (detalle.ts) y los mocks e2e. El estado sale de concepto.ts, igual que en
 * la lista, así que el detalle y la tarjeta nunca dicen cosas distintas.
 */
import { derivarCobro, derivarPago, type DocumentoXmlInput, type MetodoPagoCfdi } from '@/lib/shared/cuentas/concepto'
import type { DetalleCobro, DetallePago, DocumentoDetalle, ProyectoDetalleCorto } from '@/lib/shared/cuentas/detalle-tipos'
import { round2 } from '@/lib/shared/decimal'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import type { RegimenFiscal } from '@/lib/types'

export interface DocumentoFila {
  id: string
  tipo: string
  archivo_url: string | null
  archivo_nombre: string | null
  fecha_carga: string
  estado_validacion?: string | null
  detalle_validacion?: string | null
  metodo_pago_cfdi?: string | null
  pago_id?: string | null
}

const aDoc = (d: DocumentoFila): DocumentoDetalle => ({
  id: d.id,
  tipo: d.tipo,
  archivo_url: d.archivo_url,
  archivo_nombre: d.archivo_nombre,
  fecha_carga: d.fecha_carga,
  estado_validacion: (d.estado_validacion as DocumentoDetalle['estado_validacion']) ?? null,
  detalle_validacion: d.detalle_validacion ?? null,
})

/** Documento vigente de un tipo (T7): el más reciente por fecha_carga. */
function vigente(docs: DocumentoFila[], tipo: string, pagoId?: string): DocumentoFila | null {
  const lista = docs.filter((d) => d.tipo === tipo && (pagoId === undefined || d.pago_id === pagoId))
  return lista.reduce<DocumentoFila | null>((a, b) => (!a || b.fecha_carga > a.fecha_carga ? b : a), null)
}

const xmlInput = (docs: DocumentoFila[], tipo: string, pagoId?: string): DocumentoXmlInput[] =>
  docs
    .filter((d) => d.tipo === tipo && (pagoId === undefined || d.pago_id === pagoId))
    .map((d) => ({
      estado_validacion: (d.estado_validacion ?? 'pendiente') as DocumentoXmlInput['estado_validacion'],
      fecha_carga: d.fecha_carga,
      metodo_pago: (d.metodo_pago_cfdi as MetodoPagoCfdi | null) ?? null,
    }))

export interface CobroFilas {
  cuenta: {
    id: string
    folio: string | null
    cotizacion_id: string | null
    cliente: string | null
    monto_total: number
    monto_pagado: number | null
    fecha_factura: string | null
    fecha_vencimiento: string | null
    notas: string | null
  }
  proyecto: ProyectoDetalleCorto | null
  documentos: DocumentoFila[]
  pagos: { id: string; monto: number; tipo_pago: string; fecha_pago: string; comprobante_url: string | null; notas: string | null; created_at?: string }[]
}

export function armarDetalleCobro({ cuenta, proyecto, documentos, pagos }: CobroFilas, hoy: string): DetalleCobro {
  const facturaXml = vigente(documentos, 'FACTURA_XML')
  const orden = [...pagos].sort((a, b) => (a.fecha_pago + (a.created_at ?? '')).localeCompare(b.fecha_pago + (b.created_at ?? '')))
  const concepto = derivarCobro(
    {
      tipo: 'cobro',
      total: Number(cuenta.monto_total),
      pagado: Number(cuenta.monto_pagado ?? 0),
      fecha_vencimiento: cuenta.fecha_vencimiento,
      fecha_factura: cuenta.fecha_factura,
      facturas_xml: xmlInput(documentos, 'FACTURA_XML'),
      pagos: orden.map((p) => ({
        id: p.id,
        monto: Number(p.monto),
        fecha_pago: p.fecha_pago,
        complemento_xml: xmlInput(documentos, 'COMPLEMENTO_PAGO', p.id),
        complemento_pdf: documentos.filter((d) => d.tipo === 'COMPLEMENTO_PAGO_PDF' && d.pago_id === p.id).map((d) => ({ fecha_carga: d.fecha_carga })),
      })),
    },
    hoy
  )
  const metodo = (facturaXml?.metodo_pago_cfdi as MetodoPagoCfdi | null) ?? null
  const xmlDoc = (d: DocumentoFila | null) => (d ? aDoc(d) : null)

  return {
    tipo: 'cobro',
    id: cuenta.id,
    folio: cuenta.folio,
    cotizacion_id: cuenta.cotizacion_id,
    proyecto,
    cliente: cuenta.cliente ?? 'Cliente',
    total: round2(Number(cuenta.monto_total)),
    pagado: round2(Number(cuenta.monto_pagado ?? 0)),
    fecha_factura: cuenta.fecha_factura,
    fecha_vencimiento: cuenta.fecha_vencimiento,
    notas: cuenta.notas,
    metodo,
    factura_xml: xmlDoc(facturaXml),
    factura_pdf: xmlDoc(vigente(documentos, 'FACTURA_PDF')),
    pagos: orden.map((p) => {
      const derivado = concepto.complementos.find((c) => c.pago_id === p.id)
      return {
        id: p.id,
        fecha: p.fecha_pago,
        tipo: p.tipo_pago,
        monto: round2(Number(p.monto)),
        comprobante_url: p.comprobante_url,
        notas: p.notas,
        complemento: {
          requiere: metodo === 'PPD' ? Boolean(derivado?.requiere) : false,
          estado: metodo === 'PPD' && derivado ? derivado.estado : 'no_aplica',
          xml: xmlDoc(vigente(documentos, 'COMPLEMENTO_PAGO', p.id)),
          pdf: xmlDoc(vigente(documentos, 'COMPLEMENTO_PAGO_PDF', p.id)),
        },
      }
    }),
    concepto,
  }
}

export interface PagoFilas {
  objetivo: 'grupo' | 'cuenta'
  /** Grupo (monto_total neto) o cuenta suelta (x_pagar neto). */
  destino: {
    id: string
    proyecto_id: string | null
    responsable_id: string | null
    estado: string
    neto: number
    total_a_transferir: number | null
    monto_transferido: number | null
    orden_pago_id: string | null
  }
  cuentas: {
    id: string
    item_id: string | null
    cotizacion_id: string | null
    item_descripcion: string | null
    cantidad: number | null
    x_pagar: number
    monto_pagado: number | null
    responsable_nombre: string | null
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }[]
  proveedor: { id: string; nombre: string; regimen_fiscal: RegimenFiscal | null; correo: string | null; telefono: string | null; banco: string | null; clabe: string | null } | null
  proyecto: ProyectoDetalleCorto | null
  documentos: DocumentoFila[]
  pagos: { id: string; fecha_pago: string; tipo_pago: string; monto_transferido: number; comprobante_url: string | null; notas: string | null; estimado: boolean; created_at?: string }[]
  orden: { id: string; pdf_nombre: string | null; pdf_url: string | null; estado: string; fecha_generacion: string } | null
}

export function armarDetallePago({ objetivo, destino, cuentas, proveedor, proyecto, documentos, pagos, orden }: PagoFilas): DetallePago {
  const regimen = proveedor?.regimen_fiscal ?? null
  const neto = round2(Number(destino.neto))
  const estimado = calcularEjemploFactura(neto, regimen)
  const total = destino.total_a_transferir == null ? estimado.total : round2(Number(destino.total_a_transferir))
  const pagado = round2(Number(destino.monto_transferido ?? 0))
  const pagosOrdenados = [...pagos].sort((a, b) => (a.fecha_pago + (a.created_at ?? '')).localeCompare(b.fecha_pago + (b.created_at ?? '')))
  const comprobantesDocs = documentos.filter((d) => d.tipo === 'COMPROBANTE_PAGO')
  const primera = cuentas[0]

  const concepto = derivarPago({
    tipo: 'pago',
    total,
    pagado,
    tiene_proveedor: Boolean(destino.responsable_id),
    orden_pago_id: destino.orden_pago_id,
    facturas_xml: xmlInput(documentos, 'FACTURA_PROVEEDOR_XML'),
    comprobantes: [
      ...comprobantesDocs.map((d) => ({ fecha_carga: d.fecha_carga })),
      ...pagosOrdenados.filter((p) => p.comprobante_url).map((p) => ({ fecha_carga: p.created_at ?? p.fecha_pago })),
    ],
    fechas_pago: pagosOrdenados.map((p) => p.fecha_pago),
  })

  return {
    tipo: 'pago',
    objetivo,
    id: destino.id,
    proyecto,
    cotizacion_id: primera?.cotizacion_id ?? null,
    responsable: {
      id: destino.responsable_id,
      nombre: destino.responsable_id ? (proveedor?.nombre ?? primera?.responsable_nombre ?? 'Proveedor') : 'Sin asignar',
      regimen_fiscal: regimen,
      correo: proveedor?.correo ?? primera?.correo ?? null,
      telefono: proveedor?.telefono ?? primera?.telefono ?? null,
      banco: proveedor?.banco ?? primera?.banco ?? null,
      clabe: proveedor?.clabe ?? primera?.clabe ?? null,
    },
    items: cuentas.map((c) => ({
      cuenta_id: c.id,
      item_id: c.item_id,
      descripcion: c.item_descripcion ?? 'Concepto',
      cantidad: c.cantidad,
      neto: round2(Number(c.x_pagar)),
      pagado: round2(Number(c.monto_pagado ?? 0)),
    })),
    neto,
    total,
    total_estimado: destino.total_a_transferir == null,
    pagado,
    cruce: { neto: estimado.subtotal, iva: estimado.iva_trasladado, iva_retenido: estimado.iva_retenido, isr_retenido: estimado.isr_retenido, total },
    factura_xml: (() => {
      const d = vigente(documentos, 'FACTURA_PROVEEDOR_XML')
      return d ? aDoc(d) : null
    })(),
    factura_pdf: (() => {
      const d = vigente(documentos, 'FACTURA_PROVEEDOR')
      return d ? aDoc(d) : null
    })(),
    comprobantes: comprobantesDocs.map(aDoc),
    pagos: pagosOrdenados.map((p) => ({
      id: p.id,
      fecha: p.fecha_pago,
      tipo: p.tipo_pago,
      monto: round2(Number(p.monto_transferido)),
      comprobante_url: p.comprobante_url,
      notas: p.notas,
      estimado: p.estimado,
    })),
    orden: orden
      ? { id: orden.id, nombre: orden.pdf_nombre ?? 'Orden de pago', pdf_url: orden.pdf_url, estado: orden.estado, fecha: orden.fecha_generacion }
      : null,
    estado_bd: destino.estado,
    concepto,
  }
}
