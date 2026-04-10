'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CuentaPagar, DocumentoCuentaPagar, OrdenPago } from '@/lib/types'
import { getJson, sendFormData } from '@/lib/client/api'

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
      const data = await getJson<CuentaPagar[]>('/api/cuentas-pagar', 'Error al cargar cuentas por pagar')
      setCuentas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const cargarDetalle = useCallback(async (id: string): Promise<CuentaPagarDetalle | null> => {
    try {
      return await getJson<CuentaPagarDetalle>(`/api/cuentas-pagar/${id}/documentos`, 'Error al cargar detalle')
    } catch {
      return null
    }
  }, [])

  const cargarPreviewOrdenPago = useCallback(async (): Promise<OrdenPagoPreviewResult> => {
    return getJson('/api/cuentas-pagar/generar-orden-pago', 'Error al cargar preview de orden')
  }, [])

  const subirFactura = useCallback(async (id: string, archivo: File) => {
    const formData = new FormData()
    formData.append('factura_proveedor', archivo)

    const result = await sendFormData(`/api/cuentas-pagar/${id}/subir-factura`, formData, 'Error al subir factura')
    await cargar()
    return result
  }, [cargar])

  const registrarPago = useCallback(async (
    id: string,
    data: { monto: number; comprobante?: File }
  ) => {
    const formData = new FormData()
    formData.append('monto', String(data.monto))
    if (data.comprobante) formData.append('comprobante', data.comprobante)

    const result = await sendFormData(`/api/cuentas-pagar/${id}/registrar-pago`, formData, 'Error al registrar pago')
    await cargar()
    return result
  }, [cargar])

  const generarOrdenPago = useCallback(async (): Promise<OrdenPagoResult> => {
    const data = await getJson<OrdenPagoResult>('/api/cuentas-pagar/generar-orden-pago', 'Error al generar orden de pago', {
      method: 'POST',
    })
    await cargar()
    return data
  }, [cargar])

  const cargarHistorialOrdenes = useCallback(async (): Promise<{ total: number; ordenes: OrdenPago[] }> => {
    return getJson('/api/cuentas-pagar/ordenes-historial', 'Error al cargar historial')
  }, [])

  return useMemo(() => ({
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
  }), [cuentas, loading, error, cargar, cargarDetalle, cargarPreviewOrdenPago, subirFactura, registrarPago, generarOrdenPago, cargarHistorialOrdenes])
}
