'use client'

import { FocusEvent, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Cotizacion, Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { useQuotationMutationTracker } from '@/hooks/useQuotationMutationTracker'
import { useQuotationGeneralAutosave } from '@/hooks/useQuotationGeneralAutosave'
import { useQuotationTotalesAutosave } from '@/hooks/useQuotationTotalesAutosave'
import { useQuotationNotasAutosave } from '@/hooks/useQuotationNotasAutosave'
import { useQuotationItemCellsAutosave } from '@/hooks/useQuotationItemCellsAutosave'
import { useQuotationReconciliation } from '@/hooks/useQuotationReconciliation'
import { useQuotationBusinessActions } from '@/hooks/useQuotationBusinessActions'
import { QuotationPresenceSection, useQuotationPresence } from '@/hooks/useQuotationPresence'
import { calculateEstimatedTaxes, calculateQuotationTotals } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { fetchQuotationDetail, fetchProveedores } from '@/lib/services/quotation-service'
import { formatDateDisplay } from '@/lib/format-date'
import { Icon } from '@/components/ui/Icon'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { Modal } from '@/components/ui/Modal'
import { SkeletonQuotationDetail } from '@/app/components/ui/SkeletonQuotationDetail'
import { mapItemToFormItem } from '@/lib/quotations/collaboration'

const sectionLabels: Record<QuotationPresenceSection, string> = {
  notas: 'Notas',
  general: 'General',
  partidas: 'Partidas',
  totales: 'Totales',
}

// Fase 6E: la garantía PRIMARIA de convergencia ya no es este latido -- son los 4
// eventos server-confirmed (item/general/totales/notas, emitidos por Postgres vía
// sendRealtimeBroadcast) más reconectar el canal y volver a la pestaña, todos
// gatillando reconciliarConServidor() de inmediato. Este intervalo queda solo como
// red de última instancia por si alguno de esos avisos se pierde (p. ej. un
// broadcast que no llega durante una reconexión que el cliente no detectó a
// tiempo) -- deliberadamente mucho menos frecuente que antes (antes 5s, la única
// garantía real) para que quede claro en el propio código que ya no es el
// mecanismo principal.
const RECONCILIACION_MS = 20_000

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getShortName(name?: string | null, email?: string | null) {
  const cleanName = String(name || '').trim()
  if (cleanName) return cleanName.split(/\s+/).slice(0, 2).join(' ')
  const cleanEmail = String(email || '').trim()
  if (cleanEmail) return cleanEmail.split('@')[0]
  return 'Usuario'
}

export default function CotizacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [responsables, setResponsables] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [driveLink, setDriveLink] = useState<string | null>(null)
  // Id estable de la fila que edita la tarjeta móvil, no su índice: un `replace()`
  // de reconciliación (alta/baja de un colaborador) cambia qué índice apunta a cuál
  // fila, y un índice guardado quedaba apuntando a la fila equivocada -- ver
  // `QuotationItemsSection`, que recalcula el índice en cada render a partir de este id.
  const [editingItemRowId, setEditingItemRowId] = useState<string | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const notasSectionRef = useRef<HTMLDivElement | null>(null)
  const generalSectionRef = useRef<HTMLDivElement | null>(null)
  const totalsSectionRef = useRef<HTMLDivElement | null>(null)
  const partidasSectionRef = useRef<HTMLDivElement | null>(null)

  // EF-3 3D-1: extraído a hooks/useQuotationMutationTracker.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const { pendingMutationsRef, trackMutation } = useQuotationMutationTracker()

  const { register, control, watch, reset, setValue, getValues } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...EMPTY_QUOTATION_ITEM }] },
  })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
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

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'EMITIDA'
  // Bloque 2 sub-tarea 7: el botón "Crear plantilla" de Partidas se muestra
  // solo a quien ya tiene sección `planeacion` -- sin ampliar el guard de
  // `POST /api/service-templates` (supuesto 4 de docs/PLAN.md).
  const userSections = useMemo(
    () => (session?.user as { sections?: string[] })?.sections ?? [],
    [session?.user]
  )
  const canCreateTemplate = userSections.includes('planeacion')
  const [showNotasModal, setShowNotasModal] = useState(false)
  const {
    onlineUsers,
    sectionEditors,
    itemCellEditors,
    latestItemConfirmed,
    latestGeneralConfirmed,
    latestTotalesConfirmed,
    latestNotasConfirmed,
    setActiveSection,
    releaseSection,
    lockItemCell,
    releaseItemCell,
    isConnected,
  } = useQuotationPresence({
    cotizacionId: id,
    enabled: !!esEditable,
    currentUser: {
      id: (session?.user as { id?: string | null } | undefined)?.id,
      email: session?.user?.email,
      name: session?.user?.name,
    },
  })

  // EF-3 3D-2: extraído a hooks/useQuotationGeneralAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
    generalDirtyRef,
    generalLockHeldRef,
    generalFieldConflicts,
    applyGeneralOnly,
    flushGeneralDirtyFields,
    resolveGeneralFieldConflict,
    handleGeneralFocus,
    handleGeneralBlur,
    trackedHandleClienteChange,
    trackedHandleProyectoChange,
    trackedSelectCliente,
    trackedSelectProyecto,
    trackedHandleFechaEntregaChange,
    trackedHandleLocacionChange,
    clearGeneralIdleReleaseTimer,
    resetGeneralFromServer,
    clearAllGeneralFieldTimers,
  } = useQuotationGeneralAutosave({
    id,
    cotizacion,
    esEditable,
    trackMutation,
    setCotizacion,
    setError,
    setValue,
    getValues,
    setActiveSection,
    releaseSection,
    generalSectionRef,
    clienteInput,
    proyectoInput,
    setClienteInput,
    setProyectoInput,
    handleClienteChange,
    handleProyectoChange,
    seleccionarCliente,
    seleccionarProyecto,
  })

  // EF-3 3D-3: extraído a hooks/useQuotationTotalesAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
    totalsFieldConflicts,
    totalsDirtyRef,
    totalsLockHeldRef,
    applyTotalsOnly,
    flushTotalsDirtyFields,
    resolveTotalsFieldConflict,
    handleTotalsFocus,
    handleTotalsBlur,
    trackedSetPorcentajeFee,
    trackedSetIvaActivo,
    trackedSetDescuentoTipo,
    trackedSetDescuentoValor,
    clearTotalsIdleReleaseTimer,
    resetTotalsFromServer,
    clearAllTotalsFieldTimers,
  } = useQuotationTotalesAutosave({
    id,
    cotizacion,
    esEditable,
    trackMutation,
    setCotizacion,
    setError,
    setActiveSection,
    releaseSection,
    totalsSectionRef,
  })

  // EF-3 3D-4: extraído a hooks/useQuotationNotasAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
    notasInternas,
    notasPdf,
    notasDirtyRef,
    notasLockHeldRef,
    persistNotasAutosave,
    applyNotasOnly,
    handleNotasFocus,
    handleNotasBlur,
    trackedHandleNotasChange,
    trackedHandleNotasPdfChange,
    clearNotasIdleReleaseTimer,
    resetNotasFromServer,
  } = useQuotationNotasAutosave({
    id,
    cotizacion,
    esEditable,
    trackMutation,
    setCotizacion,
    setError,
    setActiveSection,
    releaseSection,
    notasSectionRef,
  })

  // EF-3 3D-5: extraído a hooks/useQuotationItemCellsAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe (el clúster de
  // mayor riesgo del refactor). `resyncPartidas` sale de
  // `useQuotationReconciliation`, que a su vez necesita los refs que este
  // hook produce -- para no crear un ciclo de imports entre los dos, se le
  // pasa un wrapper estable que lee de `resyncPartidasRef` (poblado por el
  // effect justo debajo de la llamada a `useQuotationReconciliation`, más
  // abajo) en vez del valor directo.
  const resyncPartidasRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const resyncPartidasStable = useCallback(() => resyncPartidasRef.current(), [])
  const {
    itemDirtyCellsRef,
    itemFocusedCellsRef,
    itemSavingCellsRef,
    localWriteAtRef,
    pendingRowCreationsRef,
    pendingRowRemovalsRef,
    hasLocalItemRowActivity,
    recordServerItem,
    isOwnItemMutation,
    itemCellConflicts,
    flushItemCellDirtyFields,
    itemsController,
    clearAllItemCellTimers,
  } = useQuotationItemCellsAutosave({
    id,
    getValues,
    setValue,
    append,
    remove,
    replace,
    setCotizacion,
    setError,
    trackMutation,
    responsables,
    seleccionarProducto,
    lockItemCell,
    releaseItemCell,
    itemCellEditors,
    resyncPartidas: resyncPartidasStable,
  })

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
    resetNotasFromServer(cot)
    resetGeneralFromServer(cot)
    resetTotalsFromServer(cot)
    for (const item of cot.items || []) recordServerItem(item)
    reset({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '', items: (cot.items || []).map(mapItemToFormItem) })
  }, [recordServerItem, reset, resetGeneralFromServer, resetNotasFromServer, resetTotalsFromServer])

  // applyNotasOnly: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // applyGeneralOnly: EF-3 3D-2, ver hooks/useQuotationGeneralAutosave.ts.
  // applyTotalsOnly: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  // EF-3 3D-6: extraído a hooks/useQuotationReconciliation.ts -- ver ese
  // archivo para la explicación completa de por qué existe. Los refs de
  // partidas que recibe abajo salen de useQuotationItemCellsAutosave (3D-5).
  const { resyncPartidas, reconciliarConServidor } = useQuotationReconciliation({
    id,
    getValues,
    setValue,
    append,
    replace,
    setCotizacion,
    recordServerItem,
    hasLocalItemRowActivity,
    itemDirtyCellsRef,
    itemFocusedCellsRef,
    itemSavingCellsRef,
    localWriteAtRef,
    pendingRowCreationsRef,
    pendingRowRemovalsRef,
    applyCotizacionToState,
    notasLockHeldRef,
    notasDirtyRef,
    applyNotasOnly,
    generalLockHeldRef,
    generalDirtyRef,
    applyGeneralOnly,
    totalsLockHeldRef,
    totalsDirtyRef,
    applyTotalsOnly,
  })

  // Cierra el ciclo con useQuotationItemCellsAutosave (ver el comentario junto
  // a `resyncPartidasRef` arriba): recién aquí, con `resyncPartidas` ya real,
  // el wrapper estable que se le pasó a ese hook empieza a invocar la función
  // de verdad. Nunca se llama sincrónicamente durante el render -- solo desde
  // catch handlers async -- así que este effect siempre corrió antes de que
  // alguna interacción real lo necesite.
  useEffect(() => { resyncPartidasRef.current = resyncPartidas }, [resyncPartidas])

  useEffect(() => { refreshCatalogos() }, [refreshCatalogos])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchProveedores()]).then(([cot, resp]) => { applyCotizacionToState(cot); setResponsables(resp); setLoading(false); const pending = sessionStorage.getItem('pdf_drive_result'); if (pending) { sessionStorage.removeItem('pdf_drive_result'); try { const { link } = JSON.parse(pending); setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(link ?? null) } catch {} } }).catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  // `fields[i].id` es la key autogenerada de `useFieldArray` para React, no el
  // `id` de negocio pasado a `append()` -- un join por esa key nunca encuentra
  // nada real. `useWatch` sí devuelve el array vivo con los valores e ids de
  // negocio actuales, incluida una fila recién agregada, sin depender de que el
  // array se vuelva a registrar (a diferencia de `watch('items')`, que devuelve
  // los valores del último `append`/`reset` hasta que RHF re-registra el campo).
  // Solo para este cálculo -- `fields` sigue siendo exclusivamente la key de
  // remonte de `useFieldArray`.
  const liveItemsForTotals = useWatch({ control, name: 'items' })
  const itemsParaTotales = useMemo(
    () => (liveItemsForTotals ?? []) as QuotationFormValues['items'],
    [liveItemsForTotals]
  )
  const totales = useMemo(() => calculateQuotationTotals({ items: itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }), [itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor])
  const displayTotales = useMemo(() => esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales), [esEditable, cotizacion, totales])
  const estimatedTaxes = useMemo(() => calculateEstimatedTaxes(itemsParaTotales, displayTotales), [itemsParaTotales, displayTotales])

  // persistNotasAutosave: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // getTotalsFieldValue/sendTotalsFieldPatchRound/persistTotalsFieldAutosave/
  // markTotalsFieldDirty/flushTotalsDirtyFields/resolveTotalsFieldConflict:
  // EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.
  // sendItemCellPatchRound/persistItemCellAutosave/flushItemCellDirtyFields:
  // EF-3 3D-5, ver hooks/useQuotationItemCellsAutosave.ts.
  // flushPendingSaves: EF-3 3D-7, ver hooks/useQuotationBusinessActions.ts.

  // Debounce de Notas: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // General y Totales ya no tienen un debounce por sección: `markGeneralFieldDirty`/
  // `markTotalsFieldDirty` programan su propio timeout por campo en cuanto se
  // detecta la edición (ver los `tracked*` handlers más abajo).

  // Fase 6E: el refresco de notas/general/totales tras un guardado ajeno ya no
  // depende de un aviso del navegador que guardó (`section_saved`, retirado --
  // Presence ahora es pura awareness, sin ese canal). `latestNotasConfirmed`/
  // `latestGeneralConfirmed`/`latestTotalesConfirmed` (más abajo) cubren exactamente
  // el mismo caso desde el SERVIDOR, disparando reconciliarConServidor() -- que ya
  // aplica notas/general/totales con las mismas guardas de dirty/foco que tenían
  // applyNotasOnly/applyGeneralOnly/applyTotalsOnly aquí, así que no hay pérdida de
  // cobertura, solo una fuente de verdad menos redundante.

  // Alta/edición/baja/bulk de otro colaborador llegan por `item_confirmed` (más abajo):
  // el servidor confirma DESPUÉS de commitear en Postgres y dispara una relectura
  // completa vía `reconciliarConServidor()`, que ya reconstruye altas y bajas sola. Este
  // efecto reconecta el canal como red de seguridad si se perdió la conexión.
  const estabaConectadoRef = useRef(isConnected)
  useEffect(() => {
    const acabaDeReconectar = isConnected && !estabaConectadoRef.current
    estabaConectadoRef.current = isConnected
    if (acabaDeReconectar) void reconciliarConServidor()
  }, [isConnected, reconciliarConServidor])

  // `item_confirmed`/`general_confirmed`/`totales_confirmed`: los emite el servidor
  // recién commiteado el PATCH (ver lib/server/realtime/broadcast.ts). Sirven para
  // reconciliar de inmediato en vez de esperar el heartbeat de 5s -- nunca reemplazan
  // la reconciliación periódica, solo la adelantan.
  useEffect(() => {
    if (!latestItemConfirmed) return
    // Confirmó un PATCH propio: ya se aplicó al recibir la respuesta del fetch: no
    // hace falta reconciliar otra vez. Sin mutation_id (ajeno, o un cliente viejo) sí.
    if (latestItemConfirmed.mutation_id && isOwnItemMutation(latestItemConfirmed.mutation_id)) return
    void reconciliarConServidor()
  }, [isOwnItemMutation, latestItemConfirmed, reconciliarConServidor])

  useEffect(() => {
    if (!latestGeneralConfirmed) return
    void reconciliarConServidor()
  }, [latestGeneralConfirmed, reconciliarConServidor])

  useEffect(() => {
    if (!latestTotalesConfirmed) return
    void reconciliarConServidor()
  }, [latestTotalesConfirmed, reconciliarConServidor])

  // Notas gana su propio evento server-confirmed desde Fase 6A -- es el único camino
  // que refresca notas tras un guardado ajeno desde que Fase 6E retiró `section_saved`.
  useEffect(() => {
    if (!latestNotasConfirmed) return
    void reconciliarConServidor()
  }, [latestNotasConfirmed, reconciliarConServidor])

  // Red de última instancia, NO la garantía primaria (ver RECONCILIACION_MS arriba).
  // No depende de la presencia ni del canal: si dependiera, un fallo de esos mismos
  // mecanismos volvería a dejar las pantallas divergentes sin que nadie se entere.
  useEffect(() => {
    if (!esEditable) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void reconciliarConServidor()
    }
    const timer = window.setInterval(tick, RECONCILIACION_MS)
    return () => window.clearInterval(timer)
  }, [esEditable, reconciliarConServidor])

  // Volver a la pestaña es el momento en que más se nota quedarse con datos viejos.
  useEffect(() => {
    if (!esEditable || typeof document === 'undefined') return
    const alVolver = () => { if (document.visibilityState === 'visible') void reconciliarConServidor() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [esEditable, reconciliarConServidor])

  useEffect(() => () => {
    clearNotasIdleReleaseTimer(); clearGeneralIdleReleaseTimer(); clearTotalsIdleReleaseTimer()
    clearAllItemCellTimers()
    clearAllGeneralFieldTimers()
    clearAllTotalsFieldTimers()
  }, [clearAllGeneralFieldTimers, clearAllItemCellTimers, clearAllTotalsFieldTimers, clearGeneralIdleReleaseTimer, clearNotasIdleReleaseTimer, clearTotalsIdleReleaseTimer])

  // handleNotasFocus/handleNotasBlur: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // handleTotalsFocus/handleTotalsBlur: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  // Sin esto, tocar la tabla una vez te dejaba marcado como editor de Partidas para
  // los demás indefinidamente: era la única sección sin liberación al salir.
  const handlePartidasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && partidasSectionRef.current?.contains(nextTarget)) return
    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && partidasSectionRef.current?.contains(activeElement)) return
      releaseSection('partidas')
    }, 0)
  }, [esEditable, releaseSection])

  // handleGeneralFocus/handleGeneralBlur/tracked*: EF-3 3D-2, ver
  // hooks/useQuotationGeneralAutosave.ts.
  // trackedSetPorcentajeFee/trackedSetIvaActivo/trackedSetDescuentoTipo/
  // trackedSetDescuentoValor: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  // EF-3 3D-7: extraído a hooks/useQuotationBusinessActions.ts -- ver ese
  // archivo para la explicación completa de por qué existe (incluida la
  // asimetría deliberada entre las 5 acciones, preservada tal cual).
  const {
    aprobar,
    generarPDF,
    generarCotizacion,
    crearComplementaria,
    cancelarCotizacion,
  } = useQuotationBusinessActions({
    id,
    cotizacion,
    router,
    watchedItems,
    refreshCatalogos,
    applyCotizacionToState,
    setError,
    setSuccess,
    setDriveLink,
    setAprobando,
    setGenerandoPdf,
    setGuardando,
    setCancelando,
    flushItemCellDirtyFields,
    flushGeneralDirtyFields,
    flushTotalsDirtyFields,
    notasDirtyRef,
    persistNotasAutosave,
    pendingMutationsRef,
    itemCellConflicts,
  })

  if (loading) return <SkeletonQuotationDetail />
  if (!cotizacion) return <div className="p-8 text-center text-faint">Cotización no encontrada</div>

  const currentUserId = (session?.user as { id?: string | null } | undefined)?.id || session?.user?.email || null
  const uniqueOnlineUsers = onlineUsers.filter((user, index, arr) => arr.findIndex((item) => item.user_id === user.user_id) === index)
  const visibleOnlineUsers = uniqueOnlineUsers.filter((user) => user.user_id !== currentUserId)
  // Modelo Google Sheets: la presencia ajena resalta la sección y dice quién edita,
  // pero nunca deja un campo en solo lectura ni detiene el autoguardado.

  const SectionEditBadge = ({ section }: { section: QuotationPresenceSection }) => { const editor = sectionEditors[section]; if (!editor) return null; return <p className="text-xs text-accent-quiet mb-2">{getShortName(editor.name, editor.email)} está editando esta sección</p> }

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Button href="/cotizaciones" variant="ghost" size="md" iconLeft="arrow-left">
            Cotizaciones
          </Button>
          <h1 className="sn-display flex-none text-2xl text-ink md:text-h2">{cotizacion.id}</h1>
          <span className="flex-none whitespace-nowrap text-content text-subtext">Cotizada el {formatDateDisplay(cotizacion.fecha_cotizacion)}</span>
          <StatusBadge tone={toneForCotizacionEstado(cotizacion.estado)}>{cotizacion.estado}</StatusBadge>
          {cotizacion.es_complementaria_de && (
            <span className="flex-none whitespace-nowrap text-content text-accent">
              Complementaria de <span className="font-mono font-bold">{cotizacion.es_complementaria_de}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {visibleOnlineUsers.length > 0 && (
            <div className="flex flex-none items-center gap-2 rounded-pill border border-hairline bg-row py-1 pl-1 pr-3">
              <div className="flex -space-x-2">
                {visibleOnlineUsers.slice(0, 3).map((user) => {
                  const shortName = getShortName(user.name, user.email)
                  return <span key={user.user_id} title={shortName} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-row bg-accent text-[10px] font-semibold text-accent-ink">{getInitials(shortName)}</span>
                })}
              </div>
              <span className="whitespace-nowrap text-xs text-subtext">{visibleOnlineUsers.length} viendo</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/cotizaciones/${id}/generar-pdf?mode=inline`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors min-h-[44px]">Vista previa</a>
            <button onClick={() => setShowNotasModal(true)} className="inline-flex items-center gap-2 border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors min-h-[44px]"><Icon name="edit" size={15} />Nota de evento{notasInternas && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</button>
            {cotizacion.estado === 'BORRADOR' && <><button onClick={generarCotizacion} disabled={guardando || generandoPdf} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : guardando ? 'Generando...' : 'Generar Cotización'}</button></>}
            {cotizacion.estado === 'EMITIDA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-[var(--hover-overlay)] hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={aprobar} disabled={aprobando || guardando} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]">{aprobando ? 'Aprobando...' : 'Aprobar Cotización'}</button></>}
            {cotizacion.estado === 'APROBADA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-[var(--hover-overlay)] hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={crearComplementaria} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors min-h-[44px]">Crear Complementaria</button></>}
          </div>
        </div>
      </div>

      <div>
        <p className="text-subtext">{cotizacion.proyecto} — {cotizacion.cliente}</p>
        <div className="mt-3">
          <p className="sn-label mb-2">Colaborando ahora</p>
          <div className="flex flex-wrap gap-2">
            {visibleOnlineUsers.length === 0 ? <span className="text-xs text-faint">Solo tú en esta cotización</span> : visibleOnlineUsers.map((user) => { const shortName = getShortName(user.name, user.email); return <span key={user.user_id} className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-row px-2.5 py-1 text-xs text-body"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-row-alt text-[10px] font-semibold text-body">{getInitials(shortName)}</span><span>{shortName}</span>{user.active_section ? <span className="text-faint">· {sectionLabels[user.active_section]}</span> : null}</span> })}
          </div>
        </div>
      </div>

      {error && <div className="rounded-control border border-cancelled-fg/30 bg-cancelled-bg text-cancelled-fg px-4 py-3">{error}</div>}
      {success && <div className="rounded-control border border-approved-fg/30 bg-approved-bg text-approved-fg px-4 py-3 flex items-center justify-between gap-4"><span>{success}</span>{driveLink && <a href={driveLink} target="_blank" rel="noopener noreferrer" className="underline text-content whitespace-nowrap hover:opacity-80">Ver en Drive →</a>}</div>}

      {!esEditable && (
        <div className="flex items-center gap-2.5 rounded-control border border-hairline bg-row px-4 py-3 text-content text-subtext">
          <Icon name="lock" size={14} className="flex-none text-faint" />
          Los datos generales y las partidas sólo se editan en Borrador o Emitida.
        </div>
      )}

      {showNotasModal && (
        <Modal title="Nota de evento" subtitle="Uso interno, no sale en el PDF" onClose={() => setShowNotasModal(false)}>
          <div ref={notasSectionRef} className={`rounded-panel ${sectionEditors.notas ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleNotasFocus} onBlurCapture={handleNotasBlur}>
            <SectionEditBadge section="notas" />
            <p className="sn-label mb-2">Nota de evento · uso interno, no sale en el PDF</p>
            {esEditable ? (
              <textarea value={notasInternas} onChange={e => trackedHandleNotasChange(e.target.value)} rows={4} placeholder="Sin notas..." className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-body text-content resize-none outline-none placeholder-faint focus:border-accent-quiet disabled:opacity-50 disabled:cursor-not-allowed" />
            ) : (
              <p className="text-subtext text-content whitespace-pre-wrap">{notasInternas || '—'}</p>
            )}
            <p className="sn-label mb-2 mt-4">Notas del PDF · se imprimen debajo de Totales</p>
            {esEditable ? (
              <textarea value={notasPdf} onChange={e => trackedHandleNotasPdfChange(e.target.value)} rows={4} placeholder="Sin notas..." className="w-full bg-input border border-hairline rounded-control px-3 py-2.5 text-body text-content resize-none outline-none placeholder-faint focus:border-accent-quiet disabled:opacity-50 disabled:cursor-not-allowed" />
            ) : (
              <p className="text-subtext text-content whitespace-pre-wrap">{notasPdf || '—'}</p>
            )}
          </div>
        </Modal>
      )}

      <div ref={generalSectionRef} className={`rounded-panel ${sectionEditors.general ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleGeneralFocus} onBlurCapture={handleGeneralBlur}>
        <div className="px-1"><SectionEditBadge section="general" /></div>
        <QuotationGeneralInfoSection register={register} setValue={setValue} clienteInput={clienteInput} proyectoInput={proyectoInput} clienteSugerencias={clienteSugerencias} mostrarClienteDropdown={mostrarClienteDropdown} setMostrarClienteDropdown={setMostrarClienteDropdown} proyectosDelCliente={proyectosDelCliente} mostrarProyectoDropdown={mostrarProyectoDropdown} setMostrarProyectoDropdown={setMostrarProyectoDropdown} listaClientes={listaClientes} handleClienteChange={trackedHandleClienteChange} handleProyectoChange={trackedHandleProyectoChange} seleccionarCliente={seleccionarCliente} setProyectoInput={setProyectoInput} onClienteSelected={trackedSelectCliente} onProyectoSelected={trackedSelectProyecto} onFechaEntregaChange={trackedHandleFechaEntregaChange} onLocacionChange={trackedHandleLocacionChange} isReadOnly={!esEditable} readOnlyDisplay={esEditable ? 'input' : 'text'} dateLabel={formatDateDisplay(cotizacion.fecha_cotizacion)} fechaEntregaValue={watch('fecha_entrega')} locacionValue={watch('locacion')} conflicts={generalFieldConflicts} onResolveConflict={resolveGeneralFieldConflict} />
      </div>

      <div ref={partidasSectionRef} className={`rounded-panel ${sectionEditors.partidas ? 'ring-1 ring-accent-quiet/70 ring-offset-0' : ''}`} onFocusCapture={() => esEditable && setActiveSection('partidas')} onBlurCapture={handlePartidasBlur}>
        <div className="px-1"><SectionEditBadge section="partidas" /></div>
        <QuotationItemsSection editable={!!esEditable} register={register} watchedItems={watchedItems} fields={fields} editingItemRowId={editingItemRowId} setEditingItemRowId={setEditingItemRowId} calcItem={calcItem} handleDescripcionChange={handleDescripcionChange} productoSugerencias={productoSugerencias} mostrarProductoDropdown={mostrarProductoDropdown} setMostrarProductoDropdown={setMostrarProductoDropdown} responsables={responsables} readOnlyItems={cotizacion.items || []} onCopyClick={() => setShowCopyModal(true)} canCreateTemplate={canCreateTemplate} items={itemsController} />      </div>

      <QuotationCopyItemsModal open={showCopyModal} onClose={() => setShowCopyModal(false)} excludeCotizacionId={id} onImport={itemsController.importItems} />

      <div ref={totalsSectionRef} className={`rounded-panel ${sectionEditors.totales ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleTotalsFocus} onBlurCapture={handleTotalsBlur}>
        <div className="px-1"><SectionEditBadge section="totales" /></div>
        <QuotationTotalsPanels totals={displayTotales} editable={!!esEditable} porcentaje_fee={porcentaje_fee} setPorcentajeFee={trackedSetPorcentajeFee} iva_activo={iva_activo} setIvaActivo={trackedSetIvaActivo} descuento_tipo={descuento_tipo} setDescuentoTipo={trackedSetDescuentoTipo} descuento_valor={descuento_valor} setDescuentoValor={trackedSetDescuentoValor} estimatedTaxes={estimatedTaxes} conflicts={totalsFieldConflicts} onResolveConflict={resolveTotalsFieldConflict} />
      </div>
    </div>
  )
}
