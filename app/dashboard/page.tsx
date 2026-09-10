'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getJson, sendJson } from '@/lib/client/api'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionCard } from '@/components/ui/SectionCard'
import { Metric } from '@/components/ui/Metric'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { BarChart, type BarChartDatum } from '@/components/ui/BarChart'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ResponsiveTableCard } from '@/components/ResponsiveTableCard'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { SectionLoading } from '@/components/ui/SectionLoading'
import type { GastoFijo } from '@/lib/types'

type Periodo = 'mes' | 'trimestre' | 'anio'

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: 'Este mes',
  trimestre: 'Este trimestre',
  anio: 'Este año',
}

interface ResumenDashboard {
  periodo: Periodo
  periodoActual: { label: string; inicio: string; fin: string }
  kpis: { porCobrar: number; porPagar: number; cotizacionesAprobadas: number; cotizacionesBorrador: number }
  balance: BarChartDatum[]
  fiscal: { ingresos: number; egresos: number; impuestos: number; deudas: number; utilidadAntesIsr: number }
  cobertura: { gastosFijos: Array<{ id: string; nombre: string; monto: number }>; totalGastosFijos: number; facturado: number }
  actividad: { proyectosCreados: number; cotizacionesAprobadas: number; proyectosEnCurso: number }
  cotizacionesRecientes: Array<{ id: string; proyecto: string; cliente: string; total: number; estado: string; created_at: string }>
  fuentesConError: string[]
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

function FuenteError({ nombre, onRetry }: { nombre: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-cancelled-bg px-4 py-3 text-cancelled-fg">
      <Icon name="warning" size={17} />
      <div className="min-w-0 flex-1 text-sm">No se pudo cargar {nombre}. El resto del dashboard sigue disponible.</div>
      <button type="button" onClick={onRetry} className="flex-none rounded-control border border-hairline px-3 py-1.5 text-sm text-body hover:bg-row-alt transition-colors">
        Reintentar
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = useCallback(async (p: Periodo) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<ResumenDashboard>(`/api/dashboard/resumen?periodo=${p}`, 'Error obteniendo el resumen del dashboard')
      setResumen(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error obteniendo el resumen del dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar(periodo)
  }, [cargar, periodo])

  if (loading && !resumen) {
    return <SectionLoading />
  }

  if (error) {
    return (
      <div>
        <FuenteError nombre="el dashboard" onRetry={() => cargar(periodo)} />
      </div>
    )
  }

  if (!resumen) return null

  const cobertura = resumen.cobertura.totalGastosFijos > 0
    ? Math.min(100, (resumen.cobertura.facturado / resumen.cobertura.totalGastosFijos) * 100)
    : 0
  const excedente = resumen.cobertura.facturado - resumen.cobertura.totalGastosFijos
  const fuenteFallo = (nombre: string) => resumen.fuentesConError.includes(nombre)

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Inicio"
        action={
          <Select size="lg" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
              <option key={p} value={p}>{PERIODO_LABEL[p]}</option>
            ))}
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Por Cobrar" value={formatMoney(resumen.kpis.porCobrar)} accent onClick={() => router.push('/cuentas')} />
        <Metric label="Por Pagar" value={formatMoney(resumen.kpis.porPagar)} onClick={() => router.push('/cuentas')} />
        <Metric label="Cotizaciones Aprobadas" value={resumen.kpis.cotizacionesAprobadas} nota={resumen.periodoActual.label} onClick={() => router.push('/cotizaciones')} />
        <Metric label="En Borrador" value={resumen.kpis.cotizacionesBorrador} nota={resumen.periodoActual.label} onClick={() => router.push('/cotizaciones')} />
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <SectionCard
          title={`Balance por periodo · ${resumen.periodoActual.label}`}
          contentClassName="p-4 md:p-6"
          actions={
            <div className="flex items-center gap-3 text-xs text-subtext">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--sn-status-approved-fg)' }} />Ingresos</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Egresos</span>
            </div>
          }
        >
          {fuenteFallo('Pagos') || fuenteFallo('Cuentas por pagar') ? (
            <FuenteError nombre="el balance" onRetry={() => cargar(periodo)} />
          ) : (
            <>
              <BarChart data={resumen.balance} onBarClick={() => router.push('/cuentas')} format={formatMoney} />
              <p className="mt-3 text-xs text-faint">Da clic en cualquier periodo para abrir Cuentas.</p>
            </>
          )}
        </SectionCard>

        <SectionCard title="Cruce del periodo" contentClassName="p-4 md:p-6">
          <div className="flex flex-col gap-4">
            {[
              { label: 'Ingresos', v: resumen.fiscal.ingresos, className: 'text-ink' },
              { label: 'Egresos (cuentas liquidadas)', v: resumen.fiscal.egresos, className: 'text-body' },
              { label: 'Impuestos (ISR 30% estimado)', v: resumen.fiscal.impuestos, className: 'text-body' },
              { label: 'Deudas', v: resumen.fiscal.deudas, className: 'text-accent' },
            ].map((r) => (
              <div key={r.label}>
                <div className="sn-label mb-1">{r.label}</div>
                <div className={`sn-display text-h3 ${r.className}`}>{formatMoney(r.v)}</div>
              </div>
            ))}
            <div className="border-t border-hairline pt-3">
              <div className="sn-label mb-1">Utilidad antes de ISR</div>
              <div className="sn-display text-h2 text-approved-fg">{formatMoney(resumen.fiscal.utilidadAntesIsr)}</div>
              <div className="mt-1.5 text-xs text-subtext">ISR 30% sobre utilidad · persona moral (estimado)</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <SectionCard
          title="Gastos fijos vs. facturación"
          contentClassName="p-4 md:p-6"
          actions={
            <Button variant="secondary" size="md" onClick={() => setModalAbierto(true)} iconLeft="plus">
              Agregar gasto fijo
            </Button>
          }
        >
          {fuenteFallo('Gastos fijos') ? (
            <FuenteError nombre="los gastos fijos" onRetry={() => cargar(periodo)} />
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2.5 flex items-baseline justify-between">
                  <div className={`sn-display text-h2 ${excedente >= 0 ? 'text-approved-fg' : 'text-accent'}`}>
                    {excedente >= 0 ? '+' : '−'}{formatMoney(Math.abs(excedente))}
                  </div>
                  <div className="text-sm text-subtext">{Math.round(cobertura)}% cubierto</div>
                </div>
                <div className="h-[7px] w-full overflow-hidden rounded-pill bg-row">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${cobertura}%`, background: excedente >= 0 ? 'var(--sn-status-approved-fg)' : 'var(--accent)' }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {resumen.cobertura.gastosFijos.length === 0 && (
                  <p className="text-sm text-faint">Sin gastos fijos activos registrados.</p>
                )}
                {resumen.cobertura.gastosFijos.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 text-subtext">{g.nombre}</span>
                    <span className="text-body">{formatMoney(g.monto)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 border-t border-hairline pt-3 text-sm">
                  <span className="min-w-0 flex-1 font-semibold text-body">Gastos fijos del mes</span>
                  <span className="font-semibold text-ink">{formatMoney(resumen.cobertura.totalGastosFijos)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 font-semibold text-body">Facturado al cliente</span>
                  <span className="font-semibold text-ink">{formatMoney(resumen.cobertura.facturado)}</span>
                </div>
              </div>
              <p className="text-xs leading-snug text-faint">
                Considera el desfase: un proyecto puede facturarse al cliente en un mes distinto al que sus proveedores facturan.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Actividad del periodo" contentClassName="p-4 md:p-6">
          {fuenteFallo('Proyectos') && fuenteFallo('Cotizaciones') ? (
            <FuenteError nombre="la actividad" onRetry={() => cargar(periodo)} />
          ) : (
            <div className="flex flex-col gap-4">
              {[
                { label: 'Proyectos creados', v: resumen.actividad.proyectosCreados },
                { label: 'Cotizaciones aprobadas', v: resumen.actividad.cotizacionesAprobadas },
                { label: 'Proyectos en curso (cruzan de mes)', v: resumen.actividad.proyectosEnCurso },
              ].map((a) => (
                <div key={a.label} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 text-sm text-subtext">{a.label}</span>
                  <span className="sn-display text-h3 text-ink">{a.v}</span>
                </div>
              ))}
              <p className="text-xs leading-snug text-faint">
                Los proyectos que cruzan de un mes a otro se cuentan aparte para no perderlos en el corte mensual.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Cotizaciones recientes"
          contentClassName="p-0"
          actions={
            <button type="button" onClick={() => router.push('/cotizaciones')} className="inline-flex items-center gap-1.5 text-sm text-subtext hover:text-body transition-colors">
              Ver todas
              <Icon name="arrow-right" size={15} />
            </button>
          }
        >
          {fuenteFallo('Cotizaciones') ? (
            <div className="p-4 md:p-6"><FuenteError nombre="Cotizaciones" onRetry={() => cargar(periodo)} /></div>
          ) : (
            <ResponsiveTableCard
              data={resumen.cotizacionesRecientes}
              keyExtractor={(c) => c.id}
              emptyMessage="Sin cotizaciones recientes"
              columns={[
                { key: 'folio', label: 'Folio', width: '12%' },
                { key: 'proyecto', label: 'Proyecto', width: '30%' },
                { key: 'cliente', label: 'Cliente', width: '22%' },
                { key: 'total', label: 'Total', align: 'right', width: '18%' },
                { key: 'estado', label: 'Estatus', align: 'right', width: '18%' },
              ]}
              renderDesktopRow={(c) => (
                <>
                  <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext cursor-pointer" onClick={() => router.push(`/cotizaciones/${c.id}`)}>{c.id}</td>
                  <td className="truncate px-[var(--row-pad-x)] align-middle font-semibold text-ink cursor-pointer" onClick={() => router.push(`/cotizaciones/${c.id}`)}>{c.proyecto}</td>
                  <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext cursor-pointer" onClick={() => router.push(`/cotizaciones/${c.id}`)}>{c.cliente}</td>
                  <td className="truncate px-[var(--row-pad-x)] align-middle text-right text-ink cursor-pointer" onClick={() => router.push(`/cotizaciones/${c.id}`)}>{formatMoney(c.total)}</td>
                  <td className="px-[var(--row-pad-x)] align-middle text-right cursor-pointer" onClick={() => router.push(`/cotizaciones/${c.id}`)}>
                    <StatusBadge tone={toneForCotizacionEstado(c.estado)}>{c.estado}</StatusBadge>
                  </td>
                </>
              )}
              renderMobileCard={(c) => (
                <div
                  className="rounded-control border border-hairline p-3 cursor-pointer hover:bg-row-alt transition-colors"
                  onClick={() => router.push(`/cotizaciones/${c.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{c.proyecto}</span>
                    <StatusBadge tone={toneForCotizacionEstado(c.estado)}>{c.estado}</StatusBadge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-subtext">
                    <span>{c.cliente}</span>
                    <span>{formatMoney(c.total)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </SectionCard>
      </div>

      {modalAbierto && (
        <GastoFijoModal
          onClose={() => setModalAbierto(false)}
          onGuardado={() => cargar(periodo)}
        />
      )}
    </div>
  )
}

function GastoFijoModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [gastos, setGastos] = useState<GastoFijo[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editMonto, setEditMonto] = useState('')

  useEffect(() => {
    getJson<GastoFijo[]>('/api/dashboard/gastos-fijos', 'Error obteniendo gastos fijos').then(setGastos).catch(() => {})
  }, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNumerico = Number(monto)
    if (!nombre.trim() || !Number.isFinite(montoNumerico) || montoNumerico < 0) {
      setError('Ingresa un nombre y un monto mensual válido')
      return
    }
    setGuardando(true)
    try {
      const creado = await sendJson<GastoFijo>('/api/dashboard/gastos-fijos', { nombre, monto_mensual: montoNumerico }, 'Error creando gasto fijo')
      setGastos((prev) => [creado, ...prev])
      setNombre('')
      setMonto('')
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando gasto fijo')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(gasto: GastoFijo) {
    try {
      await sendJson(`/api/dashboard/gastos-fijos/${gasto.id}`, { activo: !gasto.activo }, 'Error actualizando gasto fijo', { method: 'PATCH' })
      setGastos((prev) => prev.map((g) => (g.id === gasto.id ? { ...g, activo: !g.activo } : g)))
      onGuardado()
    } catch {
      setError('No se pudo actualizar el gasto fijo')
    }
  }

  function empezarEdicion(gasto: GastoFijo) {
    setEditandoId(gasto.id)
    setEditNombre(gasto.nombre)
    setEditMonto(String(gasto.monto_mensual))
  }

  async function guardarEdicion(id: string) {
    setError(null)
    const montoNumerico = Number(editMonto)
    if (!editNombre.trim() || !Number.isFinite(montoNumerico) || montoNumerico < 0) {
      setError('Ingresa un nombre y un monto mensual válido')
      return
    }
    try {
      await sendJson(
        `/api/dashboard/gastos-fijos/${id}`,
        { nombre: editNombre, monto_mensual: montoNumerico },
        'Error actualizando gasto fijo',
        { method: 'PATCH' }
      )
      setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, nombre: editNombre, monto_mensual: montoNumerico } : g)))
      setEditandoId(null)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando gasto fijo')
    }
  }

  return (
    <Modal onClose={onClose} title="Gastos fijos" subtitle="Lista simple recurrente -- aplica cada mes mientras esté activo.">
      <form onSubmit={crear} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-body mb-1">Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Renta, nómina..."
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <div className="w-full sm:w-40">
          <label className="block text-sm font-medium text-body mb-1">Monto mensual</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-content text-body focus:outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="h-[42px] flex-none rounded-control bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-pressed transition-colors disabled:opacity-50"
        >
          Agregar
        </button>
      </form>

      {error && <p className="text-sm text-cancelled-fg">{error}</p>}

      <div className="flex flex-col gap-2">
        {gastos.length === 0 && <p className="text-sm text-faint">Sin gastos fijos registrados.</p>}
        {gastos.map((g) =>
          editandoId === g.id ? (
            <div key={g.id} className="flex flex-col gap-2 rounded-control border border-hairline px-3 py-2.5 sm:flex-row sm:items-center">
              <input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="min-w-0 flex-1 bg-input border border-hairline rounded-control px-2.5 py-1.5 text-sm text-body focus:outline-none focus:border-accent"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={editMonto}
                onChange={(e) => setEditMonto(e.target.value)}
                className="w-full bg-input border border-hairline rounded-control px-2.5 py-1.5 text-sm text-body focus:outline-none focus:border-accent sm:w-32"
              />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => guardarEdicion(g.id)} className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-pressed transition-colors">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditandoId(null)} className="rounded-control border border-hairline px-3 py-1.5 text-xs text-body hover:bg-row-alt transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div key={g.id} className="flex items-center gap-3 rounded-control border border-hairline px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${g.activo ? 'text-ink' : 'text-faint line-through'}`}>{g.nombre}</p>
                <p className="text-xs text-subtext">{Number(g.monto_mensual).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} / mes</p>
              </div>
              <div className="flex flex-none gap-2">
                <button
                  type="button"
                  onClick={() => empezarEdicion(g)}
                  className="rounded-control border border-hairline px-3 py-1.5 text-xs text-body hover:bg-row-alt transition-colors"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => alternarActivo(g)}
                  className="rounded-control border border-hairline px-3 py-1.5 text-xs text-body hover:bg-row-alt transition-colors"
                >
                  {g.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
