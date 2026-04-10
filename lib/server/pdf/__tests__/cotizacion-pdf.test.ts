import { generateCotizacionPdf, CotizacionPDFData } from '../cotizacion-pdf'

/**
 * Test suite for server-side cotización PDF generator
 * Validates that the new implementation produces valid PDF output
 */
describe('generateCotizacionPdf', () => {
  const sampleData: CotizacionPDFData = {
    id: 'SH001',
    cliente: 'Test Cliente S.A.',
    proyecto: 'Show Monterrey 2026',
    fecha_entrega: '2026-06-15',
    locacion: 'Macroplaza, Monterrey',
    fecha_cotizacion: '2026-04-10',
    items: [
      {
        categoria: 'Producción',
        descripcion: 'Dirección de video',
        cantidad: 1,
        precio_unitario: 5000,
        importe: 5000,
      },
      {
        categoria: 'Producción',
        descripcion: 'Cinematografía',
        cantidad: 1,
        precio_unitario: 8000,
        importe: 8000,
      },
      {
        categoria: 'Post-Producción',
        descripcion: 'Edición',
        cantidad: 1,
        precio_unitario: 3000,
        importe: 3000,
      },
    ],
    subtotal: 16000,
    fee_agencia: 2000,
    general: 18000,
    iva: 2880,
    total: 20880,
    iva_activo: true,
    porcentaje_fee: 12.5,
    descuento_tipo: 'porcentaje',
    descuento_valor: 0,
  }

  it('should generate a valid PDF ArrayBuffer', () => {
    const pdfBuffer = generateCotizacionPdf(sampleData)

    // Verify it returns an ArrayBuffer
    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)

    // Verify it has content (non-zero length)
    expect(pdfBuffer.byteLength).toBeGreaterThan(0)

    // Verify minimum PDF size (should be at least a few KB for a populated PDF)
    expect(pdfBuffer.byteLength).toBeGreaterThan(5000)
  })

  it('should handle data with discount', () => {
    const dataWithDiscount: CotizacionPDFData = {
      ...sampleData,
      descuento_tipo: 'monto',
      descuento_valor: 1000,
      general: 17000,
      iva: 2720,
      total: 19720,
    }

    const pdfBuffer = generateCotizacionPdf(dataWithDiscount)

    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    expect(pdfBuffer.byteLength).toBeGreaterThan(5000)
  })

  it('should handle data without IVA', () => {
    const dataWithoutIVA: CotizacionPDFData = {
      ...sampleData,
      iva_activo: false,
      iva: 0,
      total: 18000,
    }

    const pdfBuffer = generateCotizacionPdf(dataWithoutIVA)

    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    expect(pdfBuffer.byteLength).toBeGreaterThan(5000)
  })

  it('should handle missing optional fields', () => {
    const minimalData: CotizacionPDFData = {
      id: 'SH002',
      cliente: 'Cliente Minimal',
      proyecto: 'Proyecto Minimal',
      fecha_entrega: null,
      locacion: null,
      fecha_cotizacion: '2026-04-10',
      items: [
        {
          categoria: 'General',
          descripcion: 'Servicio único',
          cantidad: 1,
          precio_unitario: 1000,
          importe: 1000,
        },
      ],
      subtotal: 1000,
      fee_agencia: 0,
      general: 1000,
      iva: 0,
      total: 1000,
      iva_activo: false,
      porcentaje_fee: 0,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    }

    const pdfBuffer = generateCotizacionPdf(minimalData)

    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    expect(pdfBuffer.byteLength).toBeGreaterThan(1000)
  })

  it('should generate consistent output for same input', () => {
    const pdf1 = generateCotizacionPdf(sampleData)
    const pdf2 = generateCotizacionPdf(sampleData)

    // Both should be ArrayBuffers
    expect(pdf1).toBeInstanceOf(ArrayBuffer)
    expect(pdf2).toBeInstanceOf(ArrayBuffer)

    // They should have the same size (jsPDF generates consistent PDFs for same input)
    expect(pdf1.byteLength).toBe(pdf2.byteLength)
  })
})
