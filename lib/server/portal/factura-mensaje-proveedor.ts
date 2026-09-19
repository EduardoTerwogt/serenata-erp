import { validarFacturaFiscalProveedor } from '@/lib/server/validation/factura-fiscal'
import { FacturaData } from '@/lib/server/xml/factura-parser'
import { RegimenFiscal } from '@/lib/types'

export interface ResultadoValidacionFacturaPortal {
  estado_validacion: 'validado' | 'revision'
  mensaje_proveedor: string | null
  // false cuando el mensaje ya remite al panel "Simulador de factura"
  // (siempre visible en el Portal) para el desglose esperado -- mostrar el
  // bloque `ejemplo` (calcularEjemploFactura) justo debajo sería
  // información duplicada, no información nueva.
  mostrar_ejemplo: boolean
}

function mensajeSubtotal(subtotalDeclarado: number, subtotalEsperado: number): string {
  return `El Subtotal de tu factura es de $${subtotalDeclarado.toFixed(2)} y lo correspondiente al proyecto es $${subtotalEsperado.toFixed(2)}. Si el subtotal de Serenata está mal, ponte en contacto con nosotros.`
}

const MENSAJE_REGIMEN_FISCAL =
  'Los impuestos aplicados no corresponden a tu régimen fiscal. En el simulador de factura (panel lateral) puedes ver el desglose esperado de tu factura acorde a tu régimen.'

/**
 * Wrapper del Portal sobre validarFacturaFiscalProveedor(): decide qué
 * mensaje ve el PROVEEDOR, sin tocar la función original -- sigue siendo la
 * fuente de verdad para el flujo de staff (TabDocumentos.tsx), que necesita
 * el detalle completo.
 *
 * - Mismatch de subtotal (solo o combinado con otros, manda sobre el resto)
 *   -> muestra ambos montos (el del XML y el esperado) e invita a
 *   contactar a Serenata si el esperado está mal -- a diferencia de
 *   IVA/retenciones, el subtotal no tiene un panel que ya lo muestre
 *   proactivamente por adelantado sin que el proveedor haya elegido nada,
 *   así que sí vale la pena repetirlo aquí.
 * - Mismatch de retenciones (IVA y/o ISR retenido, subtotal correcto) ->
 *   mensaje genérico de régimen fiscal, remite al panel "Simulador de
 *   factura" (siempre visible, calcularEjemploFactura) para el desglose
 *   correcto -- cubre tanto "persona física con un monto de retención
 *   equivocado" como "persona moral con una retención que no debería
 *   llevar", mismo mensaje porque la causa es la misma: el régimen no
 *   coincide con lo que trae el XML.
 * - Cualquier otro mismatch (IVA trasladado, total-vs-desglose) -> se
 *   muestra el detalle específico tal cual lo arma
 *   validarFacturaFiscalProveedor, igual que hoy.
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

  const mismatches = resultado.mismatches ?? []
  const huboMismatchSubtotal = mismatches.some((m) => m.campo === 'subtotal')
  const huboMismatchRegimen = mismatches.some((m) => m.campo === 'iva_retenido' || m.campo === 'isr_retenido')

  if (huboMismatchSubtotal) {
    return {
      estado_validacion: 'revision',
      // Solo llega aquí con subtotal declarado (facturaData.subtotal != null):
      // 'lectura_xml' se dispara antes y nunca coexiste con 'subtotal'.
      mensaje_proveedor: mensajeSubtotal(facturaData.subtotal as number, montoNetoEsperado),
      mostrar_ejemplo: false,
    }
  }

  if (huboMismatchRegimen) {
    return { estado_validacion: 'revision', mensaje_proveedor: MENSAJE_REGIMEN_FISCAL, mostrar_ejemplo: false }
  }

  return { estado_validacion: 'revision', mensaje_proveedor: resultado.detalle_validacion, mostrar_ejemplo: true }
}
