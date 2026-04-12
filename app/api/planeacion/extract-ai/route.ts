import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Eres un asistente de extracción de datos para una productora audiovisual mexicana. Tu trabajo es extraer eventos de mensajes informales (correos, WhatsApp, Slack) y devolver JSON estructurado.

CONTEXTO DE NEGOCIO:
- Los mensajes hablan de eventos en vivo: conciertos, presentaciones, performances en escuelas, foros, metros, arenas, etc.
- "Proyecto" se refiere al nombre del artista, banda o show (ej: "Low Clika", "Destino", "Microdrama"). NO es un lugar ni una fecha.
- "Locación" es el venue o lugar específico donde ocurre el evento (ej: "Fes Aragón", "YMCA", "Secundaria TEC 31", "Metro Chabacano", "Foro Niebla").
- "Ciudad" es SOLO la ciudad o zona geográfica (ej: CDMX, MTY = Monterrey, Toluca, EDO MEX = Estado de México, Chalco, GDL = Guadalajara).
- Ciudad y locación son campos SEPARADOS. No mezclar.

REGLAS DE EXTRACCIÓN:

1. PROYECTO: Busca nombres de artistas/bandas en el mensaje. Pueden aparecer como:
   - Headers de sección (nombre solo en una línea, seguido de fechas)
   - Mención en narrativa ("fechas con Low Clika", "evento con Low")
   - Aplica el proyecto más reciente a todos los eventos siguientes hasta que aparezca otro proyecto diferente.

2. FECHAS: Extrae la fecha TAL COMO aparece en el texto ("23 abril", "6 Mayo", "23/04"). No normalices el formato. El año es 2026 si no se especifica.

3. STATUS (action):
   - "confirmado": cuando no hay señal contraria o dice explícitamente "confirmada/confirmado"
   - "por_confirmar": cuando dice "pendiente", "por confirmar", "a reserva", "por definir", o está entre paréntesis con calificador de duda
   - "cancelado": cuando dice "cancelado/a", "pospuesto/a", "suspendido/a"

4. FORMATOS DE MENSAJE: Los mensajes pueden venir en CUALQUIER formato:
   - Tablas con columnas (fecha, ciudad, venue)
   - Listas simples de fechas bajo un nombre de proyecto
   - Prosa informal de WhatsApp sin estructura
   - Mezcla de párrafos narrativos + datos tabulares
   Adapta tu extracción al formato que encuentres.

5. EVENTOS EN NARRATIVA: Si un párrafo menciona fechas tentativas o posibles (ej: "para los días 16 abril, 22 abril"), extráelas como eventos individuales con action="por_confirmar" y confidence bajo (0.5-0.6).

6. NOTAS: Extrae como "notas" cualquier detalle relevante para un evento específico: requerimientos técnicos (rider, equipo), restricciones, fechas alternativas, comentarios sobre disponibilidad. Copia la información textualmente del mensaje, no parafrasees.

7. CONFIDENCE:
   - 0.9-1.0: datos tabulares claros con fecha + locación explícita
   - 0.7-0.8: eventos mencionados en prosa con fecha y algún detalle
   - 0.5-0.6: fechas tentativas, posibilidades mencionadas al pasar

8. notasContextuales: información de párrafos narrativos que aplica a fechas específicas. Las keys DEBEN ser formato YYYY-MM-DD (año 2026). Ejemplo: si el texto dice "en el caso de YMCA si no se logra el 23 se tendría que posponer", eso es una nota contextual para 2026-04-23.

FORMATO DE RESPUESTA (retorna SOLO este JSON, sin markdown, sin explicaciones):
{
  "events": [
    {
      "raw": "fragmento de texto fuente de este evento",
      "fecha": "fecha como aparece en texto" o null,
      "locacion": "venue/lugar específico" o null,
      "ciudad": "ciudad" o null,
      "proyecto": "nombre del artista/banda" o null,
      "action": "confirmado" | "por_confirmar" | "cancelado",
      "notas": "detalles importantes copiados del texto" o null,
      "confidence": 0.0-1.0
    }
  ],
  "notasContextuales": {"YYYY-MM-DD": "nota del párrafo narrativo"}
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
