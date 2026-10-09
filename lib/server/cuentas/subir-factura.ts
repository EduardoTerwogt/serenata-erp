/**
 * #123 (B2, T9, T12, T19): alta de la factura de un cobro. Un solo orquestador (parse → Drive → RPC) para las
 * rutas que ligan una factura de cliente a una o varias cuentas. La regla de validación de la factura
 * (suma de las cotizaciones contra el total del XML, tolerancia de 0.01 por cotización, P26) vive solo en SQL
 * (`factura_cuadre`, que reutiliza `ligar_factura`, T19): aquí solo se lee el XML, se calcula el vencimiento
 * (`calcularDeadline`, única regla, T12) y se llama a la RPC, que en una transacción crea el XML (cabecera) y
 * su PDF, apunta cada cuenta a la factura y escribe las fechas (cachés; TS ya no las escribe).
 */
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { respuestaProyectoHistorico } from '@/lib/server/errors/domain-error'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { calcularDeadline, parseFacturaXML, type FacturaData } from '@/lib/server/xml/factura-parser'
import { crearSubida } from './archivos-pendientes'
import { completarReemplazo, type Reemplazo } from './reemplazo-factura'

export interface SubirFacturaCobroParams {
  /** Cuentas que cubre la factura; `monto_esperado` es el total que el usuario vio (la RPC lo revalida). */
  cuentas: { id: string; monto_esperado?: number | null }[]
  xmlFile: File
  pdfFile: File | null
  /** Carpeta de Drive de los archivos (la resuelve quien llama). */
  carpeta: string
  /** Carpeta raíz de Drive (con el override de pruebas de carga ya resuelto). */
  uploadFolderId?: string
  usuario: string | null
  /** Llave de idempotencia de la RPC: un reintento no duplica la factura. */
  operationId: string
  /** #131: guarda primero los datos y sube los archivos a Drive después (si Drive falla, quedan pendientes). */
  driveDespues?: boolean
  /** Motivo extra que fuerza "En revisión" (p. ej. el RFC no coincide). */
  aviso?: string | null
  /** Si reemplaza a una factura validada (B7): lo que arma `planearFactura`. */
  reemplazo?: Reemplazo | null
  route: string
}

export interface ResultadoLigarFactura {
  factura_id: string
  pdf_id: string | null
  estado: 'validado' | 'revision' | 'pendiente'
  detalle: string | null
  repetido: boolean
  suma?: number
  diferencia?: number
  tolerancia?: number
}

// Errores esperados de la RPC: el prefijo del mensaje decide el código y el texto seguro.
const MENSAJES: Record<string, { status: number; mensaje: string }> = {
  cuenta_ya_ligada: { status: 409, mensaje: 'Una de las cotizaciones ya tiene una factura vigente: reemplázala o quítala primero.' },
  factura_duplicada: { status: 409, mensaje: 'El UUID de esta factura ya está registrado en otra factura vigente.' },
  clientes_distintos: { status: 400, mensaje: 'Las cotizaciones de una factura deben ser de un solo cliente.' },
  lineas_requeridas: { status: 400, mensaje: 'La factura necesita al menos una cotización.' },
  lineas_invalidas: { status: 400, mensaje: 'Cada cotización aparece una sola vez en la factura.' },
  xml_invalido: { status: 400, mensaje: 'Falta el XML de la factura o su total.' },
  candidatos_cambiaron: { status: 409, mensaje: 'El total de una cotización cambió mientras subías la factura. Vuelve a cargar y revisa.' },
}

/** Lee y revisa el XML antes de tocar Drive. Devuelve los datos o el rechazo HTTP. */
export async function leerFacturaCobro(xmlFile: File): Promise<{ ok: true; data: FacturaData; xmlContent: string } | { ok: false; status: number; body: { error: string } }> {
  const xmlContent = await xmlFile.text()
  if (!xmlContent.trim().startsWith('<')) {
    return { ok: false, status: 400, body: { error: 'El archivo XML no contiene datos XML válidos' } }
  }
  const data = parseFacturaXML(xmlContent)
  if (data.error) return { ok: false, status: 400, body: { error: `Error al parsear XML: ${data.error}` } }
  if (!data.fecha_emision || !data.monto_total) {
    return { ok: false, status: 400, body: { error: 'Factura incompleta: falta fecha o monto' } }
  }
  return { ok: true, data, xmlContent }
}

export async function subirFacturaCobro(p: SubirFacturaCobroParams): Promise<{ status: number; body: Record<string, unknown> }> {
  const lectura = await leerFacturaCobro(p.xmlFile)
  if (!lectura.ok) return { status: lectura.status, body: lectura.body }
  const facturaData = lectura.data

  const googleEnv = getGoogleEnv()
  if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
  const folderId = p.uploadFolderId ?? (googleEnv.driveFolderIdCuentas || undefined)

  const subida = crearSubida({ lado: 'cobro', carpeta: p.carpeta, folderId, despues: p.driveDespues, route: p.route })
  const pdfUrl = p.pdfFile ? await subida.guardar('pdf', p.pdfFile, p.pdfFile.name) : null
  const xmlUrl = await subida.guardar('xml', p.xmlFile, p.xmlFile.name)

  const { data, error } = await supabaseAdmin.rpc('ligar_factura', {
    p_cuentas: p.cuentas.map((c) => ({ cuenta_id: c.id, monto_esperado: c.monto_esperado ?? null })),
    p_xml: {
      archivo_url: xmlUrl,
      archivo_nombre: p.xmlFile.name,
      archivo_size: p.xmlFile.size,
      uuid_cfdi: facturaData.uuid_timbrado ?? null,
      total_cfdi: facturaData.monto_total,
      metodo_pago_cfdi: facturaData.metodo_pago ?? null,
    },
    p_pdf: p.pdfFile && pdfUrl ? { archivo_url: pdfUrl, archivo_nombre: p.pdfFile.name, archivo_size: p.pdfFile.size } : null,
    // T12: el vencimiento lo calcula TS con calcularDeadline; la RPC escribe ambas fechas en cada cuenta.
    p_fecha_emision: facturaData.fecha_emision,
    p_fecha_vencimiento: calcularDeadline(facturaData.fecha_emision as string),
    p_usuario: p.usuario,
    p_operation_id: p.operationId,
    p_aviso: p.aviso ?? null,
    p_reemplaza: p.reemplazo?.anteriores[0] ?? null,
  })

  if (error) {
    const requestId = newRequestId()
    const detail = error.message ?? ''
    const codigo = detail.split(':')[0].trim()
    const historico = respuestaProyectoHistorico(error, requestId)
    if (historico) return historico
    const conocido = MENSAJES[codigo]
    // Los archivos ya quedaron en Drive: se registran para poder limpiarlos.
    logStructured({ requestId, route: p.route, level: conocido ? 'warn' : 'error', message: conocido ? codigo : 'rpc_ligar_factura_error', detail: `${detail} (archivos huérfanos: ${xmlUrl}${pdfUrl ? `, ${pdfUrl}` : ''})` })
    if (conocido) return { status: conocido.status, body: { error: codigo, message: conocido.mensaje, requestId } }
    if (error.code === 'P0002') return { status: 404, body: { error: 'Cuenta por cobrar no encontrada', requestId } }
    return { status: 400, body: { error: 'No se pudo guardar la factura', requestId } }
  }

  const factura = data as ResultadoLigarFactura
  if (p.reemplazo && !factura.repetido) await completarReemplazo(p.reemplazo, factura.factura_id)
  // Los datos ya están: ahora los archivos van a Drive. Una operación repetida no vuelve a subirlos.
  const archivosPendientes = factura.repetido ? [] : await subida.terminar({ xml: [factura.factura_id], pdf: factura.pdf_id ? [factura.pdf_id] : [] })

  return {
    status: 200,
    body: {
      success: true,
      factura_id: factura.factura_id,
      estado_validacion: factura.estado,
      detalle_validacion: factura.detalle,
      factura_data: facturaData,
      validacion_estructural: { estado_validacion: factura.estado, detalle_validacion: factura.detalle },
      archivos_subidos: p.pdfFile ? 2 : 1,
      repetido: factura.repetido,
      ...(archivosPendientes.length > 0 ? { archivos_pendientes: archivosPendientes } : {}),
    },
  }
}
