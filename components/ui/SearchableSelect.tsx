'use client'

import { useMemo, useState } from 'react'
import { Icon } from './Icon'

interface Opcion {
  value: string
  label: string
  count?: number
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function useFiltro(opciones: Opcion[]) {
  const [q, setQ] = useState('')
  const visibles = useMemo(() => {
    const n = normalizar(q.trim())
    return n ? opciones.filter((o) => normalizar(o.label).includes(n)) : opciones
  }, [opciones, q])
  return { q, setQ, visibles }
}

function Buscador({ q, setQ, className = '' }: { q: string; setQ: (v: string) => void; className?: string }) {
  return (
    <label className={`flex h-7 items-center gap-1.5 rounded-control border border-hairline bg-input px-[9px] text-subtext focus-within:border-accent-quiet ${className}`}>
      <Icon name="search" size={13} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-subtext"
      />
    </label>
  )
}

interface ListaRadioProps {
  opciones: Opcion[]
  value: string
  onChange: (value: string) => void
  /** Etiqueta de la opción "sin filtro" (value ''). */
  todos?: string
  buscar?: boolean
  maxHeight?: number
  marca?: 'radio' | 'check'
}

/**
 * Lista de opciones con radio (panel de Filtros de escritorio) o con marca
 * (hoja móvil), con buscador opcional arriba. La opción activa lleva tinte
 * accent al 8%.
 */
export function ListaRadio({ opciones, value, onChange, todos, buscar = false, maxHeight, marca = 'radio' }: ListaRadioProps) {
  const todas = useMemo(() => (todos ? [{ value: '', label: todos }, ...opciones] : opciones), [opciones, todos])
  const { q, setQ, visibles } = useFiltro(todas)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {buscar && <Buscador q={q} setQ={setQ} className="mx-1 mb-1.5" />}
      <div className="flex flex-col gap-1 overflow-y-auto" style={maxHeight ? { maxHeight } : undefined}>
        {visibles.map((o) => {
          const activa = o.value === value
          return (
            <button
              key={o.value || '__todos'}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onChange(o.value)}
              className={`flex min-h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[length:var(--text-md)] text-body hover:bg-[var(--hover-overlay)] ${activa ? 'bg-[rgba(254,123,1,.08)]' : ''}`}
            >
              {marca === 'radio' && (
                <span
                  className="h-3.5 w-3.5 flex-none rounded-pill bg-card"
                  style={{ border: activa ? '4px solid var(--accent)' : '1.5px solid var(--border-subtle)' }}
                />
              )}
              <span className={`min-w-0 flex-1 truncate ${activa ? 'font-semibold text-ink' : ''}`}>{o.label}</span>
              {typeof o.count === 'number' && <span className="text-[11px] text-subtext">{o.count}</span>}
              {marca === 'check' && activa && <Icon name="check" size={15} className="text-accent" />}
            </button>
          )
        })}
        {visibles.length === 0 && <div className="px-2 py-2 text-[12px] text-faint">Sin resultados</div>}
      </div>
    </div>
  )
}

interface SearchableSelectProps {
  label: string
  opciones: string[]
  value: string
  onChange: (value: string) => void
  todos: string
}

/** Desplegable con buscador (Cliente / Proveedor en la hoja de Filtros móvil). */
export function SearchableSelect({ label, opciones, value, onChange, todos }: SearchableSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const lista = useMemo(() => opciones.map((o) => ({ value: o, label: o })), [opciones])
  return (
    <div className="flex flex-col gap-1.5">
      <span className="sn-caption">{label}</span>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-10 items-center gap-2 rounded-control border bg-card px-3 text-left text-[14px] ${abierto ? 'border-accent-quiet' : 'border-hairline'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${value ? 'font-medium text-ink' : 'text-subtext'}`}>{value || todos}</span>
        <Icon name={abierto ? 'chevron-up' : 'chevron-down'} size={16} className="text-subtext" />
      </button>
      {abierto && (
        <div className="rounded-control border border-hairline bg-card p-1.5">
          <ListaRadio
            opciones={lista}
            value={value}
            todos={todos}
            buscar
            marca="check"
            maxHeight={200}
            onChange={(v) => {
              onChange(v)
              setAbierto(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
