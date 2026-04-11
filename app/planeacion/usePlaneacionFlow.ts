'use client'

import { useState } from 'react'
import { ExtractedEventLine, parseEventInfo } from '@/lib/parsers/eventInfoParser'
import { ServiceTemplate } from '@/lib/types'

export interface ValidatedEventLine extends ExtractedEventLine {
  id: string
  proyecto: string
  action: 'create' | 'update' | 'cancel' | 'ignore'
  matchedQuotationId?: string
  matchedQuotationInfo?: string
  selectedTemplateId?: string
  confirmed: boolean
}

export interface PlaneacionFlowState {
  step: 'project' | 'input' | 'validation' | 'confirmation'
  selectedProyecto: string
  rawInput: string
  extractedLines: ValidatedEventLine[]
  selectedTemplateId?: string
  templates: ServiceTemplate[]
  loading: boolean
  error: string
}

export function usePlaneacionFlow() {
  const [state, setState] = useState<PlaneacionFlowState>({
    step: 'project',
    selectedProyecto: '',
    rawInput: '',
    extractedLines: [],
    templates: [],
    loading: false,
    error: '',
  })

  const loadTemplates = async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const res = await fetch('/api/service-templates')
      if (res.ok) {
        const templates = await res.json()
        setState(s => ({ ...s, templates, loading: false }))
      } else {
        setState(s => ({ ...s, loading: false, error: 'Error cargando plantillas' }))
      }
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: 'Error al cargar plantillas' }))
    }
  }

  const handleSelectProyecto = (proyecto: string) => {
    setState(s => ({ ...s, selectedProyecto: proyecto }))
  }

  const handleNextFromProject = () => {
    loadTemplates()
    setState(s => ({ ...s, step: 'input' }))
  }

  const handleInputChange = (input: string) => {
    setState(s => ({ ...s, rawInput: input }))
  }

  const handleExtractInformation = async () => {
    if (!state.rawInput.trim()) {
      setState(s => ({ ...s, error: 'Por favor, pega información' }))
      return
    }

    setState(s => ({ ...s, loading: true, error: '' }))

    try {
      // Parse information (simplified - only fecha + locacion)
      const extracted = parseEventInfo(state.rawInput)

      // Enrich with match information via API
      const enriched: ValidatedEventLine[] = []
      for (const line of extracted) {
        let matchedQuotationId: string | undefined
        let matchedQuotationInfo: string | undefined

        try {
          const res = await fetch('/api/planeacion/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fecha: line.fecha,
              locacion: line.locacion,
              cliente: state.selectedProyecto,
            }),
          })
          if (res.ok) {
            const match = await res.json()
            matchedQuotationId = match.quotation?.id
            matchedQuotationInfo = match.reason
          }
        } catch {
          // Match not critical, continue
        }

        enriched.push({
          ...line,
          id: Math.random().toString(36).substr(2, 9),
          proyecto: state.selectedProyecto,
          action: 'ignore',
          matchedQuotationId,
          matchedQuotationInfo,
          confirmed: false,
        })
      }

      if (enriched.length === 0) {
        setState(s => ({
          ...s,
          loading: false,
          error: 'No se encontraron fechas o locaciones. Verifica el formato.',
        }))
        return
      }

      setState(s => ({
        ...s,
        step: 'validation',
        extractedLines: enriched,
        loading: false,
      }))
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: 'Error al procesar la información',
      }))
    }
  }

  const handleLineUpdate = (lineId: string, updates: Partial<ValidatedEventLine>) => {
    setState(s => ({
      ...s,
      extractedLines: s.extractedLines.map(line =>
        line.id === lineId ? { ...line, ...updates } : line
      ),
    }))
  }

  const handleLineDelete = (lineId: string) => {
    setState(s => ({
      ...s,
      extractedLines: s.extractedLines.filter(line => line.id !== lineId),
    }))
  }

  const handleSelectTemplate = (templateId: string) => {
    setState(s => ({
      ...s,
      selectedTemplateId: templateId,
      extractedLines: s.extractedLines.map(line => ({
        ...line,
        selectedTemplateId: templateId,
      })),
    }))
  }

  const handleConfirmSelection = () => {
    const allConfirmed = state.extractedLines
      .filter(line => line.action !== 'ignore' && line.action !== 'cancel')
      .every(line => line.confirmed)

    if (!allConfirmed) {
      setState(s => ({
        ...s,
        error: 'Confirma todas las fechas que quieres crear/actualizar',
      }))
      return
    }

    if (!state.selectedTemplateId) {
      setState(s => ({
        ...s,
        error: 'Selecciona una plantilla de servicios',
      }))
      return
    }

    setState(s => ({
      ...s,
      step: 'confirmation',
      error: '',
    }))
  }

  const getCreationSummary = () => {
    const toCreate = state.extractedLines.filter(
      line => line.action === 'create' && line.confirmed
    )
    const toUpdate = state.extractedLines.filter(
      line => line.action === 'update' && line.confirmed
    )
    const toCancel = state.extractedLines.filter(
      line => line.action === 'cancel' && line.confirmed
    )

    return { toCreate, toUpdate, toCancel }
  }

  const handleCreateQuotations = async () => {
    const { toCreate } = getCreationSummary()

    if (toCreate.length === 0) {
      setState(s => ({ ...s, error: 'Selecciona al menos una fecha para crear' }))
      return
    }

    setState(s => ({ ...s, loading: true, error: '' }))

    try {
      const createdIds: string[] = []

      for (const line of toCreate) {
        if (!line.fecha) continue

        const res = await fetch('/api/cotizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: line.proyecto,
            proyecto: line.proyecto,
            fecha_entrega: line.fecha,
            locacion: line.locacion,
            estado: 'BORRADOR',
            items: [],
            tipo: 'PRINCIPAL',
          }),
        })

        if (res.ok) {
          const quot = await res.json()
          createdIds.push(quot.id)
        }
      }

      setState(s => ({
        ...s,
        loading: false,
        step: 'project',
        selectedProyecto: '',
        rawInput: '',
        extractedLines: [],
        error: `✓ ${createdIds.length} cotizaciones creadas en BORRADOR`,
      }))

      setTimeout(() => {
        window.location.href = '/cotizaciones'
      }, 1500)
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: 'Error al crear cotizaciones',
      }))
    }
  }

  const goBack = (targetStep: 'project' | 'input' | 'validation' = 'input') => {
    if (targetStep === 'project') {
      setState(s => ({
        ...s,
        step: 'project',
        selectedProyecto: '',
        rawInput: '',
        extractedLines: [],
        error: '',
      }))
    } else {
      setState(s => ({ ...s, step: targetStep, error: '' }))
    }
  }

  return {
    state,
    handleSelectProyecto,
    handleNextFromProject,
    handleInputChange,
    handleExtractInformation,
    handleLineUpdate,
    handleLineDelete,
    handleSelectTemplate,
    handleConfirmSelection,
    handleCreateQuotations,
    getCreationSummary,
    goBack,
    loadTemplates,
  }
}
