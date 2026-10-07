'use client'

import { useEffect, useState } from 'react'
import { ApiError, getJson, sendFormData } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'
import { clearPendingOperation } from '@/lib/client/pendingOperation'
import type { EstadoCuentaRespuesta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { useGet } from '../ordenes/useOrdenes'

export interface ContraparteLista {
  id: string
  nombre: string
}

/** Estado de cuenta de un cliente o proveedor (una sola consulta, P15): alimenta las tres ventanas de Acciones. */
export const useEstadoCuenta = (lado: LadoCuentas, id: string | null) =>
  useGet<EstadoCuentaRespuesta>(id ? `/api/cuentas/estado-cuenta?lado=${lado}&id=${id}` : null, 'No se pudo cargar el estado de cuenta')

/** Proveedores activos (la ruta ya los entrega con columnas públicas); se filtran en el cliente. */
export function useProveedores(activo: boolean) {
  const [lista, setLista] = useState<ContraparteLista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!activo || lista) return undefined
    let vivo = true
    getJson<(ContraparteLista & { activo?: boolean })[]>('/api/proveedores', 'No se pudieron cargar los proveedores')
      .then((r) => vivo && setLista(r.filter((p) => p.activo !== false).map((p) => ({ id: p.id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron cargar los proveedores'))
    return () => {
      vivo = false
    }
  }, [activo, lista])
  return { lista, error }
}

/** Clientes por nombre (`GET /api/clientes?q=` admite la sección `cuentas`, T8); con debounce y cancelación. */
export function useBuscarClientes(q: string, activo: boolean) {
  const [estado, setEstado] = useState<{ q: string; lista: ContraparteLista[]; error: string | null }>({ q: '', lista: [], error: null })
  const buscado = q.trim()
  useEffect(() => {
    if (!activo || buscado === '') return undefined
    const ac = new AbortController()
    const t = setTimeout(() => {
      getJson<ContraparteLista[]>(`/api/clientes?q=${encodeURIComponent(buscado)}`, 'No se pudieron buscar los clientes', { signal: ac.signal })
        .then((lista) => setEstado({ q: buscado, lista, error: null }))
        .catch((e) => {
          if (!ac.signal.aborted) setEstado({ q: buscado, lista: [], error: e instanceof Error ? e.message : 'No se pudieron buscar los clientes' })
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [buscado, activo])
  const vigente = activo && buscado !== '' && estado.q === buscado
  return { lista: vigente ? estado.lista : [], error: vigente ? estado.error : null, buscando: activo && buscado !== '' && estado.q !== buscado }
}

export interface PagoEntrada {
  lado: LadoCuentas
  /** Contraparte del pago: solo da el alcance de la operación pendiente (una por cliente o proveedor). */
  contraparteId: string
  lineas: { id: string; monto: number; saldo_esperado: number }[]
  tipo_pago: string
  fecha_pago: string
  notas: string
  comprobante?: File
}

export interface PagoRegistrado {
  success: boolean
  resumen?: unknown
  pago?: { pago_id: string; comprobante_url: string | null }
}

export const accionesPago = {
  /**
   * `POST /api/cuentas/pagos`: una cabecera con N líneas; el comprobante viaja una sola vez (P16). Misma
   * idempotencia que el detalle (`runIdempotentPagoSubmit`: operación pendiente en el navegador + reconciliación).
   * Un rechazo definitivo del servidor (4xx, p. ej. `candidatos_cambiaron`) queda guardado bajo esa llave: se libera
   * la operación pendiente para que el siguiente intento, ya con los saldos nuevos, lleve una llave nueva.
   */
  async registrar(p: PagoEntrada): Promise<PagoRegistrado> {
    const scope = `registrar-pago:cuentas-pagos:${p.lado}:${p.contraparteId}`
    try {
      return (await runIdempotentPagoSubmit({
        scope,
        dominio: p.lado === 'cobro' ? 'cuentas-pagos-cobro' : 'cuentas-pagos-proveedor',
        cuentaId: p.contraparteId,
        fields: { lado: p.lado, lineas: p.lineas.map((l) => ({ id: l.id, monto: l.monto })), tipo_pago: p.tipo_pago, fecha_pago: p.fecha_pago, notas: p.notas.trim() },
        comprobante: p.comprobante,
        normalize: normalizeComprobante,
        submit: async ({ operationId, comprobante }) => {
          const fd = new FormData()
          fd.set(
            'datos',
            JSON.stringify({ lado: p.lado, lineas: p.lineas, tipo_pago: p.tipo_pago, fecha_pago: p.fecha_pago, notas: p.notas.trim() || null, operation_id: operationId })
          )
          if (comprobante) fd.set('comprobante', comprobante)
          return sendFormData<PagoRegistrado>('/api/cuentas/pagos', fd, 'No se pudo registrar el pago')
        },
      })) as PagoRegistrado
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) clearPendingOperation(scope)
      throw err
    }
  },
}
