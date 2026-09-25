'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJson, sendFormData, sendJson } from '@/lib/client/api'
import { normalizeComprobante } from '@/lib/client/normalizeComprobante'
import { runIdempotentPagoSubmit } from '@/lib/client/pagoIdempotency'
import type { DetalleConcepto } from '@/lib/shared/cuentas/detalle-tipos'
import type { CorreccionCuentas } from '@/lib/validation/schemas'

export type ObjetivoDetalle = { tipo: 'cobro' | 'grupo' | 'cuenta'; id: string }

/** 'c:<cuenta_cobrar>', 'g:<grupo>' o 's:<cuenta_pagar suelta>' (ConceptoVista.key). */
export function objetivoDeKey(key: string): ObjetivoDetalle | null {
  const [pref, id] = [key.slice(0, 2), key.slice(2)]
  if (!id) return null
  if (pref === 'c:') return { tipo: 'cobro', id }
  if (pref === 'g:') return { tipo: 'grupo', id }
  if (pref === 's:') return { tipo: 'cuenta', id }
  return null
}

const base = (o: ObjetivoDetalle) =>
  o.tipo === 'cobro' ? `/api/cuentas-cobrar/${o.id}` : o.tipo === 'grupo' ? `/api/cuentas-pagar/grupos/${o.id}` : `/api/cuentas-pagar/${o.id}`

/** Carga el detalle del concepto abierto; `recargar` después de cada acción. */
export function useDetalle(key: string | null) {
  const objetivo = key ? objetivoDeKey(key) : null
  const [version, setVersion] = useState(0)
  const clave = objetivo ? `${objetivo.tipo}:${objetivo.id}#${version}` : ''
  const [estado, setEstado] = useState<{ clave: string; detalle: DetalleConcepto | null; error: string | null }>({ clave: '', detalle: null, error: null })

  useEffect(() => {
    if (!objetivo) return undefined
    const ac = new AbortController()
    getJson<{ detalle: DetalleConcepto }>(`${base(objetivo)}/documentos`, 'No se pudo cargar el detalle', { signal: ac.signal })
      .then((r) => setEstado({ clave, detalle: r.detalle, error: null }))
      .catch((err) => {
        if (!ac.signal.aborted) setEstado((prev) => ({ clave, detalle: prev.detalle, error: err instanceof Error ? err.message : 'No se pudo cargar el detalle' }))
      })
    return () => ac.abort()
    // objetivo se deriva de `clave`: solo cambia cuando cambia la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return {
    objetivo,
    detalle: estado.clave === clave || (estado.detalle && objetivo && estado.detalle.id === objetivo.id) ? estado.detalle : null,
    error: estado.error,
    cargando: estado.clave !== clave,
    recargar,
  }
}

/** Acciones del detalle: todas pasan por las rutas y RPCs existentes. */
export const accionesDetalle = {
  /**
   * XML de la factura (se valida en el servidor). Con `motivo` reemplaza la
   * vigente validada (B7: admin con las cuentas reabiertas).
   */
  async subirFacturaXml(o: ObjetivoDetalle, xml: File, motivo?: string) {
    const fd = new FormData()
    fd.append(o.tipo === 'cobro' ? 'factura_xml' : 'factura_proveedor_xml', xml)
    if (motivo) fd.append('motivo', motivo)
    return sendFormData(`${base(o)}/subir-factura`, fd, 'No se pudo subir la factura')
  },

  /** PDF de la factura, en su propia petición (supuesto 15). */
  async subirFacturaPdf(o: ObjetivoDetalle, pdf: File) {
    const fd = new FormData()
    fd.append('tipo', o.tipo === 'cobro' ? 'FACTURA_PDF' : 'FACTURA_PROVEEDOR')
    fd.append('archivo', pdf)
    return sendFormData(`${base(o)}/documentos`, fd, 'No se pudo subir el PDF')
  },

  /** Complemento de un pago: XML o PDF, uno por petición (D16, D27, supuesto 15). */
  async subirComplemento(cobroId: string, pagoId: string, archivo: File, tipo: 'xml' | 'pdf') {
    const fd = new FormData()
    fd.append('pago_id', pagoId)
    fd.append(tipo === 'xml' ? 'complemento_xml' : 'complemento_pdf', archivo)
    return sendFormData(`/api/cuentas-cobrar/${cobroId}/subir-complemento`, fd, 'No se pudo subir el complemento')
  },

  /** Marca a mano la validación de un XML en revisión (D25). */
  async validarDocumento(o: ObjetivoDetalle, docId: string) {
    return sendJson(`${base(o)}/documentos/${docId}`, { estado_validacion: 'validado' }, 'No se pudo validar el documento', { method: 'PATCH' })
  },

  /** Indica PUE o PPD en una factura sin método (supuesto 4). */
  async indicarMetodo(cobroId: string, docId: string, metodo: 'PUE' | 'PPD') {
    return sendJson(`/api/cuentas-cobrar/${cobroId}/documentos/${docId}`, { metodo_pago_cfdi: metodo }, 'No se pudo guardar el método de pago', { method: 'PATCH' })
  },

  /** Registra un pago con la idempotencia vigente (1E-3b): mismo flujo que la UI anterior. */
  async registrarPago(o: ObjetivoDetalle, datos: { monto: number; tipo_pago: string; fecha_pago: string; notas: string; comprobante?: File }) {
    const dominio = o.tipo === 'cobro' ? 'cuentas-cobrar' : o.tipo === 'grupo' ? 'cuentas-pagar-grupos' : 'cuentas-pagar'
    return runIdempotentPagoSubmit({
      scope: `registrar-pago:${dominio}:${o.id}`,
      dominio,
      cuentaId: o.id,
      fields: { monto: datos.monto, tipo_pago: datos.tipo_pago, fecha_pago: datos.fecha_pago, notas: datos.notas },
      comprobante: datos.comprobante,
      normalize: normalizeComprobante,
      submit: async ({ operationId, comprobante }) => {
        const fd = new FormData()
        fd.append('monto', String(datos.monto))
        fd.append('tipo_pago', datos.tipo_pago)
        fd.append('fecha_pago', datos.fecha_pago)
        if (datos.notas.trim()) fd.append('notas', datos.notas.trim())
        if (comprobante) fd.append('comprobante', comprobante)
        fd.append('operation_id', operationId)
        return sendFormData(`${base(o)}/registrar-pago`, fd, 'No se pudo registrar el pago')
      },
    })
  },

  /** Adjunta el comprobante a un pago a proveedor ya registrado (supuesto 17). */
  async adjuntarComprobante(pagoId: string, archivo: File) {
    const fd = new FormData()
    fd.append('comprobante', await normalizeComprobante(archivo))
    return sendFormData(`/api/cuentas-pagar/pagos/${pagoId}/comprobante`, fd, 'No se pudo adjuntar el comprobante')
  },

  /** B7: una corrección (admin con las cuentas reabiertas); cada acción es una RPC atómica. */
  async corregir(c: CorreccionCuentas) {
    return sendJson('/api/cuentas/correcciones', c, 'No se pudo aplicar la corrección')
  },

  /** Reasigna el proveedor de un renglón con la ruta vigente de partidas (D21). */
  async reasignar(itemId: string, responsableId: string, responsableNombre: string) {
    return sendJson(`/api/items/${itemId}`, { responsable_id: responsableId, responsable_nombre: responsableNombre }, 'No se pudo reasignar el proveedor', { method: 'PATCH' })
  },
}
