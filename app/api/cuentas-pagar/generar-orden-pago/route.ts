export const maxDuration = 60

import { randomUUID } from 'crypto'
import { requireSection } from '@/lib/api-auth'
import { generarOrdenPago, getCuentasPagarGruposFacturadosEventosRealizados } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { withIdempotency } from '@/lib/server/idempotency'
import { buildOrdenPagoPreview } from '@/lib/server/ordenes-pago/build'
import { nombreArchivoOrden } from '@/lib/server/ordenes-pago/nombre'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'
import { buildErrorResponse, DomainError } from '@/lib/server/errors/domain-error'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { GenerarOrdenPagoSchema, validate } from '@/lib/validation/schemas'

const ROUTE_GET = 'GET /api/cuentas-pagar/generar-orden-pago'
const ROUTE_POST = 'POST /api/cuentas-pagar/generar-orden-pago'
const IDEMPOTENCY_SCOPE = 'cuentas-pagar:generar-orden-pago'

function buildOrdenPagoFileName(preview: ReturnType<typeof buildOrdenPagoPreview>) {
  return nombreArchivoOrden(preview.responsables.flatMap((responsable) => responsable.eventos.map((evento) => evento.cotizacion_folio)))
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

// Cuerpo opcional: la UI actual hace POST sin cuerpo.
async function readPostBody(request: Request): Promise<{ ok: true; key?: string } | { ok: false; error: string }> {
  const text = await request.text()
  if (!text.trim()) return { ok: true }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Cuerpo inválido: se esperaba JSON' }
  }
  const validation = validate(GenerarOrdenPagoSchema, json)
  if (!validation.ok) return { ok: false, error: validation.error }
  return { ok: true, key: validation.data.idempotency_key }
}

export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const body = await readPostBody(request)
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 })
  // Sin llave del cliente (UI actual) cada petición lleva la suya: no hay
  // deduplicación entre clics, pero la RPC ya impide meter los mismos
  // candidatos en dos órdenes.
  const idempotencyKey = body.key ?? randomUUID()

  try {
    const { status, body: responseBody } = await withIdempotency(IDEMPOTENCY_SCOPE, idempotencyKey, async () => {
      const cuentasPendientes = await getCuentasPagarGruposFacturadosEventosRealizados()
      const preview = buildOrdenPagoPreview(cuentasPendientes)
      if (preview.candidatos.length === 0) {
        return {
          status: 400,
          body: { error: 'No hay grupos de cuentas por pagar facturados con eventos ya realizados' },
        }
      }

      const googleEnv = getGoogleEnv()
      if (!googleEnv) {
        return { status: 500, body: { error: 'Google Drive no configurado' } }
      }

      // El PDF se arma y se sube antes con los mismos montos que la RPC va a
      // revalidar bajo candado (S2). Si la RPC falla, el archivo queda
      // huérfano en Drive: se registra en el log y el error se propaga.
      const pdfArrayBuffer = generateOrdenPagoPdf(preview)
      const fileName = buildOrdenPagoFileName(preview)
      const pdfFile = new File([pdfArrayBuffer], fileName, { type: 'application/pdf' })
      const folderPath = '/Ordenes de Pago'
      const pdfUrl = await uploadFileToDrive(pdfFile, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

      let orden
      try {
        orden = await generarOrdenPago({
          candidatos: preview.candidatos,
          pdfUrl,
          pdfNombre: fileName,
          usuario: authResult.session?.user?.email || 'sistema',
        })
      } catch (error) {
        logStructured({
          requestId: newRequestId(),
          route: ROUTE_POST,
          level: 'warn',
          message: 'orden_pago_pdf_huerfano',
          detail: `La RPC generar_orden_pago falló después de subir ${fileName} (${pdfUrl}).`,
        })
        throw error
      }

      return {
        status: 200,
        body: {
          success: true,
          orden_pago: {
            id: orden.orden_pago_id,
            fecha_generacion: hoyCdmx(),
            pdf_url: pdfUrl,
            pdf_nombre: fileName,
            total_monto: orden.total_monto,
            cantidad_cuentas: preview.cuentas_ids.length,
          },
          resumen: preview.resumen,
          preview: preview.responsables,
        },
      }
    })
    return Response.json(responseBody, { status })
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

    // withIdempotency: otra petición con la misma llave sigue en curso. Es
    // espera, no error (S9): la UI vuelve a consultar el preview.
    if (rawMessage.includes('ya se está procesando')) {
      return buildErrorResponse(
        new DomainError({
          code: 'orden_en_proceso',
          status: 409,
          safeMessage: 'La orden de pago ya se está generando. Espera unos segundos y revisa el historial.',
          cause: error,
        }),
        ROUTE_POST
      )
    }

    return buildErrorResponse(error, ROUTE_POST)
  }
}
