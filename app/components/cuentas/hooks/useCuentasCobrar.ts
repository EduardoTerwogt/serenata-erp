'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CuentaCobrar, DocumentoCuentaCobrar, PagoComprobante } from '@/lib/types'
import { getJson, sendFormData } from '@/lib/client/api'

interface CuentaDetalle {
  cuenta: CuentaCobrar
  documentos: DocumentoCuentaCobrar[]
  pagos: PagoComprobante[]
  resumen: { total_pagado: number; saldo_pendiente: number }
}

interface AlertaCuentaCobrar {
  id: string
  folio?: string
  cliente: string
  proyecto: string
  monto_total: number
  monto_pagado: number
  saldo_pendiente: number
  fecha_vencimiento?: string
  dias_faltantes: number
  estado: string
  alerta: 'VENCIDA' | 'POR_VENCER'
  mensaje: string
}

export function useCuentasCobrar() {
  const [cuentas, setCuentas] = useState<CuentaCobrar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<CuentaCobrar[]>('/api/cuentas-cobrar', 'Error al cargar cuentas por cobrar')
      setCuentas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const cargarDetalle = useCallback(async (id: string): Promise<CuentaDetalle | null> => {
    try {
      return await getJson<CuentaDetalle>(`/api/cuentas-cobrar/${id}/documentos`, 'Error al cargar detalle')
    } catch {
      return null
    }
  }, [])

  const cargarAlertas = useCallback(async (): Promise<{ total_alertas: number; alertas: AlertaCuentaCobrar[] }> => {
    return getJson('/api/cuentas-cobrar/alertas', 'Error al cargar alertas')
  }, [])

  const subirFactura = useCallback(async (id: string, xml: File, pdf?: File) => {
    const formData = new FormData()
    formData.append('factura_xml', xml)
    if (pdf) formData.append('factura_pdf', pdf)

    const result = await sendFormData(`/api/cuentas-cobrar/${id}/subir-factura`, formData, 'Error al subir factura')
    await cargar()
    return result
  }, [cargar])

  const subirComplemento = useCallback(async (id: string, xml: File, pdf: File, notas?: string) => {
    const formData = new FormData()
    formData.append('complemento_xml', xml)
    formData.append('complemento_pdf', pdf)
    if (notas) formData.append('notas', notas)

    const result = await sendFormData(`/api/cuentas-cobrar/${id}/subir-complemento`, formData, 'Error al subir complemento')
    await cargar()
    return result
  }, [cargar])

  const registrarPago = useCallback(async (
    id: string,
    data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }
  ) => {
    const formData = new FormData()
    formData.append('monto', String(data.monto))
    formData.append('tipo_pago', data.tipo_pago)
    formData.append('fecha_pago', data.fecha_pago)
    if (data.notas) formData.append('notas', data.notas)
    if (data.comprobante) formData.append('comprobante', data.comprobante)

    const result = await sendFormData(`/api/cuentas-cobrar/${id}/registrar-pago`, formData, 'Error al registrar pago')
    await cargar()
    return result
  }, [cargar])

  return useMemo(() => ({
    cuentas,
    loading,
    error,
    recargar: cargar,
    cargarDetalle,
    cargarAlertas,
    subirFactura,
    subirComplemento,
    registrarPago,
  }), [cuentas, loading, error, cargar, cargarDetalle, cargarAlertas, subirFactura, subirComplemento, registrarPago])
}
