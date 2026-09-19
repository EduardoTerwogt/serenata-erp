'use client'

import { UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { QuotationFormValues } from '@/lib/quotations/types'
import { DateField } from '@/components/ui/DateField'
import { formatDateDisplay } from '@/lib/format-date'

interface ClienteOption {
  nombre: string
  proyectos: string[]
}

type QuotationGeneralField = 'cliente' | 'proyecto' | 'fecha_entrega' | 'locacion'

interface QuotationGeneralFieldConflict {
  current: unknown
  attempted: unknown
}

function formatConflictValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '(vacío)' : String(value)
}

/**
 * Alguien más guardó este campo entre que se capturó el "base" y que se intentó
 * guardar el propio. Nunca se descarta en silencio lo tecleado: el banner deja
 * elegir entre eso y el valor actual del servidor. Mismo patrón que
 * `ItemFieldConflictBanner` en QuotationItemsSection, para General/Totales.
 */
function GeneralFieldConflictBanner({ field, conflict, onResolve }: {
  field: QuotationGeneralField
  conflict?: QuotationGeneralFieldConflict
  onResolve?: (field: QuotationGeneralField, resolution: 'theirs' | 'mine') => void
}) {
  if (!conflict || !onResolve) return null
  return (
    <div className="mt-1 space-y-1 rounded-control border border-accent-quiet/60 bg-accent-quiet/10 px-2 py-1.5 text-[11px] text-accent-quiet">
      <p>Alguien más lo cambió a &quot;{formatConflictValue(conflict.current)}&quot; mientras editabas.</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onResolve(field, 'theirs')} className="underline hover:text-accent">
          Usar &quot;{formatConflictValue(conflict.current)}&quot;
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onResolve(field, 'mine')} className="underline hover:text-accent">
          Mantener &quot;{formatConflictValue(conflict.attempted)}&quot;
        </button>
      </div>
    </div>
  )
}

interface Props {
  title?: string
  register: UseFormRegister<QuotationFormValues>
  setValue: UseFormSetValue<QuotationFormValues>
  clienteInput: string
  proyectoInput: string
  clienteSugerencias: string[]
  mostrarClienteDropdown: boolean
  setMostrarClienteDropdown: (value: boolean) => void
  proyectosDelCliente: string[]
  mostrarProyectoDropdown: boolean
  setMostrarProyectoDropdown: (value: boolean) => void
  listaClientes: ClienteOption[]
  handleClienteChange: (value: string) => void
  handleProyectoChange: (value: string) => void
  seleccionarCliente: (value: string) => void
  setProyectoInput: (value: string) => void
  onClienteSelected?: (value: string) => void
  onProyectoSelected?: (value: string) => void
  onFechaEntregaChange?: (value: string) => void
  onLocacionChange?: (value: string) => void
  isReadOnly?: boolean
  readOnlyDisplay?: 'input' | 'text'
  dateLabel: string
  fechaEntregaValue?: string
  locacionValue?: string
  conflicts?: Partial<Record<QuotationGeneralField, QuotationGeneralFieldConflict>>
  onResolveConflict?: (field: QuotationGeneralField, resolution: 'theirs' | 'mine') => void
}

// Estilo "InlineInput" del design system: sin caja visible hasta que se
// enfoca (fondo/borde transparentes -> bg-input + borde accent-quiet al
// enfocar), en vez de una caja siempre visible.
const INPUT_CLASS = 'w-full bg-transparent border border-transparent rounded-[8px] px-2.5 py-2 text-content text-body placeholder-faint focus:outline-none focus:bg-input focus:border-accent-quiet transition-colors'
const DROPDOWN_CLASS = 'absolute z-50 w-full min-w-[220px] mt-1 bg-card border border-hairline rounded-control shadow-overlay max-h-48 overflow-y-auto'
const DROPDOWN_ITEM_CLASS = 'px-4 py-3 hover:bg-row cursor-pointer text-body text-content border-b border-hairline last:border-0'

export function QuotationGeneralInfoSection({
  title = 'Datos generales',
  register,
  setValue,
  clienteInput,
  proyectoInput,
  clienteSugerencias,
  mostrarClienteDropdown,
  setMostrarClienteDropdown,
  proyectosDelCliente,
  mostrarProyectoDropdown,
  setMostrarProyectoDropdown,
  listaClientes,
  handleClienteChange,
  handleProyectoChange,
  seleccionarCliente,
  setProyectoInput,
  onClienteSelected,
  onProyectoSelected,
  onFechaEntregaChange,
  onLocacionChange,
  isReadOnly = false,
  readOnlyDisplay = 'input',
  dateLabel,
  fechaEntregaValue = '',
  locacionValue = '',
  conflicts,
  onResolveConflict,
}: Props) {
  const readOnlyAsText = isReadOnly && readOnlyDisplay === 'text'

  return (
    <div className="rounded-panel border border-hairline bg-card">
      <div className="p-4 md:p-6 border-b border-hairline">
        <h2 className="text-base font-semibold text-body">{title}</h2>
      </div>
      <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(4,minmax(130px,200px))_1fr_auto] md:items-start">
        <div className="relative">
          <label className="sn-label mb-1.5 block">Cliente</label>
          {readOnlyAsText ? (
            <p className="py-2 text-body">{clienteInput || '—'}</p>
          ) : isReadOnly ? (
            <input value={clienteInput} readOnly className={`${INPUT_CLASS} cursor-not-allowed opacity-60`} />
          ) : (
            <>
              <input value={clienteInput} onChange={e => handleClienteChange(e.target.value)} onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)} onBlur={() => setTimeout(() => {
                setMostrarClienteDropdown(false)
                if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                  const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                  if (match) {
                    if (onClienteSelected) {
                      onClienteSelected(match.nombre)
                    } else {
                      seleccionarCliente(match.nombre)
                    }
                  }
                }
              }, 200)} autoComplete="off" placeholder="Nombre del cliente" className={INPUT_CLASS} />
              {mostrarClienteDropdown && clienteSugerencias.length > 0 && <div className={DROPDOWN_CLASS}>{clienteSugerencias.map((nombre, i) => <div key={i} onMouseDown={() => {
                if (onClienteSelected) {
                  onClienteSelected(nombre)
                } else {
                  seleccionarCliente(nombre)
                }
              }} className={DROPDOWN_ITEM_CLASS}>{nombre}</div>)}</div>}
            </>
          )}
          <GeneralFieldConflictBanner field="cliente" conflict={conflicts?.cliente} onResolve={onResolveConflict} />
        </div>

        <div className="relative">
          <label className="sn-label mb-1.5 block">Proyecto</label>
          {readOnlyAsText ? (
            <p className="py-2 text-body">{proyectoInput || '—'}</p>
          ) : isReadOnly ? (
            <input value={proyectoInput} readOnly className={`${INPUT_CLASS} cursor-not-allowed opacity-60`} />
          ) : (
            <>
              <input value={proyectoInput} onChange={e => handleProyectoChange(e.target.value)} onFocus={() => {
                const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                if (filtrados.length > 0) setMostrarProyectoDropdown(true)
              }} onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)} autoComplete="off" placeholder="Nombre del proyecto" className={INPUT_CLASS} />
              {mostrarProyectoDropdown && (() => {
                const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                return filtrados.length > 0 ? <div className={DROPDOWN_CLASS}>{filtrados.map((proy, i) => <div key={i} onMouseDown={() => {
                  if (onProyectoSelected) {
                    onProyectoSelected(proy)
                  } else {
                    setProyectoInput(proy)
                    setValue('proyecto', proy)
                    setMostrarProyectoDropdown(false)
                  }
                }} className={DROPDOWN_ITEM_CLASS}>{proy}</div>)}</div> : null
              })()}
            </>
          )}
          <GeneralFieldConflictBanner field="proyecto" conflict={conflicts?.proyecto} onResolve={onResolveConflict} />
        </div>

        <div>
          <label className="sn-label mb-1.5 block">Fecha de Entrega</label>
          {readOnlyAsText ? (
            <p className="py-2 text-body">{formatDateDisplay(fechaEntregaValue)}</p>
          ) : (
            <DateField {...register('fecha_entrega', onFechaEntregaChange ? {
              onChange: (event) => onFechaEntregaChange(event.target.value),
            } : undefined)} value={fechaEntregaValue} readOnly={isReadOnly} className={`w-full min-w-0 ${INPUT_CLASS} ${isReadOnly ? 'cursor-not-allowed opacity-60' : ''}`} />
          )}
          <GeneralFieldConflictBanner field="fecha_entrega" conflict={conflicts?.fecha_entrega} onResolve={onResolveConflict} />
        </div>

        <div>
          <label className="sn-label mb-1.5 block">Locación</label>
          {readOnlyAsText ? (
            <p className="py-2 text-body">{locacionValue || '—'}</p>
          ) : (
            <input {...register('locacion', onLocacionChange ? {
              onChange: (event) => onLocacionChange(event.target.value),
            } : undefined)} readOnly={isReadOnly} className={`${INPUT_CLASS} ${isReadOnly ? 'cursor-not-allowed opacity-60' : ''}`} placeholder="Lugar del evento" />
          )}
          <GeneralFieldConflictBanner field="locacion" conflict={conflicts?.locacion} onResolve={onResolveConflict} />
        </div>

        {/* Espaciador flexible: empuja Fecha de Cotización al borde derecho del panel
            (grid-template-columns 1fr auto arriba), en vez de repartir el ancho en
            columnas iguales -- así se ve en la referencia del skill. */}
        <div className="hidden md:block" />

        <div className="text-right">
          <label className="sn-label mb-1.5 block whitespace-nowrap text-right">Fecha de Cotización</label>
          <p className="py-2 text-content text-body whitespace-nowrap text-right">{dateLabel}</p>
        </div>
      </div>
      </div>
    </div>
  )
}
