'use client'

import { UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { QuotationFormValues } from '@/lib/quotations/types'
import { DateField } from '@/components/ui/DateField'
import { formatDateDisplay } from '@/lib/format-date'

interface ClienteOption {
  nombre: string
  proyectos: string[]
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
  notasField?: {
    value: string
    onChange: (value: string) => void
  }
}

// Estilo "InlineInput" del design system: sin caja visible hasta que se
// enfoca (fondo/borde transparentes -> bg-input + borde accent-quiet al
// enfocar), en vez de una caja siempre visible.
const INPUT_CLASS = 'w-full bg-transparent border border-transparent rounded-[8px] px-2.5 py-2 text-sm text-body placeholder-faint focus:outline-none focus:bg-input focus:border-accent-quiet transition-colors'
const DROPDOWN_CLASS = 'absolute z-50 w-full min-w-[220px] mt-1 bg-card border border-hairline rounded-control shadow-overlay max-h-48 overflow-y-auto'
const DROPDOWN_ITEM_CLASS = 'px-4 py-3 hover:bg-row cursor-pointer text-body text-sm border-b border-hairline last:border-0'

export function QuotationGeneralInfoSection({
  title = 'Información General',
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
  notasField,
}: Props) {
  const readOnlyAsText = isReadOnly && readOnlyDisplay === 'text'

  return (
    <div className="rounded-panel border border-hairline bg-card p-4 md:p-6">
      <h2 className="mb-4 text-base font-semibold text-body">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
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
        </div>

        <div>
          <label className="sn-label mb-1.5 block">Fecha de Cotización</label>
          <p className="py-1.5 text-sm text-body">{dateLabel}</p>
        </div>
      </div>

      {notasField && (
        <div className="mt-4">
          <label className="sn-label mb-1.5 block">Notas del evento · Uso interno, no sale en el PDF</label>
          <textarea
            value={notasField.value}
            onChange={e => notasField.onChange(e.target.value)}
            rows={2}
            placeholder="Sin notas..."
            className="w-full resize-y rounded-[8px] border border-hairline bg-input px-3 py-2.5 text-sm text-body placeholder-faint focus:outline-none focus:border-accent-quiet"
          />
        </div>
      )}
    </div>
  )
}
