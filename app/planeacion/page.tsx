'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePlaneacionFlow } from './usePlaneacionFlow'
import ProjectSelector from './components/ProjectSelector'
import InputForm from './components/InputForm'
import ValidationTable from './components/ValidationTable'
import ConfirmationSummary from './components/ConfirmationSummary'

export default function PlaneacionPage() {
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
    loadTemplates,
  } = usePlaneacionFlow()

  // Load templates on mount
  useEffect(() => {
    // Cargar templates cuando el usuario confirme la selección de cliente
    // No cargar automáticamente al montar la página para evitar mostrar loading modal
  }, [])

  // Load pendientes count
  useEffect(() => {
    const fetchPendientesCount = async () => {
      try {
        const res = await fetch('/api/planeacion/pendientes')
        if (res.ok) {
          const data = await res.json()
          setPendientesCount(data.pendientes?.length || 0)
        }
      } catch (err) {
        // Non-critical
      }
    }

    fetchPendientesCount()
  }, [])

  const { toCreate, toPending, toCancel } = getCreationSummary()

  const steps = ['project', 'input', 'validation', 'confirmation'] as const

  return (
    <div className="px-5 pt-6 pb-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Planeación de Eventos</h1>
        <p className="text-gray-400">
          Carga información de tus eventos y crea cotizaciones en lote
        </p>
      </div>

      {/* Pendientes Banner */}
      {pendientesCount > 0 && (
        <Link
          href="/planeacion/pendientes"
          className="block mb-8 bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 md:p-5 hover:bg-yellow-900/30 hover:border-yellow-700 transition-colors cursor-pointer"
        >
          <p className="text-base font-semibold text-yellow-300 mb-0.5">📋 {pendientesCount} pendientes por revisar</p>
          <p className="text-sm text-yellow-200">Filas guardadas como "Por Confirmar" o "Cancelado" — click aquí para editar y procesar</p>
        </Link>
      )}

      {/* Progress indicator - new flow: input → project → validation → confirmation */}
      {state.step !== 'input' && (
        <div className="mb-8 flex gap-3 md:gap-6">
          {['project', 'validation', 'confirmation'].map((step, idx) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  state.step === step
                    ? 'bg-blue-600 text-white'
                    : steps.indexOf(state.step as any) > steps.indexOf(step as any)
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {idx + 1}
              </div>
              <div className="text-sm font-medium text-gray-400 ml-2 hidden md:block">
                {step === 'project' && 'Cliente'}
                {step === 'validation' && 'Validar'}
                {step === 'confirmation' && 'Confirmar'}
              </div>
              {idx < 2 && <div className="h-0.5 bg-gray-700 w-6 md:w-12 ml-2 md:ml-6"></div>}
            </div>
          ))}
        </div>
      )}

      {/* Content based on step */}
      <div className="mb-8">
        {/* Nuevo flujo: input → project (mientras carga) → validation → confirmation */}
        {state.step === 'input' && (
          <InputForm
            proyecto={state.selectedProyecto}
            value={state.rawInput}
            onChange={handleInputChange}
            onExtract={handleExtractInformation}
            loading={state.loading}
            error={state.error}
            onLoadTemplates={loadTemplates}
            onGoBack={() => goBack('input')}
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

      {/* Help section for input step */}
      {state.step === 'input' && (
        <div className="max-w-3xl mx-auto mt-12 bg-gray-800/30 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Ejemplo de formato aceptado:</h3>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
            <pre>{`Hola, aquí están las fechas confirmadas:

8 abril   CDMX, Aragón      Fes Aragón (confirmada)
17 abril  CDMX              Secundaria TEC 78
23 abril  CDMX              YMCA (pendiente)
30 abril  CDMX              Secundaria TEC 31

También:
Confirmo: 9 mayo, Metepec

Por otros medios:
- 6 Mayo en Anáhuac Sur
- 21 Mayo en EBC`}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
