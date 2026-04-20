import { requireSection } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Rate limiting en memoria: max 20 llamadas por hora por sesión (IP-based)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hora

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

const EventoSchema = z.object({
  raw: z.string().optional().nullable(),
  fecha: z.string().optional().nullable(),
  locacion: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  proyecto: z.string().optional().nullable(),
  action: z.enum(['confirmado', 'por_confirmar', 'cancelado']).default('por_confirmar'),
  notas: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
})

const ExtractResponseSchema = z.object({
  events: z.array(EventoSchema),
  notasContextuales: z.record(z.string(), z.string()).optional().default({}),
})

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

  // Rate limiting basado en email del usuario autenticado
  const userEmail = (authResult.session?.user as { email?: string })?.email ?? 'unknown'
  if (!checkRateLimit(userEmail)) {
    return Response.json(
      { error: 'Límite de extracciones alcanzado (20/hora). Intenta de nuevo más tarde.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { text } = body

    if (!text?.trim()) {
      return Response.json([])
    }

    // Timeout de 25s para no exceder el límite de Vercel
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    let response: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      response = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: EXTRACT_PROMPT,
          messages: [{ role: 'user', content: text }],
        },
        { signal: controller.signal }
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return Response.json(
          { events: [], notasContextuales: {}, method: 'ai-timeout' },
          { status: 504 }
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    const content = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    let rawParsed: unknown = null
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        rawParsed = JSON.parse(jsonMatch[0])
      } else {
        const arrayMatch = content.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          rawParsed = { events: JSON.parse(arrayMatch[0]), notasContextuales: {} }
        }
      }
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError)
      return Response.json({ events: [], notasContextuales: {}, method: 'ai-error' }, { status: 500 })
    }

    // Validar con Zod antes de usar los datos
    const validated = ExtractResponseSchema.safeParse(rawParsed)
    if (!validated.success) {
      console.error('Claude response failed Zod validation:', validated.error.issues)
      return Response.json({ events: [], notasContextuales: {}, method: 'ai-validation-error' })
    }

    const { events, notasContextuales } = validated.data

    if (events.length === 0) {
      return Response.json({ events: [], notasContextuales: {}, method: 'ai' })
    }

    // Log usage
    const tokensInput = response.usage.input_tokens
    const tokensOutput = response.usage.output_tokens
    const costUSD = (tokensInput * 3 + tokensOutput * 15) / 1_000_000

    try {
      await supabaseAdmin.from('extraction_logs').insert({
        proyecto_id: userEmail,
        metodo: 'ai',
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        costo_usd: costUSD.toFixed(6),
        eventos_extraidos: events.length,
        raw_input: text.substring(0, 500),
      })
    } catch (logError) {
      console.error('Error logging usage:', logError)
    }

    return Response.json({ events, notasContextuales, method: 'ai' })
  } catch (error) {
    console.error('Error extracting events with AI:', error)
    return Response.json({ events: [], notasContextuales: {}, method: 'ai-error' }, { status: 500 })
  }
}
