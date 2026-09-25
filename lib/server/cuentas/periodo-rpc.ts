/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1, O1b, U1): lectura cruda del año
 * con `cuentas_por_proyecto(p_year)`.
 *
 * La RPC devuelve cuatro listas de filas-arreglo (forma posicional, para el
 * presupuesto de O1b). El orden de columnas es el contrato documentado en
 * db/migrations/20260929_cuentas_b3_lectura_por_periodo.sql; este módulo es el
 * único que lo conoce y lo convierte a objetos tipados.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ArchivoInput, DocumentoXmlInput, PagoCobroInput } from '@/lib/shared/cuentas/concepto'
import type { RegimenFiscal } from '@/lib/types'

export interface ProyectoAnioRaw {
  id: string
  nombre: string
  cliente: string | null
  cliente_id: string | null
  /** YYYY-MM-DD o null ("Sin fecha", D9). */
  fecha_entrega: string | null
  margen_total_proyecto: number
  fee_agencia_proyecto: number
  utilidad_total_proyecto: number
  iva_total_proyecto: number
}

export interface CobroAnioRaw {
  id: string
  cotizacion_id: string
  proyecto_id: string | null
  folio: string | null
  cliente: string | null
  cliente_id: string | null
  proyecto: string | null
  monto_total: number
  monto_pagado: number
  fecha_vencimiento: string | null
  fecha_factura: string | null
  facturas_xml: DocumentoXmlInput[]
  pagos: (PagoCobroInput & { tipo_pago?: string })[]
}

/** Pago a proveedor no anulado: fecha capturada y monto en total a transferir. */
export interface PagoRealizadoRaw {
  fecha: string
  monto: number
}

export interface PagoAnioRaw {
  id: string
  cotizacion_id: string | null
  proyecto_id: string | null
  grupo_id: string | null
  responsable_id: string | null
  responsable_nombre: string | null
  item_descripcion: string | null
  x_pagar: number
  monto_pagado: number
  total_a_transferir: number | null
  monto_transferido: number
  orden_pago_id: string | null
  /** Solo en sueltas; en un grupo el régimen viene en el grupo. */
  regimen_fiscal: RegimenFiscal | null
  facturas_xml: DocumentoXmlInput[]
  comprobantes: ArchivoInput[]
  pagos_realizados: PagoRealizadoRaw[]
}

export interface GrupoAnioRaw {
  id: string
  proyecto_id: string | null
  responsable_id: string
  responsable_nombre: string | null
  regimen_fiscal: RegimenFiscal | null
  monto_total: number
  monto_pagado: number
  total_a_transferir: number | null
  monto_transferido: number
  orden_pago_id: string | null
  facturas_xml: DocumentoXmlInput[]
  comprobantes: ArchivoInput[]
  pagos_realizados: PagoRealizadoRaw[]
}

export interface CuentasAnioRaw {
  proyectos: ProyectoAnioRaw[]
  cobros: CobroAnioRaw[]
  pagos: PagoAnioRaw[]
  grupos: GrupoAnioRaw[]
}

type Fila = unknown[]

const num = (v: unknown) => Number(v ?? 0)
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const str = (v: unknown) => (v === null || v === undefined ? null : String(v))
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const pagosRealizados = (v: unknown): PagoRealizadoRaw[] =>
  lista<{ fecha: unknown; monto: unknown }>(v).map((p) => ({ fecha: String(p.fecha), monto: num(p.monto) }))

export function decodificarCuentasAnio(data: unknown): CuentasAnioRaw {
  const raw = (data ?? {}) as Record<string, Fila[] | undefined>
  return {
    proyectos: (raw.proyectos ?? []).map((f) => ({
      id: String(f[0]),
      nombre: String(f[1] ?? ''),
      cliente: str(f[2]),
      cliente_id: str(f[3]),
      fecha_entrega: str(f[4]),
      margen_total_proyecto: num(f[5]),
      fee_agencia_proyecto: num(f[6]),
      utilidad_total_proyecto: num(f[7]),
      iva_total_proyecto: num(f[8]),
    })),
    cobros: (raw.cobros ?? []).map((f) => ({
      id: String(f[0]),
      cotizacion_id: String(f[1]),
      proyecto_id: str(f[2]),
      folio: str(f[3]),
      cliente: str(f[4]),
      cliente_id: str(f[5]),
      proyecto: str(f[6]),
      monto_total: num(f[7]),
      monto_pagado: num(f[8]),
      fecha_vencimiento: str(f[9]),
      fecha_factura: str(f[10]),
      facturas_xml: lista(f[11]),
      pagos: lista<PagoCobroInput & { tipo_pago?: string }>(f[12]).map((p) => ({ ...p, monto: num(p.monto) })),
    })),
    pagos: (raw.pagos ?? []).map((f) => ({
      id: String(f[0]),
      cotizacion_id: str(f[1]),
      proyecto_id: str(f[2]),
      grupo_id: str(f[3]),
      responsable_id: str(f[4]),
      responsable_nombre: str(f[5]),
      item_descripcion: str(f[6]),
      x_pagar: num(f[7]),
      monto_pagado: num(f[8]),
      total_a_transferir: numOrNull(f[9]),
      monto_transferido: num(f[10]),
      orden_pago_id: str(f[11]),
      regimen_fiscal: (str(f[12]) as RegimenFiscal | null),
      facturas_xml: lista(f[13]),
      comprobantes: lista(f[14]),
      pagos_realizados: pagosRealizados(f[15]),
    })),
    grupos: (raw.grupos ?? []).map((f) => ({
      id: String(f[0]),
      proyecto_id: str(f[1]),
      responsable_id: String(f[2]),
      responsable_nombre: str(f[3]),
      regimen_fiscal: (str(f[4]) as RegimenFiscal | null),
      monto_total: num(f[5]),
      monto_pagado: num(f[6]),
      total_a_transferir: numOrNull(f[7]),
      monto_transferido: num(f[8]),
      orden_pago_id: str(f[9]),
      facturas_xml: lista(f[10]),
      comprobantes: lista(f[11]),
      pagos_realizados: pagosRealizados(f[12]),
    })),
  }
}

export async function cargarCuentasAnio(anio: number): Promise<CuentasAnioRaw> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_por_proyecto', { p_year: anio })
  if (error) throw error
  return decodificarCuentasAnio(data)
}

export async function cargarAniosCuentas(): Promise<number[]> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_anios')
  if (error) throw error
  return ((data as number[] | null) ?? []).map(Number)
}
