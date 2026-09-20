'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendJson } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'

export default function PortalSignupPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [alias, setAlias] = useState('')
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await sendJson('/api/portal/signup', { nombre: nombre || null, alias: alias || null, correo, password }, 'Error al crear tu cuenta')
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
        <h1 className="sn-display text-h2 text-ink">Crea tu cuenta de proveedor</h1>
        <p className="mt-2 text-[length:var(--text-base)] text-subtext">
          Después de registrarte te pediremos tu documentación para vincular tus cuentas con Serenata.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-panel border border-hairline bg-card p-6">
        <TextField
          label="Nombre completo (opcional)"
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Tu nombre o razón social"
        />
        <TextField
          label="Alias · nombre corto u operativo (opcional)"
          type="text"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          placeholder="Ej. Chok"
        />
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
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />

        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <Button type="submit" disabled={loading} fullWidth>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>

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
