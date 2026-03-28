'use client'

import { useCallback, useEffect, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { Producto } from '@/lib/types'

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

export function useQuotationForm(
  setValue: UseFormSetValue<CotizacionForm>,
  watchedItems: ItemForm[]
) {
  // ============ ESTADOS COMPARTIDOS ============
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

  // ============ CARGAR CATÁLOGOS ============
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

  // ============ FUNCIONES COMPARTIDAS ============

  /**
   * Calcula importe y margen de un item
   */
  const calcItem = (item: ItemForm) => {
    const pu = typeof item.precio_unitario === 'number' ? item.precio_unitario : 0
    const xp = typeof item.x_pagar === 'number' ? item.x_pagar : 0
    const importe = (item.cantidad || 0) * pu
    const margen = importe - xp
    return { importe, margen }
  }

  /**
   * Maneja cambios en el campo de cliente
   */
  const handleClienteChange = (valor: string) => {
    setClienteInput(valor)
    setValue('cliente', valor)
    setProyectosDelCliente([])

    if (valor.length >= 2) {
      const filtrados = listaClientes.filter(c => c.nombre.toLowerCase().includes(valor.toLowerCase())).slice(0, 8)
      setClienteSugerencias(filtrados.map(c => c.nombre))
      setMostrarClienteDropdown(filtrados.length > 0)

      // Cargar proyectos del cliente seleccionado
      const clienteSeleccionado = listaClientes.find(c => c.nombre.toLowerCase() === valor.toLowerCase())
      if (clienteSeleccionado) {
        setProyectosDelCliente(clienteSeleccionado.proyectos || [])
      }
    } else {
      setMostrarClienteDropdown(false)
    }
  }

  /**
   * Maneja cambios en el campo de proyecto
   */
  const handleProyectoChange = (valor: string) => {
    setProyectoInput(valor)
    setValue('proyecto', valor)
    const filtrados = proyectosDelCliente.filter(p => p.toLowerCase().includes(valor.toLowerCase()))
    setMostrarProyectoDropdown(filtrados.length > 0)
  }

  /**
   * Maneja cambios en el campo de descripción y busca productos
   */
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

  /**
   * Selecciona un producto del dropdown y completa sus datos
   */
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

  /**
   * Selecciona un cliente de las sugerencias
   */
  const seleccionarCliente = (cliente: string) => {
    handleClienteChange(cliente)
    setMostrarClienteDropdown(false)
  }

  /**
   * Selecciona un proyecto de las sugerencias
   */
  const seleccionarProyecto = (proyecto: string) => {
    handleProyectoChange(proyecto)
    setMostrarProyectoDropdown(false)
  }

  // ============ RETORNAR PÚBLICAMENTE ============
  return {
    // Estados
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

    // Funciones
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
