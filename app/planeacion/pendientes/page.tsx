'use client'

import Link from 'next/link'
import { usePendientesFlow } from '../usePendientesFlow'
import PendientesTable from '../components/PendientesTable'
import PendientesConfirmation from '../components/PendientesConfirmation'

export default function PendientesPage() {
  const {
    state,
    handleLineUpdate,
    handleLineDelete,
    handleConfirmSelection,
    handleCreateQuotations,
    getCreationSummary,
    goBack,
  } = usePendientesFlow()

  const { toCreate } = getCreationSummary()

  if (state.loading && state.pendientes.length === 0) {
    return (
      <div className="px-5 pt-6 pb-6 md:p-8">
        <div className="text-center py-12">
          <p className="text-gray-400">Cargando pendientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Pendientes de Planeación</h1>
          <p className="text-gray-400">
            Revisa y procesa las filas marcadas como "Por Confirmar" o "Cancelado"
          </p>
        </div>
        <Link
          href="/planeacion"
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
        >
          ← Volver a Planeación
        </Link>
      </div>

      {/* Content based on step */}
      <div className="max-w-6xl mx-auto">
        {state.step === 'list' && (
          <PendientesTable
            lines={state.pendientes}
            onLineUpdate={handleLineUpdate}
            onLineDelete={handleLineDelete}
            templates={state.templates}
            onConfirm={handleConfirmSelection}
            loading={state.loading}
            error={state.error}
            onGoBack={() => (window.location.href = '/planeacion')}
          />
        )}

        {state.step === 'confirmation' && (
          <PendientesConfirmation
            toCreate={toCreate}
            templates={state.templates}
            onConfirmCreate={handleCreateQuotations}
            loading={state.loading}
            error={state.error}
            onGoBack={goBack}
          />
        )}
      </div>
    </div>
  )
}
