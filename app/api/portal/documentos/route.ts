import { requirePortalSession } from '@/lib/portal-auth'
import { createProveedorDocumento, getProveedorDocumentos } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { TipoDocumentoProveedor } from '@/lib/types'

const TIPOS_VALIDOS: TipoDocumentoProveedor[] = [
  'CONSTANCIA_SITUACION_FISCAL',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'COMPROBANTE_BANCARIO',
]
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

    return Response.json({ success: true, documento })
  } catch (error) {
    console.error('[portal/documentos]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
