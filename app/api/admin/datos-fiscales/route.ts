import { requireSection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { validarConstancia } from '@/lib/server/cuentas/constancia-serenata'
import { datosFiscalesVigentes, historialDatosFiscales, invalidarCacheDatosFiscales } from '@/lib/server/cuentas/datos-fiscales'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { leerDatosMultipart } from '@/lib/server/uploads/datos-multipart'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { DatosFiscalesGuardarSchema, DatosFiscalesToleranciaSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'datos-fiscales'
const TIPOS_CONSTANCIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** #123 (B6a): la constancia vigente de Serenata y el historial de las anteriores. Solo lectura. */
export async function GET() {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response
  try {
    const [vigente, historial] = await Promise.all([datosFiscalesVigentes(), historialDatosFiscales()])
    return Response.json({ vigente, historial })
  } catch (error) {
    return buildErrorResponse(error, `GET /api/admin/${ROUTE}`)
  }
}

/**
 * Guarda una constancia nueva: la anterior pasa a historial. Multipart: `constancia` (PDF o imagen, ≤ 4 MB) y `datos`
 * (JSON con lo leído y confirmado). El servidor vuelve a validar (estructura del RFC, razón social): un dato inválido
 * no se guarda aunque el cliente diga que lo confirmó. El PDF va a Drive (si está configurado) y el alta es una sola
 * transacción (RPC).
 */
export async function POST(request: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response
  const ruta = `POST /api/admin/${ROUTE}`

  try {
    const formData = await request.formData()
    const constancia = formData.get('constancia')
    if (!(constancia instanceof File) || constancia.size === 0) return Response.json({ error: 'Falta el archivo de la constancia' }, { status: 400 })
    if (!TIPOS_CONSTANCIA.includes(constancia.type)) return Response.json({ error: 'La constancia debe ser un PDF o una imagen' }, { status: 400 })
    if (constancia.size > MAX_FILE_SIZE) return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })

    const datos = leerDatosMultipart(formData)
    if (!datos.ok) return Response.json({ error: datos.error }, { status: 400 })
    const validation = validate(DatosFiscalesGuardarSchema, datos.data)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const d = validation.data

    const revision = validarConstancia({ rfc: d.rfc, razon_social: d.razon_social, regimen_fiscal: d.regimen_fiscal ?? null, codigo_postal: d.codigo_postal ?? null })
    if (!revision.ok) return Response.json({ error: 'constancia_invalida', message: revision.errores.join(' ') }, { status: 400 })

    // El archivo va a Drive. Si Drive no está configurado en este entorno (p. ej. un Preview) lo importante son los datos:
    // se guardan igual y se avisa que el archivo no se guardó. Si Drive SÍ está configurado y la subida falla, no se
    // guarda nada (el error sube tal cual): no queda una constancia sin su archivo por una falla pasajera.
    const advertencias = [...revision.advertencias]
    let url: string | null = null
    const googleEnv = getGoogleEnv()
    if (googleEnv) {
      url = await uploadFileToDrive(constancia, 'Datos fiscales Serenata', constancia.name, googleEnv.driveFolderIdCuentas || undefined)
    } else {
      advertencias.push('Google Drive no está configurado en este entorno: se guardaron los datos, pero no el archivo de la constancia.')
    }

    const { error } = await supabaseAdmin.rpc('guardar_datos_fiscales_serenata', {
      p_rfc: revision.rfc,
      p_razon_social: d.razon_social,
      p_regimen_fiscal: d.regimen_fiscal ?? null,
      p_codigo_postal: d.codigo_postal ?? null,
      p_constancia_url: url,
      p_constancia_nombre: constancia.name,
      p_usuario: authResult.session?.user?.email ?? null,
    })
    if (error) {
      if (error.code === 'P1413') return Response.json({ error: 'constancia_invalida', message: error.message.split(': ').slice(1).join(': ') || 'Los datos no son válidos' }, { status: 400 })
      throw error
    }
    invalidarCacheDatosFiscales()
    return Response.json({ vigente: await datosFiscalesVigentes(), advertencias }, { status: 201 })
  } catch (error) {
    return buildErrorResponse(error, ruta)
  }
}

/**
 * #130 (Q7): tolerancia en pesos del match de una factura por su total. Vive en la constancia vigente (cada constancia
 * nueva la hereda) y se cambia aquí, no por deploy. JSON: `{ tolerancia_total }`.
 */
export async function PATCH(request: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response
  const ruta = `PATCH /api/admin/${ROUTE}`

  try {
    const validation = validate(DatosFiscalesToleranciaSchema, await request.json().catch(() => null))
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const { error } = await supabaseAdmin.rpc('guardar_tolerancia_total', {
      p_valor: validation.data.tolerancia_total,
      p_usuario: authResult.session?.user?.email ?? null,
    })
    if (error) {
      if (error.code === 'P1413') return Response.json({ error: 'tolerancia_invalida', message: error.message.split(': ').slice(1).join(': ') || 'La tolerancia no es válida' }, { status: 409 })
      throw error
    }
    invalidarCacheDatosFiscales()
    return Response.json({ vigente: await datosFiscalesVigentes() })
  } catch (error) {
    return buildErrorResponse(error, ruta)
  }
}
