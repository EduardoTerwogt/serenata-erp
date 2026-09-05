'use client'

import { useReducer, useEffect } from 'react'
import { ValidatedEventLine } from './usePlaneacionFlow'
import { ServiceTemplate } from '@/lib/types'
import { normalizarFechaISO } from '@/lib/parsers/eventInfoParser'

interface PendienteRow extends ValidatedEventLine {
  cliente?: string
  proyecto?: string
}

interface PendienteApiRow {
  id: string
  fecha: string | null
  locacion: string | null
  raw_input?: string | null
  ciudad?: string | null
  estado: 'confirmado' | 'por_confirmar' | 'cancelado'
  notas?: string | null
  cliente?: string
  proyecto?: string
}

interface PendientesFlowState {
  step: 'list' | 'confirmation'
  pendientes: PendienteRow[]
  templates: ServiceTemplate[]
  loading: boolean
  error: string
  totalCount: number
}

type PendientesFlowAction =
  | { type: 'load_pendientes_start' }
  | { type: 'load_pendientes_success'; pendientes: PendienteRow[] }
  | { type: 'load_pendientes_error'; message: string }
  | { type: 'load_templates_success'; templates: ServiceTemplate[] }
  | { type: 'update_line'; lineId: string; updates: Partial<ValidatedEventLine> }
  | { type: 'delete_line'; lineId: string }
  | { type: 'set_error'; message: string }
  | { type: 'go_to_confirmation' }
  | { type: 'create_quotations_start' }
  | { type: 'create_quotations_success'; deletedIds: string[]; message: string }
  | { type: 'create_quotations_error'; message: string }
  | { type: 'go_back' }

/**
 * Una sola transición por evento en vez de varios setState seguidos --
 * mismo patrón que hooks/useQuotationPresence.ts. El estado ya vivía en un
 * solo objeto, pero via useState: cualquier función invocada desde el
 * efecto de montaje que internamente llame a un setter de useState dispara
 * react-hooks/set-state-in-effect, sin importar si el setter está detrás de
 * un await. Con useReducer, dispatch no cuenta como ese tipo de setter.
 */
function pendientesFlowReducer(state: PendientesFlowState, action: PendientesFlowAction): PendientesFlowState {
  switch (action.type) {
    case 'load_pendientes_start':
      return { ...state, loading: true, error: '' }
    case 'load_pendientes_success':
      return { ...state, pendientes: action.pendientes, totalCount: action.pendientes.length, loading: false }
    case 'load_pendientes_error':
      return { ...state, loading: false, error: action.message }
    case 'load_templates_success':
      return { ...state, templates: action.templates }
    case 'update_line':
      return {
        ...state,
        pendientes: state.pendientes.map(line =>
          line.id === action.lineId ? { ...line, ...action.updates } : line
        ),
      }
    case 'delete_line':
      return { ...state, pendientes: state.pendientes.filter(line => line.id !== action.lineId) }
    case 'set_error':
      return { ...state, error: action.message }
    case 'go_to_confirmation':
      return { ...state, step: 'confirmation', error: '' }
    case 'create_quotations_start':
      return { ...state, loading: true, error: '' }
    case 'create_quotations_success':
      return {
        ...state,
        loading: false,
        step: 'list',
        pendientes: state.pendientes.filter(p => !action.deletedIds.includes(p.id)),
        error: action.message,
      }
    case 'create_quotations_error':
      return { ...state, loading: false, error: action.message }
    case 'go_back':
      return { ...state, step: 'list', error: '' }
    default:
      return state
  }
}

export function usePendientesFlow() {
  const [state, dispatch] = useReducer(pendientesFlowReducer, {
    step: 'list',
    pendientes: [],
    templates: [],
    loading: true,
    error: '',
    totalCount: 0,
  })

  const fetchPendientes = async () => {
    try {
      const res = await fetch('/api/planeacion/pendientes')
      if (res.ok) {
        const data = await res.json()
        const pendientes = ((data.pendientes || []) as PendienteApiRow[]).map((p) => ({
          id: p.id,
          fecha: p.fecha,
          locacion: p.locacion,
          raw: p.raw_input || '',
          ciudad: p.ciudad ?? undefined,
          action: p.estado,
          notas: p.notas || null,
          selectedTemplateId: undefined,
          cliente: p.cliente,
          proyecto: p.proyecto,
        }))
        dispatch({ type: 'load_pendientes_success', pendientes })
      } else {
        dispatch({ type: 'load_pendientes_error', message: 'Error cargando pendientes' })
      }
    } catch {
      dispatch({ type: 'load_pendientes_error', message: 'Error al cargar pendientes' })
    }
  }

  const loadPendientes = async () => {
    dispatch({ type: 'load_pendientes_start' })
    await fetchPendientes()
  }

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/service-templates')
      if (res.ok) {
        const templates = await res.json()
        dispatch({ type: 'load_templates_success', templates })
      }
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    fetchPendientes()
    loadTemplates()
  }, [])

  const handleLineUpdate = (lineId: string, updates: Partial<ValidatedEventLine>) => {
    dispatch({ type: 'update_line', lineId, updates })
  }

  const handleLineDelete = async (lineId: string) => {
    // Remove from UI immediately
    dispatch({ type: 'delete_line', lineId })

    // Persist deletion to BD (soft delete)
    try {
      await fetch(`/api/planeacion/pendientes/${lineId}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.error('Warning: Failed to delete pendiente from BD:', err)
      // Don't show error to user since UI already updated
    }
  }

  const handleConfirmSelection = () => {
    const toConfirm = state.pendientes.filter(line => line.action === 'confirmado')

    if (toConfirm.length === 0) {
      dispatch({ type: 'set_error', message: 'Marca al menos una fila como "Confirmado"' })
      return
    }

    dispatch({ type: 'go_to_confirmation' })
  }

  const getCreationSummary = () => {
    const toCreate = state.pendientes.filter(line => line.action === 'confirmado')
    return { toCreate }
  }

  const handleCreateQuotations = async () => {
    const { toCreate } = getCreationSummary()

    if (toCreate.length === 0) {
      dispatch({ type: 'set_error', message: 'Selecciona al menos una fila como "Confirmado"' })
      return
    }

    dispatch({ type: 'create_quotations_start' })

    try {
      const createdIds: string[] = []
      const deletedIds: string[] = []

      // 1. Create quotations for 'confirmado' rows
      for (const line of toCreate) {
        if (!line.fecha) continue

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
          margen: it.cantidad * it.precio_unitario - it.x_pagar * it.cantidad,
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

        const pendienteData = line as PendienteRow
        if (!pendienteData.cliente || !pendienteData.proyecto) continue

        const res = await fetch('/api/cotizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: pendienteData.cliente,
            proyecto: pendienteData.proyecto,
            fecha_entrega: fechaISO,
            locacion,
            estado: 'BORRADOR',
            items,
            tipo: 'PRINCIPAL',
            notas_internas: line.notas || null,
          }),
        })

        if (res.ok) {
          const quot = await res.json()
          createdIds.push(quot.id)
          deletedIds.push(line.id)

          // Delete from pendientes after successful creation
          try {
            await fetch(`/api/planeacion/pendientes/${line.id}`, {
              method: 'DELETE',
            })
          } catch (err) {
            console.error('Warning: Failed to delete pendiente after creation:', err)
          }
        }
      }

      // Show success message
      const message = `✓ ${createdIds.length} cotizaciones creadas en BORRADOR desde pendientes`

      dispatch({ type: 'create_quotations_success', deletedIds, message })

      setTimeout(() => {
        window.location.href = '/cotizaciones'
      }, 1500)
    } catch (err) {
      console.error('Error creating quotations from pendientes:', err)
      dispatch({ type: 'create_quotations_error', message: 'Error al crear cotizaciones' })
    }
  }

  const goBack = () => {
    dispatch({ type: 'go_back' })
  }

  return {
    state,
    loadPendientes,
    handleLineUpdate,
    handleLineDelete,
    handleConfirmSelection,
    handleCreateQuotations,
    getCreationSummary,
    goBack,
  }
}
