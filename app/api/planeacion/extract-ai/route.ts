import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Extraes eventos de mensajes informales para una productora audiovisual mexicana. Los mensajes vienen de correos, WhatsApp o Slack.

Definición de campos:
- "proyecto": nombre del artista, banda o show. NO es un lugar. Si el mensaje menciona un artista, asígnalo a todos los eventos relacionados.
- "locacion": el venue o lugar específico del evento (escuela, foro, arena, metro, etc.). NO es la ciudad.
- "ciudad": solo la ciudad o zona geográfica (CDMX, MTY, EDO MEX, Toluca, GDL, Chalco, etc.).
- "fecha": la fecha tal como aparece en el texto. No normalices. Año actual: 2026.
- "action": "confirmado" por default. Solo usa "por_confirmar" si el texto dice explícitamente pendiente/por confirmar/a reserva. Solo "cancelado" si dice cancelado/pospuesto.
- "notas": información relevante del mensaje sobre este evento específico. Copia el texto original, no parafrasees. Incluye: requerimientos técnicos, restricciones, fechas alternativas, comentarios sobre disponibilidad o cualquier contexto importante.
- "confidence": 0.9+ datos claros, 0.7 prosa con detalles, 0.5 fechas tentativas.

Retorna SOLO JSON válido, sin markdown ni explicaciones:
{
  "events": [
    {
      "raw": "texto fuente",
      "fecha": "fecha" o null,
      "locacion": "venue" o null,
      "ciudad": "ciudad" o null,
      "proyecto": "artista/banda" o null,
      "action": "confirmado" | "por_confirmar" | "cancelado",
      "notas": "texto copiado del mensaje" o null,
      "confidence": 0.0-1.0
    }
  ],
  "notasContextuales": {}
}`

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACT_PROMPT,
      messages: [{
        role: 'user',
        content: text,
      }],
    })

    const content = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Extract JSON object or array from response
    let events = []
    let notasContextuales: { [key: string]: string } = {}

    // Try parsing as object with events and notasContextuales
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.events && Array.isArray(parsed.events)) {
          events = parsed.events
          notasContextuales = parsed.notasContextuales || {}
        } else if (Array.isArray(parsed)) {
          events = parsed
        }
      } else {
        // Try array format (fallback)
        const arrayMatch = content.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          events = JSON.parse(arrayMatch[0])
        }
      }
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError)
      return Response.json({ events: [], notasContextuales: {}, method: 'ai-error' }, { status: 500 })
    }

    if (!events || events.length === 0) {
      return Response.json({ events: [], notasContextuales: {}, method: 'ai' })
    }

    // Log usage
    const tokensInput = response.usage.input_tokens
    const tokensOutput = response.usage.output_tokens
    const costUSD = (tokensInput * 3 + tokensOutput * 15) / 1_000_000 // Sonnet pricing

    try {
      await supabaseAdmin.from('extraction_logs').insert({
        proyecto_id: 'serenata-erp', // TODO: get from session/context
        metodo: 'ai',
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        costo_usd: costUSD.toFixed(6),
        eventos_extraidos: events.length,
        raw_input: text.substring(0, 500), // Store first 500 chars
      })
    } catch (logError) {
      console.error('Error logging usage:', logError)
      // Don't fail the request if logging fails
    }

    return Response.json({ events, notasContextuales, method: 'ai' })
  } catch (error) {
    console.error('Error extracting events with AI:', error)
    return Response.json({ events: [], notasContextuales: {}, method: 'ai-error' }, { status: 500 })
  }
}
