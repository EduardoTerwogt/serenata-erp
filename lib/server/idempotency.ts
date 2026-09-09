import { supabaseAdmin } from '@/lib/supabase'

/**
 * Auditoría externa 2026-09-09 (Fase 3.3). Envuelve una operación mutante
 * con protección contra doble ejecución: si ya se guardó una respuesta para
 * `(scope, key)`, la retorna sin volver a correr `handler`. Si dos requests
 * con la misma key llegan casi al mismo tiempo, el INSERT (llave primaria)
 * hace que solo una gane la carrera -- la otra espera el resultado.
 *
 * Sin `key` (cliente viejo, o un caller que no manda una), se comporta como
 * antes: corre `handler` sin protección.
 */
export interface IdempotentResult {
  status: number
  body: unknown
}

export async function withIdempotency(
  scope: string,
  key: string | null | undefined,
  handler: () => Promise<IdempotentResult>
): Promise<IdempotentResult> {
  if (!key) return handler()

  const { error: insertError } = await supabaseAdmin.from('idempotency_keys').insert({ scope, key })

  if (insertError) {
    // Ya existe una fila para esta key -- alguien más (u otra pestaña) ya
    // la está procesando o ya terminó. Esperar el resultado guardado.
    for (let i = 0; i < 15; i++) {
      const { data } = await supabaseAdmin
        .from('idempotency_keys')
        .select('status_code, response')
        .eq('scope', scope)
        .eq('key', key)
        .maybeSingle()
      if (data?.status_code != null) {
        return { status: data.status_code, body: data.response }
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    throw new Error('Esta operación ya se está procesando. Espera unos segundos y revisa antes de reintentar.')
  }

  try {
    const result = await handler()
    await supabaseAdmin
      .from('idempotency_keys')
      .update({ status_code: result.status, response: result.body })
      .eq('scope', scope)
      .eq('key', key)
    return result
  } catch (e) {
    // La operación falló de verdad -- liberar la key para que un reintento
    // real (no un duplicado) pueda volver a intentarlo.
    await supabaseAdmin.from('idempotency_keys').delete().eq('scope', scope).eq('key', key)
    throw e
  }
}
