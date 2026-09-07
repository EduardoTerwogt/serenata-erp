'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getJson, sendJson, sendFormData } from '@/lib/client/api'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { StatusBadge, toneForValidacionEstado } from '@/components/ui/StatusBadge'
import type { ProveedorDocumento, TipoDocumentoProveedor } from '@/lib/types'

const TIPO_LABEL: Record<TipoDocumentoProveedor, string> = {
  CONSTANCIA_SITUACION_FISCAL: 'Constancia de situación fiscal',
  INE: 'INE',
  COMPROBANTE_DOMICILIO: 'Comprobante de domicilio',
  COMPROBANTE_BANCARIO: 'Comprobante bancario',
}

export default function PortalDocumentosPage() {
  const router = useRouter()
  const [documentos, setDocumentos] = useState<ProveedorDocumento[]>([])
  const [banco, setBanco] = useState('')
  const [clabe, setClabe] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState<TipoDocumentoProveedor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const cargar = () => {
    Promise.all([
      getJson<{ banco: string | null; clabe: string | null }>('/api/portal/perfil', 'Error al cargar tu perfil'),
      getJson<{ documentos: ProveedorDocumento[] }>('/api/portal/documentos', 'Error al cargar tus documentos'),
    ])
      .then(([perfil, docs]) => {
        setBanco(perfil.banco ?? '')
        setClabe(perfil.clabe ?? '')
        setDocumentos(docs.documentos)
      })
      .catch(() => router.replace('/portal/login'))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [router])

  const guardarBancario = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      await sendJson('/api/portal/perfil', { banco, clabe }, 'Error al guardar', { method: 'PATCH' })
      setSuccess('Datos bancarios actualizados')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const subirDocumento = async (tipo: TipoDocumentoProveedor, file: File) => {
    setSubiendo(tipo)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('tipo', tipo)
      formData.set('archivo', file)
      await sendFormData('/api/portal/documentos', formData, 'Error al subir el documento')
      cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el documento')
    } finally {
      setSubiendo(null)
    }
  }

  if (loading) return <p className="text-center text-subtext">Cargando...</p>

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Documentos y datos bancarios</h1>

      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {success && <StatusBanner tone="success">{success}</StatusBanner>}

      <form onSubmit={guardarBancario} className="rounded-panel border border-hairline bg-card p-4 md:p-6 space-y-4">
        <h2 className="text-h3 font-semibold text-ink">Datos bancarios</h2>
        <div>
          <label className="block text-content font-medium text-body mb-1">Banco</label>
          <input
            type="text"
            value={banco}
            onChange={e => setBanco(e.target.value)}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-content font-medium text-body mb-1">CLABE</label>
          <input
            type="text"
            value={clabe}
            onChange={e => setClabe(e.target.value)}
            maxLength={18}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-2.5 rounded-control font-medium transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar datos bancarios'}
        </button>
      </form>

      <div className="rounded-panel border border-hairline bg-card p-4 md:p-6 space-y-4">
        <h2 className="text-h3 font-semibold text-ink">Documentos</h2>
        {(Object.keys(TIPO_LABEL) as TipoDocumentoProveedor[]).map(tipo => {
          const existentes = documentos.filter(d => d.tipo === tipo)
          return (
            <div key={tipo} className="border-t border-hairline pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-content font-medium text-body">{TIPO_LABEL[tipo]}</p>
                <label className="cursor-pointer text-content text-accent hover:underline">
                  {subiendo === tipo ? 'Subiendo...' : existentes.length ? 'Subir otro' : 'Subir'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={subiendo !== null}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) subirDocumento(tipo, file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {existentes.length === 0 ? (
                <p className="text-content text-faint">Sin documento subido</p>
              ) : (
                <ul className="space-y-1">
                  {existentes.map(doc => (
                    <li key={doc.id} className="flex items-center justify-between text-content text-subtext">
                      <span className="truncate">{doc.archivo_nombre}</span>
                      <StatusBadge tone={toneForValidacionEstado(doc.estado_validacion)}>{doc.estado_validacion}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
