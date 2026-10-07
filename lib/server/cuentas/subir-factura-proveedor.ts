/**
 * #123 (B3): alta de la factura de un grupo de proveedor (1:1 por grupo, P10). Es la lógica que antes vivía en la ruta
 * del grupo; la comparten esa ruta y `POST /api/cuentas/facturas`. Aparte de `subir-factura.ts` (cobro) porque este
 * lado escribe por el repositorio (`@/lib/db`), no por una RPC directa.
 */
import { createDocumentoCuentaPagar, getProveedorById, validarFacturaProveedor } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import type { RegimenFiscal } from '@/lib/types'
import { completarReemplazo, type Reemplazo } from './reemplazo-factura'

export interface SubirFacturaProveedorParams {
  grupo: { id: string; proyecto_id: string; responsable_id: string; responsable_nombre?: string | null; monto_total: number | string | null; estado: string }
  xmlFile: File
  pdfFile: File | null
  /** Contenido del XML ya leído por quien llama (lo revisó antes de tocar Drive). */
  xmlContent: string
  carpeta: string
  uploadFolderId?: string
  usuario: string | null
  reemplazo?: Reemplazo | null
  /** Motivo extra que fuerza "En revisión" aunque el total cuadre (p. ej. el RFC del XML no coincide, P24). */
  aviso?: string | null
}

function fechaDeFactura(xmlContent: string): string | null {
  const match = xmlContent.match(/\bFecha=["']([^"']+)["']/i)
  if (!match?.[1]) return null
  const datePart = match[1].split('T')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
}

/**
 * Sube y registra la factura de un grupo de proveedor: Drive → documentos → `validar_factura_proveedor` solo si
 * cuadra. Es la lógica que antes vivía en la ruta del grupo; la comparten esa ruta y `POST /api/cuentas/facturas`
 * (#123, B3). #123 (P11): guarda el método de pago (PUE/PPD) en la fila del XML.
 */
export async function subirFacturaProveedor(p: SubirFacturaProveedorParams): Promise<{ status: number; body: Record<string, unknown> }> {
  const { grupo } = p
  const facturaXmlUrl = await uploadFileToDrive(p.xmlFile, p.carpeta, p.xmlFile.name, p.uploadFolderId)
  const facturaPdfUrl = p.pdfFile ? await uploadFileToDrive(p.pdfFile, p.carpeta, p.pdfFile.name, p.uploadFolderId) : null

  let regimenFiscal: RegimenFiscal | null = null
  try {
    const proveedor = await getProveedorById(grupo.responsable_id)
    regimenFiscal = proveedor.regimen_fiscal ?? null
  } catch {
    regimenFiscal = null
  }

  const facturaData = parseFacturaXML(p.xmlContent)
  const validacionXml = facturaData.error
    ? { estado_validacion: 'revision' as const, detalle_validacion: `No se pudo parsear el XML: ${facturaData.error}` }
    : validarFacturaFiscalProveedor(facturaData, Number(grupo.monto_total || 0), regimenFiscal)

  // V3 (Rediseño de Cuentas B2): el XML entra como 'pendiente' aunque cuadre; SOLO validar_factura_proveedor lo
  // pasa a 'validado', en la misma transacción que el snapshot y el cambio a FACTURADO.
  const aviso = p.aviso?.trim() || null
  const cuadra = validacionXml.estado_validacion === 'validado' && !aviso
  if (aviso) validacionXml.detalle_validacion = [validacionXml.detalle_validacion, aviso].filter(Boolean).join(' ')
  const documentoXml = await createDocumentoCuentaPagar({
    grupo_id: grupo.id,
    tipo: 'FACTURA_PROVEEDOR_XML',
    archivo_url: facturaXmlUrl,
    archivo_nombre: p.xmlFile.name,
    estado_validacion: cuadra ? 'pendiente' : aviso ? 'revision' : validacionXml.estado_validacion,
    detalle_validacion: validacionXml.detalle_validacion,
    // Rediseño de Cuentas B1 (U7): datos del CFDI en la fila del XML.
    uuid_cfdi: facturaData.uuid_timbrado ?? null,
    total_cfdi: facturaData.error ? null : facturaData.monto_total ?? null,
    // #123 (P11): PUE/PPD de la factura del proveedor; un PPD exige complemento por pago.
    metodo_pago_cfdi: facturaData.error ? null : facturaData.metodo_pago ?? null,
  })

  const documentoPdf =
    p.pdfFile && facturaPdfUrl
      ? await createDocumentoCuentaPagar({ grupo_id: grupo.id, tipo: 'FACTURA_PROVEEDOR', archivo_url: facturaPdfUrl, archivo_nombre: p.pdfFile.name })
      : null

  // Regla de cierre: 'revision' (no cuadra) NO cierra el grupo: se guarda el documento y el grupo sigue ABIERTO.
  let estadoGrupo = grupo.estado
  if (cuadra) {
    const validada = await validarFacturaProveedor(documentoXml.id, p.usuario)
    documentoXml.estado_validacion = 'validado'
    estadoGrupo = validada.estado
  }
  if (p.reemplazo) await completarReemplazo(p.reemplazo, documentoXml.id)

  return {
    status: 200,
    body: {
      success: true,
      documentos: documentoPdf ? [documentoXml, documentoPdf] : [documentoXml],
      fecha_factura: fechaDeFactura(p.xmlContent),
      factura_data: facturaData,
      validacion_estructural: validacionXml,
      grupo: {
        id: grupo.id,
        proyecto_id: grupo.proyecto_id,
        responsable_nombre: grupo.responsable_nombre ?? null,
        monto_total: grupo.monto_total,
        estado: estadoGrupo,
      },
    },
  }
}
