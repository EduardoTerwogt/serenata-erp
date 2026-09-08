'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaneacionFlow } from './usePlaneacionFlow'
import ProjectSelector from './components/ProjectSelector'
import InputForm from './components/InputForm'
import ValidationTable from './components/ValidationTable'
import ConfirmationSummary from './components/ConfirmationSummary'
import { SectionHero } from '@/components/ui/SectionHero'
import { Icon } from '@/components/ui/Icon'

const STEP_LABEL: Record<'project' | 'validation' | 'confirmation', string> = {
  project: 'Cliente',
  validation: 'Validar',
  confirmation: 'Confirmar',
}

export default function PlaneacionPage() {
  const router = useRouter()
  const [pendientesCount, setPendientesCount] = useState(0)
  const {
    state,
    handleSelectCliente,
    handleSelectProyecto,
    handleNextFromProject,
    handleInputChange,
    handleExtractInformation,
    handleLineUpdate,
    handleLineDelete,
    handleConfirmSelection,
    handleCreateQuotations,
    getCreationSummary,
    goBack,
  } = usePlaneacionFlow()

  // Load pendientes count
  useEffect(() => {
    const fetchPendientesCount = async () => {
      try {
        const res = await fetch('/api/planeacion/pendientes')
        if (res.ok) {
          const data = await res.json()
          setPendientesCount(data.pendientes?.length || 0)
        }
      } catch {
        // Non-critical
      }
    }

    fetchPendientesCount()
  }, [])

  const { toCreate } = getCreationSummary()

  const allSteps = ['input', 'project', 'validation', 'confirmation'] as const
  const visibleSteps = ['project', 'validation', 'confirmation'] as const

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Planeación"
        subtitle="Carga información de tus eventos y crea cotizaciones en lote"
        action={
          pendientesCount > 0 ? (
            <button
              type="button"
              onClick={() => router.push('/planeacion/pendientes')}
              className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-input hover:bg-row-alt px-4 py-2.5 text-sm font-medium text-body transition-colors"
            >
              Eventos pendientes · {pendientesCount}
              <Icon name="arrow-right" size={15} />
            </button>
          ) : undefined
        }
      />

      {pendientesCount > 0 && (
        <button
          type="button"
          onClick={() => router.push('/planeacion/pendientes')}
          className="flex items-center gap-3 w-full rounded-control border border-hairline bg-row px-4 py-3.5 text-left hover:bg-row-alt transition-colors"
        >
          <Icon name="inbox" size={16} className="text-accent flex-none" />
          <span className="flex-1 min-w-0 text-body">
            Tienes {pendientesCount} eventos sin completar o confirmar.
          </span>
          <Icon name="chevron-right" size={16} className="text-subtext flex-none" />
        </button>
      )}

      {/* Progress indicator - new flow: input → project → validation → confirmation */}
      {state.step !== 'input' && (
        <div className="flex gap-3 md:gap-6 flex-wrap">
          {visibleSteps.map((step, idx) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-circle flex items-center justify-center font-bold text-sm ${
                  state.step === step
                    ? 'bg-accent text-accent-ink'
                    : allSteps.indexOf(state.step) > allSteps.indexOf(step)
                    ? 'bg-approved-bg text-approved-fg'
                    : 'bg-row-alt text-faint'
                }`}
              >
                {idx + 1}
              </div>
              <div className="text-sm font-medium text-subtext ml-2 hidden md:block">
                {STEP_LABEL[step]}
              </div>
              {idx < visibleSteps.length - 1 && <div className="h-px bg-hairline w-6 md:w-12 ml-2 md:ml-6"></div>}
            </div>
          ))}
        </div>
      )}

      {/* Content based on step */}
      {state.step === 'input' && (
        <InputForm
          proyecto={state.selectedProyecto}
          value={state.rawInput}
          onChange={handleInputChange}
          onExtract={handleExtractInformation}
          loading={state.loading}
          error={state.error}
        />
      )}

      {state.step === 'project' && (
        <ProjectSelector
          onSelectCliente={handleSelectCliente}
          onSelectProyecto={handleSelectProyecto}
          onNext={handleNextFromProject}
          loading={state.loading}
        />
      )}

      {state.step === 'validation' && (
        <ValidationTable
          lines={state.extractedLines}
          onLineUpdate={handleLineUpdate}
          onLineDelete={handleLineDelete}
          templates={state.templates}
          onConfirm={handleConfirmSelection}
          loading={state.loading}
          error={state.error}
          onGoBack={() => goBack('input')}
        />
      )}

      {state.step === 'confirmation' && (
        <ConfirmationSummary
          toCreate={toCreate}
          templates={state.templates}
          onConfirmCreate={handleCreateQuotations}
          loading={state.loading}
          error={state.error}
          onGoBack={() => goBack('validation')}
        />
      )}
    </div>
  )
}
