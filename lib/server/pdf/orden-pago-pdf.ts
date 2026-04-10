import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { OrdenPagoPreviewResult } from '@/lib/server/ordenes-pago/build'

export function generateOrdenPagoPdf(preview: OrdenPagoPreviewResult): Uint8Array {
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  let currentY = 46

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(26, 26, 26)
  doc.text('ORDEN DE PAGO', margin, currentY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 110, 110)
  currentY += 16
  doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, margin, currentY)

  doc.setDrawColor(249, 115, 22)
  doc.setLineWidth(2)
  doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10)
  currentY += 28

  preview.responsables.forEach((responsable, index) => {
    if (currentY > pageHeight - 140) {
      doc.addPage()
      currentY = 46
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(249, 115, 22)
    doc.text(responsable.responsable.nombre, margin, currentY)
    currentY += 16

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(90, 90, 90)
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

    responsable.eventos.forEach((evento) => {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.setFillColor(245, 245, 245)
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 6, 6, 'F')
      doc.text(`${evento.proyecto} (${evento.cotizacion_folio})`, margin + 10, currentY + 15)
      currentY += 28

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [['Cargo / Descripción', 'Cantidad', 'Monto']],
        body: evento.items.map((item) => [
          item.descripcion,
          String(item.cantidad),
          `$${item.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        ]),
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 6,
        },
        headStyles: {
          fillColor: [232, 232, 232],
          textColor: [34, 34, 34],
        },
        bodyStyles: {
          textColor: [50, 50, 50],
        },
      })

      currentY = (doc as any).lastAutoTable.finalY + 8

      doc.setFont('helvetica', 'bold')
      doc.setFillColor(255, 243, 224)
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, 22, 6, 6, 'F')
      doc.text(
        `TOTAL EVENTO: $${evento.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        pageWidth - margin - 10,
        currentY + 15,
        { align: 'right' }
      )
      currentY += 34
    })

    doc.setFont('helvetica', 'bold')
    doc.setFillColor(255, 237, 213)
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 26, 8, 8, 'F')
    doc.text(
      `TOTAL ${responsable.responsable.nombre.toUpperCase()}: $${responsable.total_responsable.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      pageWidth - margin - 10,
      currentY + 17,
      { align: 'right' }
    )
    currentY += index === preview.responsables.length - 1 ? 34 : 42
  })

  if (currentY > pageHeight - 90) {
    doc.addPage()
    currentY = 46
  }

  doc.setDrawColor(249, 115, 22)
  doc.setLineWidth(1.5)
  doc.line(margin, currentY, pageWidth - margin, currentY)
  currentY += 28

  doc.setFillColor(249, 115, 22)
  doc.roundedRect(pageWidth - 260, currentY - 18, 220, 34, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.text(
    `TOTAL GENERAL: $${preview.resumen.total_general.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    pageWidth - 50,
    currentY + 3,
    { align: 'right' }
  )

  return new Uint8Array(doc.output('arraybuffer'))
}
