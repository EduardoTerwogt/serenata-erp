'use client'

import { useState } from 'react'
import { ExtractedEventLine, parseEventInfo, normalizarFechaISO } from '@/lib/parsers/eventInfoParser'
import { ServiceTemplate } from '@/lib/types'

export interface ValidatedEventLine extends ExtractedEventLine {
  id: string
  ciudad?: string
  proyecto?: string  // NUEVO: nombre del proyecto (editable en ValidationTable)
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
  extractionMethod?: 'ai' | 'regex'
}

export function usePlaneacionFlow() {
  const [state, setState] = useState<PlaneacionFlowState>({
    step: 'input',  // CAMBIO: Inicia en input (pegar información)
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

  const handleNextFromProject = async () => {
    if (!state.selectedCliente.trim()) {
      setState(s => ({ ...s, error: 'Selecciona un cliente' }))
      return
    }

    // Cargar templates cuando usuario confirma cliente
    await loadTemplates()
    setState(s => ({ ...s, step: 'validation', error: '' }))
  }

  const handleInputChange = (input: string) => {
    setState(s => ({ ...s, rawInput: input }))
  }

  const handleExtractInformation = async () => {
    if (!state.rawInput.trim()) {
      setState(s => ({ ...s, error: 'Por favor, pega información' }))
      return
    }

    // CAMBIO: Cambiar a 'project' inmediatamente mientras carga Claude
    setState(s => ({ ...s, step: 'project', loading: true, error: '' }))

    try {
      let extracted: ExtractedEventLine[] = []
      let extractionMethod: 'ai' | 'regex' = 'regex'
      let notasContextuales: { [key: string]: string } = {}

      // Try AI extraction first
      try {
        const aiRes = await fetch('/api/planeacion/extract-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: state.rawInput }),
        })
        if (aiRes.ok) {
          const aiData = await aiRes.json()
          if (aiData.events && aiData.events.length > 0) {
            extracted = aiData.events
            notasContextuales = aiData.notasContextuales || {}
            extractionMethod = 'ai'
          }
        }
      } catch (aiError) {
        console.error('AI extraction failed, falling back to regex parser:', aiError)
      }

      // Fallback to local regex parser if AI extraction failed
      if (extracted.length === 0) {
        extracted = parseEventInfo(state.rawInput)
        extractionMethod = 'regex'
      }

      if (extracted.length === 0) {
        setState(s => ({
          ...s,
          loading: false,
          error: 'No se encontraron fechas o locaciones. Verifica el formato.',
        }))
        return
      }

      // Enrich with match information via API + associate contextual notes
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

        // Normalize fecha to ISO and find associated notes
        const fechaISO = normalizarFechaISO(line.fecha)
        const notasAsociadas: { [key: string]: string } = {}
        if (fechaISO && notasContextuales[fechaISO]) {
          notasAsociadas[fechaISO] = notasContextuales[fechaISO]
        }

        enriched.push({
          ...line,
          id: Math.random().toString(36).substr(2, 9),
          ciudad: line.ciudad ?? undefined,
          proyecto: line.proyecto ?? undefined,  // NUEVO: proyecto detectado por Claude
          action: line.action ?? 'por_confirmar',
          notasAsociadas,  // NUEVO: notas asociadas a este evento
          matchedQuotationId,
          matchedQuotationInfo,
          selectedTemplateId: undefined,
        })
      }

      // CAMBIO: Guardar datos pero mantenerse en 'project' esperando cliente
      setState(s => ({
        ...s,
        extractedLines: enriched,
        extractionMethod,
        loading: false,
        error: '', // Clear any error once extraction succeeds
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

  const handleLineDelete = async (lineId: string) => {
    // Eliminar del estado local
    setState(s => ({
      ...s,
      extractedLines: s.extractedLines.filter(line => line.id !== lineId),
    }))

    // Si es una línea que ya existe en BD (de planeacion_pendientes), marcarla como eliminada
    const lineToDelete = state.extractedLines.find(line => line.id === lineId)
    if (lineToDelete && lineId.length === 36) {
      // UUID format suggests it's from DB
      try {
        await fetch(`/api/planeacion/lines/${lineId}/delete`, {
          method: 'POST',
        })
      } catch (err) {
        console.error('Error marking line as deleted in BD:', err)
        // No fail if deletion in BD fails, it's already removed from UI
      }
    }
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
    // Categorize by action + confidence
    const toCreate = state.extractedLines.filter(
      line => line.action === 'confirmado' && (line.confidence ?? 0) >= 0.8
    )
    const toPending = state.extractedLines.filter(
      line => line.action === 'por_confirmar' || (line.action === 'confirmado' && (line.confidence ?? 0) < 0.8)
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

          // NUEVO: Guardar notas asociadas a este evento
          if (line.notasAsociadas && Object.keys(line.notasAsociadas).length > 0) {
            try {
              await fetch('/api/planeacion/save-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cotizacion_id: quot.id,
                  eventos: [
                    {
                      fecha_evento: fechaISO,
                      notas: Object.values(line.notasAsociadas).join('\n'),
                    }
                  ]
                }),
              })
            } catch (err) {
              console.error('Error saving notes:', err)
              // Non-critical, continue
            }
          }
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
