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
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { EstadoValidacionDocumento, TipoDocumentoProveedor } from '@/lib/types'

const ROUTE_GET = 'GET /api/portal/documentos'
const ROUTE_POST = 'POST /api/portal/documentos'

const TIPOS_VALIDOS: TipoDocumentoProveedor[] = [
  'CONSTANCIA_SITUACION_FISCAL',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'COMPROBANTE_BANCARIO',
]

// Solo estos dos disparan extracción por IA (document-parser.ts) --
// comprobante de domicilio/bancario no traen un nombre legal ni régimen
// fiscal útil para leer. OJO: esto ya NO significa que ambos validen
// identidad -- ver TIPOS_CON_MATCHING_IDENTIDAD abajo.
const TIPOS_CON_EXTRACCION_IA: TipoDocumentoProveedor[] = ['INE', 'CONSTANCIA_SITUACION_FISCAL']
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const documentos = await getProveedorDocumentos(portalAuth.proveedorId)
    return Response.json({ documentos })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_GET)
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

    // Matching de identidad (Fase 5.5): se dispara aquí, no en el signup --
    // el proveedor se registra ligero (correo/password/alias) y el nombre
    // legal + el cruce contra proveedores ya cargados por staff llegan
    // cuando sube su INE. La lectura del documento nunca bloquea la subida
    // (ver document-parser.ts) -- si falla, el documento igual queda
    // guardado, simplemente no se dispara matching esta vez.
    //
    // Bug real (2026-09-20): el matching corría también con la Constancia
    // de Situación Fiscal. Hay proveedores que facturan por medio de
    // terceros (el RFC/nombre de la constancia es el de un intermediario,
    // no el de la persona que realmente colabora con Serenata) -- cruzar
    // por ese nombre fusionaba o pedía confirmar la cuenta equivocada. La
    // identidad SOLO se valida con una identificación oficial (INE hoy;
    // pasaporte/otra oficial si se agrega un tipo de documento para eso).
    // La constancia sigue disparando extracción (para regimen_fiscal), solo
    // deja de alimentar el matching.
    let requiereConfirmacion = false
    // Punto 2 (2026-09-20): auto-clasificación híbrida -- la misma lectura
    // de IA que ya corre para matching/régimen también clasifica el
    // documento. 'validado' si se pudo leer el dato esperado, 'revision'
    // (con motivo) si no. Comprobante de domicilio/bancario no pasan por
    // IA (el prompt de document-parser.ts es específico a identidad/fiscal,
    // no a otros tipos) -- se quedan en 'pendiente' hasta que staff los
    // revise a mano. Staff siempre puede corregir cualquier estado después
    // (ver PATCH /api/proveedores/[id]/documentos/[docId]).
    let estadoValidacion: EstadoValidacionDocumento = 'pendiente'
    let detalleValidacion: string | null = null
    if (TIPOS_CON_EXTRACCION_IA.includes(tipo as TipoDocumentoProveedor)) {
      const proveedorActual = await getProveedorById(portalAuth.proveedorId)
      const esConstancia = tipo === 'CONSTANCIA_SITUACION_FISCAL'
      const esIne = tipo === 'INE'
      const activo = proveedorActual?.portal_estado === 'activo'

      if (activo || esConstancia) {
        const datos = await extraerDatosIdentidad(file)

        if (esIne && activo && datos.nombre_completo) {
          const candidatos = await buscarCandidatosMatch(datos.nombre_completo, portalAuth.proveedorId)
          if (candidatos.length > 0) {
            await updateProveedor(portalAuth.proveedorId, {
              portal_estado: 'pendiente_confirmacion',
              match_candidato_id: candidatos[0].id,
            })
            requiereConfirmacion = true
          }
        }

        // La Constancia de Situación Fiscal es la única fuente confiable
        // del régimen fiscal real -- se persiste automáticamente cuando el
        // proveedor todavía no tiene uno asignado, nunca pisando un valor
        // que staff ya haya corregido/confirmado a mano.
        if (esConstancia && datos.regimen_fiscal && !proveedorActual?.regimen_fiscal) {
          await updateProveedor(portalAuth.proveedorId, { regimen_fiscal: datos.regimen_fiscal })
        }

        if (esIne) {
          estadoValidacion = datos.nombre_completo ? 'validado' : 'revision'
          detalleValidacion = datos.nombre_completo
            ? null
            : 'No se pudo leer el nombre completo en el documento -- confirma que sea una identificación oficial legible.'
        } else if (esConstancia) {
          estadoValidacion = datos.regimen_fiscal ? 'validado' : 'revision'
          detalleValidacion = datos.regimen_fiscal
            ? null
            : 'No se pudo leer el régimen fiscal en el documento -- confirma que sea la Constancia de Situación Fiscal vigente.'
        }
      }
    }

    const documento = await createProveedorDocumento({
      proveedor_id: portalAuth.proveedorId,
      tipo: tipo as TipoDocumentoProveedor,
      archivo_url: archivoUrl,
      archivo_nombre: file.name,
      estado_validacion: estadoValidacion,
      detalle_validacion: detalleValidacion,
    })

    return Response.json({ success: true, documento, requiere_confirmacion: requiereConfirmacion })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_POST)
  }
}
