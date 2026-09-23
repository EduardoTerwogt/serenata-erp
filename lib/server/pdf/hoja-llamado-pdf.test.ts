import { describe, expect, it } from 'vitest'
import { generateHojaDeLlamadoPdf, toTwelveHour, type HojaDeLlamadoData } from '@/lib/server/pdf/hoja-llamado-pdf'

const pdfText = (buf: ArrayBuffer) => Buffer.from(buf).toString('latin1')
const pageCount = (buf: ArrayBuffer) => (pdfText(buf).match(/\/Type \/Page[^s]/g) || []).length

function data(crew: number, equipo: number, overrides: Partial<HojaDeLlamadoData> = {}): HojaDeLlamadoData {
  const items = [
    ...Array.from({ length: crew }, (_, i) => ({
      id: `c${i}`,
      descripcion: `Rol ${i + 1}`,
      categoria: 'Crew',
      cantidad: 1,
      responsable_id: i % 3 ? `r${i}` : null,
      responsable_nombre: i % 3 ? `Persona ${i + 1}` : null,
      notas: i % 4 ? null : 'Llega una hora antes para montaje y pruebas de sonido con el equipo',
    })),
    ...Array.from({ length: equipo }, (_, i) => ({
      id: `e${i}`,
      descripcion: `Equipo ${i + 1}`,
      categoria: 'Equipo',
      cantidad: i + 1,
      responsable_id: `p${i % 4}`,
      responsable_nombre: `Proveedor ${i % 4}`,
      notas: null,
    })),
  ]
  return {
    proyecto: 'Live session acústica',
    cliente: 'Estudio Nómada',
    fecha_entrega: '2026-09-30',
    locacion: 'Foro Ensamble, Col. Doctores',
    horarios: 'Llamado 7:00 · Rodaje 9:00–19:00',
    punto_encuentro: null,
    notas: 'Estacionamiento limitado.',
    items,
    responsables: Array.from({ length: crew }, (_, i) => ({ id: `r${i}`, nombre: `Persona ${i + 1}`, telefono: '55 1234 5678' })),
    ...overrides,
  }
}

describe('pdf/hoja-llamado-pdf', () => {
  it('genera un PDF binario válido con Inter embebida', () => {
    const buf = generateHojaDeLlamadoPdf(data(4, 3))
    const text = pdfText(buf)
    expect(Buffer.from(buf).subarray(0, 4).toString()).toBe('%PDF')
    // jsPDF usa el nombre de familia como BaseFont: 'Inter' (normal y bold) e 'InterSemiBold'
    expect((text.match(/\/BaseFont \/Inter\s/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(text).toMatch(/\/BaseFont \/InterSemiBold\s/)
  })

  it('una hoja corta cabe en una página', () => {
    expect(pageCount(generateHojaDeLlamadoPdf(data(4, 3)))).toBe(1)
  })

  it('pagina hojas largas', () => {
    expect(pageCount(generateHojaDeLlamadoPdf(data(20, 25)))).toBeGreaterThan(1)
  })

  it('no truena sin crew, sin equipo ni datos del llamado', () => {
    const buf = generateHojaDeLlamadoPdf(
      data(0, 0, { fecha_entrega: null, locacion: null, horarios: null, punto_encuentro: null, notas: null })
    )
    expect(pageCount(buf)).toBe(1)
  })
})

describe('toTwelveHour', () => {
  it('convierte horas de 24 h a 12 h con am/pm', () => {
    expect(toTwelveHour('Llamado 7:00 · Rodaje 9:00–19:00')).toBe('Llamado 7:00 am · Rodaje 9:00 am–7:00 pm')
    expect(toTwelveHour('12:30 y 0:15')).toBe('12:30 pm y 12:15 am')
  })

  it('no toca horas que ya traen am/pm', () => {
    expect(toTwelveHour('Llamado 7:00 am · Rodaje 9:00 am–7:00 pm')).toBe('Llamado 7:00 am · Rodaje 9:00 am–7:00 pm')
    expect(toTwelveHour('5:30 p.m.')).toBe('5:30 p.m.')
  })
})
