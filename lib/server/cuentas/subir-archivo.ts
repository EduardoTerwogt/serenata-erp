/**
 * Rediseño de Cuentas B5 (supuesto 15): sube un archivo no fiscal de una
 * cuenta (el PDF de la factura) en su propia petición, para que ningún cuerpo
 * pase el límite de ~4.5 MB de Vercel. El XML sigue entrando por
 * subir-factura, que lo valida. El PDF no se valida (T1): basta con que exista.
 */
import {
  createDocumentoCuentaCobrar,
  createDocumentoCuentaPagar,
  getCuentaCobrarById,
  getCuentaPagarById,
  getCuentaPagarGrupoById,
  getProyectoById,
} from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { SubirArchivoCuentaSchema, validate } from '@/lib/validation/schemas'

export type DestinoArchivo = 'cobro' | 'grupo' | 'cuenta'

const TIPO_POR_DESTINO = { cobro: 'FACTURA_PDF', grupo: 'FACTURA_PROVEEDOR', cuenta: 'FACTURA_PROVEEDOR' } as const

export async function subirArchivoCuenta(params: { destino: DestinoArchivo; id: string; formData: FormData; request: Request }): Promise<{ status: number; body: unknown }> {
  const { destino, id, formData, request } = params
  const validation = validate(SubirArchivoCuentaSchema, { tipo: formData.get('tipo') })
  if (!validation.ok) return { status: 400, body: { error: validation.error } }
  if (validation.data.tipo !== TIPO_POR_DESTINO[destino]) return { status: 400, body: { error: 'Tipo de documento inválido para esta cuenta' } }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return { status: 400, body: { error: 'Se requiere el archivo PDF' } }
  if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) return { status: 400, body: { error: 'El archivo debe ser PDF' } }
  if (archivo.size > MAX_FILE_SIZE) return { status: 400, body: { error: MENSAJE_LIMITE } }

  let carpeta: string
  let proyectoId: string | null
  if (destino === 'cobro') {
    const cuenta = await getCuentaCobrarById(id)
    if (!cuenta) return { status: 404, body: { error: 'Cuenta por cobrar no encontrada' } }
    carpeta = `/Por Cobrar/${cuenta.cotizacion_id}`
    proyectoId = cuenta.proyecto_id ?? null
  } else if (destino === 'grupo') {
    const grupo = await getCuentaPagarGrupoById(id)
    if (!grupo) return { status: 404, body: { error: 'Grupo de cuentas por pagar no encontrado' } }
    carpeta = `/Por Pagar/${grupo.proyecto_id}`
    proyectoId = grupo.proyecto_id
  } else {
    const cuenta = await getCuentaPagarById(id)
    if (!cuenta) return { status: 404, body: { error: 'Cuenta por pagar no encontrada' } }
    if (cuenta.grupo_id) return { status: 409, body: { error: 'cuenta_en_grupo', message: 'Esta cuenta pertenece a un grupo de facturación: sube el archivo al grupo.' } }
    carpeta = `/Por Pagar/${cuenta.cotizacion_id}`
    proyectoId = cuenta.proyecto_id
  }

  const googleEnv = getGoogleEnv()
  if (!googleEnv) return { status: 500, body: { error: 'Google Drive no configurado' } }
  const proyecto = proyectoId ? await getProyectoById(proyectoId) : null
  const folderPath = proyecto ? `${carpeta}-${proyecto.proyecto}` : carpeta
  const url = await uploadFileToDrive(archivo, folderPath, archivo.name, resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined))

  const documento =
    destino === 'cobro'
      ? await createDocumentoCuentaCobrar({ cuentas_cobrar_id: id, tipo: 'FACTURA_PDF', archivo_url: url, archivo_nombre: archivo.name })
      : await createDocumentoCuentaPagar({
          ...(destino === 'grupo' ? { grupo_id: id } : { cuentas_pagar_id: id }),
          tipo: 'FACTURA_PROVEEDOR',
          archivo_url: url,
          archivo_nombre: archivo.name,
        })
  return { status: 201, body: { documento } }
}
