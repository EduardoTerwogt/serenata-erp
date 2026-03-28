'use client'

import { useCallback, useEffect, useState } from 'react'
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
  const [clienteSugerencias, setClienteSugerencias] = useState<string[]>([])
  const [mostrarClienteDropdown, setMostrarClienteDropdown] = useState(false)
  const [proyectosDelCliente, setProyectosDelCliente] = useState<string[]>([])
  const [proyectoInput, setProyectoInput] = useState('')
  const [mostrarProyectoDropdown, setMostrarProyectoDropdown] = useState(false)
  const [productoSugerencias, setProductoSugerencias] = useState<Record<number, Producto[]>>({})
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
    refreshCatalogos()
  }, [refreshCatalogos])

  const calcItem = (item: QuotationFormItem) => calculateQuotationItem(item)

  const handleClienteChange = (valor: string) => {
    setClienteInput(valor)
    setValue('cliente', valor)
    setProyectosDelCliente([])

    if (valor.length >= 2) {
      const filtrados = listaClientes.filter(c => c.nombre.toLowerCase().includes(valor.toLowerCase())).slice(0, 8)
      setClienteSugerencias(filtrados.map(c => c.nombre))
      setMostrarClienteDropdown(filtrados.length > 0)

      const clienteSeleccionado = listaClientes.find(c => c.nombre.toLowerCase() === valor.toLowerCase())
      if (clienteSeleccionado) {
        setProyectosDelCliente(clienteSeleccionado.proyectos || [])
      }
    } else {
      setMostrarClienteDropdown(false)
    }
  }

  const handleProyectoChange = (valor: string) => {
    setProyectoInput(valor)
    setValue('proyecto', valor)
    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(valor.toLowerCase()))
    setMostrarProyectoDropdown(filtrados.length > 0)
  }

  const handleDescripcionChange = (index: number, valor: string) => {
    setValue(`items.${index}.descripcion`, valor)
    setValue(`items.${index}.precio_unitario`, '')
    setValue(`items.${index}.x_pagar`, '')

    if (valor.length >= 2) {
      const filtrados = listaProductos
        .filter(p => p.descripcion.toLowerCase().includes(valor.toLowerCase()))
        .slice(0, 8)
      setProductoSugerencias(prev => ({ ...prev, [index]: filtrados }))
      setMostrarProductoDropdown(prev => ({ ...prev, [index]: filtrados.length > 0 }))
    } else {
      setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
    }
  }

  const seleccionarProducto = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.descripcion)
    setValue(`items.${index}.categoria`, p.categoria || '')
    if (p.precio_unitario > 0) {
      setValue(`items.${index}.precio_unitario`, p.precio_unitario)
    }
    if ((p.x_pagar_sugerido || 0) > 0) {
      setValue(`items.${index}.x_pagar`, p.x_pagar_sugerido || 0)
    }
    setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
  }

  const seleccionarCliente = (cliente: string) => {
    handleClienteChange(cliente)
    setMostrarClienteDropdown(false)
  }

  const seleccionarProyecto = (proyecto: string) => {
    handleProyectoChange(proyecto)
    setMostrarProyectoDropdown(false)
  }

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
