'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Proveedor } from '@/lib/types'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

function initialsFromName(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')) || nombre.slice(0, 2)
}

function RolPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-pill border border-hairline bg-row-alt px-2.5 py-0.5 text-xs text-body">
      {children}
    </span>
  )
}

function ContactoRow({ icon, children }: { icon: 'phone' | 'mail' | 'landmark'; children?: string | null }) {
  if (!children) return null
  return (
    <div className="flex items-center gap-2 text-sm text-subtext min-w-0">
      <Icon name={icon} size={14} className="text-faint flex-none" />
      <span className="truncate">{children}</span>
    </div>
  )
}

export default function ProveedoresPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/proveedores')
      .then(r => r.json())
      .then(data => { setProveedores(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtrados = proveedores.filter(r =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 flex flex-col gap-6">
      <SectionHero
        title="Proveedores"
        subtitle="Gestiona tu equipo de trabajo"
        action={
          <button
            type="button"
            onClick={() => router.push('/proveedores/nueva')}
            className="inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors"
          >
            <Icon name="plus" size={15} />
            Nuevo proveedor
          </button>
        }
      />

      <SearchInput
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
        className="max-w-[420px]"
      />

      {loading ? (
        <div className="py-12 text-center text-faint">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-lg text-subtext mb-2">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay proveedores aún'}
          </p>
          {!busqueda && (
            <button
              type="button"
              onClick={() => router.push('/proveedores/nueva')}
              className="inline-flex items-center gap-1.5 mt-4 rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors"
            >
              <Icon name="plus" size={15} />
              Nuevo proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {filtrados.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => router.push(`/proveedores/${r.id}`)}
              className={`rounded-panel border border-hairline bg-card p-5 text-left flex flex-col gap-3 min-w-0 hover:border-accent-quiet transition-colors ${r.activo ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar initials={initialsFromName(r.nombre)} size={38} tone={r.activo ? 'accent' : 'neutral'} />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-ink truncate">{r.nombre}</div>
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
  )
}
