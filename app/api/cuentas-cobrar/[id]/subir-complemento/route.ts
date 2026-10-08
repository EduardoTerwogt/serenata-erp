import { requireSection } from '@/lib/api-auth'
import { getCuentaCobrarById } from '@/lib/db'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { agregarPdfComplementoCobro, ligarComplemento } from '@/lib/server/cuentas/complemento'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { SubirComplementoSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas-cobrar/[id]/subir-complemento'

function esXml(file: File) {
  return ['text/xml', 'application/xml'].includes(file.type) || file.name.toLowerCase().endsWith('.xml')
}
function esPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Complemento de pago de un cobro. #123 (B2, P9): el XML se liga solo, por el UUID de la factura y el monto
 * pagado, a un pago de una cuenta de esa factura (`ligar_complemento_cobro`); un mismo CFDI puede relacionar
 * varias facturas. `pago_id` (opcional) desambigua. El PDF puede ir con el XML o llegar después, con `pago_id`.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const xmlFile = formData.get('complemento_xml') as File | null
    const pdfFile = formData.get('complemento_pdf') as File | null
    const validation = validate(SubirComplementoSchema, {
      pago_id: formData.get('pago_id') || undefined,
      notas: formData.get('notas'),
    })
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

    if (!xmlFile && !pdfFile) {
      return Response.json({ error: 'Se requiere el XML o el PDF del complemento' }, { status: 400 })
    }
    if (xmlFile && !esXml(xmlFile)) {
      return Response.json({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' }, { status: 400 })
    }
    if (pdfFile && !esPdf(pdfFile)) {
      return Response.json({ error: 'El archivo PDF debe ser de tipo application/pdf' }, { status: 400 })
    }
    if ((xmlFile && xmlFile.size > MAX_FILE_SIZE) || (pdfFile && pdfFile.size > MAX_FILE_SIZE)) {
      return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })
    }

    const cuenta = await getCuentaCobrarById(id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }
    if (!cuenta.factura_documento_id) {
      return Response.json({ error: 'sin_factura', message: 'La cuenta no tiene factura vigente: sube la factura antes del complemento.' }, { status: 409 })
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }
    const carpeta = `/Por Cobrar/${cuenta.folio || cuenta.cotizacion_id}`
    const uploadFolderId = resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined)
    const pagoId = validation.data.pago_id ?? null

    if (!xmlFile && pdfFile) {
      if (!pagoId) return Response.json({ error: 'Para agregar solo el PDF indica el pago (pago_id)' }, { status: 400 })
      const { status, body } = await agregarPdfComplementoCobro({ cuentaId: id, pagoId, pdfFile, carpeta, uploadFolderId })
      return Response.json(body, { status })
    }

    // El complemento debe relacionar la factura de ESTA cuenta (puede cubrir además otras facturas).
    const { data: factura, error: errorFactura } = await supabaseAdmin.from('documentos_cuentas_cobrar').select('uuid_cfdi').eq('id', cuenta.factura_documento_id).maybeSingle()
    if (errorFactura) throw errorFactura

    const { status, body } = await ligarComplemento({
      lado: 'cobro',
      xmlFile: xmlFile as File,
      pdfFile,
      pagoId,
      carpeta,
      uploadFolderId,
      usuario: authResult.session?.user?.email ?? null,
      route: ROUTE,
      uuidFacturaEsperado: factura?.uuid_cfdi ?? null,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
