'use client'

import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { StatusBadge, toneForCuentaEstado } from '@/components/ui/StatusBadge'
import { TableFooter } from '@/components/ui/TableFooter'

type CuentaListItem =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

interface Props {
  tab: 'cobrar' | 'pagar'
  cuentas: CuentaListItem[]
  total: number
  onSelect: (cuenta: CuentaListItem) => void
  page?: number
  pageCount?: number
  onPageChange?: (page: number) => void
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

// Anchos de columna (CuentasScreen.jsx del kit) traducidos a % fijos vía
// colgroup + table-fixed -- así no cambian al filtrar/paginar.
const COL_WIDTHS_COBRAR = ['9%', '17%', '23%', '20%', '17%', '14%']
const COL_WIDTHS_PAGAR = ['9%', '21%', '16%', '21%', '20%', '13%']

export function CuentasTable({ tab, cuentas, total, onSelect, page, pageCount, onPageChange }: Props) {
  const columns = tab === 'cobrar'
    ? ['Folio', 'Cliente', 'Proyecto', 'Pagado / Total', 'Vencimiento', 'Estado']
    : ['Folio', 'Proyecto', 'Responsable', 'Descripción', 'Pagado / Total', 'Estado']
  const widths = tab === 'cobrar' ? COL_WIDTHS_COBRAR : COL_WIDTHS_PAGAR

  return (
    <div className="rounded-panel border border-hairline bg-card overflow-hidden">
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full table-fixed text-[length:var(--text-md)]">
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="h-9">
              {columns.map((column) => (
                <th key={column} className="sn-table-head truncate px-[var(--row-pad-x)] text-left align-middle">
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
                <tr key={`${cuenta.tipo}-${cuenta.id}`} className="h-[46px] odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt cursor-pointer" onClick={() => onSelect(cuenta)}>
                  <td className="truncate px-[var(--row-pad-x)] align-middle">
                    <div className="text-accent font-mono">
                      {cuenta.cotizacion_id}
                    </div>
                  </td>

                  {cuenta.tipo === 'cobrar' ? (
                    <>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-ink font-semibold">{cuenta.cliente}</td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{cuenta.proyecto}</td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-ink font-semibold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(cuenta.fecha_vencimiento)}</td>
                    </>
                  ) : (
                    <>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-ink font-semibold">{cuenta.proyecto_nombre || '—'}</td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">
                        <div className="truncate">{cuenta.responsable_nombre}</div>
                        {cuenta.correo && <div className="truncate text-[length:var(--text-xs)] text-faint">{cuenta.correo}</div>}
                      </td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">
                        <div className="truncate">{cuenta.item_descripcion || '—'}</div>
                        {cuenta.cantidad > 1 && <div className="truncate text-[length:var(--text-xs)] text-faint">Cantidad: {cuenta.cantidad}</div>}
                      </td>
                      <td className="truncate px-[var(--row-pad-x)] align-middle text-ink font-semibold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                    </>
                  )}

                  <td className="px-[var(--row-pad-x)] align-middle">
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

      <TableFooter shown={cuentas.length} total={total} unit="cuentas" page={page} pageCount={pageCount} onPageChange={onPageChange} />
    </div>
  )
}
