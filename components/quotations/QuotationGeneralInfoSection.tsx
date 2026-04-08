'use client'

import { UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { QuotationFormValues } from '@/lib/quotations/types'

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
  isReadOnly?: boolean
  readOnlyDisplay?: 'input' | 'text'
  dateLabel: string
  fechaEntregaValue?: string
  locacionValue?: string
}

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
  isReadOnly = false,
  readOnlyDisplay = 'input',
  dateLabel,
  fechaEntregaValue = '',
  locacionValue = '',
}: Props) {
  const readOnlyAsText = isReadOnly && readOnlyDisplay === 'text'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 mb-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <label className="block text-sm text-gray-400 mb-1">Cliente</label>
          {readOnlyAsText ? (
            <p className="text-white py-2">{clienteInput || '—'}</p>
          ) : isReadOnly ? (
            <input value={clienteInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white opacity-60 cursor-not-allowed" />
          ) : (
            <>
              <input value={clienteInput} onChange={e => handleClienteChange(e.target.value)} onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)} onBlur={() => setTimeout(() => {
                setMostrarClienteDropdown(false)
                if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                  const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                  if (match) seleccionarCliente(match.nombre)
                }
              }, 200)} autoComplete="off" placeholder="Nombre del cliente" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              {mostrarClienteDropdown && clienteSugerencias.length > 0 && <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{clienteSugerencias.map((nombre, i) => <div key={i} onMouseDown={() => seleccionarCliente(nombre)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{nombre}</div>)}</div>}
            </>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm text-gray-400 mb-1">Proyecto</label>
          {readOnlyAsText ? (
            <p className="text-white py-2">{proyectoInput || '—'}</p>
          ) : isReadOnly ? (
            <input value={proyectoInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white opacity-60 cursor-not-allowed" />
          ) : (
            <>
              <input value={proyectoInput} onChange={e => handleProyectoChange(e.target.value)} onFocus={() => {
                const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                if (filtrados.length > 0) setMostrarProyectoDropdown(true)
              }} onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)} autoComplete="off" placeholder="Nombre del proyecto" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              {mostrarProyectoDropdown && (() => {
                const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                return filtrados.length > 0 ? <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{filtrados.map((proy, i) => <div key={i} onMouseDown={() => {
                  setProyectoInput(proy)
                  setValue('proyecto', proy)
                  setMostrarProyectoDropdown(false)
                }} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{proy}</div>)}</div> : null
              })()}
            </>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Fecha de Entrega</label>
          {readOnlyAsText ? (
            <p className="text-white py-2">{fechaEntregaValue || '—'}</p>
          ) : (
            <input type="date" {...register('fecha_entrega')} readOnly={isReadOnly} className={`w-full min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`} />
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Locación</label>
          {readOnlyAsText ? (
            <p className="text-white py-2">{locacionValue || '—'}</p>
          ) : (
            <input {...register('locacion')} readOnly={isReadOnly} className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-sm text-white focus:outline-none focus:border-blue-500 ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="Lugar del evento" />
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Fecha de Cotización</label>
          <p className="text-white py-1.5 text-sm">{dateLabel}</p>
        </div>
      </div>
    </div>
  )
}
