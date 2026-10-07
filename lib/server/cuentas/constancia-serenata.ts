/**
 * #123 (B6a): lectura y validación de la Constancia de Situación Fiscal de Serenata. La lectura usa el mismo lector
 * por IA que la constancia de un proveedor (`portal/document-parser.ts`: el PDF va como bloque `document`), pero
 * pidiendo también RFC, razón social y código postal; lo leído NUNCA se guarda solo: un administrador lo confirma
 * (y puede corregirlo) antes de guardarlo. La validación es determinista y vive aparte para poder probarla:
 * estructura del RFC, tipo de persona que implica su longitud (12 moral / 13 física) y consistencia con el régimen.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export interface DatosConstancia {
  rfc: string | null
  razon_social: string | null
  regimen_fiscal: string | null
  codigo_postal: string | null
}

export const SIN_LECTURA: DatosConstancia = { rfc: null, razon_social: null, regimen_fiscal: null, codigo_postal: null }

const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/

export interface ValidacionConstancia {
  /** Sin errores: se puede guardar. */
  ok: boolean
  rfc: string | null
  tipo_persona: 'moral' | 'fisica' | null
  /** Impiden guardar. */
  errores: string[]
  /** Se muestran para que el administrador las revise; no impiden guardar. */
  advertencias: string[]
}

export const normalizarRfcConstancia = (rfc: string | null | undefined) => (rfc ?? '').replace(/\s+/g, '').toUpperCase()

/** Régimen persona moral ("Régimen General de Ley Personas Morales", "Personas Morales con Fines no Lucrativos"…). */
const REGIMEN_MORAL = /personas?\s+morales?/i
/** Regímenes de persona física: honorarios, actividades empresariales, RESICO, arrendamiento, sueldos… */
const REGIMEN_FISICO = /(f[ií]sica|honorarios|actividades\s+empresariales|simplificado\s+de\s+confianza|resico|arrendamiento|sueldos|incorporaci[oó]n\s+fiscal)/i

export function validarConstancia(d: DatosConstancia): ValidacionConstancia {
  const errores: string[] = []
  const advertencias: string[] = []
  const rfc = normalizarRfcConstancia(d.rfc)
  let tipo: 'moral' | 'fisica' | null = null

  if (rfc === '') errores.push('Falta el RFC.')
  else if (!RFC.test(rfc)) errores.push(`El RFC "${rfc}" no tiene la estructura de un RFC (3 o 4 letras, 6 dígitos de fecha y 3 de homoclave).`)
  else tipo = rfc.length === 12 ? 'moral' : 'fisica'

  if (!d.razon_social || d.razon_social.trim() === '') errores.push('Falta la razón social (denominación o nombre).')

  const regimen = d.regimen_fiscal?.trim() ?? ''
  if (regimen === '') advertencias.push('No se leyó el régimen fiscal: confírmalo en la constancia.')
  else if (tipo === 'moral' && REGIMEN_FISICO.test(regimen) && !REGIMEN_MORAL.test(regimen)) {
    advertencias.push(`El RFC tiene 12 posiciones (persona moral) pero el régimen "${regimen}" es de persona física: revisa que el RFC y el régimen sean de la misma constancia.`)
  } else if (tipo === 'fisica' && REGIMEN_MORAL.test(regimen)) {
    advertencias.push(`El RFC tiene 13 posiciones (persona física) pero el régimen "${regimen}" es de persona moral: revisa que el RFC y el régimen sean de la misma constancia.`)
  }

  const cp = d.codigo_postal?.trim() ?? ''
  if (cp !== '' && !/^\d{5}$/.test(cp)) advertencias.push(`El código postal "${cp}" no tiene 5 dígitos.`)

  return { ok: errores.length === 0, rfc: rfc === '' ? null : rfc, tipo_persona: tipo, errores, advertencias }
}

const LecturaSchema = z.object({
  rfc: z.string().min(1).nullable(),
  razon_social: z.string().min(1).nullable(),
  regimen_fiscal: z.string().min(1).nullable(),
  codigo_postal: z.string().min(1).nullable(),
})

const PROMPT = `Lees la Constancia de Situación Fiscal del SAT de una empresa mexicana. Extrae SOLO lo que el documento diga explícitamente -- nunca inventes ni infieras.

- "rfc": el RFC de la constancia, tal cual (sin espacios). null si no es legible.
- "razon_social": la denominación o razón social (persona moral) o el nombre completo (persona física), tal como aparece. null si no es legible.
- "regimen_fiscal": el nombre del régimen fiscal vigente tal como aparece en la sección de Regímenes (si hay varios, el primero). null si no es legible.
- "codigo_postal": el código postal del domicilio fiscal (5 dígitos). null si no es legible.

Retorna SOLO JSON válido, sin markdown ni explicaciones:
{"rfc": "..." o null, "razon_social": "..." o null, "regimen_fiscal": "..." o null, "codigo_postal": "..." o null}`

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'] as const
type TipoImagen = (typeof TIPOS_IMAGEN)[number]

/**
 * Lee la constancia con IA. Si no hay clave, el archivo no es PDF/imagen o la respuesta no es JSON válido, devuelve
 * campos vacíos: el administrador captura los datos a mano (siempre puede) y la validación decide si se guardan.
 */
export async function extraerConstancia(file: File): Promise<DatosConstancia> {
  if (!process.env.ANTHROPIC_API_KEY) return SIN_LECTURA
  const esPdf = file.type === 'application/pdf'
  const esImagen = TIPOS_IMAGEN.includes(file.type as TipoImagen)
  if (!esPdf && !esImagen) return SIN_LECTURA

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const documento: Anthropic.Messages.ContentBlockParam = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type as TipoImagen, data: base64 } }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)
    let respuesta: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      respuesta = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: PROMPT,
          messages: [{ role: 'user', content: [documento, { type: 'text', text: 'Extrae los datos de esta constancia.' }] }],
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }
    const texto = respuesta.content[0].type === 'text' ? respuesta.content[0].text.trim() : ''
    const json = texto.match(/\{[\s\S]*\}/)
    if (!json) return SIN_LECTURA
    const leido = LecturaSchema.safeParse(JSON.parse(json[0]))
    return leido.success ? leido.data : SIN_LECTURA
  } catch (err) {
    console.error('[constancia-serenata] Error leyendo la constancia:', err)
    return SIN_LECTURA
  }
}
