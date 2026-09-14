'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CuentaCobrar, DocumentoCuentaCobrar, PagoComprobante } from '@/lib/types'
import { getJson, sendFormData } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

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

interface BuscarCuentasCobrarResponse {
  rows: CuentaCobrar[]
  total_rows: number
  total_monto_pendiente: number
  total_monto_pagado: number
  pendientes_count: number
}

// EF-3 3B-2: busqueda/paginacion/totales server-side via
// /api/cuentas-cobrar?search=&page=&pageSize= (RPC buscar_cuentas_cobrar).
// setBusqueda hace debounce de 300ms antes de disparar el fetch; cada
// fetch cancela el anterior via AbortController y lleva un numero de
// secuencia incremental -- una respuesta solo se aplica al estado si su
// secuencia coincide con la ultima emitida, para no pintar una respuesta
// atrasada que llego despues de una mas nueva pese al abort.
export function useCuentasCobrar() {
  const [cuentas, setCuentas] = useState<CuentaCobrar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusquedaState] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [totalRows, setTotalRows] = useState(0)
  const [totalMontoPendiente, setTotalMontoPendiente] = useState(0)
  const [totalMontoPagado, setTotalMontoPagado] = useState(0)
  const [pendientesCount, setPendientesCount] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }, [])

  const setBusqueda = useCallback((value: string) => {
    setBusquedaState(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBusquedaDebounced(value)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  const cargar = useCallback(async (search: string, pageArg: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++seqRef.current

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('page', String(pageArg))
      params.set('pageSize', String(PAGE_SIZE))
      const data = await getJson<BuscarCuentasCobrarResponse>(
        `/api/cuentas-cobrar?${params.toString()}`,
        'Error al cargar cuentas por cobrar',
        { signal: controller.signal }
      )
      if (seq !== seqRef.current) return
      setCuentas(data.rows)
      setTotalRows(data.total_rows)
      setTotalMontoPendiente(data.total_monto_pendiente)
      setTotalMontoPagado(data.total_monto_pagado)
      setPendientesCount(data.pendientes_count)
    } catch (err) {
      if (controller.signal.aborted || seq !== seqRef.current) return
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar(busquedaDebounced, page) }, [cargar, busquedaDebounced, page])

  const recargar = useCallback(() => cargar(busquedaDebounced, page), [cargar, busquedaDebounced, page])

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
    await recargar()
    return result
  }, [recargar])

  const subirComplemento = useCallback(async (id: string, xml: File, pdf: File, notas?: string) => {
    const formData = new FormData()
    formData.append('complemento_xml', xml)
    formData.append('complemento_pdf', pdf)
    if (notas) formData.append('notas', notas)

    const result = await sendFormData(`/api/cuentas-cobrar/${id}/subir-complemento`, formData, 'Error al subir complemento')
    await recargar()
    return result
  }, [recargar])

  const registrarPago = useCallback(async (
    id: string,
    data: { monto: number; tipo_pago: string; fecha_pago: string; notas?: string; comprobante?: File }
  ) => {
    // 1E-3c: mismo orquestador que useCuentasPagar -- fingerprint sobre el
    // comprobante ORIGINAL (antes de normalizar) + campos del formulario.
    const result = await runIdempotentPagoSubmit({
      scope: `registrar-pago:cuentas-cobrar:${id}`,
      dominio: 'cuentas-cobrar',
      cuentaId: id,
      fields: { monto: data.monto, tipo_pago: data.tipo_pago, fecha_pago: data.fecha_pago, notas: data.notas ?? null },
      comprobante: data.comprobante,
      normalize: normalizeComprobante,
      submit: async ({ operationId, comprobante }) => {
        const formData = new FormData()
        formData.append('monto', String(data.monto))
        formData.append('tipo_pago', data.tipo_pago)
        formData.append('fecha_pago', data.fecha_pago)
        if (data.notas) formData.append('notas', data.notas)
        if (comprobante) formData.append('comprobante', comprobante)
        formData.append('operation_id', operationId)
        return sendFormData(`/api/cuentas-cobrar/${id}/registrar-pago`, formData, 'Error al registrar pago')
      },
    })
    await recargar()
    return result
  }, [recargar])

  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  return useMemo(() => ({
    cuentas,
    loading,
    error,
    busqueda,
    setBusqueda,
    page,
    setPage,
    pageCount,
    totalRows,
    totalMontoPendiente,
    totalMontoPagado,
    pendientesCount,
    recargar,
    cargarDetalle,
    cargarAlertas,
    subirFactura,
    subirComplemento,
    registrarPago,
  }), [
    cuentas, loading, error, busqueda, setBusqueda, page, pageCount, totalRows,
    totalMontoPendiente, totalMontoPagado, pendientesCount, recargar,
    cargarDetalle, cargarAlertas, subirFactura, subirComplemento, registrarPago,
  ])
}
