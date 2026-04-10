import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar, createDocumentoCuentaCobrar, getCotizacionById, getProyectoById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { parseFacturaXML, validarMontoFactura, calcularDeadline } from '@/lib/server/xml/factura-parser'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    // Obtener archivos
    const pdfFile = formData.get('factura_pdf') as File | null
    const xmlFile = formData.get('factura_xml') as File | null

    if (!xmlFile) {
      return Response.json(
        { error: 'Se requiere archivo XML de factura' },
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

    // Obtener cotización para validar monto
    const cotizacion = await getCotizacionById(cuenta.cotizacion_id)
    if (!cotizacion) {
      return Response.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      )
    }

    // Parsear XML
    const xmlContent = await xmlFile.text()
    const facturaData = parseFacturaXML(xmlContent)

    if (facturaData.error) {
      return Response.json(
        { error: `Error al parsear XML: ${facturaData.error}` },
        { status: 400 }
      )
    }

    // Validar que tenemos datos mínimos
    if (!facturaData.fecha_emision || !facturaData.monto_total) {
      return Response.json(
        { error: 'Factura incompleta: falta fecha o monto' },
        { status: 400 }
      )
    }

    // Validar monto (informativa, no bloqueante)
    const validacion = validarMontoFactura(facturaData.monto_total, cotizacion.total)
    if (!validacion.coincide) {
      console.warn(`[cuentas-cobrar] Discrepancia de monto: Factura $${facturaData.monto_total} vs Cotización $${cotizacion.total}`)
    }

    // Calcular deadline
    const deadline = calcularDeadline(facturaData.fecha_emision)

    // Subir archivos a Drive
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    const proyecto = await getProyectoById(cuenta.cotizacion_id)
    const folderPath = `/Por Cobrar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
    const uploadedFiles: { type: string; url: string; nombre: string }[] = []
    const cuentasFolderId = googleEnv.driveFolderIdCuentas

    // Subir PDF
    if (pdfFile) {
      const pdfUrl = await uploadFileToDrive(pdfFile, folderPath, pdfFile.name, cuentasFolderId || undefined)
      uploadedFiles.push({
        type: 'FACTURA_PDF',
        url: pdfUrl,
        nombre: pdfFile.name,
      })
    }

    // Subir XML
    const xmlUrl = await uploadFileToDrive(xmlFile, folderPath, xmlFile.name, cuentasFolderId || undefined)
    uploadedFiles.push({
      type: 'FACTURA_XML',
      url: xmlUrl,
      nombre: xmlFile.name,
    })

    // Crear registros en BD
    for (const file of uploadedFiles) {
      await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: file.type as any,
        archivo_url: file.url,
        archivo_nombre: file.nombre,
      })
    }

    // Actualizar cuenta
    const cuentaActualizada = await updateCuentaCobrar(id, {
      estado: 'FACTURADO',
      fecha_factura: facturaData.fecha_emision,
      fecha_vencimiento: deadline,
    } as any)

    // Trigger sincronización con Sheets
    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      cuenta: cuentaActualizada,
      factura_data: facturaData,
      validacion,
      archivos_subidos: uploadedFiles.length,
    })
  } catch (error) {
    console.error('[cuentas-cobrar/subir-factura]', error)
    return Response.json(
      { error: 'Error al subir factura' },
      { status: 500 }
    )
  }
}
