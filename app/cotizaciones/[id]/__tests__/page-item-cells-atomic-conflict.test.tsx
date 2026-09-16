// @vitest-environment jsdom
import { Suspense } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cotizacion, ItemCotizacion, Producto } from '@/lib/types'

/**
 * EF-3 3D-5: caso automatizado del conflicto atómico multi-campo del
 * autofill de producto (descripcion/categoria/precio_unitario/x_pagar,
 * `handleSelectProduct`/`resolveItemCellConflict` en
 * hooks/useQuotationItemCellsAutosave.ts) -- movido desde 3D-3 según la
 * spec del bloque, nunca antes cubierto por un test automatizado (T8 de
 * `page-autosave-characterization.test.tsx` prueba el camino de un solo
 * campo de Totales, no este). Archivo separado (no agregado al característic
 * existente) para que el caché de catálogos a nivel de módulo de
 * `useQuotationForm.ts` (`_catalogosCache`, TTL 30 min) arranque limpio --
 * agregarlo al archivo compartido lo hubiera dejado sirviendo `productos: []`
 * de una corrida anterior en el mismo proceso de test.
 */

const mocks = vi.hoisted(() => ({
  fetchQuotationDetailMock: vi.fn(),
  fetchProveedoresMock: vi.fn(),
  getJsonMock: vi.fn(),
  useSessionMock: vi.fn(),
  useRouterMock: vi.fn(),
  useQuotationPresenceMock: vi.fn(),
}))

vi.mock('@/lib/services/quotation-service', () => ({
  fetchQuotationDetail: mocks.fetchQuotationDetailMock,
  fetchProveedores: mocks.fetchProveedoresMock,
  saveQuotationNotes: vi.fn(),
  approveQuotation: vi.fn(),
  emitirCotizacion: vi.fn(),
  generateQuotationPdf: vi.fn(),
  buildComplementariaUrl: vi.fn(() => '/cotizaciones/nueva'),
}))

vi.mock('@/lib/client/api', () => ({
  getJson: mocks.getJsonMock,
  sendJson: vi.fn(),
  sendFormData: vi.fn(),
  getArrayBuffer: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSessionMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: mocks.useRouterMock,
}))

vi.mock('@/hooks/useQuotationPresence', () => ({
  useQuotationPresence: mocks.useQuotationPresenceMock,
}))

import CotizacionDetallePage from '../page'

const COTIZACION_ID = 'SH001'
const ITEM_ID = 'item-1'

function buildItem(overrides: Partial<ItemCotizacion> = {}): ItemCotizacion {
  return {
    id: ITEM_ID,
    cotizacion_id: COTIZACION_ID,
    categoria: 'Cámara',
    descripcion: 'Cámara principal',
    cantidad: 1,
    precio_unitario: 1000,
    importe: 1000,
    responsable_nombre: null,
    responsable_id: null,
    x_pagar: 800,
    margen: 200,
    orden: 0,
    revision: 1,
    ...overrides,
  }
}

function buildCotizacion(overrides: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: COTIZACION_ID,
    cliente: 'Cliente Uno',
    proyecto: 'Proyecto Uno',
    fecha_entrega: '2026-10-01',
    locacion: 'CDMX',
    fecha_cotizacion: '2026-09-01',
    tipo: 'PRINCIPAL',
    es_complementaria_de: null,
    estado: 'EMITIDA',
    subtotal: 1000,
    fee_agencia: 150,
    general: 0,
    iva: 184,
    total: 1334,
    margen_total: 200,
    utilidad_total: 200,
    porcentaje_fee: 0.15,
    iva_activo: true,
    descuento_tipo: 'monto',
    descuento_valor: 0,
    created_at: '2026-09-01T00:00:00Z',
    items: [buildItem()],
    notas_internas: '',
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function basePresence() {
  return {
    onlineUsers: [] as unknown[],
    sectionEditors: {} as Record<string, unknown>,
    itemCellEditors: {} as Record<string, unknown>,
    latestItemConfirmed: null as unknown,
    latestGeneralConfirmed: null as unknown,
    latestTotalesConfirmed: null as unknown,
    latestNotasConfirmed: null as unknown,
    setActiveSection: vi.fn(),
    releaseSection: vi.fn(),
    lockItemCell: vi.fn(),
    releaseItemCell: vi.fn(),
    isConnected: false,
  }
}

let fetchRoutes: Map<string, (init?: RequestInit) => unknown>

function setRoute(key: string, handler: (init?: RequestInit) => unknown) {
  fetchRoutes.set(key, handler)
}

function installFetch() {
  fetchRoutes = new Map()
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init?.method || 'GET').toUpperCase()
    const key = `${method} ${url}`
    const handler = fetchRoutes.get(key)
    if (!handler) return Promise.reject(new Error(`[test] fetch sin mock para ${key}`))
    return Promise.resolve(handler(init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const PRODUCTO: Producto = {
  id: 'prod-1',
  descripcion: 'Producto Nuevo',
  categoria: 'Video',
  precio_unitario: 500,
  x_pagar_sugerido: 400,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
}

async function renderPage(cotizacion: Cotizacion) {
  mocks.useSessionMock.mockReturnValue({ data: { user: { id: 'user-a', email: 'a@serenata.mx', name: 'Usuario A' } } })
  mocks.useRouterMock.mockReturnValue({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() })
  mocks.fetchQuotationDetailMock.mockReset()
  mocks.fetchQuotationDetailMock.mockResolvedValue(cotizacion)
  mocks.fetchProveedoresMock.mockReset()
  mocks.fetchProveedoresMock.mockResolvedValue([])
  mocks.getJsonMock.mockReset()
  // Catálogo real de productos (solo para /api/productos?q=) -- vacío para
  // el resto (clientes, service-templates).
  mocks.getJsonMock.mockImplementation((url: string) => {
    if (url === '/api/productos?q=') return Promise.resolve([PRODUCTO])
    return Promise.resolve([])
  })

  mocks.useQuotationPresenceMock.mockImplementation(() => basePresence())

  const fetchMock = installFetch()
  const paramsPromise = Promise.resolve({ id: cotizacion.id })

  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <Suspense fallback={<div>suspense-fallback</div>}>
        <CotizacionDetallePage params={paramsPromise} />
      </Suspense>
    )
    await vi.advanceTimersByTimeAsync(0)
  })
  // Deja que refreshCatalogos() (setTimeout(0) interno de useQuotationForm)
  // resuelva -- sin esto listaProductos sigue vacío y no hay sugerencias.
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })

  return { ...utils, fetchMock }
}

const FLUSH = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('page.tsx -- conflicto atómico multi-campo del autofill de producto (3D-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('el grupo se rechaza completo (ningún campo a medias), "usar" revierte los 4 campos al valor del servidor', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`

    // Solo el servidor marca precio_unitario como conflicto real -- los otros
    // 3 campos del grupo atómico deben rechazarse igual (buildAtomicConflictRecord
    // los sintetiza a partir de `base`/`patchAttempted`, no solo de lo que
    // trajo la RPC).
    setRoute(`PATCH ${routeUrl}`, () => jsonResponse(
      { error: 'conflict', fields: { precio_unitario: { base: 1000, current: 1200, attempted: 500 } } },
      409
    ))

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    expect(descInput).toBeTruthy()

    await act(async () => {
      fireEvent.focus(descInput)
      fireEvent.change(descInput, { target: { value: 'Producto' } })
    })

    // Dropdown de sugerencias -- click (mousedown) en la única sugerencia
    // dispara items.selectProduct(rowId, PRODUCTO). Filtrado de
    // productoSugerencias es síncrono (sin debounce), así que ya está listo
    // apenas termina el act() de arriba -- getByText, nunca findByText (los
    // timers fake de este archivo cuelgan el polling interno de waitFor).
    const sugerencia = screen.getByText('Producto Nuevo')
    await act(async () => { fireEvent.mouseDown(sugerencia) })
    await FLUSH(0)

    const patchCalls = fetchMock.mock.calls.filter(([u]) => u === routeUrl)
    expect(patchCalls).toHaveLength(1)
    const body = JSON.parse(String((patchCalls[0][1] as RequestInit).body))
    expect(body).toMatchObject({
      descripcion: 'Producto Nuevo',
      categoria: 'Video',
      precio_unitario: 500,
      x_pagar: 400,
      base: { descripcion: 'Cámara principal', categoria: 'Cámara', precio_unitario: 1000, x_pagar: 800 },
    })

    // Los 4 banners aparecen, no solo el de precio_unitario -- confirma que
    // el rechazo se trató como grupo completo.
    expect(screen.getByText('Usar "Cámara principal"')).toBeTruthy()
    expect(screen.getByText('Usar "Cámara"')).toBeTruthy()
    expect(screen.getByText('Usar "1200"')).toBeTruthy()
    expect(screen.getByText('Usar "800"')).toBeTruthy()

    // Clickear "Usar" en CUALQUIERA de los 4 (aquí precio_unitario) resuelve
    // el grupo entero -- nunca solo el campo cuyo botón se pulsó.
    await act(async () => { fireEvent.click(screen.getByText('Usar "1200"')) })
    await FLUSH(0)

    const categoriaInput = container.querySelector('input[name="items.0.categoria"]') as HTMLInputElement
    const precioInput = container.querySelector('input[name="items.0.precio_unitario"]') as HTMLInputElement
    const xPagarInput = container.querySelector('input[name="items.0.x_pagar"]') as HTMLInputElement

    expect(descInput.value).toBe('Cámara principal')
    expect(categoriaInput.value).toBe('Cámara')
    expect(precioInput.value).toBe('1200')
    expect(xPagarInput.value).toBe('800')

    expect(screen.queryByText('Usar "Cámara principal"')).toBeNull()
    expect(screen.queryByText('Usar "Cámara"')).toBeNull()
    expect(screen.queryByText('Usar "1200"')).toBeNull()
    expect(screen.queryByText('Usar "800"')).toBeNull()
  })

  it('"mantener" reintenta el PATCH completo con los 4 campos y la base ya refrescada', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`

    setRoute(`PATCH ${routeUrl}`, () => jsonResponse(
      { error: 'conflict', fields: { x_pagar: { base: 800, current: 900, attempted: 400 } } },
      409
    ))

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    await act(async () => {
      fireEvent.focus(descInput)
      fireEvent.change(descInput, { target: { value: 'Producto' } })
    })
    const sugerencia = screen.getByText('Producto Nuevo')
    await act(async () => { fireEvent.mouseDown(sugerencia) })
    await FLUSH(0)

    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(1)

    // Segunda ronda: el reintento debe traer los 4 campos otra vez, con
    // `base` ya refrescada a los valores reales del servidor (incluido
    // x_pagar=900, el único que de verdad chocó).
    setRoute(`PATCH ${routeUrl}`, () => jsonResponse({
      item: buildItem({ descripcion: 'Producto Nuevo', categoria: 'Video', precio_unitario: 500, x_pagar: 400 }),
    }))

    await act(async () => { fireEvent.click(screen.getByText('Mantener "400"')) })
    await FLUSH(0)

    const retryCalls = fetchMock.mock.calls.filter(([u]) => u === routeUrl)
    expect(retryCalls).toHaveLength(2)
    const retryBody = JSON.parse(String((retryCalls[1][1] as RequestInit).body))
    expect(retryBody).toMatchObject({
      descripcion: 'Producto Nuevo',
      categoria: 'Video',
      precio_unitario: 500,
      x_pagar: 400,
      base: { descripcion: 'Cámara principal', categoria: 'Cámara', precio_unitario: 1000, x_pagar: 900 },
    })

    expect(screen.queryByText('Mantener "400"')).toBeNull()
  })
})
