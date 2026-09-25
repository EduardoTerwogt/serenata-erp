import { requireSection } from '@/lib/api-auth'
import { getCuentaCobrarById, updateCuentaCobrar, createDocumentoCuentaCobrar, getCotizacionById, getProyectoById } from '@/lib/db'
import { parseFacturaXML, validarMontoFactura, validarFacturaClienteXML, calcularDeadline } from '@/lib/server/xml/factura-parser'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { validateFacturaFiles, FacturaValidationErrorCode } from '@/lib/server/uploads/factura-validation'
import { calcularEstadoCuentaCobrarDetallado } from '@/lib/shared/cuentas/status'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

const ROUTE = 'POST /api/cuentas-cobrar/[id]/subir-factura'

const VALIDATION_MESSAGES: Record<FacturaValidationErrorCode, string> = {
  XML_REQUIRED: 'Se requiere archivo XML de factura',
  PDF_REQUIRED: 'Se requiere archivo PDF de factura',
  XML_INVALID_TYPE: 'El archivo XML debe ser de tipo text/xml o application/xml',
  PDF_INVALID_TYPE: 'El archivo PDF debe ser de tipo application/pdf',
  FILE_TOO_LARGE: 'El archivo excede el límite de 10 MB',
}

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

    // Obtener cotización para validar monto
    const cotizacion = await getCotizacionById(cuenta.cotizacion_id)
    if (!cotizacion) {
      return Response.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      )
    }

    // Parsear XML — validar contenido antes de regex parse
    const xmlContent = await xmlFile.text()
    if (!xmlContent.trim().startsWith('<')) {
      return Response.json({ error: 'El archivo XML no contiene datos XML válidos' }, { status: 400 })
    }
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
    const folderPath = `/Por Cobrar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
    const uploadedFiles: { type: 'FACTURA_PDF' | 'FACTURA_XML'; url: string; nombre: string }[] = []
    const cuentasFolderId = resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined)

    // Subir PDF
    if (pdfFile) {
      const pdfUrl = await uploadFileToDrive(pdfFile, folderPath, pdfFile.name, cuentasFolderId)
      uploadedFiles.push({
        type: 'FACTURA_PDF',
        url: pdfUrl,
        nombre: pdfFile.name,
      })
    }

    // Subir XML
    const xmlUrl = await uploadFileToDrive(xmlFile, folderPath, xmlFile.name, cuentasFolderId)
    uploadedFiles.push({
      type: 'FACTURA_XML',
      url: xmlUrl,
      nombre: xmlFile.name,
    })

    // Validación estructural automática -- solo aplica al XML (el PDF no se
    // puede validar estructuralmente, queda en 'pendiente' por default).
    const validacionXml = validarFacturaClienteXML(facturaData, cotizacion.total)

    // Crear registros en BD
    for (const file of uploadedFiles) {
      await createDocumentoCuentaCobrar({
        cuentas_cobrar_id: id,
        tipo: file.type,
        archivo_url: file.url,
        archivo_nombre: file.nombre,
        ...(file.type === 'FACTURA_XML' ? {
          estado_validacion: validacionXml.estado_validacion,
          detalle_validacion: validacionXml.detalle_validacion,
          // Rediseño de Cuentas B1 (U7, D2): datos del CFDI en la fila del XML.
          uuid_cfdi: facturaData.uuid_timbrado ?? null,
          total_cfdi: facturaData.monto_total ?? null,
          metodo_pago_cfdi: facturaData.metodo_pago ?? null,
        } : {}),
      })
    }

    // V2 (Rediseño de Cuentas B1): el estado sale de montos, factura y "hoy"
    // en CDMX, nunca fijo en FACTURADO -- con un anticipo previo, fijarlo
    // hacía retroceder el estado guardado (que leen Dashboard y Sheets).
    const estado = calcularEstadoCuentaCobrarDetallado({
      montoPagado: Number(cuenta.monto_pagado || 0),
      montoTotal: Number(cuenta.monto_total || 0),
      fechaVencimiento: deadline,
      isFacturada: true,
      hoy: hoyCdmx(),
    })

    // Actualizar cuenta
    const cuentaActualizada = await updateCuentaCobrar(id, {
      estado,
      fecha_factura: facturaData.fecha_emision,
      fecha_vencimiento: deadline,
    })

    // Trigger sincronización con Sheets

    return Response.json({
      success: true,
      cuenta: cuentaActualizada,
      factura_data: facturaData,
      validacion,
      validacion_estructural: validacionXml,
      archivos_subidos: uploadedFiles.length,
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
