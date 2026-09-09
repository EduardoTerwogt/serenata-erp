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
  onNext,
  loading,
}: ClienteProyectoSelectorProps) {
  const { setValue } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [] },
  })
  // Reuse the quotation form hook for client autocomplete
  const {
    clienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    handleClienteChange,
  } = useQuotationForm(setValue, [])

  const handleSelectCliente = (cliente: string) => {
    onSelectCliente(cliente)
    handleClienteChange(cliente)
  }

  const handleNext = () => {
    if (clienteInput.trim()) {
      onNext()
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-h3 font-semibold text-ink mb-2">Selecciona el cliente</h2>
      <p className="text-subtext mb-6">
        {loading ? 'Claude está procesando tu información...' : 'Indica para quién es esta información. El proyecto se toma del mensaje.'}
      </p>

      {/* Cliente Field */}
      <div className="mb-6 relative">
        <label className="block text-sm font-medium text-body mb-2">
          Cliente *
        </label>
        <input
          type="text"
          value={clienteInput}
          onChange={e => {
            const value = e.target.value
            handleClienteChange(value)
            onSelectCliente(value)
          }}
          onFocus={() => setMostrarClienteDropdown(true)}
          placeholder="Busca o escribe cliente..."
          className="w-full bg-input border border-hairline rounded-control px-4 py-2.5 text-body placeholder-faint focus:outline-none focus:border-accent"
        />
        {mostrarClienteDropdown && clienteSugerencias.length > 0 && (
          <div className="absolute z-50 w-full mt-1 rounded-control border border-hairline bg-card shadow-overlay max-h-48 overflow-y-auto">
            {clienteSugerencias.map((nombre, i) => (
              <div
                key={i}
                onMouseDown={() => {
                  handleSelectCliente(nombre)
                  setMostrarClienteDropdown(false)
                }}
                className="px-4 py-3 hover:bg-row cursor-pointer text-body text-sm"
              >
                {nombre}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected display */}
      {clienteInput && (
        <div className="mb-6 rounded-control border border-approved-fg/20 bg-approved-bg p-3">
          <p className="text-sm text-approved-fg">
            Cliente: <span className="font-semibold">{clienteInput}</span>
          </p>
        </div>
      )}

      {/* Next button */}
      <button
        onClick={handleNext}
        disabled={!clienteInput.trim() || loading}
        className="w-full rounded-control bg-accent hover:bg-accent-pressed disabled:bg-row disabled:text-faint disabled:cursor-not-allowed text-accent-ink px-4 py-3 font-medium transition-colors"
      >
        {loading ? 'Procesando información...' : 'Continuar →'}
      </button>
    </div>
  )
}
