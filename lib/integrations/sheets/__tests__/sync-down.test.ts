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

import { syncTableDownByName, syncAllDown, SheetsSyncLeaseLostError } from '../sync-down'
import { TABLE_SCHEMAS } from '../schema'

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
      'id', 'cotizacion_id', 'cliente', 'cliente_id', 'proyecto', 'monto_total',
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

function proyectoRow(id: string, createdAt: string) {
  return {
    id, cliente: 'X', proyecto: 'Y', fecha_entrega: null, locacion: null,
    horarios: null, punto_encuentro: null, estado: 'RODAJE', notas: null,
    created_at: createdAt,
  }
}

// EF-3 3C-3: el heartbeat (onHeartbeat) renueva y verifica el lease del lock
// de sync tras CADA página de CADA tabla -- una sync de 9 tablas puede
// tardar más de 600s, así que renovar solo una vez al final dejaría el
// lease expirar a medio camino. Si el lease se pierde (otro proceso ya
// reclamó el lock), syncTableDown debe abortar de inmediato con
// SheetsSyncLeaseLostError -- nunca seguir leyendo ni escribir a Sheets
// encima del nuevo dueño. Un fallo real de la RPC de renovación (no un
// lease perdido) nunca se confunde con eso: syncTableDown lo absorbe como
// el fallo normal de esa tabla si ocurrió dentro de su loop de páginas, o
// se propaga sin capturar si ocurrió en el heartbeat "entre tablas" de
// syncAllDown (que no tiene try/catch propio).
describe('heartbeat de lease (onHeartbeat) -- 3C-3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overwriteSheetMock.mockResolvedValue(true)
    mocks.formatHeaderRowMock.mockResolvedValue(undefined)
    mocks.getSheetIdsMock.mockResolvedValue({})
  })

  it('syncTableDownByName invoca el heartbeat 1 vez por página (3 páginas -> 3 llamadas)', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`a-${i}`, '2026-01-01'))
    const page2 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`b-${i}`, '2026-01-02'))
    const page3 = Array.from({ length: 200 }, (_, i) => proyectoRow(`c-${i}`, '2026-01-03'))
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [
      { data: page1, error: null }, { data: page2, error: null }, { data: page3, error: null },
    ], calls)

    const heartbeat = vi.fn(async () => true)
    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos', heartbeat)

    expect(result.ok).toBe(true)
    expect(result.rows).toBe(2200)
    expect(heartbeat).toHaveBeenCalledTimes(3)
  })

  it('syncAllDown invoca el heartbeat 1 vez adicional al terminar CADA tabla -- nunca una sola vez al final de las 9', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`a-${i}`, '2026-01-01'))
    const page2 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`b-${i}`, '2026-01-02'))
    const page3 = Array.from({ length: 200 }, (_, i) => proyectoRow(`c-${i}`, '2026-01-03'))
    const calls: ChainCall[] = []
    let proyectosCall = 0
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'proyectos') {
        const pages = [{ data: page1, error: null }, { data: page2, error: null }, { data: page3, error: null }]
        const page = pages[Math.min(proyectosCall, pages.length - 1)]
        proyectosCall += 1
        return makeChainableBuilder(page, calls)
      }
      return makeChainableBuilder({ data: [], error: null }, calls)
    })

    const heartbeat = vi.fn(async () => true)
    const summary = await syncAllDown(SPREADSHEET_ID, heartbeat)

    expect(summary.errors).toBe(0)
    // 3 llamadas por las 3 páginas de "proyectos" (las otras 8 tablas
    // traen 0 filas -> 0 llamadas en su propio loop) + 1 llamada de
    // syncAllDown al terminar CADA una de las TABLE_SCHEMAS.length tablas.
    expect(heartbeat).toHaveBeenCalledTimes(3 + TABLE_SCHEMAS.length)
  })

  it('aborta por lease perdido: relanza SheetsSyncLeaseLostError de inmediato, no lee la 3a página ni escribe a Sheets', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`a-${i}`, '2026-01-01'))
    const page2 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`b-${i}`, '2026-01-02'))
    const page3 = Array.from({ length: 200 }, (_, i) => proyectoRow(`c-${i}`, '2026-01-03'))
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [
      { data: page1, error: null }, { data: page2, error: null }, { data: page3, error: null },
    ], calls)

    let call = 0
    const heartbeat = vi.fn(async () => { call += 1; return call < 2 }) // true en la 1a, false en la 2a

    await expect(syncTableDownByName(SPREADSHEET_ID, 'proyectos', heartbeat))
      .rejects.toBeInstanceOf(SheetsSyncLeaseLostError)

    expect(mocks.fromMock).toHaveBeenCalledTimes(2) // nunca pidió la 3a página
    expect(mocks.overwriteSheetMock).not.toHaveBeenCalled()
  })

  it('distingue un fallo real de la RPC de renovación (dentro del loop de páginas) de un lease perdido: la tabla queda ok:false, nunca SheetsSyncLeaseLostError', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => proyectoRow(`a-${i}`, '2026-01-01'))
    const page2 = Array.from({ length: 200 }, (_, i) => proyectoRow(`b-${i}`, '2026-01-02'))
    const calls: ChainCall[] = []
    mockPages(mocks.fromMock, 'proyectos', [{ data: page1, error: null }, { data: page2, error: null }], calls)

    let call = 0
    const heartbeat = vi.fn(async () => {
      call += 1
      if (call === 2) throw new Error('timeout de renovación')
      return true
    })

    const result = await syncTableDownByName(SPREADSHEET_ID, 'proyectos', heartbeat)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timeout de renovación')
    expect(mocks.overwriteSheetMock).not.toHaveBeenCalled()
  })

  it('un fallo real de la RPC en el heartbeat ENTRE tablas de syncAllDown se propaga sin capturar -- nunca se confunde con lease perdido', async () => {
    const primeraTabla = TABLE_SCHEMAS[0].table
    const calls: ChainCall[] = []
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== primeraTabla) throw new Error(`no debería llegar a: ${table}`)
      return makeChainableBuilder({ data: [{}], error: null }, calls)
    })

    let call = 0
    const heartbeat = vi.fn(async () => {
      call += 1
      // 1a llamada: dentro del loop de páginas de la primera tabla (única
      // página, <PAGE_SIZE) -> ok. 2a llamada: entre tablas, justo después
      // de terminarla -> falla real de la RPC.
      if (call === 2) throw new Error('timeout de renovación')
      return true
    })

    await expect(syncAllDown(SPREADSHEET_ID, heartbeat)).rejects.toThrow('timeout de renovación')
    expect(mocks.fromMock).toHaveBeenCalledTimes(1) // nunca avanzó a la 2a tabla
  })
})
