'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Responsable } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import { QuotationFormValues } from '@/lib/quotations/types'
import { fetchNextQuotationFolio, fetchResponsables, generateQuotationPdf, saveNewQuotation } from '@/lib/services/quotation-service'
import { formatTodaySpanishLongDate } from '@/lib/quotations/format'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'

function NuevaCotizacionContent() {
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
  const isSubmitting = useRef(false)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const { register, control, watch, handleSubmit, setValue } = useForm<QuotationFormValues>({ defaultValues: { cliente: clienteParam, proyecto: proyectoParam, fecha_entrega: fechaEntregaParam, locacion: locacionParam, items: [{ ...EMPTY_QUOTATION_ITEM }] } })
  const watchedItems = watch('items')
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const quotationForm = useQuotationForm(setValue, watchedItems)
  const { calcItem, handleClienteChange, handleProyectoChange, handleDescripcionChange, seleccionarProducto, seleccionarCliente, listaClientes, clienteInput, setClienteInput, clienteSugerencias, mostrarClienteDropdown, setMostrarClienteDropdown, proyectosDelCliente, proyectoInput, setProyectoInput, mostrarProyectoDropdown, setMostrarProyectoDropdown, productoSugerencias, mostrarProductoDropdown, setMostrarProductoDropdown } = quotationForm
  useEffect(() => { Promise.all([fetchNextQuotationFolio(esComplementaria ? complementaria_de : undefined), fetchResponsables()]).then(([preview, resp]) => { setFolio(preview.folio); setResponsables(resp) }).catch(() => setError('Error cargando datos iniciales')) }, [esComplementaria, complementaria_de])
  useEffect(() => { if (clienteParam) setClienteInput(clienteParam); if (proyectoParam) setProyectoInput(proyectoParam); if (complementaria_de) { const cli = searchParams.get('cliente') || ''; const proy = searchParams.get('proyecto') || ''; setValue('cliente', cli); setClienteInput(cli); setValue('proyecto', proy); setProyectoInput(proy); setValue('locacion', searchParams.get('locacion') || ''); setValue('fecha_entrega', searchParams.get('fecha_entrega') || '') } }, [complementaria_de, clienteParam, proyectoParam, searchParams, setClienteInput, setProyectoInput, setValue])
  const totales = calculateQuotationTotals({ items: watchedItems, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor })
  const onGuardarBorrador = handleSubmit(async (data) => { if (isSubmitting.current) return; isSubmitting.current = true; setGuardando(true); setError(null); try { const cotizacion = await saveNewQuotation(data, { estado: 'BORRADOR', porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...(esComplementaria ? { tipo: 'COMPLEMENTARIA' as const, es_complementaria_de: complementaria_de } : {}) }); router.push(`/cotizaciones/${cotizacion.id}`) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error desconocido') } finally { isSubmitting.current = false; setGuardando(false) } })
  const onGenerarCotizacion = handleSubmit(async (data) => { if (isSubmitting.current) return; isSubmitting.current = true; setGuardando(true); setError(null); try { const cotizacion = await saveNewQuotation(data, { estado: 'ENVIADA', porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...(esComplementaria ? { tipo: 'COMPLEMENTARIA' as const, es_complementaria_de: complementaria_de } : {}) }); const pdfResult = await generateQuotationPdf(cotizacion, data.items, { skipDownload: true }); if (pdfResult.savedToDrive) { sessionStorage.setItem('pdf_drive_result', JSON.stringify({ link: pdfResult.driveWebViewLink ?? null })) } router.push(`/cotizaciones/${cotizacion.id}`) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error desconocido') } finally { isSubmitting.current = false; setGuardando(false) } })
  return (<div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl"><div className="mb-8"><h1 className="text-2xl md:text-3xl font-bold text-white">Nueva Cotizacion</h1><p className="text-gray-400 mt-1">Folio: <span className="font-mono text-blue-400 font-bold">{folio || '...'}</span></p></div>{esComplementaria && <div className="bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg px-4 py-3 mb-6">Cotizacion complementaria de <span className="font-mono font-bold">{complementaria_de}</span></div>}{error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6">{error}</div>}<QuotationGeneralInfoSection register={register} setValue={setValue} clienteInput={clienteInput} proyectoInput={proyectoInput} clienteSugerencias={clienteSugerencias} mostrarClienteDropdown={mostrarClienteDropdown} setMostrarClienteDropdown={setMostrarClienteDropdown} proyectosDelCliente={proyectosDelCliente} mostrarProyectoDropdown={mostrarProyectoDropdown} setMostrarProyectoDropdown={setMostrarProyectoDropdown} listaClientes={listaClientes} handleClienteChange={handleClienteChange} handleProyectoChange={handleProyectoChange} seleccionarCliente={seleccionarCliente} setProyectoInput={setProyectoInput} isReadOnly={esComplementaria} readOnlyDisplay="input" dateLabel={formatTodaySpanishLongDate()} fechaEntregaValue={watch('fecha_entrega')} locacionValue={watch('locacion')} /><QuotationItemsSection editable register={register} setValue={setValue} watchedItems={watchedItems} fields={fields} append={append} remove={remove} editingItemIndex={editingItemIndex} setEditingItemIndex={setEditingItemIndex} calcItem={calcItem} handleDescripcionChange={handleDescripcionChange} seleccionarProducto={seleccionarProducto} productoSugerencias={productoSugerencias} mostrarProductoDropdown={mostrarProductoDropdown} setMostrarProductoDropdown={setMostrarProductoDropdown} responsables={responsables} /><QuotationTotalsPanels totals={totales} editable porcentaje_fee={porcentaje_fee} setPorcentajeFee={setPorcentajeFee} iva_activo={iva_activo} setIvaActivo={setIvaActivo} descuento_tipo={descuento_tipo} setDescuentoTipo={setDescuentoTipo} descuento_valor={descuento_valor} setDescuentoValor={setDescuentoValor} /><div className="flex flex-col md:flex-row gap-3"><button type="button" disabled={guardando} onClick={onGuardarBorrador} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]">{guardando ? 'Guardando...' : 'Guardar Borrador'}</button><button type="button" disabled={guardando} onClick={onGenerarCotizacion} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]">{guardando ? 'Generando...' : 'Generar Cotizacion'}</button><button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors min-h-[44px]">Cancelar</button></div></div>)
}

export default function NuevaCotizacionPage() { return <Suspense fallback={<div className="p-8 text-white">Cargando...</div>}><NuevaCotizacionContent /></Suspense> }
