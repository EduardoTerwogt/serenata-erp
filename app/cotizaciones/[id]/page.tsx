'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Cotizacion, Responsable, ItemCotizacion, Producto } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'

interface ItemForm {
  id?: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number | ''
  responsable_id: string
  responsable_nombre: string
  x_pagar: number | ''
  importe?: number
  margen?: number
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

  // ✅ Usar hook compartido para autocomplete y búsqueda
  // En lugar de duplicar estado en cada página, usamos el hook
  const quotationForm = useQuotationForm(setValue, watchedItems)

  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)

  const { register, control, watch, reset, setValue } = useForm<CotizacionForm>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...itemVacio }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'ENVIADA'

  // ✅ refreshCatalogos viene del hook
  const { refreshCatalogos } = quotationForm

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
  }, [reset])

  useEffect(() => {
    refreshCatalogos()
  }, [refreshCatalogos])

  useEffect(() => {
    Promise.all([
      fetch(`/api/cotizaciones/${id}`).then(r => r.json()),
      fetch('/api/responsables').then(r => r.json()),
    ]).then(([cot, resp]) => {
      applyCotizacionToState(cot)
      setResponsables(resp)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  // ✅ calcItem viene del hook
  const { calcItem } = quotationForm

  const totales = (() => {
    const items = watchedItems || []
    const subtotal = items.reduce((s, item) => s + calcItem(item).importe, 0)
    const fee_agencia = subtotal * porcentaje_fee
    const general = subtotal + fee_agencia
    const descuento = descuento_tipo === 'porcentaje'
      ? general * (descuento_valor / 100)
      : descuento_valor
    const base_iva = general - descuento
    const iva = iva_activo ? base_iva * 0.16 : 0
    const total = base_iva + iva
    const margen_total = items.reduce((s, item) => s + calcItem(item).margen, 0)
    const utilidad_total = margen_total + fee_agencia - descuento
    return { subtotal, fee_agencia, general, descuento, iva, total, margen_total, utilidad_total }
  })()

  const displayTotales = esEditable ? totales : (() => {
    const g = cotizacion?.general ?? 0
    const dv = cotizacion?.descuento_valor ?? 0
    const dt = cotizacion?.descuento_tipo ?? 'monto'
    const descuento = dt === 'porcentaje' ? g * (dv / 100) : dv
    return {
      subtotal: cotizacion?.subtotal ?? 0,
      fee_agencia: cotizacion?.fee_agencia ?? 0,
      general: g,
      descuento,
      iva: cotizacion?.iva ?? 0,
      total: cotizacion?.total ?? 0,
      margen_total: cotizacion?.margen_total ?? 0,
      utilidad_total: cotizacion?.utilidad_total ?? 0,
    }
  })()

  // ✅ Funciones vienen del hook compartido
  const {
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
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

  const guardar = async (estado?: string): Promise<boolean> => {
    setGuardando(true)
    setError(null)
    try {
      const data = {
        cliente: watch('cliente'),
        proyecto: watch('proyecto'),
        fecha_entrega: watch('fecha_entrega'),
        locacion: watch('locacion'),
      }
      const itemsParaGuardar = watchedItems.map((formItem, index) => {
        const { importe, margen } = calcItem(formItem)
        const dbItem = cotizacion?.items?.[index]
        const responsableId = formItem.responsable_id || dbItem?.responsable_id || null
        const r = responsableId ? responsables.find(r => r.id === responsableId) : null
        return {
          ...formItem,
          importe,
          margen,
          orden: index,
          precio_unitario: formItem.precio_unitario === '' ? 0 : formItem.precio_unitario,
          x_pagar: formItem.x_pagar === '' ? 0 : formItem.x_pagar,
          responsable_id: responsableId,
          responsable_nombre: formItem.responsable_nombre || dbItem?.responsable_nombre || r?.nombre || null,
        }
      })
      const body: Record<string, unknown> = {
        ...data,
        items: itemsParaGuardar,
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
      }
      if (estado) body.estado = estado

      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      const refreshedRes = await fetch(`/api/cotizaciones/${id}`)
      if (!refreshedRes.ok) throw new Error('Error recargando cotización actualizada')
      const refreshedCotizacion = await refreshedRes.json()
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

      const res = await fetch(`/api/cotizaciones/${id}/aprobar`, { method: 'POST' })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error aprobando cotización')
      }

      const reloadRes = await fetch(`/api/cotizaciones/${id}`)
      if (!reloadRes.ok) throw new Error('Error recargando cotización aprobada')
      const fullCot = await reloadRes.json()
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
    const { generarPDFCotizacion } = await import('@/lib/pdf')
    await generarPDFCotizacion({
      id: cotizacion.id,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      fecha_entrega: cotizacion.fecha_entrega,
      locacion: cotizacion.locacion,
      fecha_cotizacion: cotizacion.fecha_cotizacion,
      items: (cotizacion.items || []).map(item => ({
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
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
  }

  const generarCotizacion = async () => {
    const ok = await guardar('ENVIADA')
    if (!ok || !cotizacion) return
    const { generarPDFCotizacion } = await import('@/lib/pdf')
    await generarPDFCotizacion({
      id: cotizacion.id,
      cliente: watch('cliente'),
      proyecto: watch('proyecto'),
      fecha_entrega: watch('fecha_entrega'),
      locacion: watch('locacion'),
      fecha_cotizacion: cotizacion.fecha_cotizacion,
      items: watchedItems.map(item => ({
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario === '' ? 0 : item.precio_unitario,
        importe: calcItem(item).importe,
      })),
      subtotal: totales.subtotal,
      fee_agencia: totales.fee_agencia,
      general: totales.general,
      iva: totales.iva,
      total: totales.total,
      iva_activo,
      porcentaje_fee,
      descuento_tipo,
      descuento_valor,
    })
  }

  const crearComplementaria = () => {
    if (!cotizacion) return
    const params = new URLSearchParams({
      complementaria_de: id,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      locacion: cotizacion.locacion || '',
      fecha_entrega: cotizacion.fecha_entrega || '',
    })
    router.push(`/cotizaciones/nueva?${params.toString()}`)
  }

  if (loading) {
    return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cargando...</div>
  }
  if (!cotizacion) {
    return <div className="px-5 pt-6 pb-6 md:p-8 text-center text-gray-500">Cotización no encontrada</div>
  }

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 max-w-7xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
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
        <div className="flex gap-2 flex-wrap justify-end">
          {cotizacion.estado === 'BORRADOR' && (
            <>
              <button
                onClick={() => guardar()}
                disabled={guardando}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={generarCotizacion}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {guardando ? 'Generando...' : 'Generar Cotización'}
              </button>
            </>
          )}
          {cotizacion.estado === 'ENVIADA' && (
            <>
              <button
                onClick={() => guardar()}
                disabled={guardando}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={generarPDF}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Generar PDF
              </button>
              <button
                onClick={aprobar}
                disabled={aprobando || guardando}
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {aprobando ? 'Aprobando...' : 'Aprobar Cotización'}
              </button>
            </>
          )}
          {cotizacion.estado === 'APROBADA' && (
            <>
              <button
                onClick={generarPDF}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Generar PDF
              </button>
              <button
                onClick={crearComplementaria}
                className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Crear Complementaria
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4">
          {success}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            {esEditable ? (
              <div className="relative">
                <input
                  value={clienteInput}
                  onChange={e => handleClienteChange(e.target.value)}
                  onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)}
                  onBlur={() => setTimeout(() => {
                    setMostrarClienteDropdown(false)
                    if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                      const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                      if (match) setProyectosDelCliente(match.proyectos || [])
                    }
                  }, 200)}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {mostrarClienteDropdown && clienteSugerencias.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {clienteSugerencias.map((nombre, i) => (
                      <div
                        key={i}
                        onMouseDown={() => {
                          const cli = listaClientes.find(c => c.nombre === nombre)
                          setClienteInput(nombre)
                          setValue('cliente', nombre)
                          setProyectosDelCliente(cli?.proyectos || [])
                          setMostrarClienteDropdown(false)
                        }}
                        className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                      >
                        {nombre}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-white py-2">{watch('cliente') || '—'}</p>
            )}
          </div>
          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Proyecto</label>
            {esEditable ? (
              <>
                <input
                  value={proyectoInput}
                  onChange={e => handleProyectoChange(e.target.value)}
                  onFocus={() => {
                    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                    if (filtrados.length > 0) setMostrarProyectoDropdown(true)
                  }}
                  onBlur={() => setTimeout(() => setMostrarProyectoDropdown(false), 200)}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {mostrarProyectoDropdown && (() => {
                  const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(proyectoInput.toLowerCase()))
                  return filtrados.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filtrados.map((proy, i) => (
                        <div
                          key={i}
                          onMouseDown={() => {
                            setProyectoInput(proy)
                            setValue('proyecto', proy)
                            setMostrarProyectoDropdown(false)
                          }}
                          className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                        >
                          {proy}
                        </div>
                      ))}
                    </div>
                  ) : null
                })()}
              </>
            ) : (
              <p className="text-white py-2">{watch('proyecto') || '—'}</p>
            )}
          </div>
          {[
            { label: 'Fecha de Entrega', name: 'fecha_entrega' as const, type: 'date' },
            { label: 'Locación', name: 'locacion' as const },
          ].map(({ label, name, type }) => (
            <div key={name}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              {esEditable ? (
                <input
                  type={type || 'text'}
                  {...register(name)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <p className="text-white py-2">{watch(name) || '—'}</p>
              )}
            </div>
          ))}
          {cotizacion.fecha_cotizacion && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fecha de Cotización</label>
              <p className="text-white py-2">
                {(() => {
                  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
                  const parts = cotizacion.fecha_cotizacion!.split('-').map(Number)
                  return `${parts[2]} de ${meses[parts[1] - 1]} ${parts[0]}`
                })()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Partidas</h2>
          {esEditable && (
            <button
              type="button"
              onClick={() => append({ ...itemVacio })}
              className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              + Agregar fila
            </button>
          )}
        </div>
        {/* Desktop Table */}
        <div className="hidden md:block" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Categoría', 'Descripción', 'Cant.', 'P. Unit.', 'Importe', 'Responsable', 'X Pagar', 'Margen', ...(esEditable ? [''] : [])].map(h => (
                  <th key={h} className="text-left text-gray-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {esEditable ? (
                fields.map((field, index) => {
                  const item = watchedItems[index] || itemVacio
                  const { importe, margen } = calcItem(item)
                  return (
                    <tr key={field.id} className="border-b border-gray-800/50">
                      <td className="px-4 py-2">
                        <input {...register(`items.${index}.categoria`)} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative">
                          <input
                            {...register(`items.${index}.descripcion`)}
                            onChange={e => handleDescripcionChange(index, e.target.value)}
                            onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))}
                            onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)}
                            className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                            autoComplete="off"
                          />
                          {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && (
                            <div className="absolute z-[9999] mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {productoSugerencias[index].map((p, i) => (
                                <div
                                  key={i}
                                  onMouseDown={() => seleccionarProducto(index, p)}
                                  className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                                >
                                  <div className="font-medium">{p.descripcion}</div>
                                  {p.categoria && <div className="text-gray-400 text-xs">{p.categoria}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="1" {...register(`items.${index}.cantidad`, { valueAsNumber: true })} className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-4 py-2 text-white font-medium whitespace-nowrap">${fmt(importe)}</td>
                      <td className="px-4 py-2">
                        <select
                          {...register(`items.${index}.responsable_id`)}
                          onChange={e => {
                            setValue(`items.${index}.responsable_id`, e.target.value)
                            const r = responsables.find(r => r.id === e.target.value)
                            setValue(`items.${index}.responsable_nombre`, r?.nombre ?? '')
                          }}
                          className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Sin asignar</option>
                          {responsables.map(r => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))}
                        </select>
                        <input type="hidden" {...register(`items.${index}.responsable_nombre`)} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margen)}</td>
                      <td className="px-4 py-2">
                        <button type="button" onClick={() => remove(index)} disabled={fields.length === 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30">✕</button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                (cotizacion.items || []).map(item => (
                  <tr key={item.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-3 text-gray-300">{item.categoria}</td>
                    <td className="px-4 py-3 text-white">{item.descripcion}</td>
                    <td className="px-4 py-3 text-gray-300">{item.cantidad}</td>
                    <td className="px-4 py-3 text-gray-300">${fmt(item.precio_unitario)}</td>
                    <td className="px-4 py-3 text-white font-medium">${fmt(item.importe)}</td>
                    <td className="px-4 py-3">
                      {item.responsable_nombre
                        ? <span className="text-gray-300">{item.responsable_nombre}</span>
                        : <span className="text-gray-500 italic">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">${fmt(item.x_pagar)}</td>
                    <td className={`px-4 py-3 font-medium ${(item.margen ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(item.margen ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3 px-0">
          {esEditable ? (
            fields.map((field, index) => {
              const item = watchedItems[index] || itemVacio
              const { importe, margen } = calcItem(item)
              return (
                <div key={field.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors" onClick={() => setEditingItemIndex(index)}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <p className="text-white font-medium text-[15px] mb-1">{item.descripcion || 'Sin descripción'}</p>
                      <p className="text-gray-400 text-sm">{item.categoria || 'Sin categoría'}</p>
                    </div>
                    <span className={`text-sm font-medium ml-2 whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${fmt(margen)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="text-gray-400">
                      <span>{item.cantidad}x</span>
                      <span className="ml-1">${fmt(item.precio_unitario as number)}</span>
                    </div>
                    <span className="text-white font-bold">${fmt(importe)}</span>
                  </div>
                  {item.responsable_nombre && (
                    <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                      Responsable: {item.responsable_nombre}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            (cotizacion.items || []).map(item => {
              const importe = (item.cantidad ?? 1) * (item.precio_unitario ?? 0)
              const margen = (item.margen ?? 0)
              return (
                <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <p className="text-white font-medium text-[15px] mb-1">{item.descripcion}</p>
                      <p className="text-gray-400 text-sm">{item.categoria}</p>
                    </div>
                    <span className={`text-sm font-medium ml-2 whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${fmt(margen)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="text-gray-400">
                      <span>{item.cantidad}x</span>
                      <span className="ml-1">${fmt(item.precio_unitario)}</span>
                    </div>
                    <span className="text-white font-bold">${fmt(importe)}</span>
                  </div>
                  {item.responsable_nombre && (
                    <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                      Responsable: {item.responsable_nombre}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Modal de edición de partida — mobile only */}
      {editingItemIndex !== null && esEditable && (
        <div className="md:hidden fixed inset-0 bg-gray-950 z-50 overflow-y-auto">
          <div className="px-5 pt-12 pb-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-7">
              <button onClick={() => setEditingItemIndex(null)} className="text-gray-400 text-sm hover:text-gray-300">
                Cancelar
              </button>
              <span className="text-white font-medium text-[15px]">
                Editar partida
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

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Totales</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-white">${fmt(displayTotales.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-400 flex items-center gap-2">
                Fee Agencia
                {esEditable ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={(porcentaje_fee * 100).toFixed(1)}
                      onChange={e => setPorcentajeFee((parseFloat(e.target.value) || 0) / 100)}
                      className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-500 text-xs">%</span>
                  </>
                ) : (
                  <span className="text-gray-500 text-xs">({((cotizacion.porcentaje_fee ?? 0.15) * 100).toFixed(0)}%)</span>
                )}
              </span>
              <span className="text-white">${fmt(displayTotales.fee_agencia)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">General</span>
              <span className="text-white">${fmt(displayTotales.general)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-400 flex items-center gap-2">
                IVA (16%)
                {esEditable && (
                  <button
                    type="button"
                    onClick={() => setIvaActivo(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                )}
              </span>
              <span className={(esEditable ? iva_activo : (cotizacion.iva_activo ?? true)) ? 'text-white' : 'text-gray-600'}>
                ${fmt(displayTotales.iva)}
              </span>
            </div>
            {esEditable ? (
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-400 flex items-center gap-2 flex-wrap">
                  Descuento
                  <select
                    value={descuento_tipo}
                    onChange={e => setDescuentoTipo(e.target.value as 'monto' | 'porcentaje')}
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="monto">$ Monto</option>
                    <option value="porcentaje">% Porcentaje</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={descuento_valor}
                    onChange={e => setDescuentoValor(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </span>
                <span className={totales.descuento > 0 ? 'text-yellow-400' : 'text-gray-600'}>
                  {totales.descuento > 0 ? `-$${fmt(totales.descuento)}` : '$0.00'}
                </span>
              </div>
            ) : displayTotales.descuento > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Descuento</span>
                <span className="text-yellow-400">-${fmt(displayTotales.descuento)}</span>
              </div>
            ) : null}
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-bold">
              <span className="text-white">TOTAL</span>
              <span className="text-green-400 text-lg">${fmt(displayTotales.total)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Utilidad</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Margen Total</span>
              <span className={displayTotales.margen_total >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${fmt(displayTotales.margen_total)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Fee Agencia</span>
              <span className="text-white">${fmt(displayTotales.fee_agencia)}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold">
              <span className="text-gray-300">Utilidad Total</span>
              <span className={displayTotales.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${fmt(displayTotales.utilidad_total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
