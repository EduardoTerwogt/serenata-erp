'use client'

import { useRouter } from 'next/navigation'
import { usePendientesFlow } from '../usePendientesFlow'
import PendientesTable from '../components/PendientesTable'
import PendientesConfirmation from '../components/PendientesConfirmation'
import { SectionHero } from '@/components/ui/SectionHero'

export default function PendientesPage() {
  const router = useRouter()
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
          <p className="text-subtext">Cargando pendientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 flex flex-col gap-6">
      <SectionHero
        title="Pendientes de planeación"
        subtitle='Revisa y procesa las filas marcadas como "Por Confirmar" o "Cancelado"'
      />

      <div className="max-w-6xl mx-auto w-full">
        {state.step === 'list' && (
          <PendientesTable
            lines={state.pendientes}
            onLineUpdate={handleLineUpdate}
            onLineDelete={handleLineDelete}
            templates={state.templates}
            onConfirm={handleConfirmSelection}
            loading={state.loading}
            error={state.error}
            onGoBack={() => router.push('/planeacion')}
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
