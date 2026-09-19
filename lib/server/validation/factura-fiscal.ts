import { FacturaData, MismatchFactura, ResultadoValidacionFactura } from '@/lib/server/xml/factura-parser'
import { RegimenFiscal } from '@/lib/types'
import { round2, TASA_IVA, TASA_RETENCION_IVA, TASA_RETENCION_ISR } from '@/lib/shared/factura-fiscal'

export { calcularEjemploFactura, type EjemploFacturaEsperado } from '@/lib/shared/factura-fiscal'

const TOLERANCIA_CENTAVOS = 0.01

/**
 * Validación fiscal profunda de una factura de proveedor (CFDI): confirma
 * que el desglose de impuestos declarado en el XML (traslados/retenciones)
 * coincida EXACTAMENTE con lo que corresponde al régimen fiscal del
 * proveedor -- no solo que el Total final cuadre.
 *
 * - Persona moral: IVA 16% trasladado, sin retenciones.
 * - Persona física con honorarios: IVA 16% trasladado + retención de IVA
 *   2/3 (10.6667%) + retención de ISR 10%, todo sobre el subtotal.
 *
 * `regimenFiscal` null/undefined se trata como 'moral' -- mismo default que
 * usa el resto del negocio cuando el proveedor aún no lo tiene capturado
 * (ver Proveedor.regimen_fiscal en lib/types.ts).
 *
 * Módulo independiente y sin acoplarse a ningún endpoint (Fase 5.3, Bloque
 * 0, punto 3): el futuro Portal de Proveedores debe poder reusarlo tal
 * cual cuando el proveedor suba su propia factura.
 */
export function validarFacturaFiscalProveedor(
  facturaData: FacturaData,
  montoNetoEsperado: number,
  regimenFiscal: RegimenFiscal | null | undefined
): ResultadoValidacionFactura {
  if (facturaData.monto_total == null) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: 'No se pudo leer el monto total del XML.',
      mismatches: [{ campo: 'lectura_xml', mensaje: 'No se pudo leer el monto total del XML.' }],
    }
  }
  if (facturaData.subtotal == null) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: 'No se pudo leer el subtotal del XML.',
      mismatches: [{ campo: 'lectura_xml', mensaje: 'No se pudo leer el subtotal del XML.' }],
    }
  }

  const esFisica = regimenFiscal === 'fisica'
  const subtotalDeclarado = facturaData.subtotal
  const ivaTrasladadoDeclarado = facturaData.iva_trasladado ?? 0
  const ivaRetenidoDeclarado = facturaData.iva_retenido ?? 0
  const isrRetenidoDeclarado = facturaData.isr_retenido ?? 0

  const mismatches: MismatchFactura[] = []

  if (Math.abs(subtotalDeclarado - montoNetoEsperado) > TOLERANCIA_CENTAVOS) {
    mismatches.push({
      campo: 'subtotal',
      mensaje: `Subtotal no coincide: XML $${subtotalDeclarado.toFixed(2)} vs esperado $${montoNetoEsperado.toFixed(2)}.`,
    })
  }

  const ivaEsperado = round2(subtotalDeclarado * TASA_IVA)
  if (Math.abs(ivaTrasladadoDeclarado - ivaEsperado) > TOLERANCIA_CENTAVOS) {
    mismatches.push({
      campo: 'iva_trasladado',
      mensaje: `IVA trasladado no coincide: XML $${ivaTrasladadoDeclarado.toFixed(2)} vs esperado $${ivaEsperado.toFixed(2)} (16% del subtotal).`,
    })
  }

  if (esFisica) {
    const ivaRetenidoEsperado = round2(subtotalDeclarado * TASA_RETENCION_IVA)
    const isrRetenidoEsperado = round2(subtotalDeclarado * TASA_RETENCION_ISR)
    if (Math.abs(ivaRetenidoDeclarado - ivaRetenidoEsperado) > TOLERANCIA_CENTAVOS) {
      mismatches.push({
        campo: 'iva_retenido',
        mensaje: `Retención de IVA no coincide: XML $${ivaRetenidoDeclarado.toFixed(2)} vs esperado $${ivaRetenidoEsperado.toFixed(2)} (2/3 del IVA, persona física con honorarios).`,
      })
    }
    if (Math.abs(isrRetenidoDeclarado - isrRetenidoEsperado) > TOLERANCIA_CENTAVOS) {
      mismatches.push({
        campo: 'isr_retenido',
        mensaje: `Retención de ISR no coincide: XML $${isrRetenidoDeclarado.toFixed(2)} vs esperado $${isrRetenidoEsperado.toFixed(2)} (10% del subtotal, persona física con honorarios).`,
      })
    }
  } else {
    if (ivaRetenidoDeclarado > TOLERANCIA_CENTAVOS) {
      mismatches.push({
        campo: 'iva_retenido',
        mensaje: `El XML declara retención de IVA de $${ivaRetenidoDeclarado.toFixed(2)}, pero el proveedor es persona moral (sin retenciones).`,
      })
    }
    if (isrRetenidoDeclarado > TOLERANCIA_CENTAVOS) {
      mismatches.push({
        campo: 'isr_retenido',
        mensaje: `El XML declara retención de ISR de $${isrRetenidoDeclarado.toFixed(2)}, pero el proveedor es persona moral (sin retenciones).`,
      })
    }
  }

  const totalEsperadoSegunDesglose = round2(
    subtotalDeclarado + ivaTrasladadoDeclarado - ivaRetenidoDeclarado - isrRetenidoDeclarado
  )
  if (Math.abs(facturaData.monto_total - totalEsperadoSegunDesglose) > TOLERANCIA_CENTAVOS) {
    mismatches.push({
      campo: 'total_vs_desglose',
      mensaje: `El Total del XML ($${facturaData.monto_total.toFixed(2)}) no cuadra con su propio desglose (subtotal + IVA trasladado - retenciones = $${totalEsperadoSegunDesglose.toFixed(2)}).`,
    })
  }

  if (mismatches.length > 0) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: mismatches.map((m) => m.mensaje).join(' '),
      mismatches,
    }
  }
  return { estado_validacion: 'validado', detalle_validacion: null }
}
