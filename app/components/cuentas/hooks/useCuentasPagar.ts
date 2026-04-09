'use client'

import { useState, useEffect, useCallback } from 'react'
import { CuentaPagar, DocumentoCuentaPagar, OrdenPago } from '@/lib/types'

interface CuentaPagarDetalle {
  cuenta: CuentaPagar
  documentos: DocumentoCuentaPagar[]
  resumen: { monto_pagado: number; saldo_pendiente: number }
}

interface OrdenPagoResult {
  orden_pago: OrdenPago
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
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Error al generar orden de pago')
    }
    await cargar()
    return res.json()
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
    subirFactura,
    registrarPago,
    generarOrdenPago,
    cargarHistorialOrdenes,
  }
}
