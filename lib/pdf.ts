// PDF generation for Serenata ERP — client-side only, imported dynamically

export interface PDFData {
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

const ISO_LOGO_PATH = '/logo iso.png'

const SERENATA_LOGO_PATH = '/serenata naranja.png'

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const parts = fecha.split('-')
  if (parts.length !== 3) return fecha
  const [year, month, day] = parts.map(Number)
  return `${day} de ${meses[month - 1]} ${year}`
}

function fmtPDF(n: number): string {
  return '$ ' + (n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ISO_RATIO = 447 / 448
const SERENATA_RATIO = 441 / 62

async function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`))
    img.src = encodeURI(src)
  })
}

export async function generarPDFCotizacion(data: PDFData): Promise<string> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  let isoLogoPng: string | null = null
  let serenataLogoPng: string | null = null
  try { isoLogoPng = await loadImageAsDataUrl(ISO_LOGO_PATH) } catch {}
  try { serenataLogoPng = await loadImageAsDataUrl(SERENATA_LOGO_PATH) } catch {}

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 11.5
  const contentW = pageW - 2 * margin

  const descuento = data.descuento_tipo === 'porcentaje' ? data.general * (data.descuento_valor / 100) : data.descuento_valor

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
      valign: 'middle' as 'middle',
      textColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.15,
      lineColor: [235, 235, 235] as [number, number, number],
    },
    body: headerBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 44, fillColor: [26, 26, 26] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] },
      1: { cellWidth: 64, fillColor: [255, 255, 255] as [number, number, number] },
    },
  })

  if (isoLogoPng) {
    const headerFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    const isoH = headerFinalY - 10
    const isoW = isoH * ISO_RATIO
    try { doc.addImage(isoLogoPng, pageW - margin - isoW, 10, isoW, isoH) } catch {}
  }

  let currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('RESUMEN:', margin, currentY)
  currentY += 8

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
      const precioCell = noPrice ? '$ - ,00' : fmtPDF(item.precio_unitario)
      const importeCell = noPrice ? '$ - ,00' : fmtPDF(item.importe)
      itemsBody.push([
        idx === 0 ? { content: cat, styles: { fontStyle: 'bolditalic' } } : '',
        item.descripcion,
        item.cantidad || '',
        precioCell,
        importeCell,
        idx === 0 ? fmtPDF(catTotal) : '',
      ])
    })
    itemsBody.push([{ content: '', colSpan: 6, styles: { minCellHeight: isLastCat ? 11.3 : 5.6, fillColor: [255,255,255] as [number,number,number], lineWidth: 0 } }])
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
      lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 } as { top: number; right: number; bottom: number; left: number },
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
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 29, halign: 'right', fontStyle: 'bold', lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0.15 } as { top: number; right: number; bottom: number; left: number }, lineColor: [235, 235, 235] as [number, number, number] },
    },
  })

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5.5
  const rightColW = 72
  const leftColW = contentW - rightColW
  type TotalsRow = { label: string; value: string; labelColor: [number,number,number]; valueColor: [number,number,number]; bold: boolean; fontSize: number }
  const ORANGE: [number,number,number] = [249, 115, 22]
  const WHITE: [number,number,number]  = [255, 255, 255]
  const GRAY: [number,number,number]   = [187, 187, 187]
  const YELLOW: [number,number,number] = [245, 208, 66]
  const totalsRows: TotalsRow[] = [
    { label: 'Subtotal', value: fmtPDF(data.subtotal), labelColor: GRAY, valueColor: WHITE, bold: false, fontSize: 9.5 },
    { label: 'Fee de agencia', value: fmtPDF(data.fee_agencia), labelColor: GRAY, valueColor: WHITE, bold: false, fontSize: 9.5 },
    { label: 'General', value: fmtPDF(data.general), labelColor: ORANGE, valueColor: ORANGE, bold: true, fontSize: 10.5 },
    ...(descuento > 0 ? [{ label: 'Descuento', value: `-${fmtPDF(descuento)}`, labelColor: YELLOW, valueColor: YELLOW, bold: false, fontSize: 9.5 }] : []),
    ...(data.iva_activo ? [{ label: 'IVA (16%)', value: fmtPDF(data.iva), labelColor: GRAY, valueColor: WHITE, bold: false, fontSize: 9.5 }] : []),
    { label: 'TOTAL', value: fmtPDF(data.total), labelColor: WHITE, valueColor: WHITE, bold: true, fontSize: 10.5 },
  ]

  const rowH = 5.5
  const rowGap = 1.6
  const padV = 3.1
  const totalRowsH = totalsRows.length * rowH + (totalsRows.length - 1) * rowGap
  const bannerH = Math.max(totalRowsH + padV * 2, 28)
  if (currentY + bannerH > 270) { doc.addPage(); currentY = 15 }
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, contentW, bannerH, 'F')

  if (serenataLogoPng) {
    const padH = 4.9
    const maxLogoW = leftColW - padH * 2
    const logoW = maxLogoW
    const logoH = logoW / SERENATA_RATIO
    const logoX = margin + padH
    const logoY = currentY + (bannerH - logoH) / 2
    try { doc.addImage(serenataLogoPng, logoX, logoY, logoW, logoH) } catch {}
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

  const generalesLine1 = 'Serenata House se deslinda de cualquier daño o pérdida durante la actividad contratada, salvo de los materiales de producción y el inmueble (en caso de que haya uno contratado).'
  const generalesLine2 = 'Cualquier trabajo o elemento adicional será autorizado por el cliente'
  const costosText = 'Este presupuesto es 100 % modular y se adaptará a las necesidades del cliente.\nUna vez aterrizada la propuesta al 100 % se ajustarán los costos.\nEste presupuesto es estimativo para desarrollar las actividades mencionadas.\nSe requiere el 50% al contratar el servicio / 50% al finalizar'
  const cancelacionText = 'En caso de cancelación deberá hacerse por escrito con acuse de recibo con 192 horas habiles de anticipacion, toda cancelación realizada por este término genera un cargo del 60% del total generado en la cotización independientemente de que el cliente pagará cualquier tipo de gasto económico que se haya realizado para cumplir con esta cotización los cuales deberán de ser debidamente comprobados al cliente. Todo servicio o equipo adicional al evento se documentará en hojas de cargo o misceláneo que formará parte de este instrumento. El cliente será responsable del equipo cuando lo reciba y cuidará de su total integridad y seguridad. En caso de no reintegrarse después de terminado el servicio cotizado, genera un cobro proporcional por dia de retrazo. Se puede confirmar esta cotizacion via mail , pero siempre en los términos de estas condiciones\nSi la cancelación es recibida con menos de 48 horas antes del evento se cargará 100% del total'

  let noticesBodyFontSize = 8.5
  let noticesLineH = 4.55
  let noticesTitleGap = 4.8
  let noticesSectionGap = 1.0
  let noticesLabelToTextGap = 6.2
  const gapBetweenBannerAndGenerales = 8.8

  const measureNotices = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(noticesBodyFontSize)
    const line1 = doc.splitTextToSize(generalesLine1, contentW)
    doc.setFont('helvetica', 'normal')
    const line2 = doc.splitTextToSize(generalesLine2, contentW)
    const costos = doc.splitTextToSize(costosText, contentW)
    const [cancelacionP1, cancelacionP2 = ''] = cancelacionText.split('\n')
    const cancelacion1 = doc.splitTextToSize(cancelacionP1, contentW)
    const cancelacion2 = cancelacionP2 ? doc.splitTextToSize(cancelacionP2, contentW) : []
    const cancelacionAll = [...cancelacion1, ...cancelacion2]
    const blockH =
      gapBetweenBannerAndGenerales +
      noticesTitleGap +
      line1.length * noticesLineH +
      line2.length * noticesLineH +
      noticesSectionGap +
      6 + noticesLabelToTextGap +
      costos.length * noticesLineH +
      6 + noticesLabelToTextGap +
      cancelacionAll.length * noticesLineH

    return { line1, line2, costos, cancelacionAll, blockH }
  }

  let measuredNotices = measureNotices()
  if (currentY + bannerH + measuredNotices.blockH > 286) {
    noticesBodyFontSize = 8.2
    noticesLineH = 4.25
    noticesTitleGap = 4.2
    noticesSectionGap = 0.8
    noticesLabelToTextGap = 5.6
    measuredNotices = measureNotices()
  }

  const wrappedLine1 = measuredNotices.line1
  const wrappedLine2 = measuredNotices.line2
  const wrappedCostos = measuredNotices.costos
  const wrappedCancelacionAll = measuredNotices.cancelacionAll

  currentY = currentY + bannerH + gapBetweenBannerAndGenerales

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.6)
  doc.setTextColor(0, 0, 0)
  doc.text('GENERALES:', margin, currentY)
  const gw = doc.getTextWidth('GENERALES:')
  doc.line(margin, currentY + 0.8, margin + gw, currentY + 0.8)
  currentY += noticesTitleGap

  doc.setFontSize(noticesBodyFontSize)
  doc.setFont('helvetica', 'bold')
  doc.text(wrappedLine1, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += wrappedLine1.length * noticesLineH

  doc.setFont('helvetica', 'normal')
  doc.text(wrappedLine2, margin, currentY, { align: 'justify', maxWidth: contentW })
  currentY += wrappedLine2.length * noticesLineH + noticesSectionGap

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const costosLabelW = doc.getTextWidth('COSTOS') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, costosLabelW, 6, 'F')
  doc.text('COSTOS', margin + 3, currentY + 4.2)
  currentY += 6 + noticesLabelToTextGap

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(noticesBodyFontSize)
  doc.setTextColor(17, 17, 17)
  doc.text(wrappedCostos, margin, currentY)
  currentY += wrappedCostos.length * noticesLineH

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.8)
  doc.setTextColor(255, 255, 255)
  const cancelLabelW = doc.getTextWidth('CANCELACIÓN') + 6
  doc.setFillColor(26, 26, 26)
  doc.rect(margin, currentY, cancelLabelW, 6, 'F')
  doc.text('CANCELACIÓN', margin + 3, currentY + 4.2)
  currentY += 6 + noticesLabelToTextGap

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(noticesBodyFontSize)
  doc.setTextColor(17, 17, 17)
  doc.text(wrappedCancelacionAll, margin, currentY, { align: 'justify', maxWidth: contentW })

  doc.save(`${data.id} - ${data.cliente} - ${data.proyecto}.pdf`)
  // Return base64-encoded PDF content (strip data-URI prefix)
  return doc.output('datauristring').split(',')[1]
}

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

export async function generarHojaDeLlamado(data: HojaDeLlamadoData): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF('p', 'mm', 'a4')
  const margin = 14
  const pageW = 210
  const contentW = pageW - 2 * margin

  const getPhone = (responsableId: string | null): string => {
    if (!responsableId) return ''
    const r = data.responsables.find(r => r.id === responsableId)
    return r?.telefono || ''
  }

  let isoLogoPngHL: string | null = null
  let serenataLogoPngHL: string | null = null
  try { isoLogoPngHL = await loadImageAsDataUrl(ISO_LOGO_PATH) } catch {}
  try { serenataLogoPngHL = await loadImageAsDataUrl(SERENATA_LOGO_PATH) } catch {}

  if (isoLogoPngHL) {
    try { doc.addImage(isoLogoPngHL, 163, 8, 30, 30) } catch {}
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(0, 0, 0)
  doc.text('HOJA DE LLAMADO', margin, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 100, 100)
  doc.text(data.proyecto, margin, 28)

  let currentY = 36

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

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

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
      headStyles: { fillColor: [50, 50, 50] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    })
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Sin crew asignado', margin, currentY + 5)
    currentY += 12
  }

  const equipoItems = data.items.filter(i => i.categoria?.toLowerCase() !== 'crew')

  if (currentY > 240) { doc.addPage(); currentY = 15 }

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
        item.cantidad,
        item.responsable_nombre || 'Sin asignar',
        item.notas || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
      headStyles: { fillColor: [50, 50, 50] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    })
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  if (currentY > 255) { doc.addPage(); currentY = 15 }

  if (serenataLogoPngHL) {
    try { doc.addImage(serenataLogoPngHL, margin, currentY, 60, 15) } catch {}
  }

  const todayDate = new Date()
  const mesesPDF = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const todayStr = `${todayDate.getDate()} de ${mesesPDF[todayDate.getMonth()]} ${todayDate.getFullYear()}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generado el ${todayStr}`, pageW - margin, currentY + 10, { align: 'right' })

  doc.save(`${data.proyecto} - ${data.cliente} - Hoja de Llamado.pdf`)
}
