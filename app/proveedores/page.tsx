'use client'

import { useEffect, useState } from 'react'
import { Proveedor } from '@/lib/types'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ProveedorModal } from '@/app/proveedores/components/ProveedorModal'
import { SectionLoading } from '@/components/ui/SectionLoading'

function initialsFromName(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')) || nombre.slice(0, 2)
}

function RolPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-pill border border-hairline bg-row-alt px-3 py-1 text-[length:var(--text-md)] text-body">
      {children}
    </span>
  )
}

function ContactoRow({ icon, children }: { icon: 'phone' | 'mail' | 'landmark'; children?: string | null }) {
  if (!children) return null
  return (
    <div className="flex min-w-0 items-center gap-2 text-[length:var(--text-md)] text-subtext">
      <Icon name={icon} size={14} className="flex-none text-faint" />
      <span className="truncate">{children}</span>
    </div>
  )
}

const PORTAL_STAT_TONE_CLASS = {
  'approved-fg': 'text-approved-fg',
  'issued-fg': 'text-issued-fg',
  'cancelled-fg': 'text-cancelled-fg',
  faint: 'text-faint',
} as const

function PortalStat({ label, value, tone }: { label: string; value: number; tone: keyof typeof PORTAL_STAT_TONE_CLASS }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline py-3 last:border-b-0 last:pb-0">
      <span className="text-content text-body">{label}</span>
      <span className={`sn-display text-h2 ${PORTAL_STAT_TONE_CLASS[tone]}`}>{value}</span>
    </div>
  )
}

interface DocumentosResumen {
  incompleta: number
  conErrores: number
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<Proveedor | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [documentosResumen, setDocumentosResumen] = useState<DocumentosResumen | null>(null)

  useEffect(() => {
    fetch('/api/proveedores')
      .then(r => r.json())
      .then(data => { setProveedores(data); setLoading(false) })
      .catch(() => setLoading(false))

    fetch('/api/proveedores/documentos-resumen')
      .then(r => r.json())
      .then(data => setDocumentosResumen(data))
      .catch(() => setDocumentosResumen(null))
  }, [])

  const handleSaved = (proveedor: Proveedor) => {
    setProveedores(prev => {
      const existe = prev.some(p => p.id === proveedor.id)
      return existe ? prev.map(p => p.id === proveedor.id ? proveedor : p) : [...prev, proveedor]
    })
  }

  const filtrados = proveedores.filter(r =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const portalActivos = proveedores.filter(r => r.portal_estado === 'activo').length
  const portalPendientes = proveedores.filter(r => r.portal_estado === 'pendiente_confirmacion').length
  const portalSinRegistro = proveedores.filter(r => !r.portal_estado).length

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Proveedores"
        action={
          <Button onClick={() => setNuevo(true)} iconLeft="plus">
            Nuevo proveedor
          </Button>
        }
      />

      <SearchInput
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full max-w-[420px] self-start"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="lg:order-1">
          {loading ? (
            <SectionLoading />
          ) : filtrados.length === 0 ? (
            <div className="rounded-panel border border-hairline bg-card p-12 text-center">
              <p className="text-lg text-subtext mb-2">
                {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay proveedores aún'}
              </p>
              {!busqueda && (
                <div className="mt-4">
                  <Button onClick={() => setNuevo(true)} iconLeft="plus">
                    Nuevo proveedor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {filtrados.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAbierto(r)}
                  className={`rounded-panel border border-hairline bg-card p-5 text-left flex flex-col gap-3 min-w-0 hover:border-accent-quiet transition-colors ${r.activo ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar initials={initialsFromName(r.nombre)} size={38} tone={r.activo ? 'accent' : 'neutral'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[length:var(--text-lg)] font-semibold text-ink">{r.nombre}</div>
                    </div>
                    <StatusBadge tone={r.activo ? 'approved' : 'draft'}>{r.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
                  </div>

                  {r.roles && r.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.roles.map(rol => <RolPill key={rol}>{rol}</RolPill>)}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 pt-3 border-t border-hairline">
                    <ContactoRow icon="phone">{r.telefono}</ContactoRow>
                    <ContactoRow icon="mail">{r.correo}</ContactoRow>
                    <ContactoRow icon="landmark">{r.banco}</ContactoRow>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:order-2 rounded-panel border border-accent-quiet/30 bg-row p-5 flex flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <Icon name="link" size={16} className="text-accent flex-none" />
            <h3 className="sn-label">Portal de proveedores</h3>
          </div>

          <div className="flex flex-col">
            <PortalStat label="Activos" value={portalActivos} tone="approved-fg" />
            <PortalStat label="Pendientes de confirmación" value={portalPendientes} tone="issued-fg" />
            <PortalStat label="Sin registrar" value={portalSinRegistro} tone="faint" />
          </div>

          {documentosResumen && (documentosResumen.incompleta > 0 || documentosResumen.conErrores > 0) && (
            <div className="flex flex-col border-t border-hairline pt-4">
              <PortalStat label="Documentación incompleta" value={documentosResumen.incompleta} tone="faint" />
              <PortalStat label="Documentación con errores" value={documentosResumen.conErrores} tone="cancelled-fg" />
            </div>
          )}

          <Button href="/portal/login" target="_blank" rel="noopener noreferrer" iconRight="arrow-right" fullWidth>
            Acceder al portal
          </Button>
        </aside>
      </div>

      {abierto && (
        <ProveedorModal proveedor={abierto} onClose={() => setAbierto(null)} onSaved={handleSaved} />
      )}
      {nuevo && (
        <ProveedorModal proveedor={null} onClose={() => setNuevo(false)} onSaved={handleSaved} />
      )}
    </div>
  )
}
