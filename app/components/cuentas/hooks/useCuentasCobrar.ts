'use client'

import { useState, useEffect, useCallback } from 'react'
import { CuentaCobrar, DocumentoCuentaCobrar, PagoComprobante } from '@/lib/types'

interface CuentaDetalle {
  cuenta: CuentaCobrar
  documentos: DocumentoCuentaCobrar[]
  pagos: PagoComprobante[]
  resumen: { total_pagado: number; saldo_pendiente: number }
}

export function useCuentasCobrar() {
  const [cuentas, setCuentas] = useState<CuentaCobrar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cuentas-cobrar')
      if (!res.ok) throw new Error('Error al cargar cuentas por cobrar')
      const data = await res.json()
      setCuentas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarDetalle = async (id: string): Promise<CuentaDetalle | null> => {
    try {
      const res = await fetch(`/api/cuentas-cobrar/${id}/documentos`)
      if (!res.ok) throw new Error('Error al cargar detalle')
      return await res.json()
    } catch {
      return null
    }
  }

  const subirFactura = async (id: string, xml: File, pdf?: File) => {
    const formData = new FormData()
    formData.append('factura_xml', xml)
    if (pdf) formData.append('factura_pdf', pdf)

    const res = await fetch(`/api/cuentas-cobrar/${id}/subir-factura`, {
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

  const subirComplemento = async (id: string, xml: File, notas?: string) => {
    const formData = new FormData()
    formData.append('complemento_xml', xml)
    if (notas) formData.append('notas', notas)

    const res = await fetch(`/api/cuentas-cobrar/${id}/subir-complemento`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Error al subir complemento')
    }
    await cargar()
    return res.json()
  }

  const registrarPago = async (
    id: string,
    data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }
  ) => {
    const formData = new FormData()
    formData.append('monto', String(data.monto))
    formData.append('tipo_pago', data.tipo_pago)
    formData.append('fecha_pago', data.fecha_pago)
    if (data.notas) formData.append('notas', data.notas)
    if (data.comprobante) formData.append('comprobante', data.comprobante)

    const res = await fetch(`/api/cuentas-cobrar/${id}/registrar-pago`, {
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

  return {
    cuentas,
    loading,
    error,
    recargar: cargar,
    cargarDetalle,
    subirFactura,
    subirComplemento,
    registrarPago,
  }
}
