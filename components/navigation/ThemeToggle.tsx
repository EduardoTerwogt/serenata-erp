'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'serenata-theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// Igual a ThemeToggle en App.jsx del kit: pill segmentada sol/luna que alterna
// data-theme en <html> (ver tokens/theme-dark.css) y persiste la elección.
// El estado inicial se lee de localStorage vía inicializador perezoso de
// useState (no en un efecto aparte) para no disparar un setState extra al
// montar.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage puede fallar en modo privado -- el toggle sigue
      // funcionando para la sesión actual, solo no se recuerda.
    }
  }, [theme])

  const buttonClass = (active: boolean) =>
    `flex h-6 w-6 items-center justify-center rounded-pill transition-colors ${
      active ? 'bg-card text-accent shadow-[var(--shadow-segment)]' : 'text-faint hover:text-subtext'
    }`

  return (
    <div className="flex items-center gap-1 rounded-pill p-[3px]" style={{ background: 'var(--sn-toggle-track)' }}>
      <button type="button" onClick={() => setTheme('light')} className={buttonClass(theme === 'light')} title="Claro" aria-label="Tema claro">
        <Icon name="theme-light" size={13} />
      </button>
      <button type="button" onClick={() => setTheme('dark')} className={buttonClass(theme === 'dark')} title="Oscuro" aria-label="Tema oscuro">
        <Icon name="theme-dark" size={13} />
      </button>
    </div>
  )
}
