/** Nombre del PDF de una orden: "O.P 24-Sep SH059,SH061.pdf" (formato vigente, decisión 015). */
export function nombreArchivoOrden(folios: string[], ahora: Date = new Date()): string {
  const dia = String(ahora.getDate()).padStart(2, '0')
  const mes = ahora
    .toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' })
    .replace('.', '')
    .replace(/^./, (v) => v.toUpperCase())
  return `O.P ${dia}-${mes} ${Array.from(new Set(folios.filter(Boolean))).join(',')}.pdf`
}
