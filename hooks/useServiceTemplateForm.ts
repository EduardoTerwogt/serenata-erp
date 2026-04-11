'use client'

import { useState, useCallback, useEffect } from 'react'
import { Producto, ServiceTemplateItem } from '@/lib/types'

export function useServiceTemplateForm(
  items: ServiceTemplateItem[],
  setItems: (items: ServiceTemplateItem[]) => void
) {
  const [listaProductos, setListaProductos] = useState<Producto[]>([])
  const [productoSugerencias, setProductoSugerencias] = useState<Record<number, Producto[]>>({})
  const [mostrarProductoDropdown, setMostrarProductoDropdown] = useState<Record<number, boolean>>({})

  // 1. Load products from /api/productos (mirrors useQuotationForm.refreshCatalogos)
  useEffect(() => {
    fetch('/api/productos')
      .then(res => res.json())
      .then(data => setListaProductos(data || []))
      .catch(err => console.error('Failed to load productos:', err))
  }, [])

  // 2. Handle descripción change (EXACTLY like useQuotationForm line 125-141)
  const handleDescripcionChange = useCallback((index: number, valor: string) => {
    const newItems = [...items]
    newItems[index].descripcion = valor
    setItems(newItems)

    // Show suggestions for ≥2 characters
    if (valor.length >= 2) {
      const filtrados = listaProductos
        .filter(p => p.descripcion.toLowerCase().includes(valor.toLowerCase()))
        .slice(0, 8) // Max 8 suggestions
      setProductoSugerencias(prev => ({ ...prev, [index]: filtrados }))
      setMostrarProductoDropdown(prev => ({ ...prev, [index]: filtrados.length > 0 }))
      return
    }

    // Clear suggestions
    setProductoSugerencias(prev => ({ ...prev, [index]: [] }))
    setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
  }, [listaProductos, items, setItems])

  // 3. Select producto and copy data (like useQuotationForm line 143-154)
  const seleccionarProducto = useCallback((index: number, producto: Producto) => {
    const newItems = [...items]
    newItems[index] = {
      ...newItems[index],
      descripcion: producto.descripcion,
      categoria: producto.categoria || '',
      precio_unitario: producto.precio_unitario > 0 ? producto.precio_unitario : 0,
      x_pagar: (producto.x_pagar_sugerido || 0) > 0 ? producto.x_pagar_sugerido : 0,
      // NOTE: Intentionally NOT copying producto_id
      // This keeps edits isolated to the template
    }
    setItems(newItems)

    // Close dropdown
    setProductoSugerencias(prev => ({ ...prev, [index]: [] }))
    setMostrarProductoDropdown(prev => ({ ...prev, [index]: false }))
  }, [items, setItems])

  return {
    listaProductos,
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
    handleDescripcionChange,
    seleccionarProducto,
  }
}
