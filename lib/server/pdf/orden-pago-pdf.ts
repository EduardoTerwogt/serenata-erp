import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { OrdenPagoPreviewResult } from '@/lib/server/ordenes-pago/build'
import {
  PDF_CONFIG,
  checkPageSpace,
  formatCurrencyPdf,
} from '@/lib/server/pdf/pdf-base-config'

export function generateOrdenPagoPdf(preview: OrdenPagoPreviewResult): ArrayBuffer {
  const doc = new jsPDF(PDF_CONFIG.page)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = PDF_CONFIG.margins.left

  // Header
  let currentY = PDF_CONFIG.margins.top
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(PDF_CONFIG.fonts.title)
  doc.setTextColor(...PDF_CONFIG.colors.text)
  doc.text('ORDEN DE PAGO', margin, currentY)

  currentY += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(PDF_CONFIG.fonts.small)
  doc.setTextColor(...PDF_CONFIG.colors.lightText)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, margin, currentY)

  // Línea separadora
  currentY += 10
  doc.setDrawColor(...PDF_CONFIG.lines.color)
  doc.setLineWidth(PDF_CONFIG.lines.weight)
  doc.line(margin, currentY, pageWidth - margin, currentY)
  currentY += 28

  // Responsables
  preview.responsables.forEach((responsable, index) => {
    // Verificar espacio en página
    currentY = checkPageSpace(doc, currentY, 140)

    // Nombre del responsable
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(PDF_CONFIG.fonts.heading)
    doc.setTextColor(...PDF_CONFIG.colors.primary)
    doc.text(responsable.responsable.nombre, margin, currentY)
    currentY += 16

    // Datos de contacto
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(PDF_CONFIG.fonts.body)
    doc.setTextColor(...PDF_CONFIG.colors.lightText)
    const contacto = [
      responsable.responsable.correo ? `Correo: ${responsable.responsable.correo}` : null,
      responsable.responsable.telefono ? `Tel: ${responsable.responsable.telefono}` : null,
      responsable.responsable.banco ? `Banco: ${responsable.responsable.banco}` : null,
      responsable.responsable.clabe ? `CLABE: ${responsable.responsable.clabe}` : null,
    ].filter(Boolean).join(' · ')

    if (contacto) {
      doc.text(contacto, margin, currentY)
      currentY += 16
    }

    // Eventos
    responsable.eventos.forEach((evento) => {
      // Caja de evento
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...PDF_CONFIG.colors.text)
      doc.setFillColor(...PDF_CONFIG.colors.lightBg)
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 6, 6, 'F')
      doc.text(`${evento.proyecto} (${evento.cotizacion_folio})`, margin + 10, currentY + 15)
      currentY += 28

      // Tabla de items
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [['Cargo / Descripción', 'Cantidad', 'Monto']],
        body: evento.items.map((item) => [
          item.descripcion,
          String(item.cantidad),
          formatCurrencyPdf(item.monto),
        ]),
        theme: 'grid',
        styles: {
          fontSize: PDF_CONFIG.fonts.small,
          cellPadding: 6,
          lineColor: PDF_CONFIG.lines.gridColor,
          lineWidth: PDF_CONFIG.lines.gridWeight,
          textColor: PDF_CONFIG.colors.text,
        },
        headStyles: {
          fillColor: [232, 232, 232],
          textColor: PDF_CONFIG.colors.text,
          fontStyle: 'bold',
        },
        bodyStyles: {
          textColor: PDF_CONFIG.colors.text,
        },
      })

      currentY = (doc as any).lastAutoTable.finalY + 8

      // Total del evento
      doc.setFont('helvetica', 'bold')
      doc.setFillColor(255, 243, 224)
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 6, 6, 'F')
      doc.setTextColor(...PDF_CONFIG.colors.text)
      doc.setFontSize(PDF_CONFIG.fonts.body)
      doc.text(
        `TOTAL EVENTO: ${formatCurrencyPdf(evento.subtotal)}`,
        pageWidth - margin - 10,
        currentY + 15,
        { align: 'right' }
      )
      currentY += 34
    })

    // Total del responsable
    doc.setFont('helvetica', 'bold')
    doc.setFillColor(255, 237, 213)
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 26, 8, 8, 'F')
    doc.setTextColor(...PDF_CONFIG.colors.text)
    doc.setFontSize(PDF_CONFIG.fonts.heading)
    doc.text(
      `TOTAL ${responsable.responsable.nombre.toUpperCase()}: ${formatCurrencyPdf(responsable.total_responsable)}`,
      pageWidth - margin - 10,
      currentY + 17,
      { align: 'right' }
    )
    currentY += index === preview.responsables.length - 1 ? 34 : 42
  })

  // Footer con total general
  currentY = checkPageSpace(doc, currentY, 90)

  doc.setDrawColor(...PDF_CONFIG.lines.color)
  doc.setLineWidth(1.5)
  doc.line(margin, currentY, pageWidth - margin, currentY)
  currentY += 28

  // Caja de total general
  doc.setFillColor(...PDF_CONFIG.colors.primary)
  doc.roundedRect(pageWidth - 260, currentY - 18, 220, 34, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_CONFIG.colors.white)
  doc.setFontSize(PDF_CONFIG.fonts.heading)
  doc.text(
    `TOTAL GENERAL: ${formatCurrencyPdf(preview.resumen.total_general)}`,
    pageWidth - 50,
    currentY + 3,
    { align: 'right' }
  )

  return doc.output('arraybuffer') as ArrayBuffer
}
