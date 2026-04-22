import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getAuthUsers, verifyPassword } from '@/lib/auth-utils'
import { normalizeUserSections } from '@/lib/authz'

export type AppSection = 'admin' | 'dashboard' | 'cotizaciones' | 'proyectos' | 'cuentas' | 'responsables' | 'planeacion'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        let users
        try {
          users = await getAuthUsers()
        } catch (e) {
          console.error('[auth] Error loading users from AUTH_USERS:', e)
          return null
        }

        const user = users.find(u => u.email === credentials.email)
        if (!user) return null

        const valid = await verifyPassword(String(credentials.password), user.passwordHash)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sections: normalizeUserSections(user.sections),
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sections = normalizeUserSections((user as { sections?: string[] }).sections)
      } else {
        token.sections = normalizeUserSections(token.sections as string[] | undefined)
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { sections?: AppSection[] }).sections = normalizeUserSections(token.sections as string[] | undefined)
      }
      return session
    },
  },
})
