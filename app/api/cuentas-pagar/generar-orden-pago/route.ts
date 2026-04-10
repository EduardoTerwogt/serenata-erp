import { requireSection } from '@/lib/api-auth'
import { createOrdenPago, getCuentasPagarPendientesEventosRealizados, updateCuentaPagar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentasPendientes = await getCuentasPagarPendientesEventosRealizados()
    const preview = buildOrdenPagoPreview(cuentasPendientes as any)
    return Response.json(preview)
  } catch (error) {
    console.error('[cuentas-pagar/generar-orden-pago][GET]', error)
    return Response.json({ error: 'Error obteniendo preview de orden de pago' }, { status: 500 })
  }
}

export async function POST() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentasPendientes = await getCuentasPagarPendientesEventosRealizados()
    if (cuentasPendientes.length === 0) {
      return Response.json(
        { error: 'No hay cuentas por pagar pendientes con eventos ya realizados' },
        { status: 400 }
      )
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const preview = buildOrdenPagoPreview(cuentasPendientes as any)
    const pdfArrayBuffer = generateOrdenPagoPdf(preview)

    const fechaFormato = new Date().toISOString().split('T')[0].replace(/-/g, '_')
    const fileName = `Orden_Pago_${fechaFormato}.pdf`
    const pdfFile = new File([pdfArrayBuffer], fileName, { type: 'application/pdf' })
    const folderPath = '/Ordenes de Pago'
    const pdfUrl = await uploadFileToDrive(pdfFile, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

    const ordenPago = await createOrdenPago({
      fecha_generacion: new Date().toISOString().split('T')[0],
      pdf_url: pdfUrl,
      pdf_nombre: fileName,
      estado: 'GENERADA',
      total_monto: preview.resumen.total_general,
      created_by: authResult.session?.user?.email || 'sistema',
    })

    for (const id of preview.cuentas_ids) {
      await updateCuentaPagar(id, {
        estado: 'EN_PROCESO_PAGO',
        orden_pago_id: ordenPago.id,
      })
    }

    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      orden_pago: {
        id: ordenPago.id,
        fecha_generacion: ordenPago.fecha_generacion,
        pdf_url: ordenPago.pdf_url,
        pdf_nombre: ordenPago.pdf_nombre,
        total_monto: ordenPago.total_monto,
        cantidad_cuentas: preview.cuentas_ids.length,
      },
      resumen: preview.resumen,
      preview: preview.responsables,
    })
  } catch (error) {
    console.error('[cuentas-pagar/generar-orden-pago]', error)
    return Response.json({ error: 'Error generando orden de pago' }, { status: 500 })
  }
}
