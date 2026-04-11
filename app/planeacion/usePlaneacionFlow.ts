'use client'

import { useState } from 'react'
import { ExtractedEventLine, parseEventInfo } from '@/lib/parsers/eventInfoParser'
import { findSimilarQuotation } from '@/lib/utils/quotationMatcher'
import { ServiceTemplate } from '@/lib/types'

export interface ValidatedEventLine extends ExtractedEventLine {
  id: string
  action: 'create' | 'update' | 'cancel' | 'ignore'
  matchedQuotationId?: string
  matchedQuotationInfo?: string
  selectedTemplateId?: string
  confirmed: boolean
}

export interface PlaneacionFlowState {
  step: 'input' | 'validation' | 'confirmation'
  rawInput: string
  extractedLines: ValidatedEventLine[]
  selectedTemplateId?: string
  templates: ServiceTemplate[]
  loading: boolean
  error: string
}

export interface CreateQuotationAction {
  proyecto: string
  fecha_entrega: string
  locacion: string
  template_id: string
}

export function usePlaneacionFlow() {
  const [state, setState] = useState<PlaneacionFlowState>({
    step: 'input',
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
      // Parse information
      const extracted = parseEventInfo(state.rawInput)

      // Enrich with match information
      const enriched: ValidatedEventLine[] = []
      for (const line of extracted) {
        const match = await findSimilarQuotation(line.fecha, line.locacion)

        enriched.push({
          ...line,
          id: Math.random().toString(36).substr(2, 9),
          action: 'ignore',
          matchedQuotationId: match.quotation?.id,
          matchedQuotationInfo: match.reason,
          confirmed: false,
        })
      }

      if (enriched.length === 0) {
        setState(s => ({
          ...s,
          loading: false,
          error: 'No se pudieron extraer fechas o locaciones. Verifica el formato.',
        }))
        return
      }

      await loadTemplates()

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
    // Validate that all lines are confirmed if they have action 'create' or 'update'
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
            cliente: line.proyecto || 'Por definir',
            proyecto: line.proyecto || 'Por definir',
            fecha_entrega: line.fecha,
            locacion: line.locacion,
            estado: 'BORRADOR',
            items: [], // Will be populated from template
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
        step: 'input',
        rawInput: '',
        extractedLines: [],
        error: `✓ ${createdIds.length} cotizaciones creadas en BORRADOR`,
      }))

      // Reload page after a delay
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

  const goBack = (step: 'input' | 'validation' = 'input') => {
    if (step === 'input') {
      setState(s => ({
        ...s,
        step: 'input',
        rawInput: '',
        extractedLines: [],
        error: '',
      }))
    } else {
      setState(s => ({ ...s, step: 'validation', error: '' }))
    }
  }

  return {
    state,
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
