/**
 * Rediseño de Cuentas B7 (D5, D7, T7): cuándo se sube la factura de un cobro,
 * de un grupo o de una cuenta suelta, y el reemplazo de una ya validada.
 *
 * Sin factura XML vigente validada, la subida es la normal. Con una, subir
 * otra es **reemplazarla**, y eso es una corrección (decisión del usuario,
 * sesión 20, igual para cobros, grupos y sueltas): solo admin, con las
 * cuentas reabiertas y con motivo. La nueva se sube y valida con el flujo de
 * siempre y después la anterior (XML y PDF) se da de baja con
 * `reemplazado_por` apuntando a la nueva, por la RPC de baja. En una orden de
 * pago nunca se cambia la factura: el PDF ya se emitió con ella (D7).
 */
import { getUserSections } from '@/lib/authz'
import { cuentasReabiertas } from '@/lib/server/repositories/proyectos'
import { aplicarCorreccion } from './correcciones'

export type DominioFactura = 'cobro' | 'proveedor'

const TIPOS: Record<DominioFactura, { xml: string; pdf: string }> = {
  cobro: { xml: 'FACTURA_XML', pdf: 'FACTURA_PDF' },
  proveedor: { xml: 'FACTURA_PROVEEDOR_XML', pdf: 'FACTURA_PROVEEDOR' },
}

export interface Reemplazo {
  dominio: DominioFactura
  /** Documentos vigentes de la factura anterior: XML primero, luego PDF. */
  anteriores: string[]
  motivo: string
  usuario: string
}

export type PlanFactura =
  | { ok: true; reemplazo: Reemplazo | null }
  | { ok: false; status: number; body: { error: string; message: string } }

const rechazo = (status: number, error: string, message: string): PlanFactura => ({ ok: false, status, body: { error, message } })

/** Decide, antes de subir nada a Drive, si la subida procede y si reemplaza. */
export async function planearFactura(
  dominio: DominioFactura,
  destino: { proyecto_id: string | null; orden_pago_id?: string | null },
  vigentes: { id: string; tipo: string; estado_validacion?: string | null }[],
  usuario: { email?: string | null; sections?: string[] } | null | undefined,
  motivo: FormDataEntryValue | null
): Promise<PlanFactura> {
  if (destino.orden_pago_id) {
    return rechazo(409, 'en_orden', 'Está en una orden de pago: cancela primero la orden para cambiar la factura.')
  }
  const tipos = TIPOS[dominio]
  const xmlValidado = vigentes.find((d) => d.tipo === tipos.xml && d.estado_validacion === 'validado')
  if (!xmlValidado) return { ok: true, reemplazo: null }

  if (!getUserSections(usuario ?? null).includes('admin') || !usuario?.email) {
    return rechazo(403, 'solo_admin', 'Ya tiene una factura validada. Reemplazarla es una corrección que solo hace un admin.')
  }
  if (!(await cuentasReabiertas(destino.proyecto_id))) {
    return rechazo(409, 'factura_vigente', 'Ya tiene una factura validada. Para reemplazarla, reabre las cuentas del proyecto.')
  }
  const texto = typeof motivo === 'string' ? motivo.trim() : ''
  // Mismo mínimo que MotivoCorreccionSchema.
  if (texto.length < 3) return rechazo(400, 'motivo_requerido', 'Escribe el motivo del reemplazo.')

  const pdfs = vigentes.filter((d) => d.tipo === tipos.pdf).map((d) => d.id)
  return { ok: true, reemplazo: { dominio, anteriores: [xmlValidado.id, ...pdfs], motivo: texto, usuario: usuario.email } }
}

/**
 * Da de baja la factura anterior apuntando a la nueva. Va después de validar
 * la nueva: en proveedor, si la nueva quedó validada la baja conserva el
 * snapshot; si quedó en revisión, la baja lo quita como con cualquier factura
 * dada de baja. Si una baja falla, el error sube tal cual (409 esperado) y la
 * anterior sigue vigente junto a la nueva: se puede reintentar desde el
 * detalle con "Quitar".
 */
export async function completarReemplazo(r: Reemplazo, nuevoXmlId: string): Promise<void> {
  for (const documento_id of r.anteriores) {
    await aplicarCorreccion({ accion: 'baja_documento', dominio: r.dominio, documento_id, motivo: r.motivo, reemplazado_por: nuevoXmlId }, r.usuario)
  }
}
