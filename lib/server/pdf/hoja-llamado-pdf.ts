/**
 * Server-side "Hoja de Llamado" PDF Generator
 * Genera PDFs con información de llamados para proyectos en producción
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import fs from 'fs'
import path from 'path'
import { PDF_CONFIG, formatDatePdf } from '@/lib/server/pdf/pdf-base-config'

export interface HojaDeLlamadoData {
  proyecto: string
  cliente: string
  fecha_entrega: string | null
  locacion: string | null
  horarios: string | null
  punto_encuentro: string | null
  notas: string | null
  items: Array<{
    id: string
    descripcion: string
    categoria: string
    cantidad: number
    responsable_id: string | null
    responsable_nombre: string | null
    notas?: string | null
  }>
  responsables: Array<{
    id: string
    nombre: string
    telefono: string | null
  }>
}

const ISO_LOGO_PATH = path.join(process.cwd(), 'public', 'logo iso.png')
const SERENATA_LOGO_PATH = path.join(process.cwd(), 'public', 'serenata naranja.png')

function loadImageAsBase64(filePath: string): string | null {
  try {
    const imageBuffer = fs.readFileSync(filePath)
    return `data:image/png;base64,${imageBuffer.toString('base64')}`
  } catch {
    console.warn(`[hoja-llamado] No se pudo cargar imagen: ${filePath}`)
    return null
  }
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]

  const parts = fecha.split('-')
  if (parts.length !== 3) return fecha

  const [year, month, day] = parts.map(Number)
  return `${day} de ${meses[month - 1]} ${year}`
}

export function generateHojaDeLlamadoPdf(data: HojaDeLlamadoData): ArrayBuffer {
  const doc = new jsPDF('p', 'mm', 'a4')
  const margin = 14
  const pageW = 210
  const contentW = pageW - 2 * margin

  const getPhone = (responsableId: string | null): string => {
    if (!responsableId) return ''
    const r = data.responsables.find(r => r.id === responsableId)
    return r?.telefono || ''
  }

  // Cargar logos
  const isoLogoPng = loadImageAsBase64(ISO_LOGO_PATH)
  const serenataLogoPng = loadImageAsBase64(SERENATA_LOGO_PATH)

  // Agregar logo ISO
  if (isoLogoPng) {
    try {
      doc.addImage(isoLogoPng, 163, 8, 30, 30)
    } catch {
      console.warn('[hoja-llamado] No se pudo agregar logo ISO')
    }
  }

  // Título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(0, 0, 0)
  doc.text('HOJA DE LLAMADO', margin, 20)

  // Subtítulo - Proyecto
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 100, 100)
  doc.text(data.proyecto, margin, 28)

  let currentY = 36

  // Tabla de información general
  const infoBody = [
    ['Fecha:', formatFecha(data.fecha_entrega)],
    ['Cliente:', data.cliente],
    ['Locación:', data.locacion || 'Por definir'],
    ['Horarios:', data.horarios || 'Por definir'],
    ['Punto de Encuentro:', data.punto_encuentro || 'Por definir'],
  ]

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: 80 },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
    body: infoBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 44, fillColor: [255, 255, 255] as [number, number, number] },
      1: { fillColor: [255, 255, 255] as [number, number, number] },
    },
  })

  currentY = (doc as any).lastAutoTable.finalY + 10

  // Notas Generales
  const notasGenerales = (data.notas || '').trim()
  if (notasGenerales) {
    doc.setFillColor(0, 0, 0)
    doc.rect(margin, currentY, contentW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('NOTAS GENERALES', margin + 2, currentY + 5.5)
    currentY += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    const wrappedNotas = doc.splitTextToSize(notasGenerales, contentW)
    doc.text(wrappedNotas, margin, currentY)
    currentY += wrappedNotas.length * 4.8 + 6
  }

  // Sección CREW
  const crewItems = data.items.filter(i => i.categoria?.toLowerCase() === 'crew')

  doc.setFillColor(0, 0, 0)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('CREW', margin + 2, currentY + 5.5)
  currentY += 10

  if (crewItems.length > 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Nombre', 'Rol', 'Teléfono', 'Hora de Llamado', 'Notas']],
      body: crewItems.map(item => [
        item.responsable_nombre || 'Sin asignar',
        item.descripcion,
        getPhone(item.responsable_id),
        '',
        item.notas || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
      headStyles: {
        fillColor: [50, 50, 50] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    })
    currentY = (doc as any).lastAutoTable.finalY + 10
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Sin crew asignado', margin, currentY + 5)
    currentY += 12
  }

  // Sección EQUIPO TÉCNICO
  const equipoItems = data.items.filter(i => i.categoria?.toLowerCase() !== 'crew')

  if (currentY > 240) {
    doc.addPage()
    currentY = 15
  }

  doc.setFillColor(0, 0, 0)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('EQUIPO TÉCNICO', margin + 2, currentY + 5.5)
  currentY += 10

  if (equipoItems.length > 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Descripción', 'Cant.', 'Responsable', 'Notas']],
      body: equipoItems.map(item => [
        item.descripcion,
        String(item.cantidad),
        item.responsable_nombre || 'Sin asignar',
        item.notas || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
      headStyles: {
        fillColor: [50, 50, 50] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    })
    currentY = (doc as any).lastAutoTable.finalY + 10
  }

  // Footer con logos
  if (currentY > 255) {
    doc.addPage()
    currentY = 15
  }

  if (serenataLogoPng) {
    try {
      doc.addImage(serenataLogoPng, margin, currentY, 60, 15)
    } catch {
      console.warn('[hoja-llamado] No se pudo agregar logo Serenata')
    }
  }

  const todayDate = new Date()
  const mesesPDF = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  const todayStr = `${todayDate.getDate()} de ${mesesPDF[todayDate.getMonth()]} ${todayDate.getFullYear()}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generado el ${todayStr}`, pageW - margin, currentY + 10, { align: 'right' })

  return doc.output('arraybuffer') as ArrayBuffer
}
