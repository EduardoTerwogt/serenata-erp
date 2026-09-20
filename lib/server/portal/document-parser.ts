import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { RegimenFiscal } from '@/lib/types'

// Fase 5.5 -- lee INE/constancia de situación fiscal subidos en el signup
// del Portal para extraer el nombre legal (y, de la constancia, el régimen
// fiscal si es legible) y así poder cruzarlos contra los proveedores que
// staff ya cargó (ver match_proveedor_por_nombre). Mismo SDK/modelo que ya
// usa app/api/planeacion/extract-ai/route.ts para estructurar texto libre
// -- aquí el documento va como bloque de imagen/PDF en vez de texto plano.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DatosIdentidadSchema = z.object({
  nombre_completo: z.string().min(1).nullable(),
  regimen_fiscal: z.enum(['moral', 'fisica', 'resico']).nullable(),
})

export interface DatosIdentidadDocumento {
  nombre_completo: string | null
  regimen_fiscal: RegimenFiscal | null
}

const SIN_DATOS: DatosIdentidadDocumento = { nombre_completo: null, regimen_fiscal: null }

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

const PROMPT = `Lees documentos de identidad/fiscales mexicanos (INE, Constancia de Situación Fiscal del SAT) para un portal de proveedores. Extrae SOLO lo que el documento diga explícitamente -- nunca inventes ni infieras si no está claramente visible.

- "nombre_completo": el nombre legal completo tal como aparece en el documento (nombre(s) + apellidos). null si no es legible o el documento no es de este tipo.
- "regimen_fiscal": SOLO si el documento es una Constancia de Situación Fiscal y el régimen es identificable -- "moral" si dice "Personas Morales" o similar; "resico" si dice "Régimen Simplificado de Confianza" o "RESICO" (persona física); "fisica" si dice "Persona Física" con cualquier otro régimen (ej. "Actividades Empresariales y Profesionales", honorarios) y NO menciona RESICO. null si no aplica o no es legible (ej. si el documento es un INE, siempre null aquí).

Retorna SOLO JSON válido, sin markdown ni explicaciones:
{"nombre_completo": "..." o null, "regimen_fiscal": "moral" | "fisica" | "resico" | null}`

/**
 * Nunca tira error que bloquee el signup -- si Claude no está configurado,
 * el documento no es un tipo soportado, o la respuesta no es un JSON
 * válido, retorna null en ambos campos y el caller usa el nombre que el
 * proveedor tecleó a mano como respaldo.
 */
export async function extraerDatosIdentidad(file: File): Promise<DatosIdentidadDocumento> {
  if (!process.env.ANTHROPIC_API_KEY) return SIN_DATOS

  const isPdf = file.type === 'application/pdf'
  const isSupportedImage = SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)
  if (!isPdf && !isSupportedImage) return SIN_DATOS

  try {
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const documentContent: Anthropic.Messages.ContentBlockParam = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type as SupportedImageType, data: base64 } }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    let response: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      response = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: PROMPT,
          messages: [
            {
              role: 'user',
              content: [documentContent, { type: 'text', text: 'Extrae los datos de este documento.' }],
            },
          ],
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    const content = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return SIN_DATOS

    const parsed = JSON.parse(jsonMatch[0])
    const validated = DatosIdentidadSchema.safeParse(parsed)
    if (!validated.success) return SIN_DATOS

    return validated.data
  } catch (err) {
    console.error('[portal/document-parser] Error extrayendo datos de identidad:', err)
    return SIN_DATOS
  }
}
