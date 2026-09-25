import { fmtMoney } from '@/lib/quotations/format'
import type { TotalesPeriodo } from '@/lib/shared/cuentas/periodo-tipos'

interface Tarjeta {
  k: string
  v: number
  acento?: boolean
  nota?: string
  sub: { k: string; v: number }[]
}

function tarjetas(t: TotalesPeriodo): Tarjeta[] {
  return [
    { k: 'Ingresos', v: t.ingresos.total, sub: [{ k: 'Cobrado', v: t.ingresos.cobrado }, { k: 'Por cobrar', v: t.ingresos.por_cobrar }] },
    {
      k: 'Egresos',
      v: t.egresos.total,
      nota: 'IVA incluido, menos retenciones',
      sub: [{ k: 'Pagado', v: t.egresos.pagado }, { k: 'Por pagar', v: t.egresos.por_pagar }],
    },
    {
      k: 'Utilidad bruta',
      v: t.utilidad.bruta,
      acento: true,
      sub: [{ k: 'ISR estimado', v: -t.utilidad.isr_estimado }, { k: 'Neta estimada', v: t.utilidad.neta }],
    },
    {
      k: 'Impuestos',
      v: t.impuestos.total,
      sub: [
        { k: 'IVA a enterar', v: t.impuestos.iva_a_enterar },
        { k: 'Retenciones', v: t.impuestos.retenciones },
        { k: 'ISR estimado', v: t.impuestos.isr_estimado },
      ],
    },
  ]
}

function Desglose({ sub, nota }: { sub: Tarjeta['sub']; nota?: string }) {
  return (
    <div className="mt-1.5 flex flex-col gap-px border-t border-hairline pt-1.5">
      {sub.map((l) => (
        <div key={l.k} className="flex justify-between gap-2.5 text-[11px] leading-[1.35]">
          <span className="text-subtext">{l.k}</span>
          <span className="whitespace-nowrap text-body">{fmtMoney(l.v)}</span>
        </div>
      ))}
      {nota && <div className="text-[10.5px] leading-[1.35] text-faint">{nota}</div>}
    </div>
  )
}

/**
 * Las 4 tarjetas del periodo (D4). Ingresos y Egresos llevan IVA de terceros,
 * así que Utilidad bruta no es su resta: sale del cierre (decisión 006).
 */
export function Totales({ totales, alcance }: { totales: TotalesPeriodo; alcance: string }) {
  const lista = tarjetas(totales)
  return (
    <section aria-label="Totales del periodo" className="flex flex-col gap-1.5 md:gap-2">
      <div className="px-4 text-[12px] text-subtext md:px-0 md:text-[12.5px] md:font-semibold md:text-ink">{alcance}</div>
      <div className="hidden gap-3 md:grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {lista.map((t) => (
          <div key={t.k} className="min-w-0 rounded-panel border border-hairline bg-card px-3.5 py-2.5 shadow-card">
            <div className="sn-caption">{t.k}</div>
            <div className={`mt-0.5 whitespace-nowrap text-[17px] font-bold ${t.acento ? 'text-accent' : 'text-ink'}`}>{fmtMoney(t.v)}</div>
            <Desglose sub={t.sub} nota={t.nota} />
          </div>
        ))}
      </div>
      <div className="flex snap-x snap-mandatory items-start gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] md:hidden">
        {lista.map((t) => (
          <div key={t.k} className="flex-[0_0_74%] snap-start rounded-panel border border-hairline bg-card px-3 py-2 shadow-card">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="sn-caption">{t.k}</span>
              <span className={`whitespace-nowrap text-[17px] font-bold ${t.acento ? 'text-accent' : 'text-ink'}`}>{fmtMoney(t.v)}</span>
            </div>
            <Desglose sub={t.sub} nota={t.nota} />
          </div>
        ))}
      </div>
    </section>
  )
}
