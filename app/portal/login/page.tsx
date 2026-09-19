'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendJson } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'

interface LoginResponse {
  success: boolean
  requiere_confirmacion: boolean
}

export default function PortalLoginPage() {
  const router = useRouter()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await sendJson<LoginResponse>('/api/portal/login', { correo, password }, 'Correo o contraseña incorrectos')
      router.push(result.requiere_confirmacion ? '/portal/confirmar-identidad' : '/portal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Correo o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="sn-display text-h2 text-ink">Portal de proveedores</h1>
        <p className="mt-2 text-[length:var(--text-base)] text-subtext">Entra para ver tus cuentas con Serenata</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-panel border border-hairline bg-card p-6">
        <TextField
          label="Correo"
          type="email"
          value={correo}
          onChange={e => setCorreo(e.target.value)}
          required
          autoComplete="email"
          placeholder="tu@correo.com"
        />
        <TextField
          label="Contraseña"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <Button type="submit" disabled={loading} fullWidth>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>

        <p className="text-center text-content text-subtext">
          ¿Aún no tienes cuenta?{' '}
          <Link href="/portal/signup" className="text-accent hover:underline">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  )
}
