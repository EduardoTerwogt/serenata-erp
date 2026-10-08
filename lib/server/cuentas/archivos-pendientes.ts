/**
 * #131: "los datos primero, los archivos después". Con `despues`, quien confirma una factura escribe los datos con un
 * `archivo_url` pendiente (ver `@/lib/shared/cuentas/archivo-pendiente`), y solo entonces sube los archivos a Drive y
 * reemplaza el enlace. Si Drive falla, la factura queda guardada y los archivos pendientes se reenvían con
 * `reintentarSubida` (solo el archivo, sin repetir la factura). Sin `despues`, Drive va primero, como siempre.
 */
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { logStructured, newRequestId } from '@/lib/server/observability/log'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { parseComplementoPagoXML } from '@/lib/server/xml/complemento-parser'
import { parseFacturaXML } from '@/lib/server/xml/factura-parser'
import { archivoPendiente, rolDePendiente, urlPendiente, type ArchivoPendienteInfo, type RolArchivo } from '@/lib/shared/cuentas/archivo-pendiente'
import { carpetaContraparte } from './carpetas'
import { resolverContraparteDeDestinos } from './contrapartes'

type Lado = ArchivoPendienteInfo['lado']
const TABLA: Record<Lado, string> = { cobro: 'documentos_cuentas_cobrar', proveedor: 'documentos_cuentas_pagar' }

export interface OpcionesSubida {
  lado: Lado
  carpeta: string
  folderId?: string
  /** Datos primero, Drive después. */
  despues?: boolean
  route: string
}

/**
 * Un envío de archivos. `guardar` devuelve el valor de `archivo_url` (el enlace de Drive, o el pendiente con `despues`).
 * `terminar` (con los datos ya escritos) sube los archivos y devuelve los que quedaron pendientes; `ids` son los
 * documentos de cada rol (un complemento con varias facturas relacionadas repite el mismo archivo en varias filas).
 */
export function crearSubida(o: OpcionesSubida) {
  const guardados: { rol: RolArchivo; file: File; nombre: string }[] = []
  return {
    async guardar(rol: RolArchivo, file: File, nombre: string): Promise<string> {
      if (!o.despues) return uploadFileToDrive(file, o.carpeta, nombre, o.folderId)
      guardados.push({ rol, file, nombre })
      return urlPendiente(rol)
    },

    async terminar(ids: Partial<Record<RolArchivo, string[]>>): Promise<ArchivoPendienteInfo[]> {
      const pendientes: ArchivoPendienteInfo[] = []
      for (const g of guardados) {
        const docs = ids[g.rol] ?? []
        if (docs.length === 0) continue
        try {
          const url = await uploadFileToDrive(g.file, o.carpeta, g.nombre, o.folderId)
          // Solo mientras siga pendiente: no pisa un enlace que otro reintento ya puso.
          const { error } = await supabaseAdmin.from(TABLA[o.lado]).update({ archivo_url: url }).in('id', docs).eq('archivo_url', urlPendiente(g.rol))
          if (error) throw error
        } catch (error) {
          logStructured({ requestId: newRequestId(), route: o.route, level: 'error', message: 'subida_a_drive_pendiente', detail: error instanceof Error ? error.message : String(error) })
          pendientes.push(...docs.map((id) => ({ lado: o.lado, id, rol: g.rol, nombre: g.nombre })))
        }
      }
      return pendientes
    },
  }
}

type Respuesta = { status: number; body: Record<string, unknown> }

/** Carpeta de Drive del documento, como la que se habría usado al subir la factura (`/Por Cobrar|Pagar/<contraparte>`). */
async function carpetaDelDocumento(lado: Lado, doc: { id: string; tipo: string; factura_documento_id?: string | null; grupo_id?: string | null }): Promise<string | null> {
  let destino: string | null = null
  if (lado === 'proveedor') {
    destino = doc.grupo_id ?? null
  } else {
    const facturaId = doc.tipo === 'FACTURA_XML' ? doc.id : (doc.factura_documento_id ?? null)
    if (facturaId) {
      const { data, error } = await supabaseAdmin.from('cuentas_cobrar').select('id').eq('factura_documento_id', facturaId).limit(1)
      if (error) throw error
      destino = (data?.[0]?.id as string | undefined) ?? null
    }
  }
  if (!destino) return null
  const r = await resolverContraparteDeDestinos(lado, [destino])
  return r.ok ? carpetaContraparte(lado, r.contraparte.nombre) : null
}

/**
 * "Reintentar subida" / "Subir archivo": sube a Drive el archivo de un documento que quedó pendiente y reemplaza su
 * enlace. Recibe el archivo (no hay copia guardada): el XML debe ser el mismo CFDI (UUID) que ya se registró. Idempotente.
 */
export async function reintentarSubida(p: { lado: Lado; id: string; archivo: File; folderId?: string; route: string }): Promise<Respuesta> {
  const columnas = p.lado === 'cobro' ? 'id, tipo, archivo_url, uuid_cfdi, factura_documento_id' : 'id, tipo, archivo_url, uuid_cfdi, grupo_id'
  const { data, error } = await supabaseAdmin.from(TABLA[p.lado]).select(columnas).eq('id', p.id).maybeSingle()
  if (error) throw error
  if (!data) return { status: 404, body: { error: 'Documento no encontrado' } }
  const doc = data as unknown as { id: string; tipo: string; archivo_url: string | null; uuid_cfdi: string | null; factura_documento_id?: string | null; grupo_id?: string | null }
  if (!archivoPendiente(doc.archivo_url)) return { status: 200, body: { success: true, archivo_url: doc.archivo_url, pendiente: false } }

  const rol = rolDePendiente(doc.archivo_url as string)
  if (!rol) return { status: 409, body: { error: 'documento_invalido', message: 'El documento tiene un archivo pendiente desconocido.' } }
  if (p.archivo.size > MAX_FILE_SIZE) return { status: 400, body: { error: MENSAJE_LIMITE } }
  const nombre = p.archivo.name.toLowerCase()
  if (rol === 'pdf' && !nombre.endsWith('.pdf') && p.archivo.type !== 'application/pdf') return { status: 400, body: { error: 'El archivo debe ser PDF' } }
  if (rol === 'xml') {
    if (!nombre.endsWith('.xml') && !p.archivo.type.includes('xml')) return { status: 400, body: { error: 'El archivo debe ser XML' } }
    // Es el mismo CFDI que ya se registró: un XML distinto no puede quedar como archivo de esta factura.
    const contenido = await p.archivo.text()
    const uuid = doc.tipo.startsWith('COMPLEMENTO') ? parseComplementoPagoXML(contenido).uuid : parseFacturaXML(contenido).uuid_timbrado
    if (doc.uuid_cfdi && (uuid ?? '').toUpperCase() !== doc.uuid_cfdi.toUpperCase()) {
      return { status: 409, body: { error: 'xml_distinto', message: 'Ese XML no es el de esta factura (el UUID no coincide).' } }
    }
  }

  const carpeta = await carpetaDelDocumento(p.lado, doc)
  if (!carpeta) return { status: 409, body: { error: 'sin_carpeta', message: 'No se pudo determinar la carpeta de Drive del documento.' } }
  try {
    const url = await uploadFileToDrive(p.archivo, carpeta, p.archivo.name, p.folderId)
    const { error: errorUpdate } = await supabaseAdmin.from(TABLA[p.lado]).update({ archivo_url: url, archivo_nombre: p.archivo.name }).eq('id', p.id).eq('archivo_url', urlPendiente(rol))
    if (errorUpdate) throw errorUpdate
    return { status: 200, body: { success: true, archivo_url: url, pendiente: false } }
  } catch (e) {
    const requestId = newRequestId()
    logStructured({ requestId, route: p.route, level: 'error', message: 'reintento_subida_fallido', detail: e instanceof Error ? e.message : String(e) })
    return { status: 502, body: { error: 'subida_fallida', message: 'Drive no respondió. La factura sigue guardada: vuelve a intentarlo en unos minutos.', requestId } }
  }
}
