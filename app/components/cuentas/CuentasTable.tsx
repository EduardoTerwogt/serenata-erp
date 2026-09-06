'use client'

import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'

type CuentaListItem =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

interface Props {
  tab: 'cobrar' | 'pagar'
  cuentas: CuentaListItem[]
  onSelect: (cuenta: CuentaListItem) => void
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export function CuentasTable({ tab, cuentas, onSelect }: Props) {
  const columns = tab === 'cobrar'
    ? ['Folio', 'Cliente', 'Proyecto', 'Pagado / Total', 'Vencimiento', 'Estado']
    : ['Folio', 'Proyecto', 'Responsable', 'Descripción', 'Pagado / Total', 'Estado']

  return (
    <div className="rounded-panel border border-hairline bg-card overflow-hidden">
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-row-alt">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-6 py-3 text-left text-table-head font-semibold text-subtext">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {cuentas.map((cuenta) => {
              const saldoPagado = Number(cuenta.monto_pagado || 0)
              const montoTotal = cuenta.tipo === 'cobrar' ? cuenta.monto_total : cuenta.x_pagar

              return (
                <tr key={`${cuenta.tipo}-${cuenta.id}`} className="hover:bg-row transition-colors cursor-pointer" onClick={() => onSelect(cuenta)}>
                  <td className="px-6 py-4">
                    <div className="text-accent font-mono text-content">
                      {cuenta.cotizacion_id}
                    </div>
                  </td>

                  {cuenta.tipo === 'cobrar' ? (
                    <>
                      <td className="px-6 py-4 text-body font-medium">{cuenta.cliente}</td>
                      <td className="px-6 py-4 text-subtext">{cuenta.proyecto}</td>
                      <td className="px-6 py-4 text-ink font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                      <td className="px-6 py-4 text-subtext">{formatDateDisplay(cuenta.fecha_vencimiento)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-body font-medium">{cuenta.proyecto_nombre || '—'}</td>
                      <td className="px-6 py-4 text-subtext">
                        <div>{cuenta.responsable_nombre}</div>
                        {cuenta.correo && <div className="text-faint text-eyebrow mt-1">{cuenta.correo}</div>}
                      </td>
                      <td className="px-6 py-4 text-subtext">
                        <div>{cuenta.item_descripcion || '—'}</div>
                        {cuenta.cantidad > 1 && <div className="text-faint text-eyebrow mt-1">Cantidad: {cuenta.cantidad}</div>}
                      </td>
                      <td className="px-6 py-4 text-ink font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                    </>
                  )}

                  <td className="px-6 py-4">
                    <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden p-4 space-y-3">
        {cuentas.map((cuenta) => {
          const saldoPagado = Number(cuenta.monto_pagado || 0)
          const montoTotal = cuenta.tipo === 'cobrar' ? cuenta.monto_total : cuenta.x_pagar

          return (
            <div key={`${cuenta.tipo}-${cuenta.id}`} className="bg-row border border-hairline rounded-control p-4 cursor-pointer hover:bg-row-alt transition-colors" onClick={() => onSelect(cuenta)}>
              <div className="flex justify-between items-start mb-2 gap-3">
                <div className="font-mono text-accent text-content font-bold">
                  {cuenta.cotizacion_id}
                </div>
                <StatusBadge tone={toneForCuentaEstado(cuenta.estado)}>{cuenta.estado}</StatusBadge>
              </div>

              {cuenta.tipo === 'cobrar' ? (
                <>
                  <div className="text-body font-medium">{cuenta.cliente}</div>
                  <div className="text-subtext text-content">{cuenta.proyecto}</div>
                  <div className="flex justify-between text-content mt-3 pt-3 border-t border-hairline">
                    <span className="text-subtext">Pagado / Total</span>
                    <span className="text-ink font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</span>
                  </div>
                  <div className="flex justify-between text-content mt-2">
                    <span className="text-subtext">Vencimiento</span>
                    <span className="text-body">{formatDateDisplay(cuenta.fecha_vencimiento)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-body font-medium">{cuenta.proyecto_nombre || '—'}</div>
                  <div className="text-subtext text-content">{cuenta.responsable_nombre}</div>
                  <div className="text-body text-content mt-2">{cuenta.item_descripcion || '—'}</div>
                  <div className="flex justify-between text-content mt-3 pt-3 border-t border-hairline">
                    <span className="text-subtext">Pagado / Total</span>
                    <span className="text-ink font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
