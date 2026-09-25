'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Icon } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import type { MesPeriodo, MesResumen, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import { MESES_CORTOS, MESES_LARGOS, capitalizar, etiquetaPeriodo } from './formato'

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

/** Duración de la cascada de cierre antes de volver a mostrar el chip (handoff chip-meses). */
const CIERRE_MS = 300

/**
 * Escritorio: chip del periodo que se despliega en la misma fila en la tira de
 * 12 meses más "Todo el año" (handoff docs/design/cuentas/chip-meses). El
 * select de año no cambia y la tira nunca lo empuja a otra línea: si no
 * cabe, hace scroll horizontal.
 */
export function PeriodoEscritorio({ anio, mes, meses, resumen, hoy, onMes, onAnio }: PeriodoProps & { hoy: string }) {
  const [abierto, setAbierto] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const tiraRef = useRef<HTMLDivElement>(null)
  // Al cerrar, el foco regresa al chip solo si estaba dentro de la tira.
  const devolverFoco = useRef(false)

  const mesActual = Number(hoy.slice(0, 4)) === anio ? Number(hoy.slice(5, 7)) : null
  const pendientesAnio = resumen?.anios.find((a) => a.anio === anio)?.pendientes ?? meses.reduce((s, m) => s + m.pendientes, 0)
  const pendientesChip = mes === 'todo' ? pendientesAnio : (meses.find((m) => m.mes === mes)?.pendientes ?? 0)
  const nombre = mes === 'todo' ? 'Todo el año' : MESES_LARGOS[mes - 1]

  const cerrar = useCallback(() => {
    if (!abierto || cerrando) return
    devolverFoco.current = Boolean(tiraRef.current?.contains(document.activeElement))
    setCerrando(true)
    timer.current = setTimeout(() => {
      setAbierto(false)
      setCerrando(false)
    }, CIERRE_MS)
  }, [abierto, cerrando])

  const abrirTira = () => {
    if (timer.current) clearTimeout(timer.current)
    setCerrando(false)
    setAbierto(true)
  }

  const elegir = (m: MesPeriodo) => {
    onMes(m)
    cerrar()
  }

  // Esc contrae; un clic fuera no (la tira vive en la fila, no es un menú flotante).
  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [abierto, cerrar])

  // Al abrir, foco en la pastilla activa; al cerrar, de vuelta al chip.
  useEffect(() => {
    if (abierto && !cerrando) tiraRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    if (!abierto && devolverFoco.current) {
      devolverFoco.current = false
      chipRef.current?.focus()
    }
  }, [abierto, cerrando])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const anim = cerrando ? 'sn-mes-out' : 'sn-mes-in'
  const pastilla = 'flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-pill border text-[12.5px] transition-colors'
  const inactiva = 'border-hairline bg-card text-ink hover:border-accent'
  const activa = 'border-accent bg-accent font-semibold text-white'

  return (
    <div className="flex flex-nowrap items-center gap-3">
      <div className="flex min-w-0 items-center" role="group" aria-label="Mes del evento">
        {!abierto ? (
          <button
            ref={chipRef}
            type="button"
            aria-expanded={false}
            aria-label={`Periodo: ${nombre}. Ver todos los meses`}
            onClick={abrirTira}
            className="sn-chip-in flex h-[30px] items-center gap-2 rounded-pill border border-hairline bg-card pl-3.5 pr-2.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-accent focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_rgba(254,123,1,.18)] focus-visible:outline-none"
          >
            <span>{nombre}</span>
            {pendientesChip > 0 && <Contador n={pendientesChip} activo={false} />}
            <Icon name="chevron-right" size={14} strokeWidth={2.2} className="-ml-0.5 opacity-85" />
          </button>
        ) : (
          <div ref={tiraRef} role="listbox" aria-label="Meses" className="sn-sin-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto py-0.5">
            {meses.map((m, i) => {
              const sel = mes === m.mes
              return (
                <button
                  key={m.mes}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => elegir(m.mes)}
                  // Sin movimientos: .55 (sigue siendo clicable); la activa siempre plena.
                  style={{ animationDelay: `${cerrando ? (13 - i) * 12 : i * 18}ms`, ['--sn-mes-op' as string]: !sel && m.visibles === 0 ? 0.55 : 1 }}
                  className={`${anim} ${pastilla} px-[9px] ${sel ? activa : `${inactiva} ${m.mes === mesActual ? 'font-semibold' : 'font-medium'}`}`}
                >
                  {capitalizar(MESES_CORTOS[m.mes - 1])}
                  {m.pendientes > 0 && <Contador n={m.pendientes} activo={sel} />}
                </button>
              )
            })}
            <button
              type="button"
              role="option"
              aria-selected={mes === 'todo'}
              onClick={() => elegir('todo')}
              style={{ animationDelay: `${cerrando ? 12 : 220}ms` }}
              className={`${anim} ${pastilla} px-[11px] font-semibold ${mes === 'todo' ? activa : inactiva}`}
            >
              Todo el año
            </button>
            <button
              type="button"
              aria-label="Contraer meses"
              onClick={cerrar}
              style={{ animationDelay: `${cerrando ? 0 : 240}ms` }}
              className={`${anim} flex h-7 w-7 flex-none items-center justify-center rounded-pill border border-hairline bg-card text-body transition-colors hover:border-accent`}
            >
              <Icon name="chevron-left" size={14} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>
      <div className="ml-auto flex-none whitespace-nowrap">
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
