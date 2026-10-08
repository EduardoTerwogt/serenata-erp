/**
 * #123 (B2, P9, T11): alta del complemento de pago (CFDI tipo "P"). Se liga solo, por el UUID de la factura
 * (DoctoRelacionado.IdDocumento) y el monto pagado (ImpPagado): la RPC por lado (`ligar_complemento_cobro` /
 * `ligar_complemento_proveedor`) encuentra la factura vigente (debe ser PPD), el pago que la cubrió y deja un
 * renglón por factura relacionada. Reemplaza a la elección en TS del pago "más reciente sin archivo".
 */
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { crearSubida } from './archivos-pendientes'
import { parseComplementoPagoXML, relacionadosDeComplemento } from '@/lib/server/xml/complemento-parser'

export type LadoComplemento = 'cobro' | 'proveedor'

const RPC: Record<LadoComplemento, string> = { cobro: 'ligar_complemento_cobro', proveedor: 'ligar_complemento_proveedor' }

const MENSAJES: Record<string, { status: number; mensaje: string }> = {
  factura_no_encontrada: { status: 409, mensaje: 'No hay una factura vigente con el UUID que trae el complemento.' },
  factura_no_ppd: { status: 409, mensaje: 'La factura es PUE: no lleva complemento de pago.' },
  complemento_ambiguo: { status: 409, mensaje: 'Varios pagos coinciden con el monto del complemento: elige el pago.' },
  complemento_sin_pago: { status: 409, mensaje: 'La factura no tiene un pago de ese monto que todavía necesite complemento.' },
  complemento_sin_relacionados: { status: 400, mensaje: 'El complemento no relaciona ninguna factura.' },
  xml_invalido: { status: 400, mensaje: 'Falta el XML del complemento.' },
}

export interface LigarComplementoParams {
  lado: LadoComplemento
  xmlFile: File
  pdfFile: File | null
  /** Pago elegido a mano (desambigua, o fuerza un pago con otro monto, que queda "En revisión"). */
  pagoId: string | null
  carpeta: string
  uploadFolderId?: string
  usuario: string | null
  route: string
  /** Si se pasa, el complemento debe relacionar la factura de esta cuenta de cobro (ruta por cuenta). */
  uuidFacturaEsperado?: string | null
  /** #131: guarda primero los datos y sube los archivos a Drive después (si Drive falla, quedan pendientes). */
  driveDespues?: boolean
}

export async function ligarComplemento(p: LigarComplementoParams): Promise<{ status: number; body: Record<string, unknown> }> {
  const data = parseComplementoPagoXML(await p.xmlFile.text())
  if (data.error) return { status: 400, body: { error: `Error al leer el complemento: ${data.error}` } }
  const relacionados = relacionadosDeComplemento(data)
  if (relacionados.length === 0) {
    return { status: 400, body: { error: 'El complemento no relaciona ninguna factura con ImpPagado' } }
  }
  if (p.uuidFacturaEsperado && !relacionados.some((r) => r.uuid_factura.toUpperCase() === p.uuidFacturaEsperado!.trim().toUpperCase())) {
    return { status: 400, body: { error: 'El complemento no corresponde a la factura de esta cuenta' } }
  }

  const googleEnv = getGoogleEnv()
  if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
  const folderId = p.uploadFolderId ?? (googleEnv.driveFolderIdCuentas || undefined)
  const timestamp = Date.now()
  const subida = crearSubida({ lado: p.lado, carpeta: p.carpeta, folderId, despues: p.driveDespues, route: p.route })
  const xmlUrl = await subida.guardar('xml', p.xmlFile, `complemento_pago_${timestamp}.xml`)
  const pdfUrl = p.pdfFile ? await subida.guardar('pdf', p.pdfFile, `complemento_pago_${timestamp}.pdf`) : null

  const { data: resultado, error } = await supabaseAdmin.rpc(RPC[p.lado], {
    p_relacionados: relacionados,
    p_xml: { archivo_url: xmlUrl, archivo_nombre: p.xmlFile.name, archivo_size: p.xmlFile.size, uuid_cfdi: data.uuid ?? null },
    p_pdf: p.pdfFile && pdfUrl ? { archivo_url: pdfUrl, archivo_nombre: p.pdfFile.name, archivo_size: p.pdfFile.size } : null,
    p_pago_id: p.pagoId,
    p_usuario: p.usuario,
  })
  if (error) {
    const requestId = newRequestId()
    const detail = error.message ?? ''
    const codigo = detail.split(':')[0].trim()
    const conocido = MENSAJES[codigo]
    logStructured({ requestId, route: p.route, level: conocido ? 'warn' : 'error', message: conocido ? codigo : `rpc_${RPC[p.lado]}_error`, detail: `${detail} (archivos huérfanos: ${xmlUrl}${pdfUrl ? `, ${pdfUrl}` : ''})` })
    if (conocido) return { status: conocido.status, body: { error: codigo, message: conocido.mensaje, requestId } }
    if (error.code === '23505') return { status: 409, body: { error: 'complemento_existente', message: 'Ese pago ya tiene complemento para la factura.', requestId } }
    return { status: 400, body: { error: 'No se pudo guardar el complemento', requestId } }
  }
  // Los datos ya están: ahora los archivos van a Drive. Un complemento que relaciona varias facturas repite el archivo en una fila por factura.
  const filas = ((resultado as { complementos?: { xml_id?: string | null; pdf_id?: string | null }[] }).complementos ?? [])
  const ids = (k: 'xml_id' | 'pdf_id') => filas.map((f) => f[k]).filter((id): id is string => Boolean(id))
  const archivosPendientes = await subida.terminar({ xml: ids('xml_id'), pdf: ids('pdf_id') })
  return { status: 200, body: { success: true, ...(resultado as Record<string, unknown>), ...(archivosPendientes.length > 0 ? { archivos_pendientes: archivosPendientes } : {}) } }
}

/**
 * Agrega el PDF a un complemento de cobro que ya tiene su XML (el PDF puede llegar después, en su propia
 * petición, por el límite de ~4.5 MB de Vercel). Va al mismo (factura, pago) del XML vigente.
 */
export async function agregarPdfComplementoCobro(p: {
  cuentaId: string
  pagoId: string
  pdfFile: File
  carpeta: string
  uploadFolderId?: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: cuenta, error: errorCuenta } = await supabaseAdmin.from('cuentas_cobrar').select('factura_documento_id').eq('id', p.cuentaId).maybeSingle()
  if (errorCuenta) throw errorCuenta
  if (!cuenta?.factura_documento_id) return { status: 409, body: { error: 'La cuenta no tiene factura vigente' } }

  const { data: xml, error: errorXml } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .select('id, monto_pagado')
    .eq('tipo', 'COMPLEMENTO_PAGO')
    .eq('factura_documento_id', cuenta.factura_documento_id)
    .eq('pago_id', p.pagoId)
    .is('eliminado_at', null)
    .maybeSingle()
  if (errorXml) throw errorXml
  if (!xml) return { status: 409, body: { error: 'complemento_sin_xml', message: 'Sube primero el XML del complemento de ese pago.' } }

  const googleEnv = getGoogleEnv()
  if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
  const url = await uploadFileToDrive(p.pdfFile, p.carpeta, `complemento_pago_${Date.now()}.pdf`, p.uploadFolderId ?? (googleEnv.driveFolderIdCuentas || undefined))
  const { data: doc, error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .insert({
      tipo: 'COMPLEMENTO_PAGO_PDF',
      factura_documento_id: cuenta.factura_documento_id,
      pago_id: p.pagoId,
      monto_pagado: xml.monto_pagado,
      archivo_url: url,
      archivo_nombre: p.pdfFile.name,
      archivo_size: p.pdfFile.size,
    })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return { status: 409, body: { error: 'complemento_existente', message: 'Ese pago ya tiene el PDF del complemento.' } }
    throw error
  }
  return { status: 200, body: { success: true, documentos: [doc], pago_id: p.pagoId } }
}
