/**
 * Los repositorios del Portal hacen `if (error) throw error` sobre el
 * `error` que regresa supabase-js -- que, salvo que se encadene
 * `.throwOnError()` (no se usa aquí), es un objeto plano `{message, details,
 * hint, code}`, NUNCA una instancia de `Error` (postgrest-js solo envuelve
 * en `PostgrestError` cuando el propio cliente es el que lanza). Por eso
 * `error instanceof Error` da falso para estos casos, y el patrón usual del
 * resto del repo (`error instanceof Error ? error.message : String(error)`)
 * cae a `String(objetoPlano)` -> literal "[object Object]" en vez del
 * mensaje real -- exactamente el bug reportado al confirmar un match.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}
