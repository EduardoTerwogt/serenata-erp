'use client'

import { useState, useEffect } from 'react'
import { ValidatedEventLine } from './usePlaneacionFlow'
import { ServiceTemplate } from '@/lib/types'
import { normalizarFechaISO } from '@/lib/parsers/eventInfoParser'

interface PendienteRow extends ValidatedEventLine {
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

export function usePendientesFlow() {
  const [state, setState] = useState<PendientesFlowState>({
    step: 'list',
    pendientes: [],
    templates: [],
    loading: true,
    error: '',
    totalCount: 0,
  })

  const loadPendientes = async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const res = await fetch('/api/planeacion/pendientes')
      if (res.ok) {
        const data = await res.json()
        const pendientes = (data.pendientes || []).map((p: any) => ({
          id: p.id,
          fecha: p.fecha,
          locacion: p.locacion,
          raw: p.raw_input || '',
          ciudad: p.ciudad,
          action: p.estado,
          selectedTemplateId: undefined,
          cliente: p.cliente,
          proyecto: p.proyecto,
        }))
        setState(s => ({
          ...s,
          pendientes,
          totalCount: pendientes.length,
          loading: false,
        }))
      } else {
        setState(s => ({ ...s, loading: false, error: 'Error cargando pendientes' }))
      }
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: 'Error al cargar pendientes' }))
    }
  }

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/service-templates')
      if (res.ok) {
        const templates = await res.json()
        setState(s => ({ ...s, templates }))
      }
    } catch (err) {
      // Non-critical
    }
  }

  useEffect(() => {
    loadPendientes()
    loadTemplates()
  }, [])

  const handleLineUpdate = (lineId: string, updates: Partial<ValidatedEventLine>) => {
    setState(s => ({
      ...s,
      pendientes: s.pendientes.map(line =>
        line.id === lineId ? { ...line, ...updates } : line
      ),
    }))
  }

  const handleLineDelete = (lineId: string) => {
    setState(s => ({
      ...s,
      pendientes: s.pendientes.filter(line => line.id !== lineId),
    }))
  }

  const handleConfirmSelection = () => {
    const toConfirm = state.pendientes.filter(line => line.action === 'confirmado')

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
    const toCreate = state.pendientes.filter(line => line.action === 'confirmado')
    return { toCreate }
  }

  const handleCreateQuotations = async () => {
    const { toCreate } = getCreationSummary()

    if (toCreate.length === 0) {
      setState(s => ({
        ...s,
        error: 'Selecciona al menos una fila como "Confirmado"',
      }))
      return
    }

    setState(s => ({ ...s, loading: true, error: '' }))

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

      setState(s => ({
        ...s,
        loading: false,
        step: 'list',
        pendientes: s.pendientes.filter(p => !deletedIds.includes(p.id)),
        error: message,
      }))

      setTimeout(() => {
        window.location.href = '/cotizaciones'
      }, 1500)
    } catch (err) {
      console.error('Error creating quotations from pendientes:', err)
      setState(s => ({
        ...s,
        loading: false,
        error: 'Error al crear cotizaciones',
      }))
    }
  }

  const goBack = () => {
    setState(s => ({ ...s, step: 'list', error: '' }))
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
