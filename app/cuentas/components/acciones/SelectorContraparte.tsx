'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { useBuscarClientes, useProveedores, type ContraparteLista } from './useAcciones'

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Props {
  lado: LadoCuentas
  /** Lo ya elegido (el nombre llega con el estado de cuenta, no de aquí). */
  valor: { id: string; nombre: string } | null
  onElegir: (c: ContraparteLista) => void
}

/**
 * Selector de cliente (búsqueda por nombre, `GET /api/clientes?q=`) o de proveedor (lista completa filtrada en el
 * cliente). Cerrado muestra la contraparte elegida; abierto, el buscador y los resultados. Es el único selector de
 * contraparte de las tres ventanas de Acciones (P15).
 */
export function SelectorContraparte({ lado, valor, onElegir }: Props) {
  const [abierto, setAbierto] = useState(!valor)
  const [q, setQ] = useState('')
  const proveedores = useProveedores(abierto && lado === 'proveedor')
  const clientes = useBuscarClientes(q, abierto && lado === 'cobro')

  const resultados = useMemo(() => {
    if (lado === 'cobro') return clientes.lista
    const buscado = normalizar(q.trim())
    return (proveedores.lista ?? []).filter((p) => buscado === '' || normalizar(p.nombre).includes(buscado)).slice(0, 40)
  }, [lado, clientes.lista, proveedores.lista, q])

  const elegir = (c: ContraparteLista) => {
    onElegir(c)
    setAbierto(false)
    setQ('')
  }
  const etiquetaLado = lado === 'cobro' ? 'cliente' : 'proveedor'

  if (!abierto && valor) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Cambiar ${etiquetaLado}: ${valor.nombre}`}
        className="flex h-[var(--control-height-lg)] min-w-0 max-w-full items-center gap-2 rounded-control border border-hairline bg-input px-3.5 text-left text-[length:var(--text-md)] text-ink hover:bg-row-alt md:min-w-[260px]"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{valor.nombre}</span>
        <Icon name="chevron-down" size={15} className="flex-none text-subtext" />
      </button>
    )
  }

  const error = lado === 'cobro' ? clientes.error : proveedores.error
  const cargando = lado === 'cobro' ? clientes.buscando : proveedores.lista === null && !proveedores.error
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2">
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={lado === 'cobro' ? 'Buscar cliente por nombre' : 'Buscar proveedor por nombre'} autoFocus aria-label={`Buscar ${etiquetaLado}`} />
      <div role="listbox" aria-label={`Resultados de ${etiquetaLado}`} className="max-h-56 overflow-y-auto rounded-panel border border-hairline bg-card">
        {error && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">{error}</div>}
        {!error && lado === 'cobro' && q.trim() === '' && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Escribe el nombre del cliente.</div>}
        {!error && cargando && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Buscando…</div>}
        {!error && !cargando && (lado === 'proveedor' || q.trim() !== '') && resultados.length === 0 && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Sin resultados.</div>}
        {resultados.map((c) => (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={valor?.id === c.id}
            onClick={() => elegir(c)}
            className="block w-full truncate border-t border-hairline px-3.5 py-2.5 text-left text-[13px] text-ink first:border-t-0 hover:bg-row-alt"
          >
            {c.nombre}
          </button>
        ))}
      </div>
      {valor && (
        <button type="button" onClick={() => setAbierto(false)} className="self-start text-[12.5px] text-subtext hover:text-body">
          Cancelar
        </button>
      )}
    </div>
  )
}
