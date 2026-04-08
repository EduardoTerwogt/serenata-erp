'use client'

import { QuotationTotals } from '@/lib/quotations/types'
import { fmtCurrency } from '@/lib/quotations/format'

interface Props {
  totals: QuotationTotals
  editable: boolean
  porcentaje_fee: number
  setPorcentajeFee: (value: number) => void
  iva_activo: boolean
  setIvaActivo: (value: boolean | ((prev: boolean) => boolean)) => void
  descuento_tipo: 'monto' | 'porcentaje'
  setDescuentoTipo: (value: 'monto' | 'porcentaje') => void
  descuento_valor: number
  setDescuentoValor: (value: number) => void
}

export function QuotationTotalsPanels({
  totals,
  editable,
  porcentaje_fee,
  setPorcentajeFee,
  iva_activo,
  setIvaActivo,
  descuento_tipo,
  setDescuentoTipo,
  descuento_valor,
  setDescuentoValor,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Totales</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm gap-3">
            <span className="text-gray-400">Subtotal</span>
            <span className="text-white text-right">${fmtCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm items-start gap-3">
            <span className="text-gray-400 flex items-center gap-2 flex-wrap flex-1 min-w-0">
              Fee Agencia
              {editable ? (
                <>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={(porcentaje_fee * 100).toFixed(1)}
                    onChange={e => setPorcentajeFee((parseFloat(e.target.value) || 0) / 100)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-gray-500 text-xs">%</span>
                </>
              ) : (
                <span className="text-gray-500 text-xs">({(porcentaje_fee * 100).toFixed(0)}%)</span>
              )}
            </span>
            <span className="text-white text-right flex-shrink-0">${fmtCurrency(totals.fee_agencia)}</span>
          </div>
          <div className="flex justify-between text-sm gap-3">
            <span className="text-gray-400">General</span>
            <span className="text-white text-right">${fmtCurrency(totals.general)}</span>
          </div>
          <div className="flex justify-between text-sm items-center gap-3">
            <span className="text-gray-400 flex items-center gap-2 flex-wrap flex-1 min-w-0">
              IVA (16%)
              {editable && (
                <button
                  type="button"
                  onClick={() => setIvaActivo(v => typeof v === 'boolean' ? !v : true)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              )}
            </span>
            <span className={`${iva_activo ? 'text-white' : 'text-gray-600'} text-right flex-shrink-0`}>${fmtCurrency(totals.iva)}</span>
          </div>
          {editable ? (
            <div className="flex justify-between text-sm items-start gap-3">
              <div className="text-gray-400 flex-1 min-w-0">
                <div className="mb-2">Descuento</div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={descuento_tipo}
                    onChange={e => setDescuentoTipo(e.target.value as 'monto' | 'porcentaje')}
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="monto">$ Monto</option>
                    <option value="porcentaje">% Porcentaje</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={descuento_valor}
                    onChange={e => setDescuentoValor(parseFloat(e.target.value) || 0)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <span className={`${totals.descuento > 0 ? 'text-yellow-400' : 'text-gray-600'} text-right flex-shrink-0 pt-0.5`}>
                {totals.descuento > 0 ? `-$${fmtCurrency(totals.descuento)}` : '$0.00'}
              </span>
            </div>
          ) : totals.descuento > 0 ? (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-gray-400">Descuento</span>
              <span className="text-yellow-400 text-right">-${fmtCurrency(totals.descuento)}</span>
            </div>
          ) : null}
          <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-bold gap-3">
            <span className="text-white">TOTAL</span>
            <span className="text-green-400 text-lg text-right">${fmtCurrency(totals.total)}</span>
          </div>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Utilidad</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm gap-3">
            <span className="text-gray-400">Margen Total</span>
            <span className={`${totals.margen_total >= 0 ? 'text-green-400' : 'text-red-400'} text-right`}>${fmtCurrency(totals.margen_total)}</span>
          </div>
          <div className="flex justify-between text-sm gap-3">
            <span className="text-gray-400">Fee Agencia</span>
            <span className="text-white text-right">${fmtCurrency(totals.fee_agencia)}</span>
          </div>
          <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold gap-3">
            <span className="text-gray-300">Utilidad Total</span>
            <span className={`${totals.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'} text-right`}>${fmtCurrency(totals.utilidad_total)}</span>
          </div>
          {totals.subtotal > 0 && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-gray-400">Margen %</span>
              <span className="text-blue-400 text-right">{((totals.margen_total / totals.subtotal) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
