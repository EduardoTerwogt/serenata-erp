import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

export type AppSection = 'dashboard' | 'cotizaciones' | 'proyectos' | 'cuentas' | 'responsables'

const USERS = [
  {
    id: '1',
    email: 'eduardoterwogth@gmail.com',
    password: 'Serenata2',
    name: 'Eduardo',
    sections: ['dashboard', 'cotizaciones', 'proyectos', 'cuentas', 'responsables'] as AppSection[],
  },
  {
    id: '2',
    email: 'jgbandieramonte@gmail.com',
    password: 'Serenata1',
    name: 'Jefe',
    sections: ['cotizaciones'] as AppSection[],
  },
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const user = USERS.find(
          u => u.email === credentials?.email && u.password === credentials?.password
        )
        if (!user) return null
        return { id: user.id, email: user.email, name: user.name, sections: user.sections }
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
