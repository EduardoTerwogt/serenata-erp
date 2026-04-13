'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Cotizacion, CotizacionCollabSection, ItemCotizacion, Responsable } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { useQuotationCollaboration } from '@/hooks/useQuotationCollaboration'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { approveQuotation, buildComplementariaUrl, fetchQuotationDetail, fetchResponsables, generateQuotationPdf, updateQuotation } from '@/lib/services/quotation-service'
import { formatSpanishLongDate } from '@/lib/quotations/format'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'
import { SkeletonQuotationDetail } from '@/app/components/ui/SkeletonQuotationDetail'

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

  const { register, control, watch, reset, setValue } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...EMPTY_QUOTATION_ITEM }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
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
  const {
    onlineUsers,
    sectionEditors,
    setActiveSection,
    activity,
    reportSave,
  } = useQuotationCollaboration({
    cotizacionId: id,
    enabled: !!esEditable,
    currentUser: {
      id: (session?.user as { id?: string | null } | undefined)?.id,
      email: session?.user?.email,
      name: session?.user?.name,
    },
  })

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
    setNotasInternas(cot.notas_internas ?? '')
    setClienteInput(cot.cliente || '')
    setProyectoInput(cot.proyecto || '')
    setPorcentajeFee(cot.porcentaje_fee ?? 0.15)
    setIvaActivo(cot.iva_activo ?? true)
    setDescuentoTipo(cot.descuento_tipo ?? 'monto')
    setDescuentoValor(cot.descuento_valor ?? 0)
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

  useEffect(() => { refreshCatalogos() }, [refreshCatalogos])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchResponsables()])
      .then(([cot, resp]) => {
        applyCotizacionToState(cot)
        setResponsables(resp)
        setLoading(false)
        // Mostrar mensaje de Drive si viene de Generar Cotización nueva
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

  // Fase 3: Memoizar cálculo de totales — evita recalcular en cada keystroke
  const totales = useMemo(
    () => calculateQuotationTotals({ items: watchedItems || [], porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }),
    [watchedItems, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor]
  )
  const displayTotales = useMemo(
    () => esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales),
    [esEditable, cotizacion, totales]
  )

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
      await reportSave()
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
  const uniqueOnlineUsers = onlineUsers.filter((user, index, arr) => arr.findIndex(item => item.user_id === user.user_id) === index)
  const otherOnlineUsers = uniqueOnlineUsers.filter(user => user.user_id !== currentUserId)

  const sectionLabels: Record<CotizacionCollabSection, string> = {
    notas: 'Notas',
    general: 'Información general',
    partidas: 'Partidas',
    totales: 'Totales',
  }

  const SectionEditBadge = ({ section }: { section: CotizacionCollabSection }) => {
    const editor = sectionEditors[section]
    if (!editor) return null
    return (
      <p className="text-xs text-orange-300 mb-2">
        {editor.name || editor.email || 'Usuario'} está editando esta sección
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
          <div className="mt-2">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Colaborando ahora</p>
            <div className="flex flex-wrap gap-2">
              {otherOnlineUsers.length === 0 ? (
                <span className="text-xs text-gray-500">Solo tú en esta cotización</span>
              ) : (
                otherOnlineUsers.map(user => (
                  <span key={user.user_id} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-2.5 py-1 text-gray-200">
                    {user.name || user.email}
                    {user.active_section ? ` · ${sectionLabels[user.active_section]}` : ''}
                  </span>
                ))
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
          className={`bg-gray-800/60 border rounded-xl p-4 mb-6 ${sectionEditors.notas ? 'border-orange-600/70' : 'border-gray-700'}`}
          onFocusCapture={() => esEditable && setActiveSection('notas')}
        >
          <SectionEditBadge section="notas" />
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Notas del evento (uso interno)</p>
          {esEditable ? (
            <textarea
              value={notasInternas}
              onChange={e => setNotasInternas(e.target.value)}
              rows={3}
              placeholder="Sin notas..."
              className="w-full bg-transparent text-gray-300 text-sm resize-none outline-none placeholder-gray-600"
            />
          ) : (
            <p className="text-gray-400 text-sm whitespace-pre-wrap">{notasInternas || '—'}</p>
          )}
        </div>
      )}

      <div
        className={`rounded-xl ${sectionEditors.general ? 'ring-1 ring-orange-600/70 ring-offset-0' : ''}`}
        onFocusCapture={() => esEditable && setActiveSection('general')}
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
          handleClienteChange={handleClienteChange}
          handleProyectoChange={handleProyectoChange}
          seleccionarCliente={seleccionarCliente}
          setProyectoInput={setProyectoInput}
          isReadOnly={!esEditable}
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
        className={`rounded-xl ${sectionEditors.totales ? 'ring-1 ring-orange-600/70 ring-offset-0' : ''}`}
        onFocusCapture={() => esEditable && setActiveSection('totales')}
      >
        <div className="px-1">
          <SectionEditBadge section="totales" />
        </div>
        <QuotationTotalsPanels
          totals={displayTotales}
          editable={!!esEditable}
          porcentaje_fee={porcentaje_fee}
          setPorcentajeFee={setPorcentajeFee}
          iva_activo={iva_activo}
          setIvaActivo={setIvaActivo}
          descuento_tipo={descuento_tipo}
          setDescuentoTipo={setDescuentoTipo}
          descuento_valor={descuento_valor}
          setDescuentoValor={setDescuentoValor}
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Actividad de colaboración</h3>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {activity.length === 0 && <p className="text-sm text-gray-500">Sin actividad reciente.</p>}
          {activity.map(event => (
            <div key={event.id} className="text-sm text-gray-300 flex flex-wrap items-center gap-2 border-b border-gray-800 pb-2">
              <span className="text-gray-200 font-medium">{event.user_name || event.user_email}</span>
              <span className="text-gray-500">·</span>
              <span>{event.event_type === 'join' ? 'entró' : event.event_type === 'leave' ? 'salió' : event.event_type === 'save' ? 'guardó cambios' : event.event_type === 'start_edit_section' ? 'comenzó a editar' : 'dejó de editar'}</span>
              {event.section && <span className="text-orange-300">{sectionLabels[event.section]}</span>}
              <span className="ml-auto text-xs text-gray-500">{new Date(event.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
