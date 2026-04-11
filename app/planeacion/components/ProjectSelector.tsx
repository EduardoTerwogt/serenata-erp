'use client'

import { useForm } from 'react-hook-form'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { QuotationFormValues } from '@/lib/quotations/types'

interface ClienteProyectoSelectorProps {
  onSelectCliente: (cliente: string) => void
  onSelectProyecto: (proyecto: string) => void
  onNext: () => void
  loading: boolean
}

export default function ClienteProyectoSelector({
  onSelectCliente,
  onSelectProyecto,
  onNext,
  loading,
}: ClienteProyectoSelectorProps) {
  const { setValue } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [] },
  })
  // Reuse the quotation form hook for client/project autocomplete
  const {
    listaClientes,
    clienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    proyectosDelCliente,
    proyectoInput,
    mostrarProyectoDropdown,
    setMostrarProyectoDropdown,
    handleClienteChange,
    handleProyectoChange,
    seleccionarCliente,
    setProyectoInput,
  } = useQuotationForm(setValue, [])

  const handleSelectCliente = (cliente: string) => {
    onSelectCliente(cliente)
    handleClienteChange(cliente)
  }

  const handleSelectProyecto = (proyecto: string) => {
    onSelectProyecto(proyecto)
    setProyectoInput(proyecto)
  }

  const handleNext = () => {
    if (clienteInput.trim() && proyectoInput.trim()) {
      onNext()
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-2">Planeación de Eventos</h2>
        <p className="text-gray-400 mb-6">
          Carga información de tus eventos
        </p>

        {/* Cliente Field */}
        <div className="mb-6 relative">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cliente *
          </label>
          <input
            type="text"
            value={clienteInput}
            onChange={e => handleClienteChange(e.target.value)}
            onFocus={() => setMostrarClienteDropdown(true)}
            placeholder="Busca o escribe cliente..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
          {mostrarClienteDropdown && clienteSugerencias.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {clienteSugerencias.map((nombre, i) => (
                <div
                  key={i}
                  onMouseDown={() => {
                    handleSelectCliente(nombre)
                    setMostrarClienteDropdown(false)
                  }}
                  className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-gray-200 text-sm"
                >
                  {nombre}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proyecto Field */}
        <div className="mb-6 relative">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Proyecto *
          </label>
          <input
            type="text"
            value={proyectoInput}
            onChange={e => handleProyectoChange(e.target.value)}
            onFocus={() => {
              const filtrados = proyectosDelCliente.filter(p =>
                p.toLowerCase().includes(proyectoInput.toLowerCase())
              )
              if (filtrados.length > 0) setMostrarProyectoDropdown(true)
            }}
            placeholder="Busca o escribe proyecto..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
          {mostrarProyectoDropdown && (() => {
            const filtrados = proyectosDelCliente.filter(p =>
              p.toLowerCase().includes(proyectoInput.toLowerCase())
            )
            return filtrados.length > 0 ? (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {filtrados.map((proy, i) => (
                  <div
                    key={i}
                    onMouseDown={() => {
                      handleSelectProyecto(proy)
                      setMostrarProyectoDropdown(false)
                    }}
                    className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-gray-200 text-sm"
                  >
                    {proy}
                  </div>
                ))}
              </div>
            ) : null
          })()}
        </div>

        {/* Selected display */}
        {clienteInput && proyectoInput && (
          <div className="mb-6 p-3 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-sm text-green-400">
              ✓ Cliente: <span className="font-semibold">{clienteInput}</span> | Proyecto: <span className="font-semibold">{proyectoInput}</span>
            </p>
          </div>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={!clienteInput.trim() || !proyectoInput.trim() || loading}
          className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Cargando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
