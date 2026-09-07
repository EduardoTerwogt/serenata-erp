'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendJson } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'

export default function PortalSignupPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await sendJson('/api/portal/signup', { nombre: nombre || null, correo, password }, 'Error al crear tu cuenta')
      router.push('/portal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear tu cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Crea tu cuenta de proveedor</h1>
        <p className="mt-2 text-sm text-subtext">
          Después de registrarte te pediremos tu documentación para vincular tus cuentas con Serenata.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-panel border border-hairline bg-card p-6">
        <div>
          <label className="block text-content font-medium text-body mb-1">Nombre o alias (opcional)</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej. Chok"
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">Correo</label>
          <input
            type="email"
            value={correo}
            onChange={e => setCorreo(e.target.value)}
            required
            autoComplete="email"
            placeholder="tu@correo.com"
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>

        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-pressed text-accent-ink py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>

        <p className="text-center text-content text-subtext">
          ¿Ya tienes cuenta?{' '}
          <Link href="/portal/login" className="text-accent hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  )
}
