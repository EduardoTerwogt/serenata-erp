import { describe, expect, it } from 'vitest'
import { formatSupabaseError, isMissingRpcFunctionError } from '../quotations/rpc-utils'

describe('rpc-utils', () => {
  it('formatSupabaseError concatena code, message, details y hint disponibles', () => {
    const error = {
      code: '42804',
      message: 'type mismatch',
      details: 'uuid vs text',
      hint: 'cast the expression',
    }

    expect(formatSupabaseError(error)).toBe('42804 | type mismatch | uuid vs text | cast the expression')
  })

  it('formatSupabaseError retorna Unknown error para null/undefined', () => {
    expect(formatSupabaseError(null)).toBe('Unknown error')
    expect(formatSupabaseError(undefined)).toBe('Unknown error')
  })

  it('detecta ausencia de función RPC por mensajes típicos', () => {
    expect(
      isMissingRpcFunctionError(
        { message: 'Could not find the function public.save_cotizacion in the schema cache' },
        'save_cotizacion',
      ),
    ).toBe(true)

    expect(
      isMissingRpcFunctionError(
        { message: 'function public.replace_cotizacion_items does not exist' },
        'replace_cotizacion_items',
      ),
    ).toBe(true)
    expect(
      isMissingRpcFunctionError(
        { message: 'Some unrelated database error' },
        'save_cotizacion',
      ),
    ).toBe(false)
  })
})
