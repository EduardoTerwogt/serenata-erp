/**
 * #123 (B3, P15): lectura del estado de cuenta de un cliente o proveedor y de lo que se puede ligar a una factura.
 * Todo se deriva en SQL (`estado_cuenta`, `facturas_candidatos`); esta capa solo llama y tipa.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type {
  CandidatoFacturaCobro,
  CandidatoFacturaProveedor,
  EstadoCuentaRespuesta,
  LadoCuentas,
} from '@/lib/shared/cuentas/estado-cuenta-tipos'

export async function cargarEstadoCuenta(lado: LadoCuentas, contraparteId: string, hoy: string): Promise<EstadoCuentaRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('estado_cuenta', { p_lado: lado, p_contraparte: contraparteId, p_hoy: hoy })
  if (error) throw error
  return data as EstadoCuentaRespuesta
}

export async function cargarCandidatosFactura(lado: 'cobro', contraparteId: string): Promise<CandidatoFacturaCobro[]>
export async function cargarCandidatosFactura(lado: 'proveedor', contraparteId: string): Promise<CandidatoFacturaProveedor[]>
export async function cargarCandidatosFactura(lado: LadoCuentas, contraparteId: string) {
  const { data, error } = await supabaseAdmin.rpc('facturas_candidatos', { p_lado: lado, p_contraparte: contraparteId })
  if (error) throw error
  return (data ?? []) as CandidatoFacturaCobro[] | CandidatoFacturaProveedor[]
}
