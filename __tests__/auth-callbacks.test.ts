import { describe, expect, it } from 'vitest'
import { jwtCallback, sessionCallback } from '@/lib/auth-callbacks'
import type { JWT } from 'next-auth/jwt'
import type { Session } from 'next-auth'

/**
 * EF-2 1B-2b: `jwtCallback`/`sessionCallback` viven en `lib/auth-callbacks.ts`
 * (no en `auth.ts`, que importa `NextAuth({...})` real -- transitivamente
 * carga `next/server` de una forma que Vitest no resuelve bajo Next 16).
 * `auth.ts` los importa de ahí sin cambiar su comportamiento.
 */

describe('jwtCallback', () => {
  it('login inicial (user presente): fija sections y session_version desde el user', () => {
    const token = {} as JWT
    const user = { sections: ['proyectos', 'dashboard'], sessionVersion: 3 } as never

    const result = jwtCallback({ token, user })

    expect(result.sections).toEqual(['proyectos', 'dashboard'])
    expect(result.session_version).toBe(3)
  })

  it('login inicial sin sessionVersion en el user -> session_version por defecto en 0', () => {
    const token = {} as JWT
    const user = { sections: ['dashboard'] } as never

    const result = jwtCallback({ token, user })

    expect(result.session_version).toBe(0)
  })

  it('llamada posterior (sin user): NO reescribe session_version, solo re-normaliza sections desde el token existente', () => {
    const token = { sections: ['proyectos'], session_version: 5 } as JWT

    const result = jwtCallback({ token })

    expect(result.session_version).toBe(5)
    expect(result.sections).toEqual(['proyectos'])
  })
})

describe('sessionCallback', () => {
  it('copia sections, id y sessionVersion del token a session.user', () => {
    const token = { sections: ['proyectos'], session_version: 4, sub: 'user-123' } as JWT
    const session = { user: {} } as Session

    const result = sessionCallback({ session, token })

    const user = result.user as unknown as { sections: string[]; id: string; sessionVersion: number }
    expect(user.sections).toEqual(['proyectos'])
    expect(user.id).toBe('user-123')
    expect(user.sessionVersion).toBe(4)
  })

  it('sin session.user: no revienta, devuelve la sesión tal cual', () => {
    const token = { session_version: 1 } as JWT
    const session = {} as Session

    expect(() => sessionCallback({ session, token })).not.toThrow()
  })
})
