'use client'

import { useMemo, useState } from 'react'
import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'
import { ProyectoConCuentas } from '@/app/components/cuentas/hooks/useCuentasPorProyecto'
import { sumMontoPendiente } from '@/app/components/cuentas/selectors'
import { formatCuentasCurrency } from '@/app/components/cuentas/utils'

interface Props {
  proyectos: ProyectoConCuentas[]
  term: string
  onSelectCobrar: (cuenta: CuentaCobrar) => void
  onSelectPagar: (cuenta: CuentaPagar) => void
}

function matches(term: string, ...values: (string | null | undefined)[]) {
  if (!term) return true
  return values.some((value) => (value || '').toLowerCase().includes(term))
}

function fmt(n: number) {
  return formatCuentasCurrency(n)
}

export function CuentasPorProyecto({ proyectos, term, onSelectCobrar, onSelectPagar }: Props) {
  const [abierto, setAbierto] = useState<string | null>(proyectos[0]?.proyecto.id ?? null)

  const filtrados = useMemo(() => {
    return proyectos
      .map((grupo) => {
        if (!term) return grupo
        const proyectoMatch = matches(term, grupo.proyecto.nombre, grupo.proyecto.cliente, grupo.proyecto.folio)
        if (proyectoMatch) return grupo
        const cuentas_cobrar = grupo.cuentas_cobrar.filter((c) => matches(term, c.cliente, c.proyecto, c.cotizacion_id))
        const cuentas_pagar = grupo.cuentas_pagar.filter((c) => matches(term, c.responsable_nombre, c.proyecto_nombre, c.item_descripcion, c.cotizacion_id))
        return { ...grupo, cuentas_cobrar, cuentas_pagar }
      })
      .filter((grupo) => grupo.cuentas_cobrar.length > 0 || grupo.cuentas_pagar.length > 0)
  }, [proyectos, term])

  if (filtrados.length === 0) {
    return (
      <div className="rounded-panel border border-hairline bg-card p-8 text-center text-faint">
        Ninguna cuenta coincide.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {filtrados.map((grupo) => {
        const abrir = abierto === grupo.proyecto.id
        const pendienteCobrar = sumMontoPendiente(grupo.cuentas_cobrar)
        const pendientePagar = sumMontoPendiente(grupo.cuentas_pagar)

        return (
          <div key={grupo.proyecto.id} className="rounded-panel border border-hairline bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setAbierto(abrir ? null : grupo.proyecto.id)}
              className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-row/50"
            >
              <Icon name={abrir ? 'chevron-down' : 'chevron-right'} size={16} className="text-subtext" />
              <span className="font-mono text-eyebrow text-accent">{grupo.proyecto.folio}</span>
              <span className="font-semibold text-ink">{grupo.proyecto.nombre}</span>
              <span className="text-content text-subtext">{grupo.proyecto.cliente}</span>
              <div className="flex-1" />
              <span className="text-content text-subtext">
                Por cobrar <span className="font-semibold text-accent">${fmt(pendienteCobrar)}</span>
              </span>
              <span className="text-content text-subtext">
                Por pagar <span className="font-semibold text-ink">${fmt(pendientePagar)}</span>
              </span>
            </button>

            {abrir && (
              <div className="grid grid-cols-1 gap-4 border-t border-hairline p-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-eyebrow font-medium uppercase tracking-wide text-subtext">Por cobrar</p>
                  <div className="overflow-hidden rounded-control border border-hairline">
                    {grupo.cuentas_cobrar.length === 0 ? (
                      <p className="p-4 text-content italic text-faint">Sin cuentas por cobrar</p>
                    ) : (
                      grupo.cuentas_cobrar.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          type="button"
                          onClick={() => onSelectCobrar(cuenta)}
                          className="flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left last:border-b-0 hover:bg-row"
                        >
                          <span className="min-w-0 flex-1 truncate text-content font-medium text-ink">{cuenta.cliente}</span>
                          <span className="whitespace-nowrap text-content text-subtext">
                            ${fmt(cuenta.monto_pagado || 0)} / ${fmt(cuenta.monto_total)}
                          </span>
                          <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-eyebrow font-medium uppercase tracking-wide text-subtext">Por pagar</p>
                  <div className="overflow-hidden rounded-control border border-hairline">
                    {grupo.cuentas_pagar.length === 0 ? (
                      <p className="p-4 text-content italic text-faint">Sin cuentas por pagar</p>
                    ) : (
                      grupo.cuentas_pagar.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          type="button"
                          onClick={() => onSelectPagar(cuenta)}
                          className="flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left last:border-b-0 hover:bg-row"
                        >
                          <span className="min-w-0 flex-1 truncate text-content font-medium text-ink">{cuenta.responsable_nombre}</span>
                          <span className="whitespace-nowrap text-content text-subtext">${fmt(cuenta.x_pagar)}</span>
                          <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
