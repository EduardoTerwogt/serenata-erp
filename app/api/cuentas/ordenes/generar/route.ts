export const maxDuration = 60

import { requireSection } from '@/lib/api-auth'
import { generarOrdenPago } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { computePayloadHash, withIdempotency } from '@/lib/server/idempotency'
import { buildErrorResponse, DomainError } from '@/lib/server/errors/domain-error'
import { nombreArchivoOrden } from '@/lib/server/ordenes-pago/nombre'
import { aplicarSeleccion, aPreviewPdf, armarPreviewOrden, seleccionCompleta, totalesPreview } from '@/lib/server/ordenes-pago/preview-cuentas'
import { cargarCandidatosOrden } from '@/lib/server/ordenes-pago/rpc'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'
import type { OrdenGenerada } from '@/lib/shared/cuentas/ordenes-tipos'
import { GenerarOrdenCuentasSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/ordenes/generar'
const IDEMPOTENCY_SCOPE = 'cuentas:ordenes:generar'

const CAMBIARON = {
  status: 409,
  body: {
    error: 'candidatos_cambiaron',
    message: 'Los saldos cambiaron mientras revisabas la orden. Se recargó la vista previa: revísala y vuelve a generar.',
  },
}

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e))

/**
 * Rediseño de Cuentas B6 (D8, D20, S2, S9, supuestos 14 y 16): genera la
 * orden con lo que el usuario dejó marcado. El preview se vuelve a calcular
 * aquí; si algo de la selección dejó de ser elegible o cambió su saldo, se
 * responde `candidatos_cambiaron` y la UI recarga. El PDF lleva el cruce por
 * responsable y el total a transferir; la RPC revalida los saldos bajo
 * candado y escribe el desglose inmutable (B1b).
 */
export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido: se esperaba JSON' }, { status: 400 })
  }
  const validation = validate(GenerarOrdenCuentasSchema, json)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
  const { idempotency_key, seleccion } = validation.data

  try {
    const { status, body } = await withIdempotency(
      IDEMPOTENCY_SCOPE,
      idempotency_key,
      async () => {
        const vigente = armarPreviewOrden(await cargarCandidatosOrden())
        const { preview, cambiaron } = aplicarSeleccion(vigente, seleccion)
        if (cambiaron || preview.responsables.length === 0) return CAMBIARON

        const googleEnv = getGoogleEnv()
        if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }

        const pdfPreview = aPreviewPdf(preview)
        const nombre = nombreArchivoOrden(preview.responsables.flatMap((r) => r.proyectos.flatMap((p) => (p.folios.length ? p.folios : [p.proyecto_id ?? '']))))
        const pdf = new File([generateOrdenPagoPdf(pdfPreview)], nombre, { type: 'application/pdf' })
        const pdfUrl = await uploadFileToDrive(pdf, '/Ordenes de Pago', nombre, googleEnv.driveFolderIdCuentas || undefined)

        let orden
        try {
          orden = await generarOrdenPago({
            candidatos: seleccionCompleta(preview),
            pdfUrl,
            pdfNombre: nombre,
            usuario: authResult.session?.user?.email || 'sistema',
          })
        } catch (error) {
          // El PDF ya subió: queda huérfano en Drive y se registra (S2).
          logStructured({
            requestId: newRequestId(),
            route: ROUTE,
            level: 'warn',
            message: 'orden_pago_pdf_huerfano',
            detail: `La RPC generar_orden_pago falló después de subir ${nombre} (${pdfUrl}).`,
          })
          if (error instanceof DomainError && (error.code === 'candidatos_cambiaron' || error.code === 'candidato_no_elegible')) return CAMBIARON
          throw error
        }

        const t = totalesPreview(preview)
        const generada: OrdenGenerada = {
          id: orden.orden_pago_id,
          pdf_url: pdfUrl,
          pdf_nombre: nombre,
          cuentas: t.cuentas,
          responsables: t.responsables,
          total_transferir: t.cruce.total,
        }
        return { status: 200, body: { orden: generada } }
      },
      { payloadHash: computePayloadHash(seleccion) }
    )
    return Response.json(body, { status })
  } catch (error) {
    const texto = errorTexto(error)
    if (/invalid_grant|google drive desautorizado/i.test(texto)) {
      return buildErrorResponse(
        new DomainError({
          code: 'drive_desautorizado',
          status: 503,
          safeMessage: 'Google Drive desautorizado. Reautoriza Drive y actualiza GOOGLE_DRIVE_REFRESH_TOKEN en Vercel.',
          cause: error,
        }),
        ROUTE
      )
    }
    // S9: otra petición con la misma llave sigue en curso: es espera, no error.
    if (texto.includes('ya se está procesando')) {
      return Response.json({ error: 'orden_en_proceso', message: 'La orden se está generando. Espera unos segundos.' }, { status: 409 })
    }
    return buildErrorResponse(error, ROUTE)
  }
}
