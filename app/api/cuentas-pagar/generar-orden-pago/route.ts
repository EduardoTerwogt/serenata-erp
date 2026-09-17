export const maxDuration = 60

import { requireSection } from '@/lib/api-auth'
import { createOrdenPago, getCuentasPagarGruposFacturadosEventosRealizados, updateCuentasPagarGruposEnOrden } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'
import { buildErrorResponse, DomainError } from '@/lib/server/errors/domain-error'

const ROUTE_GET = 'GET /api/cuentas-pagar/generar-orden-pago'
const ROUTE_POST = 'POST /api/cuentas-pagar/generar-orden-pago'

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

// Solo para decidir el status/safeMessage correcto (isDriveAuthError) --
// nunca se manda al cliente. buildErrorResponse ya se encarga del logging
// estructurado y del safeMessage genérico para todo lo demás.
function extractRawMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'object' && cause !== null) return JSON.stringify(cause)
  return String(cause)
}

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentasPendientes = await getCuentasPagarGruposFacturadosEventosRealizados()
    const preview = buildOrdenPagoPreview(cuentasPendientes)
    return Response.json(preview)
  } catch (error) {
    return buildErrorResponse(error, ROUTE_GET)
  }
}

export async function POST() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentasPendientes = await getCuentasPagarGruposFacturadosEventosRealizados()
    if (cuentasPendientes.length === 0) {
      return Response.json(
        { error: 'No hay grupos de cuentas por pagar facturados con eventos ya realizados' },
        { status: 400 }
      )
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const preview = buildOrdenPagoPreview(cuentasPendientes)
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

    // preview.cuentas_ids son ids de cuentas_pagar (nivel item, para el PDF
    // detallado) -- la transición de estado ahora ocurre a nivel grupo, así
    // que se derivan los grupo_id distintos de las cuentas que entraron al
    // preview.
    const grupoIds = Array.from(new Set(cuentasPendientes.map((cuenta) => cuenta.grupo_id).filter((v): v is string => Boolean(v))))
    await updateCuentasPagarGruposEnOrden(grupoIds, ordenPago.id)


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
    const rawMessage = extractRawMessage(error)

    if (isDriveAuthError(rawMessage)) {
      return buildErrorResponse(
        new DomainError({
          code: 'drive_desautorizado',
          status: 503,
          safeMessage: 'Google Drive desautorizado. Reautoriza Drive y actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel.',
          cause: error,
        }),
        ROUTE_POST
      )
    }

    return buildErrorResponse(error, ROUTE_POST)
  }
}
