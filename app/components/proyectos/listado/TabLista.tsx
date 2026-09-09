'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableFooter } from '@/components/ui/TableFooter'
import { formatDateDisplay } from '@/lib/format-date'
import { resolverEtapaProyecto } from '@/app/components/proyectos/kanban-helpers'
import type { Proyecto, TipoProyectoConEtapas } from '@/lib/types'

interface TabListaProps {
  proyectos: Proyecto[]
  tipos: TipoProyectoConEtapas[]
}

export function TabLista({ proyectos, tipos }: TabListaProps) {
  const [busqueda, setBusqueda] = useState('')

  const term = busqueda.toLowerCase().trim()
  const filtrados = term
    ? proyectos.filter((p) =>
        p.proyecto.toLowerCase().includes(term) ||
        p.cliente.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term)
      )
    : proyectos

  const nombreTipo = (proyecto: Proyecto) => tipos.find((t) => t.id === proyecto.tipo_proyecto_id)?.nombre ?? '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <SearchInput
          expandable
          placeholder="Buscar por proyecto, cliente o folio…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="text-subtext text-content">No hay proyectos que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <div className="rounded-panel border border-hairline bg-card overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-content">
              <thead>
                <tr className="border-b border-hairline">
                  {['Folio', 'Tipo', 'Proyecto', 'Cliente', 'Entrega', 'Etapa'].map((h) => (
                    <th key={h} className="sn-label text-left px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filtrados.map((p) => {
                  const etapa = resolverEtapaProyecto(p, tipos)
                  return (
                    <tr key={p.id} onClick={() => window.location.assign(`/proyectos/${p.id}`)} className="hover:bg-row transition-colors cursor-pointer">
                      <td className="px-6 py-4 text-accent font-mono text-content">{p.id}</td>
                      <td className="px-6 py-4 text-subtext">{nombreTipo(p)}</td>
                      <td className="px-6 py-4 text-body font-medium">{p.proyecto}</td>
                      <td className="px-6 py-4 text-subtext">{p.cliente}</td>
                      <td className="px-6 py-4 text-subtext">{formatDateDisplay(p.fecha_entrega)}</td>
                      <td className="px-6 py-4">
                        {etapa ? <StatusBadge tone={etapa.tone}>{etapa.label}</StatusBadge> : <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-hairline">
            {filtrados.map((p) => {
              const etapa = resolverEtapaProyecto(p, tipos)
              return (
                <Link key={p.id} href={`/proyectos/${p.id}`} className="block p-4 hover:bg-row transition-colors">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <span className="font-mono text-accent text-content font-bold">{p.id}</span>
                    {etapa ? <StatusBadge tone={etapa.tone}>{etapa.label}</StatusBadge> : <span className="text-faint text-content">—</span>}
                  </div>
                  <p className="text-body font-medium">{p.proyecto}</p>
                  <p className="text-subtext text-content mt-0.5">{p.cliente} · {nombreTipo(p)}</p>
                </Link>
              )
            })}
          </div>

          <TableFooter shown={filtrados.length} total={proyectos.length} unit="proyectos" />
        </div>
      )}
    </div>
  )
}
