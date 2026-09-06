'use client'

import { EstimatedTaxes, QuotationTotals } from '@/lib/quotations/types'
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
  estimatedTaxes: EstimatedTaxes
}

const PANEL_CLASS = 'rounded-panel border border-hairline bg-card p-4 md:p-6'
const MINI_INPUT_CLASS = 'bg-input border border-hairline rounded-[8px] px-2 py-1.5 text-body text-sm focus:outline-none focus:border-accent-quiet'

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
  estimatedTaxes,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className={PANEL_CLASS}>
        <h3 className="sn-label mb-4">Totales</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm gap-3">
            <span className="text-subtext">Subtotal</span>
            <span className="text-body text-right">${fmtCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm items-start gap-3">
            <span className="text-subtext flex items-center gap-2 flex-wrap flex-1 min-w-0">
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
                    className={`w-16 ${MINI_INPUT_CLASS}`}
                  />
                  <span className="text-faint text-xs">%</span>
                </>
              ) : (
                <span className="text-faint text-xs">({(porcentaje_fee * 100).toFixed(0)}%)</span>
              )}
            </span>
            <span className="text-body text-right flex-shrink-0">${fmtCurrency(totals.fee_agencia)}</span>
          </div>
          <div className="flex justify-between text-sm gap-3">
            <span className="text-subtext">General</span>
            <span className="text-body text-right">${fmtCurrency(totals.general)}</span>
          </div>
          <div className="flex justify-between text-sm items-center gap-3">
            <span className="text-subtext flex items-center gap-2 flex-wrap flex-1 min-w-0">
              IVA (16%)
              {editable && (
                <button
                  type="button"
                  onClick={() => setIvaActivo(v => typeof v === 'boolean' ? !v : true)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-accent' : 'bg-row-alt'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              )}
            </span>
            <span className={`${iva_activo ? 'text-body' : 'text-faint'} text-right flex-shrink-0`}>${fmtCurrency(totals.iva)}</span>
          </div>
          {editable ? (
            <div className="flex justify-between text-sm items-start gap-3">
              <div className="text-subtext flex-1 min-w-0">
                <div className="mb-2">Descuento</div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={descuento_tipo}
                    onChange={e => setDescuentoTipo(e.target.value as 'monto' | 'porcentaje')}
                    className={MINI_INPUT_CLASS}
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
                    className={`w-24 ${MINI_INPUT_CLASS}`}
                  />
                </div>
              </div>
              <span className={`${totals.descuento > 0 ? 'text-yellow-400' : 'text-faint'} text-right flex-shrink-0 pt-0.5`}>
                {totals.descuento > 0 ? `-$${fmtCurrency(totals.descuento)}` : '$0.00'}
              </span>
            </div>
          ) : totals.descuento > 0 ? (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-subtext">Descuento</span>
              <span className="text-yellow-400 text-right">-${fmtCurrency(totals.descuento)}</span>
            </div>
          ) : null}
          <div className="border-t border-hairline pt-2 mt-1 flex justify-between font-bold gap-3">
            <span className="text-body">TOTAL</span>
            <span className="text-green-400 text-lg text-right">${fmtCurrency(totals.total)}</span>
          </div>
        </div>
      </div>
      <div className={PANEL_CLASS}>
        <h3 className="sn-label mb-4">Utilidad</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm gap-3">
            <span className="text-subtext">Margen Total</span>
            <span className={`${totals.margen_total >= 0 ? 'text-green-400' : 'text-red-400'} text-right`}>${fmtCurrency(totals.margen_total)}</span>
          </div>
          <div className="flex justify-between text-sm gap-3">
            <span className="text-subtext">Fee Agencia</span>
            <span className="text-body text-right">${fmtCurrency(totals.fee_agencia)}</span>
          </div>
          <div className="border-t border-hairline pt-2 mt-1 flex justify-between font-semibold gap-3">
            <span className="text-body">Utilidad Total</span>
            <span className={`${totals.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'} text-right`}>${fmtCurrency(totals.utilidad_total)}</span>
          </div>
          {totals.subtotal > 0 && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-subtext">Margen %</span>
              <span className="text-accent text-right">{((totals.margen_total / totals.subtotal) * 100).toFixed(1)}%</span>
            </div>
          )}

          <div className="border-t border-hairline pt-3 mt-3">
            <p className="sn-label mb-0.5">Impuestos (Estimado)</p>
            <p className="text-[11px] text-faint mb-3">Estimación de impuestos de Serenata (persona moral). No sustituye el cruce fiscal real de Cuentas.</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm gap-3">
                <span className="text-subtext">IVA cobrado</span>
                <span className="text-body text-right">${fmtCurrency(estimatedTaxes.ivaCobrado)}</span>
              </div>
              <div className="flex justify-between text-sm gap-3">
                <span className="text-subtext">IVA pagado (a proveedores)</span>
                <span className="text-body text-right">${fmtCurrency(estimatedTaxes.ivaPagado)}</span>
              </div>
              <div className="flex justify-between text-sm gap-3">
                <span className="text-subtext">IVA neto a enterar al SAT</span>
                <span className={`text-right font-medium ${estimatedTaxes.ivaNeto >= 0 ? 'text-yellow-400' : 'text-green-400'}`}>${fmtCurrency(estimatedTaxes.ivaNeto)}</span>
              </div>
              <div className="flex justify-between text-sm gap-3">
                <span className="text-subtext">ISR estimado (30%)</span>
                <span className="text-yellow-400 text-right">${fmtCurrency(estimatedTaxes.isrEstimado)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-hairline pt-2 mt-1 flex justify-between font-bold gap-3">
            <span className="text-body">Utilidad Neta (después de impuestos)</span>
            <span className={`text-lg text-right ${estimatedTaxes.utilidadNeta >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmtCurrency(estimatedTaxes.utilidadNeta)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
