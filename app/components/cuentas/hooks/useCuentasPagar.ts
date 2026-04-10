'use client'

import { useState, useEffect, useCallback } from 'react'
import { CuentaPagar, DocumentoCuentaPagar, OrdenPago } from '@/lib/types'

interface CuentaPagarDetalle {
  cuenta: CuentaPagar
  documentos: DocumentoCuentaPagar[]
  orden_pago?: OrdenPago | null
  resumen: { monto_pagado: number; saldo_pendiente: number }
}

interface OrdenPagoPreviewResult {
  responsables: {
    responsable: {
      id: string
      nombre: string
      correo: string | null
      telefono: string | null
      banco: string | null
      clabe: string | null
    }
    eventos: {
      cotizacion_folio: string
      proyecto: string
      items: {
        descripcion: string
        cantidad: number
        monto: number
        cuenta_id: string
      }[]
      subtotal: number
    }[]
    total_responsable: number
  }[]
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
  }
  cuentas_ids: string[]
}

interface OrdenPagoResult {
  success: boolean
  orden_pago: {
    id: string
    fecha_generacion: string
    pdf_url: string
    pdf_nombre: string
    total_monto: number
    cantidad_cuentas: number
  }
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
  }
}

export function useCuentasPagar() {
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cuentas-pagar')
      if (!res.ok) throw new Error('Error al cargar cuentas por pagar')
      const data = await res.json()
      setCuentas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarDetalle = async (id: string): Promise<CuentaPagarDetalle | null> => {
    try {
      const res = await fetch(`/api/cuentas-pagar/${id}/documentos`)
      if (!res.ok) throw new Error('Error al cargar detalle')
      return await res.json()
    } catch {
      return null
    }
  }

  const cargarPreviewOrdenPago = async (): Promise<OrdenPagoPreviewResult> => {
    const res = await fetch('/api/cuentas-pagar/generar-orden-pago')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar preview de orden')
    return data
  }

  const subirFactura = async (id: string, archivo: File) => {
    const formData = new FormData()
    formData.append('factura_proveedor', archivo)

    const res = await fetch(`/api/cuentas-pagar/${id}/subir-factura`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Error al subir factura')
    }
    await cargar()
    return res.json()
  }

  const registrarPago = async (
    id: string,
    data: { monto: number; comprobante?: File }
  ) => {
    const formData = new FormData()
    formData.append('monto', String(data.monto))
    if (data.comprobante) formData.append('comprobante', data.comprobante)

    const res = await fetch(`/api/cuentas-pagar/${id}/registrar-pago`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const respData = await res.json()
      throw new Error(respData.error || 'Error al registrar pago')
    }
    await cargar()
    return res.json()
  }

  const generarOrdenPago = async (): Promise<OrdenPagoResult> => {
    const res = await fetch('/api/cuentas-pagar/generar-orden-pago', {
      method: 'POST',
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Error al generar orden de pago')
    }
    await cargar()
    return data
  }

  const cargarHistorialOrdenes = async (): Promise<{ total: number; ordenes: OrdenPago[] }> => {
    const res = await fetch('/api/cuentas-pagar/ordenes-historial')
    if (!res.ok) throw new Error('Error al cargar historial')
    return res.json()
  }

  return {
    cuentas,
    loading,
    error,
    recargar: cargar,
    cargarDetalle,
    cargarPreviewOrdenPago,
    subirFactura,
    registrarPago,
    generarOrdenPago,
    cargarHistorialOrdenes,
  }
}
