/**
 * #130: lo que el usuario decide al subir la factura de un proveedor, y cómo se convierte en la petición. Puro (sin
 * React ni red) para probar las reglas: la validación de verdad vive en Zod y en SQL; aquí solo se evita mandar un envío
 * que se sabe incompleto y se arma el cuerpo de `POST /api/cuentas/facturas`.
 */
import type { EmisorPreview } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
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
  concepto: string
  /** Texto del campo; se convierte a número al armar la petición. */
  costo: string
}

/** El proyecto de la factura: basta su id y nombre; sus conceptos los lee `ConceptosProyecto`. */
export interface ProyectoRef {
  proyecto_id: string
  proyecto: string | null
}

/** El proyecto que la pantalla propone al leer el XML y por qué (se muestra marcado; el usuario puede desmarcarlo o elegir otro). */
export interface ProyectoSugerido {
  ref: ProyectoRef
  motivo: string
}

export interface DestinoProveedor {
  /** `renglones` (conceptos del proyecto) o `gasto`; `grupo` solo lo deduce `modoEfectivo`. */
  modo: ModoDestino
  /** Grupo abierto del proveedor cuando lo marcado es exactamente ese grupo (`grupoExacto`). */
  grupoId: string | null
  /** Proyecto de la factura (P10: una factura de proveedor es de un solo proyecto). */
  proyecto: ProyectoRef | null
  /** Lo que se propuso (#131); `proyecto` es lo elegido, que puede ser esto, otro proyecto o nada. */
  sugerido: ProyectoSugerido | null
  /** Cuentas por pagar (conceptos) marcadas, todas de `proyecto`. */
  renglones: string[]
  /** Ya se hizo la marca inicial de los conceptos de este proyecto (no se repite al volver a cargarlos). */
  marcado: boolean
  gasto: GastoForm
  /** El emisor no existe: se da de alta con los datos del XML más `alta`. */
  nuevo: boolean
  alta: AltaForm
}

export const destinoInicial = (): DestinoProveedor => ({
  modo: 'renglones',
  grupoId: null,
  proyecto: null,
  sugerido: null,
  renglones: [],
  marcado: false,
  gasto: { concepto: '', costo: '' },
  nuevo: false,
  alta: ALTA_VACIA,
})

/** Lo marcado es justo el grupo abierto del proveedor: la factura se liga a ese grupo sin reasignar nada. */
export const modoEfectivo = (d: DestinoProveedor): ModoDestino => (d.modo === 'renglones' && d.grupoId && !d.nuevo ? 'grupo' : d.modo)

/** Conceptos del proveedor en el proyecto que se pueden facturar: ya son suyos y no están bloqueados. */
const propios = (rs: RenglonSelector[], proveedorId: string | null) => rs.filter((r) => proveedorId !== null && r.responsable_id === proveedorId)

/** Id del grupo abierto del proveedor si `marcados` son exactamente sus conceptos en ese grupo; si no, null. */
export function grupoExacto(rs: RenglonSelector[], marcados: string[], proveedorId: string | null): string | null {
  const suyos = propios(rs, proveedorId)
  const grupos = new Set(suyos.map((r) => r.grupo_id))
  if (marcados.length === 0 || grupos.size !== 1) return null
  const grupo = Array.from(grupos)[0]
  if (!grupo || suyos.some((r) => r.grupo_estado !== 'ABIERTO' || r.bloqueado)) return null
  return suyos.length === marcados.length && suyos.every((r) => marcados.includes(r.cuenta_id)) ? grupo : null
}

/** Marca inicial al abrir un proyecto: lo que propone el neto del XML, o si no, lo que ya es del proveedor. */
export function marcaInicial(rs: RenglonSelector[], proveedorId: string | null, propuesta: string[] | null): string[] {
  const existentes = new Set(rs.map((r) => r.cuenta_id))
  if (propuesta && propuesta.length > 0 && propuesta.every((id) => existentes.has(id))) return propuesta
  return propios(rs, proveedorId)
    .filter((r) => !r.bloqueado)
    .map((r) => r.cuenta_id)
}

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
  if (!d.proyecto) return { ok: false, falta: 'Elige el proyecto al que corresponde la factura' }

  const modo = modoEfectivo(d)
  if (modo === 'grupo') return { ok: true, cuerpo: { contraparte_id, grupo_id: d.grupoId } }
  if (modo === 'renglones') {
    if (d.renglones.length === 0) return { ok: false, falta: 'Elige los conceptos que cubre la factura' }
    return { ok: true, cuerpo: { contraparte_id, preparar: { proveedor, renglones: d.renglones } } }
  }
  const costo = montoDeTexto(d.gasto.costo)
  if (d.gasto.concepto.trim() === '') return { ok: false, falta: 'Escribe el concepto del gasto' }
  if (costo === null) return { ok: false, falta: 'Escribe el costo neto del gasto' }
  const gasto: GastoExtraDatos = { proyecto_id: d.proyecto.proyecto_id, concepto: d.gasto.concepto.trim(), costo_total: costo }
  return { ok: true, cuerpo: { contraparte_id, preparar: { proveedor, gasto } } }
}
