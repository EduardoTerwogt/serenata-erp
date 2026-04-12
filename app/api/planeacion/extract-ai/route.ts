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

REGLAS DE ACCIÓN:
- "Confirmo:", "confirmado", "confirmada", "visto bueno" → "confirmado"
- "cancelado", "cancelada", "pospuesto" → "cancelado"
- "pendiente", "por confirmar", "a reserva", "detalles por definir", incertidumbre → "por_confirmar"
- Por default si no está claro → "por_confirmar"
- cancelado gana sobre confirmado si hay señales contradictorias

REGLAS CRÍTICAS DE EXTRACCIÓN (IMPORTANTE - EVITA SPLITEAR):
- UNA fecha + UNA locación = UN SOLO evento (aunque tenga proyecto, notas o varias partes en el texto)
- Ejemplo: "27 de abril en foro niEBLA CON low, importante solicitar rider" → 1 evento (NO 2)
- Si varias líneas describen UN solo evento (fecha en una línea, venue en siguiente, proyecto en tercera), júntalas como 1 único evento
- Ignora saludos, cierres y texto sin fechas
- Separa ciudad de venue: "CDMX, FES Aragón" → ciudad=CDMX, locacion=FES Aragón
- Extracta venue de frases como "en el Barco Utopía", "en Arena CDMX", "en foro niEBLA"

REGLAS DE PROYECTO:
- Busca palabras CAPITALIZADAS o después de "CON"/"PARA" (ej: "Low Clika", "Destino", "YMCA", "MICRODRAMA", "Low", "low")
- Pueden estar: al inicio, mencionadas con "CON proyecto" o "PARA proyecto", o en párrafos
- Ejemplos correctos:
  * "27 abril en foro CON low" → proyecto="low" (mismo evento, no 2)
  * "actualizaciones para Danna" → proyecto="Danna"
  * "Destino en CDMX" → proyecto="Destino"
- Si NO encuentra proyecto explícito, retorna null
- NO inventes proyectos, si hay duda, retorna null

DETECCIÓN DE NOTAS CONTEXTUALES:
- Busca frases informativas que aplican a uno o más eventos
- Dos tipos de asociación:
  1. Notas CON fechas específicas: Si menciona fechas explícitamente
     * "Las fechas del metro, pero en especial la del 28 de mayo..." → 28 mayo
     * "16 abril, 22 abril, 29 abril... Esto será con otro proveedor..." → esas 4 fechas
  2. Notas SIN fechas específicas: Si es contextual pero no menciona fecha
     * "Importante solicitar el rider del lugar" → aplica a TODOS los eventos
     * "Contaremos con pantallas y otro rider" → aplica a TODOS los eventos
     * "Detalles por confirmar" → aplica a TODOS los eventos
- Retorna en campo "notasContextuales" (objeto con fechas ISO como claves):
  Para notas sin fecha: retorna TODAS las fechas encontradas en events
  {"2026-04-27": "Importante solicitar el rider...", "2026-05-28": "Importante solicitar el rider..."}
- Si misma nota aplica a múltiples fechas, duplica la entrada

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
