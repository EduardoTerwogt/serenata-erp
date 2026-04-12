import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un asistente experto en extraer información de eventos de mensajes de texto informales/complejos.

Tu tarea: analizar el mensaje y extraer TODOS los eventos mencionados, sin importar el formato.

Para cada evento, retorna JSON con estos campos:
- raw: texto que describe este evento
- fecha: la fecha del evento (ej: "17 abril", "6 de mayo", "13/4"), o null
- locacion: lugar/venue específico (no la ciudad), o null
- ciudad: ciudad/estado mencionado, o null
- proyecto: nombre del proyecto/artista, o null
- action: "confirmado" | "por_confirmar" | "cancelado"
- notas: información específica de este evento (duración, equipment, cambios especiales), o null
- confidence: 0-1 (donde 1 = muy claro)

CÓMO INTERPRETAR (confía en tu entendimiento):

1. DETECTA EVENTOS en cualquier formato:
   - Tabla: "8 abril | CDMX, Fes Aragón" → evento confirmado
   - Lista: "17 abril / 23 abril (pendiente)" → detecta fechas y estados
   - Párrafos: "evento el 6 de mayo en Anahuac Sur" → extrae fecha + ubicación
   - Listas simples: "Low Clika\n17 abril\n23 abril\nDestino\n16 abril" → agrupa por proyecto

2. DETECTA PROYECTO de múltiples formas:
   - Listado explícito: "Low Clika\n17 abril\n23 abril" → proyecto es "Low Clika"
   - Mención directa: "con Danna", "para Low Clika", "evento Low Clika"
   - Contexto: "@[persona]" o proyecto mencionado en párrafo introductorio

3. INTERPRETA ACTION basado en lenguaje:
   - "confirmado", "confirmada", "confirmada" → action: confirmado
   - "(pendiente)", "por confirmar", "se confirma hasta..." → action: por_confirmar
   - "cancelado", "pospuesto" → action: cancelado
   - En tabla o listado sin marca → por defecto: confirmado
   - Indicadores: "si...", "aunque...", "hasta que..." → por_confirmar

4. CAPTURA NOTAS importantes específicas del evento:
   - Duración: "45 minutos, de 5:05 p.m. a 5:50 p.m."
   - Detalles: "No habrá video, pero sí iluminación"
   - Advertencias: "una cita importante, no podrá asistir"
   - Son notas del EVENTO ESPECÍFICO, no generales

NOTAS CONTEXTUALES (campo separado):
Si hay frases que aplican a múltiples eventos O a un grupo específico, guárdalas en "notasContextuales":
- Ejemplo: "para las fechas del 16, 22, 29 será con otro proveedor" → {"2026-04-16": "...", "2026-04-22": "...", "2026-04-29": "..."}
- Ejemplo: "contaremos con pantallas y otro rider" (sin fecha) → aplica a TODAS las fechas: {"2026-04-17": "...", "2026-04-23": "...", ...}
- Nota ESPECÍFICA de una fecha va en campo "notas" del evento, NO en notasContextuales

ESTRUCTURA JSON:
{
  "events": [
    {"raw": "...", "fecha": "17 abril", "locacion": "...", "ciudad": "...", "proyecto": "Low Clika", "action": "confirmado", "notas": null, "confidence": 0.95}
  ],
  "notasContextuales": {"2026-05-06": "detalles importantes"}
}

Responde SOLO con JSON válido, sin texto adicional.`

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
