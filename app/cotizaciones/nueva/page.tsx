'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { Responsable, Producto } from '@/lib/types'

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

  const [folio, setFolio] = useState<string>('')
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSubmitting = useRef(false)

  // SICAM: listas completas cargadas al montar
  const [listaClientes, setListaClientes] = useState<{ nombre: string; proyectos: string[] }[]>([])
  const [listaProductos, setListaProductos] = useState<Producto[]>([])
  // Autocomplete cliente
  const [clienteInput, setClienteInput] = useState(clienteParam)
  const [clienteSugerencias, setClienteSugerencias] = useState<string[]>([])
  const [mostrarClienteDropdown, setMostrarClienteDropdown] = useState(false)
  // Autocomplete proyecto
  const [proyectosDelCliente, setProyectosDelCliente] = useState<string[]>([])
  const [proyectoInput, setProyectoInput] = useState(proyectoParam)
  const [mostrarProyectoDropdown, setMostrarProyectoDropdown] = useState(false)
  // Autocomplete productos por fila
  const [productoSugerencias, setProductoSugerencias] = useState<Record<number, Producto[]>>({})
  const [mostrarProductoDropdown, setMostrarProductoDropdown] = useState<Record<number, boolean>>({})

  // Configuración de totales (editable por cotización)
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

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  useEffect(() => {
    fetch('/api/folio').then(r => r.json()).then(d => setFolio(d.folio))
    fetch('/api/responsables').then(r => r.json()).then(setResponsables)
    fetch('/api/clientes?q=').then(r => r.json()).then(d => setListaClientes(d || [])).catch(() => {})
    fetch('/api/productos?q=').then(r => r.json()).then(d => setListaProductos(d || [])).catch(() => {})
  }, [])

  // Pre-fill readonly fields when creating a complementary quote
  useEffect(() => {
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

  const calcItem = (item: ItemForm) => {
    const pu = typeof item.precio_unitario === 'number' ? item.precio_unitario : 0
    const xp = typeof item.x_pagar === 'number' ? item.x_pagar : 0
    const importe = (item.cantidad || 0) * pu
    const margen = importe - xp
    return { importe, margen }
  }

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

  // ── Handlers: cliente autocomplete (filtro local) ───────────────────────────
  const handleClienteChange = (valor: string) => {
    setClienteInput(valor)
    setValue('cliente', valor)
    setProyectosDelCliente([])
    if (valor.length >= 2) {
      const filtrados = listaClientes.filter(c => c.nombre.toLowerCase().includes(valor.toLowerCase())).slice(0, 8)
      setClienteSugerencias(filtrados.map(c => c.nombre))
      setMostrarClienteDropdown(filtrados.length > 0)
    } else {
      setMostrarClienteDropdown(false)
    }
  }

  // ── Handlers: proyecto autocomplete (filtro local sobre proyectos del cliente) ──
  const handleProyectoChange = (valor: string) => {
    setProyectoInput(valor)
    setValue('proyecto', valor)
    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(valor.toLowerCase()))
    setMostrarProyectoDropdown(filtrados.length > 0)
  }

  // ── Handlers: producto autocomplete (filtro local) ──────────────────────────
  const handleDescripcionChange = (index: number, valor: string) => {
    setValue(`items.${index}.descripcion`, valor)
    // Limpiar precios cuando el usuario escribe manualmente (solo autocomplete los setea)
    setValue(`items.${index}.precio_unitario`, '')
    setValue(`items.${index}.x_pagar`, '')
    if (valor.length >= 2) {
      const filtrados = listaProductos.filter(p => p.descripcion.toLowerCase().includes(valor.toLowerCase())).slice(0, 8)
      setProductoSugerencias(prev => ({ ...prev, [index]: filtrados }))
      setMostrarProductoDropdown(prev => ({ ...prev, [index]: filtrados.length > 0 }))
    } else {
      setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
    }
  }

  const seleccionarProducto = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.descripcion)
    setValue(`items.${index}.categoria`, p.categoria || '')
    if (p.precio_unitario > 0) setValue(`items.${index}.precio_unitario`, p.precio_unitario)
    if ((p.x_pagar_sugerido || 0) > 0) setValue(`items.${index}.x_pagar`, p.x_pagar_sugerido || 0)
    setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
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
      id: folio,  // enviar folio para idempotencia
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
      // Recuperación: verificar si la cotización se guardó a pesar del error
      if (folio) {
        try {
          const check = await fetch(`/api/cotizaciones/${folio}`)
          if (check.ok) {
            console.log('[guardarDatos] Cotización creada a pesar del error, recuperando:', folio)
            return check.json()
          }
        } catch { /* ignorar error de recuperación */ }
      }
      let errMsg = 'Error al guardar'
      try { const err = await res.json(); errMsg = err.error || errMsg } catch { /* ignorar */ }
      throw new Error(errMsg)
    }
    return res.json()
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

      // Generar PDF
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

      {/* Información General */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Cliente con autocomplete */}
          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Cliente *</label>
            {esComplementaria ? (
              <input
                value={clienteInput}
                readOnly
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white opacity-60 cursor-not-allowed"
              />
            ) : (
              <>
                <input
                  value={clienteInput}
                  onChange={e => handleClienteChange(e.target.value)}
                  onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)}
                  onBlur={() => setTimeout(() => {
                    setMostrarClienteDropdown(false)
                    // Resolver proyectos si se escribió manualmente un cliente existente
                    if (proyectosDelCliente.length === 0 && clienteInput.trim()) {
                      const match = listaClientes.find(c => c.nombre.toLowerCase() === clienteInput.trim().toLowerCase())
                      if (match) setProyectosDelCliente(match.proyectos || [])
                    }
                  }, 200)}
                  autoComplete="off"
                  placeholder="Nombre del cliente"
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
                        className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                      >
                        {nombre}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">Proyecto *</label>
            {esComplementaria ? (
              <input
                value={proyectoInput}
                readOnly
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white opacity-60 cursor-not-allowed"
              />
            ) : (
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
                  placeholder="Nombre del proyecto"
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
                          className="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white text-sm border-b border-gray-700 last:border-0"
                        >
                          {proy}
                        </div>
                      ))}
                    </div>
                  ) : null
                })()}
              </>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha de Entrega</label>
            <input
              type="date"
              {...register('fecha_entrega')}
              readOnly={esComplementaria}
              className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Locación</label>
            <input
              {...register('locacion')}
              readOnly={esComplementaria}
              className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${esComplementaria ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="Lugar del evento"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha de Cotización</label>
            <p className="text-white py-2 text-sm">{fechaHoy()}</p>
          </div>
        </div>
      </div>

      {/* Partidas */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Partidas</h2>
          <button
            type="button"
            onClick={() => append({ ...itemVacio })}
            className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            + Agregar fila
          </button>
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
                    <td className="px-4 py-2">
                      <input
                        {...register(`items.${index}.categoria`)}
                        className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                        placeholder="Categoría"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative">
                        <input
                            {...register(`items.${index}.descripcion`)}
                            onChange={e => handleDescripcionChange(index, e.target.value)}
                            onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))}
                            onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)}
                            className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                            placeholder="Descripción"
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
                      <input
                        type="number"
                        min="1"
                        step="1"
                        {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                        className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`items.${index}.precio_unitario`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })}
                        className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-white font-medium whitespace-nowrap">
                      ${fmt(importe)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        {...register(`items.${index}.responsable_id`)}
                        onChange={(e) => {
                          const r = responsables.find(r => r.id === e.target.value)
                          if (r) {
                            const input = document.querySelector<HTMLInputElement>(
                              `input[name="items.${index}.responsable_nombre"]`
                            )
                            if (input) input.value = r.nombre
                          }
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`items.${index}.x_pagar`, { setValueAs: (v: unknown) => v === '' || v === null || v === undefined ? '' : (Number(v) || 0) })}
                        className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className={`px-4 py-2 font-medium whitespace-nowrap ${margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${fmt(margen)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Totales</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-white">${fmt(totales.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-400 flex items-center gap-2">
                Fee Agencia
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
              </span>
              <span className="text-white">${fmt(totales.fee_agencia)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">General</span>
              <span className="text-white">${fmt(totales.general)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-400 flex items-center gap-2">
                IVA (16%)
                <button
                  type="button"
                  onClick={() => setIvaActivo(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${iva_activo ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${iva_activo ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </span>
              <span className={iva_activo ? 'text-white' : 'text-gray-600'}>${fmt(totales.iva)}</span>
            </div>
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
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-bold">
              <span className="text-white">TOTAL</span>
              <span className="text-green-400 text-lg">${fmt(totales.total)}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Utilidad</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Margen Total</span>
              <span className={totales.margen_total >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${fmt(totales.margen_total)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Fee Agencia</span>
              <span className="text-white">${fmt(totales.fee_agencia)}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold">
              <span className="text-gray-300">Utilidad Total</span>
              <span className={totales.utilidad_total >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${fmt(totales.utilidad_total)}
              </span>
            </div>
            {totales.subtotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Margen %</span>
                <span className="text-blue-400">
                  {((totales.margen_total / totales.subtotal) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={guardando}
          onClick={onGuardarBorrador}
          className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar Borrador'}
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={onGenerarCotizacion}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {guardando ? 'Generando...' : 'Generar Cotización'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white px-4 py-3 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>

    </div>
  )
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Cargando...</div>}>
      <NuevaCotizacionContent />
    </Suspense>
  )
}
