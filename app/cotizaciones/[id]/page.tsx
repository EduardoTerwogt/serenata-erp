'use client'

import { useEffect, useState, use } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Cotizacion, Responsable, ItemCotizacion, Producto } from '@/lib/types'

interface ItemForm {
  id?: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  responsable_id: string
  responsable_nombre: string
  x_pagar: number
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
  precio_unitario: 0,
  responsable_id: '',
  responsable_nombre: '',
  x_pagar: 0,
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

  // SICAM: listas completas cargadas al montar
  const [listaClientes, setListaClientes] = useState<{ nombre: string; proyectos: string[] }[]>([])
  const [listaProductos, setListaProductos] = useState<Producto[]>([])
  // Autocomplete cliente
  const [clienteInput, setClienteInput] = useState('')
  const [clienteSugerencias, setClienteSugerencias] = useState<string[]>([])
  const [mostrarClienteDropdown, setMostrarClienteDropdown] = useState(false)
  // Autocomplete proyecto
  const [proyectosDelCliente, setProyectosDelCliente] = useState<string[]>([])
  const [proyectoInput, setProyectoInput] = useState('')
  const [mostrarProyectoDropdown, setMostrarProyectoDropdown] = useState(false)
  // Autocomplete productos por fila
  const [productoSugerencias, setProductoSugerencias] = useState<Record<number, Producto[]>>({})
  const [mostrarProductoDropdown, setMostrarProductoDropdown] = useState<Record<number, boolean>>({})

  // Modal nuevo producto
  const [modalProducto, setModalProducto] = useState<{
    show: boolean
    rowIndex: number
    form: { descripcion: string; categoria: string; precio_unitario: string; x_pagar_sugerido: string }
  }>({ show: false, rowIndex: 0, form: { descripcion: '', categoria: '', precio_unitario: '0', x_pagar_sugerido: '0' } })

  // Configuración de totales (cargada desde la cotización)
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

  useEffect(() => {
    fetch('/api/clientes?q=').then(r => r.json()).then(d => setListaClientes(d || [])).catch(() => {})
    fetch('/api/productos?q=').then(r => r.json()).then(d => setListaProductos(d || [])).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`/api/cotizaciones/${id}`).then(r => r.json()),
      fetch('/api/responsables').then(r => r.json()),
    ]).then(([cot, resp]) => {
      setCotizacion(cot)
      setClienteInput(cot.cliente || '')
      setProyectoInput(cot.proyecto || '')
      setResponsables(resp)
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
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, reset])

  const calcItem = (item: ItemForm) => {
    const importe = (item.cantidad || 0) * (item.precio_unitario || 0)
    const margen = importe - (item.x_pagar || 0)
    return { importe, margen }
  }

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

  // Valores a mostrar en modo no editable (APROBADA)
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

  const guardarModalProducto = async () => {
    const { descripcion, categoria, precio_unitario, x_pagar_sugerido } = modalProducto.form
    try {
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion,
          categoria: categoria || null,
          precio_unitario: parseFloat(precio_unitario) || 0,
          x_pagar_sugerido: parseFloat(x_pagar_sugerido) || 0,
        }),
      })
      if (!res.ok) return
      const p = await res.json()
      seleccionarProducto(modalProducto.rowIndex, p)
      setModalProducto(prev => ({ ...prev, show: false }))
    } catch { /* handle silently */ }
  }

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
      // P2: usar índice (no id) para lookup, porque react-hook-form puede no trackear el campo id
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

      console.log('ITEMS A GUARDAR:', JSON.stringify(itemsParaGuardar.map(i => ({desc: i.descripcion, resp: i.responsable_nombre}))))
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      console.log('COTIZACION ITEMS ANTES:', cotizacion?.items?.map(i => i.responsable_nombre))
      console.log('UPDATED CONTIENE ITEMS:', !!updated.items)
      setCotizacion(prev => prev ? { ...prev, ...updated, items: prev.items } : updated)
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
      if (!ok) { setAprobando(false); return }
      setSuccess(null)
      const res = await fetch(`/api/cotizaciones/${id}/aprobar`, { method: 'POST' })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error aprobando cotización')
      }
      // Recargar cotización completa con items después de aprobar
      const reloadRes = await fetch(`/api/cotizaciones/${id}`)
      const fullCot = await reloadRes.json()
      // Preservar responsables si fullCot los trae vacíos (bug de sincronía DB)
      if (fullCot.items) {
        fullCot.items = fullCot.items.map((item: ItemCotizacion, index: number) => ({
          ...item,
          responsable_nombre: item.responsable_nombre || cotizacion?.items?.[index]?.responsable_nombre || null,
          responsable_id: item.responsable_id || cotizacion?.items?.[index]?.responsable_id || null,
        }))
      }
      setCotizacion(fullCot)
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
    if (!ok) return
    // Usa datos actuales del form para el PDF (no depende del estado React)
    const { generarPDFCotizacion } = await import('@/lib/pdf')
    await generarPDFCotizacion({
      id: cotizacion!.id,
      cliente: watch('cliente'),
      proyecto: watch('proyecto'),
      fecha_entrega: watch('fecha_entrega'),
      locacion: watch('locacion'),
      fecha_cotizacion: cotizacion!.fecha_cotizacion,
      items: watchedItems.map(item => ({
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
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
    return <div className="p-8 text-center text-gray-500">Cargando...</div>
  }
  if (!cotizacion) {
    return <div className="p-8 text-center text-gray-500">Cotización no encontrada</div>
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white font-mono">{cotizacion.id}</h1>
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
          {/* BORRADOR: Guardar + Generar Cotización (→ENVIADA + PDF) */}
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
          {/* ENVIADA: Guardar + Generar PDF + Aprobar */}
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
          {/* APROBADA: Generar PDF + Crear Complementaria */}
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

      {/* Info general */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Información General</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Cliente con autocomplete */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            {esEditable ? (
              <div className="relative">
                <input
                  value={clienteInput}
                  onChange={e => handleClienteChange(e.target.value)}
                  onFocus={() => clienteSugerencias.length > 0 && setMostrarClienteDropdown(true)}
                  onBlur={() => setTimeout(() => setMostrarClienteDropdown(false), 200)}
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
          {/* Proyecto con autocomplete */}
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
          {/* Fecha de Entrega y Locación */}
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

      {/* Items */}
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
        <div className="overflow-x-auto">
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
                          <div className="flex gap-1">
                            <input
                              {...register(`items.${index}.descripcion`)}
                              onChange={e => handleDescripcionChange(index, e.target.value)}
                              onFocus={() => (productoSugerencias[index]?.length ?? 0) > 0 && setMostrarProductoDropdown(prev => ({ ...prev, [index]: true }))}
                              onBlur={() => setTimeout(() => setMostrarProductoDropdown(prev => ({ ...prev, [index]: false })), 200)}
                              className="w-44 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() => setModalProducto({ show: true, rowIndex: index, form: { descripcion: '', categoria: '', precio_unitario: '0', x_pagar_sugerido: '0' } })}
                              className="bg-gray-700 hover:bg-gray-600 text-white px-2 rounded text-xs font-bold"
                              title="Nuevo producto"
                            >+</button>
                          </div>
                          {mostrarProductoDropdown[index] && (productoSugerencias[index]?.length ?? 0) > 0 && (
                            <div className="absolute z-50 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
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
                        <input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`, { valueAsNumber: true })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
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
                        <input type="number" min="0" step="0.01" {...register(`items.${index}.x_pagar`, { valueAsNumber: true })} className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
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
      </div>

      {/* Modal: Nuevo Producto */}
      {modalProducto.show && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setModalProducto(p => ({ ...p, show: false })) }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-white font-semibold mb-4">Nuevo Producto</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                <input
                  value={modalProducto.form.descripcion}
                  onChange={e => setModalProducto(p => ({ ...p, form: { ...p.form, descripcion: e.target.value } }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Categoría</label>
                <input
                  value={modalProducto.form.categoria}
                  onChange={e => setModalProducto(p => ({ ...p, form: { ...p.form, categoria: e.target.value } }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Precio Sugerido</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalProducto.form.precio_unitario}
                    onChange={e => setModalProducto(p => ({ ...p, form: { ...p.form, precio_unitario: e.target.value } }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">X Pagar Sugerido</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalProducto.form.x_pagar_sugerido}
                    onChange={e => setModalProducto(p => ({ ...p, form: { ...p.form, x_pagar_sugerido: e.target.value } }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={guardarModalProducto}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setModalProducto(p => ({ ...p, show: false }))}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Totales */}
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
