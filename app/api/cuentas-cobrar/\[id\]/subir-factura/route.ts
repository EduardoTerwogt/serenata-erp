import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar, createDocumentoCuentaCobrar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { parseFacturaXML, validarMontoFactura, calcularDeadline } from '@/lib/server/xml/factura-parser'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const pdfFile = formData.get('factura_pdf') as File | null
    const xmlFile = formData.get('factura_xml') as File | null

    if (!pdfFile) {
      return Response.json(
        { error: 'Se requiere archivo PDF de factura' },
        { status: 400 }
      )
    }

    // Obtener cuenta
    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      )
    }

    // Parsear XML si existe
    let fechaFactura = null
    let deadlinePago = null
    let validacionMonto = null

    if (xmlFile) {
      const xmlContent = await xmlFile.text()
      const facturaData = parseFacturaXML(xmlContent)
      fechaFactura = facturaData.fecha_emision
      deadlinePago = calcularDeadline(fechaFactura)
      validacionMonto = validarMontoFactura(facturaData.monto_total, cuenta.monto_total)
    }

    // Subir archivos a Drive
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    const folderPath = `/Por Cobrar/${cuenta.folio || id}`

    const pdfUrl = await uploadFileToDrive(pdfFile, folderPath, 'factura.pdf', googleEnv.driveFolderIdCuentas || undefined)

    await createDocumentoCuentaCobrar({
      cuentas_cobrar_id: id,
      tipo: 'FACTURA_PDF',
      archivo_url: pdfUrl,
      archivo_nombre: pdfFile.name,
    })

    if (xmlFile) {
      const xmlUrl = await uploadFileToDrive(xmlFile, folderPath, 'factura.xml', googleEnv.driveFolderIdCuentas || undefined)
      await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: 'FACTURA_XML',
        archivo_url: xmlUrl,
        archivo_nombre: xmlFile.name,
      })
    }

    // Actualizar cuenta
    await updateCuentaCobrar(id, {
      estado: 'FACTURADO',
      fecha_factura: fechaFactura,
      fecha_vencimiento: deadlinePago,
    })

    // Trigger sincronización
    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      factura: {
        fecha_emision: fechaFactura,
        monto: cuenta.monto_total,
      },
      deadline_pago: deadlinePago,
      validacion: validacionMonto,
      pdf_url: pdfUrl,
    })
  } catch (error) {
    console.error('[cuentas-cobrar/subir-factura]', error)
    return Response.json(
      { error: 'Error al subir factura' },
      { status: 500 }
    )
  }
}
