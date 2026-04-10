'use client'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Responsable } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import { QuotationFormValues } from '@/lib/quotations/types'
import { fetchNextQuotationFolio, fetchResponsables, generateQuotationPdf, saveNewQuotation } from '@/lib/services/quotation-service'

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
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const isSubmitting = useRef(false)

  const { register, control, watch, handleSubmit, setValue } = useForm<QuotationFormValues>({
    defaultValues: {
      cliente: clienteParam,
      proyecto: proyectoParam,
      fecha_entrega: fechaEntregaParam,
      locacion: locacionParam,
      items: [{ ...EMPTY_QUOTATION_ITEM }],
    }
  })

  const watchedItems = watch('items')
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
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
      void fetchResponsables()
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

  const onGuardarBorrador = handleSubmit(async (data) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    setGuardando(true)
    setError(null)
    try {
      const cotizacion = await saveNewQuotation(data, {
        estado: 'BORRADOR',
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
        ...(esComplementaria ? { tipo: 'COMPLEMENTARIA' as const, es_complementaria_de: complementaria_de } : {}),
      })
      router.push(`/cotizaciones/${cotizacion.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      isSubmitting.current = false
      setGuardando(false)
    }
  })

  const onGenerarCotizacion = handleSubmit(async (data) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    setGuardando(true)
    setError(null)
    try {
      const cotizacion = await saveNewQuotation(data, {
        estado: 'EMITIDA',
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
        ...(esComplementaria ? { tipo: 'COMPLEMENTARIA' as const, es_complementaria_de: complementaria_de } : {}),
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
    remove,
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
    onGuardarBorrador,
    onGenerarCotizacion,
    esComplementaria,
    complementaria_de,
    router,
  }
}
