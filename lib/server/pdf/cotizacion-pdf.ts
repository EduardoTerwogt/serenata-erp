/**
 * Generador de PDF de Cotización - Server-side
 * Migrado desde lib/pdf.ts para ejecutarse en servidor
 * Reutiliza estilos de pdf-base-config y helpers extraídos de layout
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrencyPdf } from '@/lib/server/pdf/pdf-base-config'
import { CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf-types'
import {
  ISO_RATIO,
  SERENATA_RATIO,
  buildHeaderBody,
  buildItemsBody,
  buildTotalsRows,
  calculateDiscount,
  getCancelacionText,
  getCostosText,
  getGeneralesText,
  getIsoLogoBase64,
  getSerenataLogoBase64,
} from '@/lib/server/pdf/cotizacion-pdf-helpers'

/**
 * Genera PDF de cotización en server-side
 * Retorna ArrayBuffer para servir como descarga
 */
export function generateCotizacionPdf(data: CotizacionPDFData): ArrayBuffer {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 11.5
  const contentW = pageW - 2 * margin

  const isoLogoPng = getIsoLogoBase64()
  const serenataLogoPng = getSerenataLogoBase64()
  const descuento = calculateDiscount(data)

  autoTable(doc, {
    startY: 10,
    margin: { left: margin, right: 39 },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 1.35, right: 2.1, bottom: 1.35, left: 2.1 },
      valign: 'middle' as const,
      textColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.15,
      lineColor: [235, 235, 235] as [number, number, number],
    },
    body: buildHeaderBody(data),
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 44,
        fillColor: [26, 26, 26] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
      },
      1: {
        cellWidth: 64,
        fillColor: [255, 255, 255] as [number, number, number],
      },
    },
  })

  if (isoLogoPng) {
    const headerFinalY = (doc as any).lastAutoTable.finalY
    const isoH = headerFinalY - 10
    const isoW = isoH * ISO_RATIO
    try {
      doc.addImage(isoLogoPng, pageW - margin - isoW, 10, isoW, isoH)
    } catch (e) {
      console.warn('Error añadiendo logo ISO:', e)
    }
  }

  let currentY = (doc as any).lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('RESUMEN:', margin, currentY)
  currentY += 8

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Categoría', 'Descripción', 'Cant.', 'P. Unitario', 'Importe', 'Total categoría']],
    body: buildItemsBody(data),
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.23, right: 2.1, bottom: 1.23, left: 2.1 },
      textColor: [0, 0, 0] as [number, number, number],
      lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 } as any,
      lineColor: [235, 235, 235] as [number, number, number],
    },
    headStyles: {
      fillColor: [26, 26, 26] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: { top: 1.75, right: 2.1, bottom: 1.75, left: 2.1 },
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 73 },
      2: { cellWidth: 13, halign: 'center' as const },
      3: { cellWidth: 24, halign: 'right' as const },
      4: { cellWidth: 24, halign: 'right' as const },
      5: {
        cellWidth: 29,
        halign: 'right' as const,
        fontStyle: 'bold',
        lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0.15 } as any,
        lineColor: [235, 235, 235] as [number, number, number],
      },
    },
  })

  currentY = (doc as any).lastAutoTable.finalY + 5.5
  const rightColW = 72
  const leftColW = contentW - rightColW
  const totalsRows = buildTotalsRows(data, descuento)

  const rowH = 5.5
  const rowGap = 1.6
  const padV = 3.1
  const totalRowsH = totalsRows.length * rowH + (totalsRows.length - 1) * rowGap
  const bannerH = Math.max(totalRowsH + padV * 2, 28)

  if (currentY + bannerH > 270) {
    doc.addPage()
    currentY = 15
  }

  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, contentW, bannerH, 'F')

  if (serenataLogoPng) {
    const padH = 4.9
    const maxLogoW = leftColW - padH * 2
    const logoW = maxLogoW
    const logoH = logoW / SERENATA_RATIO
    const logoX = margin + padH
    const logoY = currentY + (bannerH - logoH) / 2
    try {
      doc.addImage(serenataLogoPng, logoX, logoY, logoW, logoH)
    } catch (e) {
      console.warn('Error añadiendo logo Serenata:', e)
    }
  }

  const rightZoneX = margin + leftColW
  const padRight = 7
  const valueMinW = 30
  const gapLV = 1.4
  const valueRightX = rightZoneX + rightColW - padRight
  const labelRightX = valueRightX - valueMinW - gapLV
  let ty = currentY + padV + rowH * 0.75

  totalsRows.forEach((row, i) => {
    if (i > 0) ty += rowH + rowGap
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(row.fontSize)
    doc.setTextColor(...row.labelColor)
    doc.text(row.label, labelRightX, ty, { align: 'right' })
    doc.setTextColor(...row.valueColor)
    doc.text(row.value, valueRightX, ty, { align: 'right' })
  })

  currentY = currentY + bannerH + 8.8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.6)
  doc.setTextColor(0, 0, 0)
  doc.text('GENERALES:', margin, currentY)
  const gw = doc.getTextWidth('GENERALES:')
  doc.line(margin, currentY + 0.8, margin + gw, currentY + 0.8)
  currentY += 4.8

  const generales = getGeneralesText()

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  const line1 = doc.splitTextToSize(generales.line1, contentW)
  doc.text(line1, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += line1.length * 4.55

  doc.setFont('helvetica', 'normal')
  const line2 = doc.splitTextToSize(generales.line2, contentW)
  doc.text(line2, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += line2.length * 4.55 + 1.0

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const costosLabelW = doc.getTextWidth('COSTOS') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, costosLabelW, 6, 'F')
  doc.text('COSTOS', margin + 3, currentY + 4.2)
  currentY += 6 + 6.2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(17, 17, 17)
  const costos = doc.splitTextToSize(getCostosText(), contentW)
  doc.text(costos, margin, currentY)
  currentY += costos.length * 4.55

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const cancelLabelW = doc.getTextWidth('CANCELACIÓN') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, cancelLabelW, 6, 'F')
  doc.text('CANCELACIÓN', margin + 3, currentY + 4.2)
  currentY += 6 + 6.2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(17, 17, 17)
  const cancelacion = doc.splitTextToSize(getCancelacionText(), contentW)
  doc.text(cancelacion, margin, currentY, { align: 'justify', maxWidth: contentW })

  return doc.output('arraybuffer') as ArrayBuffer
}

export type { CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf-types'
