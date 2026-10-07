/**
 * #130: alta del proveedor y asignación de renglones (o gasto extra) antes de subir la factura de un proveedor. Todo es
 * una sola transacción en SQL (`preparar_grupo_factura_proveedor`); aquí solo se llama y se traducen sus errores
 * (códigos P14xx) a respuestas explícitas. La factura se sube después, con el `grupo_id` que devuelve.
 */
import { DomainError } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export interface ProveedorNuevo {
  nombre: string
  rfc: string
  regimen_fiscal: 'moral' | 'fisica' | 'resico'
  telefono: string
  correo: string
  banco: string
  clabe: string
}

export interface PrepararParams {
  /** Proveedor existente; si falta, `proveedor` es el alta. */
  proveedorId: string | null
  proveedor?: ProveedorNuevo
  renglones?: string[]
  gasto?: { proyecto_id: string; concepto: string; costo_total: number }
  usuario: string | null
  operationId: string
}

export interface GrupoPreparado {
  proveedor_id: string
  proveedor_nombre: string
  proveedor_creado: boolean
  proyecto_id: string
  grupo_id: string
  cuenta_extra_id: string | null
  reasignados: number
  monto_total: number | null
  repetido: boolean
}

const MENSAJE_SQL = (m: string) => m.split(': ').slice(1).join(': ') || m

export async function prepararGrupoFacturaProveedor(p: PrepararParams): Promise<GrupoPreparado> {
  const { data, error } = await supabaseAdmin.rpc('preparar_grupo_factura_proveedor', {
    p_proveedor_id: p.proveedorId,
    p_proveedor: p.proveedor ?? null,
    p_renglones: p.renglones?.length ? p.renglones : null,
    p_gasto: p.gasto ?? null,
    p_usuario: p.usuario,
    p_operation_id: p.operationId,
  })
  if (error) {
    // P1412 grupo ya facturado o en pago; P1413 regla de negocio (pagos, orden, RFC duplicado, proyecto sin cotización
    // aprobada); P1415 dato inválido; P0002 no existe. El mensaje de SQL es seguro de mostrar: lo escribimos nosotros.
    const estatus = error.code === 'P1415' ? 400 : error.code === 'P0002' ? 404 : error.code === 'P1412' || error.code === 'P1413' ? 409 : null
    if (estatus) {
      throw new DomainError({ code: error.message.split(':')[0] || 'preparar_invalido', status: estatus, safeMessage: MENSAJE_SQL(error.message), cause: error })
    }
    throw error
  }
  return data as GrupoPreparado
}
