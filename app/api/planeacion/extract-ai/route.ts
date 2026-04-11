import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un extractor de datos de eventos para una productora audiovisual/musical.

Extrae TODOS los eventos del texto que contienen fecha de evento. Para cada evento retorna:
- raw: copia del texto relevante
- fecha: string como "23 abril", "23/04", o null si no hay
- locacion: nombre del venue/escuela/sala/lugar específico (NO la ciudad), o null
- ciudad: ciudad si se menciona explícitamente, o null
- action: "confirmado" | "por_confirmar" | "cancelado"
- notas: info extra (para la gira, pendiente de detalles, etc), o null
- confidence: número 0-1 (1 = muy claro)

REGLAS DE ACTION:
- "Confirmo:", "confirmado", "confirmada", "visto bueno" → "confirmado"
- "cancelado", "cancelada", "pospuesto" → "cancelado"
- "pendiente", "por confirmar", "a reserva", "detalles por definir", incertidumbre → "por_confirmar"
- Por default si no está claro → "por_confirmar"
- cancelado gana sobre confirmado si hay señales contradictorias

REGLAS DE EXTRACCIÓN:
- Ignora saludos, cierres y texto sin fechas
- Si varias líneas describen UN solo evento (fecha en una línea, venue en la siguiente), júntalas como 1 evento
- Separa ciudad de venue: "CDMX, FES Aragón" → ciudad=CDMX, locacion=FES Aragón
- Extracta venue de frases como "en el Barco Utopía", "en Arena CDMX"

Responde SOLO con JSON válido, sin texto adicional:
[{"raw":"...","fecha":"...","locacion":"...","ciudad":"...","action":"...","notas":"...","confidence":0.9}]`

export async function POST(request: Request) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { text } = body

    if (!text?.trim()) {
      return Response.json([])
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `${EXTRACT_PROMPT}\n\nTEXTO:\n${text}`,
      }],
    })

    const content = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return Response.json([])

    const events = JSON.parse(jsonMatch[0])
    return Response.json(events)
  } catch (error) {
    console.error('Error extracting events with AI:', error)
    return Response.json([], { status: 500 })
  }
}
