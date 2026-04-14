'use client'

import { FocusEvent, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Cotizacion, ItemCotizacion, Responsable } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { QuotationPresenceSection, useQuotationPresence } from '@/hooks/useQuotationPresence'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { approveQuotation, buildComplementariaUrl, fetchQuotationDetail, fetchResponsables, generateQuotationPdf, saveQuotationGeneral, saveQuotationNotes, saveQuotationTotals, updateQuotation } from '@/lib/services/quotation-service'
import { formatSpanishLongDate } from '@/lib/quotations/format'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'
import { SkeletonQuotationDetail } from '@/app/components/ui/SkeletonQuotationDetail'

const sectionLabels: Record<QuotationPresenceSection, string> = {
  notas: 'Notas',
  general: 'General',
  partidas: 'Partidas',
  totales: 'Totales',
}

const NOTAS_AUTOSAVE_DELAY_MS = 800
const GENERAL_AUTOSAVE_DELAY_MS = 800
const TOTALS_AUTOSAVE_DELAY_MS = 800
const SECTION_IDLE_RELEASE_MS = 5000

interface GeneralSnapshot {
  cliente: string
  proyecto: string
  fecha_entrega: string
  locacion: string
}

interface TotalsSnapshot {
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getShortName(name?: string | null, email?: string | null) {
  const cleanName = String(name || '').trim()
  if (cleanName) {
    return cleanName.split(/\s+/).slice(0, 2).join(' ')
  }
  const cleanEmail = String(email || '').trim()
  if (cleanEmail) {
    return cleanEmail.split('@')[0]
  }
  return 'Usuario'
}

function buildGeneralSnapshot(values: Partial<GeneralSnapshot>): GeneralSnapshot {
  return {
    cliente: values.cliente || '',
    proyecto: values.proyecto || '',
    fecha_entrega: values.fecha_entrega || '',
    locacion: values.locacion || '',
  }
}

function areGeneralSnapshotsEqual(a: GeneralSnapshot, b: GeneralSnapshot) {
  return a.cliente === b.cliente && a.proyecto === b.proyecto && a.fecha_entrega === b.fecha_entrega && a.locacion === b.locacion
}

function buildTotalsSnapshot(values: Partial<TotalsSnapshot>): TotalsSnapshot {
  return {
    porcentaje_fee: typeof values.porcentaje_fee === 'number' ? values.porcentaje_fee : 0.15,
    iva_activo: typeof values.iva_activo === 'boolean' ? values.iva_activo : true,
    descuento_tipo: values.descuento_tipo === 'porcentaje' ? 'porcentaje' : 'monto',
    descuento_valor: typeof values.descuento_valor === 'number' ? values.descuento_valor : 0,
  }
}

function areTotalsSnapshotsEqual(a: TotalsSnapshot, b: TotalsSnapshot) {
  return a.porcentaje_fee === b.porcentaje_fee && a.iva_activo === b.iva_activo && a.descuento_tipo === b.descuento_tipo && a.descuento_valor === b.descuento_valor
}

export default function CotizacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [driveLink, setDriveLink] = useState<string | null>(null)
  const [notasInternas, setNotasInternas] = useState('')
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const [isSavingNotas, setIsSavingNotas] = useState(false)
  const [isSavingGeneral, setIsSavingGeneral] = useState(false)
  const [isSavingTotals, setIsSavingTotals] = useState(false)
  const notasSectionRef = useRef<HTMLDivElement | null>(null)
  const generalSectionRef = useRef<HTMLDivElement | null>(null)
  const totalsSectionRef = useRef<HTMLDivElement | null>(null)
  const notasAutosaveTimerRef = useRef<number | null>(null)
  const generalAutosaveTimerRef = useRef<number | null>(null)
  const totalsAutosaveTimerRef = useRef<number | null>(null)
  const notasIdleReleaseTimerRef = useRef<number | null>(null)
  const generalIdleReleaseTimerRef = useRef<number | null>(null)
  const totalsIdleReleaseTimerRef = useRef<number | null>(null)
  const notasDirtyRef = useRef(false)
  const generalDirtyRef = useRef(false)
  const totalsDirtyRef = useRef(false)
  const notasLockHeldRef = useRef(false)
  const generalLockHeldRef = useRef(false)
  const totalsLockHeldRef = useRef(false)
  const notasFocusedRef = useRef(false)
  const generalFocusedRef = useRef(false)
  const totalsFocusedRef = useRef(false)
  const notasValueRef = useRef('')
  const clienteInputValueRef = useRef('')
  const proyectoInputValueRef = useRef('')
  const porcentajeFeeValueRef = useRef(0.15)
  const ivaActivoValueRef = useRef(true)
  const descuentoTipoValueRef = useRef<'monto' | 'porcentaje'>('monto')
  const descuentoValorValueRef = useRef(0)
  const lastSavedNotasRef = useRef('')
  const lastSavedGeneralRef = useRef<GeneralSnapshot>(buildGeneralSnapshot({}))
  const lastSavedTotalsRef = useRef<TotalsSnapshot>(buildTotalsSnapshot({}))

  const { register, control, watch, reset, setValue, getValues } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...EMPTY_QUOTATION_ITEM }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedFechaEntrega = watch('fecha_entrega') || ''
  const watchedLocacion = watch('locacion') || ''
  const quotationForm = useQuotationForm(setValue, watchedItems)
  const {
    refreshCatalogos,
    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    seleccionarProyecto,
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

  const currentGeneralSnapshot = useMemo(() => buildGeneralSnapshot({
    cliente: clienteInput,
    proyecto: proyectoInput,
    fecha_entrega: watchedFechaEntrega,
    locacion: watchedLocacion,
  }), [clienteInput, proyectoInput, watchedFechaEntrega, watchedLocacion])

  const currentTotalsSnapshot = useMemo(() => buildTotalsSnapshot({
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  }), [descuento_tipo, descuento_valor, iva_activo, porcentaje_fee])

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'EMITIDA'
  const { onlineUsers, sectionEditors, savedSections, setActiveSection, releaseSection, markSectionSaved } = useQuotationPresence({
    cotizacionId: id,
    enabled: !!esEditable,
    currentUser: {
      id: (session?.user as { id?: string | null } | undefined)?.id,
      email: session?.user?.email,
      name: session?.user?.name,
    },
  })

  const getCurrentNotasSnapshot = useCallback(() => {
    return notasValueRef.current.trim() ? notasValueRef.current : ''
  }, [])

  const getCurrentGeneralSnapshot = useCallback(() => {
    return buildGeneralSnapshot({
      cliente: clienteInputValueRef.current,
      proyecto: proyectoInputValueRef.current,
      fecha_entrega: getValues('fecha_entrega') || '',
      locacion: getValues('locacion') || '',
    })
  }, [getValues])

  const getCurrentTotalsSnapshot = useCallback(() => {
    return buildTotalsSnapshot({
      porcentaje_fee: porcentajeFeeValueRef.current,
      iva_activo: ivaActivoValueRef.current,
      descuento_tipo: descuentoTipoValueRef.current,
      descuento_valor: descuentoValorValueRef.current,
    })
  }, [])

  const clearNotasIdleReleaseTimer = useCallback(() => {
    if (notasIdleReleaseTimerRef.current !== null) {
      window.clearTimeout(notasIdleReleaseTimerRef.current)
      notasIdleReleaseTimerRef.current = null
    }
  }, [])

  const clearGeneralIdleReleaseTimer = useCallback(() => {
    if (generalIdleReleaseTimerRef.current !== null) {
      window.clearTimeout(generalIdleReleaseTimerRef.current)
      generalIdleReleaseTimerRef.current = null
    }
  }, [])

  const clearTotalsIdleReleaseTimer = useCallback(() => {
    if (totalsIdleReleaseTimerRef.current !== null) {
      window.clearTimeout(totalsIdleReleaseTimerRef.current)
      totalsIdleReleaseTimerRef.current = null
    }
  }, [])

  const scheduleNotasIdleRelease = useCallback(() => {
    clearNotasIdleReleaseTimer()
    if (!notasLockHeldRef.current) return

    notasIdleReleaseTimerRef.current = window.setTimeout(() => {
      notasIdleReleaseTimerRef.current = null
      if (!notasLockHeldRef.current || notasDirtyRef.current || isSavingNotas) return
      notasLockHeldRef.current = false
      releaseSection('notas')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearNotasIdleReleaseTimer, isSavingNotas, releaseSection])

  const scheduleGeneralIdleRelease = useCallback(() => {
    clearGeneralIdleReleaseTimer()
    if (!generalLockHeldRef.current) return

    generalIdleReleaseTimerRef.current = window.setTimeout(() => {
      generalIdleReleaseTimerRef.current = null
      if (!generalLockHeldRef.current || generalDirtyRef.current || isSavingGeneral) return
      generalLockHeldRef.current = false
      releaseSection('general')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearGeneralIdleReleaseTimer, isSavingGeneral, releaseSection])

  const scheduleTotalsIdleRelease = useCallback(() => {
    clearTotalsIdleReleaseTimer()
    if (!totalsLockHeldRef.current) return

    totalsIdleReleaseTimerRef.current = window.setTimeout(() => {
      totalsIdleReleaseTimerRef.current = null
      if (!totalsLockHeldRef.current || totalsDirtyRef.current || isSavingTotals) return
      totalsLockHeldRef.current = false
      releaseSection('totales')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearTotalsIdleReleaseTimer, isSavingTotals, releaseSection])

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
    const notas = cot.notas_internas ?? ''
    const general = buildGeneralSnapshot({
      cliente: cot.cliente,
      proyecto: cot.proyecto,
      fecha_entrega: cot.fecha_entrega || '',
      locacion: cot.locacion || '',
    })
    const totalsConfig = buildTotalsSnapshot({
      porcentaje_fee: cot.porcentaje_fee,
      iva_activo: cot.iva_activo,
      descuento_tipo: cot.descuento_tipo,
      descuento_valor: cot.descuento_valor,
    })
    setNotasInternas(notas)
    notasValueRef.current = notas
    lastSavedNotasRef.current = notas
    notasDirtyRef.current = false
    lastSavedGeneralRef.current = general
    generalDirtyRef.current = false
    lastSavedTotalsRef.current = totalsConfig
    totalsDirtyRef.current = false
    setClienteInput(cot.cliente || '')
    clienteInputValueRef.current = cot.cliente || ''
    setProyectoInput(cot.proyecto || '')
    proyectoInputValueRef.current = cot.proyecto || ''
    setPorcentajeFee(totalsConfig.porcentaje_fee)
    porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee
    setIvaActivo(totalsConfig.iva_activo)
    ivaActivoValueRef.current = totalsConfig.iva_activo
    setDescuentoTipo(totalsConfig.descuento_tipo)
    descuentoTipoValueRef.current = totalsConfig.descuento_tipo
    setDescuentoValor(totalsConfig.descuento_valor)
    descuentoValorValueRef.current = totalsConfig.descuento_valor
    reset({
      cliente: cot.cliente,
      proyecto: cot.proyecto,
      fecha_entrega: cot.fecha_entrega || '',
      locacion: cot.locacion || '',
      items: (cot.items || []).map((item: ItemCotizacion) => ({
        id: item.id,
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        responsable_id: item.responsable_id || '',
        responsable_nombre: item.responsable_nombre || '',
        x_pagar: item.x_pagar,
      })),
    })
  }, [reset, setClienteInput, setProyectoInput])

  const applyNotasOnly = useCallback((notas: string | null) => {
    const normalized = notas ?? ''
    setNotasInternas(normalized)
    notasValueRef.current = normalized
    lastSavedNotasRef.current = normalized
    notasDirtyRef.current = false
    setCotizacion((prev) => (prev ? { ...prev, notas_internas: notas } : prev))
  }, [])

  const applyGeneralOnly = useCallback((cot: Cotizacion) => {
    const general = buildGeneralSnapshot({
      cliente: cot.cliente,
      proyecto: cot.proyecto,
      fecha_entrega: cot.fecha_entrega || '',
      locacion: cot.locacion || '',
    })
    lastSavedGeneralRef.current = general
    generalDirtyRef.current = false
    setClienteInput(general.cliente)
    clienteInputValueRef.current = general.cliente
    setProyectoInput(general.proyecto)
    proyectoInputValueRef.current = general.proyecto
    setValue('cliente', general.cliente)
    setValue('proyecto', general.proyecto)
    setValue('fecha_entrega', general.fecha_entrega)
    setValue('locacion', general.locacion)
    setCotizacion((prev) => prev ? {
      ...prev,
      cliente: general.cliente,
      proyecto: general.proyecto,
      fecha_entrega: general.fecha_entrega || null,
      locacion: general.locacion || null,
    } : prev)
  }, [setClienteInput, setProyectoInput, setValue])

  const applyTotalsOnly = useCallback((cot: Cotizacion) => {
    const totalsConfig = buildTotalsSnapshot({
      porcentaje_fee: cot.porcentaje_fee,
      iva_activo: cot.iva_activo,
      descuento_tipo: cot.descuento_tipo,
      descuento_valor: cot.descuento_valor,
    })
    lastSavedTotalsRef.current = totalsConfig
    totalsDirtyRef.current = false
    setPorcentajeFee(totalsConfig.porcentaje_fee)
    porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee
    setIvaActivo(totalsConfig.iva_activo)
    ivaActivoValueRef.current = totalsConfig.iva_activo
    setDescuentoTipo(totalsConfig.descuento_tipo)
    descuentoTipoValueRef.current = totalsConfig.descuento_tipo
    setDescuentoValor(totalsConfig.descuento_valor)
    descuentoValorValueRef.current = totalsConfig.descuento_valor
    setCotizacion((prev) => prev ? {
      ...prev,
      porcentaje_fee: totalsConfig.porcentaje_fee,
      iva_activo: totalsConfig.iva_activo,
      descuento_tipo: totalsConfig.descuento_tipo,
      descuento_valor: totalsConfig.descuento_valor,
    } : prev)
  }, [])

  useEffect(() => { refreshCatalogos() }, [refreshCatalogos])

  useEffect(() => {
    notasValueRef.current = notasInternas
  }, [notasInternas])

  useEffect(() => {
    clienteInputValueRef.current = clienteInput
  }, [clienteInput])

  useEffect(() => {
    proyectoInputValueRef.current = proyectoInput
  }, [proyectoInput])

  useEffect(() => {
    porcentajeFeeValueRef.current = porcentaje_fee
  }, [porcentaje_fee])

  useEffect(() => {
    ivaActivoValueRef.current = iva_activo
  }, [iva_activo])

  useEffect(() => {
    descuentoTipoValueRef.current = descuento_tipo
  }, [descuento_tipo])

  useEffect(() => {
    descuentoValorValueRef.current = descuento_valor
  }, [descuento_valor])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchResponsables()])
      .then(([cot, resp]) => {
        applyCotizacionToState(cot)
        setResponsables(resp)
        setLoading(false)
        const pending = sessionStorage.getItem('pdf_drive_result')
        if (pending) {
          sessionStorage.removeItem('pdf_drive_result')
          try {
            const { link } = JSON.parse(pending)
            setSuccess('PDF guardado exitosamente en Drive')
            setDriveLink(link ?? null)
          } catch { /* ignorar */ }
        }
      })
      .catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  const totales = useMemo(
    () => calculateQuotationTotals({ items: watchedItems || [], porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }),
    [watchedItems, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor]
  )
  const displayTotales = useMemo(
    () => esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales),
    [esEditable, cotizacion, totales]
  )

  const persistNotasAutosave = useCallback(async () => {
    if (!cotizacion) return

    const notasToSave = getCurrentNotasSnapshot()
    const previousNotas = lastSavedNotasRef.current

    if (notasToSave === previousNotas) {
      notasDirtyRef.current = false
      if (!notasFocusedRef.current) {
        clearNotasIdleReleaseTimer()
        notasLockHeldRef.current = false
        releaseSection('notas')
        return
      }
      scheduleNotasIdleRelease()
      return
    }

    let saveSucceeded = false
    setIsSavingNotas(true)
    try {
      await saveQuotationNotes(id, notasToSave || null)
      lastSavedNotasRef.current = notasToSave
      setCotizacion((prev) => (prev ? { ...prev, notas_internas: notasToSave || null } : prev))
      saveSucceeded = true
      markSectionSaved('notas')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error guardando notas internas')
      notasDirtyRef.current = getCurrentNotasSnapshot() !== lastSavedNotasRef.current
      clearNotasIdleReleaseTimer()
      notasLockHeldRef.current = false
      releaseSection('notas')
      return
    } finally {
      setIsSavingNotas(false)
    }

    if (!saveSucceeded) return

    const hasPendingChanges = getCurrentNotasSnapshot() !== lastSavedNotasRef.current
    notasDirtyRef.current = hasPendingChanges

    if (!notasFocusedRef.current) {
      clearNotasIdleReleaseTimer()
      notasLockHeldRef.current = false
      releaseSection('notas')
      return
    }

    if (!hasPendingChanges) {
      scheduleNotasIdleRelease()
    }
  }, [clearNotasIdleReleaseTimer, cotizacion, getCurrentNotasSnapshot, id, markSectionSaved, releaseSection, scheduleNotasIdleRelease])

  const persistGeneralAutosave = useCallback(async () => {
    if (!cotizacion) return

    const snapshot = getCurrentGeneralSnapshot()
    const previousSnapshot = lastSavedGeneralRef.current

    if (areGeneralSnapshotsEqual(snapshot, previousSnapshot)) {
      generalDirtyRef.current = false
      if (!generalFocusedRef.current) {
        clearGeneralIdleReleaseTimer()
        generalLockHeldRef.current = false
        releaseSection('general')
        return
      }
      scheduleGeneralIdleRelease()
      return
    }

    let saveSucceeded = false
    setIsSavingGeneral(true)
    try {
      await saveQuotationGeneral(id, {
        cliente: snapshot.cliente,
        proyecto: snapshot.proyecto,
        fecha_entrega: snapshot.fecha_entrega || null,
        locacion: snapshot.locacion || null,
      })
      lastSavedGeneralRef.current = snapshot
      setCotizacion((prev) => prev ? {
        ...prev,
        cliente: snapshot.cliente,
        proyecto: snapshot.proyecto,
        fecha_entrega: snapshot.fecha_entrega || null,
        locacion: snapshot.locacion || null,
      } : prev)
      saveSucceeded = true
      markSectionSaved('general')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error guardando información general')
      generalDirtyRef.current = !areGeneralSnapshotsEqual(getCurrentGeneralSnapshot(), lastSavedGeneralRef.current)
      clearGeneralIdleReleaseTimer()
      generalLockHeldRef.current = false
      releaseSection('general')
      return
    } finally {
      setIsSavingGeneral(false)
    }

    if (!saveSucceeded) return

    const hasPendingChanges = !areGeneralSnapshotsEqual(getCurrentGeneralSnapshot(), lastSavedGeneralRef.current)
    generalDirtyRef.current = hasPendingChanges

    if (!generalFocusedRef.current) {
      clearGeneralIdleReleaseTimer()
      generalLockHeldRef.current = false
      releaseSection('general')
      return
    }

    if (!hasPendingChanges) {
      scheduleGeneralIdleRelease()
    }
  }, [clearGeneralIdleReleaseTimer, cotizacion, getCurrentGeneralSnapshot, id, markSectionSaved, releaseSection, scheduleGeneralIdleRelease])

  const persistTotalsAutosave = useCallback(async () => {
    if (!cotizacion) return

    const snapshot = getCurrentTotalsSnapshot()
    const previousSnapshot = lastSavedTotalsRef.current

    if (areTotalsSnapshotsEqual(snapshot, previousSnapshot)) {
      totalsDirtyRef.current = false
      if (!totalsFocusedRef.current) {
        clearTotalsIdleReleaseTimer()
        totalsLockHeldRef.current = false
        releaseSection('totales')
        return
      }
      scheduleTotalsIdleRelease()
      return
    }

    let saveSucceeded = false
    setIsSavingTotals(true)
    try {
      await saveQuotationTotals(id, snapshot)
      lastSavedTotalsRef.current = snapshot
      setCotizacion((prev) => prev ? {
        ...prev,
        porcentaje_fee: snapshot.porcentaje_fee,
        iva_activo: snapshot.iva_activo,
        descuento_tipo: snapshot.descuento_tipo,
        descuento_valor: snapshot.descuento_valor,
      } : prev)
      saveSucceeded = true
      markSectionSaved('totales')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error guardando configuración de totales')
      totalsDirtyRef.current = !areTotalsSnapshotsEqual(getCurrentTotalsSnapshot(), lastSavedTotalsRef.current)
      clearTotalsIdleReleaseTimer()
      totalsLockHeldRef.current = false
      releaseSection('totales')
      return
    } finally {
      setIsSavingTotals(false)
    }

    if (!saveSucceeded) return

    const hasPendingChanges = !areTotalsSnapshotsEqual(getCurrentTotalsSnapshot(), lastSavedTotalsRef.current)
    totalsDirtyRef.current = hasPendingChanges

    if (!totalsFocusedRef.current) {
      clearTotalsIdleReleaseTimer()
      totalsLockHeldRef.current = false
      releaseSection('totales')
      return
    }

    if (!hasPendingChanges) {
      scheduleTotalsIdleRelease()
    }
  }, [clearTotalsIdleReleaseTimer, cotizacion, getCurrentTotalsSnapshot, id, markSectionSaved, releaseSection, scheduleTotalsIdleRelease])

  useEffect(() => {
    if (!esEditable || !notasLockHeldRef.current || !notasDirtyRef.current || isSavingNotas) return
    if (sectionEditors.notas) return

    if (notasAutosaveTimerRef.current !== null) {
      window.clearTimeout(notasAutosaveTimerRef.current)
    }

    notasAutosaveTimerRef.current = window.setTimeout(() => {
      void persistNotasAutosave()
    }, NOTAS_AUTOSAVE_DELAY_MS)

    return () => {
      if (notasAutosaveTimerRef.current !== null) {
        window.clearTimeout(notasAutosaveTimerRef.current)
        notasAutosaveTimerRef.current = null
      }
    }
  }, [esEditable, isSavingNotas, notasInternas, persistNotasAutosave, sectionEditors.notas])

  useEffect(() => {
    if (!esEditable || !generalLockHeldRef.current || !generalDirtyRef.current || isSavingGeneral) return
    if (sectionEditors.general) return

    if (generalAutosaveTimerRef.current !== null) {
      window.clearTimeout(generalAutosaveTimerRef.current)
    }

    generalAutosaveTimerRef.current = window.setTimeout(() => {
      void persistGeneralAutosave()
    }, GENERAL_AUTOSAVE_DELAY_MS)

    return () => {
      if (generalAutosaveTimerRef.current !== null) {
        window.clearTimeout(generalAutosaveTimerRef.current)
        generalAutosaveTimerRef.current = null
      }
    }
  }, [currentGeneralSnapshot, esEditable, isSavingGeneral, persistGeneralAutosave, sectionEditors.general])

  useEffect(() => {
    if (!esEditable || !totalsLockHeldRef.current || !totalsDirtyRef.current || isSavingTotals) return
    if (sectionEditors.totales) return

    if (totalsAutosaveTimerRef.current !== null) {
      window.clearTimeout(totalsAutosaveTimerRef.current)
    }

    totalsAutosaveTimerRef.current = window.setTimeout(() => {
      void persistTotalsAutosave()
    }, TOTALS_AUTOSAVE_DELAY_MS)

    return () => {
      if (totalsAutosaveTimerRef.current !== null) {
        window.clearTimeout(totalsAutosaveTimerRef.current)
        totalsAutosaveTimerRef.current = null
      }
    }
  }, [currentTotalsSnapshot, esEditable, isSavingTotals, persistTotalsAutosave, sectionEditors.totales])

  useEffect(() => {
    const remoteNotasSaves = savedSections.notas || 0
    if (!remoteNotasSaves) return
    if (notasLockHeldRef.current || isSavingNotas) return

    fetchQuotationDetail(id)
      .then((updated) => {
        applyNotasOnly(updated.notas_internas ?? null)
      })
      .catch((loadError) => {
        console.error('[cotizaciones/[id]] Error refrescando notas tras save remoto:', loadError)
      })
  }, [applyNotasOnly, id, isSavingNotas, savedSections.notas])

  useEffect(() => {
    const remoteGeneralSaves = savedSections.general || 0
    if (!remoteGeneralSaves) return
    if (generalLockHeldRef.current || isSavingGeneral) return

    fetchQuotationDetail(id)
      .then((updated) => {
        applyGeneralOnly(updated)
      })
      .catch((loadError) => {
        console.error('[cotizaciones/[id]] Error refrescando general tras save remoto:', loadError)
      })
  }, [applyGeneralOnly, id, isSavingGeneral, savedSections.general])

  useEffect(() => {
    const remoteTotalsSaves = savedSections.totales || 0
    if (!remoteTotalsSaves) return
    if (totalsLockHeldRef.current || isSavingTotals) return

    fetchQuotationDetail(id)
      .then((updated) => {
        applyTotalsOnly(updated)
      })
      .catch((loadError) => {
        console.error('[cotizaciones/[id]] Error refrescando totales tras save remoto:', loadError)
      })
  }, [applyTotalsOnly, id, isSavingTotals, savedSections.totales])

  useEffect(() => {
    if (!generalLockHeldRef.current) return
    if (!areGeneralSnapshotsEqual(currentGeneralSnapshot, lastSavedGeneralRef.current)) {
      generalDirtyRef.current = true
    }
  }, [currentGeneralSnapshot])

  useEffect(() => {
    if (!totalsLockHeldRef.current) return
    if (!areTotalsSnapshotsEqual(currentTotalsSnapshot, lastSavedTotalsRef.current)) {
      totalsDirtyRef.current = true
    }
  }, [currentTotalsSnapshot])

  useEffect(() => {
    return () => {
      if (notasAutosaveTimerRef.current !== null) {
        window.clearTimeout(notasAutosaveTimerRef.current)
      }
      if (generalAutosaveTimerRef.current !== null) {
        window.clearTimeout(generalAutosaveTimerRef.current)
      }
      if (totalsAutosaveTimerRef.current !== null) {
        window.clearTimeout(totalsAutosaveTimerRef.current)
      }
      clearNotasIdleReleaseTimer()
      clearGeneralIdleReleaseTimer()
      clearTotalsIdleReleaseTimer()
    }
  }, [clearGeneralIdleReleaseTimer, clearNotasIdleReleaseTimer, clearTotalsIdleReleaseTimer])

  const handleSectionBlur = useCallback((event: FocusEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!esEditable) return

    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && ref.current?.contains(nextTarget)) return

    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && ref.current?.contains(activeElement)) return
      releaseSection()
    }, 0)
  }, [esEditable, releaseSection])

  const activateNotasEditing = useCallback(() => {
    clearNotasIdleReleaseTimer()
    notasFocusedRef.current = true
    if (!esEditable || !!sectionEditors.notas) return
    if (!notasLockHeldRef.current) {
      notasLockHeldRef.current = true
      setActiveSection('notas')
    }
  }, [clearNotasIdleReleaseTimer, esEditable, sectionEditors.notas, setActiveSection])

  const markNotasDirty = useCallback(() => {
    if (!esEditable || !!sectionEditors.notas) return
    activateNotasEditing()
    notasDirtyRef.current = true
  }, [activateNotasEditing, esEditable, sectionEditors.notas])

  const handleNotasFocus = useCallback(() => {
    activateNotasEditing()
  }, [activateNotasEditing])

  const activateGeneralEditing = useCallback(() => {
    clearGeneralIdleReleaseTimer()
    generalFocusedRef.current = true
    if (!esEditable || !!sectionEditors.general) return
    if (!generalLockHeldRef.current) {
      generalLockHeldRef.current = true
      setActiveSection('general')
    }
  }, [clearGeneralIdleReleaseTimer, esEditable, sectionEditors.general, setActiveSection])

  const markGeneralDirty = useCallback(() => {
    if (!esEditable || !!sectionEditors.general) return
    activateGeneralEditing()
    generalDirtyRef.current = true
  }, [activateGeneralEditing, esEditable, sectionEditors.general])

  const handleGeneralFocus = useCallback(() => {
    activateGeneralEditing()
  }, [activateGeneralEditing])

  const activateTotalsEditing = useCallback(() => {
    clearTotalsIdleReleaseTimer()
    totalsFocusedRef.current = true
    if (!esEditable || !!sectionEditors.totales) return
    if (!totalsLockHeldRef.current) {
      totalsLockHeldRef.current = true
      setActiveSection('totales')
    }
  }, [clearTotalsIdleReleaseTimer, esEditable, sectionEditors.totales, setActiveSection])

  const markTotalsDirty = useCallback(() => {
    if (!esEditable || !!sectionEditors.totales) return
    activateTotalsEditing()
    totalsDirtyRef.current = true
  }, [activateTotalsEditing, esEditable, sectionEditors.totales])

  const handleTotalsFocus = useCallback(() => {
    activateTotalsEditing()
  }, [activateTotalsEditing])

  const handleNotasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return

    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && notasSectionRef.current?.contains(nextTarget)) return

    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && notasSectionRef.current?.contains(activeElement)) return

      notasFocusedRef.current = false
      clearNotasIdleReleaseTimer()

      if (notasDirtyRef.current) {
        void persistNotasAutosave()
        return
      }

      notasLockHeldRef.current = false
      releaseSection('notas')
    }, 0)
  }, [clearNotasIdleReleaseTimer, esEditable, persistNotasAutosave, releaseSection])

  const handleGeneralBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return

    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && generalSectionRef.current?.contains(nextTarget)) return

    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && generalSectionRef.current?.contains(activeElement)) return

      generalFocusedRef.current = false
      clearGeneralIdleReleaseTimer()

      if (generalDirtyRef.current) {
        void persistGeneralAutosave()
        return
      }

      generalLockHeldRef.current = false
      releaseSection('general')
    }, 0)
  }, [clearGeneralIdleReleaseTimer, esEditable, persistGeneralAutosave, releaseSection])

  const handleTotalsBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return

    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && totalsSectionRef.current?.contains(nextTarget)) return

    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && totalsSectionRef.current?.contains(activeElement)) return

      totalsFocusedRef.current = false
      clearTotalsIdleReleaseTimer()

      if (totalsDirtyRef.current) {
        void persistTotalsAutosave()
        return
      }

      totalsLockHeldRef.current = false
      releaseSection('totales')
    }, 0)
  }, [clearTotalsIdleReleaseTimer, esEditable, persistTotalsAutosave, releaseSection])

  const trackedHandleClienteChange = useCallback((value: string) => {
    markGeneralDirty()
    handleClienteChange(value)
  }, [handleClienteChange, markGeneralDirty])

  const trackedHandleProyectoChange = useCallback((value: string) => {
    markGeneralDirty()
    handleProyectoChange(value)
  }, [handleProyectoChange, markGeneralDirty])

  const trackedSelectCliente = useCallback((value: string) => {
    markGeneralDirty()
    seleccionarCliente(value)
  }, [markGeneralDirty, seleccionarCliente])

  const trackedSelectProyecto = useCallback((value: string) => {
    markGeneralDirty()
    seleccionarProyecto(value)
  }, [markGeneralDirty, seleccionarProyecto])

  const trackedHandleFechaEntregaChange = useCallback(() => {
    markGeneralDirty()
  }, [markGeneralDirty])

  const trackedHandleLocacionChange = useCallback(() => {
    markGeneralDirty()
  }, [markGeneralDirty])

  const trackedSetPorcentajeFee = useCallback((value: number) => {
    markTotalsDirty()
    porcentajeFeeValueRef.current = value
    setPorcentajeFee(value)
  }, [markTotalsDirty])

  const trackedSetIvaActivo = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    markTotalsDirty()
    const nextValue = typeof value === 'function' ? value(ivaActivoValueRef.current) : value
    ivaActivoValueRef.current = nextValue
    setIvaActivo(nextValue)
  }, [markTotalsDirty])

  const trackedSetDescuentoTipo = useCallback((value: 'monto' | 'porcentaje') => {
    markTotalsDirty()
    descuentoTipoValueRef.current = value
    setDescuentoTipo(value)
  }, [markTotalsDirty])

  const trackedSetDescuentoValor = useCallback((value: number) => {
    markTotalsDirty()
    descuentoValorValueRef.current = value
    setDescuentoValor(value)
  }, [markTotalsDirty])

  const guardar = async (estado?: string): Promise<boolean> => {
    setGuardando(true)
    setError(null)
    try {
      const refreshedCotizacion = await updateQuotation(id, {
        cliente: watch('cliente'),
        proyecto: watch('proyecto'),
        fecha_entrega: watch('fecha_entrega'),
        locacion: watch('locacion'),
        items: watchedItems,
      }, {
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
        responsables,
        currentQuotation: cotizacion,
        notas_internas: notasInternas || null,
        ...(estado ? { estado: estado as 'BORRADOR' | 'EMITIDA' | 'APROBADA' } : {}),
      })
      applyCotizacionToState(refreshedCotizacion)
      await refreshCatalogos()
      setSuccess('Guardado correctamente')
      setTimeout(() => setSuccess(null), 3000)
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      return false
    } finally {
      setGuardando(false)
    }
  }

  const aprobar = async () => {
    setAprobando(true)
    setError(null)
    setSuccess(null)
    try {
      const ok = await guardar()
      if (!ok) return
      const fullCot = await approveQuotation(id)
      applyCotizacionToState(fullCot)
      await refreshCatalogos()
      setSuccess('¡Cotización aprobada! Proyecto y cuentas creados.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al aprobar')
    } finally {
      setAprobando(false)
    }
  }

  const handlePdfResult = (result: { savedToDrive: boolean; driveWebViewLink?: string; driveError?: string }) => {
    if (result.savedToDrive) {
      setSuccess('PDF guardado exitosamente en Drive')
      setDriveLink(result.driveWebViewLink ?? null)
    } else if (result.driveError) {
      setError(`Error al guardar en Drive: ${result.driveError}`)
      setDriveLink(null)
    } else {
      setError('No se pudo guardar el PDF en Drive')
      setDriveLink(null)
    }
    setTimeout(() => { setSuccess(null); setError(null); setDriveLink(null) }, 10000)
  }

  const generarPDF = async () => {
    if (!cotizacion) return
    setGenerandoPdf(true)
    setError(null)
    setSuccess(null)
    setDriveLink(null)
    try {
      const result = await generateQuotationPdf(cotizacion, undefined, { skipDownload: true })
      handlePdfResult(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar PDF')
    } finally {
      setGenerandoPdf(false)
    }
  }

  const generarCotizacion = async () => {
    const ok = await guardar('EMITIDA')
    if (!ok) return
    const refreshedCotizacion = await fetchQuotationDetail(id)
    applyCotizacionToState(refreshedCotizacion)
    setGenerandoPdf(true)
    setError(null)
    setSuccess(null)
    setDriveLink(null)
    try {
      const result = await generateQuotationPdf(refreshedCotizacion, watchedItems, { skipDownload: true })
      handlePdfResult(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar PDF')
    } finally {
      setGenerandoPdf(false)
    }
  }
  const crearComplementaria = () => { if (cotizacion) router.push(buildComplementariaUrl(id, cotizacion)) }

  const cancelarCotizacion = async () => {
    if (!confirm('¿Cancelar esta cotización? Se eliminará el proyecto y las cuentas por cobrar/pagar asociadas.')) return
    setCancelando(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/cotizaciones/${id}/cancelar`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Error al cancelar')
      }
      const updated = await res.json()
      applyCotizacionToState(updated)
      setSuccess('Cotización cancelada. Proyecto y cuentas eliminados.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cancelar')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) return <SkeletonQuotationDetail />
  if (!cotizacion) return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cotización no encontrada</div>

  const currentUserId = (session?.user as { id?: string | null } | undefined)?.id || session?.user?.email || null
  const uniqueOnlineUsers = onlineUsers.filter((user, index, arr) => arr.findIndex((item) => item.user_id === user.user_id) === index)
  const visibleOnlineUsers = uniqueOnlineUsers.filter((user) => user.user_id !== currentUserId)
  const notasLockedByOther = !!sectionEditors.notas
  const generalLockedByOther = !!sectionEditors.general
  const totalsLockedByOther = !!sectionEditors.totales

  const SectionEditBadge = ({ section }: { section: QuotationPresenceSection }) => {
    const editor = sectionEditors[section]
    if (!editor) return null

    return (
      <p className="text-xs text-orange-300 mb-2">
        {getShortName(editor.name, editor.email)} está editando esta sección
      </p>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-white font-mono">{cotizacion.id}</h1>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${cotizacion.estado === 'APROBADA' ? 'bg-green-900 text-green-300' : cotizacion.estado === 'EMITIDA' ? 'bg-blue-900 text-blue-300' : cotizacion.estado === 'CANCELADA' ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'}`}>{cotizacion.estado}</span>
          </div>
          <p className="text-gray-400">{cotizacion.proyecto} — {cotizacion.cliente}</p>
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Colaborando ahora</p>
            <div className="flex flex-wrap gap-2">
              {visibleOnlineUsers.length === 0 ? (
                <span className="text-xs text-gray-500">Solo tú en esta cotización</span>
              ) : (
                visibleOnlineUsers.map((user) => {
                  const shortName = getShortName(user.name, user.email)
                  return (
                    <span key={user.user_id} className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-200">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-[10px] font-semibold text-gray-100">
                        {getInitials(shortName)}
                      </span>
                      <span>{shortName}</span>
                      {user.active_section ? <span className="text-gray-400">· {sectionLabels[user.active_section]}</span> : null}
                    </span>
                  )
                })
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:justify-end">
          {cotizacion.estado === 'BORRADOR' && <><button onClick={() => guardar()} disabled={guardando} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{guardando ? 'Guardando...' : 'Guardar'}</button><button onClick={generarCotizacion} disabled={guardando || generandoPdf} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : guardando ? 'Generando...' : 'Generar Cotización'}</button></>}
          {cotizacion.estado === 'EMITIDA' && <><button onClick={() => guardar()} disabled={guardando} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{guardando ? 'Guardando...' : 'Guardar'}</button><button onClick={generarPDF} disabled={generandoPdf} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={aprobar} disabled={aprobando || guardando} className="bg-green-700 hover:bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]">{aprobando ? 'Aprobando...' : 'Aprobar Cotización'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="bg-red-800 hover:bg-red-700 text-red-200 px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button></>}
          {cotizacion.estado === 'APROBADA' && <><button onClick={generarPDF} disabled={generandoPdf} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={crearComplementaria} className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px]">Crear Complementaria</button><button onClick={cancelarCotizacion} disabled={cancelando} className="bg-red-800 hover:bg-red-700 text-red-200 px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button></>}
        </div>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-4">{error}</div>}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-4">
          <span>{success}</span>
          {driveLink && (
            <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-200 underline text-sm whitespace-nowrap">
              Ver en Drive →
            </a>
          )}
        </div>
      )}

      {(notasInternas || esEditable) && (
        <div
          ref={notasSectionRef}
          className={`bg-gray-800/60 border rounded-xl p-4 mb-6 ${notasLockedByOther ? 'border-orange-600/70 opacity-80' : 'border-gray-700'}`}
          onFocusCapture={handleNotasFocus}
          onBlurCapture={handleNotasBlur}
        >
          <SectionEditBadge section="notas" />
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Notas del evento (uso interno)</p>
          {esEditable ? (
            <textarea
              value={notasInternas}
              onChange={e => {
                markNotasDirty()
                setNotasInternas(e.target.value)
              }}
              rows={3}
              placeholder="Sin notas..."
              disabled={notasLockedByOther}
              className="w-full bg-transparent text-gray-300 text-sm resize-none outline-none placeholder-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ) : (
            <p className="text-gray-400 text-sm whitespace-pre-wrap">{notasInternas || '—'}</p>
          )}
        </div>
      )}

      <div
        ref={generalSectionRef}
        className={`rounded-xl ${generalLockedByOther ? 'ring-1 ring-orange-600/70 opacity-80' : ''}`}
        onFocusCapture={handleGeneralFocus}
        onBlurCapture={handleGeneralBlur}
      >
        <div className="px-1">
          <SectionEditBadge section="general" />
        </div>
        <QuotationGeneralInfoSection
          register={register}
          setValue={setValue}
          clienteInput={clienteInput}
          proyectoInput={proyectoInput}
          clienteSugerencias={clienteSugerencias}
          mostrarClienteDropdown={mostrarClienteDropdown}
          setMostrarClienteDropdown={setMostrarClienteDropdown}
          proyectosDelCliente={proyectosDelCliente}
          mostrarProyectoDropdown={mostrarProyectoDropdown}
          setMostrarProyectoDropdown={setMostrarProyectoDropdown}
          listaClientes={listaClientes}
          handleClienteChange={trackedHandleClienteChange}
          handleProyectoChange={trackedHandleProyectoChange}
          seleccionarCliente={seleccionarCliente}
          setProyectoInput={setProyectoInput}
          onClienteSelected={trackedSelectCliente}
          onProyectoSelected={trackedSelectProyecto}
          onFechaEntregaChange={trackedHandleFechaEntregaChange}
          onLocacionChange={trackedHandleLocacionChange}
          isReadOnly={!esEditable || generalLockedByOther}
          readOnlyDisplay={esEditable ? 'input' : 'text'}
          dateLabel={formatSpanishLongDate(cotizacion.fecha_cotizacion)}
          fechaEntregaValue={watch('fecha_entrega')}
          locacionValue={watch('locacion')}
        />
      </div>

      <div
        className={`rounded-xl ${sectionEditors.partidas ? 'ring-1 ring-orange-600/70 ring-offset-0' : ''}`}
        onFocusCapture={() => esEditable && setActiveSection('partidas')}
      >
        <div className="px-1">
          <SectionEditBadge section="partidas" />
        </div>
        <QuotationItemsSection
          editable={!!esEditable}
          register={register}
          setValue={setValue}
          watchedItems={watchedItems}
          fields={fields}
          append={append}
          remove={remove}
          editingItemIndex={editingItemIndex}
          setEditingItemIndex={setEditingItemIndex}
          calcItem={calcItem}
          handleDescripcionChange={handleDescripcionChange}
          seleccionarProducto={seleccionarProducto}
          productoSugerencias={productoSugerencias}
          mostrarProductoDropdown={mostrarProductoDropdown}
          setMostrarProductoDropdown={setMostrarProductoDropdown}
          responsables={responsables}
          readOnlyItems={cotizacion.items || []}
        />
      </div>

      <div
        ref={totalsSectionRef}
        className={`rounded-xl ${totalsLockedByOther ? 'ring-1 ring-orange-600/70 opacity-80' : ''}`}
        onFocusCapture={handleTotalsFocus}
        onBlurCapture={handleTotalsBlur}
      >
        <div className="px-1">
          <SectionEditBadge section="totales" />
        </div>
        <QuotationTotalsPanels
          totals={displayTotales}
          editable={!!esEditable && !totalsLockedByOther}
          porcentaje_fee={porcentaje_fee}
          setPorcentajeFee={trackedSetPorcentajeFee}
          iva_activo={iva_activo}
          setIvaActivo={trackedSetIvaActivo}
          descuento_tipo={descuento_tipo}
          setDescuentoTipo={trackedSetDescuentoTipo}
          descuento_valor={descuento_valor}
          setDescuentoValor={trackedSetDescuentoValor}
        />
      </div>
    </div>
  )
}
