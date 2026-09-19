'use client'

import { useEffect, useState } from 'react'
import { Cliente } from '@/lib/types'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ClienteModal } from '@/app/clientes/components/ClienteModal'
import { SectionLoading } from '@/components/ui/SectionLoading'

function initialsFromName(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')) || nombre.slice(0, 2)
}

function ContactoRow({ icon, children }: { icon: 'phone' | 'mail'; children?: string | null }) {
  if (!children) return null
  return (
    <div className="flex min-w-0 items-center gap-2 text-[length:var(--text-md)] text-subtext">
      <Icon name={icon} size={14} className="flex-none text-faint" />
      <span className="truncate">{children}</span>
    </div>
  )
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<Cliente | null>(null)
  const [nuevo, setNuevo] = useState(false)

  useEffect(() => {
    fetch('/api/clientes?admin=1')
      .then(r => r.json())
      .then(data => { setClientes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSaved = (cliente: Cliente) => {
    setClientes(prev => {
      const existe = prev.some(c => c.id === cliente.id)
      return existe ? prev.map(c => c.id === cliente.id ? cliente : c) : [...prev, cliente]
    })
  }

  const filtrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Clientes"
        action={
          <Button onClick={() => setNuevo(true)} iconLeft="plus">
            Nuevo cliente
          </Button>
        }
      />

      <SearchInput
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full max-w-[420px] self-start"
      />

      {loading ? (
        <SectionLoading />
      ) : filtrados.length === 0 ? (
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-lg text-subtext mb-2">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay clientes aún'}
          </p>
          {!busqueda && (
            <div className="mt-4">
              <Button onClick={() => setNuevo(true)} iconLeft="plus">
                Nuevo cliente
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {filtrados.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAbierto(c)}
              className={`rounded-panel border border-hairline bg-card p-5 text-left flex flex-col gap-3 min-w-0 hover:border-accent-quiet transition-colors ${c.activo ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar initials={initialsFromName(c.nombre)} size={38} tone={c.activo ? 'accent' : 'neutral'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--text-lg)] font-semibold text-ink">{c.nombre}</div>
                  {c.tipo && <div className="truncate text-[length:var(--text-md)] text-subtext">{c.tipo}</div>}
                </div>
                <StatusBadge tone={c.activo ? 'approved' : 'draft'}>{c.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
              </div>

              <div className="flex flex-col gap-1.5 pt-3 border-t border-hairline">
                <ContactoRow icon="phone">{c.telefono}</ContactoRow>
                <ContactoRow icon="mail">{c.correo}</ContactoRow>
              </div>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <ClienteModal cliente={abierto} onClose={() => setAbierto(null)} onSaved={handleSaved} />
      )}
      {nuevo && (
        <ClienteModal cliente={null} onClose={() => setNuevo(false)} onSaved={handleSaved} />
      )}
    </div>
  )
}
