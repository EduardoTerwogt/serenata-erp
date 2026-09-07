import { requirePortalSession } from '@/lib/portal-auth'
import {
  createProveedorDocumento,
  getProveedorDocumentos,
  getProveedorById,
  buscarCandidatosMatch,
  updateProveedor,
} from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { extraerDatosIdentidad } from '@/lib/server/portal/document-parser'
import { TipoDocumentoProveedor } from '@/lib/types'

const TIPOS_VALIDOS: TipoDocumentoProveedor[] = [
  'CONSTANCIA_SITUACION_FISCAL',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'COMPROBANTE_BANCARIO',
]

// Solo estos dos disparan el matching de identidad -- comprobante de
// domicilio/bancario no traen un nombre legal útil para cruzar.
const TIPOS_CON_IDENTIDAD: TipoDocumentoProveedor[] = ['INE', 'CONSTANCIA_SITUACION_FISCAL']
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const documentos = await getProveedorDocumentos(portalAuth.proveedorId)
    return Response.json({ documentos })
  } catch (error) {
    console.error('[portal/documentos]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const formData = await request.formData()
    const tipo = formData.get('tipo') as string | null
    const file = formData.get('archivo') as File | null

    if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoDocumentoProveedor)) {
      return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
    }
    if (!file) return Response.json({ error: 'Se requiere un archivo' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: 'Formato no soportado (usa JPG, PNG o PDF)' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'El archivo excede el límite de 10 MB' }, { status: 400 })
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const archivoUrl = await uploadFileToDrive(file, `/Proveedores/${portalAuth.proveedorId}`, file.name, googleEnv.driveFolderId)
    const documento = await createProveedorDocumento({
      proveedor_id: portalAuth.proveedorId,
      tipo: tipo as TipoDocumentoProveedor,
      archivo_url: archivoUrl,
      archivo_nombre: file.name,
    })

    // Matching de identidad (Fase 5.5): se dispara aquí, no en el signup --
    // el proveedor se registra ligero (correo/password/alias) y el nombre
    // legal + el cruce contra proveedores ya cargados por staff llegan
    // cuando sube su INE/constancia. La lectura del documento nunca bloquea
    // la subida (ver document-parser.ts) -- si falla, el documento igual
    // queda guardado, simplemente no se dispara matching esta vez.
    let requiereConfirmacion = false
    if (TIPOS_CON_IDENTIDAD.includes(tipo as TipoDocumentoProveedor)) {
      const proveedorActual = await getProveedorById(portalAuth.proveedorId)
      if (proveedorActual?.portal_estado === 'activo') {
        const datos = await extraerDatosIdentidad(file)
        if (datos.nombre_completo) {
          const candidatos = await buscarCandidatosMatch(datos.nombre_completo, portalAuth.proveedorId)
          if (candidatos.length > 0) {
            await updateProveedor(portalAuth.proveedorId, {
              portal_estado: 'pendiente_confirmacion',
              match_candidato_id: candidatos[0].id,
            })
            requiereConfirmacion = true
          }
        }
      }
    }

    return Response.json({ success: true, documento, requiere_confirmacion: requiereConfirmacion })
  } catch (error) {
    console.error('[portal/documentos]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
