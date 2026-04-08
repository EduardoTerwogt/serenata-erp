import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getAuthUsers, verifyPassword } from '@/lib/auth-utils'

export type AppSection = 'dashboard' | 'cotizaciones' | 'proyectos' | 'cuentas' | 'responsables'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        let users
        try {
          users = getAuthUsers()
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
          sections: user.sections as AppSection[],
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sections = (user as { sections: AppSection[] }).sections
      return token
    },
    session({ session, token }) {
      if (session.user)
        (session.user as { sections?: AppSection[] }).sections = token.sections as AppSection[]
      return session
    },
  },
})
