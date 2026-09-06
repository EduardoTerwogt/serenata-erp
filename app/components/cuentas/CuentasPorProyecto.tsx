'use client'

import { useMemo, useState } from 'react'
import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { AppCard } from '@/components/ui/AppCard'
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
      <AppCard className="p-8 text-center text-gray-500">
        Ninguna cuenta coincide.
      </AppCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {filtrados.map((grupo) => {
        const abrir = abierto === grupo.proyecto.id
        const pendienteCobrar = sumMontoPendiente(grupo.cuentas_cobrar)
        const pendientePagar = sumMontoPendiente(grupo.cuentas_pagar)

        return (
          <AppCard key={grupo.proyecto.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setAbierto(abrir ? null : grupo.proyecto.id)}
              className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-800/50"
            >
              <Icon name={abrir ? 'chevron-down' : 'chevron-right'} size={16} className="text-gray-500" />
              <span className="font-mono text-xs text-blue-400">{grupo.proyecto.folio}</span>
              <span className="font-semibold text-white">{grupo.proyecto.nombre}</span>
              <span className="text-sm text-gray-400">{grupo.proyecto.cliente}</span>
              <div className="flex-1" />
              <span className="text-sm text-gray-400">
                Por cobrar <span className="font-semibold text-yellow-400">${fmt(pendienteCobrar)}</span>
              </span>
              <span className="text-sm text-gray-400">
                Por pagar <span className="font-semibold text-red-400">${fmt(pendientePagar)}</span>
              </span>
            </button>

            {abrir && (
              <div className="grid grid-cols-1 gap-4 border-t border-gray-800 p-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Por cobrar</p>
                  <div className="overflow-hidden rounded-lg border border-gray-800">
                    {grupo.cuentas_cobrar.length === 0 ? (
                      <p className="p-4 text-sm italic text-gray-500">Sin cuentas por cobrar</p>
                    ) : (
                      grupo.cuentas_cobrar.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          type="button"
                          onClick={() => onSelectCobrar(cuenta)}
                          className="flex w-full items-center gap-3 border-b border-gray-800 px-4 py-2.5 text-left last:border-b-0 hover:bg-gray-800/70"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{cuenta.cliente}</span>
                          <span className="whitespace-nowrap text-sm text-gray-400">
                            ${fmt(cuenta.monto_pagado || 0)} / ${fmt(cuenta.monto_total)}
                          </span>
                          <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Por pagar</p>
                  <div className="overflow-hidden rounded-lg border border-gray-800">
                    {grupo.cuentas_pagar.length === 0 ? (
                      <p className="p-4 text-sm italic text-gray-500">Sin cuentas por pagar</p>
                    ) : (
                      grupo.cuentas_pagar.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          type="button"
                          onClick={() => onSelectPagar(cuenta)}
                          className="flex w-full items-center gap-3 border-b border-gray-800 px-4 py-2.5 text-left last:border-b-0 hover:bg-gray-800/70"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{cuenta.responsable_nombre}</span>
                          <span className="whitespace-nowrap text-sm text-gray-400">${fmt(cuenta.x_pagar)}</span>
                          <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </AppCard>
        )
      })}
    </div>
  )
}
