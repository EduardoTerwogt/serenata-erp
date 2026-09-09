'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-6">
      <div className="w-full max-w-md space-y-4 rounded-panel border border-hairline bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <h2 className="sn-display text-h2 text-ink">Algo salió mal</h2>
        <p className="text-sm text-subtext">{error.message || 'Error inesperado. Intenta nuevamente.'}</p>
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </div>
  )
}
