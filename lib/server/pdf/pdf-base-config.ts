/**
 * PDF Base Configuration
 * Configuración centralizada y reutilizable para todos los PDFs de Serenata ERP
 * Asegura consistencia visual y facilita cambios globales
 */

import { jsPDF } from 'jspdf'

export const PDF_CONFIG = {
  // Márgenes en puntos (pt)
  margins: {
    top: 40,
    right: 40,
    bottom: 40,
    left: 40,
  },

  // Colores en RGB (para jsPDF)
  colors: {
    primary: [255, 128, 0], // #ff8000 - Naranja Serenata
    text: [26, 26, 26], // #1a1a1a - Text oscuro
    lightText: [110, 110, 110], // #6e6e6e - Text gris
    lightBg: [245, 245, 245], // #f5f5f5 - Fondo claro
    headerBg: [26, 26, 26], // #1a1a1a - Header oscuro
    white: [255, 255, 255], // Blanco
  },

  // Tamaños de fuente
  fonts: {
    title: 22,      // Títulos principales (ORDEN DE PAGO, COTIZACIÓN)
    heading: 14,    // Encabezados de sección
    subheading: 11, // Subtítulos
    body: 10,       // Texto normal
    small: 9,       // Texto pequeño (tablas)
  },

  // Líneas y bordes
  lines: {
    weight: 2,       // Grosor de líneas principales
    color: [249, 115, 22], // Color naranja para líneas destacadas [rgb aprox de #f97316]
    gridWeight: 0.15, // Grosor de líneas de cuadrículas
    gridColor: [235, 235, 235], // Color de cuadrícula
  },

  // Configuración de página
  page: {
    unit: 'pt' as const,
    format: 'a4' as const,
  },
}

/**
 * Dibuja un header estándar con título y fecha
 */
export function drawPdfHeader(
  doc: jsPDF,
  title: string,
  subtitle?: string,
  showDate: boolean = true
): number {
  const margin = PDF_CONFIG.margins.left
  let currentY = PDF_CONFIG.margins.top

  // Título principal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(PDF_CONFIG.fonts.title)
  doc.setTextColor(...PDF_CONFIG.colors.text)
  doc.text(title, margin, currentY)
  currentY += 16

  // Subtítulo opcional
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(PDF_CONFIG.fonts.small)
    doc.setTextColor(...PDF_CONFIG.colors.lightText)
    doc.text(subtitle, margin, currentY)
    currentY += 12
  }

  // Fecha (si aplica)
  if (showDate) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(PDF_CONFIG.fonts.small)
    doc.setTextColor(...PDF_CONFIG.colors.lightText)
    const today = new Date().toLocaleDateString('es-MX')
    doc.text(`Generado: ${today}`, margin, currentY)
    currentY += 4
  }

  // Línea separadora
  const pageWidth = doc.internal.pageSize.getWidth()
  doc.setDrawColor(...PDF_CONFIG.lines.color)
  doc.setLineWidth(PDF_CONFIG.lines.weight)
  doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10)

  return currentY + 28
}

/**
 * Dibuja una línea separadora
 */
export function drawDivider(doc: jsPDF, currentY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = PDF_CONFIG.margins.left

  doc.setDrawColor(...PDF_CONFIG.lines.color)
  doc.setLineWidth(PDF_CONFIG.lines.weight)
  doc.line(margin, currentY, pageWidth - margin, currentY)

  return currentY + 16
}

/**
 * Dibuja un encabezado de sección
 */
export function drawSectionHeading(
  doc: jsPDF,
  text: string,
  currentY: number,
  color?: 'primary' | 'dark'
): number {
  const margin = PDF_CONFIG.margins.left

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(PDF_CONFIG.fonts.heading)
  const textColor = color === 'primary' ? PDF_CONFIG.colors.primary : PDF_CONFIG.colors.text
  doc.setTextColor(...textColor)
  doc.text(text, margin, currentY)

  return currentY + 8
}

/**
 * Verifica si hay espacio en la página actual. Si no, añade una nueva página
 */
export function checkPageSpace(
  doc: jsPDF,
  currentY: number,
  requiredSpace: number = 100
): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  const bottomMargin = PDF_CONFIG.margins.bottom

  if (currentY + requiredSpace > pageHeight - bottomMargin) {
    doc.addPage()
    return PDF_CONFIG.margins.top
  }

  return currentY
}

/**
 * Formato de moneda para PDFs (MXN)
 */
export function formatCurrencyPdf(amount: number): string {
  return '$ ' + (amount || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formato de fecha en español para PDFs
 */
export function formatDatePdf(dateString: string | null): string {
  if (!dateString) return '—'

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]

  const parts = dateString.split('-')
  if (parts.length !== 3) return dateString

  const [year, month, day] = parts.map(Number)
  return `${day} de ${meses[month - 1]} ${year}`
}
