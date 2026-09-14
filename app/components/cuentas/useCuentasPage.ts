'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrdenPago } from '@/lib/types'
import { useCuentasCobrar } from '@/app/components/cuentas/hooks/useCuentasCobrar'
import { useCuentasPagar } from '@/app/components/cuentas/hooks/useCuentasPagar'
import { useCuentasPorProyecto } from '@/app/components/cuentas/hooks/useCuentasPorProyecto'
import {
  AlertaCuentaCobrar,
  SelectedCuenta,
  Tab,
  Vista,
} from '@/app/components/cuentas/types'

export function useCuentasPage() {
  const [tab, setTab] = useState<Tab>('cobrar')
  const [vista, setVista] = useState<Vista>('proyecto')
  const [busqueda, setBusqueda] = useState('')
  const [selectedCuenta, setSelectedCuenta] = useState<SelectedCuenta | null>(null)
  const [showOrdenModal, setShowOrdenModal] = useState(false)
  const [alertas, setAlertas] = useState<AlertaCuentaCobrar[]>([])
  const [loadingAlertas, setLoadingAlertas] = useState(false)
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenPago[]>([])
  const [historialTotal, setHistorialTotal] = useState(0)
  const [historialPage, setHistorialPage] = useState(1)
  const alertasLoadedRef = useRef(false)
  const historialLoadedRef = useRef(false)

  const cobrarApi = useCuentasCobrar()
  const pagarApi = useCuentasPagar()
  const porProyectoApi = useCuentasPorProyecto()

  const { cuentas: cuentasCobrar, loading: loadingCobrar, recargar: recargarCobrar, cargarAlertas: fetchAlertas, pendientesCount: cuentasCobrarPendientes } = cobrarApi
  const { cuentas: cuentasPagar, loading: loadingPagar, recargar: recargarPagar, cargarHistorialOrdenes: fetchHistorialOrdenes, pendientesCount: cuentasPagarPendientes } = pagarApi
  const { recargar: recargarPorProyecto } = porProyectoApi

  const cargarAlertas = useCallback(async () => {
    setLoadingAlertas(true)

    try {
      const data = await fetchAlertas()
      setAlertas(data.alertas || [])
      alertasLoadedRef.current = true
    } catch {
      setAlertas([])
      alertasLoadedRef.current = false
    } finally {
      setLoadingAlertas(false)
    }
  }, [fetchAlertas])

  // EF-3 3B-11: el historial de órdenes ahora pagina server-side -- recibe
  // la página a cargar en vez de traer todas las órdenes.
  const cargarHistorialOrdenes = useCallback(async (page: number) => {
    try {
      const data = await fetchHistorialOrdenes(page)
      setHistorialOrdenes(data.ordenes || [])
      setHistorialTotal(data.total || 0)
      historialLoadedRef.current = true
    } catch {
      setHistorialOrdenes([])
      setHistorialTotal(0)
      historialLoadedRef.current = false
    }
  }, [fetchHistorialOrdenes])

  // Navegación imperativa del historial: fija la página y dispara el fetch
  // de inmediato -- separado del efecto de carga inicial (que solo corre
  // una vez por apertura del tab "pagar", gateado por historialLoadedRef)
  // para no refetchear en cada cambio de tab una vez ya cargado.
  const irAPaginaHistorial = useCallback((page: number) => {
    setHistorialPage(page)
    void cargarHistorialOrdenes(page)
  }, [cargarHistorialOrdenes])

  // Fase 2: Refresh selectivo — solo recarga la lista afectada, no ambas.
  // La vista "Por proyecto" (Bloque 3) sí se recarga siempre porque agrupa
  // ambas listas -- un cambio en cualquiera de las dos la deja desactualizada.
  const refreshCobrar = useCallback(async () => {
    await Promise.all([recargarCobrar(), recargarPorProyecto()])
    if (alertasLoadedRef.current) {
      alertasLoadedRef.current = false
      await cargarAlertas()
    }
  }, [recargarCobrar, cargarAlertas, recargarPorProyecto])

  const refreshPagar = useCallback(async () => {
    await Promise.all([recargarPagar(), recargarPorProyecto()])
  }, [recargarPagar, recargarPorProyecto])

  // refreshAll conservado para OrdenPagoModal que puede afectar ambas listas
  const refreshAll = useCallback(async () => {
    await Promise.all([recargarCobrar(), recargarPagar(), recargarPorProyecto()])

    if (tab === 'cobrar') {
      alertasLoadedRef.current = false
      await cargarAlertas()
    }

    if (tab === 'pagar') {
      historialLoadedRef.current = false
      await cargarHistorialOrdenes(historialPage)
    }
  }, [cargarAlertas, cargarHistorialOrdenes, historialPage, recargarCobrar, recargarPagar, recargarPorProyecto, tab])

  useEffect(() => {
    if (tab !== 'cobrar' || alertasLoadedRef.current) return
    void cargarAlertas()
  }, [cargarAlertas, tab])

  useEffect(() => {
    if (tab !== 'pagar' || historialLoadedRef.current) return
    void cargarHistorialOrdenes(1)
  }, [cargarHistorialOrdenes, tab])

  // EF-3 3B-2/3B-3: cuentasCobrar/cuentasPagar ya llegan filtradas/paginadas
  // por el servidor (busqueda propia de cobrarApi/pagarApi) -- solo se les
  // agrega el tag `tipo` para que calcen con SelectedCuenta.
  const cobrarFiltradas = useMemo<SelectedCuenta[]>(
    () => cuentasCobrar.map((cuenta) => ({ ...cuenta, tipo: 'cobrar' as const })),
    [cuentasCobrar]
  )
  const pagarFiltradas = useMemo<SelectedCuenta[]>(
    () => cuentasPagar.map((cuenta) => ({ ...cuenta, tipo: 'pagar' as const })),
    [cuentasPagar]
  )

  const totalPorCobrar = cobrarApi.totalMontoPendiente
  const totalCobrado = cobrarApi.totalMontoPagado
  const totalPorPagar = pagarApi.totalMontoPendiente
  const totalPagado = pagarApi.totalMontoPagado
  const loading = tab === 'cobrar' ? loadingCobrar : loadingPagar

  return {
    tab,
    setTab,
    vista,
    setVista,
    busqueda,
    setBusqueda,
    selectedCuenta,
    setSelectedCuenta,
    showOrdenModal,
    setShowOrdenModal,
    alertas,
    loadingAlertas,
    historialOrdenes,
    historialTotal,
    historialPage,
    irAPaginaHistorial,
    cobrarApi,
    pagarApi,
    porProyectoApi,
    refreshAll,
    refreshCobrar,
    refreshPagar,
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
