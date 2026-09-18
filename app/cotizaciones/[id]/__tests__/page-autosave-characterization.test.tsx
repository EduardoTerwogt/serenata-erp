// @vitest-environment jsdom
import { Suspense } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cotizacion, ItemCotizacion } from '@/lib/types'

/**
 * EF-3 3D-0: characterization tests de `app/cotizaciones/[id]/page.tsx` tal
 * como existe HOY -- documentan el comportamiento real (incluido el de la
 * interacción flush/reconciliación, nunca antes probada explícitamente), no
 * lo que "debería" pasar. Este archivo NO modifica page.tsx ni ningún
 * componente hijo -- ver metodología completa en
 * docs/archive/ef-3-engineering-hardening.md, bloque 3D-0.
 *
 * Dos hallazgos de esta ronda que corrigen la descripción del bloque en el
 * plan (no invalidan el bloque, solo su texto):
 * - T7: Notas NO tiene banner de conflicto/usar/mantener -- confirmado
 *   leyendo persistNotasAutosave (page.tsx) y la ruta PATCH
 *   /api/cotizaciones/[id]/notas (sin base ni detección de conflicto
 *   alguna). Cualquier fallo de guardado de notas (incluido un
 *   hipotético 409) se trata como error genérico -- se documenta esa
 *   realidad en vez de una UI de conflicto que no existe.
 * - T8: Totales no tiene un PATCH "grupo multi-campo" atómico (a
 *   diferencia del autofill de producto en partidas) -- cada campo de
 *   Totales manda su propio PATCH individual con su propio conflicto,
 *   igual que General. Se prueba un solo campo (descuento_valor).
 */

const mocks = vi.hoisted(() => ({
  fetchQuotationDetailMock: vi.fn(),
  fetchProveedoresMock: vi.fn(),
  saveQuotationNotesMock: vi.fn(),
  approveQuotationMock: vi.fn(),
  emitirCotizacionMock: vi.fn(),
  generateQuotationPdfMock: vi.fn(),
  buildComplementariaUrlMock: vi.fn(() => '/cotizaciones/nueva'),
  getJsonMock: vi.fn(),
  useSessionMock: vi.fn(),
  useRouterMock: vi.fn(),
  useQuotationPresenceMock: vi.fn(),
}))

vi.mock('@/lib/services/quotation-service', () => ({
  fetchQuotationDetail: mocks.fetchQuotationDetailMock,
  fetchProveedores: mocks.fetchProveedoresMock,
  saveQuotationNotes: mocks.saveQuotationNotesMock,
  approveQuotation: mocks.approveQuotationMock,
  emitirCotizacion: mocks.emitirCotizacionMock,
  generateQuotationPdf: mocks.generateQuotationPdfMock,
  buildComplementariaUrl: mocks.buildComplementariaUrlMock,
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

// ─── helpers de datos ───────────────────────────────────────────────────────

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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

// ─── presencia (mock del hook completo -- ver hallazgos del agente de
// exploración: `lib/supabase-browser.ts` revienta al importarse sin las env
// vars de Supabase, así que mockear el hook completo es la única forma
// segura de renderizar la página en jsdom) ──────────────────────────────────

type PresenceState = ReturnType<typeof basePresence>

function basePresence() {
  return {
    onlineUsers: [] as unknown[],
    sectionEditors: {} as Record<string, unknown>,
    itemCellEditors: {} as Record<string, unknown>,
    latestItemConfirmed: null as { cotizacion_id: string; item_id: string | null; revision: number | null; mutation_id: string | null; at: string } | null,
    latestGeneralConfirmed: null as { cotizacion_id: string; at: string } | null,
    latestTotalesConfirmed: null as { cotizacion_id: string; at: string } | null,
    latestNotasConfirmed: null as { cotizacion_id: string; at: string } | null,
    setActiveSection: vi.fn(),
    releaseSection: vi.fn(),
    lockItemCell: vi.fn(),
    releaseItemCell: vi.fn(),
    isConnected: false,
  }
}

let presenceState: PresenceState
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

async function renderPage(cotizacion: Cotizacion) {
  mocks.useSessionMock.mockReturnValue({ data: { user: { id: 'user-a', email: 'a@serenata.mx', name: 'Usuario A' } } })
  mocks.useRouterMock.mockReturnValue({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() })
  mocks.fetchQuotationDetailMock.mockReset()
  mocks.fetchQuotationDetailMock.mockResolvedValue(cotizacion)
  mocks.fetchProveedoresMock.mockReset()
  mocks.fetchProveedoresMock.mockResolvedValue([])
  mocks.getJsonMock.mockReset()
  mocks.getJsonMock.mockResolvedValue([])
  mocks.saveQuotationNotesMock.mockReset()
  mocks.approveQuotationMock.mockReset()
  mocks.emitirCotizacionMock.mockReset()
  mocks.generateQuotationPdfMock.mockReset()

  presenceState = basePresence()
  mocks.useQuotationPresenceMock.mockImplementation(() => presenceState)

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
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })

  /** Fuerza que `useQuotationPresence` devuelva un objeto NUEVO (identidad
   * distinta) y re-renderiza el MISMO árbol (misma promesa de `params`,
   * mismo componente montado -- refs/estado se conservan) -- así los
   * `useEffect` de page.tsx que dependen de `latest*Confirmed` (comparados
   * por referencia) se disparan, simulando un evento server-confirmed
   * recibido vía Presence. */
  async function emitPresenceUpdate(patch: Partial<PresenceState>) {
    presenceState = { ...presenceState, ...patch }
    await act(async () => {
      utils.rerender(
        <Suspense fallback={<div>suspense-fallback</div>}>
          <CotizacionDetallePage params={paramsPromise} />
        </Suspense>
      )
      await vi.advanceTimersByTimeAsync(0)
    })
  }

  return { ...utils, fetchMock, emitPresenceUpdate }
}

const FLUSH = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('page.tsx -- characterization de autosave/flush/reconciliación (3D-0)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('T1: autosave General -- debounce de 800ms dispara el PATCH esperado', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeKey = `PATCH /api/cotizaciones/${cot.id}/general`
    const patch = deferred<unknown>()
    setRoute(routeKey, () => patch.promise)

    const locacionInput = container.querySelector('input[name="locacion"]') as HTMLInputElement
    expect(locacionInput).toBeTruthy()

    await act(async () => { fireEvent.change(locacionInput, { target: { value: 'Estudio Sur' } }) })
    await FLUSH(799)
    expect(fetchMock.mock.calls.filter(([url]) => url === `/api/cotizaciones/${cot.id}/general`)).toHaveLength(0)

    await FLUSH(1)
    const calls = fetchMock.mock.calls.filter(([url]) => url === `/api/cotizaciones/${cot.id}/general`)
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String((calls[0][1] as RequestInit).body))
    expect(body).toEqual({ locacion: 'Estudio Sur', base: { locacion: 'CDMX' } })

    patch.resolve(jsonResponse({ ...cot, locacion: 'Estudio Sur' }))
    await FLUSH(0)
  })

  it('T2: autosave Totales -- debounce de 800ms dispara el PATCH esperado', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeKey = `PATCH /api/cotizaciones/${cot.id}/totales`
    const patch = deferred<unknown>()
    setRoute(routeKey, () => patch.promise)

    const descuentoInput = container.querySelector('input[type="number"].w-24') as HTMLInputElement
    expect(descuentoInput).toBeTruthy()

    await act(async () => { fireEvent.change(descuentoInput, { target: { value: '50' } }) })
    await FLUSH(799)
    expect(fetchMock.mock.calls.filter(([url]) => url === `/api/cotizaciones/${cot.id}/totales`)).toHaveLength(0)

    await FLUSH(1)
    const calls = fetchMock.mock.calls.filter(([url]) => url === `/api/cotizaciones/${cot.id}/totales`)
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String((calls[0][1] as RequestInit).body))
    expect(body).toEqual({ descuento_valor: 50, base: { descuento_valor: 0 } })

    patch.resolve(jsonResponse({ ...cot, descuento_valor: 50 }))
    await FLUSH(0)
  })

  it('T3: autosave Notas -- debounce de 800ms dispara el guardado esperado', async () => {
    const cot = buildCotizacion()
    const { container } = await renderPage(cot)
    const notesDeferred = deferred<Cotizacion>()
    mocks.saveQuotationNotesMock.mockReturnValue(notesDeferred.promise)

    // Bloque 2 sub-tarea 8: "Nota de evento" ahora vive en un pop-up -- el
    // textarea solo existe en el DOM tras abrirlo.
    await act(async () => { fireEvent.click(screen.getByText('Nota de evento')) })
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()

    await act(async () => { fireEvent.focus(textarea); fireEvent.change(textarea, { target: { value: 'Nota del evento' } }) })
    await FLUSH(799)
    expect(mocks.saveQuotationNotesMock).not.toHaveBeenCalled()

    await FLUSH(1)
    expect(mocks.saveQuotationNotesMock).toHaveBeenCalledWith(cot.id, 'Nota del evento')

    notesDeferred.resolve({ ...cot, notas_internas: 'Nota del evento' })
    await FLUSH(0)
  })

  it('T4: autosave de celda de item -- debounce de 800ms dispara el PATCH esperado', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeKey = `PATCH /api/cotizaciones/${cot.id}/items/${ITEM_ID}`
    const patch = deferred<unknown>()
    setRoute(routeKey, () => patch.promise)

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    expect(descInput).toBeTruthy()

    await act(async () => { fireEvent.focus(descInput); fireEvent.change(descInput, { target: { value: 'Nueva descripción' } }) })
    await FLUSH(799)
    expect(fetchMock.mock.calls.filter(([url]) => url === routeKey.slice('PATCH '.length))).toHaveLength(0)

    await FLUSH(1)
    const calls = fetchMock.mock.calls.filter(([url]) => url === `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`)
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String((calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({ descripcion: 'Nueva descripción', base: { descripcion: 'Cámara principal' } })
    expect(typeof body.mutation_id).toBe('string')

    patch.resolve(jsonResponse({ item: { ...buildItem({ descripcion: 'Nueva descripción' }) } }))
    await FLUSH(0)
  })

  it('T5: drenado -- segunda edición mientras el PATCH anterior sigue en vuelo no dispara un fetch en paralelo, dispara una ronda más al resolver', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`
    const round1 = deferred<unknown>()
    const round2 = deferred<unknown>()
    let call = 0
    setRoute(`PATCH ${routeUrl}`, () => (++call === 1 ? round1.promise : round2.promise))

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    await act(async () => { fireEvent.focus(descInput); fireEvent.change(descInput, { target: { value: 'Valor A' } }) })
    await FLUSH(800)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(1)

    // Segunda edición mientras la ronda 1 sigue sin resolver.
    await act(async () => { fireEvent.change(descInput, { target: { value: 'Valor B' } }) })
    await FLUSH(800)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(1) // sigue siendo 1 -- nada en paralelo

    round1.resolve(jsonResponse({ item: buildItem({ descripcion: 'Valor A' }) }))
    await FLUSH(0)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(2) // ronda 2 disparada al drenar
    const secondBody = JSON.parse(String((fetchMock.mock.calls.filter(([u]) => u === routeUrl)[1][1] as RequestInit).body))
    expect(secondBody.descripcion).toBe('Valor B')

    round2.resolve(jsonResponse({ item: buildItem({ descripcion: 'Valor B' }) }))
    await FLUSH(0)
  })

  it('T6: retry -- varias ediciones encoladas durante una ronda en vuelo producen exactamente 1 ronda adicional (nunca más)', async () => {
    const cot = buildCotizacion()
    const { container, fetchMock } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`
    const rounds = [deferred<unknown>(), deferred<unknown>()]
    let call = 0
    setRoute(`PATCH ${routeUrl}`, () => rounds[Math.min(call++, rounds.length - 1)].promise)

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    await act(async () => { fireEvent.focus(descInput); fireEvent.change(descInput, { target: { value: 'V1' } }) })
    await FLUSH(800)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(1)

    // 3 ediciones más encoladas antes de que la ronda 1 resuelva.
    await act(async () => { fireEvent.change(descInput, { target: { value: 'V2' } }) })
    await FLUSH(100)
    await act(async () => { fireEvent.change(descInput, { target: { value: 'V3' } }) })
    await FLUSH(100)
    await act(async () => { fireEvent.change(descInput, { target: { value: 'V4 final' } }) })
    await FLUSH(800)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(1) // ninguna disparó fetch en paralelo

    rounds[0].resolve(jsonResponse({ item: buildItem({ descripcion: 'V1' }) }))
    await FLUSH(0)
    const afterDrain = fetchMock.mock.calls.filter(([u]) => u === routeUrl)
    expect(afterDrain).toHaveLength(2) // exactamente 1 ronda adicional
    expect(JSON.parse(String((afterDrain[1][1] as RequestInit).body)).descripcion).toBe('V4 final')

    rounds[1].resolve(jsonResponse({ item: buildItem({ descripcion: 'V4 final' }) }))
    await FLUSH(0)
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(2) // sin ronda 3
  })

  it('T7 (realidad, corrige la descripción del plan): Notas NO tiene banner de conflicto -- un fallo de guardado se trata como error genérico', async () => {
    const cot = buildCotizacion()
    const { container } = await renderPage(cot)
    mocks.saveQuotationNotesMock.mockRejectedValueOnce(new Error('Conflicto simulado'))

    // Bloque 2 sub-tarea 8: "Nota de evento" ahora vive en un pop-up -- el
    // textarea solo existe en el DOM tras abrirlo.
    await act(async () => { fireEvent.click(screen.getByText('Nota de evento')) })
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.focus(textarea); fireEvent.change(textarea, { target: { value: 'Nota en conflicto' } }) })
    await FLUSH(800)

    expect(screen.getByText('Conflicto simulado')).toBeTruthy()
    expect(screen.queryByText(/^Usar /)).toBeNull()
    expect(screen.queryByText(/^Mantener /)).toBeNull()
  })

  it('T8: conflicto en un campo de Totales -- banner, "usar" revierte el campo, "mantener" reintenta con base refrescada', async () => {
    const cot = buildCotizacion()
    const { container } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/totales`
    setRoute(`PATCH ${routeUrl}`, () => jsonResponse({ error: 'conflict', fields: { descuento_valor: { base: 0, current: 50, attempted: 100 } } }, 409))

    const descuentoInput = container.querySelector('input[type="number"].w-24') as HTMLInputElement
    await act(async () => { fireEvent.change(descuentoInput, { target: { value: '100' } }) })
    await FLUSH(800)

    const usarBtn = screen.getByText('Usar "50"')
    expect(usarBtn).toBeTruthy()
    expect(screen.getByText('Mantener "100"')).toBeTruthy()

    setRoute(`PATCH ${routeUrl}`, () => jsonResponse({ ...cot, descuento_valor: 50 }))
    await act(async () => { fireEvent.click(usarBtn) })
    await FLUSH(0)

    expect(descuentoInput.value).toBe('50')
    expect(screen.queryByText('Usar "50"')).toBeNull()
  })

  it('T9: unmount con drenado en vuelo -- sin warning de React, sin timer colgado', async () => {
    const cot = buildCotizacion()
    const { container, unmount, fetchMock } = await renderPage(cot)
    const routeUrl = `/api/cotizaciones/${cot.id}/items/${ITEM_ID}`
    const pending = deferred<unknown>()
    setRoute(`PATCH ${routeUrl}`, () => pending.promise)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const descInput = container.querySelector('input[name="items.0.descripcion"]') as HTMLInputElement
    await act(async () => { fireEvent.focus(descInput); fireEvent.change(descInput, { target: { value: 'Editando...' } }) })

    // Todavía dentro de la ventana de debounce -- el timer sigue vivo.
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    // El efecto de cleanup (page.tsx:1649-1656) limpia todos los timers de
    // debounce/idle-release al desmontar.
    expect(vi.getTimerCount()).toBe(0)

    await FLUSH(1000) // si el timer no se limpió, aquí dispararía el fetch
    expect(fetchMock.mock.calls.filter(([u]) => u === routeUrl)).toHaveLength(0)

    // Resolver el PATCH que sí alcanzó a salir (si hubiera quedado uno en
    // vuelo antes del unmount) no debe lanzar ni producir un warning de acto
    // no envuelto -- en este caso ni siquiera llegó a salir.
    pending.resolve(jsonResponse({ item: buildItem() }))
    await FLUSH(0)

    const reactWarning = consoleErrorSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && (msg.includes('not wrapped in act') || msg.includes('unmounted component'))
    )
    expect(reactWarning).toBeUndefined()
    consoleErrorSpy.mockRestore()
  })

  it('T10: flush-before-transition -- aprobar() con un campo General dirty espera el flush antes de approve_cotizacion', async () => {
    const cot = buildCotizacion({ estado: 'EMITIDA' })
    const { container, fetchMock } = await renderPage(cot)
    const generalRoute = `/api/cotizaciones/${cot.id}/general`
    const patch = deferred<unknown>()
    setRoute(`PATCH ${generalRoute}`, () => patch.promise)
    mocks.approveQuotationMock.mockResolvedValue({ ...cot, estado: 'APROBADA' })

    const locacionInput = container.querySelector('input[name="locacion"]') as HTMLInputElement
    await act(async () => { fireEvent.change(locacionInput, { target: { value: 'Cambio antes de aprobar' } }) })
    // Sin esperar el debounce de 800ms -- se hace click de inmediato.

    const aprobarBtn = screen.getByText('Aprobar Cotización')
    await act(async () => { fireEvent.click(aprobarBtn) })
    await FLUSH(0)

    expect(fetchMock.mock.calls.filter(([u]) => u === generalRoute)).toHaveLength(1) // el flush ya disparó el PATCH
    expect(mocks.approveQuotationMock).not.toHaveBeenCalled() // pero aprobar() sigue esperando a que resuelva

    patch.resolve(jsonResponse({ ...cot, locacion: 'Cambio antes de aprobar' }))
    await FLUSH(0)

    expect(mocks.approveQuotationMock).toHaveBeenCalledTimes(1)
  })

  async function setupInterleavingScenario() {
    const cot = buildCotizacion({ estado: 'EMITIDA' })
    const { container, fetchMock, emitPresenceUpdate } = await renderPage(cot)
    const generalRoute = `/api/cotizaciones/${cot.id}/general`
    const flushPatch = deferred<unknown>()
    setRoute(`PATCH ${generalRoute}`, () => flushPatch.promise)

    const reconciliation = deferred<Cotizacion>()
    mocks.fetchQuotationDetailMock.mockReturnValue(reconciliation.promise)
    mocks.approveQuotationMock.mockResolvedValue({ ...cot, estado: 'APROBADA' })

    const locacionInput = container.querySelector('input[name="locacion"]') as HTMLInputElement
    await act(async () => { fireEvent.change(locacionInput, { target: { value: 'Valor local del usuario' } }) })
    // Blur explícito: simula que el usuario se movió a otro control antes de
    // pulsar Aprobar -- dispara handleGeneralBlur, que a su vez flushea de
    // inmediato el campo dirty (no espera el debounce de 800ms).
    await act(async () => { fireEvent.blur(locacionInput) })
    await FLUSH(0) // el setTimeout(0) de handleGeneralBlur corre aquí

    expect(fetchMock.mock.calls.filter(([u]) => u === generalRoute)).toHaveLength(1)

    // Reconciliación disparada por un evento `general_confirmed` de Presence
    // (ajeno) mientras el flush de arriba sigue sin resolver.
    await emitPresenceUpdate({ latestGeneralConfirmed: { cotizacion_id: cot.id, at: new Date().toISOString() } })
    expect(mocks.fetchQuotationDetailMock).toHaveBeenCalledTimes(2) // carga inicial + esta reconciliación

    return { container, fetchMock, generalRoute, flushPatch, reconciliation, cot, locacionInput }
  }

  it('T11: interleaving orden A -- la reconciliación resuelve antes que el flush: el guard evita la pérdida', async () => {
    const { container, flushPatch, reconciliation, cot, locacionInput } = await setupInterleavingScenario()

    // Orden A: resuelve primero la reconciliación (con un valor de servidor
    // DISTINTO al que el usuario acaba de escribir -- si no hubiera guard,
    // esto pisaría lo que el usuario tecleó).
    reconciliation.resolve({ ...cot, locacion: 'Locación del servidor (reconciliación)' })
    await FLUSH(0)

    // Predicción cerrada del plan (3D-0, T11): mientras el flush del campo
    // sigue en vuelo, generalDirtyRef.current todavía es true -- el guard de
    // applyGeneralOnly (page.tsx:890) bloquea la sobreescritura.
    expect(locacionInput.value).toBe('Valor local del usuario')

    flushPatch.resolve(jsonResponse({ ...cot, locacion: 'Valor local del usuario' }))
    await FLUSH(0)

    expect(locacionInput.value).toBe('Valor local del usuario')
    void container
  })

  it('T12: interleaving orden B -- el flush resuelve antes que la reconciliación (F26/3D-0b: ya NO pisa el valor confirmado)', async () => {
    const { flushPatch, reconciliation, cot, locacionInput } = await setupInterleavingScenario()

    // Orden B: el flush confirma primero (limpia el dirty del campo y marca
    // generalFieldConfirmedAtRef.current['locacion'] con el instante de la
    // confirmación).
    flushPatch.resolve(jsonResponse({ ...cot, locacion: 'Valor local del usuario' }))
    await FLUSH(0)
    expect(locacionInput.value).toBe('Valor local del usuario')

    // La reconciliación en vuelo resuelve DESPUÉS, con una lectura capturada
    // ANTES de que el flush confirmara (por eso trae un valor viejo).
    reconciliation.resolve({ ...cot, locacion: 'Locación vieja (snapshot pre-flush)' })
    await FLUSH(0)

    // Characterization test corregido (era el que documentaba el bug F26
    // antes del fix de 3D-0b): con el guard por-instante
    // (generalFieldConfirmedAtRef >= pedidoEn de la reconciliación), el campo
    // ya no está "libre" solo porque dejó de estar dirty/saving -- su
    // confirmación es más nueva que el arranque de esta reconciliación, así
    // que se salta igual que en T11. Este test debe fallar (rojo) contra el
    // código anterior a 3D-0b y pasar (verde) contra el código con el fix.
    expect(locacionInput.value).toBe('Valor local del usuario')
  })

  it('T13: dos campos DISTINTOS de General -- el fix de F26/3D-0b es por campo, no por sección completa', async () => {
    const cot = buildCotizacion({ estado: 'EMITIDA' })
    const { container, fetchMock, emitPresenceUpdate } = await renderPage(cot)
    const generalRoute = `/api/cotizaciones/${cot.id}/general`
    const flushPatch = deferred<unknown>()
    setRoute(`PATCH ${generalRoute}`, () => flushPatch.promise)

    const reconciliation = deferred<Cotizacion>()
    mocks.fetchQuotationDetailMock.mockReturnValue(reconciliation.promise)

    const locacionInput = container.querySelector('input[name="locacion"]') as HTMLInputElement
    // `cliente` no tiene `name` (input controlado a mano, sin register()) --
    // se ubica por placeholder, igual que el resto del módulo lo hace por rol.
    const clienteInput = container.querySelector('input[placeholder="Nombre del cliente"]') as HTMLInputElement

    // `locacion`: editar y blur -- flush inmediato, sin esperar el debounce.
    await act(async () => { fireEvent.change(locacionInput, { target: { value: 'Locación confirmada' } }) })
    await act(async () => { fireEvent.blur(locacionInput) })
    await FLUSH(0) // el setTimeout(0) de handleGeneralBlur corre aquí
    expect(fetchMock.mock.calls.filter(([u]) => u === generalRoute)).toHaveLength(1)

    // `cliente`: editar SIN blur -- queda dirty, su propio debounce de 800ms
    // nunca corre en este test, así que nunca manda su PATCH.
    await act(async () => { fireEvent.change(clienteInput, { target: { value: 'Cliente todavía sucio' } }) })

    // Reconciliación disparada por Presence mientras el flush de `locacion`
    // sigue en vuelo.
    await emitPresenceUpdate({ latestGeneralConfirmed: { cotizacion_id: cot.id, at: new Date().toISOString() } })
    expect(mocks.fetchQuotationDetailMock).toHaveBeenCalledTimes(2)

    // El flush de `locacion` confirma primero -- queda protegido por el
    // guard por-instante.
    flushPatch.resolve(jsonResponse({ ...cot, locacion: 'Locación confirmada' }))
    await FLUSH(0)
    expect(locacionInput.value).toBe('Locación confirmada')

    // La reconciliación resuelve después, con una lectura vieja para AMBOS
    // campos.
    reconciliation.resolve({ ...cot, locacion: 'Locación vieja (snapshot pre-flush)', cliente: 'Cliente vieja (snapshot pre-flush)' })
    await FLUSH(0)

    // `locacion` (confirmado): protegido por generalFieldConfirmedAtRef -- no
    // se pisa con la lectura vieja.
    expect(locacionInput.value).toBe('Locación confirmada')
    // `cliente` (todavía dirty): se salta igual que siempre, por el guard
    // original de dirty -- nunca llegó a mandar su propio PATCH.
    expect(clienteInput.value).toBe('Cliente todavía sucio')
  })
})
