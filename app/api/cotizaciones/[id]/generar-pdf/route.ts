import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { generateCotizacionPdf, type CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params

    // Fetch cotización data
    const cotizacion = await getCotizacionById(id)
    if (!cotizacion) {
      return new Response('Cotización no encontrada', { status: 404 })
    }

    // Transform cotización data to PDF format
    const pdfData: CotizacionPDFData = {
      id: cotizacion.folio,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      fecha_entrega: cotizacion.fecha_entrega,
      locacion: cotizacion.locacion || null,
      fecha_cotizacion: cotizacion.fecha_cotizacion || null,
      items: cotizacion.items.map((item: any) => ({
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
      })),
      subtotal: cotizacion.subtotal,
      fee_agencia: cotizacion.fee_agencia || 0,
      general: cotizacion.general,
      iva: cotizacion.iva || 0,
      total: cotizacion.total,
      iva_activo: cotizacion.iva_activo || false,
      porcentaje_fee: cotizacion.porcentaje_fee || 0,
      descuento_tipo: (cotizacion.descuento_tipo as 'monto' | 'porcentaje') || 'monto',
      descuento_valor: cotizacion.descuento_valor || 0,
    }

    // Generate PDF
    const pdfBuffer = generateCotizacionPdf(pdfData)

    // Return PDF response
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Cotizacion_${cotizacion.folio}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[cotizaciones/generar-pdf]', error)
    return new Response('Error al generar PDF', { status: 500 })
  }
}
