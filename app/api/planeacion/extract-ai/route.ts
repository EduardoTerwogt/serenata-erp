import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un extractor de datos de eventos para una productora audiovisual/musical.

Extrae TODOS los eventos del texto que contienen fecha de evento. Para cada evento retorna:
- raw: copia del texto relevante
- fecha: string como "23 abril", "23/04", o null si no hay
- locacion: nombre del venue/escuela/sala/lugar específico (NO la ciudad), o null
- ciudad: ciudad si se menciona explícitamente, o null
- proyecto: nombre del proyecto detectado (null si no se encuentra), ver REGLAS DE PROYECTO
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

REGLAS DE PROYECTO:
- Busca palabras CAPITALIZADAS que representen proyectos (ej: "Low Clika", "Destino", "YMCA", "MICRODRAMA")
- Pueden estar al inicio del mensaje (título) o mencionadas en párrafos: "actualizaciones para Low Clika"
- TAMBIÉN DEDUCE por contexto: si dice "con Danna" o "para Danna" → proyecto es "Danna"
- Si NO encuentra proyecto explícito ni contexto, retorna null
- NO inventes proyectos, SÍ hay duda, retorna null

DETECCIÓN DE NOTAS CONTEXTUALES:
- Busca párrafos explicativos que aplican a uno o más eventos específicos
- IMPORTANTE: La nota debe MENCIONAR EXPLÍCITAMENTE las fechas a las que aplica
- Ejemplos:
  * "Las fechas del metro, pero en especial la del 28 de mayo..." → nota solo para 28 mayo
  * "16 abril, 22 abril, 29 abril y 13 mayo... Esto será con otro proveedor..." → nota para esas 4 fechas
  * "Contaremos con pantallas" sin mencionar fechas → NO INCLUIR como nota contextual
- Retorna en campo adicional "notasContextuales" (objeto con fechas ISO como claves):
  {"2026-05-28": "Las fechas del metro, pero en especial...", "2026-04-16": "Esto será con otro proveedor..."}
- Si misma nota aplica a múltiples fechas, duplica la entrada:
  {"2026-04-16": "...", "2026-04-22": "...", "2026-04-29": "..."}

Responde SOLO con JSON válido, sin texto adicional. Estructura:
{
  "events": [{"raw":"...","fecha":"...","locacion":"...","ciudad":"...","proyecto":"...","action":"...","notas":"...","confidence":0.9}],
  "notasContextuales": {"2026-05-28": "...", "2026-04-16": "..."}
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
