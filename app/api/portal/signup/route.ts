import { hashPassword } from '@/lib/auth-utils'
import { validate, PortalSignupSchema } from '@/lib/validation/schemas'
import {
  crearProveedorDesdeSignup,
  buscarCandidatosMatch,
  createProveedorDocumento,
  getProveedorByCorreo,
  updateProveedor,
} from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { extraerDatosIdentidad } from '@/lib/server/portal/document-parser'
import { setPortalSessionCookie } from '@/lib/portal-auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function validarArchivo(file: File | null, campo: string): string | null {
  if (!file) return `Se requiere ${campo}`
  if (!ALLOWED_TYPES.includes(file.type)) return `${campo}: formato no soportado (usa JPG, PNG o PDF)`
  if (file.size > MAX_FILE_SIZE) return `${campo}: excede el límite de 10 MB`
  return null
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const parsed = validate(PortalSignupSchema, {
      nombre: formData.get('nombre'),
      correo: formData.get('correo'),
      password: formData.get('password'),
    })
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const { nombre, correo, password } = parsed.data

    const ineFile = formData.get('ine') as File | null
    const constanciaFile = formData.get('constancia') as File | null
    const errorIne = validarArchivo(ineFile, 'INE')
    if (errorIne) return Response.json({ error: errorIne }, { status: 400 })
    const errorConstancia = validarArchivo(constanciaFile, 'Constancia de situación fiscal')
    if (errorConstancia) return Response.json({ error: errorConstancia }, { status: 400 })

    const existente = await getProveedorByCorreo(correo)
    if (existente) {
      return Response.json({ error: 'Ya existe una cuenta de portal con ese correo' }, { status: 409 })
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    // La lectura de documentos nunca bloquea el signup (ver document-parser.ts)
    // -- si Claude no puede leerlos, se usa el nombre tecleado a mano.
    const [datosIne, datosConstancia] = await Promise.all([
      extraerDatosIdentidad(ineFile as File),
      extraerDatosIdentidad(constanciaFile as File),
    ])
    const nombreParaMatch = datosIne.nombre_completo || datosConstancia.nombre_completo || nombre
    const regimenFiscal = datosConstancia.regimen_fiscal

    const passwordHash = await hashPassword(password)
    const proveedor = await crearProveedorDesdeSignup({
      nombre,
      correo,
      password_hash: passwordHash,
      regimen_fiscal: regimenFiscal,
    })

    const folderPath = `/Proveedores/${nombre}`
    const [ineUrl, constanciaUrl] = await Promise.all([
      uploadFileToDrive(ineFile as File, folderPath, (ineFile as File).name, googleEnv.driveFolderId),
      uploadFileToDrive(constanciaFile as File, folderPath, (constanciaFile as File).name, googleEnv.driveFolderId),
    ])
    await Promise.all([
      createProveedorDocumento({
        proveedor_id: proveedor.id,
        tipo: 'INE',
        archivo_url: ineUrl,
        archivo_nombre: (ineFile as File).name,
      }),
      createProveedorDocumento({
        proveedor_id: proveedor.id,
        tipo: 'CONSTANCIA_SITUACION_FISCAL',
        archivo_url: constanciaUrl,
        archivo_nombre: (constanciaFile as File).name,
      }),
    ])

    const candidatos = await buscarCandidatosMatch(nombreParaMatch, proveedor.id)

    let requiereConfirmacion = false
    if (candidatos.length > 0) {
      await updateProveedor(proveedor.id, {
        portal_estado: 'pendiente_confirmacion',
        match_candidato_id: candidatos[0].id,
      })
      requiereConfirmacion = true
    }

    await setPortalSessionCookie(proveedor.id)

    return Response.json({
      success: true,
      requiere_confirmacion: requiereConfirmacion,
      candidatos: requiereConfirmacion ? candidatos : [],
    })
  } catch (error) {
    console.error('[portal/signup]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
