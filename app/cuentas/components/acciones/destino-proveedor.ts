/**
 * #130: lo que el usuario decide al subir la factura de un proveedor, y cómo se convierte en la petición. Puro (sin
 * React ni red) para probar las reglas: la validación de verdad vive en Zod y en SQL; aquí solo se evita mandar un envío
 * que se sabe incompleto y se arma el cuerpo de `POST /api/cuentas/facturas`.
 */
import type { EmisorPreview } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { DatosGuardarFactura, GastoExtraDatos, ProveedorNuevoDatos } from './useAcciones'

export type ModoDestino = 'grupo' | 'renglones' | 'gasto'

export interface AltaForm {
  telefono: string
  correo: string
  banco: string
  clabe: string
}

export const ALTA_VACIA: AltaForm = { telefono: '', correo: '', banco: '', clabe: '' }

export interface GastoForm {
  proyecto_id: string | null
  proyecto: string | null
  concepto: string
  /** Texto del campo; se convierte a número al armar la petición. */
  costo: string
}

export interface DestinoProveedor {
  modo: ModoDestino
  /** Grupo (proyecto) elegido de la lista del proveedor, como hoy. */
  grupoId: string | null
  /** Cuentas por pagar (renglones) elegidas, todas de un solo proyecto (P10). */
  renglones: string[]
  proyectoRenglones: string | null
  gasto: GastoForm
  /** El emisor no existe: se da de alta con los datos del XML más `alta`. */
  nuevo: boolean
  alta: AltaForm
}

export const destinoInicial = (): DestinoProveedor => ({
  modo: 'grupo',
  grupoId: null,
  renglones: [],
  proyectoRenglones: null,
  gasto: { proyecto_id: null, proyecto: null, concepto: '', costo: '' },
  nuevo: false,
  alta: ALTA_VACIA,
})

export const clabeLimpia = (s: string) => s.replace(/\s/g, '')

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Mismas reglas que `FacturaCrearSchema.preparar.proveedor` y que la RPC. Vacío = sin error (aún no se captura). */
export function erroresAlta(a: AltaForm): Partial<Record<keyof AltaForm, string>> {
  const e: Partial<Record<keyof AltaForm, string>> = {}
  if (a.correo.trim() !== '' && !CORREO.test(a.correo.trim())) e.correo = 'Correo inválido'
  if (a.clabe.trim() !== '' && !/^\d{18}$/.test(clabeLimpia(a.clabe))) e.clabe = 'La CLABE debe tener 18 dígitos'
  return e
}

/** El proveedor nuevo completo, o null si falta algo: datos del XML (RFC, nombre, régimen) y los cuatro capturados. */
export function proveedorNuevo(emisor: EmisorPreview | null, a: AltaForm): ProveedorNuevoDatos | null {
  if (!emisor?.rfc || !emisor.nombre || !emisor.regimen_sugerido) return null
  if (Object.keys(erroresAlta(a)).length > 0) return null
  if ([a.telefono, a.correo, a.banco, a.clabe].some((v) => v.trim() === '')) return null
  return {
    nombre: emisor.nombre,
    rfc: emisor.rfc,
    regimen_fiscal: emisor.regimen_sugerido,
    telefono: a.telefono.trim(),
    correo: a.correo.trim(),
    banco: a.banco.trim(),
    clabe: clabeLimpia(a.clabe),
  }
}

/** Monto escrito por el usuario ("5,800.00", "5800") → número positivo con centavos, o null. */
export function montoDeTexto(texto: string): number | null {
  const limpio = texto.replace(/[,\s$]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null
  const n = Number(limpio)
  return n > 0 ? n : null
}

export type CuerpoProveedor = Pick<DatosGuardarFactura, 'contraparte_id' | 'grupo_id' | 'preparar'>

export interface ContextoProveedor {
  /** Proveedor existente (por RFC o elegido); null cuando es nuevo. */
  contraparteId: string | null
  emisor: EmisorPreview | null
}

/** Qué falta (para el pie de la ventana) o el cuerpo que se manda. */
export function armarProveedor(d: DestinoProveedor, ctx: ContextoProveedor): { ok: true; cuerpo: CuerpoProveedor } | { ok: false; falta: string } {
  let proveedor: ProveedorNuevoDatos | undefined
  if (d.nuevo) {
    const p = proveedorNuevo(ctx.emisor, d.alta)
    if (!p) return { ok: false, falta: 'Completa los datos del proveedor' }
    proveedor = p
  } else if (!ctx.contraparteId) {
    return { ok: false, falta: 'Elige al proveedor' }
  }
  const contraparte_id = d.nuevo ? null : ctx.contraparteId

  if (d.modo === 'grupo') {
    if (d.nuevo) return { ok: false, falta: 'Un proveedor nuevo no tiene proyectos: asigna conceptos o registra un gasto extra' }
    if (!d.grupoId) return { ok: false, falta: 'Elige el proyecto al que corresponde la factura' }
    return { ok: true, cuerpo: { contraparte_id, grupo_id: d.grupoId } }
  }
  if (d.modo === 'renglones') {
    if (d.renglones.length === 0) return { ok: false, falta: 'Elige los conceptos que cubre la factura' }
    return { ok: true, cuerpo: { contraparte_id, preparar: { proveedor, renglones: d.renglones } } }
  }
  const costo = montoDeTexto(d.gasto.costo)
  if (!d.gasto.proyecto_id) return { ok: false, falta: 'Elige el proyecto del gasto' }
  if (d.gasto.concepto.trim() === '') return { ok: false, falta: 'Escribe el concepto del gasto' }
  if (costo === null) return { ok: false, falta: 'Escribe el costo neto del gasto' }
  const gasto: GastoExtraDatos = { proyecto_id: d.gasto.proyecto_id, concepto: d.gasto.concepto.trim(), costo_total: costo }
  return { ok: true, cuerpo: { contraparte_id, preparar: { proveedor, gasto } } }
}
