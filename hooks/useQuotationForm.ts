'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { Producto } from '@/lib/types'
import { getJson } from '@/lib/client/api'
import { calculateQuotationItem } from '@/lib/quotations/calculations'
import { QuotationFormItem, QuotationFormValues } from '@/lib/quotations/types'

// Fase 1: Caché de catálogos a nivel de módulo — evita refetch en navegación y remounts
interface CatalogosCache {
  clientes: { id: string; nombre: string; proyectos: string[] }[]
  productos: Producto[]
  ts: number
}
let _catalogosCache: CatalogosCache | null = null
const CATALOGOS_TTL_MS = 30 * 60 * 1000 // 30 minutos

export function useQuotationForm(
  setValue: UseFormSetValue<QuotationFormValues>,
  watchedItems: QuotationFormItem[]
) {
  const [listaClientes, setListaClientes] = useState<{ id: string; nombre: string; proyectos: string[] }[]>([])
  const [listaProductos, setListaProductos] = useState<Producto[]>([])
  const [clienteInput, setClienteInput] = useState('')
  const [mostrarClienteDropdown, setMostrarClienteDropdown] = useState(false)
  const [proyectoInput, setProyectoInput] = useState('')
  const [mostrarProyectoDropdown, setMostrarProyectoDropdown] = useState(false)
  // Keyed por rowId (id estable de la partida), no por índice de array: reordenar,
  // insertar o borrar filas no debe mover la sugerencia activa a otra fila.
  const [productoSugerencias, setProductoSugerencias] = useState<Record<string, Producto[]>>({})
  const [mostrarProductoDropdown, setMostrarProductoDropdown] = useState<Record<string, boolean>>({})

  const refreshCatalogos = useCallback(async (force = false) => {
    // Servir desde caché si está vigente y no se fuerza actualización
    if (!force && _catalogosCache && Date.now() - _catalogosCache.ts < CATALOGOS_TTL_MS) {
      setListaClientes(_catalogosCache.clientes)
      setListaProductos(_catalogosCache.productos)
      return
    }

    try {
      const [clientes, productos] = await Promise.all([
        getJson<{ id: string; nombre: string; proyectos: string[] }[]>('/api/clientes?q=', 'Error clientes'),
        getJson<Producto[]>('/api/productos?q=', 'Error productos'),
      ])
      const newClientes = clientes || []
      const newProductos = productos || []
      _catalogosCache = { clientes: newClientes, productos: newProductos, ts: Date.now() }
      setListaClientes(newClientes)
      setListaProductos(newProductos)
    } catch {
      // ignorar errores de catálogos — no bloquear la UI
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const loadCatalogos = () => {
      void refreshCatalogos()
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(loadCatalogos, { timeout: 1500 })
    } else {
      timeoutId = setTimeout(loadCatalogos, 0)
    }

    return () => {
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [refreshCatalogos])

  const clienteSugerencias = useMemo(() => {
    if (clienteInput.length < 2) return []

    return listaClientes
      .filter((cliente) => cliente.nombre.toLowerCase().includes(clienteInput.toLowerCase()))
      .slice(0, 8)
      .map((cliente) => ({ id: cliente.id, nombre: cliente.nombre }))
  }, [clienteInput, listaClientes])

  const proyectosDelCliente = useMemo(() => {
    const clienteSeleccionado = listaClientes.find(
      (cliente) => cliente.nombre.toLowerCase() === clienteInput.trim().toLowerCase()
    )

    return clienteSeleccionado?.proyectos || []
  }, [clienteInput, listaClientes])

  const calcItem = useCallback((item: QuotationFormItem) => calculateQuotationItem(item), [])

  const handleClienteChange = useCallback((valor: string) => {
    setClienteInput(valor)
    setValue('cliente', valor)
    // Bloque 3 (docs/PLAN.md): un texto que ya no matchea ningún cliente del
    // catálogo no debe arrastrar un cliente_id viejo -- solo un match exacto
    // por nombre lo fija de nuevo (tecleo libre, sin elegir del dropdown).
    const match = listaClientes.find((cliente) => cliente.nombre.toLowerCase() === valor.trim().toLowerCase())
    setValue('cliente_id', match?.id ?? null)

    if (valor.length < 2) {
      setMostrarClienteDropdown(false)
      return
    }

    const tieneSugerencias = listaClientes.some((cliente) =>
      cliente.nombre.toLowerCase().includes(valor.toLowerCase())
    )
    setMostrarClienteDropdown(tieneSugerencias)
  }, [listaClientes, setValue])

  const handleProyectoChange = useCallback((valor: string) => {
    setProyectoInput(valor)
    setValue('proyecto', valor)

    const tieneSugerencias = proyectosDelCliente.some((proyecto) =>
      proyecto.toLowerCase().includes(valor.toLowerCase())
    )
    setMostrarProyectoDropdown(tieneSugerencias)
  }, [proyectosDelCliente, setValue])

  const indexOfRow = useCallback((rowId: string) => watchedItems.findIndex((item) => item.id === rowId), [watchedItems])

  const handleDescripcionChange = useCallback((rowId: string, valor: string) => {
    const index = indexOfRow(rowId)
    if (index < 0) return
    // Solo se actualiza la descripción: el precio y el x_pagar únicamente cambian
    // cuando el usuario elige explícitamente una sugerencia (seleccionarProducto).
    // Limpiarlos aquí borraba precios ya capturados al corregir una descripción.
    setValue(`items.${index}.descripcion`, valor)

    if (valor.length >= 2) {
      const filtrados = listaProductos
        .filter((producto) => producto.descripcion.toLowerCase().includes(valor.toLowerCase()))
        .slice(0, 8)
      setProductoSugerencias((prev) => ({ ...prev, [rowId]: filtrados }))
      setMostrarProductoDropdown((prev) => ({ ...prev, [rowId]: filtrados.length > 0 }))
      return
    }

    setProductoSugerencias((prev) => ({ ...prev, [rowId]: [] }))
    setMostrarProductoDropdown((prev) => ({ ...prev, [rowId]: false }))
  }, [indexOfRow, listaProductos, setValue])

  const seleccionarProducto = useCallback((rowId: string, producto: Producto) => {
    const index = indexOfRow(rowId)
    if (index < 0) return
    setValue(`items.${index}.descripcion`, producto.descripcion)
    setValue(`items.${index}.categoria`, producto.categoria || '')
    if (producto.precio_unitario > 0) {
      setValue(`items.${index}.precio_unitario`, producto.precio_unitario)
    }
    if ((producto.x_pagar_sugerido || 0) > 0) {
      setValue(`items.${index}.x_pagar`, producto.x_pagar_sugerido || 0)
    }
    setProductoSugerencias((prev) => ({ ...prev, [rowId]: [] }))
    setMostrarProductoDropdown((prev) => ({ ...prev, [rowId]: false }))
  }, [indexOfRow, setValue])

  const seleccionarCliente = useCallback((cliente: { id: string; nombre: string }) => {
    setClienteInput(cliente.nombre)
    setValue('cliente', cliente.nombre)
    setValue('cliente_id', cliente.id)
    setMostrarClienteDropdown(false)
  }, [setValue])

  const seleccionarProyecto = useCallback((proyecto: string) => {
    setProyectoInput(proyecto)
    setValue('proyecto', proyecto)
    setMostrarProyectoDropdown(false)
  }, [setValue])

  return {
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

    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    seleccionarProyecto,
    refreshCatalogos,
  }
}
