import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, createDocumentoCuentaPagar, getProyectoById, updateCuentaPagar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { parseFacturaXML, validarFacturaProveedorXML } from '@/lib/server/xml/factura-parser'

function extractFacturaFechaFromXml(xmlContent: string): string | null {
  const match = xmlContent.match(/\bFecha=["']([^"']+)["']/i)
  if (!match?.[1]) return null
  const rawValue = match[1]
  const datePart = rawValue.split('T')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const facturaXmlFile = formData.get('factura_proveedor_xml') as File | null
    const facturaPdfFile = formData.get('factura_proveedor_pdf') as File | null

    if (!facturaXmlFile) {
      return Response.json({ error: 'Se requiere archivo XML de factura proveedor' }, { status: 400 })
    }
    if (!facturaPdfFile) {
      return Response.json({ error: 'Se requiere archivo PDF de factura proveedor' }, { status: 400 })
    }

    // Validar tipos MIME permitidos
    const ALLOWED_XML_TYPES = ['text/xml', 'application/xml']
    const ALLOWED_PDF_TYPES = ['application/pdf']
    if (!ALLOWED_XML_TYPES.includes(facturaXmlFile.type) && !facturaXmlFile.name.endsWith('.xml')) {
      return Response.json({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' }, { status: 400 })
    }
    if (!ALLOWED_PDF_TYPES.includes(facturaPdfFile.type) && !facturaPdfFile.name.endsWith('.pdf')) {
      return Response.json({ error: 'El archivo PDF debe ser de tipo application/pdf' }, { status: 400 })
    }
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    if (facturaXmlFile.size > MAX_FILE_SIZE || facturaPdfFile.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'El archivo excede el límite de 10 MB' }, { status: 400 })
    }

    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    // Validar contenido XML antes de subir
    const facturaXmlContent = await facturaXmlFile.text()
    if (!facturaXmlContent.trim().startsWith('<')) {
      return Response.json({ error: 'El archivo XML no contiene datos XML válidos' }, { status: 400 })
    }

    const proyecto = await getProyectoById(cuenta.proyecto_id)
    if (!proyecto) {
      return Response.json({ error: 'Proyecto asociado no encontrado' }, { status: 404 })
    }
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const folderPath = `/Por Pagar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
    const facturaXmlUrl = await uploadFileToDrive(facturaXmlFile, folderPath, facturaXmlFile.name, googleEnv.driveFolderIdCuentas || undefined)
    const facturaPdfUrl = await uploadFileToDrive(facturaPdfFile, folderPath, facturaPdfFile.name, googleEnv.driveFolderIdCuentas || undefined)

    // Validación estructural automática: el neto esperado en el XML es
    // x_pagar + IVA 16% (ver nota en validarFacturaProveedorXML sobre por
    // qué el régimen fiscal no cambia esta comparación).
    const facturaData = parseFacturaXML(facturaXmlContent)
    const validacionXml = facturaData.error
      ? { estado_validacion: 'revision' as const, detalle_validacion: `No se pudo parsear el XML: ${facturaData.error}` }
      : validarFacturaProveedorXML(facturaData, Number(cuenta.x_pagar || 0))

    const documentoXml = await createDocumentoCuentaPagar({
      cuentas_pagar_id: id,
      tipo: 'FACTURA_PROVEEDOR_XML',
      archivo_url: facturaXmlUrl,
      archivo_nombre: facturaXmlFile.name,
      estado_validacion: validacionXml.estado_validacion,
      detalle_validacion: validacionXml.detalle_validacion,
    })

    const documentoPdf = await createDocumentoCuentaPagar({
      cuentas_pagar_id: id,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: facturaPdfUrl,
      archivo_nombre: facturaPdfFile.name,
    })

    const fechaFactura = extractFacturaFechaFromXml(facturaXmlContent)

    let cuentaActualizada = cuenta
    if (fechaFactura) {
      cuentaActualizada = await updateCuentaPagar(id, { fecha_factura: fechaFactura } as Partial<typeof cuenta>)
    }

    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      documentos: [documentoXml, documentoPdf],
      fecha_factura: fechaFactura,
      factura_data: facturaData,
      validacion_estructural: validacionXml,
      cuenta: {
        id: cuentaActualizada.id,
        cotizacion_id: cuentaActualizada.cotizacion_id,
        responsable_nombre: cuentaActualizada.responsable_nombre,
        x_pagar: cuentaActualizada.x_pagar,
        fecha_factura: cuentaActualizada.fecha_factura || fechaFactura,
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/subir-factura]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
