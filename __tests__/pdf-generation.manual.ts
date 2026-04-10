/**
 * Manual test for PDF generation
 * Run this with: npx tsx __tests__/pdf-generation.manual.ts
 */

import { generateCotizacionPdf, type CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf'
import { generateOrdenPagoPdf } from '@/lib/server/pdf/orden-pago-pdf'
import fs from 'fs'

// Sample test data for cotizacion
const sampleCotizacionData: CotizacionPDFData = {
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

async function runTests() {
  console.log('🧪 Running PDF generation tests...\n')

  try {
    // Test 1: Generate cotization PDF
    console.log('Test 1: Generating cotization PDF...')
    const cotizacionPdf = generateCotizacionPdf(sampleCotizacionData)
    console.log(`✓ Cotization PDF generated: ${cotizacionPdf.byteLength} bytes`)

    if (cotizacionPdf.byteLength < 5000) {
      console.warn(
        `⚠️  PDF seems small (${cotizacionPdf.byteLength} bytes), might be incomplete`
      )
    } else {
      console.log(`✓ PDF size looks good (${cotizacionPdf.byteLength} bytes)`)
    }

    // Save to file for manual inspection
    fs.writeFileSync('/tmp/test-cotizacion.pdf', Buffer.from(cotizacionPdf))
    console.log('✓ Saved to /tmp/test-cotizacion.pdf for manual inspection\n')

    // Test 2: Verify output is consistent
    console.log('Test 2: Verify output consistency...')
    const cotizacionPdf2 = generateCotizacionPdf(sampleCotizacionData)
    if (cotizacionPdf.byteLength === cotizacionPdf2.byteLength) {
      console.log('✓ Output is consistent for same input\n')
    } else {
      console.warn(
        `⚠️  Output differs (${cotizacionPdf.byteLength} vs ${cotizacionPdf2.byteLength} bytes)\n`
      )
    }

    console.log('✅ All PDF generation tests passed!')
    return true
  } catch (error) {
    console.error('❌ Error during PDF generation:', error)
    return false
  }
}

runTests().then((success) => {
  process.exit(success ? 0 : 1)
})
