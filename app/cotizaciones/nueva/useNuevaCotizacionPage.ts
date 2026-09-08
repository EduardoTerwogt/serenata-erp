'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { canAutosaveQuotationDraft, EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { newLocalRowId } from '@/hooks/useQuotationItems'
import { calculateEstimatedTaxes, calculateQuotationTotals } from '@/lib/quotations/calculations'
import { QuotationFormValues } from '@/lib/quotations/types'
import { fetchNextQuotationFolio, fetchProveedores, generateQuotationPdf, saveNewQuotation, updateQuotation } from '@/lib/services/quotation-service'

const DRAFT_AUTOSAVE_DELAY_MS = 1000

export type DraftAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useNuevaCotizacionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const complementaria_de = searchParams.get('complementaria_de') || ''
  const clienteParam = searchParams.get('cliente') || ''
  const proyectoParam = searchParams.get('proyecto') || ''
  const locacionParam = searchParams.get('locacion') || ''
  const fechaEntregaParam = searchParams.get('fecha_entrega') || ''
  const esComplementaria = !!complementaria_de

  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [folio, setFolio] = useState('')
  const [responsables, setResponsables] = useState<Proveedor[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const [notasInternas, setNotasInternas] = useState('')
  const isSubmitting = useRef(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<DraftAutosaveStatus>('idle')
  const draftIdRef = useRef<string | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosavePendingRef = useRef(false)

  const { register, control, watch, handleSubmit, setValue, getValues } = useForm<QuotationFormValues>({
    defaultValues: {
      cliente: clienteParam,
      proyecto: proyectoParam,
      fecha_entrega: fechaEntregaParam,
      locacion: locacionParam,
      items: [{ ...EMPTY_QUOTATION_ITEM, id: newLocalRowId() }],
    }
  })

  const watchedValues = watch()
  const watchedItems = watch('items')
  const { fields, append, replace } = useFieldArray({ control, name: 'items' })
  const quotationForm = useQuotationForm(setValue, watchedItems)

  const {
    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    listaClientes,
    clienteInput,
    setClienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    proyectosDelCliente,
    proyectoInput,
    setProyectoInput,
    mostrarProyectoDropdown,
    setMostrarProyectoDropdown,
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
  } = quotationForm

  useEffect(() => {
    let cancelled = false

    fetchNextQuotationFolio(esComplementaria ? complementaria_de : undefined)
      .then((preview) => {
        if (!cancelled) setFolio(preview.folio)
      })
      .catch(() => {
        if (!cancelled) setError('Error cargando datos iniciales')
      })

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const loadResponsables = () => {
      void fetchProveedores()
        .then((resp) => {
          if (!cancelled) setResponsables(resp)
        })
        .catch(() => {
          if (!cancelled) setError('Error cargando datos iniciales')
        })
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(loadResponsables, { timeout: 1500 })
    } else {
      timeoutId = setTimeout(loadResponsables, 0)
    }

    return () => {
      cancelled = true
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [esComplementaria, complementaria_de])

  useEffect(() => {
    if (clienteParam) setClienteInput(clienteParam)
    if (proyectoParam) setProyectoInput(proyectoParam)

    if (complementaria_de) {
      const cli = searchParams.get('cliente') || ''
      const proy = searchParams.get('proyecto') || ''
      setValue('cliente', cli)
      setClienteInput(cli)
      setValue('proyecto', proy)
      setProyectoInput(proy)
      setValue('locacion', searchParams.get('locacion') || '')
      setValue('fecha_entrega', searchParams.get('fecha_entrega') || '')
    }
  }, [complementaria_de, clienteParam, proyectoParam, searchParams, setClienteInput, setProyectoInput, setValue])

  const totales = calculateQuotationTotals({
    items: watchedItems,
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  })
  const estimatedTaxes = calculateEstimatedTaxes(watchedItems, totales)

  const complementariaFields = useMemo(
    () => esComplementaria ? { tipo: 'COMPLEMENTARIA' as const, es_complementaria_de: complementaria_de } : {},
    [complementaria_de, esComplementaria]
  )

  // Guardado automático del borrador. En cuanto hay proyecto + una partida con
  // descripción se crea la cotización en BORRADOR (POST, que reserva el folio) y a
  // partir de ahí cada cambio se persiste con PUT, sin salir de esta pantalla.
  const persistDraft = useCallback(async () => {
    if (isSubmitting.current) return
    if (autosaveInFlightRef.current) {
      autosavePendingRef.current = true
      return
    }

    const data = getValues()
    if (!canAutosaveQuotationDraft(data)) return

    autosaveInFlightRef.current = true
    setAutosaveStatus('saving')
    try {
      if (draftIdRef.current) {
        await updateQuotation(draftIdRef.current, data, {
          porcentaje_fee,
          iva_activo,
          descuento_tipo,
          descuento_valor,
          responsables,
          currentQuotation: null,
          notas_internas: notasInternas || null,
        })
      } else {
        const cotizacion = await saveNewQuotation(data, {
          estado: 'BORRADOR',
          porcentaje_fee,
          iva_activo,
          descuento_tipo,
          descuento_valor,
          notas_internas: notasInternas || null,
          ...complementariaFields,
        })
        draftIdRef.current = cotizacion.id
        setDraftId(cotizacion.id)
        setFolio(cotizacion.id)
      }
      setAutosaveStatus('saved')
    } catch (e: unknown) {
      setAutosaveStatus('error')
      setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador')
    } finally {
      autosaveInFlightRef.current = false
      if (autosavePendingRef.current) {
        autosavePendingRef.current = false
        void persistDraft()
      }
    }
  }, [complementariaFields, descuento_tipo, descuento_valor, getValues, iva_activo, notasInternas, porcentaje_fee, responsables])

  useEffect(() => {
    if (!canAutosaveQuotationDraft({ proyecto: watchedValues.proyecto, items: watchedItems || [] })) return
    if (autosaveTimerRef.current !== null) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null
      void persistDraft()
    }, DRAFT_AUTOSAVE_DELAY_MS)
    return () => {
      if (autosaveTimerRef.current !== null) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [persistDraft, watchedItems, watchedValues])

  // Al salir de la pantalla se intenta un último guardado con lo que haya pendiente.
  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) clearTimeout(autosaveTimerRef.current)
  }, [])

  const onGenerarCotizacion = handleSubmit(async (data) => {
    if (isSubmitting.current) return
    if (autosaveTimerRef.current !== null) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    isSubmitting.current = true
    setGuardando(true)
    setError(null)
    try {
      // Si el autoguardado ya creó el borrador se emite ESE, no uno nuevo:
      // crear otro consumiría un segundo folio y dejaría el borrador huérfano.
      const cotizacion = draftIdRef.current
        ? await updateQuotation(draftIdRef.current, data, {
            estado: 'EMITIDA',
            porcentaje_fee,
            iva_activo,
            descuento_tipo,
            descuento_valor,
            responsables,
            currentQuotation: null,
            notas_internas: notasInternas || null,
          })
        : await saveNewQuotation(data, {
            estado: 'EMITIDA',
            porcentaje_fee,
            iva_activo,
            descuento_tipo,
            descuento_valor,
            notas_internas: notasInternas || null,
            ...complementariaFields,
          })
      const pdfResult = await generateQuotationPdf(cotizacion, data.items, { skipDownload: true })
      if (pdfResult.savedToDrive) {
        sessionStorage.setItem('pdf_drive_result', JSON.stringify({ link: pdfResult.driveWebViewLink ?? null }))
      }
      router.push(`/cotizaciones/${cotizacion.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      isSubmitting.current = false
      setGuardando(false)
    }
  })

  return {
    register,
    watch,
    setValue,
    fields,
    append,
    replace,
    getValues,
    editingItemIndex,
    setEditingItemIndex,
    folio,
    responsables,
    guardando,
    error,
    porcentaje_fee,
    setPorcentajeFee,
    iva_activo,
    setIvaActivo,
    descuento_tipo,
    setDescuentoTipo,
    descuento_valor,
    setDescuentoValor,
    notasInternas,
    setNotasInternas,
    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    listaClientes,
    clienteInput,
    setClienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    proyectosDelCliente,
    proyectoInput,
    setProyectoInput,
    mostrarProyectoDropdown,
    setMostrarProyectoDropdown,
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
    watchedItems,
    totales,
    estimatedTaxes,
    onGenerarCotizacion,
    draftId,
    autosaveStatus,
    esComplementaria,
    complementaria_de,
    router,
  }
}
