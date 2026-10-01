import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  CuentaPagar,
  CuentaPagarGrupo,
  DocumentoCuentaPagar,
} from '@/lib/types'
import { DomainError } from '@/lib/server/errors/domain-error'

type CuentaPagarConJoins = CuentaPagar & {
  cotizaciones?: { proyecto?: string } | null
  proyectos?: { proyecto?: string } | null
}

type CuentaPagarGrupoConJoins = CuentaPagarGrupo & {
  proyectos?: { proyecto?: string } | null
  proveedores?: { nombre?: string } | null
}

/**
 * Detalle por ID (1C-1).
 * .maybeSingle() nunca .single(): "no encontrada" debe seguir siendo un
 * 404 explícito del caller, no un error de Postgres por 0 filas.
 */
export async function getCuentaPagarById(id: string): Promise<CuentaPagar | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*, cotizaciones(proyecto), proyectos(proyecto)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as CuentaPagarConJoins
  return {
    ...row,
    proyecto_nombre:
      row.proyecto_nombre ||
      row.cotizaciones?.proyecto ||
      row.proyectos?.proyecto ||
      undefined,
    cotizaciones: undefined,
    proyectos: undefined,
  } as CuentaPagar
}

/**
 * Cuentas por pagar de un proyecto puntual -- usado por el auto-llenado del
 * Status Report / Reporte de Cierre (Fase 5.2) para financiero real vs.
 * cotizado, sin traer las 500 más recientes de todo el sistema.
 */
export async function getCuentasPagarByProyecto(proyectoId: string): Promise<CuentaPagar[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .eq('proyecto_id', proyectoId)
  if (error) throw error
  return data as CuentaPagar[]
}

export async function createDocumentoCuentaPagar(documento: Partial<DocumentoCuentaPagar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .insert(documento)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaPagar
}

export async function getDocumentosCuentaPagar(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .select('*')
    .eq('cuentas_pagar_id', cuentaId)
    // B7: un documento dado de baja nunca es vigente (T7).
    .is('eliminado_at', null)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaPagar[]
}

export async function updateDocumentoCuentaPagar(id: string, updates: Partial<DocumentoCuentaPagar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaPagar
}

// ==================== Agrupación de Cuentas por Pagar (docs/PLAN.md) ====================

export async function getCuentaPagarGrupoById(id: string): Promise<CuentaPagarGrupo | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar_grupos')
    .select('*, proyectos(proyecto), proveedores(nombre)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as CuentaPagarGrupoConJoins
  return {
    ...row,
    proyecto_nombre: row.proyecto_nombre || row.proyectos?.proyecto || undefined,
    responsable_nombre: row.proveedores?.nombre || undefined,
    proyectos: undefined,
    proveedores: undefined,
  } as CuentaPagarGrupo
}

export async function getDocumentosCuentaPagarGrupo(grupoId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .select('*')
    .eq('grupo_id', grupoId)
    // B7: un documento dado de baja nunca es vigente (T7).
    .is('eliminado_at', null)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaPagar[]
}

export interface OrdenPagoCandidato {
  tipo: 'grupo'
  id: string
  /** Saldo neto que la ruta imprimió en el PDF; la RPC lo revalida. */
  monto_esperado: number
}

export interface GenerarOrdenPagoResult {
  orden_pago_id: string
  total_monto: number
  grupos: number
}

/**
 * Rediseño de Cuentas B1b (docs/PLAN.md, H1, H2, S1, S2): crea la orden, su
 * desglose inmutable (`ordenes_pago_conceptos`) y marca grupos y sus hijas
 * en una sola transacción, con los candidatos bloqueados y
 * revalidados -- db/migrations/20260925_ordenes_pago_generar_atomico.sql.
 * Los errores esperados de la RPC (ERRCODE P1414) salen como DomainError
 * con un mensaje seguro; cualquier otro se propaga tal cual.
 */
export async function generarOrdenPago(params: {
  candidatos: OrdenPagoCandidato[]
  pdfUrl: string | null
  pdfNombre: string
  usuario: string
}): Promise<GenerarOrdenPagoResult> {
  const { data, error } = await supabaseAdmin.rpc('generar_orden_pago', {
    p_candidatos: params.candidatos,
    p_pdf_url: params.pdfUrl,
    p_pdf_nombre: params.pdfNombre,
    p_usuario: params.usuario,
  })
  if (error) {
    const message = error.message ?? ''
    if (error.code === 'P1414' && message.startsWith('candidatos_cambiaron')) {
      throw new DomainError({
        code: 'candidatos_cambiaron',
        status: 409,
        safeMessage: 'Los saldos cambiaron mientras se generaba la orden. Vuelve a cargar la vista previa e inténtalo de nuevo.',
        cause: error,
      })
    }
    if (error.code === 'P1414' && message.startsWith('candidato_no_elegible')) {
      throw new DomainError({
        code: 'candidato_no_elegible',
        status: 409,
        safeMessage: 'Alguna cuenta ya no se puede incluir (entró a otra orden o cambió de estado). Vuelve a cargar la vista previa.',
        cause: error,
      })
    }
    throw error
  }
  return data as GenerarOrdenPagoResult
}

export interface ValidarFacturaProveedorResult {
  documento_id: string
  grupo_id: string | null
  cuenta_pagar_id: string | null
  total_a_transferir: number
  estado: string
}

/**
 * Rediseño de Cuentas B2 (docs/PLAN.md, T4, V3, A2): ÚNICA vía para dejar
 * una factura XML de proveedor en 'validado'. En la misma transacción guarda
 * el snapshot del total a transferir y, si es un grupo ABIERTO, lo pasa a
 * FACTURADO -- db/migrations/20260927_cuentas_b2_pagos_total_a_transferir.sql.
 * Reemplaza a marcarGrupoFacturado. Si falla, el documento se queda como
 * estaba ('pendiente' = "En revisión"), nunca validado sin snapshot.
 */
export async function validarFacturaProveedor(documentoId: string, usuario: string | null): Promise<ValidarFacturaProveedorResult> {
  const { data, error } = await supabaseAdmin.rpc('validar_factura_proveedor', {
    p_documento_id: documentoId,
    p_usuario: usuario,
  })
  if (error) {
    if (error.code === 'P1415') {
      throw new DomainError({
        code: (error.message ?? '').startsWith('sin_total_cfdi') ? 'sin_total_cfdi' : 'factura_invalida',
        status: 409,
        safeMessage: (error.message ?? '').startsWith('sin_total_cfdi')
          ? 'La factura no tiene el total del CFDI guardado; vuelve a subir el XML para validarla.'
          : 'El documento no es una factura XML de proveedor.',
        cause: error,
      })
    }
    throw error
  }
  return data as ValidarFacturaProveedorResult
}
