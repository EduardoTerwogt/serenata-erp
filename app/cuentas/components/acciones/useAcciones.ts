'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiError, getJson, sendFormData } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'
import { clearPendingOperation } from '@/lib/client/pendingOperation'
import type { EstadoCuentaRespuesta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import type { PreviewCuentas } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { ProyectoSelector, SelectorProyectosRespuesta } from '@/lib/shared/cuentas/proyectos-selector-tipos'
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

export interface DatosFactura {
  contraparte_id?: string | null
  cuentas?: string[]
}

/** #130: proveedor nuevo con los datos mínimos; coincide con `FacturaCrearSchema.preparar.proveedor`. */
export interface ProveedorNuevoDatos {
  nombre: string
  rfc: string
  regimen_fiscal: 'moral' | 'fisica' | 'resico'
  telefono: string
  correo: string
  banco: string
  clabe: string
}

export interface GastoExtraDatos {
  proyecto_id: string
  concepto: string
  costo_total: number
}

export interface PrepararDatos {
  proveedor?: ProveedorNuevoDatos
  renglones?: string[]
  gasto?: GastoExtraDatos
}

export interface DatosGuardarFactura {
  operation_id: string
  contraparte_id?: string | null
  guardar_rfc?: boolean
  cuentas?: { id: string; monto_esperado: number }[]
  grupo_id?: string | null
  pago_id?: string | null
  preparar?: PrepararDatos
}

export interface FacturaGuardada {
  success: boolean
  estado_validacion?: string | null
  detalle_validacion?: string | null
  repetido?: boolean
  grupo?: { estado: string }
  /** #130: lo que `preparar` dejó listo (proveedor y grupo). */
  preparado?: { proveedor_id: string; grupo_id: string; proveedor_creado?: boolean }
  [k: string]: unknown
}

export interface DatosCompletarCliente {
  rfc?: string | null
  contacto?: string | null
  telefono?: string | null
  correo?: string | null
}

/** #130: completar la ficha de un cliente al facturarle por primera vez (RFC, contacto y constancia). */
export const accionesCliente = {
  completar(id: string, datos: DatosCompletarCliente, constancia: File | null) {
    const fd = new FormData()
    fd.set('datos', JSON.stringify(datos))
    if (constancia) fd.set('constancia', constancia)
    return sendFormData<{ cliente?: unknown }>(`/api/cuentas/clientes/${id}`, fd, 'No se pudo completar la ficha del cliente', { method: 'PATCH' })
  },
}

export interface FiltrosSelector {
  modo: 'renglones' | 'pago'
  lado?: LadoCuentas
  q: string
  contraparte?: string | null
  soloPendientes: boolean
}

/**
 * #130: proyectos del selector compartido (Subir factura y Registrar pago por proyecto), paginados de 25 en 25 por
 * SQL. Cambiar un filtro vuelve a la página 1 (con debounce y cancelación); `cargarMas` agrega la siguiente.
 */
export function useProyectosSelector(f: FiltrosSelector, activo: boolean) {
  const clave = `${f.modo}|${f.lado ?? ''}|${f.q.trim()}|${f.contraparte ?? ''}|${f.soloPendientes}`
  const [estado, setEstado] = useState<{ clave: string; proyectos: ProyectoSelector[]; total: number; page: number; error: string | null }>({ clave: '', proyectos: [], total: 0, page: 0, error: null })
  const [cargandoMas, setCargandoMas] = useState(false)

  const url = useCallback(
    (page: number) => {
      const sp = new URLSearchParams({ modo: f.modo, page: String(page), solo_pendientes: String(f.soloPendientes) })
      if (f.lado) sp.set('lado', f.lado)
      if (f.q.trim()) sp.set('q', f.q.trim())
      if (f.contraparte) sp.set('contraparte', f.contraparte)
      return `/api/cuentas/proyectos-selector?${sp.toString()}`
    },
    // `clave` resume los filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave]
  )

  useEffect(() => {
    if (!activo) return undefined
    const ac = new AbortController()
    const t = setTimeout(() => {
      getJson<SelectorProyectosRespuesta>(url(1), 'No se pudieron cargar los proyectos', { signal: ac.signal })
        .then((r) => setEstado({ clave, proyectos: r.proyectos, total: r.total, page: 1, error: null }))
        .catch((e) => {
          if (!ac.signal.aborted) setEstado({ clave, proyectos: [], total: 0, page: 0, error: e instanceof Error ? e.message : 'No se pudieron cargar los proyectos' })
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [activo, clave, url])

  const vigente = estado.clave === clave
  const proyectos = vigente ? estado.proyectos : []
  const cargarMas = useCallback(() => {
    if (!vigente || cargandoMas) return
    setCargandoMas(true)
    getJson<SelectorProyectosRespuesta>(url(estado.page + 1), 'No se pudieron cargar más proyectos')
      .then((r) => setEstado((e) => (e.clave === clave ? { ...e, proyectos: [...e.proyectos, ...r.proyectos], total: r.total, page: r.page } : e)))
      .catch((e) => setEstado((s) => (s.clave === clave ? { ...s, error: e instanceof Error ? e.message : 'No se pudieron cargar más proyectos' } : s)))
      .finally(() => setCargandoMas(false))
  }, [vigente, cargandoMas, url, estado.page, clave])

  return {
    proyectos,
    total: vigente ? estado.total : 0,
    error: vigente ? estado.error : null,
    cargando: activo && !vigente,
    cargandoMas,
    hayMas: vigente && proyectos.length < estado.total,
    cargarMas,
  }
}

export const accionesFactura = {
  /** Vista previa (no escribe nada, T9): clasifica el XML, propone contraparte y cuentas y devuelve el cuadre de SQL. */
  preview(xml: File, datos: DatosFactura, signal?: AbortSignal) {
    const fd = new FormData()
    fd.set('xml', xml)
    fd.set('datos', JSON.stringify({ contraparte_id: datos.contraparte_id ?? null, cuentas: datos.cuentas ?? [] }))
    return sendFormData<PreviewCuentas>('/api/cuentas/facturas/preview', fd, 'No se pudo leer el XML', { signal })
  },
  /** Confirma el alta; el PDF viaja con el XML (≤ 4 MB cada uno). El `operation_id` hace idempotente el reintento. */
  guardar(xml: File, pdf: File | null, datos: DatosGuardarFactura) {
    const fd = new FormData()
    fd.set('xml', xml)
    if (pdf) fd.set('pdf', pdf)
    fd.set('datos', JSON.stringify(datos))
    return sendFormData<FacturaGuardada>('/api/cuentas/facturas', fd, 'No se pudo guardar la factura')
  },
}
