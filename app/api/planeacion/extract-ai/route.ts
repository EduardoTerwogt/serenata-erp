import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un asistente experto en extraer información de eventos de mensajes de texto.

Tu tarea: analizar el mensaje y extraer TODOS los eventos mencionados, sin importar el formato.

Para cada evento, retorna un JSON con:
- raw: texto que describe este evento
- fecha: la fecha del evento (ej: "17 abril", "6 de mayo", "13/4"), o null
- locacion: el lugar/venue específico (no la ciudad), o null
- ciudad: ciudad/estado mencionado, o null
- proyecto: nombre del proyecto/artista si se menciona, o null
- action: "confirmado" si el evento va a ocurrir, "por_confirmar" si hay duda/condición, "cancelado" si fue cancelado
- notas: información importante específica de este evento (duración, detalles especiales), o null
- confidence: qué tan seguro estás (0-1, donde 1 es muy claro)

GUÍAS DE INTERPRETACIÓN (confía en tu entendimiento):
- Un evento = una fecha específica + información relevante
- El proyecto puede detectarse de múltiples formas: listados, "con [proyecto]", "para [proyecto]", "@[persona]"
- El estado (action): es "confirmado" si suena que el evento ocurrirá, "por_confirmar" si hay condiciones/dudas, "cancelado" si fue cancelado
- Las notas capturan detalles importantes: duración, equipment, advertencias especiales, cambios de planes
- Sé flexible con formatos: tablas, listas, párrafos, WhatsApp informales, todo vale

SOBRE NOTAS CONTEXTUALES (campo separado):
Si hay frases informativas que aplican a múltiples eventos, guárdalas en "notasContextuales":
- Ejemplo: "contaremos con pantallas para todos" → aplica a TODOS
- Ejemplo: "para las fechas del 16, 22, 29 será con otro proveedor" → aplica a esas 3 fechas
- Formato: { "2026-05-06": "nota específica", "2026-04-17": "nota general" }

RESPUESTA EN JSON VÁLIDO:
{
  "events": [
    {"raw": "...", "fecha": "...", "locacion": "...", "ciudad": "...", "proyecto": "...", "action": "...", "notas": "...", "confidence": 0.9}
  ],
  "notasContextuales": {"2026-05-06": "nota", ...}
}

Responde SOLO con JSON, sin texto adicional.`

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
    const costUSD = (tokensInput * 0.0008 + tokensOutput * 0.004) / 1000 // Haiku pricing

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
