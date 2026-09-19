import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { FacturaData } from '@/lib/server/xml/factura-parser'
import { RegimenFiscal } from '@/lib/types'

export interface ResultadoValidacionFacturaPortal {
  estado_validacion: 'validado' | 'revision'
  mensaje_proveedor: string | null
  // false cuando el mismatch incluyó subtotal -- la ruta del Portal no debe
  // adjuntar `ejemplo` (calcularEjemploFactura) en ese caso: expondría el
  // mismo monto que el mensaje genérico busca ocultar.
  mostrar_ejemplo: boolean
}

const MENSAJE_GENERICO_SUBTOTAL =
  'Tu factura no corresponde a lo esperado para este proyecto. Contacta a tu contacto en Serenata para revisarlo.'

/**
 * Wrapper del Portal sobre validarFacturaFiscalProveedor(): decide qué
 * mensaje ve el PROVEEDOR, sin tocar la función original -- sigue siendo la
 * fuente de verdad para el flujo de staff (TabDocumentos.tsx), que necesita
 * el detalle completo.
 *
 * - Mismatch de subtotal (solo o combinado con otros) -> mensaje genérico,
 *   sin revelar el monto esperado por Serenata.
 * - Mismatch solo de desglose (IVA trasladado/retenciones/total-vs-desglose)
 *   con subtotal correcto -> se muestra el detalle específico tal cual lo
 *   arma validarFacturaFiscalProveedor, igual que hoy.
 */
export function validarFacturaParaProveedor(
  facturaData: FacturaData,
  montoNetoEsperado: number,
  regimenFiscal: RegimenFiscal | null | undefined
): ResultadoValidacionFacturaPortal {
  const resultado = validarFacturaFiscalProveedor(facturaData, montoNetoEsperado, regimenFiscal)

  if (resultado.estado_validacion === 'validado') {
    return { estado_validacion: 'validado', mensaje_proveedor: null, mostrar_ejemplo: false }
  }

  const huboMismatchSubtotal = (resultado.mismatches ?? []).some((m) => m.campo === 'subtotal')

  return {
    estado_validacion: 'revision',
    mensaje_proveedor: huboMismatchSubtotal ? MENSAJE_GENERICO_SUBTOTAL : resultado.detalle_validacion,
    mostrar_ejemplo: !huboMismatchSubtotal,
  }
}
