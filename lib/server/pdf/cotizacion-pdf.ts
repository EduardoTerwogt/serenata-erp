/**
 * Generador de PDF de Cotización - Server-side
 * Migrado desde lib/pdf.ts para ejecutarse en servidor
 * Reutiliza estilos de pdf-base-config
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import fs from 'fs'
import path from 'path'
import { PDF_CONFIG, formatCurrencyPdf } from '@/lib/server/pdf/pdf-base-config'

export interface CotizacionPDFData {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  fecha_cotizacion: string | null
  items: Array<{
    categoria: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    importe: number
  }>
  subtotal: number
  fee_agencia: number
  general: number
  iva: number
  total: number
  iva_activo: boolean
  porcentaje_fee: number
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

const ISO_LOGO_PATH = path.join(process.cwd(), 'public', 'logo iso.png')
const SERENATA_LOGO_PATH = path.join(process.cwd(), 'public', 'serenata naranja.png')

const ISO_RATIO = 447 / 448
const SERENATA_RATIO = 441 / 62

/**
 * Lee un archivo de imagen y lo convierte a base64 data URL
 * Para uso en server-side
 */
function loadImageAsBase64(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Imagen no encontrada: ${filePath}`)
      return null
    }
    const buffer = fs.readFileSync(filePath)
    const ext = filePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    return `data:image/${ext};base64,${buffer.toString('base64')}`
  } catch (error) {
    console.warn(`Error cargando imagen ${filePath}:`, error)
    return null
  }
}

/**
 * Formatea fecha en español
 */
function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const parts = fecha.split('-')
  if (parts.length !== 3) return fecha
  const [year, month, day] = parts.map(Number)
  return `${day} de ${meses[month - 1]} ${year}`
}

/**
 * Genera PDF de cotización en server-side
 * Retorna ArrayBuffer para servir como descarga
 */
export function generateCotizacionPdf(data: CotizacionPDFData): ArrayBuffer {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 11.5
  const contentW = pageW - 2 * margin

  // Cargar logos
  const isoLogoPng = loadImageAsBase64(ISO_LOGO_PATH)
  const serenataLogoPng = loadImageAsBase64(SERENATA_LOGO_PATH)

  // Calcular descuento
  const descuento = data.descuento_tipo === 'porcentaje'
    ? data.general * (data.descuento_valor / 100)
    : data.descuento_valor

  // Header con información
  const headerBody = [
    ['Cliente:', data.cliente],
    ['Proyecto:', data.proyecto],
    ['Fecha de entrega:', formatFecha(data.fecha_entrega)],
    ['Locación:', data.locacion || '—'],
    ['Fecha de cotización:', formatFecha(data.fecha_cotizacion)],
    ['# Cotización', data.id],
  ]

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
    body: headerBody,
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

  // Añadir logo ISO
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

  // Tabla de items
  let currentY = (doc as any).lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('RESUMEN:', margin, currentY)
  currentY += 8

  // Agrupar items por categoría
  const categories: string[] = []
  data.items.forEach(item => {
    if (!categories.includes(item.categoria)) categories.push(item.categoria)
  })

  const itemsBody: any[][] = []
  categories.forEach((cat, catIdx) => {
    const catItems = data.items.filter(i => i.categoria === cat)
    const catTotal = catItems.reduce((s, i) => s + (i.importe || 0), 0)
    const isLastCat = catIdx === categories.length - 1

    catItems.forEach((item, idx) => {
      const noPrice = !item.precio_unitario || !item.cantidad
      const precioCell = noPrice ? '$ - ,00' : formatCurrencyPdf(item.precio_unitario)
      const importeCell = noPrice ? '$ - ,00' : formatCurrencyPdf(item.importe)

      itemsBody.push([
        idx === 0 ? { content: cat, styles: { fontStyle: 'bolditalic' } } : '',
        item.descripcion,
        item.cantidad || '',
        precioCell,
        importeCell,
        idx === 0 ? formatCurrencyPdf(catTotal) : '',
      ])
    })

    itemsBody.push([
      {
        content: '',
        colSpan: 6,
        styles: {
          minCellHeight: isLastCat ? 11.3 : 5.6,
          fillColor: [255, 255, 255] as [number, number, number],
          lineWidth: 0,
        },
      },
    ])
  })

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Categoría', 'Descripción', 'Cant.', 'P. Unitario', 'Importe', 'Total categoría']],
    body: itemsBody,
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

  // Totales
  currentY = (doc as any).lastAutoTable.finalY + 5.5
  const rightColW = 72
  const leftColW = contentW - rightColW

  type TotalsRow = {
    label: string
    value: string
    labelColor: [number, number, number]
    valueColor: [number, number, number]
    bold: boolean
    fontSize: number
  }

  const ORANGE: [number, number, number] = [249, 115, 22]
  const WHITE: [number, number, number] = [255, 255, 255]
  const GRAY: [number, number, number] = [187, 187, 187]
  const YELLOW: [number, number, number] = [245, 208, 66]

  const totalsRows: TotalsRow[] = [
    {
      label: 'Subtotal',
      value: formatCurrencyPdf(data.subtotal),
      labelColor: GRAY,
      valueColor: WHITE,
      bold: false,
      fontSize: 9.5,
    },
    {
      label: 'Fee de agencia',
      value: formatCurrencyPdf(data.fee_agencia),
      labelColor: GRAY,
      valueColor: WHITE,
      bold: false,
      fontSize: 9.5,
    },
    {
      label: 'General',
      value: formatCurrencyPdf(data.general),
      labelColor: ORANGE,
      valueColor: ORANGE,
      bold: true,
      fontSize: 10.5,
    },
    ...(descuento > 0
      ? [
          {
            label: 'Descuento',
            value: `-${formatCurrencyPdf(descuento)}`,
            labelColor: YELLOW,
            valueColor: YELLOW,
            bold: false,
            fontSize: 9.5,
          },
        ]
      : []),
    ...(data.iva_activo
      ? [
          {
            label: 'IVA (16%)',
            value: formatCurrencyPdf(data.iva),
            labelColor: GRAY,
            valueColor: WHITE,
            bold: false,
            fontSize: 9.5,
          },
        ]
      : []),
    {
      label: 'TOTAL',
      value: formatCurrencyPdf(data.total),
      labelColor: WHITE,
      valueColor: WHITE,
      bold: true,
      fontSize: 10.5,
    },
  ]

  // Banner con totales
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

  // Logo Serenata
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

  // Números de totales
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

  // Generales (términos y condiciones)
  currentY = currentY + bannerH + 8.8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.6)
  doc.setTextColor(0, 0, 0)
  doc.text('GENERALES:', margin, currentY)
  const gw = doc.getTextWidth('GENERALES:')
  doc.line(margin, currentY + 0.8, margin + gw, currentY + 0.8)
  currentY += 4.8

  const generalesLine1 =
    'Serenata House se deslinda de cualquier daño o pérdida durante la actividad contratada, salvo de los materiales de producción y el inmueble (en caso de que haya uno contratado).'
  const generalesLine2 = 'Cualquier trabajo o elemento adicional será autorizado por el cliente'

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  const line1 = doc.splitTextToSize(generalesLine1, contentW)
  doc.text(line1, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += line1.length * 4.55

  doc.setFont('helvetica', 'normal')
  const line2 = doc.splitTextToSize(generalesLine2, contentW)
  doc.text(line2, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += line2.length * 4.55 + 1.0

  // Costos
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const costosLabelW = doc.getTextWidth('COSTOS') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, costosLabelW, 6, 'F')
  doc.text('COSTOS', margin + 3, currentY + 4.2)
  currentY += 6 + 6.2

  const costosText =
    'Este presupuesto es 100 % modular y se adaptará a las necesidades del cliente.\nUna vez aterrizada la propuesta al 100 % se ajustarán los costos.\nEste presupuesto es estimativo para desarrollar las actividades mencionadas.\nSe requiere el 50% al contratar el servicio / 50% al finalizar'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(17, 17, 17)
  const costos = doc.splitTextToSize(costosText, contentW)
  doc.text(costos, margin, currentY)
  currentY += costos.length * 4.55

  // Cancelación
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const cancelLabelW = doc.getTextWidth('CANCELACIÓN') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, cancelLabelW, 6, 'F')
  doc.text('CANCELACIÓN', margin + 3, currentY + 4.2)
  currentY += 6 + 6.2

  const cancelacionText =
    'En caso de cancelación deberá hacerse por escrito con acuse de recibo con 192 horas habiles de anticipacion, toda cancelación realizada por este término genera un cargo del 60% del total generado en la cotización independientemente de que el cliente pagará cualquier tipo de gasto económico que se haya realizado para cumplir con esta cotización los cuales deberán de ser debidamente comprobados al cliente. Todo servicio o equipo adicional al evento se documentará en hojas de cargo o misceláneo que formará parte de este instrumento. El cliente será responsable del equipo cuando lo reciba y cuidará de su total integridad y seguridad. En caso de no reintegrarse después de terminado el servicio cotizado, genera un cobro proporcional por dia de retrazo. Se puede confirmar esta cotizacion via mail , pero siempre en los términos de estas condiciones\nSi la cancelación es recibida con menos de 48 horas antes del evento se cargará 100% del total'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(17, 17, 17)
  const cancelacion = doc.splitTextToSize(cancelacionText, contentW)
  doc.text(cancelacion, margin, currentY, { align: 'justify', maxWidth: contentW })

  return doc.output('arraybuffer') as ArrayBuffer
}
