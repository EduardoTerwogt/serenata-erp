'use client'

import { useState } from 'react'
import { ExtractedEventLine, parseEventInfo, normalizarFechaISO } from '@/lib/parsers/eventInfoParser'
import { ServiceTemplate } from '@/lib/types'

export interface ValidatedEventLine extends ExtractedEventLine {
  id: string
  ciudad?: string
  action: 'confirmado' | 'por_confirmar' | 'cancelado'
  matchedQuotationId?: string
  matchedQuotationInfo?: string
  selectedTemplateId?: string
}

export interface PlaneacionFlowState {
  step: 'project' | 'input' | 'validation' | 'confirmation'
  selectedCliente: string
  selectedProyecto: string
  rawInput: string
  extractedLines: ValidatedEventLine[]
  templates: ServiceTemplate[]
  loading: boolean
  error: string
}

export function usePlaneacionFlow() {
  const [state, setState] = useState<PlaneacionFlowState>({
    step: 'project',
    selectedCliente: '',
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

  const handleSelectCliente = (cliente: string) => {
    setState(s => ({ ...s, selectedCliente: cliente }))
  }

  const handleSelectProyecto = (proyecto: string) => {
    setState(s => ({ ...s, selectedProyecto: proyecto }))
  }

  const handleNextFromProject = () => {
    if (!state.selectedCliente.trim() || !state.selectedProyecto.trim()) {
      setState(s => ({ ...s, error: 'Selecciona cliente y proyecto' }))
      return
    }
    loadTemplates()
    setState(s => ({ ...s, step: 'input', error: '' }))
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
      // Extract events via AI, fallback to local parser if unavailable
      let extracted: ExtractedEventLine[] = []

      try {
        const res = await fetch('/api/planeacion/extract-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: state.rawInput }),
        })
        if (res.ok) {
          extracted = await res.json()
        }
      } catch {
        // AI extraction failed, fall through to local parser
      }

      // Fallback: local regex parser
      if (extracted.length === 0) {
        extracted = parseEventInfo(state.rawInput)
      }

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
              cliente: state.selectedCliente,
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
          ciudad: line.ciudad ?? undefined,
          action: line.action ?? 'por_confirmar',
          matchedQuotationId,
          matchedQuotationInfo,
          selectedTemplateId: undefined,
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

  const handleConfirmSelection = () => {
    const toConfirm = state.extractedLines.filter(line => line.action === 'confirmado')

    if (toConfirm.length === 0) {
      setState(s => ({
        ...s,
        error: 'Marca al menos una fila como "Confirmado"',
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
      line => line.action === 'confirmado'
    )
    const toPending = state.extractedLines.filter(
      line => line.action === 'por_confirmar'
    )
    const toCancel = state.extractedLines.filter(
      line => line.action === 'cancelado'
    )

    return { toCreate, toPending, toCancel }
  }

  const handleCreateQuotations = async () => {
    const { toCreate, toPending, toCancel } = getCreationSummary()

    if (toCreate.length === 0) {
      setState(s => ({ ...s, error: 'Selecciona al menos una fila como "Confirmado"' }))
      return
    }

    setState(s => ({ ...s, loading: true, error: '' }))

    try {
      const createdIds: string[] = []
      const pendientesCount = toPending.length + toCancel.length

      // 1. Create quotations for 'confirmado' rows
      for (const line of toCreate) {
        if (!line.fecha) continue

        // Normalize fecha to ISO format
        const fechaISO = normalizarFechaISO(line.fecha)

        // Get template if selected
        const template = line.selectedTemplateId
          ? state.templates.find(t => t.id === line.selectedTemplateId)
          : undefined

        // Map template items to quotation items
        const items = template?.items?.map((it, idx) => ({
          categoria: it.categoria,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          importe: it.cantidad * it.precio_unitario,
          x_pagar: it.x_pagar,
          margen: (it.cantidad * it.precio_unitario) - (it.x_pagar * it.cantidad),
          responsable_nombre: it.responsable_nombre ?? null,
          responsable_id: it.responsable_id ?? null,
          producto_id: it.producto_id ?? null,
          orden: idx,
          notas: null,
        })) ?? []

        // Concatenate ciudad + locacion
        const locacion = [line.ciudad, line.locacion]
          .filter(Boolean)
          .join(' — ')

        const res = await fetch('/api/cotizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: state.selectedCliente,
            proyecto: state.selectedProyecto,
            fecha_entrega: fechaISO,
            locacion,
            estado: 'BORRADOR',
            items,
            tipo: 'PRINCIPAL',
          }),
        })

        if (res.ok) {
          const quot = await res.json()
          createdIds.push(quot.id)
        }
      }

      // 2. Save pendientes (por_confirmar + cancelado) if any
      if (pendientesCount > 0) {
        const pendientesPayload = [...toPending, ...toCancel].map(line => ({
          cliente: state.selectedCliente,
          proyecto: state.selectedProyecto,
          fecha: line.fecha,
          fecha_iso: normalizarFechaISO(line.fecha) || null,
          ciudad: line.ciudad || null,
          locacion: line.locacion || null,
          estado: line.action, // 'por_confirmar' | 'cancelado'
          raw_input: line.raw,
        }))

        try {
          await fetch('/api/planeacion/pendientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendientesPayload),
          })
        } catch (err) {
          console.error('Error saving pendientes:', err)
          // Non-critical, continue
        }
      }

      // 3. Show success message
      const message = pendientesCount > 0
        ? `✓ ${createdIds.length} cotizaciones creadas · ${pendientesCount} pendientes guardadas`
        : `✓ ${createdIds.length} cotizaciones creadas en BORRADOR`

      setState(s => ({
        ...s,
        loading: false,
        step: 'project',
        selectedCliente: '',
        selectedProyecto: '',
        rawInput: '',
        extractedLines: [],
        error: message,
      }))

      setTimeout(() => {
        window.location.href = '/cotizaciones'
      }, 1500)
    } catch (err) {
      console.error('Error creating quotations:', err)
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
        selectedCliente: '',
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
  }
}
