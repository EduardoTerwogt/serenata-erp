'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getJson, sendJson } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { SectionLoading } from '@/components/ui/SectionLoading'

interface MeResponse {
  id: string
  nombre: string
  portal_estado: 'pendiente_confirmacion' | 'activo'
  candidato: { id: string; nombre: string } | null
}

export default function ConfirmarIdentidadPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getJson<MeResponse>('/api/portal/me', 'No se pudo cargar tu cuenta')
      .then(data => {
        if (data.portal_estado !== 'pendiente_confirmacion' || !data.candidato) {
          router.replace('/portal')
          return
        }
        setMe(data)
      })
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false))
  }, [router])

  const responder = async (confirmar: boolean) => {
    setEnviando(true)
    setError(null)
    try {
      await sendJson('/api/portal/signup/confirmar', { confirmar }, 'Error al confirmar')
      router.replace('/portal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar')
      setEnviando(false)
    }
  }

  if (loading) return <SectionLoading />
  if (!me?.candidato) return null

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-panel border border-hairline bg-card p-6 text-center">
        <h1 className="text-h3 font-semibold text-ink mb-2">¿Eres tú?</h1>
        <p className="text-content text-subtext mb-6">
          Encontramos una cuenta a nombre de <span className="text-body font-medium">{me.candidato.nombre}</span> ya cargada
          por Serenata. Si es tuya, la vinculamos a tu perfil para que veas tus cuentas de inmediato.
        </p>

        {error && <StatusBanner tone="error" className="mb-4 text-left">{error}</StatusBanner>}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={enviando}
            onClick={() => responder(true)}
            className="w-full bg-accent hover:bg-accent-pressed text-accent-ink py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
          >
            Sí, soy {me.candidato.nombre}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => responder(false)}
            className="w-full border border-hairline bg-input hover:bg-row-alt text-body py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
          >
            No, esa cuenta no es mía
          </button>
        </div>
      </div>
    </div>
  )
}
