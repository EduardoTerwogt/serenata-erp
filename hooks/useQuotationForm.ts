'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { Producto } from '@/lib/types'
import { calculateQuotationItem } from '@/lib/quotations/calculations'
import { QuotationFormItem, QuotationFormValues } from '@/lib/quotations/types'

export function useQuotationForm(
  setValue: UseFormSetValue<QuotationFormValues>,
  watchedItems: QuotationFormItem[]
) {
  const [listaClientes, setListaClientes] = useState<{ nombre: string; proyectos: string[] }[]>([])
  const [listaProductos, setListaProductos] = useState<Producto[]>([])
  const [clienteInput, setClienteInput] = useState('')
  const [mostrarClienteDropdown, setMostrarClienteDropdown] = useState(false)
  const [proyectoInput, setProyectoInput] = useState('')
  const [mostrarProyectoDropdown, setMostrarProyectoDropdown] = useState(false)
  const [mostrarProductoDropdown, setMostrarProductoDropdown] = useState<Record<number, boolean>>({})

  const refreshCatalogos = useCallback(async () => {
    try {
      const [clientes, productos] = await Promise.all([
        fetch('/api/clientes?q=').then(r => r.json()),
        fetch('/api/productos?q=').then(r => r.json()),
      ])
      setListaClientes(clientes || [])
      setListaProductos(productos || [])
    } catch {
      // ignorar errores de catálogos
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
      .map((cliente) => cliente.nombre)
  }, [clienteInput, listaClientes])

  const proyectosDelCliente = useMemo(() => {
    const clienteSeleccionado = listaClientes.find(
      (cliente) => cliente.nombre.toLowerCase() === clienteInput.trim().toLowerCase()
    )

    return clienteSeleccionado?.proyectos || []
  }, [clienteInput, listaClientes])

  const productoSugerencias = useMemo(() => {
    return watchedItems.reduce<Record<number, Producto[]>>((acc, item, index) => {
      const descripcion = item?.descripcion?.trim() || ''

      if (descripcion.length < 2) {
        acc[index] = []
        return acc
      }

      acc[index] = listaProductos
        .filter((producto) => producto.descripcion.toLowerCase().includes(descripcion.toLowerCase()))
        .slice(0, 8)

      return acc
    }, {})
  }, [listaProductos, watchedItems])

  const calcItem = useCallback((item: QuotationFormItem) => calculateQuotationItem(item), [])

  const handleClienteChange = useCallback((valor: string) => {
    setClienteInput(valor)
    setValue('cliente', valor)

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

  const handleDescripcionChange = useCallback((index: number, valor: string) => {
    setValue(`items.${index}.descripcion`, valor)
    setValue(`items.${index}.precio_unitario`, '')
    setValue(`items.${index}.x_pagar`, '')

    if (valor.length < 2) {
      setMostrarProductoDropdown((prev) => ({ ...prev, [index]: false }))
      return
    }

    const tieneSugerencias = listaProductos.some((producto) =>
      producto.descripcion.toLowerCase().includes(valor.toLowerCase())
    )
    setMostrarProductoDropdown((prev) => ({ ...prev, [index]: tieneSugerencias }))
  }, [listaProductos, setValue])

  const seleccionarProducto = useCallback((index: number, producto: Producto) => {
    setValue(`items.${index}.descripcion`, producto.descripcion)
    setValue(`items.${index}.categoria`, producto.categoria || '')
    if (producto.precio_unitario > 0) {
      setValue(`items.${index}.precio_unitario`, producto.precio_unitario)
    }
    if ((producto.x_pagar_sugerido || 0) > 0) {
      setValue(`items.${index}.x_pagar`, producto.x_pagar_sugerido || 0)
    }
    setMostrarProductoDropdown((prev) => ({ ...prev, [index]: false }))
  }, [setValue])

  const seleccionarCliente = useCallback((cliente: string) => {
    setClienteInput(cliente)
    setValue('cliente', cliente)
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
