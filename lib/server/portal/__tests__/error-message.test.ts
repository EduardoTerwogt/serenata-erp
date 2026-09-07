import { describe, expect, it } from 'vitest'
import { toErrorMessage } from '../error-message'

describe('toErrorMessage', () => {
  it('extrae .message de una instancia real de Error', () => {
    expect(toErrorMessage(new Error('algo falló'))).toBe('algo falló')
  })

  it('extrae .message de un objeto plano (forma real de un error de supabase-js sin throwOnError)', () => {
    // supabase-js NO envuelve en PostgrestError salvo que se use
    // .throwOnError() -- el error que regresa `{data, error}` es un objeto
    // plano {message, details, hint, code}. Este es exactamente el caso que
    // causaba "[object Object]" con el patrón anterior
    // (`error instanceof Error ? error.message : String(error)`).
    const errorPlano = {
      message: 'duplicate key value violates unique constraint "idx_proveedores_correo_portal"',
      details: 'Key (correo)=(jose@correo.com) already exists.',
      hint: null,
      code: '23505',
    }
    expect(toErrorMessage(errorPlano)).toBe(
      'duplicate key value violates unique constraint "idx_proveedores_correo_portal"'
    )
  })

  it('cae a String() solo si de verdad no hay .message legible', () => {
    expect(toErrorMessage('ya es un string')).toBe('ya es un string')
    expect(toErrorMessage(42)).toBe('42')
    expect(toErrorMessage({ codigo: 'X' })).toBe('[object Object]')
  })
})
