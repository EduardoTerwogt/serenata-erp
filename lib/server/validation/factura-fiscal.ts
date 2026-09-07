import { FacturaData, ResultadoValidacionFactura } from '@/lib/server/xml/factura-parser'
import { RegimenFiscal } from '@/lib/types'

const TOLERANCIA_CENTAVOS = 0.01
const TASA_IVA = 0.16
const TASA_RETENCION_IVA = (2 / 3) * TASA_IVA // 10.6667%
const TASA_RETENCION_ISR = 0.10

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface EjemploFacturaEsperado {
  subtotal: number
  iva_trasladado: number
  iva_retenido: number
  isr_retenido: number
  total: number
  explicacion: string
}

/**
 * Desglose correcto que le corresponde a una factura dado el monto neto
 * acordado (montoNetoEsperado, "X Pagar") y el régimen fiscal del
 * proveedor -- mismas constantes que validarFacturaFiscalProveedor().
 *
 * Fase 5.5: el Portal lo usa para mostrarle al proveedor un ejemplo de
 * cómo debe quedar su factura cuando la que subió no cuadra, en vez de
 * solo decirle qué está mal.
 */
export function calcularEjemploFactura(
  montoNetoEsperado: number,
  regimenFiscal: RegimenFiscal | null | undefined
): EjemploFacturaEsperado {
  const esFisica = regimenFiscal === 'fisica'
  const subtotal = round2(montoNetoEsperado)
  const ivaTrasladado = round2(subtotal * TASA_IVA)
  const ivaRetenido = esFisica ? round2(subtotal * TASA_RETENCION_IVA) : 0
  const isrRetenido = esFisica ? round2(subtotal * TASA_RETENCION_ISR) : 0
  const total = round2(subtotal + ivaTrasladado - ivaRetenido - isrRetenido)

  const explicacion = esFisica
    ? 'Como persona física con honorarios, tu factura debe incluir el IVA trasladado (16%) y además las retenciones que Serenata te aplica: IVA retenido (2/3 del IVA) e ISR retenido (10% del subtotal). El Total es lo que Serenata te transferirá.'
    : 'Como persona moral, tu factura solo lleva el IVA trasladado (16%) sobre el subtotal, sin ninguna retención. El Total es lo que Serenata te transferirá.'

  return { subtotal, iva_trasladado: ivaTrasladado, iva_retenido: ivaRetenido, isr_retenido: isrRetenido, total, explicacion }
}

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
    return { estado_validacion: 'revision', detalle_validacion: 'No se pudo leer el monto total del XML.' }
  }
  if (facturaData.subtotal == null) {
    return { estado_validacion: 'revision', detalle_validacion: 'No se pudo leer el subtotal del XML.' }
  }

  const esFisica = regimenFiscal === 'fisica'
  const subtotalDeclarado = facturaData.subtotal
  const ivaTrasladadoDeclarado = facturaData.iva_trasladado ?? 0
  const ivaRetenidoDeclarado = facturaData.iva_retenido ?? 0
  const isrRetenidoDeclarado = facturaData.isr_retenido ?? 0

  const mismatches: string[] = []

  if (Math.abs(subtotalDeclarado - montoNetoEsperado) > TOLERANCIA_CENTAVOS) {
    mismatches.push(
      `Subtotal no coincide: XML $${subtotalDeclarado.toFixed(2)} vs esperado $${montoNetoEsperado.toFixed(2)}.`
    )
  }

  const ivaEsperado = round2(subtotalDeclarado * TASA_IVA)
  if (Math.abs(ivaTrasladadoDeclarado - ivaEsperado) > TOLERANCIA_CENTAVOS) {
    mismatches.push(
      `IVA trasladado no coincide: XML $${ivaTrasladadoDeclarado.toFixed(2)} vs esperado $${ivaEsperado.toFixed(2)} (16% del subtotal).`
    )
  }

  if (esFisica) {
    const ivaRetenidoEsperado = round2(subtotalDeclarado * TASA_RETENCION_IVA)
    const isrRetenidoEsperado = round2(subtotalDeclarado * TASA_RETENCION_ISR)
    if (Math.abs(ivaRetenidoDeclarado - ivaRetenidoEsperado) > TOLERANCIA_CENTAVOS) {
      mismatches.push(
        `Retención de IVA no coincide: XML $${ivaRetenidoDeclarado.toFixed(2)} vs esperado $${ivaRetenidoEsperado.toFixed(2)} (2/3 del IVA, persona física con honorarios).`
      )
    }
    if (Math.abs(isrRetenidoDeclarado - isrRetenidoEsperado) > TOLERANCIA_CENTAVOS) {
      mismatches.push(
        `Retención de ISR no coincide: XML $${isrRetenidoDeclarado.toFixed(2)} vs esperado $${isrRetenidoEsperado.toFixed(2)} (10% del subtotal, persona física con honorarios).`
      )
    }
  } else {
    if (ivaRetenidoDeclarado > TOLERANCIA_CENTAVOS) {
      mismatches.push(
        `El XML declara retención de IVA de $${ivaRetenidoDeclarado.toFixed(2)}, pero el proveedor es persona moral (sin retenciones).`
      )
    }
    if (isrRetenidoDeclarado > TOLERANCIA_CENTAVOS) {
      mismatches.push(
        `El XML declara retención de ISR de $${isrRetenidoDeclarado.toFixed(2)}, pero el proveedor es persona moral (sin retenciones).`
      )
    }
  }

  const totalEsperadoSegunDesglose = round2(
    subtotalDeclarado + ivaTrasladadoDeclarado - ivaRetenidoDeclarado - isrRetenidoDeclarado
  )
  if (Math.abs(facturaData.monto_total - totalEsperadoSegunDesglose) > TOLERANCIA_CENTAVOS) {
    mismatches.push(
      `El Total del XML ($${facturaData.monto_total.toFixed(2)}) no cuadra con su propio desglose (subtotal + IVA trasladado - retenciones = $${totalEsperadoSegunDesglose.toFixed(2)}).`
    )
  }

  if (mismatches.length > 0) {
    return { estado_validacion: 'revision', detalle_validacion: mismatches.join(' ') }
  }
  return { estado_validacion: 'validado', detalle_validacion: null }
}
