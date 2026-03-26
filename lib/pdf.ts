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

const ISO_LOGO = 'data:image/png;base64,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'

const SERENATA_LOGO = 'data:image/png;base64,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'

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre',
  ]
  const parts = fecha.split('-')
  if (parts.length !== 3) return fecha
  const [year, month, day] = parts.map(Number)
  return `${day} de ${meses[month - 1]} ${year}`
}

function fmtPDF(n: number): string {
  return '$ ' + (n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Aspect ratios derived from actual PNG pixel dimensions (447×448 and 441×62)
const ISO_RATIO = 447 / 448       // ≈ 1.0 (square)
const SERENATA_RATIO = 441 / 62   // ≈ 7.11 (wide horizontal)

// Helper: load a (possibly truncated) data-URI through the browser Image→Canvas
// pipeline and re-export as a complete PNG data URL that jsPDF can parse reliably.
async function loadImageAsDataUrl(dataUri: string): Promise<string> {
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
    img.onerror = reject
    img.src = dataUri
  })
}

export async function generarPDFCotizacion(data: PDFData): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  // Pre-load logos through canvas to fix truncated JPEG data
  let isoLogoPng: string | null = null
  let serenataLogoPng: string | null = null
  try { isoLogoPng = await loadImageAsDataUrl(ISO_LOGO) } catch { /* skip */ }
  try { serenataLogoPng = await loadImageAsDataUrl(SERENATA_LOGO) } catch { /* skip */ }

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const margin = 14
  const contentW = pageW - 2 * margin // 182 mm

  const descuento =
    data.descuento_tipo === 'porcentaje'
      ? data.general * (data.descuento_valor / 100)
      : data.descuento_valor

  // ── 1. HEADER TABLE (client data + ISO logo) ──────────────────────────────
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
    margin: { left: margin, right: 52 }, // leave ~50 mm on right for logo
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [0, 0, 0] as [number, number, number] },
    body: headerBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 44, fillColor: [20, 20, 20] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] },
      1: { fillColor: [255, 255, 255] as [number, number, number] },
    },
  })

  // ISO logo — top right, exact aspect ratio (447×448 ≈ square)
  if (isoLogoPng) {
    const isoH = 30
    const isoW = isoH * ISO_RATIO  // ≈ 30mm
    try { doc.addImage(isoLogoPng, 163, 8, isoW, isoH) } catch { /* skip */ }
  }

  let currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // ── 2. TITLE "RESUMEN:" ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text('RESUMEN:', margin, currentY)
  currentY += 7

  // ── 3. ITEMS TABLE ────────────────────────────────────────────────────────
  // Group items by category (preserve insertion order)
  const categories: string[] = []
  data.items.forEach(item => {
    if (!categories.includes(item.categoria)) categories.push(item.categoria)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsBody: any[][] = []
  categories.forEach((cat, catIdx) => {
    const catItems = data.items.filter(i => i.categoria === cat)
    const catTotal = catItems.reduce((s, i) => s + (i.importe || 0), 0)
    // Blank spacer row between categories (not before the first one)
    if (catIdx > 0) {
      itemsBody.push([{ content: '', colSpan: 6, styles: { minCellHeight: 3 } }])
    }
    catItems.forEach((item, idx) => {
      const noPrice = !item.precio_unitario || !item.cantidad
      const precioCell = noPrice ? '$ - ,00' : fmtPDF(item.precio_unitario)
      const importeCell = noPrice ? '$ - ,00' : fmtPDF(item.importe)
      itemsBody.push([
        idx === 0
          ? { content: cat, styles: { fontStyle: 'bolditalic' } }
          : '',
        item.descripcion,
        item.cantidad || '',
        precioCell,
        importeCell,
        idx === 0 ? fmtPDF(catTotal) : '',
      ])
    })
  })

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Categoría', 'Descripción', 'Cant.', 'P. Unitario', 'Importe', 'Total categoría']],
    body: itemsBody,
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [0, 0, 0] as [number, number, number] },
    headStyles: {
      fillColor: [0, 0, 0] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 58 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
  })

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // ── 4. TOTALS BANNER (dark full-width with logo left + totals right) ────────
  type TotalsRow = { label: string; value: string; bold: boolean; orange: boolean }
  const totalsRows: TotalsRow[] = [
    { label: 'Subtotal', value: fmtPDF(data.subtotal), bold: false, orange: false },
    { label: 'Fee de agencia', value: fmtPDF(data.fee_agencia), bold: false, orange: false },
    { label: 'General', value: fmtPDF(data.general), bold: true, orange: true },
    ...(descuento > 0 ? [{ label: 'Descuento', value: `-${fmtPDF(descuento)}`, bold: false, orange: false }] : []),
    ...(data.iva_activo ? [{ label: 'IVA (16%)', value: fmtPDF(data.iva), bold: false, orange: false }] : []),
    { label: 'TOTAL', value: fmtPDF(data.total), bold: true, orange: false },
  ]

  const rowH = 5.5  // compact row height
  const bannerPad = 6
  const bannerH = Math.max(totalsRows.length * rowH + bannerPad * 2, 40)

  if (currentY + bannerH > 270) { doc.addPage(); currentY = 15 }

  // Full-width dark banner
  doc.setFillColor(20, 20, 20)
  doc.rect(margin, currentY, contentW, bannerH, 'F')

  // SERENATA logo — left ~55% of banner, exact aspect ratio (no deformation)
  if (serenataLogoPng) {
    const logoW = contentW * 0.55          // 55% of banner width
    const logoH = logoW / SERENATA_RATIO   // height derived from width, ratio 7.11
    const logoX = margin + 6
    const logoY = currentY + (bannerH - logoH) / 2
    try { doc.addImage(serenataLogoPng, logoX, logoY, logoW, logoH) } catch { /* skip */ }
  }

  // Totals rows — compact, pushed to the right
  // Labels right-aligned at labelX, values right-aligned at valueX
  const labelX = margin + contentW - 70   // labels right edge (leaves 70mm for label+value)
  const valueX = margin + contentW - 3    // values right edge
  let ty = currentY + bannerPad + 1

  totalsRows.forEach(row => {
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(8.5)
    if (row.orange) {
      doc.setTextColor(255, 128, 0)
    } else {
      doc.setTextColor(255, 255, 255)
    }
    doc.text(row.label, labelX, ty, { align: 'right' })
    doc.text(row.value, valueX, ty, { align: 'right' })
    ty += rowH
  })

  currentY = currentY + bannerH + 8

  // ── 6. GENERALES ─────────────────────────────────────────────────────────
  if (currentY > 260) { doc.addPage(); currentY = 15 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text('GENERALES:', margin, currentY)
  const gw = doc.getTextWidth('GENERALES:')
  doc.line(margin, currentY + 0.8, margin + gw, currentY + 0.8)
  currentY += 6

  doc.setFontSize(8)
  const generalesLine1 =
    'Serenata House se deslinda de cualquier daño o pérdida durante la actividad contratada, salvo de los ' +
    'materiales de producción y el inmueble (en caso de que haya uno contratado).'
  const generalesLine2 = 'cualquier trabajo o elemento adicional será autorizado por el cliente'
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  const wrappedLine1 = doc.splitTextToSize(generalesLine1, contentW)
  doc.text(wrappedLine1, margin, currentY)
  currentY += wrappedLine1.length * 4.5
  doc.setFont('helvetica', 'normal')
  const wrappedLine2 = doc.splitTextToSize(generalesLine2, contentW)
  doc.text(wrappedLine2, margin, currentY)
  currentY += (wrappedLine2.length * 4.5) + 8

  // ── 7. COSTOS ─────────────────────────────────────────────────────────────
  if (currentY > 255) { doc.addPage(); currentY = 15 }

  doc.setFillColor(20, 20, 20)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('COSTOS', margin + 2, currentY + 5.5)
  currentY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  const costosText =
    'Este presupuesto es 100 % modular y se adaptará a las necesidades del cliente.\n' +
    'Una vez aterrizada la propuesta al 100 % se ajustarán los costos.\n' +
    'Este presupuesto es estimativo para desarrollar las actividades mencionadas.\n' +
    'Se requiere el 50% al contratar el servicio / 50% al finalizar'
  const wrappedCostos = doc.splitTextToSize(costosText, contentW)
  doc.text(wrappedCostos, margin, currentY)
  currentY += (wrappedCostos.length * 4.5) + 8

  // ── 8. CANCELACIÓN ───────────────────────────────────────────────────────
  if (currentY > 240) { doc.addPage(); currentY = 15 }

  doc.setFillColor(20, 20, 20)
  doc.rect(margin, currentY, contentW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('CANCELACIÓN', margin + 2, currentY + 5.5)
  currentY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  const cancelacionText =
    'En caso de cancelación deberá hacerse por escrito con acuse de recibo con 192 horas habiles de ' +
    'anticipacion, toda cancelación realizada por este término genera un cargo del 60% del total generado en ' +
    'la cotización independientemente de que el cliente pagará cualquier tipo de gasto económico que se haya ' +
    'realizado para cumplir con esta cotización los cuales deberán de ser debidamente comprobados al cliente. ' +
    'Todo servicio o equipo adicional al evento se documentará en hojas de cargo o misceláneo que formará ' +
    'parte de este instrumento. El cliente será responsable del equipo cuando lo reciba y cuidará de su total ' +
    'integridad y seguridad. En caso de no reintegrarse después de terminado el servicio cotizado, genera un ' +
    'cobro proporcional por dia de retrazo. Se puede confirmar esta cotizacion via mail , pero siempre en los ' +
    'términos de estas condiciones\n' +
    'Si la cancelación es recibida con menos de 48 horas antes del evento se cargará 100% del total'
  const wrappedCancelacion = doc.splitTextToSize(cancelacionText, contentW)
  doc.text(wrappedCancelacion, margin, currentY)

  // ── SAVE ──────────────────────────────────────────────────────────────────
  doc.save(`${data.id} - ${data.cliente} - ${data.proyecto}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// HOJA DE LLAMADO
// ─────────────────────────────────────────────────────────────────────────────

export interface HojaDeLlamadoData {
  proyecto: string
  cliente: string
  fecha_entrega: string | null
  locacion: string | null
  horarios: string | null
  punto_encuentro: string | null
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

  // Pre-load logos through canvas
  let isoLogoPngHL: string | null = null
  let serenataLogoPngHL: string | null = null
  try { isoLogoPngHL = await loadImageAsDataUrl(ISO_LOGO) } catch { /* skip */ }
  try { serenataLogoPngHL = await loadImageAsDataUrl(SERENATA_LOGO) } catch { /* skip */ }

  // ── HEADER ────────────────────────────────────────────────────────────────
  if (isoLogoPngHL) {
    try { doc.addImage(isoLogoPngHL, 163, 8, 30, 30) } catch { /* skip */ }
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

  // ── CREW ──────────────────────────────────────────────────────────────────
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

  // ── EQUIPO TÉCNICO ────────────────────────────────────────────────────────
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

  // ── FOOTER ────────────────────────────────────────────────────────────────
  if (currentY > 255) { doc.addPage(); currentY = 15 }

  if (serenataLogoPngHL) {
    try { doc.addImage(serenataLogoPngHL, margin, currentY, 60, 15) } catch { /* skip */ }
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
