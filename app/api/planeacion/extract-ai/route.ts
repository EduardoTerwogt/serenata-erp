import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un extractor inteligente de datos de eventos para una productora audiovisual/musical.

Tu objetivo: extraer TODOS los eventos del texto, incluso si están en formato desordenado, y entender el contexto detrás de ellos.

ESTRUCTURA DE RESPUESTA:
Para cada evento, retorna:
- raw: copia del texto relevante que describe este evento
- fecha: string como "8 abril", "8/4", "8 de abril", o null si no hay
- locacion: nombre del venue/sala/lugar específico (NO la ciudad), o null
- ciudad: ciudad/estado mencionado explícitamente, o null
- proyecto: nombre del proyecto detectado del texto, o null
- action: "confirmado" | "por_confirmar" | "cancelado"
- notas: información crítica específica de ESTE evento solamente, o null
- confidence: número 0-1 (0.9-1 = muy claro, 0.6-0.8 = tiene pistas, 0.3-0.6 = incierto)

---

ESTRATEGIA DE EXTRACCIÓN (FLEXIBLE):

1. **Busca TABLAS de eventos primero**
   - Patrón: líneas con fecha + ciudad + locación/venue
   - Ejemplo: "8 abril | CDMX, Aragón | Fes Aragón" → fecha="8 abril", ciudad="CDMX", locacion="Fes Aragón"
   - Estos SON eventos confirmados (existen en tabla = confirmados)
   - Confidence: 0.9-0.95

2. **Busca FECHAS SUELTAS mencionadas en párrafos**
   - Patrón: "para los días: 16 abril, 22 abril, 29 abril..."
   - Patrón: "si no se logra el 23..." (hace referencia a una fecha)
   - Patrón: "hasta el 13 de abril me confirman" (fecha con condición)
   - Estas son potenciales eventos
   - Action: "por_confirmar" si tiene condiciones, "confirmado" si está clara
   - Confidence: 0.5-0.8 (depende de claridad)

3. **Detecta PROYECTO**
   - Busca en la introducción: "actualización de fechas... con [PROYECTO]"
   - Busca referencias implícitas: "como parte del [PROYECTO]"
   - Un solo proyecto por mensaje → aplicar a TODOS los eventos
   - Si hay múltiples proyectos, usar información adicional para asociar

4. **Interpreta ESTADO (action)**
   - "confirmado" if: está en tabla clara, está sin condicionales
   - "por_confirmar" if: tiene "(pendiente)", "(por confirmar)", condiciones, "hasta que...", "si...", incertidumbre
   - "cancelado" if: dice "cancelado", "pospuesto", "no se logra"
   - Default: "por_confirmar" si hay ambigüedad

5. **Extrae NOTAS CONTEXTUALES** (campo separado "notasContextuales")
   - Busca frases informativas que aplican a eventos específicos
   - Tipo A - Nota CON FECHA ESPECÍFICA:
     * "si no se logra el 23 se tendría que posponer..." → aplica solo a fecha "23"
     * "es importante ya que va muy de la mano de otras acciones..." → aplica a esa fecha
   - Tipo B - Nota SIN FECHA pero PARA UN GRUPO:
     * "para los días: 16 abril, 22 abril... Esto será con otro proveedor..."
     * → aplica a 16 abril, 22 abril, 29 abril, etc.
   - Tipo C - Nota GENERAL (sin fecha específica):
     * "contaremos con pantallas y otro rider" → aplica a TODOS los eventos
   - Formato de retorno:
     {
       "2026-04-23": "si no se logra el 23 se tendría que posponer...",
       "2026-04-16": "Esto será con otro proveedor...",
       "2026-05-28": "es importante ya que va muy de la mano..."
     }

---

REGLAS DE DECISIÓN (flexibles):

• UNA fecha + UNA locación = UN evento (no splitear)
• Si ve "CON [proyecto]", "PARA [proyecto]", "[proyecto] en [fecha]" → NO crea evento nuevo, es información adicional
• Si hay una tabla: esa es la fuente de verdad para eventos confirmados
• Si hay fechas sueltas + condiciones: extrae como "por_confirmar"
• Si hay ambigüedad: confidence baja (0.5-0.7), action "por_confirmar"
• Si ve referencias como "Las fechas del metro" → busca qué fechas son "del metro" en el texto
• Si ve aclaraciones como "si no se logra" o "hasta que confirmen" → action "por_confirmar"

---

ESTRUCTURA DE RESPUESTA JSON:
{
  "events": [
    {
      "raw": "texto que describe este evento",
      "fecha": "8 abril" o null,
      "locacion": "Fes Aragón" o null,
      "ciudad": "CDMX" o null,
      "proyecto": "Low Clika" o null,
      "action": "confirmado" | "por_confirmar" | "cancelado",
      "notas": "nota específica de este evento" o null,
      "confidence": 0.9
    }
  ],
  "notasContextuales": {
    "2026-04-23": "nota que aplica a esta fecha",
    "2026-04-16": "nota para este grupo de fechas"
  }
}

IMPORTANTE: Responde SOLO con JSON válido, sin texto adicional.`

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
