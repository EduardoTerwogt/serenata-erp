'use client'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { Icon } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import type { MesPeriodo, MesResumen, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import { MESES_CORTOS, capitalizar, etiquetaPeriodo } from './formato'

interface PeriodoProps {
  anio: number
  mes: MesPeriodo
  meses: MesResumen[]
  resumen: ResumenRespuesta | null
  onMes: (mes: MesPeriodo) => void
  onAnio: (anio: number) => void
}

function opcionesAnio(anio: number, resumen: ResumenRespuesta | null) {
  const anios = resumen?.anios ?? []
  const lista = anios.some((a) => a.anio === anio) ? anios : [{ anio, pendientes: 0 }, ...anios]
  return lista
    .slice()
    .sort((a, b) => b.anio - a.anio)
    .map((a) => ({ value: a.anio, label: `${a.anio}${a.pendientes ? ` · ${a.pendientes} pendiente${a.pendientes === 1 ? '' : 's'}` : ''}` }))
}

function Contador({ n, activo }: { n: number; activo: boolean }) {
  return (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] font-bold ${activo ? 'bg-white text-accent' : 'bg-accent text-white'}`}
    >
      {n}
    </span>
  )
}

/** Escritorio: pastillas de mes con pendientes, "Todo el año" y select de año. */
export function PeriodoEscritorio({ anio, mes, meses, resumen, onMes, onAnio }: PeriodoProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mes del evento">
        {meses.map((m) => {
          const activo = mes === m.mes
          const vacio = m.visibles === 0
          return (
            <button
              key={m.mes}
              type="button"
              aria-pressed={activo}
              onClick={() => onMes(m.mes)}
              className={`flex h-[30px] items-center gap-1.5 rounded-pill border px-[11px] text-[12.5px] transition-colors ${
                activo ? 'border-accent bg-accent font-semibold text-white' : `border-hairline font-medium ${vacio ? 'text-faint opacity-55' : 'text-body'}`
              }`}
            >
              {capitalizar(MESES_CORTOS[m.mes - 1])}
              {m.pendientes > 0 && <Contador n={m.pendientes} activo={activo} />}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={mes === 'todo'}
          onClick={() => onMes('todo')}
          className={`h-[30px] rounded-pill border px-[13px] text-[12.5px] font-semibold ${mes === 'todo' ? 'border-accent bg-accent text-white' : 'border-hairline text-body'}`}
        >
          Todo el año
        </button>
      </div>
      <div className="ml-auto">
        <Select aria-label="Año" value={anio} onChange={(e) => onAnio(Number(e.target.value))} className="min-w-[160px]">
          {opcionesAnio(anio, resumen).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}

/** Móvil: botón "Mes Año" con los pendientes del periodo. */
export function BotonPeriodo({ anio, mes, pendientes, onClick }: { anio: number; mes: MesPeriodo; pendientes: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Periodo: ${etiquetaPeriodo(anio, mes)}`}
      className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-control border border-hairline bg-card px-3 text-[14px] font-semibold text-ink"
    >
      <Icon name="calendar" size={16} className="text-accent" />
      <span className="min-w-0 flex-1 truncate text-left">{mes === 'todo' ? `Todo ${anio}` : etiquetaPeriodo(anio, mes)}</span>
      {pendientes > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-[5px] text-[10.5px] font-bold text-white">{pendientes}</span>}
      <Icon name="chevron-down" size={16} className="text-subtext" />
    </button>
  )
}

/** Móvil: hoja Periodo con select de año, cuadrícula de 3 × 4 y "Todo el año". */
export function HojaPeriodo({ anio, mes, meses, resumen, onMes, onAnio, onClose }: PeriodoProps & { onClose: () => void }) {
  return (
    <BottomSheet title="Periodo" onClose={onClose} label="Periodo">
      <div className="flex flex-col gap-3.5 px-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <Select aria-label="Año" size="lg" value={anio} onChange={(e) => onAnio(Number(e.target.value))} className="w-full">
          {opcionesAnio(anio, resumen).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-3 gap-2">
          {meses.map((m) => {
            const activo = mes === m.mes
            return (
              <button
                key={m.mes}
                type="button"
                aria-pressed={activo}
                onClick={() => onMes(m.mes)}
                className={`flex h-[46px] items-center justify-center gap-1.5 rounded-control border text-[14px] ${
                  activo ? 'border-accent bg-accent font-semibold text-white' : `border-hairline bg-card ${m.visibles === 0 ? 'text-faint' : 'font-medium text-body'}`
                }`}
              >
                {capitalizar(MESES_CORTOS[m.mes - 1])}
                {m.pendientes > 0 && <Contador n={m.pendientes} activo={activo} />}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-pressed={mes === 'todo'}
          onClick={() => onMes('todo')}
          className={`h-[42px] rounded-control border text-[14px] font-semibold ${mes === 'todo' ? 'border-accent bg-accent text-white' : 'border-hairline bg-card text-body'}`}
        >
          Todo el año
        </button>
      </div>
    </BottomSheet>
  )
}
