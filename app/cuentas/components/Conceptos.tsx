'use client'

import { ResponsiveTableCard, type TableGroup } from '@/components/ResponsiveTableCard'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import { SIN_PROYECTO_ID, type ConceptoLista, type ConceptoVista } from '@/lib/shared/cuentas/periodo-tipos'
import { ChipsCompartidos } from './acciones/ChipsCompartidos'
import { montoAprox, cobroSinFactura } from './resumen-proyecto'
import { TONO } from './ui'

const td = 'px-[var(--row-pad-x)] align-middle'
const tdDenso = 'px-3 align-middle first:pl-4 last:pr-4'

export function PagadoTotal({ c }: { c: Pick<ConceptoVista, 'pagado' | 'total' | 'total_estimado'> }) {
  return (
    <span className="whitespace-nowrap text-ink" title={c.total_estimado ? 'Total estimado con el régimen del proveedor: aún no hay factura validada' : undefined}>
      {fmtMoney(c.pagado)} / {montoAprox(c.total, c.total_estimado)}
    </span>
  )
}

/**
 * Siguiente paso del concepto. Con `onAccion` (panel del proyecto, #140) es un botón que abre la ventana del paso; sin
 * él, texto (vista Lista, proyectos históricos y conceptos sin proyecto). `en_orden` no tiene destino: siempre texto.
 */
export function SiguientePaso({ c, onAccion }: { c: ConceptoVista; onAccion?: (c: ConceptoVista) => void }) {
  if (!c.paso_etiqueta) return <span className="text-faint">—</span>
  const urgente = c.paso_urgente || cobroSinFactura(c)
  const boton = onAccion && c.proyecto_id && c.paso !== 'en_orden'
  return (
    <span className="block min-w-0">
      {boton ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAccion(c)
          }}
          className={`inline-flex h-7 max-w-full items-center whitespace-nowrap rounded-control border px-[11px] text-[12px] font-semibold ${urgente ? 'border-transparent bg-cancelled-bg text-cancelled-fg' : 'border-hairline bg-card text-ink hover:bg-row-alt'}`}
        >
          {c.paso_etiqueta}
        </button>
      ) : (
        <span className={`block font-medium ${urgente ? 'text-cancelled-fg' : 'text-ink'}`}>{c.paso_etiqueta}</span>
      )}
      {c.vencimiento && (
        <span className={`block text-[10.5px] ${c.vencimiento.vencido ? 'text-cancelled-fg' : 'text-subtext'}`}>{c.vencimiento.texto}</span>
      )}
    </span>
  )
}

export function Chip({ c, alerta }: { c: Pick<ConceptoVista, 'tono' | 'etiqueta'>; alerta?: boolean }) {
  return <StatusBadge tone={alerta ? 'cancelled' : TONO[c.tono]}>{c.etiqueta}</StatusBadge>
}

/** "Entradas · Clientes" o "Salidas · Proveedores" del proyecto abierto. */
export function TablaConceptos({ tipo, conceptos, onAbrir, onAccion }: { tipo: 'cobro' | 'pago'; conceptos: ConceptoVista[]; onAbrir: (c: ConceptoVista) => void; onAccion?: (c: ConceptoVista) => void }) {
  const titulo = tipo === 'cobro' ? 'Entradas · Clientes' : 'Salidas · Proveedores'
  const total = conceptos.reduce((s, c) => s + c.total, 0)
  return (
    <section aria-label={titulo} className="min-w-0 overflow-hidden rounded-panel border border-hairline md:rounded-[10px]">
      <div className="flex items-center justify-between bg-row-alt px-3.5 py-2.5 md:px-4 md:py-[11px]">
        <span className="sn-caption">{titulo}</span>
        <span className="text-[11.5px] text-subtext md:text-[12px]">Total {fmtMoney(total)}</span>
      </div>
      {conceptos.length === 0 ? (
        <div className="border-t border-hairline px-4 py-3.5 text-[12.5px] text-faint">Sin conceptos con estos filtros</div>
      ) : (
        <ResponsiveTableCard
          data={conceptos}
          mobileLayout="list"
          framed={false}
          dense
          minWidth={560}
          onRowClick={onAbrir}
          keyExtractor={(c) => c.key}
          columns={[
            { key: 'contraparte', label: tipo === 'cobro' ? 'Cliente' : 'Proveedor', width: '21%' },
            { key: 'concepto', label: 'Concepto', width: '22%' },
            { key: 'monto', label: 'Pagado / Total', align: 'right', width: '27%' },
            { key: 'estado', label: 'Estado', align: 'center', width: '108px' },
            { key: 'paso', label: 'Siguiente paso', width: '19%' },
          ]}
          renderDesktopRow={(c) => (
            <>
              <td className={`${tdDenso} truncate font-semibold text-ink`}>{c.contraparte}</td>
              <td className={`${tdDenso} py-1.5 text-body`}>
                <span className="block truncate">{c.concepto}</span>
                <ChipsCompartidos c={c} />
              </td>
              <td className={`${tdDenso} text-right`}>
                <PagadoTotal c={c} />
              </td>
              <td className={`${tdDenso} text-center`}>
                <Chip c={c} alerta={cobroSinFactura(c)} />
              </td>
              <td className={`${tdDenso} py-1.5`}>
                <SiguientePaso c={c} onAccion={onAccion} />
              </td>
            </>
          )}
          renderMobileCard={(c) => (
            <div className="flex flex-col gap-0.5 px-3.5 py-[9px]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{c.contraparte}</span>
                <Chip c={c} alerta={cobroSinFactura(c)} />
              </div>
              <div className="flex justify-between gap-2.5 text-[12px]">
                <span className="flex min-w-0 flex-1 flex-col text-subtext">
                  <span className="truncate">{c.concepto}</span>
                  <ChipsCompartidos c={c} />
                </span>
                <PagadoTotal c={c} />
              </div>
              {onAccion && c.paso_etiqueta && (
                <div className="flex justify-end pt-1">
                  <SiguientePaso c={c} onAccion={onAccion} />
                </div>
              )}
            </div>
          )}
        />
      )}
    </section>
  )
}

function IconoTipo({ tipo }: { tipo: 'cobro' | 'pago' }) {
  return tipo === 'cobro' ? (
    <Icon name="arrow-down-left" size={15} className="text-approved-fg" aria-label="Entrada" />
  ) : (
    <Icon name="arrow-up-right" size={15} className="text-subtext" aria-label="Salida" />
  )
}

/** Vista Lista: todos los conceptos del periodo, agrupables por mes. */
export function ListaConceptos({ grupos, pie, onAbrir }: { grupos: TableGroup<ConceptoLista>[]; pie: React.ReactNode; onAbrir: (c: ConceptoLista) => void }) {
  return (
    <div className="flex flex-col gap-3.5 px-4 md:gap-0 md:overflow-hidden md:rounded-panel md:border md:border-hairline md:bg-card md:px-0 md:shadow-card">
      <ResponsiveTableCard
        data={[]}
        groups={grupos}
        mobileLayout="list"
        onRowClick={onAbrir}
        minWidth={900}
        emptyMessage="Sin conceptos con estos filtros"
        keyExtractor={(c) => c.key}
        columns={[
          { key: 'tipo', label: '', width: '38px' },
          { key: 'folio', label: 'Folio', width: '80px' },
          { key: 'proyecto', label: 'Proyecto', width: '15%' },
          { key: 'contraparte', label: 'Contraparte', width: '16%' },
          { key: 'concepto', label: 'Concepto', width: '17%' },
          { key: 'monto', label: 'Pagado / Total', align: 'right', width: '19%' },
          { key: 'estado', label: 'Estado', width: '112px' },
          { key: 'paso', label: 'Siguiente paso', width: '14%' },
        ]}
        renderDesktopRow={(c) => (
          <>
            <td className={td}>
              <IconoTipo tipo={c.tipo} />
            </td>
            <td className={`${td} sn-folio`}>{c.proyecto.id === SIN_PROYECTO_ID ? '—' : c.proyecto.id}</td>
            <td className={`${td} truncate text-body`}>{c.proyecto.nombre}</td>
            <td className={`${td} py-1.5`}>
              <span className="block truncate font-semibold text-ink">{c.contraparte}</span>
              <span className="block text-[10.5px] text-subtext">{c.tipo === 'cobro' ? 'Cliente' : 'Proveedor'}</span>
            </td>
            <td className={`${td} py-1.5 text-body`}>
              <span className="block truncate">{c.concepto}</span>
              <ChipsCompartidos c={c} />
            </td>
            <td className={`${td} text-right`}>
              <PagadoTotal c={c} />
            </td>
            <td className={td}>
              <Chip c={c} />
            </td>
            <td className={`${td} py-1.5`}>
              <SiguientePaso c={c} />
            </td>
          </>
        )}
        renderMobileCard={(c) => (
          <div className="flex gap-2.5 px-3.5 py-[9px]">
            <span className="pt-0.5">
              <IconoTipo tipo={c.tipo} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{c.contraparte}</span>
                <Chip c={c} />
              </div>
              <div className="flex justify-between gap-2.5 text-[12px]">
                <span className="flex min-w-0 flex-1 flex-col text-subtext">
                  <span className="truncate">
                    {c.proyecto.nombre} · {c.concepto}
                  </span>
                  <ChipsCompartidos c={c} />
                </span>
                <PagadoTotal c={c} />
              </div>
            </div>
          </div>
        )}
      />
      {pie}
    </div>
  )
}
