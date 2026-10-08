'use client'

import { useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import type { PendienteContraparte } from '@/lib/shared/cuentas/contrapartes-tipos'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { plural } from '../formato'
import { useContrapartes, type ContraparteLista } from './useAcciones'

interface Props {
  lado: LadoCuentas
  /** Qué debe tener pendiente la contraparte para salir en la lista (`todos`: cualquiera activa). */
  pendiente: PendienteContraparte
  /** Lo ya elegido (el nombre llega con el estado de cuenta, no de aquí). */
  valor: { id: string; nombre: string } | null
  onElegir: (c: ContraparteLista) => void
  /** Acción a la derecha del desplegable ("Proveedor nuevo"). */
  accion?: ReactNode
}

const PIE: Record<PendienteContraparte, (proveedor: boolean) => string | null> = {
  factura: (p) => (p ? 'Solo proveedores con proyectos sin factura' : 'Solo clientes con cotizaciones sin factura'),
  complemento: (p) => (p ? 'Solo proveedores con complemento pendiente' : 'Solo clientes con complemento pendiente'),
  saldo: (p) => (p ? 'Solo proveedores con saldo por pagar' : 'Solo clientes con saldo por cobrar'),
  todos: () => null,
}

/**
 * Desplegable de cliente o proveedor (#131): cerrado muestra lo elegido; abierto, un buscador y las contrapartes que
 * tienen algo `pendiente` (la lista y la búsqueda las hace SQL). Es el único selector de contraparte de las tres
 * ventanas de Acciones (P15).
 */
export function SelectorContraparte({ lado, pendiente, valor, onElegir, accion }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const { lista, total, error, cargando } = useContrapartes(lado, pendiente, q, abierto)
  const proveedor = lado === 'proveedor'
  const etiquetaLado = proveedor ? 'proveedor' : 'cliente'

  const elegir = (c: ContraparteLista) => {
    onElegir(c)
    setAbierto(false)
    setQ('')
  }
  const pie = total > lista.length ? `Mostrando ${lista.length} de ${total}: escribe para filtrar` : PIE[pendiente](proveedor)

  return (
    <div className="flex flex-wrap items-start gap-2.5">
      <div className="min-w-0 basis-full md:max-w-[420px] md:flex-1">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={abierto}
          onClick={() => setAbierto((a) => !a)}
          aria-label={valor ? `Cambiar ${etiquetaLado}: ${valor.nombre}` : `Elegir ${etiquetaLado}`}
          className={`flex h-[var(--control-height-lg)] w-full min-w-0 items-center gap-2 rounded-control border bg-input px-3.5 text-left text-[length:var(--text-md)] hover:bg-row-alt md:min-w-[260px] ${abierto ? 'border-accent-quiet' : 'border-hairline'}`}
        >
          <span className={`min-w-0 flex-1 truncate ${valor ? 'font-medium text-ink' : 'text-subtext'}`}>{valor?.nombre ?? `Elegir ${etiquetaLado}`}</span>
          <Icon name={abierto ? 'chevron-up' : 'chevron-down'} size={15} className="flex-none text-subtext" />
        </button>
        {abierto && (
          <div className="mt-1.5 overflow-hidden rounded-panel border border-hairline bg-card">
            <div className="border-b border-hairline p-2">
              <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${etiquetaLado}`} autoFocus aria-label={`Buscar ${etiquetaLado}`} />
            </div>
            <div role="listbox" aria-label={`Resultados de ${etiquetaLado}`} className="max-h-56 overflow-y-auto">
              {error && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">{error}</div>}
              {!error && cargando && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Buscando…</div>}
              {!error && !cargando && lista.length === 0 && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Sin resultados.</div>}
              {lista.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={valor?.id === c.id}
                  onClick={() => elegir({ id: c.id, nombre: c.nombre })}
                  className="flex w-full items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-left text-[13px] text-ink first:border-t-0 hover:bg-row-alt"
                >
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  {c.pendientes > 0 && <span className="flex-none text-[11.5px] text-subtext">{plural(c.pendientes, 'pendiente', 'pendientes')}</span>}
                </button>
              ))}
            </div>
            {pie && <div className="border-t border-hairline bg-row-alt px-3.5 py-2 text-[11px] text-subtext">{pie}</div>}
          </div>
        )}
      </div>
      {accion && <div className="max-md:basis-full md:ml-auto">{accion}</div>}
    </div>
  )
}
