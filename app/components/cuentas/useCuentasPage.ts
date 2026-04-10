'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrdenPago } from '@/lib/types'
import { useCuentasCobrar } from '@/app/components/cuentas/hooks/useCuentasCobrar'
import { useCuentasPagar } from '@/app/components/cuentas/hooks/useCuentasPagar'
import { AlertaCuentaCobrar, SelectedCuenta, Tab } from '@/app/components/cuentas/types'

export function useCuentasPage() {
  const [tab, setTab] = useState<Tab>('cobrar')
  const [busqueda, setBusqueda] = useState('')
  const [selectedCuenta, setSelectedCuenta] = useState<SelectedCuenta | null>(null)
  const [showOrdenModal, setShowOrdenModal] = useState(false)
  const [alertas, setAlertas] = useState<AlertaCuentaCobrar[]>([])
  const [loadingAlertas, setLoadingAlertas] = useState(false)
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenPago[]>([])
  const alertasLoadedRef = useRef(false)
  const historialLoadedRef = useRef(false)

  const cobrarApi = useCuentasCobrar()
  const pagarApi = useCuentasPagar()

  const cargarAlertas = useCallback(async () => {
    setLoadingAlertas(true)

    try {
      const res = await fetch('/api/cuentas-cobrar/alertas')
      if (!res.ok) throw new Error('Error cargando alertas')
      const data = await res.json()
      setAlertas(data.alertas || [])
      alertasLoadedRef.current = true
    } catch {
      setAlertas([])
      alertasLoadedRef.current = false
    } finally {
      setLoadingAlertas(false)
    }
  }, [])

  const cargarHistorialOrdenes = useCallback(async () => {
    try {
      const res = await fetch('/api/cuentas-pagar/ordenes-historial')
      if (!res.ok) throw new Error('Error cargando historial')
      const data = await res.json()
      setHistorialOrdenes(data.ordenes || [])
      historialLoadedRef.current = true
    } catch {
      setHistorialOrdenes([])
      historialLoadedRef.current = false
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([cobrarApi.recargar(), pagarApi.recargar()])

    if (tab === 'cobrar') {
      alertasLoadedRef.current = false
      await cargarAlertas()
    }

    if (tab === 'pagar') {
      historialLoadedRef.current = false
      await cargarHistorialOrdenes()
    }
  }, [cargarAlertas, cargarHistorialOrdenes, cobrarApi.recargar, pagarApi.recargar, tab])

  useEffect(() => {
    if (tab !== 'cobrar' || alertasLoadedRef.current) return
    void cargarAlertas()
  }, [cargarAlertas, tab])

  useEffect(() => {
    if (tab !== 'pagar' || historialLoadedRef.current) return
    void cargarHistorialOrdenes()
  }, [cargarHistorialOrdenes, tab])

  const term = busqueda.toLowerCase().trim()

  const cobrarFiltradas = useMemo(() => {
    return (term
      ? cobrarApi.cuentas.filter((cuenta) =>
          cuenta.cotizacion_id.toLowerCase().includes(term) ||
          (cuenta.folio || '').toLowerCase().includes(term) ||
          cuenta.cliente.toLowerCase().includes(term) ||
          cuenta.proyecto.toLowerCase().includes(term)
        )
      : cobrarApi.cuentas
    ).map((cuenta) => ({ ...cuenta, tipo: 'cobrar' as const }))
  }, [cobrarApi.cuentas, term])

  const pagarFiltradas = useMemo(() => {
    return (term
      ? pagarApi.cuentas.filter((cuenta) =>
          cuenta.cotizacion_id.toLowerCase().includes(term) ||
          (cuenta.folio || '').toLowerCase().includes(term) ||
          (cuenta.responsable_nombre || '').toLowerCase().includes(term) ||
          (cuenta.proyecto_nombre || '').toLowerCase().includes(term) ||
          (cuenta.item_descripcion || '').toLowerCase().includes(term)
        )
      : pagarApi.cuentas
    ).map((cuenta) => ({ ...cuenta, tipo: 'pagar' as const }))
  }, [pagarApi.cuentas, term])

  const totalPorCobrar = cobrarFiltradas.reduce((sum, cuenta) => sum + Math.max(0, cuenta.monto_total - Number(cuenta.monto_pagado || 0)), 0)
  const totalCobrado = cobrarFiltradas.reduce((sum, cuenta) => sum + Number(cuenta.monto_pagado || 0), 0)
  const totalPorPagar = pagarFiltradas.reduce((sum, cuenta) => sum + Math.max(0, cuenta.x_pagar - Number(cuenta.monto_pagado || 0)), 0)
  const totalPagado = pagarFiltradas.reduce((sum, cuenta) => sum + Number(cuenta.monto_pagado || 0), 0)
  const cuentasCobrarPendientes = useMemo(
    () => cobrarApi.cuentas.filter(c => c.estado !== 'PAGADO').length,
    [cobrarApi.cuentas]
  )
  const cuentasPagarPendientes = useMemo(
    () => pagarApi.cuentas.filter(c => c.estado !== 'PAGADO').length,
    [pagarApi.cuentas]
  )

  const loading = tab === 'cobrar' ? cobrarApi.loading : pagarApi.loading

  return {
    tab,
    setTab,
    busqueda,
    setBusqueda,
    selectedCuenta,
    setSelectedCuenta,
    showOrdenModal,
    setShowOrdenModal,
    alertas,
    loadingAlertas,
    historialOrdenes,
    cobrarApi,
    pagarApi,
    refreshAll,
    cobrarFiltradas,
    pagarFiltradas,
    totalPorCobrar,
    totalCobrado,
    totalPorPagar,
    totalPagado,
    cuentasCobrarPendientes,
    cuentasPagarPendientes,
    loading,
  }
}
