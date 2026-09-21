import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Integración de los 5 tracks paralelos de Bloques 2-3 (docs/PLAN.md
 * "Dependencias reales entre bloques"): PdfTemplateSchema (Track A) debe
 * bloquear un token de color (Track B) o una {{variable}} (Track C)
 * inexistentes, sin que Track A haya importado A/B/C entre sí.
 */

const BASE_PAGE = { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }

function textTemplate(colorToken: string, text: string) {
  return {
    tipoDocumento: 'cotizacion' as const,
    page: BASE_PAGE,
    elements: [
      {
        id: 'el-1',
        x: 10,
        y: 10,
        w: 50,
        type: 'text' as const,
        text,
        size: 10,
        bold: false,
        align: 'left' as const,
        colorToken,
      },
    ],
  }
}

describe('pdf-template-schema (integración A+B+C)', () => {
  it('acepta un token de color y una variable reales', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Cliente: {{cliente}}'))
    expect(result.success).toBe(true)
  })

  it('rechaza un token de color inexistente', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('no-existe', 'Cliente: {{cliente}}'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Token de color inválido'))).toBe(true)
    }
  })

  it('rechaza una variable inexistente para el tipo de documento', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Cliente: {{no_existe_esto}}'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Variable inexistente'))).toBe(true)
    }
  })

  it('rechaza una variable válida para otro documento pero no para cotizacion', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Banco: {{responsables[].responsable.banco}}'))
    expect(result.success).toBe(false)
  })
})
