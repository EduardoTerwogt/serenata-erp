import { beforeEach, describe, expect, it, vi } from 'vitest'

// EF-3 3C-2: syncTableDown() leía TODA la tabla con un solo `.limit(5000)`
// -- .range() interno de supabase-js pagina por OFFSET, que bajo inserciones
// o borrados concurrentes entre páginas puede duplicar u omitir filas sin
// importar cuán estable sea el ORDER BY. Ahora pagina por keyset
// (created_at/orderBy, pk), continuando estrictamente desde el último valor
// leído -- inmune a ese corrimiento. Estos tests mockean supabaseAdmin y las
// funciones de Google Sheets; no dependen del contenido real de las
// pestañas, solo del loop de paginación/acumulación y de qué columnas pide
// el `.select()`.

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  overwriteSheetMock: vi.fn(),
  formatHeaderRowMock: vi.fn(),
  getSheetIdsMock: vi.fn(),
}))

vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))
vi.mock('@/lib/integrations/google/sheets', () => ({
  overwriteSheet: mocks.overwriteSheetMock,
  formatHeaderRow: mocks.formatHeaderRowMock,
  getSheetIds: mocks.getSheetIdsMock,
}))

import { syncTableDownByName } from '../sync-down'

interface ChainCall {
  select: string
  or: string | null
}

// Un builder por página, recién creado en cada llamada a `.from()` (una por
// iteración del loop de keyset) -- el avance de página vive en quien llama
// a `mockImplementation`, nunca dentro del builder mismo.
function makeChainableBuilder(
  page: { data: Record<string, unknown>[] | null; error: unknown },
  calls: ChainCall[],
) {
  let selectArg = ''
  let orArg: string | null = null
  const builder: Record<string, unknown> = {
    select: (cols: string) => { selectArg = cols; return builder },
    order: () => builder,
    limit: () => builder,
    or: (filter: string) => { orArg = filter; return builder },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      calls.push({ select: selectArg, or: orArg })
      return Promise.resolve(page).then(resolve, reject)
    },
  }
  return builder
}

function mockPages(
  fromMock: ReturnType<typeof vi.fn>,
  table: string,
  pages: Array<{ data: Record<string, unknown>[] | null; error: unknown }>,
  calls: ChainCall[],
) {
  let call = 0
  fromMock.mockImplementation((t: string) => {
    if (t !== table) throw new Error(`tabla no mockeada: ${t}`)
    const page = pages[Math.min(call, pages.length - 1)]
    call += 1
    return makeChainableBuilder(page, calls)
  })
}

const SPREADSHEET_ID = 'sheet-1'

describe('syncTableDownByName -- paginación por keyset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overwriteSheetMock.mockResolvedValue(true)
    mocks.formatHeaderRowMock.mockResolvedValue(undefined)
    mocks.getSheetIdsMock.mockResolvedValue({})
  })

  it('acumula 2 páginas completas (1000/500) sin truncar en el límite anterior de 5000', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `p-${i}`, cliente: 'X', proyecto: 'Y', fecha_entrega: null, locacion: null,
      horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
      created_at: `2026-01-${String(i % 28 + 1).padStart(2, '0')}`,
    }))
    const page2 = Array.from({ length: 500 }, (_, i) => ({
      id: `q-${i}`, cliente: 'X', proyecto: 'Y', fecha_entrega: null, locacion: null,
      horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
      created_at: '2026-02-01',
    }))
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [{ data: page1, error: null }, { data: page2, error: null }], calls)

    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos')

    expect(result.ok).toBe(true)
    expect(result.rows).toBe(1500)
    expect(mocks.fromMock).toHaveBeenCalledTimes(2)
    // Sheets recibe header + las 1500 filas de datos.
    const [, , writtenRows] = mocks.overwriteSheetMock.mock.calls[0]
    expect(writtenRows).toHaveLength(1501)
  })

  it('se detiene en la primera página si trae menos de PAGE_SIZE filas', async () => {
    const page = Array.from({ length: 3 }, (_, i) => ({
      id: `p-${i}`, cliente: 'X', proyecto: 'Y', fecha_entrega: null, locacion: null,
      horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
      created_at: '2026-01-01',
    }))
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [{ data: page, error: null }], calls)

    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos')

    expect(mocks.fromMock).toHaveBeenCalledTimes(1)
    expect(result.rows).toBe(3)
  })

  it('concurrencia simulada: la 2a página filtra estrictamente por el último cursor leído, nunca por posición', async () => {
    // Con .range()/OFFSET, la 2a llamada pediría "filas 1000-1999" por
    // posición -- si algo se borra antes de esa posición entre llamadas, la
    // ventana se corre y una fila real se saltaría. El keyset en cambio
    // nunca referencia una posición: cada llamada filtra "> el último valor
    // de fila realmente leído en la llamada anterior", así que no hay
    // ventana que corra.
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `p-${String(i).padStart(4, '0')}`, cliente: 'X', proyecto: 'Y', fecha_entrega: null,
      locacion: null, horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
      created_at: '2026-01-01',
    }))
    const page2 = [{
      id: 'p-1000', cliente: 'X', proyecto: 'Y', fecha_entrega: null, locacion: null,
      horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
      created_at: '2026-01-02',
    }]
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [{ data: page1, error: null }, { data: page2, error: null }], calls)

    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos')

    expect(result.rows).toBe(1001)
    expect(calls).toHaveLength(2)
    // La 1a llamada no manda cursor -- primera página.
    expect(calls[0].or).toBeNull()
    // La 2a llamada filtra explícitamente por el último id/created_at
    // REALES de la página 1 (no por un offset numérico de posición).
    const lastOfPage1 = page1[page1.length - 1]
    expect(calls[1].or).toContain(`created_at.gt.${lastOfPage1.created_at}`)
    expect(calls[1].or).toContain(`id.gt.${lastOfPage1.id}`)
  })

  it('cuentas_cobrar: pide created_at aunque no esté en columns, el cursor avanza sin quedar undefined, y Sheets no recibe created_at como columna extra', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `c-${String(i).padStart(4, '0')}`, cotizacion_id: 'SH001', cliente: 'ACME',
      proyecto: 'Spot', monto_total: 1000, estado: 'PENDIENTE', fecha_vencimiento: null,
      fecha_pago: null, notas: null, created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
    }))
    const page2 = [{
      id: 'c-1000', cotizacion_id: 'SH002', cliente: 'ACME', proyecto: 'Spot',
      monto_total: 500, estado: 'PENDIENTE', fecha_vencimiento: null, fecha_pago: null,
      notas: null, created_at: '2026-01-02T00:00:00Z',
    }]
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'cuentas_cobrar', [{ data: page1, error: null }, { data: page2, error: null }], calls)

    const result = await syncTableDownByName(SPREADSHEET_ID, 'cuentas_cobrar')

    expect(result.ok).toBe(true)
    expect(result.rows).toBe(1001)
    // El select de AMBAS páginas pide created_at pese a no estar en
    // schema.columns de cuentas_cobrar.
    expect(calls[0].select).toContain('created_at')
    expect(calls[1].select).toContain('created_at')
    // El cursor de la 2a llamada usa el created_at real de la última fila
    // de la página 1 -- nunca la cadena "undefined".
    expect(calls[1].or).not.toContain('undefined')
    expect(calls[1].or).toContain(`created_at.gt.${page1[page1.length - 1].created_at}`)

    // Las filas escritas a Sheets respetan exactamente schema.columns de
    // cuentas_cobrar -- created_at nunca se filtra hacia la hoja.
    const [, , writtenRows] = mocks.overwriteSheetMock.mock.calls[0] as [string, string, unknown[][]]
    const headerRow = writtenRows[0]
    expect(headerRow).not.toContain('created_at')
    expect(headerRow).toEqual([
      'id', 'cotizacion_id', 'cliente', 'proyecto', 'monto_total',
      'estado', 'fecha_vencimiento', 'fecha_pago', 'notas',
    ])
  })

  it('propaga el error de Supabase sin transformarlo, sin llamar overwriteSheet', async () => {
    const dbError = new Error('conexión perdida')
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [{ data: null, error: dbError }], calls)

    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('conexión perdida')
    expect(mocks.overwriteSheetMock).not.toHaveBeenCalled()
  })
})
