'use client'

import { useEffect } from 'react'

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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <h2 className="text-xl font-semibold text-white">Algo salió mal</h2>
        <p className="text-gray-400 text-sm">{error.message || 'Error inesperado. Intenta nuevamente.'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
