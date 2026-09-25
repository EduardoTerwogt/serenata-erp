/**
 * Rediseño de Cuentas B7 (docs/PLAN.md, D5, D6, R8, S12, T7; supuestos 1 y
 * 10): reabrir, volver a cerrar y correcciones. Cada operación es una RPC
 * atómica (db/migrations/20261005_cuentas_b7_reabrir_correcciones.sql) que
 * exige las cuentas reabiertas y deja registro; aquí solo se llaman y sus
 * errores esperados se traducen a mensajes seguros. Que el usuario sea admin
 * lo valida la ruta.
 */
import { DomainError } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import type { CorreccionCuentas } from '@/lib/validation/schemas'
import { construirProyectos } from './periodo'
import { cargarCuentasAnio } from './periodo-rpc'

const MENSAJES: Record<string, { status: number; mensaje: string }> = {
  proyecto_no_reabierto: { status: 409, mensaje: 'Las cuentas del proyecto no están reabiertas: un admin debe reabrirlas antes de corregir.' },
  motivo_requerido: { status: 400, mensaje: 'Escribe el motivo.' },
  usuario_requerido: { status: 400, mensaje: 'No se pudo identificar al usuario.' },
  fecha_requerida: { status: 400, mensaje: 'La fecha del pago es obligatoria.' },
  reemplazo_invalido: { status: 400, mensaje: 'El documento de reemplazo no pertenece a este concepto.' },
  factura_invalida: { status: 409, mensaje: 'La factura no es válida para esta operación.' },
  pago_anulado: { status: 409, mensaje: 'El pago está anulado.' },
  en_orden: { status: 409, mensaje: 'Está en una orden de pago: cancela primero la orden.' },
  pagos_activos: { status: 409, mensaje: 'Anula primero los pagos del concepto.' },
  grupo_abierto_existente: { status: 409, mensaje: 'El proveedor ya tiene otro grupo abierto en este proyecto; no se puede reabrir este.' },
  grupo_no_abierto: { status: 409, mensaje: 'El grupo ya está facturado o pagado; no se puede reasignar.' },
}

async function llamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(fn, args)
  if (!error) return data as T
  const codigo = (error.message ?? '').split(':')[0].trim()
  if (['P1412', 'P1413', 'P1415', 'P1416'].includes(error.code ?? '') && MENSAJES[codigo]) {
    const m = MENSAJES[codigo]
    throw new DomainError({ code: codigo, status: m.status, safeMessage: m.mensaje, cause: error })
  }
  if (error.code === 'P0002') throw new DomainError({ code: 'no_encontrado', status: 404, safeMessage: 'No se encontró el registro.', cause: error })
  throw error
}

/**
 * Estado derivado de las cuentas de un proyecto (D17), con la misma
 * derivación que la pantalla: lectura cruda de ese solo proyecto.
 */
export async function cuentasDelProyecto(proyectoId: string): Promise<ProyectoDetalle | null> {
  const { data, error } = await supabaseAdmin.from('proyectos').select('id, fecha_entrega').eq('id', proyectoId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const hoy = hoyCdmx()
  // Un proyecto sin fecha válida aparece en cualquier año (D9).
  const fecha = typeof data.fecha_entrega === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha_entrega) ? data.fecha_entrega : hoy
  const crudo = await cargarCuentasAnio(Number(fecha.slice(0, 4)), proyectoId)
  return construirProyectos(crudo, hoy).find((p) => p.id === proyectoId) ?? null
}

export interface ResultadoReapertura {
  reapertura_id: string | null
  proyecto_id: string
}

export async function reabrirCuentas(proyectoId: string, motivo: string, usuario: string): Promise<ResultadoReapertura> {
  const p = await cuentasDelProyecto(proyectoId)
  if (!p) throw new DomainError({ code: 'no_encontrado', status: 404, safeMessage: 'El proyecto no tiene cuentas.' })
  // D17 / prototipo (canReopen): solo se reabre lo que está cerrado. Ya
  // reabiertas se devuelve la reapertura vigente (la RPC es idempotente).
  if (!p.cuentas.cerradas && !p.cuentas.reabiertas) {
    throw new DomainError({ code: 'cuentas_abiertas', status: 409, safeMessage: 'Las cuentas todavía tienen pendientes: solo se reabren cuentas cerradas.' })
  }
  return llamar('reabrir_cuentas_proyecto', { p_proyecto_id: proyectoId, p_motivo: motivo, p_usuario: usuario })
}

export async function cerrarCuentas(proyectoId: string, usuario: string): Promise<ResultadoReapertura> {
  const p = await cuentasDelProyecto(proyectoId)
  if (!p) throw new DomainError({ code: 'no_encontrado', status: 404, safeMessage: 'El proyecto no tiene cuentas.' })
  // Prototipo (canReclose): solo sin pendientes; si no, se cerrarán solas al resolverlos.
  if (p.cuentas.pendientes > 0) {
    throw new DomainError({
      code: 'cuentas_pendientes',
      status: 409,
      safeMessage: `Todavía hay ${p.cuentas.pendientes} ${p.cuentas.pendientes === 1 ? 'concepto' : 'conceptos'} por resolver.`,
    })
  }
  return llamar('cerrar_cuentas_proyecto', { p_proyecto_id: proyectoId, p_usuario: usuario })
}

/** Aplica una corrección; cada acción es una sola RPC atómica. */
export async function aplicarCorreccion(c: CorreccionCuentas, usuario: string): Promise<unknown> {
  switch (c.accion) {
    case 'anular_pago':
      return llamar(c.dominio === 'cobro' ? 'anular_pago_cobro' : 'anular_pago_proveedor', {
        p_pago_id: c.pago_id,
        p_motivo: c.motivo,
        p_usuario: usuario,
      })
    case 'baja_documento':
      return llamar(c.dominio === 'cobro' ? 'baja_documento_cobro' : 'baja_documento_pago', {
        p_documento_id: c.documento_id,
        p_motivo: c.motivo,
        p_usuario: usuario,
        p_reemplazado_por: c.reemplazado_por ?? null,
      })
    case 'datos_cobro':
      return llamar('corregir_datos_cobro', {
        p_cuenta_id: c.cuenta_id,
        p_fecha_factura: c.fecha_factura,
        p_fecha_vencimiento: c.fecha_vencimiento,
        p_notas: c.notas,
        p_usuario: usuario,
      })
    case 'datos_pago':
      return llamar('corregir_datos_pago', {
        p_dominio: c.dominio,
        p_pago_id: c.pago_id,
        p_fecha_pago: c.fecha_pago,
        p_notas: c.notas,
        p_usuario: usuario,
      })
    case 'proveedor': {
      // Mismos datos de contacto que copia la reasignación normal (items/[id]).
      const { data: prov, error } = await supabaseAdmin
        .from('proveedores')
        .select('id, nombre, telefono, correo, clabe, banco')
        .eq('id', c.responsable_id)
        .maybeSingle()
      if (error) throw error
      if (!prov) throw new DomainError({ code: 'proveedor_no_encontrado', status: 404, safeMessage: 'El proveedor no existe.' })
      return llamar('corregir_proveedor_cuenta_pagar', {
        p_cuenta_pagar_id: c.cuenta_pagar_id,
        p_responsable_id: prov.id,
        p_responsable_nombre: prov.nombre,
        p_telefono: prov.telefono,
        p_correo: prov.correo,
        p_clabe: prov.clabe,
        p_banco: prov.banco,
        p_motivo: c.motivo,
        p_usuario: usuario,
      })
    }
  }
}
