'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CuentaPagar, DocumentoCuentaPagar, OrdenPago, RegimenFiscal, HistorialCambioResponsableItem } from '@/lib/types'
import { getJson, sendFormData, sendJson } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'

const PAGE_SIZE = 50
export const HISTORIAL_PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

interface CuentaPagarDetalle {
  cuenta: CuentaPagar
  documentos: DocumentoCuentaPagar[]
  orden_pago?: OrdenPago | null
  proveedor?: { regimen_fiscal: RegimenFiscal | null } | null
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

interface BuscarCuentasPagarResponse {
  rows: CuentaPagar[]
  total_rows: number
  total_monto_pendiente: number
  total_monto_pagado: number
  pendientes_count: number
}

// EF-3 3B-3: busqueda/paginacion/totales server-side via
// /api/cuentas-pagar?search=&page=&pageSize= (RPC buscar_cuentas_pagar).
// Mismo mecanismo de debounce/AbortController/secuencia que
// useCuentasCobrar (3B-2): setBusqueda hace debounce de 300ms antes de
// disparar el fetch; cada fetch cancela el anterior via AbortController y
// lleva un numero de secuencia incremental -- una respuesta solo se aplica
// al estado si su secuencia coincide con la ultima emitida.
export function useCuentasPagar() {
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([])
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
      const data = await getJson<BuscarCuentasPagarResponse>(
        `/api/cuentas-pagar?${params.toString()}`,
        'Error al cargar cuentas por pagar',
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

  const subirFactura = useCallback(async (id: string, xml: File, pdf: File) => {
    const formData = new FormData()
    formData.append('factura_proveedor_xml', xml)
    formData.append('factura_proveedor_pdf', pdf)

    const result = await sendFormData(`/api/cuentas-pagar/${id}/subir-factura`, formData, 'Error al subir factura')
    await recargar()
    return result
  }, [recargar])

  const registrarPago = useCallback(async (
    id: string,
    data: { monto: number; comprobante?: File }
  ) => {
    // 1E-3b: fingerprint sobre el comprobante ORIGINAL (data.comprobante,
    // antes de normalizar) + persistencia en localStorage antes del fetch --
    // ver lib/client/pagoIdempotency.ts para el orden exacto y las reglas
    // de limpieza (createdNow/reusedExisting, nunca tras un error post-fetch).
    const result = await runIdempotentPagoSubmit({
      scope: `registrar-pago:cuentas-pagar:${id}`,
      dominio: 'cuentas-pagar',
      cuentaId: id,
      fields: { monto: data.monto },
      comprobante: data.comprobante,
      normalize: normalizeComprobante,
      submit: async ({ operationId, comprobante }) => {
        const formData = new FormData()
        formData.append('monto', String(data.monto))
        if (comprobante) formData.append('comprobante', comprobante)
        formData.append('operation_id', operationId)
        return sendFormData(`/api/cuentas-pagar/${id}/registrar-pago`, formData, 'Error al registrar pago')
      },
    })
    await recargar()
    return result
  }, [recargar])

  const generarOrdenPago = useCallback(async (): Promise<OrdenPagoResult> => {
    const data = await getJson<OrdenPagoResult>('/api/cuentas-pagar/generar-orden-pago', 'Error al generar orden de pago', {
      method: 'POST',
    })
    await recargar()
    return data
  }, [recargar])

  // EF-3 3B-11: la RPC buscar_ordenes_pago pagina el historial -- el
  // caller (useCuentasPage.ts) pasa la página actual, mismo pageSize fijo
  // que el resto de listas paginadas del módulo.
  const cargarHistorialOrdenes = useCallback(async (page: number): Promise<{ total: number; ordenes: OrdenPago[] }> => {
    return getJson(`/api/cuentas-pagar/ordenes-historial?page=${page}&pageSize=${HISTORIAL_PAGE_SIZE}`, 'Error al cargar historial')
  }, [])

  // Fase 5.3 Bloque 0 punto 2 / Bloque 3: reasignar responsable desde Cuentas
  // reusa el mismo endpoint que la reasignación en la partida del proyecto
  // (PATCH /api/items/:id) -- ahí vive la lógica de sincronizar
  // items_cotizacion + cuentas_pagar y de loguear el historial. Cuentas
  // nunca escribe directo a cuentas_pagar para esto, para no desincronizar.
  const reasignarResponsable = useCallback(async (itemId: string, responsableId: string, responsableNombre: string) => {
    const result = await sendJson(`/api/items/${itemId}`, { responsable_id: responsableId, responsable_nombre: responsableNombre }, 'Error al reasignar responsable', { method: 'PATCH' })
    await recargar()
    return result
  }, [recargar])

  const cargarHistorialResponsable = useCallback(async (cuentaId: string): Promise<{ historial: HistorialCambioResponsableItem[] }> => {
    return getJson(`/api/cuentas-pagar/${cuentaId}/historial-responsable`, 'Error al cargar historial de responsable')
  }, [])

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
    cargarPreviewOrdenPago,
    subirFactura,
    registrarPago,
    generarOrdenPago,
    cargarHistorialOrdenes,
    reasignarResponsable,
    cargarHistorialResponsable,
  }), [
    cuentas, loading, error, busqueda, setBusqueda, page, pageCount, totalRows,
    totalMontoPendiente, totalMontoPagado, pendientesCount, recargar,
    cargarDetalle, cargarPreviewOrdenPago, subirFactura, registrarPago,
    generarOrdenPago, cargarHistorialOrdenes, reasignarResponsable, cargarHistorialResponsable,
  ])
}
