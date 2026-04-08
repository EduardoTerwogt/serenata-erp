type SupabaseErrorLike =
  | {
      message?: string | null
      details?: string | null
      hint?: string | null
      code?: string | null
    }
  | null
  | undefined

export function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error || 'Unknown error')
  }

  const maybeError = error as SupabaseErrorLike
  return [maybeError.code, maybeError.message, maybeError.details, maybeError.hint]
    .filter(Boolean)
    .join(' | ') || 'Unknown error'
}

export function isMissingRpcFunctionError(error: unknown, functionName: string): boolean {
  const normalizedMessage = formatSupabaseError(error).toLowerCase()
  const normalizedFunctionName = functionName.toLowerCase()

  if (!normalizedMessage.includes(normalizedFunctionName)) return false

  return (
    normalizedMessage.includes('could not find the function') ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('schema cache') ||
    normalizedMessage.includes('function') && normalizedMessage.includes('not found')
  )
}
