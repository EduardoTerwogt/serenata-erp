import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getAuthUser, hashPassword, needsRehash, verifyPassword } from '@/lib/auth-utils'
import { normalizeUserSections } from '@/lib/authz'
import { jwtCallback, sessionCallback, type AppSection } from '@/lib/auth-callbacks'

export type { AppSection }

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        let user
        try {
          user = await getAuthUser(String(credentials.email))
        } catch (e) {
          console.error('[auth] Error loading user:', e)
          return null
        }
        if (!user) return null

        const valid = await verifyPassword(String(credentials.password), user.passwordHash)
        if (!valid) return null

        if (needsRehash(user.passwordHash)) {
          // Rehash-on-login (Fase 2.3): el password ya se validó, así que
          // aprovechamos para migrarlo a Argon2id sin desloguear a nadie.
          // Si falla (ej. el usuario vino del fallback AUTH_USERS_DEV_FALLBACK,
          // que no tiene fila en la tabla) no bloquea el login -- se reintenta
          // en el próximo.
          try {
            const newHash = await hashPassword(String(credentials.password))
            const { updateUsuario } = await import('@/lib/server/repositories/usuarios')
            await updateUsuario(user.id, { password_hash: newHash })
          } catch (e) {
            console.error('[auth] No se pudo re-hashear el password a Argon2id:', e)
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sections: normalizeUserSections(user.sections),
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
})
