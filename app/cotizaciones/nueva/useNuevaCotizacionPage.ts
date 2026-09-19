'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { canAutosaveQuotationDraft, draftItemsForSave, EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
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

  const [editingItemRowId, setEditingItemRowId] = useState<string | null>(null)
  const [folio, setFolio] = useState('')
  const [responsables, setResponsables] = useState<Proveedor[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const [notasInternas, setNotasInternas] = useState('')
  const [notasPdf, setNotasPdf] = useState('')
  const isSubmitting = useRef(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<DraftAutosaveStatus>('idle')
  const draftIdRef = useRef<string | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosavePendingRef = useRef(false)
  // Firma del contenido ya guardado. Sin ella el autoguardado se realimentaba: cada
  // guardado provoca dos renders (estado "guardando" y "guardado"), y como el efecto
  // dependía de objetos que `watch()` recrea en cada render, se rearmaba el
  // temporizador y salía otro PUT ~cada segundo mientras la pantalla estuviera abierta.
  const lastSavedSignatureRef = useRef<string | null>(null)

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

  const draftSignature = useMemo(() => JSON.stringify({
    cliente: watchedValues.cliente || '',
    proyecto: watchedValues.proyecto || '',
    fecha_entrega: watchedValues.fecha_entrega || '',
    locacion: watchedValues.locacion || '',
    notas: notasInternas,
    notas_pdf: notasPdf,
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
    items: (watchedItems || []).map((item) => [item.categoria, item.descripcion, item.cantidad, item.precio_unitario, item.responsable_id, item.x_pagar]),
  }), [descuento_tipo, descuento_valor, iva_activo, notasInternas, notasPdf, porcentaje_fee, watchedItems, watchedValues])

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
    // Con el borrador ya creado se sigue guardando aunque queden cero partidas: de lo
    // contrario, borrarlas todas no se persistía.
    if (!draftIdRef.current && !canAutosaveQuotationDraft(data)) return

    // Solo las partidas con descripción: una fila en blanco haría que el servidor
    // rechazara el guardado completo con un 400.
    const payload = { ...data, items: draftItemsForSave(data.items) }
    const firmaEnviada = draftSignature
    autosaveInFlightRef.current = true
    setAutosaveStatus('saving')
    try {
      if (draftIdRef.current) {
        await updateQuotation(draftIdRef.current, payload, {
          porcentaje_fee,
          iva_activo,
          descuento_tipo,
          descuento_valor,
          responsables,
          currentQuotation: null,
          notas_internas: notasInternas || null,
          notas_pdf: notasPdf || null,
        })
      } else {
        const cotizacion = await saveNewQuotation(payload, {
          estado: 'BORRADOR',
          porcentaje_fee,
          iva_activo,
          descuento_tipo,
          descuento_valor,
          notas_internas: notasInternas || null,
          notas_pdf: notasPdf || null,
          ...complementariaFields,
        })
        draftIdRef.current = cotizacion.id
        setDraftId(cotizacion.id)
        setFolio(cotizacion.id)
      }
      lastSavedSignatureRef.current = firmaEnviada
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
  }, [complementariaFields, descuento_tipo, descuento_valor, draftSignature, getValues, iva_activo, notasInternas, notasPdf, porcentaje_fee, responsables])

  useEffect(() => {
    if (!draftIdRef.current && !canAutosaveQuotationDraft(getValues())) return
    // Nada que guardar si el contenido no cambió desde el último guardado.
    if (draftSignature === lastSavedSignatureRef.current) return
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
  }, [draftSignature, getValues, persistDraft])

  // Al salir de la pantalla se lanza un último guardado si quedaba algo sin guardar:
  // antes solo se limpiaba el temporizador y se perdía la última edición.
  const persistDraftRef = useRef(persistDraft)
  persistDraftRef.current = persistDraft
  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
      void persistDraftRef.current()
    }
  }, [])

  const onGenerarCotizacion = handleSubmit(async (data) => {
    if (isSubmitting.current) return
    if (autosaveTimerRef.current !== null) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    isSubmitting.current = true
    setGuardando(true)
    setError(null)
    try {
      // Si el alta del borrador sigue en vuelo hay que esperarla: decidir sin esperar
      // creaba una SEGUNDA cotización con otro folio y dejaba el borrador huérfano.
      while (autosaveInFlightRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
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
            notas_pdf: notasPdf || null,
          })
        : await saveNewQuotation(data, {
            estado: 'EMITIDA',
            porcentaje_fee,
            iva_activo,
            descuento_tipo,
            descuento_valor,
            notas_internas: notasInternas || null,
            notas_pdf: notasPdf || null,
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
    editingItemRowId,
    setEditingItemRowId,
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
    notasPdf,
    setNotasPdf,
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
