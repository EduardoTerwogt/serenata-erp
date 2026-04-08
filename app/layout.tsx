import type { Metadata } from 'next'
import './globals.css'
import SidebarLayout from './components/SidebarLayout'
import SessionProviderWrapper from './components/SessionProviderWrapper'

export const metadata: Metadata = {
  title: 'Serenata ERP',
  description: 'Sistema de gestión Serenata',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SessionProviderWrapper>
          <SidebarLayout>{children}</SidebarLayout>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
