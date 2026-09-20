import { RegimenFiscal } from '@/lib/types'

export const TASA_IVA = 0.16
export const TASA_RETENCION_IVA = (2 / 3) * TASA_IVA // 10.6667%
export const TASA_RETENCION_ISR = 0.10

export function round2(value: number): number {
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
 * proveedor -- mismas constantes que validarFacturaFiscalProveedor()
 * (lib/server/validation/factura-fiscal.ts).
 *
 * Módulo puro sin `server-only`: lo usa tanto la validación server-side
 * como el panel "Simulador de factura" del Portal (app/portal/page.tsx,
 * 'use client'), que lo llama directo en cliente al elegir proyecto/grupo.
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
