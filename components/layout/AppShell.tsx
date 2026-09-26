import { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
  /** 'tabbar' (Cuentas, D23): en móvil no hay encabezado fijo arriba y se deja lugar abajo para la barra de pestañas. */
  mobileChrome?: 'header' | 'tabbar'
}

// Fase 5.7 (rediseño): estructura de dos columnas del kit (sidebar fijo +
// topbar/contenido); la navegación móvil la pone SidebarLayout por fuera.
export function AppShell({ sidebar, topbar, children, mobileChrome = 'header' }: AppShellProps) {
  const mobilePad =
    mobileChrome === 'tabbar'
      ? 'pt-[max(12px,env(safe-area-inset-top))] pb-[calc(74px+env(safe-area-inset-bottom))] px-0'
      : 'pt-16 pb-[19px] px-[19px]'
  return (
    <div className="min-h-screen bg-app md:pl-[var(--sidebar-width)]">
      {sidebar}
      <div className="flex min-h-screen flex-col">
        {topbar}
        <main className={`flex w-full max-w-full flex-1 flex-col gap-[19px] overflow-x-hidden ${mobilePad} md:px-[var(--content-pad)] md:pb-[26px] md:pt-[26px]`}>
          {children}
        </main>
      </div>
    </div>
  )
}
