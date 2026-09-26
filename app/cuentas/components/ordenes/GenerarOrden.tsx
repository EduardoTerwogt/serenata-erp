'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { ApiError } from '@/lib/client/api'
import { fmtMoney } from '@/lib/quotations/format'
import { totalesOrden } from '@/lib/shared/cuentas/orden-cruce'
import type { CruceOrden, OrdenGenerada, PreviewOrden, ResponsableOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import type { RegimenFiscal } from '@/lib/types'
import { fechaCorta, plural } from '../formato'
import { accionesOrden, compartirEnlace, usePreviewOrden } from './useOrdenes'

const REGIMEN: Record<RegimenFiscal, string> = { moral: 'Persona moral', fisica: 'Persona física', resico: 'RESICO' }
const ESPERA_MS = 2500
const INTENTOS_EN_PROCESO = 6

const nuevaLlave = () => crypto.randomUUID()

interface Props {
  onClose: () => void
  /** Después de generar: la lista, los avisos y las órdenes se vuelven a pedir. */
  onGenerada: () => void
  escritorio: boolean
}

/**
 * Generar orden (B6, D8, D20, S2, S9): modal de 820px / hoja al 92%. Cada
 * responsable se incluye o excluye con su casilla; tocar la fila la expande.
 * El pie fijo es la confirmación (D8): resumen, total a transferir y
 * "Generar orden PDF".
 */
export function GenerarOrden({ onClose, onGenerada, escritorio }: Props) {
  const { datos: preview, error, cargando, recargar } = usePreviewOrden(true)
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [llave, setLlave] = useState(nuevaLlave)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'error' | 'info'; texto: string } | null>(null)
  const [generada, setGenerada] = useState<OrdenGenerada | null>(null)

  const incluidos = useMemo(() => new Set((preview?.responsables ?? []).map((r) => r.clave).filter((c) => !excluidos.has(c))), [preview, excluidos])
  const t = preview ? totalesOrden(preview, incluidos) : null

  const alternar = (set: Set<string>, clave: string) => {
    const n = new Set(set)
    if (n.has(clave)) n.delete(clave)
    else n.add(clave)
    return n
  }

  const generar = async () => {
    if (!preview || !t || t.cuentas === 0 || enviando) return
    const seleccion = preview.responsables
      .filter((r) => incluidos.has(r.clave))
      .flatMap((r) => r.proyectos.map((p) => ({ tipo: p.tipo, id: p.id, monto_esperado: p.monto_esperado })))
    setEnviando(true)
    setAviso(null)
    try {
      for (let intento = 0; ; intento++) {
        try {
          const { orden } = await accionesOrden.generar(seleccion, llave)
          setGenerada(orden)
          onGenerada()
          return
        } catch (err) {
          // S9: otra petición con la misma llave sigue en curso: esperar y volver a preguntar.
          if (err instanceof ApiError && err.code === 'orden_en_proceso' && intento < INTENTOS_EN_PROCESO) {
            setAviso({ tono: 'info', texto: 'La orden se está generando…' })
            await new Promise((r) => setTimeout(r, ESPERA_MS))
            continue
          }
          throw err
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'candidatos_cambiaron') {
        // S2: saldos distintos a los que se vieron. Nueva vista previa y nueva llave.
        setLlave(nuevaLlave())
        setExcluidos(new Set())
        recargar()
      }
      setAviso({ tono: 'error', texto: err instanceof Error ? err.message : 'No se pudo generar la orden de pago' })
    } finally {
      setEnviando(false)
    }
  }

  const pie =
    !generada && t ? (
      <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:gap-5 md:px-[22px]">
        <div className="flex items-end justify-between gap-3 md:flex-1">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink">
              {plural(t.cuentas, 'cuenta', 'cuentas')} · {plural(t.responsables, 'responsable', 'responsables')}
            </div>
            <div className="mt-0.5 text-[11.5px] text-subtext">
              <span className="hidden md:inline">Subtotal {fmtMoney(t.cruce.subtotal)} · </span>IVA {fmtMoney(t.cruce.iva)} · Ret. {fmtMoney(-(t.cruce.iva_retenido + t.cruce.isr_retenido))}
            </div>
          </div>
          <div className="text-right md:ml-auto">
            <div className="text-[11.5px] text-subtext">Total a transferir</div>
            <div className="text-[22px] font-bold text-ink">{fmtMoney(t.cruce.total)}</div>
          </div>
        </div>
        <div className="flex gap-2.5">
          {escritorio && (
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button iconLeft="file-text" onClick={generar} disabled={t.cuentas === 0 || enviando || cargando} fullWidth={!escritorio}>
            {enviando ? 'Generando…' : 'Generar orden PDF'}
          </Button>
        </div>
      </div>
    ) : undefined

  return (
    <Modal
      title="Generar orden de pago"
      eyebrow="Órdenes de pago"
      size="820"
      mobile="sheet"
      sheetHeight="92%"
      closeOnEscape
      footer={pie}
      bodyClassName="flex flex-col gap-4 [&>*]:shrink-0 px-4 pb-6 pt-4 md:px-[22px] md:pt-5"
      onClose={onClose}
    >
      {generada ? (
        <OrdenLista orden={generada} onClose={onClose} escritorio={escritorio} />
      ) : (
        <>
          {aviso && <StatusBanner tone={aviso.tono}>{aviso.texto}</StatusBanner>}
          {error && !preview && <StatusBanner tone="error">{error}</StatusBanner>}
          {!preview && !error && <SectionLoading className="min-h-[240px]" />}
          {preview && <Contenido preview={preview} incluidos={incluidos} abiertos={abiertos} onIncluir={(c) => setExcluidos((s) => alternar(s, c))} onAbrir={(c) => setAbiertos((s) => alternar(s, c))} />}
        </>
      )}
    </Modal>
  )
}

function Contenido({ preview, incluidos, abiertos, onIncluir, onAbrir }: { preview: PreviewOrden; incluidos: Set<string>; abiertos: Set<string>; onIncluir: (c: string) => void; onAbrir: (c: string) => void }) {
  return (
    <>
      <p className="text-[13px] leading-normal text-subtext">Cuentas por pagar con factura del proveedor, de eventos ya realizados, agrupadas por responsable.</p>
      {preview.responsables.length === 0 && (
        <div className="rounded-panel border border-hairline px-4 py-5 text-center text-[13px] text-subtext">No hay pagos a proveedor listos para una orden.</div>
      )}
      {preview.responsables.map((r) => (
        <TarjetaResponsable key={r.clave} r={r} incluido={incluidos.has(r.clave)} abierto={abiertos.has(r.clave)} onIncluir={() => onIncluir(r.clave)} onAbrir={() => onAbrir(r.clave)} />
      ))}
      {preview.no_incluidas.length > 0 && (
        <section aria-label="No incluidas" className="flex flex-col gap-2">
          <span className="sn-caption">No incluidas</span>
          <div className="overflow-hidden rounded-panel border border-hairline">
            {preview.no_incluidas.map((n) => (
              <div key={`${n.tipo}:${n.id}`} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-[12.5px] first:border-t-0">
                <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
                  <div className="truncate">
                    <span className="sn-folio text-[11px] text-accent">{n.proyecto_id ?? '—'}</span>
                    <span className="text-ink"> · {n.responsable_nombre ?? 'Sin asignar'}</span>
                  </div>
                  <div className="truncate text-subtext md:ml-auto">{n.motivo_texto}</div>
                </div>
                <span className="whitespace-nowrap text-faint">{fmtMoney(n.monto)}</span>
              </div>
            ))}
            {preview.no_incluidas_total > preview.no_incluidas.length && (
              <div className="border-t border-hairline px-3.5 py-2.5 text-[12px] text-subtext">
                y {plural(preview.no_incluidas_total - preview.no_incluidas.length, 'cuenta más', 'cuentas más')} sin incluir
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}

function TarjetaResponsable({ r, incluido, abierto, onIncluir, onAbrir }: { r: ResponsableOrden; incluido: boolean; abierto: boolean; onIncluir: () => void; onAbrir: () => void }) {
  const resto = [plural(r.proyectos.length, 'cuenta', 'cuentas'), r.banco && r.clabe ? `${r.banco} ••${r.clabe.slice(-4)}` : r.banco].filter(Boolean).join(' · ')
  const regimen = r.regimen_fiscal ? REGIMEN[r.regimen_fiscal] : 'Régimen sin capturar'
  // Móvil: régimen corto ("Física · 1 cuenta · BBVA ••3332"), como en el diseño.
  const sub = (
    <>
      <span className="md:hidden">{regimen.replace(/^Persona /, '').replace(/^./, (c) => c.toUpperCase())}</span>
      <span className="max-md:hidden">{regimen}</span> · {resto}
    </>
  )
  return (
    <div className={`overflow-hidden rounded-panel border ${incluido ? 'border-hairline' : 'border-hairline opacity-60'} bg-card`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Checkbox checked={incluido} onChange={onIncluir} label={`Incluir a ${r.nombre}`} />
        <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold text-ink">{r.nombre}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-subtext">{sub}</div>
          </div>
          <span className={`whitespace-nowrap text-[16px] font-bold ${incluido ? 'text-accent' : 'text-subtext'}`}>{fmtMoney(r.cruce.total)}</span>
          <Icon name={abierto ? 'chevron-up' : 'chevron-down'} size={16} className="text-subtext" />
        </button>
      </div>
      {abierto && (
        <div className="border-t border-hairline">
          <div className="grid grid-cols-2 gap-3 bg-row-alt px-4 py-3 text-[12.5px] md:grid-cols-[1fr_1.4fr_1.6fr]">
            <Dato k="Banco" v={r.banco} />
            <Dato k="CLABE" v={r.clabe} mono />
            <Dato k="Correo" v={r.correo} />
          </div>
          {r.proyectos.map((p) => (
            <div key={`${p.tipo}:${p.id}`} className="grid gap-4 border-t border-hairline px-4 py-3.5 md:grid-cols-[1fr_250px]">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex justify-between gap-3">
                  <Dato k="Proyecto" v={p.proyecto_nombre} fuerte />
                  <Dato k="Fecha del evento" v={p.fecha_evento ? fechaCorta(p.fecha_evento) : '—'} derecha />
                </div>
                <div className="flex justify-between border-b border-hairline pb-1.5 text-[10.5px] font-semibold tracking-[0.04em] text-subtext">
                  <span>CONCEPTO</span>
                  <span>MONTO</span>
                </div>
                {p.items.map((it) => (
                  <div key={it.cuenta_id} className="flex justify-between gap-3 border-b border-hairline pb-1.5 text-[12.5px]">
                    <span className="min-w-0 text-ink">
                      {it.descripcion} {it.cantidad > 1 && <span className="text-faint">×{it.cantidad}</span>}
                    </span>
                    <span className="whitespace-nowrap text-ink">{fmtMoney(it.saldo)}</span>
                  </div>
                ))}
                <div className="flex justify-end gap-3 text-[12px]">
                  <span className="text-subtext">Subtotal del proyecto</span>
                  <span className="font-semibold text-ink">{fmtMoney(p.cruce.subtotal)}</span>
                </div>
              </div>
              <CajaCruce c={p.cruce} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Dato({ k, v, mono = false, fuerte = false, derecha = false }: { k: string; v: string | null; mono?: boolean; fuerte?: boolean; derecha?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${derecha ? 'items-end text-right' : ''}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext">{k}</span>
      <span className={`truncate ${mono ? 'font-mono' : ''} ${fuerte ? 'font-semibold' : ''} text-[12.5px] text-ink`}>{v || '—'}</span>
    </div>
  )
}

export function CajaCruce({ c }: { c: CruceOrden }) {
  const fila = (k: string, v: number) => (
    <div className="flex justify-between gap-3 py-1 text-subtext">
      <span>{k}</span>
      <span className="whitespace-nowrap text-body">{fmtMoney(v)}</span>
    </div>
  )
  return (
    <div className="self-start rounded-panel bg-row-alt px-3.5 py-2.5 text-[12.5px]">
      {fila('Subtotal', c.subtotal)}
      {fila('IVA 16%', c.iva)}
      {c.iva_retenido > 0 && fila('Retención de IVA', -c.iva_retenido)}
      {c.isr_retenido > 0 && fila('Retención de ISR', -c.isr_retenido)}
      <div className="mt-1.5 flex justify-between gap-3 border-t border-hairline pt-2 font-semibold text-ink">
        <span>A transferir</span>
        <span className="whitespace-nowrap">{fmtMoney(c.total)}</span>
      </div>
    </div>
  )
}

function OrdenLista({ orden, onClose, escritorio }: { orden: OrdenGenerada; onClose: () => void; escritorio: boolean }) {
  const [copiado, setCopiado] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-approved-bg text-approved-fg">
        <Icon name="check" size={20} />
      </span>
      <div className="text-[17px] font-semibold text-ink">Orden generada</div>
      <div className="max-w-[420px] text-[12.5px] leading-normal text-subtext">
        {orden.pdf_nombre} · {plural(orden.cuentas, 'cuenta', 'cuentas')} · {fmtMoney(orden.total_transferir)}
        <br />
        Las cuentas incluidas pasan a En orden de pago.
      </div>
      {copiado && <span className="text-[12px] text-approved-fg">{copiado}</span>}
      <div className="mt-1 flex gap-2.5">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        {orden.pdf_url &&
          (escritorio ? (
            <Button iconLeft="file-down" href={orden.pdf_url} target="_blank" rel="noreferrer">
              Descargar PDF
            </Button>
          ) : (
            <Button
              iconLeft="share"
              onClick={() =>
                void compartirEnlace(orden.pdf_url!, orden.pdf_nombre)
                  .then((r) => r === 'copiado' && setCopiado('Enlace copiado'))
                  .catch(() => undefined)
              }
            >
              Compartir PDF
            </Button>
          ))}
      </div>
    </div>
  )
}
