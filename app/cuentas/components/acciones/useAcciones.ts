'use client'

import type { ArchivoPendienteInfo } from '@/lib/shared/cuentas/archivo-pendiente'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, getJson, sendFormData, sendJson } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'
import { clearPendingOperation } from '@/lib/client/pendingOperation'
import type { EstadoCuentaRespuesta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import type { PreviewCuentas } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { ProyectoSelector, SelectorProyectosRespuesta } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import type { ContrapartesPendientes, PendienteContraparte } from '@/lib/shared/cuentas/contrapartes-tipos'
import { useGet } from '../ordenes/useOrdenes'

export interface ContraparteLista {
  id: string
  nombre: string
}

/** Estado de cuenta de un cliente o proveedor (una sola consulta, P15): alimenta las tres ventanas de Acciones. `proyectos` lo limita a esos proyectos (pago por proyecto, #130). */
export const useEstadoCuenta = (lado: LadoCuentas, id: string | null, proyectos?: string[]) =>
  useGet<EstadoCuentaRespuesta>(
    id ? `/api/cuentas/estado-cuenta?lado=${lado}&id=${id}${proyectos?.length ? `&proyectos=${encodeURIComponent(proyectos.join(','))}` : ''}` : null,
    'No se pudo cargar el estado de cuenta'
  )

/**
 * #131: contrapartes del desplegable (`GET /api/cuentas/contrapartes`): las que tienen algo `pendiente` (factura,
 * complemento o saldo) o `todos`. SQL filtra por nombre y trae hasta 50; con debounce y cancelación mientras se escribe.
 */
export function useContrapartes(lado: LadoCuentas, pendiente: PendienteContraparte, q: string, activo: boolean) {
  const buscado = q.trim()
  const clave = `${lado}|${pendiente}|${buscado}`
  const [estado, setEstado] = useState<{ clave: string; datos: ContrapartesPendientes | null; error: string | null }>({ clave: '', datos: null, error: null })
  useEffect(() => {
    if (!activo) return undefined
    const ac = new AbortController()
    const t = setTimeout(
      () => {
        const sp = new URLSearchParams({ lado, pendiente })
        if (buscado) sp.set('q', buscado)
        getJson<ContrapartesPendientes>(`/api/cuentas/contrapartes?${sp.toString()}`, 'No se pudieron cargar los datos', { signal: ac.signal })
          .then((datos) => setEstado({ clave, datos, error: null }))
          .catch((e) => {
            if (!ac.signal.aborted) setEstado({ clave, datos: null, error: e instanceof Error ? e.message : 'No se pudieron cargar los datos' })
          })
      },
      buscado ? 250 : 0
    )
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [activo, clave, lado, pendiente, buscado])
  const vigente = estado.clave === clave
  return {
    lista: vigente ? (estado.datos?.contrapartes ?? []) : [],
    total: vigente ? (estado.datos?.total ?? 0) : 0,
    error: vigente ? estado.error : null,
    cargando: activo && !vigente,
  }
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
  /** #131: la factura quedó guardada pero estos archivos no llegaron a Drive; se reenvían con `reintentarSubida`. */
  archivos_pendientes?: ArchivoPendienteInfo[]
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

/** #131: sube a Drive el archivo de un documento que quedó pendiente (la factura no se repite). */
export const reintentarSubida = (p: { lado: ArchivoPendienteInfo['lado']; id: string; archivo: File }) => {
  const fd = new FormData()
  fd.set('lado', p.lado)
  fd.set('archivo', p.archivo)
  return sendFormData<{ success: boolean; pendiente: boolean }>(`/api/cuentas/documentos/${p.id}/reintentar-subida`, fd, 'No se pudo subir el archivo a Drive')
}

/** #140: `POST /api/cuentas/proveedores/asignar` — conceptos sin proveedor a uno existente (`proveedor_id`) o nuevo (`proveedor`). */
export interface AsignarDatos {
  operation_id: string
  proveedor_id?: string | null
  proveedor?: ProveedorNuevoDatos
  renglones: string[]
}
export const accionesAsignar = {
  asignar: (d: AsignarDatos) => sendJson<{ proveedor_id: string; proveedor_nombre: string; reasignados: number }>('/api/cuentas/proveedores/asignar', d, 'No se pudo asignar el proveedor'),
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
