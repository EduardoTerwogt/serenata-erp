import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SidebarLayout from './components/SidebarLayout'
import SessionProviderWrapper from './components/SessionProviderWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Serenata ERP',
  description: 'Sistema de gestión Serenata',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <SessionProviderWrapper>
          <SidebarLayout>{children}</SidebarLayout>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
