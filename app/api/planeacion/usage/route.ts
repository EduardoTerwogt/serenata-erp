import { requireSection } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Anthropic Haiku pricing (current as of 2026)
// Input: $0.80 per 1M tokens
// Output: $4.00 per 1M tokens
const TOKENS_PER_DOLLAR = 1000 // Conservative estimate
const INITIAL_CREDIT = 5 // $5 USD free credit

export async function GET(request: Request) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    // Get last 30 days of usage
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from('extraction_logs')
      .select('tokens_input, tokens_output, costo_usd, eventos_extraidos')
      .gte('created_at', thirtyDaysAgo.toISOString())

    if (error) {
      console.error('Error fetching usage:', error)
      return Response.json({ error: 'Error fetching usage' }, { status: 500 })
    }

    // Calculate totals
    const totalTokensInput = (data || []).reduce((sum, row) => sum + (row.tokens_input || 0), 0)
    const totalTokensOutput = (data || []).reduce((sum, row) => sum + (row.tokens_output || 0), 0)
    const totalTokens = totalTokensInput + totalTokensOutput
    const totalCost = (data || []).reduce((sum, row) => sum + (parseFloat(row.costo_usd) || 0), 0)
    const totalEvents = (data || []).reduce((sum, row) => sum + (row.eventos_extraidos || 0), 0)

    // Calculate percentage
    const creditTokens = INITIAL_CREDIT * TOKENS_PER_DOLLAR
    const percentageUsed = (totalTokens / creditTokens) * 100

    return Response.json({
      tokensUsed: totalTokens,
      tokensAvailable: creditTokens,
      percentageUsed: Math.min(percentageUsed, 100),
      costUSD: parseFloat(totalCost.toFixed(4)),
      initialCredit: INITIAL_CREDIT,
      eventsProcessed: totalEvents,
      period: '30 days',
    })
  } catch (error) {
    console.error('Error calculating usage:', error)
    return Response.json({ error: 'Error calculating usage' }, { status: 500 })
  }
}
