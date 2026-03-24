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

const ISO_LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAHAAb8DASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAcIBAUGAQMC/8QAQxABAAEDAgEFCwoFBAIDAAAAAAECAwQFEQYHEiExgRMXQVFVYXGUobHSFiIyNlR0kZPB0RQVI0KkUmJygiSSssLx/8QAHAEBAAIDAQEBAAAAAAAAAAAAAAYHAwQFAgEI/8QAOxEBAAECAwIJCgYCAwEAAAAAAAECAwQFEQYxEhYhQVNhcZHRFCJCUVKBobHB4RMVMjRy0qLwIzNi8f/aAAwDAQACEQMRAD8A6AB+el8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM/E0TWcu1F3E0nPyLc9MV2sauqJ7Yh7ot13J0oiZ7Hiu5RRGtU6MAbX5NcR+QNV9TufsfJriPyBqvqdz9mXyPEexPdLH5VY9uO+GqG1+TXEfkDVfU7n7Hya4j8gar6nc/Y8jxHsT3SeVWPbjvhqhtfk1xH5A1X1O5+x8muI/IGq+p3P2PI8R7E90nlVj2474aobWrhviKmJmdB1WIjpmZw7nR7GrqpqpqmmqJpqidpiY2mJY7lm5b/XTMdsPdF23c/RVE9kvAGNkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbPhPFtZvE+mYl+IqtXcq3TXTPhp50bx2wstERERERtEdUK48B/XPSPvdv3rHrL2Fpjye7Vz6x8ld7aVT5Rajm0n5gCdIWAADVa/xBpGhWO66lm27MzG9NuJ3rq9FMdP6I24g5WMu7zrWiYVOPT1Rev8Azq/TFMdEdu7k5hnmCy/kvV+d6o5Z+3v0dTAZNjMdy2qOT1zyR9/dqljLycfEsVZGVftWLVPTVXcqimmO2VeuULUsLVuLs7O0+N8euaYpq2258xTETVt55hrdW1XUtWv931LNv5Vfg7pVvFPojqjsYSuc/wBpJzSiLNFHBpideXfPhv6+1P8AI9n4y2ubtdetUxpybvvuAEWSUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABu+A/rnpH3u371j1cOA/rnpH3u371j1m7Dftbv8AL6K620/c2/4/UHyysixi49eRk3rdmzRG9dddUU00x55lF/GHKltNeJw5RE+Ccu7T/wDCmffP4JPmOa4XLqOFfq09Uc89kf7COYDLMTj6+DZp19c80ds/7KQtf13StCxu76nl0WYmPmUdddf/ABpjplFXFHKjqedz7GjWv5fYno7rVtVdqj3U9m8+dwmdl5Wdk15OZkXci9X9Ku5VNUz+L4K3zTa3F4vWix/x09W+ffze7vlYGW7LYXC6V3vPq693d4v3fvXci9Vev3a7t2ud6q66pqqqnxzM9b8AikzMzrKTxERGkAD4+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANnwnl2sHibTMu/VzbVrKt1V1eKnnRvKbOKOPNB0bFmqzlWtQyao/p2ce5FXbVVG8Ux7fMgAd3K8/xGW2K7VmI1q5dZ5nFzLI7GY3qLt2Z83mjnbvirijV+I8jn59/azTO9vHt9Fujs8M+eWkByL9+5iK5uXapmqeeXVs2bdiiLdunSI5oAGFlBkafhZeoZVGLhY13Iv1/Rot07z/+JA0Dko1DIppu6xm28OmenuVqO6V+iZ6o7N3QwOV4vHTph6Jnr5u+eRo4zMsLgo1v1xHVz929G4n3S+TvhXBimasCrLrj+/IuTVv2RtT7HQYmk6VibfwmmYVjbq7nYpp90JPY2HxVUa3bkU9ms+CN3ts8NTOlq3M9ukeKtNnCzL1HPs4l+5T46LczHsZVOg65XVFNOjajVM9URi1zPuWZHQp2Et+lenu+7Rq21uejZjv+ytXya4j8gar6nc/Y+TXEfkDVfU7n7LKjJxFw/Sz3Q8cdL/RR3yrV8muI/IGq+p3P2Pk1xH5A1X1O5+yyocRcP0s90HHS/wBFHfKtXya4j8gar6nc/Y+TXEfkDVfU7n7LKhxFw/Sz3QcdL/RR3yq9mafn4U7ZmFk4077f1bVVHT2wxlpM3Fx83FuYuXZovWLtPNrovjeJhWjX8KNO1zOwKZqmnHyLlqmZ65imqYifwRnP9n5yrgV018Kmrq0mJSLI89jM+FTVTwaqevXVhAI0kIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6DgjhbN4n1CbNme44trab9+Y3imPFHjqnxNNp+Jfz86xhY1HPvX7kW6I8czOyyPDOj42haLj6bixHNt0/Pr26a6566p9M/pCTbNZJGZ3pqu/9dO/rn1eP3R3aHOZy6zFNv8AXVu6o9fh9n54d0LTNAwoxdNx6bcTtz7k9NdyfHVPh9zaAtu1aos0RRbjSI5oVZcu13a5rrnWZ5ZlY1u3TbpiiiNIjcAPD2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOu0TlE4k0rEt4tF2xlWbUc2iMi3NUxHgjeJiXIjZwuMv4Srh2K5pnqa+JwljFU8G9RFUdaQO+zxH9i0r8q58Z32eI/sWlflXPjR+OhxhzPppaP5Dl3QwkDvs8R/YtK/KufGd9niP7FpX5Vz40fhxhzPppPyHLuhhIHfZ4j+xaV+Vc+M77PEf2LSvyrnxo/DjDmfTSfkOXdDCQO+zxH9i0r8q58Z32eI/sWlflXPjR+HGHM+mk/Icu6GHeV8qvEtVW8WNNojxRZq/WpiZHKVxZdo5tOZZsz/AKqLFO/tiXHDHVnuY1b71Xfp8nunJcvp3Wae5uc3iriTM3i/redMT1003ZoieynaGnrqqrqmquqaqpneZmd5l4Ofdv3b063KpntnVvWrNu1GlumI7I0AGJlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/Z'

const SERENATA_LOGO = 'data:image/jpeg;base64,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'

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

export async function generarPDFCotizacion(data: PDFData): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

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
    ['# Cotización:', data.id],
  ]

  autoTable(doc, {
    startY: 10,
    margin: { left: margin, right: 52 }, // leave ~50 mm on right for logo
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
    body: headerBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 44, fillColor: [255, 255, 255] as [number, number, number] },
      1: { fillColor: [255, 255, 255] as [number, number, number] },
    },
  })

  // ISO logo — top right
  try {
    doc.addImage(ISO_LOGO, 'JPEG', 163, 8, 30, 30)
  } catch { /* skip if image fails */ }

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
  categories.forEach(cat => {
    const catItems = data.items.filter(i => i.categoria === cat)
    const catTotal = catItems.reduce((s, i) => s + (i.importe || 0), 0)
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
    styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] as [number, number, number] },
    headStyles: {
      fillColor: [0, 0, 0] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 65 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
  })

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // ── 4. TOTALS (right-aligned) ─────────────────────────────────────────────
  type TotalsRow = { label: string; value: string; bold: boolean; bg: boolean }
  const totalsRows: TotalsRow[] = [
    { label: 'Subtotal', value: fmtPDF(data.subtotal), bold: false, bg: false },
    { label: `Fee de agencia (${(data.porcentaje_fee * 100).toFixed(0)}%)`, value: fmtPDF(data.fee_agencia), bold: false, bg: false },
    { label: 'General', value: fmtPDF(data.general), bold: true, bg: true },
    ...(descuento > 0 ? [{ label: 'Descuento', value: `-${fmtPDF(descuento)}`, bold: false, bg: false }] : []),
    ...(data.iva_activo ? [{ label: 'IVA (16%)', value: fmtPDF(data.iva), bold: false, bg: false }] : []),
    { label: 'TOTAL', value: fmtPDF(data.total), bold: true, bg: true },
  ]

  const totalsLabelX = 118
  const totalsValueX = 195
  let ty = currentY + 2

  totalsRows.forEach(row => {
    if (row.bg) {
      doc.setFillColor(235, 235, 235)
      doc.rect(totalsLabelX - 3, ty - 4.5, 80, 7, 'F')
    }
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text(row.label, totalsLabelX, ty)
    doc.text(row.value, totalsValueX, ty, { align: 'right' })
    ty += 7
  })

  currentY = ty + 6

  // ── 5. SERENATA LOGO ──────────────────────────────────────────────────────
  if (currentY > 240) { doc.addPage(); currentY = 15 }

  try {
    doc.addImage(SERENATA_LOGO, 'JPEG', margin, currentY, 80, 20)
  } catch { /* skip if image fails */ }
  currentY += 28

  // ── 6. GENERALES ─────────────────────────────────────────────────────────
  if (currentY > 260) { doc.addPage(); currentY = 15 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text('GENERALES:', margin, currentY)
  const gw = doc.getTextWidth('GENERALES:')
  doc.line(margin, currentY + 0.8, margin + gw, currentY + 0.8)
  currentY += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const generalesText =
    'Serenata House se deslinda de cualquier daño o pérdida durante la actividad contratada, salvo de los ' +
    'materiales de producción y el inmueble (en caso de que haya uno contratado).\n' +
    'cualquier trabajo o elemento adicional será autorizado por el cliente'
  const wrappedGenerales = doc.splitTextToSize(generalesText, contentW)
  doc.text(wrappedGenerales, margin, currentY)
  currentY += (wrappedGenerales.length * 4.5) + 8

  // ── 7. COSTOS ─────────────────────────────────────────────────────────────
  if (currentY > 255) { doc.addPage(); currentY = 15 }

  doc.setFillColor(255, 102, 0)
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

  doc.setFillColor(255, 102, 0)
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
