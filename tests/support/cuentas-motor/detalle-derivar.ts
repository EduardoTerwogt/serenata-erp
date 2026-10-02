/**
 * Doble de pruebas (B6): lo que `cuentas_conceptos` (SQL) deriva para un concepto, calculado en
 * TypeScript a partir de las mismas filas que arma el detalle. Alimenta los mocks e2e y los tests
 * de `detalle-armar`; producción lee esto de SQL (`lib/server/cuentas/detalle.ts`).
 */
import { separar, type CobroFilas, type DerivadoCobro, type DerivadoPago, type DocumentoFila, type PagoFilas } from '@/lib/server/cuentas/detalle-armar'
import type { MetodoPagoCfdi } from '@/lib/shared/cuentas/concepto'
import { round2 } from '@/lib/shared/decimal'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import { derivarCobro, derivarPago, type DocumentoXmlInput } from './concepto'

const xmlInput = (docs: DocumentoFila[], tipo: string, pagoId?: string): DocumentoXmlInput[] =>
  docs
    .filter((d) => d.tipo === tipo && (pagoId === undefined || d.pago_id === pagoId))
    .map((d) => ({
      estado_validacion: (d.estado_validacion ?? 'pendiente') as DocumentoXmlInput['estado_validacion'],
      fecha_carga: d.fecha_carga,
      metodo_pago: (d.metodo_pago_cfdi as MetodoPagoCfdi | null) ?? null,
    }))

export function derivarDetalleCobro({ cuenta, documentos: todos, pagos: todosPagos }: CobroFilas, hoy: string): DerivadoCobro {
  const { docs: documentos, pagos } = separar(todos, todosPagos, (p) => ({ fecha: p.fecha_pago, monto: round2(Number(p.monto)) }), false)
  const orden = [...pagos].sort((a, b) => (a.fecha_pago + (a.created_at ?? '')).localeCompare(b.fecha_pago + (b.created_at ?? '')))
  return {
    concepto: derivarCobro(
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
    ),
  }
}

export function derivarDetallePago({ destino, proveedor, documentos: todos, pagos: todosPagos }: PagoFilas): DerivadoPago {
  const { docs: documentos, pagos } = separar(todos, todosPagos, (p) => ({ fecha: p.fecha_pago, monto: round2(Number(p.monto_transferido)) }), false)
  const neto = round2(Number(destino.neto))
  const estimado = calcularEjemploFactura(neto, proveedor?.regimen_fiscal ?? null)
  const total = destino.total_a_transferir == null ? estimado.total : round2(Number(destino.total_a_transferir))
  const pagado = round2(Number(destino.monto_transferido ?? 0))
  const pagosOrdenados = [...pagos].sort((a, b) => (a.fecha_pago + (a.created_at ?? '')).localeCompare(b.fecha_pago + (b.created_at ?? '')))
  const comprobantesDocs = documentos.filter((d) => d.tipo === 'COMPROBANTE_PAGO')
  return {
    concepto: derivarPago({
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
    }),
    total,
    total_estimado: destino.total_a_transferir == null,
    pagado,
    cruce: { neto: estimado.subtotal, iva: estimado.iva_trasladado, iva_retenido: estimado.iva_retenido, isr_retenido: estimado.isr_retenido },
  }
}
