'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Cotizacion, ItemCotizacion, Responsable } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import {
  buildReadOnlyTotals,
  EMPTY_QUOTATION_ITEM,
} from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import {
  approveQuotation,
  buildComplementariaUrl,
  fetchQuotationDetail,
  fetchResponsables,
  generateQuotationPdf,
  updateQuotation,
} from '@/lib/services/quotation-service'

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'ENVIADA'

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
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

  useEffect(() => {
    refreshCatalogos()
  }, [refreshCatalogos])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchResponsables()])
      .then(([cot, resp]) => {
        applyCotizacionToState(cot)
        setResponsables(resp)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  const totales = calculateQuotationTotals({
    items: watchedItems || [],
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  })

  const displayTotales = esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales)

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
        ...(estado ? { estado: estado as 'BORRADOR' | 'ENVIADA' | 'APROBADA' } : {}),
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
      if (!ok) {
        setAprobando(false)
        return
      }

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

  const generarPDF = async () => {
    if (!cotizacion) return
    await generateQuotationPdf(cotizacion)
  }

  const generarCotizacion = async () => {
    const ok = await guardar('ENVIADA')
    if (!ok) return
    const refreshedCotizacion = await fetchQuotationDetail(id)
    applyCotizacionToState(refreshedCotizacion)
    await generateQuotationPdf(refreshedCotizacion, watchedItems)
  }

  const crearComplementaria = () => {
    if (!cotizacion) return
    router.push(buildComplementariaUrl(id, cotizacion))
  }

  if (loading) {
    return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cargando...</div>
  }

  if (!cotizacion) {
    return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cotización no encontrada</div>
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-white font-mono">{cotizacion.id}</h1>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${
              cotizacion.estado === 'APROBADA' ? 'bg-green-900 text-green-300' :
              cotizacion.estado === 'ENVIADA' ? 'bg-blue-900 text-blue-300' :
              'bg-yellow-900 text-yellow-300'
            }`}>
              {cotizacion.estado}
            </span>
          </div>
          <p className="text-gray-400">{cotizacion.proyecto} — {cotizacion.cliente}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:justify-end">
          {cotizacion.estado === 'BORRADOR' && (
            <>
              <button onClick={() => guardar()} disabled={guardando} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={generarCotizacion} disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">
                {guardando ? 'Generando...' : 'Generar Cotización'}
              </button>
            </>
          )}
          {cotizacion.estado === 'ENVIADA' && (
            <>
              <button onClick={() => guardar()} disabled={guardando} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={generarPDF} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px]">
                Generar PDF
              </button>
              <button onClick={aprobar} disabled={aprobando || guardando} className="bg-green-700 hover:bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]">
                {aprobando ? 'Aprobando...' : 'Aprobar Cotización'}
              </button>
            </>
          )}
          {cotizacion.estado === 'APROBADA' && (
            <>
              <button onClick={generarPDF} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px]">
                Generar PDF
              </button>
              <button onClick={crearComplementaria} className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-3 rounded-lg text-sm transition-colors min-h-[44px]">
                Crear Complementaria
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-4">{error}</div>}
      {success && <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4">{success}</div>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            {esEditable ? (
              <div className="relative">
                <input value={clienteInput} onChange={e => handleClienteChange(e.target.value)} onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)} onBlur={() => setTimeout(() => {
                  setMostrarClienteDropdown(false)
                  if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                    const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                    if (match) seleccionarCliente(match.nombre)
                  }
                }, 200)} autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm text-white focus:outline-none focus:border-blue-500" />
                {mostrarClienteDropdown && clienteSugerencias.length > 0 && <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{clienteSugerencias.map((nombre, i) => <div key={i} onMouseDown={() => seleccionarCliente(nombre)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{nombre}</div>)}</div>}
              </div>
            ) : <p className="text-white py-2">{watch('cliente') || '—'}</p>}
          </div>

          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Proyecto</label>
            {esEditable ? (
              <>
                <input value={proyectoInput} onChange={e => handleProyectoChange(e.target.value)} onFocus={() => {
                  const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                  if (filtrados.length > 0) setMostrarProyectoDropdown(true)
                }} onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)} autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm text-white focus:outline-none focus:border-blue-500" />
                {mostrarProyectoDropdown && (() => {
                  const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                  return filtrados.length > 0 ? <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{filtrados.map((proy, i) => <div key={i} onMouseDown={() => {
                    setProyectoInput(proy)
                    setValue('proyecto', proy)
                    setMostrarProyectoDropdown(false)
                  }} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{proy}</div>)}</div> : null
                })()}
              </>
            ) : <p className="text-white py-2">{watch('proyecto') || '—'}</p>}
          </div>

          {[{ label: 'Fecha de Entrega', name: 'fecha_entrega' as const, type: 'date' }, { label: 'Locación', name: 'locacion' as const }].map(({ label, name, type }) => (
            <div key={name}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              {esEditable ? <input type={type || 'text'} {...register(name)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm text-white focus:outline-none focus:border-blue-500" /> : <p className="text-white py-2">{watch(name) || '—'}</p>}
            </div>
          ))}

          {cotizacion.fecha_cotizacion && <div><label className="block text-sm text-gray-400 mb-1">Fecha de Cotización</label><p className="text-white py-2">{(() => {
            const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
            const parts = cotizacion.fecha_cotizacion!.split('-').map(Number)
            return `${parts[2]} de ${meses[parts[1] - 1]} ${parts[0]}`
          })()}</p></div>}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-4 md:p-6 border-b border-gray-800 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Partidas</h2>
          {esEditable && <button type="button" onClick={() => append({ ...EMPTY_QUOTATION_ITEM })} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0">+ Agregar fila</button>}
        </div>

        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800">{['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Margen', ...(esEditable ? [''] : [])].map(h => <th key={h} className="text-left text-gray-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {esEditable ? fields.map((field, index) => {
                const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
                const { importe, margen } = calcItem(item)
                return <tr key={field.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-2"><input {...register(`items.${index}.categoria`)} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                  <td className="px-4 py-2"><div className="relative"><input {...register(`items.${index}.descripcion`)} onChange={e => handleDescripcionChange(index, e.target.value)} onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))} onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)} className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" autoComplete="off" />{mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && <div className="absolute z-[9999] mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{productoSugerencias[index].map((p, i) => <div key={i} onMouseDown={() => seleccionarProducto(index, p)} className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"><div className="font-medium">{p.descripcion}</div>{p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}</div>)}</div>}</div></td>
                  <td className="px-4 py-2"><input type="number" min="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                  <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                  <td className="px-4 py-2 text-white font-medium whitespace-nowrap">${fmt(importe)}</td>
                  <td className="px-4 py-2"><select {...register(`items.${index}.responsable_id`)} onChange={e => {
                    setValue(`items.${index}.responsable_id`, e.target.value)
                    const r = responsables.find(r => r.id === e.target.value)
                    setValue(`items.${index}.responsable_nombre`, r?.nombre ?? '')
                  }} className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"><option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><input type="hidden" {...register(`items.${index}.responsable_nombre`)} /></td>
                  <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                  <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margen)}</td>
                  <td className="px-4 py-2"><button type="button" onClick={() => remove(index)} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30">✕</button></td>
                </tr>
              }) : (cotizacion.items || []).map(item => <tr key={item.id} className="border-b border-gray-800/50"><td className="px-4 py-3 text-gray-300">{item.categoria}</td><td className="px-4 py-3 text-white">{item.descripcion}</td><td className="px-4 py-3 text-gray-300">{item.cantidad}</td><td className="px-4 py-3 text-gray-300">${fmt(item.precio_unitario)}</td><td className="px-4 py-3 text-white font-medium">${fmt(item.importe)}</td><td className="px-4 py-3">{item.responsable_nombre ? <span className="text-gray-300">{item.responsable_nombre}</span> : <span className="text-gray-500 italic">Sin asignar</span>}</td><td className="px-4 py-3 text-gray-300">${fmt(item.x_pagar)}</td><td className={`px-4 py-3 font-medium ${(item.margen ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(item.margen ?? 0)}</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-4 space-y-3">
          {esEditable ? fields.map((field, index) => {
            const item = watchedItems[index] || EMPTY_QUOTATION_ITEM
            const { importe, margen } = calcItem(item)
            return <div key={field.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors" onClick={() => setEditingItemIndex(index)}><div className="flex justify-between items-start gap-3 mb-2"><div className="min-w-0 flex-1"><p className="text-white font-medium text-[15px] truncate">{item.descripcion || 'Sin descripción'}</p><p className="text-gray-400 text-sm">{item.categoria || 'Sin categoría'}</p></div><button type="button" onClick={(e) => { e.stopPropagation(); remove(index) }} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors text-sm">✕</button></div><div className="grid grid-cols-2 gap-2 text-[13px] mb-2"><span className="text-gray-500">Cant. {item.cantidad || 0}</span><span className="text-gray-500 text-right">P. Unit. ${fmt(typeof item.precio_unitario === 'number' ? item.precio_unitario : 0)}</span><span className="text-gray-400">X pagar ${fmt(typeof item.x_pagar === 'number' ? item.x_pagar : 0)}</span><span className={`text-right font-medium ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>Margen ${fmt(margen)}</span></div><div className="flex justify-between items-center pt-2 border-t border-gray-700"><span className="text-gray-500 text-xs">{item.responsable_nombre || 'Sin responsable'}</span><span className="text-white font-bold">${fmt(importe)}</span></div></div>
          }) : (cotizacion.items || []).map(item => {
            const importe = (item.cantidad ?? 1) * (item.precio_unitario ?? 0)
            const margen = item.margen ?? 0
            return <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4"><div className="flex justify-between items-start gap-3 mb-2"><div className="min-w-0 flex-1"><p className="text-white font-medium text-[15px] truncate">{item.descripcion}</p><p className="text-gray-400 text-sm">{item.categoria}</p></div><span className={`text-sm font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margen)}</span></div><div className="grid grid-cols-2 gap-2 text-[13px] mb-2"><span className="text-gray-500">Cant. {item.cantidad}</span><span className="text-gray-500 text-right">P. Unit. ${fmt(item.precio_unitario)}</span><span className="text-gray-400">X pagar ${fmt(item.x_pagar)}</span><span className="text-right text-gray-500">{item.responsable_nombre || 'Sin responsable'}</span></div><div className="flex justify-end pt-2 border-t border-gray-700"><span className="text-white font-bold">${fmt(importe)}</span></div></div>
          })}
        </div>
      </div>

      {editingItemIndex !== null && esEditable && <div className="md:hidden fixed inset-0 bg-gray-950 z-50 overflow-y-auto"><div className="px-5 pt-12 pb-8"><div className="flex justify-between items-center mb-7"><button onClick={() => setEditingItemIndex(null)} className="text-gray-400 text-sm hover:text-gray-300">Cancelar</button><span className="text-white font-medium text-[15px]">Editar partida</span><button onClick={() => setEditingItemIndex(null)} className="text-blue-500 font-medium text-sm hover:text-blue-400">Listo</button></div><div className="space-y-5"><div className="relative"><label className="block text-[13px] text-gray-400 mb-2">Descripción</label><input {...register(`items.${editingItemIndex}.descripcion`)} onChange={e => handleDescripcionChange(editingItemIndex, e.target.value)} onFocus={() => (productoSugerencias[editingItemIndex]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: true }))} onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [editingItemIndex]: false })), 200)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" placeholder="Descripción del item" autoComplete="off" />{mostrarProductoDropdown[editingItemIndex] && (productoSugerencias[editingItemIndex]?.length ?? 0) > 0 && <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">{productoSugerencias[editingItemIndex].map((p, i) => <div key={i} onMouseDown={() => seleccionarProducto(editingItemIndex, p)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"><div className="font-medium">{p.descripcion}</div>{p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}</div>)}</div>}</div><div><label className="block text-[13px] text-gray-400 mb-2">Categoría</label><input {...register(`items.${editingItemIndex}.categoria`)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" placeholder="Categoría" /></div><div className="flex gap-3"><div className="flex-1"><label className="block text-[13px] text-gray-400 mb-2">Cantidad</label><input type="number" min="1" {...register(`items.${editingItemIndex}.cantidad`, { valueAsNumber: true })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white text-center focus:outline-none focus:border-blue-500" /></div><div className="flex-[2]"><label className="block text-[13px] text-gray-400 mb-2">Precio unitario</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" /></div></div><div><label className="block text-[13px] text-gray-400 mb-2">Responsable</label><select {...register(`items.${editingItemIndex}.responsable_id`)} onChange={(e) => { setValue(`items.${editingItemIndex}.responsable_id`, e.target.value); const r = responsables.find(r => r.id === e.target.value); setValue(`items.${editingItemIndex}.responsable_nombre`, r?.nombre ?? '') }} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 appearance-none"><option value="">Sin asignar</option>{responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><input type="hidden" {...register(`items.${editingItemIndex}.responsable_nombre`)} /></div><div><label className="block text-[13px] text-gray-400 mb-2">Por pagar al responsable</label><input type="number" min="0" step="0.01" {...register(`items.${editingItemIndex}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" /></div></div><div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-6"><div className="flex justify-between mb-2"><span className="text-gray-500 text-sm">Importe</span><span className="text-gray-300 text-sm font-medium">${fmt(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).importe)}</span></div><div className="flex justify-between"><span className="text-gray-500 text-sm">Margen</span><span className={`text-sm font-medium ${calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(calcItem(watchedItems[editingItemIndex] || EMPTY_QUOTATION_ITEM).margen)}</span></div></div>{fields.length > 1 && <button type="button" onClick={() => { remove(editingItemIndex); setEditingItemIndex(null) }} className="w-full text-red-400 hover:text-red-300 py-3 text-sm mt-6 transition-colors">Eliminar partida</button>}</div></div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6"><h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Totales</h3><div className="space-y-3"><div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span className="text-white">${fmt(displayTotales.subtotal)}</span></div><div className="flex justify-between text-sm items-center gap-3"><span className="text-gray-400 flex items-center gap-2 flex-wrap">Fee Agencia{esEditable ? <><input type="number" min="0" max="100" step="0.5" value={(porcentaje_fee * 100).toFixed(1)} onChange={e => setPorcentajeFee((parseFloat(e.target.value) || 0) / 100)} className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500" /><span className="text-gray-500 text-xs">%</span></> : <span className="text-gray-500 text-xs">({((cotizacion.porcentaje_fee ?? 0.15) * 100).toFixed(0)}%)</span>}</span><span className="text-white">${fmt(displayTotales.fee_agencia)}</span></div><div className="flex justify-between text-sm"><span className="text-gray-400">General</span><span className="text-white">${fmt(displayTotales.general)}</span></div><div className="flex justify-between text-sm items-center"><span className="text-gray-400 flex items-center gap-2">IVA (16%){esEditable && <button type="button" onClick={() => setIvaActivo(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} /></button>}</span><span className={(esEditable ? iva_activo : (cotizacion.iva_activo ?? true)) ? 'text-white' : 'text-gray-600'}>${fmt(displayTotales.iva)}</span></div>{esEditable ? <div className="flex justify-between text-sm items-center gap-3"><span className="text-gray-400 flex items-center gap-2 flex-wrap">Descuento<select value={descuento_tipo} onChange={e => setDescuentoTipo(e.target.value as 'monto' | 'porcentaje')} className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500"><option value="monto">$ Monto</option><option value="porcentaje">% Porcentaje</option></select><input type="number" min="0" step="0.01" value={descuento_valor} onChange={e => setDescuentoValor(parseFloat(e.target.value) || 0)} className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500" /></span><span className={totales.descuento > 0 ? 'text-yellow-400' : 'text-gray-600'}>{totales.descuento > 0 ? `-$${fmt(totales.descuento)}` : '$0.00'}</span></div> : displayTotales.descuento > 0 ? <div className="flex justify-between text-sm"><span className="text-gray-400">Descuento</span><span className="text-yellow-400">-${fmt(displayTotales.descuento)}</span></div> : null}<div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-bold"><span className="text-white">TOTAL</span><span className="text-green-400 text-lg">${fmt(displayTotales.total)}</span></div></div></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6"><h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Utilidad</h3><div className="space-y-2"><div className="flex justify-between text-sm"><span className="text-gray-400">Margen Total</span><span className={displayTotales.margen_total >= 0 ? 'text-green-400' : 'text-red-400'}>${fmt(displayTotales.margen_total)}</span></div><div className="flex justify-between text-sm"><span className="text-gray-400">Fee Agencia</span><span className="text-white">${fmt(displayTotales.fee_agencia)}</span></div><div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold"><span className="text-gray-300">Utilidad Total</span><span className={displayTotales.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'}>${fmt(displayTotales.utilidad_total)}</span></div></div></div>
      </div>
    </div>
  )
}
