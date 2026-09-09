import { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
}

// Fase 5.7 (rediseño): reemplaza la composición inline que vivía en
// app/components/SidebarLayout.tsx. Estructura de dos columnas del kit
// (sidebar fijo + topbar/contenido) -- la responsividad mobile (sin
// equivalente en el kit) la resuelve SidebarLayout por fuera de este shell.
export function AppShell({ sidebar, topbar, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-app md:pl-[var(--sidebar-width)]">
      {sidebar}
      <div className="flex min-h-screen flex-col">
        {topbar}
        <main className="flex w-full max-w-full flex-1 flex-col gap-[19px] overflow-x-hidden px-[19px] pb-[19px] pt-16 md:px-[var(--content-pad)] md:pb-[26px] md:pt-[26px]">
          {children}
        </main>
      </div>
    </div>
  )
}
