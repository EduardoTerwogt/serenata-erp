/**
 * Server-side "Reporte de Cierre" PDF Generator (Fase 5.2 Bloque 4)
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { JsPDFWithAutoTable } from '@/lib/server/pdf/pdf-base-config'
import { formatDateDisplay } from '@/lib/format-date'

export interface ReporteCierrePdfData {
  proyecto: string
  cliente: string
  fecha_cierre: string
  financiero: { total_cotizado: number; total_cobrado: number; total_pagado: number }
  hitos: { titulo: string; planeado: string | null; real: string | null }[]
  incidencias: string
  equipo: { nombre: string; roles: string[] }[]
}

function fmtMoney(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generateReporteCierrePdf(data: ReporteCierrePdfData): ArrayBuffer {
  const doc = new jsPDF('p', 'mm', 'a4')
  const margin = 14
  const pageW = 210
  const contentW = pageW - 2 * margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(0, 0, 0)
  doc.text('REPORTE DE CIERRE', margin, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 100, 100)
  doc.text(data.proyecto, margin, 28)
  doc.setFontSize(10)
  doc.text(`${data.cliente} · Cerrado el ${formatDateDisplay(data.fecha_cierre)}`, margin, 34)

  let currentY = 44

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Cotizado', 'Cobrado real', 'Pagado a proveedores']],
    body: [[
      `$${fmtMoney(data.financiero.total_cotizado)}`,
      `$${fmtMoney(data.financiero.total_cobrado)}`,
      `$${fmtMoney(data.financiero.total_pagado)}`,
    ]],
    styles: { fontSize: 10, cellPadding: 3, textColor: [0, 0, 0] as [number, number, number], halign: 'center' },
    headStyles: { fillColor: [50, 50, 50] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
  })

  currentY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10

  doc.setFillColor(0, 0, 0)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('EQUIPO Y PROVEEDORES PARTICIPANTES', margin + 2, currentY + 5.5)
  currentY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const equipoTexto = data.equipo.length > 0
    ? data.equipo.map((m) => m.roles.length > 0 ? `${m.nombre} (${m.roles.join(', ')})` : m.nombre).join(', ')
    : 'Sin equipo registrado.'
  const equipoWrapped = doc.splitTextToSize(equipoTexto, contentW)
  doc.text(equipoWrapped, margin, currentY + 5)
  currentY += equipoWrapped.length * 4.8 + 10

  if (currentY > 240) {
    doc.addPage()
    currentY = 15
  }

  doc.setFillColor(0, 0, 0)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('CRONOGRAMA REAL VS. PLANEADO', margin + 2, currentY + 5.5)
  currentY += 10

  if (data.hitos.length > 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Hito', 'Planeado', 'Real']],
      body: data.hitos.map((h) => [h.titulo, formatDateDisplay(h.planeado), formatDateDisplay(h.real)]),
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
      headStyles: { fillColor: [50, 50, 50] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    })
    currentY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Sin hitos registrados.', margin, currentY + 5)
    currentY += 12
  }

  if (currentY > 250) {
    doc.addPage()
    currentY = 15
  }

  doc.setFillColor(0, 0, 0)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('INCIDENCIAS / LECCIONES APRENDIDAS', margin + 2, currentY + 5.5)
  currentY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const incidenciasTexto = data.incidencias.trim() || 'Sin incidencias registradas.'
  const incidenciasWrapped = doc.splitTextToSize(incidenciasTexto, contentW)
  doc.text(incidenciasWrapped, margin, currentY + 5)

  return doc.output('arraybuffer') as ArrayBuffer
}
