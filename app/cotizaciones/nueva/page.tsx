'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Responsable, Producto } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'

interface ItemForm {
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number | ''
  responsable_id: string
  responsable_nombre: string
  x_pagar: number | ''
}

interface CotizacionForm {
  cliente: string
  proyecto: string
  fecha_entrega: string
  locacion: string
  items: ItemForm[]
}

const itemVacio: ItemForm = {
  categoria: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  responsable_id: '',
  responsable_nombre: '',
  x_pagar: '',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fechaHoy() {
  const d = new Date()
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`
}

function NuevaCotizacionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const complementaria_de = searchParams.get('complementaria_de') || ''
  const clienteParam = searchParams.get('cliente') || ''
  const proyectoParam = searchParams.get('proyecto') || ''
  const locacionParam = searchParams.get('locacion') || ''
  const fechaEntregaParam = searchParams.get('fecha_entrega') || ''
  const esComplementaria = !!complementaria_de

  const [mobileStep, setMobileStep] = useState(1)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [folio, setFolio] = useState<string>('')
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSubmitting = useRef(false)

  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)

  const { register, control, watch, handleSubmit, setValue } = useForm<CotizacionForm>({
    defaultValues: {
      cliente: clienteParam,
      proyecto: proyectoParam,
      fecha_entrega: fechaEntregaParam,
      locacion: locacionParam,
      items: [{ ...itemVacio }],
    },
  })

  const watchedItems = watch('items')
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // ✅ Usar hook compartido para autocomplete y búsqueda
  const quotationForm = useQuotationForm(setValue, watchedItems)

  useEffect(() => {
    const folioUrl = esComplementaria
      ? `/api/folio?complementaria_de=${encodeURIComponent(complementaria_de)}`
      : '/api/folio'
    fetch(folioUrl).then(r => r.json()).then(d => setFolio(d.folio))
    fetch('/api/responsables').then(r => r.json()).then(setResponsables)
    // ✅ Catálogos (clientes y productos) se cargan automáticamente desde el hook
  }, [esComplementaria, complementaria_de])

  // ✅ Inicializar clienteInput y proyectoInput desde parámetros iniciales
  useEffect(() => {
    if (clienteParam) {
      setClienteInput(clienteParam)
    }
    if (proyectoParam) {
      setProyectoInput(proyectoParam)
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complementaria_de])

  // ✅ calcItem viene del hook
  const { calcItem } = quotationForm

  const totales = (() => {
    const subtotal = watchedItems.reduce((s, item) => s + calcItem(item).importe, 0)
    const fee_agencia = subtotal * porcentaje_fee
    const general = subtotal + fee_agencia
    const descuento = descuento_tipo === 'porcentaje'
      ? general * (descuento_valor / 100)
      : descuento_valor
    const base_iva = general - descuento
    const iva = iva_activo ? base_iva * 0.16 : 0
    const total = base_iva + iva
    const margen_total = watchedItems.reduce((s, item) => s + calcItem(item).margen, 0)
    const utilidad_total = margen_total + fee_agencia - descuento
    return { subtotal, fee_agencia, general, descuento, iva, total, margen_total, utilidad_total }
  })()

  // ✅ Funciones vienen del hook compartido
  const {
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    listaClientes,
    listaProductos,
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

  const guardarDatos = async (data: CotizacionForm, estado: 'BORRADOR' | 'ENVIADA') => {
    const itemsConCalc = data.items.map((item, i) => {
      const { importe, margen } = calcItem(item)
      return {
        ...item,
        importe,
        margen,
        orden: i,
        precio_unitario: item.precio_unitario === '' ? 0 : item.precio_unitario,
        x_pagar: item.x_pagar === '' ? 0 : item.x_pagar,
      }
    })

    const body: Record<string, unknown> = {
      id: folio,
      ...data,
      estado,
      items: itemsConCalc,
      porcentaje_fee,
      iva_activo,
      descuento_tipo,
      descuento_valor,
    }
    if (esComplementaria) {
      body.tipo = 'COMPLEMENTARIA'
      body.es_complementaria_de = complementaria_de
    }

    const res = await fetch('/api/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      let errMsg = 'Error al guardar'
      try {
        const err = await res.json()
        errMsg = err.error || errMsg
      } catch {
      }

      if (folio) {
        try {
          const check = await fetch(`/api/cotizaciones/${folio}`)
          if (check.ok) {
            const recovered = await check.json()
            const persistedCount = recovered?.items?.length ?? 0
            if (persistedCount === itemsConCalc.length) {
              console.log('[guardarDatos] Cotización recuperada desde persistencia completa:', folio)
              return recovered
            }
          }
        } catch {
        }
      }

      throw new Error(errMsg)
    }

    const savedCotizacion = await res.json()
    if ((savedCotizacion?.items?.length ?? 0) === itemsConCalc.length) {
      return savedCotizacion
    }

    if (savedCotizacion?.id) {
      const reload = await fetch(`/api/cotizaciones/${savedCotizacion.id}`)
      if (reload.ok) {
        const fullCotizacion = await reload.json()
        if ((fullCotizacion?.items?.length ?? 0) === itemsConCalc.length) {
          return fullCotizacion
        }
      }
    }

    throw new Error('La cotización no quedó persistida correctamente. Revisa las partidas e inténtalo de nuevo.')
  }

  const onGuardarBorrador = handleSubmit(async (data) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    setGuardando(true)
    setError(null)
    try {
      const cotizacion = await guardarDatos(data, 'BORRADOR')
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
      const cotizacion = await guardarDatos(data, 'ENVIADA')

      const { generarPDFCotizacion } = await import('@/lib/pdf')
      const itemsConCalc = data.items.map(item => ({ ...item, ...calcItem(item) }))
      await generarPDFCotizacion({
        id: cotizacion.id,
        cliente: cotizacion.cliente,
        proyecto: cotizacion.proyecto,
        fecha_entrega: cotizacion.fecha_entrega,
        locacion: cotizacion.locacion,
        fecha_cotizacion: cotizacion.fecha_cotizacion,
        items: itemsConCalc.map(item => ({
          categoria: item.categoria,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario === '' ? 0 : item.precio_unitario,
          importe: item.importe,
        })),
        subtotal: cotizacion.subtotal,
        fee_agencia: cotizacion.fee_agencia,
        general: cotizacion.general,
        iva: cotizacion.iva,
        total: cotizacion.total,
        iva_activo: cotizacion.iva_activo ?? true,
        porcentaje_fee: cotizacion.porcentaje_fee ?? 0.15,
        descuento_tipo: cotizacion.descuento_tipo ?? 'monto',
        descuento_valor: cotizacion.descuento_valor ?? 0,
      })
      router.push(`/cotizaciones/${cotizacion.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      isSubmitting.current = false
      setGuardando(false)
    }
  })

  return (
    <>
      {/* DESKTOP: Formulario original sin cambios */}
      <div className="hidden md:block">
    <div className="p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Nueva Cotización</h1>
        <p className="text-gray-400 mt-1">
          Folio: <span className="font-mono text-blue-400 font-bold">{folio || '...'}</span>
        </p>
      </div>

      {esComplementaria && (
        <div className="bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg px-4 py-3 mb-6">
          Cotización complementaria de <span className="font-mono font-bold">{complementaria_de}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Cliente *</label>
            {esComplementaria ? (
              <input value={clienteInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white opacity-60 cursor-not-allowed" />
            ) : (
              <>
                <input value={clienteInput} onChange={e => handleClienteChange(e.target.value)} onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)} onBlur={() => setTimeout(() => {
                  setMostrarClienteDropdown(false)
                  if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                    const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                    if (match) seleccionarCliente(match.nombre)
                  }
                }, 200)} autoComplete="off" placeholder="Nombre del cliente" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                {mostrarClienteDropdown && clienteSugerencias.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {clienteSugerencias.map((nombre, i) => (
                      <div key={i} onMouseDown={() => seleccionarCliente(nombre)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{nombre}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Proyecto *</label>
            {esComplementaria ? (
              <input value={proyectoInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white opacity-60 cursor-not-allowed" />
            ) : (
              <>
                <input value={proyectoInput} onChange={e => handleProyectoChange(e.target.value)} onFocus={() => {
                  const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                  if (filtrados.length > 0) setMostrarProyectoDropdown(true)
                }} onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)} autoComplete="off" placeholder="Nombre del proyecto" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                {mostrarProyectoDropdown && (() => {
                  const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                  return filtrados.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filtrados.map((proy, i) => (
                        <div key={i} onMouseDown={() => {
                          setProyectoInput(proy)
                          setValue('proyecto', proy)
                          setMostrarProyectoDropdown(false)
                        }} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{proy}</div>
                      ))}
                    </div>
                  ) : null
                })()}
              </>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha de Entrega</label>
            <input type="date" {...register('fecha_entrega')} readOnly={esComplementaria} className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Locación</label>
            <input {...register('locacion')} readOnly={esComplementaria} className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="Lugar del evento" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha de Cotización</label>
            <p className="text-white py-2 text-sm">{fechaHoy()}</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Partidas</h2>
          <button type="button" onClick={() => append({ ...itemVacio })} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">+ Agregar fila</button>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Margen', ''].map(h => (
                  <th key={h} className="text-left text-gray-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const item = watchedItems[index] || itemVacio
                const { importe, margen } = calcItem(item)
                return (
                  <tr key={field.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2"><input {...register(`items.${index}.categoria`)} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" placeholder="Categoría" /></td>
                    <td className="px-4 py-2">
                      <div className="relative">
                        <input {...register(`items.${index}.descripcion`)} onChange={e => handleDescripcionChange(index, e.target.value)} onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))} onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)} className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" placeholder="Descripción" autoComplete="off" />
                        {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && (
                          <div className="absolute z-[9999] mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {productoSugerencias[index].map((p, i) => (
                              <div key={i} onMouseDown={() => seleccionarProducto(index, p)} className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">
                                <div className="font-medium">{p.descripcion}</div>
                                {p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2"><input type="number" min="1" step="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                    <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                    <td className="px-4 py-2 text-white font-medium whitespace-nowrap">${fmt(importe)}</td>
                    <td className="px-4 py-2">
                      <select {...register(`items.${index}.responsable_id`)} onChange={(e) => {
                        setValue(`items.${index}.responsable_id`, e.target.value)
                        const r = responsables.find(r => r.id === e.target.value)
                        setValue(`items.${index}.responsable_nombre`, r?.nombre ?? '')
                      }} className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500">
                        <option value="">Sin asignar</option>
                        {responsables.map(r => (<option key={r.id} value={r.id}>{r.nombre}</option>))}
                      </select>
                      <input type="hidden" {...register(`items.${index}.responsable_nombre`)} />
                    </td>
                    <td className="px-4 py-2"><input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" /></td>
                    <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margen)}</td>
                    <td className="px-4 py-2"><button type="button" onClick={() => remove(index)} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Totales</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span className="text-white">${fmt(totales.subtotal)}</span></div>
            <div className="flex justify-between text-sm items-center"><span className="text-gray-400 flex items-center gap-2">Fee Agencia<input type="number" min="0" max="100" step="0.5" value={(porcentaje_fee * 100).toFixed(1)} onChange={e => setPorcentajeFee((parseFloat(e.target.value) || 0) / 100)} className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500" /><span className="text-gray-500 text-xs">%</span></span><span className="text-white">${fmt(totales.fee_agencia)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">General</span><span className="text-white">${fmt(totales.general)}</span></div>
            <div className="flex justify-between text-sm items-center"><span className="text-gray-400 flex items-center gap-2">IVA (16%)<button type="button" onClick={() => setIvaActivo(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} /></button></span><span className={iva_activo ? 'text-white' : 'text-gray-600'}>${fmt(totales.iva)}</span></div>
            <div className="flex justify-between text-sm items-center"><span className="text-gray-400 flex items-center gap-2 flex-wrap">Descuento<select value={descuento_tipo} onChange={e => setDescuentoTipo(e.target.value as 'monto' | 'porcentaje')} className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"><option value="monto">$ Monto</option><option value="porcentaje">% Porcentaje</option></select><input type="number" min="0" step="0.01" value={descuento_valor} onChange={e => setDescuentoValor(parseFloat(e.target.value) || 0)} className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500" /></span><span className={totales.descuento > 0 ? 'text-yellow-400' : 'text-gray-600'}>{totales.descuento > 0 ? `-$${fmt(totales.descuento)}` : '$0.00'}</span></div>
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-bold"><span className="text-white">TOTAL</span><span className="text-green-400 text-lg">${fmt(totales.total)}</span></div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Utilidad</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-400">Margen Total</span><span className={totales.margen_total >= 0 ? 'text-green-400' : 'text-red-400'}>${fmt(totales.margen_total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">Fee Agencia</span><span className="text-white">${fmt(totales.fee_agencia)}</span></div>
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold"><span className="text-gray-300">Utilidad Total</span><span className={totales.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'}>${fmt(totales.utilidad_total)}</span></div>
            {totales.subtotal > 0 && (<div className="flex justify-between text-sm"><span className="text-gray-400">Margen %</span><span className="text-blue-400">{((totales.margen_total / totales.subtotal) * 100).toFixed(1)}%</span></div>)}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" disabled={guardando} onClick={onGuardarBorrador} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar Borrador'}</button>
        <button type="button" disabled={guardando} onClick={onGenerarCotizacion} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">{guardando ? 'Generando...' : 'Generar Cotización'}</button>
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors">Cancelar</button>
      </div>

    </div>
      </div>

      {/* MOBILE: Wizard de 3 pasos */}
      <div className="md:hidden px-5 pt-6 pb-6">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-7">
          {[1, 2, 3].map(step => (
            <div key={step}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                mobileStep > step ? 'bg-green-500 text-white' :
                mobileStep === step ? 'bg-blue-500 text-white' :
                'bg-gray-800 text-gray-500'
              }`}>
                {mobileStep > step ? '✓' : step}
              </div>
              {step < 3 && <div className={`w-12 h-0.5 ${mobileStep > step ? 'bg-green-500' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Información General */}
        {mobileStep === 1 && (
          <div className="space-y-5">
            <div>
              <p className="text-gray-500 text-xs mb-1">Folio asignado</p>
              <p className="text-xl font-mono text-blue-400 font-bold">{folio || '...'}</p>
            </div>

            {esComplementaria && (
              <div className="bg-blue-900/40 border border-blue-700 text-blue-300 rounded-lg px-4 py-3">
                Complementaria de <span className="font-mono font-bold">{complementaria_de}</span>
              </div>
            )}

            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div className="relative">
              <label className="block text-[13px] text-gray-400 mb-2">Cliente *</label>
              {esComplementaria ? (
                <input value={clienteInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white opacity-60 cursor-not-allowed" />
              ) : (
                <>
                  <input value={clienteInput} onChange={e => handleClienteChange(e.target.value)} onFocus={() => mostrarClienteDropdown && setMostrarClienteDropdown(true)} onBlur={() => setTimeout(() => setMostrarClienteDropdown(false), 200)} autoComplete="off" placeholder="Nombre del cliente" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" />
                  {mostrarClienteDropdown && clienteSugerencias.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {clienteSugerencias.map((nombre, i) => (
                        <div key={i} onMouseDown={() => seleccionarCliente(nombre)} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{nombre}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="relative">
              <label className="block text-[13px] text-gray-400 mb-2">Proyecto *</label>
              {esComplementaria ? (
                <input value={proyectoInput} readOnly className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white opacity-60 cursor-not-allowed" />
              ) : (
                <>
                  <input value={proyectoInput} onChange={e => handleProyectoChange(e.target.value)} onFocus={() => {
                    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                    if (filtrados.length > 0) setMostrarProyectoDropdown(true)
                  }} onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)} autoComplete="off" placeholder="Nombre del proyecto" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500" />
                  {mostrarProyectoDropdown && (() => {
                    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                    return filtrados.length > 0 ? (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filtrados.map((proy, i) => (
                          <div key={i} onMouseDown={() => {
                            setProyectoInput(proy)
                            setValue('proyecto', proy)
                            setMostrarProyectoDropdown(false)
                          }} className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0">{proy}</div>
                        ))}
                      </div>
                    ) : null
                  })()}
                </>
              )}
            </div>

            <div>
              <label className="block text-[13px] text-gray-400 mb-2">Fecha de Entrega</label>
              <input type="date" {...register('fecha_entrega')} readOnly={esComplementaria} className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`} />
            </div>

            <div>
              <label className="block text-[13px] text-gray-400 mb-2">Locación</label>
              <input {...register('locacion')} readOnly={esComplementaria} className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="Lugar del evento" />
            </div>

            <button onClick={() => setMobileStep(2)} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-medium text-base transition-colors">
              Siguiente
            </button>
          </div>
        )}

        {/* Step 2: Partidas */}
        {mobileStep === 2 && (
          <div className="space-y-4">
            <div className="space-y-3">
              {fields.map((field, index) => {
                const item = watchedItems[index] || itemVacio
                const { importe, margen } = calcItem(item)
                return (
                  <div key={field.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-700 transition-colors" onClick={() => setEditingItemIndex(index)}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium text-[15px]">{item.descripcion || 'Sin descripción'}</p>
                        <p className="text-gray-500 text-xs">{item.categoria || 'Sin categoría'}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[13px]">
                      <span className="text-gray-500">×{item.cantidad || 0}</span>
                      <span className="text-gray-500">${fmt(typeof item.precio_unitario === 'number' ? item.precio_unitario : 0)}</span>
                      <span className="text-gray-400">Pagar ${fmt(typeof item.x_pagar === 'number' ? item.x_pagar : 0)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className={`text-[13px] font-medium ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Margen ${fmt(margen)}
                      </span>
                      <button type="button" onClick={e => { e.stopPropagation(); remove(index); }} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors text-sm">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <button type="button" onClick={() => append({...itemVacio})} className="w-full py-3.5 rounded-xl border-2 border-dashed border-gray-800 text-gray-500 text-sm hover:border-gray-700 transition-colors">
              + Agregar partida
            </button>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setMobileStep(3)} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-medium text-base transition-colors">
                Siguiente
              </button>
              <button onClick={() => setMobileStep(1)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl font-medium text-base transition-colors">
                Atrás
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Totales y Confirmación */}
        {mobileStep === 3 && (
          <div className="space-y-5">
            {/* Resumen card */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs">{folio} · {watch('cliente')}</p>
              <p className="text-white font-medium text-base">{watch('proyecto')}</p>
              <p className="text-gray-600 text-xs mt-1">{fields.length} partidas · Entrega: {watch('fecha_entrega') || 'Sin fecha'}</p>
            </div>

            {/* Fee y IVA controls */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">Fee agencia</span>
                <div className="flex items-center gap-2">
                  <input type="number" value={(porcentaje_fee*100).toFixed(1)} onChange={e => setPorcentajeFee((parseFloat(e.target.value)||0)/100)} className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm text-center focus:outline-none focus:border-blue-500" />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm flex items-center gap-2">
                  IVA (16%)
                  <button type="button" onClick={() => setIvaActivo(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </span>
              </div>
            </div>

            {/* Desglose totales */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-300">${fmt(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fee ({(porcentaje_fee*100).toFixed(0)}%)</span>
                  <span className="text-gray-300">${fmt(totales.fee_agencia)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">General</span>
                  <span className="text-gray-300">${fmt(totales.general)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IVA</span>
                  <span className="text-gray-300">${fmt(totales.iva)}</span>
                </div>
                <div className="border-t border-gray-800 pt-2.5 mt-2.5">
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total</span>
                    <span className="text-white font-bold text-lg">${fmt(totales.total)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-500 text-sm">Margen total</span>
                    <span className={`text-sm font-medium ${totales.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${fmt(totales.utilidad_total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button onClick={onGenerarCotizacion} disabled={guardando} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-medium text-base transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center">
                {guardando ? 'Generando...' : 'Generar Cotización'}
              </button>
              <button onClick={onGuardarBorrador} disabled={guardando} className="w-full bg-gray-900 text-gray-400 py-3.5 rounded-xl text-sm border border-gray-800 hover:border-gray-700 transition-colors disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar Borrador'}
              </button>
              <button onClick={() => setMobileStep(2)} className="w-full text-gray-500 py-3 text-sm hover:text-gray-400 transition-colors">
                Atrás
              </button>
            </div>
          </div>
        )}

        {/* Modal de edición de partida — mobile only */}
        {editingItemIndex !== null && (
          <div className="md:hidden fixed inset-0 bg-gray-950 z-50 overflow-y-auto">
            <div className="px-5 pt-12 pb-8">
              {/* Header */}
              <div className="flex justify-between items-center mb-7">
                <button onClick={() => setEditingItemIndex(null)} className="text-gray-400 text-sm hover:text-gray-300">
                  Cancelar
                </button>
                <span className="text-white font-medium text-[15px]">
                  {watchedItems[editingItemIndex]?.descripcion ? 'Editar partida' : 'Nueva partida'}
                </span>
                <button onClick={() => setEditingItemIndex(null)} className="text-blue-500 font-medium text-sm hover:text-blue-400">
                  Listo
                </button>
              </div>

              {/* Campos */}
              <div className="space-y-5">
                <div>
                  <label className="block text-[13px] text-gray-400 mb-2">Descripción</label>
                  <input {...register(`items.${editingItemIndex}.descripcion`)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
                    placeholder="Descripción del item"
                  />
                </div>

                <div>
                  <label className="block text-[13px] text-gray-400 mb-2">Categoría</label>
                  <input {...register(`items.${editingItemIndex}.categoria`)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
                    placeholder="Categoría"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[13px] text-gray-400 mb-2">Cantidad</label>
                    <input type="number" {...register(`items.${editingItemIndex}.cantidad`, { valueAsNumber: true })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white text-center focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-[13px] text-gray-400 mb-2">Precio unitario</label>
                    <input type="number" {...register(`items.${editingItemIndex}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] text-gray-400 mb-2">Responsable</label>
                  <select {...register(`items.${editingItemIndex}.responsable_id`)}
                    onChange={(e) => {
                      setValue(`items.${editingItemIndex!}.responsable_id`, e.target.value)
                      const r = responsables.find(r => r.id === e.target.value)
                      setValue(`items.${editingItemIndex!}.responsable_nombre`, r?.nombre ?? '')
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">Sin asignar</option>
                    {responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] text-gray-400 mb-2">Por pagar al responsable</label>
                  <input type="number" {...register(`items.${editingItemIndex}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Cálculo en vivo */}
              {editingItemIndex !== null && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-500 text-sm">Importe</span>
                    <span className="text-gray-300 text-sm font-medium">${fmt(calcItem(watchedItems[editingItemIndex]).importe)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Margen</span>
                    <span className={`text-sm font-medium ${calcItem(watchedItems[editingItemIndex]).margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${fmt(calcItem(watchedItems[editingItemIndex]).margen)}
                    </span>
                  </div>
                </div>
              )}

              {/* Botón eliminar */}
              {fields.length > 1 && (
                <button type="button" onClick={() => {
                  remove(editingItemIndex)
                  setEditingItemIndex(null)
                }}
                  className="w-full text-red-400 hover:text-red-300 py-3 text-sm mt-6 transition-colors">
                  Eliminar partida
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Cargando...</div>}>
      <NuevaCotizacionContent />
    </Suspense>
  )
}
