import fs from 'fs'
import path from 'path'
import { formatCurrencyPdf, formatDatePdf } from '@/lib/server/pdf/pdf-base-config'
import { CotizacionPDFData, TotalsRow } from '@/lib/server/pdf/cotizacion-pdf-types'

const ISO_LOGO_PATH = path.join(process.cwd(), 'public', 'logo iso.png')
const SERENATA_LOGO_PATH = path.join(process.cwd(), 'public', 'serenata naranja.png')

export const ISO_RATIO = 447 / 448
export const SERENATA_RATIO = 441 / 62

const ORANGE: [number, number, number] = [249, 115, 22]
const WHITE: [number, number, number] = [255, 255, 255]
const GRAY: [number, number, number] = [187, 187, 187]
const YELLOW: [number, number, number] = [245, 208, 66]

export function loadImageAsBase64(filePath: string): string | null {
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

export function getIsoLogoBase64() {
  return loadImageAsBase64(ISO_LOGO_PATH)
}

export function getSerenataLogoBase64() {
  return loadImageAsBase64(SERENATA_LOGO_PATH)
}

export function buildHeaderBody(data: CotizacionPDFData) {
  return [
    ['Cliente:', data.cliente],
    ['Proyecto:', data.proyecto],
    ['Fecha de entrega:', formatDatePdf(data.fecha_entrega)],
    ['Locación:', data.locacion || '—'],
    ['Fecha de cotización:', formatDatePdf(data.fecha_cotizacion)],
    ['# Cotización', data.id],
  ]
}

export function buildItemsBody(data: CotizacionPDFData) {
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

  return itemsBody
}

export function calculateDiscount(data: CotizacionPDFData) {
  return data.descuento_tipo === 'porcentaje'
    ? data.general * (data.descuento_valor / 100)
    : data.descuento_valor
}

export function buildTotalsRows(data: CotizacionPDFData, descuento: number): TotalsRow[] {
  return [
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
}

export function getCostosText() {
  return 'Este presupuesto es 100 % modular y se adaptará a las necesidades del cliente.\nUna vez aterrizada la propuesta al 100 % se ajustarán los costos.\nEste presupuesto es estimativo para desarrollar las actividades mencionadas.\nSe requiere el 50% al contratar el servicio / 50% al finalizar'
}

export function getCancelacionText() {
  return 'En caso de cancelación deberá hacerse por escrito con acuse de recibo con 192 horas habiles de anticipacion, toda cancelación realizada por este término genera un cargo del 60% del total generado en la cotización independientemente de que el cliente pagará cualquier tipo de gasto económico que se haya realizado para cumplir con esta cotización los cuales deberán de ser debidamente comprobados al cliente. Todo servicio o equipo adicional al evento se documentará en hojas de cargo o misceláneo que formará parte de este instrumento. El cliente será responsable del equipo cuando lo reciba y cuidará de su total integridad y seguridad. En caso de no reintegrarse después de terminado el servicio cotizado, genera un cobro proporcional por dia de retrazo. Se puede confirmar esta cotizacion via mail , pero siempre en los términos de estas condiciones\nSi la cancelación es recibida con menos de 48 horas antes del evento se cargará 100% del total'
}

export function getGeneralesText() {
  return {
    line1: 'Serenata House se deslinda de cualquier daño o pérdida durante la actividad contratada, salvo de los materiales de producción y el inmueble (en caso de que haya uno contratado).',
    line2: 'Cualquier trabajo o elemento adicional será autorizado por el cliente',
  }
}
