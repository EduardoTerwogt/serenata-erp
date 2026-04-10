'use client'

import { CuentaCobrar, CuentaPagar, EstadoCuentaCobrar, EstadoCuentaPagar } from '@/lib/types'

type CuentaListItem =
  | ({ tipo: 'cobrar' } & CuentaCobrar)
  | ({ tipo: 'pagar' } & CuentaPagar)

interface Props {
  tab: 'cobrar' | 'pagar'
  cuentas: CuentaListItem[]
  onSelect: (cuenta: CuentaListItem) => void
}

const ESTADO_COBRAR_STYLE: Record<EstadoCuentaCobrar | 'PENDIENTE', string> = {
  FACTURA_PENDIENTE: 'bg-gray-600 text-gray-300',
  FACTURADO: 'bg-yellow-900 text-yellow-300',
  PARCIALMENTE_PAGADO: 'bg-blue-900 text-blue-300',
  PAGADO: 'bg-green-900 text-green-300',
  VENCIDO: 'bg-red-900 text-red-300',
  PENDIENTE: 'bg-gray-600 text-gray-300',
}

const ESTADO_PAGAR_STYLE: Record<EstadoCuentaPagar, string> = {
  PENDIENTE: 'bg-yellow-900 text-yellow-300',
  EN_PROCESO_PAGO: 'bg-orange-900 text-orange-300',
  PAGADO: 'bg-green-900 text-green-300',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export function CuentasTable({ tab, cuentas, onSelect }: Props) {
  const columns = tab === 'cobrar'
    ? ['Folio', 'Cliente', 'Proyecto', 'Pagado / Total', 'Vencimiento', 'Estado', 'Acción']
    : ['Folio', 'Proyecto', 'Responsable', 'Descripción', 'Pagado / Total', 'Estado', 'Acción']

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-800">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-6 py-3 text-left text-xs font-semibold text-gray-300">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {cuentas.map((cuenta) => {
              const saldoPagado = Number(cuenta.monto_pagado || 0)
              const montoTotal = cuenta.tipo === 'cobrar' ? cuenta.monto_total : cuenta.x_pagar
              const estadoStyle = cuenta.tipo === 'cobrar'
                ? ESTADO_COBRAR_STYLE[(cuenta.estado as EstadoCuentaCobrar | 'PENDIENTE')]
                : ESTADO_PAGAR_STYLE[cuenta.estado]

              return (
                <tr key={`${cuenta.tipo}-${cuenta.id}`} className="hover:bg-gray-800/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-blue-400 font-mono text-sm">
                      {cuenta.folio || cuenta.cotizacion_id}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">{cuenta.cotizacion_id}</div>
                  </td>

                  {cuenta.tipo === 'cobrar' ? (
                    <>
                      <td className="px-6 py-4 text-white font-medium">{cuenta.cliente}</td>
                      <td className="px-6 py-4 text-gray-300">{cuenta.proyecto}</td>
                      <td className="px-6 py-4 text-white font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                      <td className="px-6 py-4 text-gray-400">{cuenta.fecha_vencimiento || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-white font-medium">{cuenta.proyecto_nombre || '—'}</td>
                      <td className="px-6 py-4 text-gray-300">
                        <div>{cuenta.responsable_nombre}</div>
                        {cuenta.correo && <div className="text-gray-500 text-xs mt-1">{cuenta.correo}</div>}
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        <div>{cuenta.item_descripcion || '—'}</div>
                        {cuenta.cantidad > 1 && <div className="text-gray-500 text-xs mt-1">Cantidad: {cuenta.cantidad}</div>}
                      </td>
                      <td className="px-6 py-4 text-white font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</td>
                    </>
                  )}

                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${estadoStyle}`}>
                      {cuenta.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onSelect(cuenta)}
                      className="text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Ver detalle
                    </button>
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
          const estadoStyle = cuenta.tipo === 'cobrar'
            ? ESTADO_COBRAR_STYLE[(cuenta.estado as EstadoCuentaCobrar | 'PENDIENTE')]
            : ESTADO_PAGAR_STYLE[cuenta.estado]

          return (
            <div key={`${cuenta.tipo}-${cuenta.id}`} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2 gap-3">
                <div>
                  <div className="font-mono text-blue-400 text-sm font-bold">
                    {cuenta.folio || cuenta.cotizacion_id}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">{cuenta.cotizacion_id}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${estadoStyle}`}>
                  {cuenta.estado}
                </span>
              </div>

              {cuenta.tipo === 'cobrar' ? (
                <>
                  <div className="text-white font-medium">{cuenta.cliente}</div>
                  <div className="text-gray-400 text-sm">{cuenta.proyecto}</div>
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t border-gray-700">
                    <span className="text-gray-400">Pagado / Total</span>
                    <span className="text-white font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-400">Vencimiento</span>
                    <span className="text-gray-300">{cuenta.fecha_vencimiento || '—'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-white font-medium">{cuenta.proyecto_nombre || '—'}</div>
                  <div className="text-gray-400 text-sm">{cuenta.responsable_nombre}</div>
                  <div className="text-gray-300 text-sm mt-2">{cuenta.item_descripcion || '—'}</div>
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t border-gray-700">
                    <span className="text-gray-400">Pagado / Total</span>
                    <span className="text-white font-bold">${fmt(saldoPagado)} / ${fmt(montoTotal)}</span>
                  </div>
                </>
              )}

              <button
                onClick={() => onSelect(cuenta)}
                className="w-full text-xs bg-blue-800 hover:bg-blue-700 text-blue-200 px-3 py-2 rounded-lg transition-colors mt-4"
              >
                Ver detalle
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
