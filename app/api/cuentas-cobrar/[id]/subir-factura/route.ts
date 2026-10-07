import { randomUUID } from 'node:crypto'
import { requireSection } from '@/lib/api-auth'
import { getCuentaCobrarById, getDocumentosCuentaCobrar, getCotizacionById, getProyectoById } from '@/lib/db'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { planearFactura } from '@/lib/server/cuentas/reemplazo-factura'
import { subirFacturaCobro } from '@/lib/server/cuentas/subir-factura'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'

const ROUTE = 'POST /api/cuentas-cobrar/[id]/subir-factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere archivo XML de factura',
  PDF_REQUIRED: 'Se requiere archivo PDF de factura',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 4 MB',
}

/**
 * Factura de UNA cuenta de cobro. #123 (B2): la lógica vive en `lib/server/cuentas/subir-factura.ts` (una
 * factura puede cubrir varias cuentas; esa entrada es `POST /api/cuentas/facturas`, B3). La validación del
 * total contra la cotización ya no está aquí: la hace `ligar_factura` en SQL (T19), y la factura queda
 * "En revisión" con el descuadre exacto si no cuadra (P5).
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    // Obtener archivos
    const pdfFileInput = formData.get('factura_pdf') as File | null
    const xmlFileInput = formData.get('factura_xml') as File | null

    const validation = validateFacturaFiles({ xml: xmlFileInput, pdf: pdfFileInput, pdfRequired: false })
    if (!validation.ok) {
      return Response.json({ error: VALIDATION_MESSAGES[validation.code] }, { status: 400 })
    }
    const xmlFile = xmlFileInput as File
    const pdfFile = pdfFileInput

    // Obtener cuenta
    const cuenta = await getCuentaCobrarById(id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      )
    }

    // B7: con una factura vigente validada, subir otra es reemplazarla:
    // usuario de Cuentas con las cuentas reabiertas (P14, reemplazo-factura.ts).
    const plan = await planearFactura('cobro', cuenta, await getDocumentosCuentaCobrar(id), authResult.session?.user, formData.get('motivo'))
    if (!plan.ok) return Response.json(plan.body, { status: plan.status })

    // Obtener cotización (nombre del proyecto para la carpeta de Drive)
    const cotizacion = await getCotizacionById(cuenta.cotizacion_id)
    if (!cotizacion) {
      return Response.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      )
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    // cuentas_cobrar solo guarda cotizacion_id, no proyecto_id — y proyectos.id == cotizacion_id
    // únicamente para cotizaciones PRINCIPAL. Para COMPLEMENTARIA, el proyecto es el de la
    // cotización padre (cotizacion.es_complementaria_de), igual que resuelve approve_cotizacion()
    // en la RPC (db/migrations/20260410_fix_approve_cotizacion_overload.sql).
    const proyectoId = cotizacion.tipo === 'COMPLEMENTARIA' && cotizacion.es_complementaria_de
      ? cotizacion.es_complementaria_de
      : cotizacion.id
    const proyecto = await getProyectoById(proyectoId)
    if (!proyecto) {
      return Response.json({ error: 'Proyecto asociado no encontrado' }, { status: 404 })
    }

    const { status, body } = await subirFacturaCobro({
      cuentas: [{ id }],
      xmlFile,
      pdfFile,
      carpeta: `/Por Cobrar/${cuenta.cotizacion_id}-${proyecto.proyecto}`,
      uploadFolderId: resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined),
      usuario: authResult.session?.user?.email ?? null,
      operationId: randomUUID(),
      reemplazo: plan.reemplazo,
      route: ROUTE,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
