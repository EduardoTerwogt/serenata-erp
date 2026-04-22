export const maxDuration = 60

import { requireSection } from '@/lib/api-auth'
import { createOrdenPago, getCuentasPagarPendientesEventosRealizados, updateCuentasPagarEnOrden } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'

function buildOrdenPagoFileName(preview: ReturnType<typeof buildOrdenPagoPreview>) {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = now.toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' })
  const monthFormatted = month.replace('.', '').replace(/^./, (value) => value.toUpperCase())
  const folios = Array.from(
    new Set(
      preview.responsables.flatMap((responsable) =>
        responsable.eventos.map((evento) => evento.cotizacion_folio).filter(Boolean)
      )
    )
  )

  const foliosSegment = folios.join(',')
  return `O.P ${day}-${monthFormatted} ${foliosSegment}.pdf`
}

function isDriveAuthError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('invalid_grant') || normalized.includes('google drive desautorizado')
}

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentasPendientes = await getCuentasPagarPendientesEventosRealizados()
    const preview = buildOrdenPagoPreview(cuentasPendientes as any)
    return Response.json(preview)
  } catch (error) {
    let errorMsg = 'Error desconocido'
    if (error instanceof Error) {
      errorMsg = error.message
    } else if (typeof error === 'object' && error !== null) {
      errorMsg = JSON.stringify(error)
    } else {
      errorMsg = String(error)
    }
    console.error('[cuentas-pagar/generar-orden-pago][GET]', errorMsg, error)
    return Response.json(
      {
        error: 'Error obteniendo preview de orden de pago',
        details: errorMsg,
      },
      { status: 500 }
    )
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

    const fileName = buildOrdenPagoFileName(preview)
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

    await updateCuentasPagarEnOrden(preview.cuentas_ids, ordenPago.id)

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
    let errorMsg = 'Error desconocido'
    if (error instanceof Error) {
      errorMsg = error.message
    } else if (typeof error === 'object' && error !== null) {
      errorMsg = JSON.stringify(error)
    } else {
      errorMsg = String(error)
    }
    console.error('[cuentas-pagar/generar-orden-pago][POST]', errorMsg, error)

    if (isDriveAuthError(errorMsg)) {
      return Response.json(
        {
          error: 'Google Drive desautorizado. Reautoriza Drive y actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel.',
          details: errorMsg,
        },
        { status: 503 }
      )
    }

    return Response.json(
      {
        error: 'Error generando orden de pago',
        details: errorMsg,
      },
      { status: 500 }
    )
  }
}
