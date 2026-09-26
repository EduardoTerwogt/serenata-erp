'use client'

import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { fmtMoney } from '@/lib/quotations/format'
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden, type OrdenHistorial, type PreviewOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import type { AvisoItem, AvisosRespuesta, CategoriaAviso } from '@/lib/shared/cuentas/periodo-tipos'
import { fechaCorta, plural } from '../formato'
import type { PantallaCuentas } from '../useCuentasUrl'
import { HistorialInline } from './HistorialOrdenes'
import { totalesPreviewCliente } from './totales'
import { useHistorial, usePreviewOrden } from './useOrdenes'

const CHIP_AVISO: Record<CategoriaAviso, { label: string; tone: StatusTone }> = {
  vencidos: { label: 'Vencido', tone: 'cancelled' },
  por_vencer: { label: 'Por vencer', tone: 'issued' },
  facturas_proveedor: { label: 'Sin factura', tone: 'draft' },
  complementos: { label: 'Sin complemento', tone: 'draft' },
  por_emitir: { label: 'Sin factura', tone: 'draft' },
}

export const TONO_ORDEN: Record<EstadoOrden, StatusTone> = {
  GENERADA: 'issued',
  PARCIALMENTE_PAGADA: 'issued',
  COMPLETADA: 'approved',
  VENCIDA: 'cancelled',
  CANCELADA: 'cancelled',
}

interface Props {
  pantalla: PantallaCuentas
  avisos: AvisosRespuesta | null
  avisosError: string | null
  onPantalla: (p: PantallaCuentas) => void
  onClose: () => void
  /** Tocar un aviso: limpia filtros, fija año y mes del evento y abre el proyecto. */
  onAviso: (a: AvisoItem) => void
  onGenerar: () => void
  onHistorial: () => void
  /** Una orden se canceló: la lista y los avisos se vuelven a pedir. */
  onOrdenCambio: () => void
  escritorio: boolean
}

/**
 * Panel "Avisos y órdenes" (B6, S10): lateral de 400px con pestañas en
 * escritorio; en móvil, pantallas empujadas "‹ Cuentas" (Avisos u Órdenes de pago).
 */
export function PanelAvisosOrdenes({ pantalla, avisos, avisosError, onPantalla, onClose, onAviso, onGenerar, onHistorial, onOrdenCambio, escritorio }: Props) {
  const preview = usePreviewOrden(pantalla === 'ordenes')
  const ultimas = useHistorial(pantalla === 'ordenes' && escritorio, {}, 5)
  const totalOrdenes = ultimas.datos?.total_rows

  return (
    <Drawer
      title={escritorio ? 'Avisos y órdenes' : pantalla === 'avisos' ? 'Avisos' : 'Órdenes de pago'}
      backLabel="Cuentas"
      onClose={onClose}
      toolbar={
        <FilterTabs
          tabs={[
            { value: 'avisos' as const, label: 'Avisos', count: avisos?.total },
            { value: 'ordenes' as const, label: 'Órdenes', count: totalOrdenes },
          ]}
          value={pantalla}
          onChange={onPantalla}
        />
      }
    >
      {pantalla === 'avisos' ? (
        <ListaAvisos avisos={avisos} error={avisosError} onAviso={onAviso} />
      ) : (
        <div className="flex flex-col gap-[22px]">
          <NuevaOrden preview={preview.datos} error={preview.error} onGenerar={onGenerar} />
          {escritorio ? (
            <UltimasOrdenes ordenes={ultimas.datos?.rows ?? null} total={totalOrdenes ?? 0} error={ultimas.error} onVerTodo={onHistorial} />
          ) : (
            <HistorialInline onOrdenCambio={onOrdenCambio} />
          )}
        </div>
      )}
    </Drawer>
  )
}

function ListaAvisos({ avisos, error, onAviso }: { avisos: AvisosRespuesta | null; error: string | null; onAviso: (a: AvisoItem) => void }) {
  if (error && !avisos) return <StatusBanner tone="error">{error}</StatusBanner>
  if (!avisos) return <SectionLoading className="min-h-[200px]" />
  if (avisos.total === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] text-subtext">
        <Icon name="circle-check" size={22} className="text-approved-fg" />
        Sin avisos pendientes.
      </div>
    )
  return (
    <div className="flex flex-col gap-5">
      {avisos.categorias.map((cat) => (
        <section key={cat.categoria} aria-label={cat.etiqueta} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="sn-caption">{cat.etiqueta}</span>
            <span className="text-[11px] text-subtext">{cat.total}</span>
          </div>
          {cat.items.map((a) => (
            <button
              key={`${cat.categoria}:${a.key}`}
              type="button"
              onClick={() => onAviso(a)}
              className="flex flex-col gap-1 rounded-panel border border-hairline bg-card px-3.5 py-3 text-left shadow-card hover:bg-row-alt md:bg-row"
            >
              <div className="flex items-center gap-2">
                <span className="sn-folio text-[11px] text-accent">{a.proyecto_id}</span>
                <StatusBadge tone={CHIP_AVISO[a.categoria].tone} className="!h-5 !min-w-0 text-[10.5px]">
                  {CHIP_AVISO[a.categoria].label}
                </StatusBadge>
                <span className="ml-auto whitespace-nowrap text-[14px] font-semibold text-ink">{fmtMoney(a.monto)}</span>
              </div>
              <span className="text-[13.5px] font-medium text-ink">
                {a.contraparte} · {a.proyecto_nombre}
              </span>
              <span className="text-[12px] text-subtext">{a.detalle}</span>
            </button>
          ))}
          {cat.total > cat.items.length && (
            <span className="px-1 text-[12px] text-subtext">
              Y {plural(cat.total - cat.items.length, 'aviso más', 'avisos más')}, los menos urgentes.
            </span>
          )}
        </section>
      ))}
    </div>
  )
}

function NuevaOrden({ preview, error, onGenerar }: { preview: PreviewOrden | null; error: string | null; onGenerar: () => void }) {
  const t = preview ? totalesPreviewCliente(preview) : null
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-hairline bg-card p-4 shadow-card md:bg-row">
      <div className="text-[14px] font-semibold text-ink">Nueva orden de pago</div>
      {error && !preview ? (
        <StatusBanner tone="error">{error}</StatusBanner>
      ) : !t ? (
        <span className="text-[12.5px] text-subtext">Calculando…</span>
      ) : t.cuentas === 0 ? (
        <span className="text-[12.5px] leading-normal text-subtext">No hay pagos a proveedor facturados de eventos ya realizados.</span>
      ) : (
        <span className="text-[12.5px] leading-normal text-subtext">
          Incluye pagos a proveedor facturados de eventos ya realizados:{' '}
          <strong className="font-semibold text-ink">
            {plural(t.cuentas, 'cuenta', 'cuentas')} · {plural(t.responsables, 'proveedor', 'proveedores')} · {fmtMoney(t.total)} a transferir
          </strong>
        </span>
      )}
      <Button iconLeft="file-text" fullWidth onClick={onGenerar} disabled={!t}>
        Revisar y generar
      </Button>
    </div>
  )
}

export function FilaOrdenCorta({ o }: { o: OrdenHistorial }) {
  return (
    <div className="flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{(o.pdf_nombre ?? 'Orden de pago').replace(/\.pdf$/i, '')}</div>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge tone={TONO_ORDEN[o.estado]} className="!h-5 text-[10.5px]">
            {ETIQUETA_ESTADO_ORDEN[o.estado]}
          </StatusBadge>
          <span className="text-[11px] text-subtext">{fechaCorta(o.fecha_generacion)}</span>
        </div>
      </div>
      <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{fmtMoney(o.monto)}</span>
      {o.pdf_url ? (
        <a href={o.pdf_url} target="_blank" rel="noreferrer" aria-label={`Descargar ${o.pdf_nombre ?? 'orden'}`} className="text-subtext hover:text-body">
          <Icon name="file-down" size={16} />
        </a>
      ) : (
        <span className="w-4" />
      )}
    </div>
  )
}

function UltimasOrdenes({ ordenes, total, error, onVerTodo }: { ordenes: OrdenHistorial[] | null; total: number; error: string | null; onVerTodo: () => void }) {
  return (
    <section aria-label="Últimas órdenes" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="sn-caption">Últimas órdenes</span>
        {total > 0 && (
          <button type="button" onClick={onVerTodo} className="text-[12.5px] font-medium text-accent hover:underline">
            Ver todo ({total})
          </button>
        )}
      </div>
      {error && !ordenes ? (
        <StatusBanner tone="error">{error}</StatusBanner>
      ) : !ordenes ? (
        <SectionLoading className="min-h-[120px]" />
      ) : ordenes.length === 0 ? (
        <div className="rounded-panel border border-hairline px-3.5 py-3 text-[12.5px] text-faint">Aún no hay órdenes generadas.</div>
      ) : (
        <div className="overflow-hidden rounded-panel border border-hairline">
          {ordenes.map((o) => (
            <FilaOrdenCorta key={o.id} o={o} />
          ))}
        </div>
      )}
    </section>
  )
}
