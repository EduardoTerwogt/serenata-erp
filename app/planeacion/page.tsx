'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaneacionFlow } from './usePlaneacionFlow'
import ProjectSelector from './components/ProjectSelector'
import InputForm from './components/InputForm'
import ValidationTable from './components/ValidationTable'
import ConfirmationSummary from './components/ConfirmationSummary'
import { SectionHero } from '@/components/ui/SectionHero'
import { SectionCard } from '@/components/ui/SectionCard'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

const STEPS = ['input', 'project', 'validation', 'confirmation'] as const

const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  input: 'Mensaje',
  project: 'Cliente',
  validation: 'Validación',
  confirmation: 'Confirmación',
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

  return (
    <div className="flex flex-col gap-6">
      <SectionHero
        title="Planeación"
        action={
          pendientesCount > 0 ? (
            <Button variant="secondary" onClick={() => router.push('/planeacion/pendientes')} iconRight="arrow-right">
              Eventos pendientes · {pendientesCount}
            </Button>
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

      <SectionCard
        title="Convertir un mensaje en cotización"
        contentClassName="p-4 md:p-6"
        actions={
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {STEPS.map((step, idx) => {
              const isActive = state.step === step
              const isDone = STEPS.indexOf(state.step) > idx
              return (
                <div key={step} className="flex items-center gap-2.5">
                  <span
                    className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-circle text-xs font-bold transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-ink'
                        : isDone
                        ? 'bg-approved-bg text-approved-fg'
                        : 'border border-hairline bg-input text-faint'
                    }`}
                  >
                    {isDone ? <Icon name="check" size={13} strokeWidth={3} /> : idx + 1}
                  </span>
                  <span className={`hidden text-sm md:inline ${isActive ? 'font-semibold text-ink' : 'font-medium text-subtext'}`}>
                    {STEP_LABEL[step]}
                  </span>
                  {idx < STEPS.length - 1 && <div className="h-px w-6 bg-hairline md:w-10" />}
                </div>
              )
            })}
          </div>
        }
      >
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
      </SectionCard>
    </div>
  )
}
