// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviewFactura } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { ProyectoSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { sections: ['cuentas'] } } }) }))

import { SubirFactura } from '../SubirFactura'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const base = (extra: Partial<PreviewFactura> = {}): PreviewFactura => ({
  tipo: 'factura_proveedor',
  lado: 'proveedor',
  cfdi: { uuid: 'U-1', fecha: '2026-10-01T10:00:00', total: 5800, subtotal: 5000, metodo_pago: 'PUE', rfc_emisor: 'AAA010101AAA', rfc_receptor: 'SER010101AAA', conceptos: [], folios: [] },
  rfc_contraparte: 'AAA010101AAA',
  contraparte: null,
  ambiguas: [],
  ofrecer_guardar_rfc: false,
  rfc_distinto: false,
  candidatos: [],
  preseleccion: [],
  cuadre: null,
  duplicada: null,
  tolerancia: 1,
  propuesta: [],
  coincidencias_nombre: [],
  emisor: { rfc: 'AAA010101AAA', nombre: 'Audio SA de CV', regimen_codigo: '601', regimen_sugerido: 'moral' },
  receptor: { rfc: 'SER010101AAA', nombre: 'Serenata' },
  cliente_tiene_constancia: null,
  ...extra,
})

const proyecto: ProyectoSelector = {
  proyecto_id: 'SH001',
  proyecto: 'Boda Lopez',
  cliente: 'Lopez',
  fecha_entrega: null,
  de_contraparte: false,
  renglones: [
    { cuenta_id: 'c1', descripcion: 'Audio ceremonia', costo_total: 3000, gasto_extra: false, responsable_id: null, responsable: null, grupo_id: null, grupo_estado: null, bloqueado: false },
    { cuenta_id: 'c2', descripcion: 'Audio fiesta', costo_total: 2000, gasto_extra: false, responsable_id: null, responsable: null, grupo_id: null, grupo_estado: null, bloqueado: false },
  ],
}

interface Llamada {
  url: string
  method: string
  datos: Record<string, unknown> | null
  constancia: boolean
}
let llamadas: Llamada[]
let previews: PreviewFactura[]
let respuestasGuardar: Response[]
let proyectoActual: ProyectoSelector
let contrapartes: { id: string; nombre: string; pendientes: number }[]
let reintentoFalla = false

function fetchSimulado(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const fd = init?.body instanceof FormData ? init.body : null
  llamadas.push({ url, method, datos: fd?.get('datos') ? JSON.parse(String(fd.get('datos'))) : null, constancia: Boolean(fd?.get('constancia')) })
  if (url.startsWith('/api/cuentas/facturas/preview')) return Promise.resolve(json(previews.length > 1 ? previews.shift() : previews[0]))
  if (url.startsWith('/api/cuentas/proyectos-selector')) return Promise.resolve(json({ modo: 'renglones', total: 1, page: 1, page_size: 25, proyectos: [proyectoActual] }))
  if (url.startsWith('/api/cuentas/contrapartes')) return Promise.resolve(json({ total: contrapartes.length, contrapartes }))
  if (url.includes('/reintentar-subida')) return Promise.resolve(json(reintentoFalla ? { error: 'subida_fallida', message: 'Drive no respondió.' } : { success: true, pendiente: false }, reintentoFalla ? 502 : 200))
  if (url === '/api/cuentas/facturas') return Promise.resolve(respuestasGuardar.shift() ?? json({ factura_id: 'f1', estado_validacion: 'validado' }, 201))
  if (url.startsWith('/api/cuentas/clientes/')) return Promise.resolve(json({ cliente: {} }))
  return Promise.resolve(json({}))
}

function abrir(archivos: File[] = [new File(['<xml/>'], 'factura.xml', { type: 'text/xml' })], props: { proyecto?: string } = {}) {
  const r = render(<SubirFactura escritorio onClose={() => {}} onGuardada={() => {}} {...props} />)
  const input = r.baseElement.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: archivos } })
  return r
}

const boton = (nombre: RegExp) => screen.getByRole('button', { name: nombre }) as HTMLButtonElement
const guardados = () => llamadas.filter((l) => l.url === '/api/cuentas/facturas' && l.method === 'POST')

beforeEach(() => {
  llamadas = []
  previews = []
  respuestasGuardar = []
  proyectoActual = proyecto
  contrapartes = []
  reintentoFalla = false
  vi.stubGlobal('fetch', vi.fn(fetchSimulado))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Subir factura · proveedor sin ficha (#130)', () => {
  it('"Es este proveedor" elige al de nombre parecido y vuelve a pedir la vista previa con él', async () => {
    previews = [base({ coincidencias_nombre: [{ id: 'p9', nombre: 'Audio y Video SA', score: 0.7 }] })]
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Audio y Video SA' }))
    await waitFor(() => expect(llamadas.filter((l) => l.url.startsWith('/api/cuentas/facturas/preview')).length).toBe(2))
    const ultima = llamadas.filter((l) => l.url.startsWith('/api/cuentas/facturas/preview')).at(-1)
    expect(ultima?.datos).toMatchObject({ contraparte_id: 'p9' })
  })

  it('proveedor nuevo con los renglones propuestos: pide los 4 datos y manda alta + renglones en un solo envío', async () => {
    previews = [base({ propuesta: [{ proyecto_id: 'SH001', proyecto: 'Boda Lopez', renglones: ['c1', 'c2'], neto: 5000 }] })]
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: /^Proveedor nuevo/ }))
    expect(await screen.findByText(/Cuadra con el XML/)).toBeTruthy()
    expect(boton(/Crear proveedor y registrar factura/).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: '5512345678' } })
    fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'pagos@audio.mx' } })
    fireEvent.change(screen.getByLabelText(/^Banco/), { target: { value: 'BBVA' } })
    fireEvent.change(screen.getByLabelText(/^CLABE/), { target: { value: '012345678901234567' } })
    await waitFor(() => expect(boton(/Crear proveedor y registrar factura/).disabled).toBe(false))

    fireEvent.click(boton(/Crear proveedor y registrar factura/))
    await waitFor(() => expect(guardados()).toHaveLength(1))
    expect(guardados()[0].datos).toMatchObject({
      contraparte_id: null,
      preparar: { renglones: ['c1', 'c2'], proveedor: { rfc: 'AAA010101AAA', nombre: 'Audio SA de CV', regimen_fiscal: 'moral', clabe: '012345678901234567' } },
    })
  })

  it('gasto extra: pide proyecto, concepto y costo, y manda el costo numérico', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' } })]
    abrir()
    // Paso 1: el proyecto. Sin él no hay interruptor ni destino; sin sugerencia se elige del desplegable.
    expect(boton(/Guardar factura|Asignar y registrar factura/).disabled).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir proyecto' }))
    fireEvent.click(await screen.findByRole('button', { name: /SH001/ }))
    fireEvent.click(await screen.findByRole('switch', { name: /gasto extra/ }))
    expect(boton(/Registrar gasto y factura/).disabled).toBe(true)
    // El costo arranca con el neto del XML (5,000.00) y se puede corregir.
    expect((screen.getByLabelText(/Costo neto al proveedor/) as HTMLInputElement).value).toBe('5000.00')

    fireEvent.change(screen.getByLabelText(/^Concepto/), { target: { value: 'Renta de grúa' } })
    fireEvent.change(screen.getByLabelText(/Costo neto al proveedor/), { target: { value: '5,000.00' } })
    await waitFor(() => expect(boton(/Registrar gasto y factura/).disabled).toBe(false))

    fireEvent.click(boton(/Registrar gasto y factura/))
    await waitFor(() => expect(guardados()).toHaveLength(1))
    expect(guardados()[0].datos).toMatchObject({ contraparte_id: 'p1', preparar: { gasto: { proyecto_id: 'SH001', concepto: 'Renta de grúa', costo_total: 5000 } } })
    expect(guardados()[0].datos?.preparar).not.toHaveProperty('renglones')
  })

  it('proveedor existente: elige el proyecto y se marcan sus conceptos; si son justo su grupo abierto, se liga al grupo sin reasignar', async () => {
    const suyo = (id: string, descripcion: string) => ({ cuenta_id: id, descripcion, costo_total: 2500, gasto_extra: false, responsable_id: 'p1', responsable: 'Audio SA', grupo_id: 'g1', grupo_estado: 'ABIERTO', bloqueado: false })
    proyectoActual = { ...proyecto, renglones: [suyo('c1', 'Audio ceremonia'), suyo('c2', 'Audio fiesta'), { ...proyecto.renglones![0], cuenta_id: 'c3', descripcion: 'Humo' }] }
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' } })]
    abrir(undefined, { proyecto: 'SH001' })

    // Los dos conceptos del proveedor vienen marcados y el tercero (libre) no.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Incluir Audio ceremonia/ }).getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByRole('checkbox', { name: /Incluir Audio fiesta/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: /Incluir Humo/ }).getAttribute('aria-checked')).toBe('false')
    await waitFor(() => expect(boton(/Guardar factura/).disabled).toBe(false))
    fireEvent.click(boton(/Guardar factura/))
    await waitFor(() => expect(guardados()).toHaveLength(1))
    expect(guardados()[0].datos).toMatchObject({ contraparte_id: 'p1', grupo_id: 'g1' })
    expect(guardados()[0].datos).not.toHaveProperty('preparar')
  })

  it('sumar un concepto libre al grupo del proveedor asigna conceptos: manda preparar con todos los marcados', async () => {
    const suyo = (id: string) => ({ cuenta_id: id, descripcion: `Concepto ${id}`, costo_total: 2500, gasto_extra: false, responsable_id: 'p1', responsable: 'Audio SA', grupo_id: 'g1', grupo_estado: 'ABIERTO', bloqueado: false })
    proyectoActual = { ...proyecto, renglones: [suyo('c1'), { ...proyecto.renglones![0], cuenta_id: 'c3', descripcion: 'Humo' }] }
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' } })]
    abrir(undefined, { proyecto: 'SH001' })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Incluir Concepto c1/ }).getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(screen.getByRole('checkbox', { name: /Incluir Humo/ }))
    await waitFor(() => expect(boton(/Asignar y registrar factura/).disabled).toBe(false))
    fireEvent.click(boton(/Asignar y registrar factura/))
    await waitFor(() => expect(guardados()).toHaveLength(1))
    expect(guardados()[0].datos).toMatchObject({ contraparte_id: 'p1', preparar: { renglones: ['c1', 'c3'] } })
    expect(guardados()[0].datos).not.toHaveProperty('grupo_id')
  })

  it('si la subida falla después de preparar, el reintento usa el grupo ya creado y no repite el alta', async () => {
    previews = [base({ propuesta: [{ proyecto_id: 'SH001', proyecto: 'Boda Lopez', renglones: ['c1', 'c2'], neto: 5000 }] })]
    respuestasGuardar = [
      json({ error: 'subida_fallida', message: 'No se pudo subir a Drive', preparado: { proveedor_id: 'pNuevo', grupo_id: 'gNuevo' } }, 502),
      json({ factura_id: 'f1', estado_validacion: 'validado' }, 201),
    ]
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: /^Proveedor nuevo/ }))
    fireEvent.change(await screen.findByLabelText(/^Teléfono/), { target: { value: '5512345678' } })
    fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'pagos@audio.mx' } })
    fireEvent.change(screen.getByLabelText(/^Banco/), { target: { value: 'BBVA' } })
    fireEvent.change(screen.getByLabelText(/^CLABE/), { target: { value: '012345678901234567' } })
    await waitFor(() => expect(boton(/Crear proveedor y registrar factura/).disabled).toBe(false))
    fireEvent.click(boton(/Crear proveedor y registrar factura/))

    expect(await screen.findByText('No se pudo subir a Drive')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Reintentar subir la factura/ }))
    await waitFor(() => expect(guardados()).toHaveLength(2))
    expect(guardados()[0].datos).toHaveProperty('preparar')
    expect(guardados()[1].datos).toMatchObject({ contraparte_id: 'pNuevo', grupo_id: 'gNuevo' })
    expect(guardados()[1].datos).not.toHaveProperty('preparar')
    expect(guardados()[1].datos?.operation_id).toBe(guardados()[0].datos?.operation_id)
  })
})

describe('Subir factura · proyecto sugerido con casilla y desplegable (#131)', () => {
  const propuesta = [{ proyecto_id: 'SH001', proyecto: 'Boda Lopez', renglones: ['c1', 'c2'], neto: 5000 }]
  const otroProyecto: ProyectoSelector = { ...proyecto, proyecto_id: 'SH002', proyecto: 'Festival', renglones: [{ ...proyecto.renglones![0], cuenta_id: 'c9', descripcion: 'Luces' }] }

  it('el proyecto que coincide con el monto sale marcado con su motivo y sus conceptos se proponen', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' }, propuesta })]
    abrir()
    const caja = await screen.findByRole('checkbox', { name: 'Proyecto SH001' })
    expect(caja.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Coincide con el monto')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Incluir Audio ceremonia/ }).getAttribute('aria-checked')).toBe('true'))
    // El desplegable sigue a la mano para cambiarlo.
    expect(screen.getByRole('button', { name: 'Elegir otro proyecto' })).toBeTruthy()
  })

  it('el proyecto desde el que se abrió la ventana se sugiere aunque el monto no cuadre', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' } })]
    abrir(undefined, { proyecto: 'SH001' })
    expect((await screen.findByRole('checkbox', { name: 'Proyecto SH001' })).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Abierto desde este proyecto')).toBeTruthy()
  })

  it('desmarcar la sugerencia deja la factura sin proyecto y oculta los conceptos', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' }, propuesta })]
    abrir()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Proyecto SH001' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Proyecto SH001' }).getAttribute('aria-checked')).toBe('false'))
    expect(screen.queryByRole('checkbox', { name: /Incluir Audio ceremonia/ })).toBeNull()
    expect(screen.queryByRole('switch', { name: /gasto extra/ })).toBeNull()
    expect(boton(/Guardar factura|Asignar y registrar factura/).disabled).toBe(true)
  })

  it('elegir otro proyecto del desplegable lo marca y desmarca la sugerencia', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' }, propuesta })]
    abrir()
    await screen.findByRole('checkbox', { name: 'Proyecto SH001' })
    proyectoActual = otroProyecto
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otro proyecto' }))
    fireEvent.click(await screen.findByRole('button', { name: /SH002/ }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Proyecto SH002' }).getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByRole('checkbox', { name: 'Proyecto SH001' }).getAttribute('aria-checked')).toBe('false')
    expect(await screen.findByRole('checkbox', { name: /Incluir Luces/ })).toBeTruthy()
    // Volver a marcar la sugerencia regresa a su proyecto.
    proyectoActual = proyecto
    fireEvent.click(screen.getByRole('checkbox', { name: 'Proyecto SH001' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Proyecto SH001' }).getAttribute('aria-checked')).toBe('true'))
  })
})

describe('Subir factura · archivos pendientes de Drive (#131)', () => {
  const guardadaConPendiente = () =>
    json({ success: true, factura_id: 'f1', estado_validacion: 'validado', archivos_pendientes: [{ lado: 'proveedor', id: 'doc-xml', rol: 'xml', nombre: 'factura.xml' }] }, 201)
  const guardar = async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' }, propuesta: [{ proyecto_id: 'SH001', proyecto: 'Boda Lopez', renglones: ['c1', 'c2'], neto: 5000 }] })]
    abrir()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Incluir Audio ceremonia/ }).getAttribute('aria-checked')).toBe('true'))
    await waitFor(() => expect(boton(/Asignar y registrar factura/).disabled).toBe(false))
    fireEvent.click(boton(/Asignar y registrar factura/))
  }

  it('si Drive no recibió un archivo, la factura queda guardada y se ofrece reintentar solo la subida', async () => {
    respuestasGuardar = [guardadaConPendiente()]
    await guardar()
    expect(await screen.findByText('Factura guardada')).toBeTruthy()
    expect(screen.getByText(/factura\.xml no se subió a Drive\. Los datos ya están guardados/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar subida' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/cuentas/documentos/doc-xml/reintentar-subida' && l.method === 'POST')).toBe(true))
    // La factura no se vuelve a guardar: sigue habiendo un solo envío.
    expect(guardados()).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar subida' })).toBeNull())
  })

  it('si el reintento falla se avisa y el botón sigue disponible', async () => {
    respuestasGuardar = [guardadaConPendiente()]
    reintentoFalla = true
    await guardar()
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar subida' }))
    expect(await screen.findByText('Drive no respondió.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar subida' })).toBeTruthy()
  })
})

describe('Subir factura · reintento tras preparar (#130)', () => {
  it('cualquier error con `preparado` (no solo el 502) hace que el reintento use el grupo ya creado', async () => {
    previews = [base({ propuesta: [{ proyecto_id: 'SH001', proyecto: 'Boda Lopez', renglones: ['c1', 'c2'], neto: 5000 }] })]
    respuestasGuardar = [
      json({ error: 'proveedor_no_encontrado', message: 'Proveedor no encontrado', preparado: { proveedor_id: 'pNuevo', grupo_id: 'gNuevo' } }, 404),
      json({ factura_id: 'f1', estado_validacion: 'validado' }, 201),
    ]
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: /^Proveedor nuevo/ }))
    fireEvent.change(await screen.findByLabelText(/^Teléfono/), { target: { value: '5512345678' } })
    fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'pagos@audio.mx' } })
    fireEvent.change(screen.getByLabelText(/^Banco/), { target: { value: 'BBVA' } })
    fireEvent.change(screen.getByLabelText(/^CLABE/), { target: { value: '012345678901234567' } })
    await waitFor(() => expect(boton(/Crear proveedor y registrar factura/).disabled).toBe(false))
    fireEvent.click(boton(/Crear proveedor y registrar factura/))
    expect(await screen.findByText('Proveedor no encontrado')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Reintentar subir la factura/ }))
    await waitFor(() => expect(guardados()).toHaveLength(2))
    expect(guardados()[1].datos).toMatchObject({ contraparte_id: 'pNuevo', grupo_id: 'gNuevo' })
    expect(guardados()[1].datos).not.toHaveProperty('preparar')
  })
})

describe('Subir factura · cliente sin RFC (#130)', () => {
  const cobro = (extra: Partial<PreviewFactura> = {}) =>
    base({
      tipo: 'factura_cobro',
      lado: 'cobro',
      rfc_contraparte: 'CLI010101AAA',
      contraparte: null,
      emisor: null,
      candidatos: [],
      ...extra,
    })

  it('la constancia es obligatoria si el cliente no tiene; primero completa la ficha y luego sube la factura', async () => {
    const cuenta = { cuenta_id: 'cc1', cotizacion_id: 'q1', folio: 'SH010', proyecto_id: 'SH010', proyecto: 'Evento', monto_total: 1160, saldo: 1160, concepto: 'Evento', fecha_entrega: null }
    previews = [cobro()]
    abrir()
    // No hay cliente con ese RFC: se elige a mano (el preview siguiente ya trae la ficha y ofrece completarla).
    const elegir = await screen.findByRole('button', { name: /Elegir cliente/ })
    previews = [cobro({ contraparte: { id: 'cli1', nombre: 'Lopez SA', rfc: null }, ofrecer_guardar_rfc: true, cliente_tiene_constancia: false, candidatos: [cuenta as never], preseleccion: ['cc1'] })]
    contrapartes = [{ id: 'cli1', nombre: 'Lopez SA', pendientes: 1 }]
    fireEvent.click(elegir)
    fireEvent.click(await screen.findByRole('option', { name: /Lopez SA/ }))

    expect(await screen.findByText('Requerida')).toBeTruthy()
    // Los folios del CFDI ya marcan la cotización; solo falta la constancia.
    expect((await screen.findByRole('checkbox', { name: /Incluir/ })).getAttribute('aria-checked')).toBe('true')
    expect(boton(/Completar cliente y registrar factura/).disabled).toBe(true)

    const archivo = new File(['%PDF'], 'constancia.pdf', { type: 'application/pdf' })
    const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
    fireEvent.change(inputs.at(-1)!, { target: { files: [archivo] } })
    fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'cliente@lopez.mx' } })
    await waitFor(() => expect(boton(/Completar cliente y registrar factura/).disabled).toBe(false))

    fireEvent.click(boton(/Completar cliente y registrar factura/))
    await waitFor(() => expect(guardados()).toHaveLength(1))
    const orden = llamadas.filter((l) => l.method !== 'GET' && !l.url.includes('preview')).map((l) => `${l.method} ${l.url}`)
    expect(orden).toEqual(['PATCH /api/cuentas/clientes/cli1', 'POST /api/cuentas/facturas'])
    const patch = llamadas.find((l) => l.method === 'PATCH')
    expect(patch?.constancia).toBe(true)
    expect(patch?.datos).toMatchObject({ rfc: 'SER010101AAA', correo: 'cliente@lopez.mx' })
  })
})

describe('Subir factura · Adjuntar factura (#131)', () => {
  it('un solo botón recibe el XML y el PDF juntos y los pide de una vez', async () => {
    previews = [base({ contraparte: { id: 'p1', nombre: 'Audio SA', rfc: 'AAA010101AAA' } })]
    abrir([new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' }), new File(['<xml/>'], 'factura.xml', { type: 'text/xml' })])
    expect(await screen.findByText('factura.pdf')).toBeTruthy()
    expect(screen.getByText('factura.xml')).toBeTruthy()
    expect(screen.queryByText(/Elegir XML/)).toBeNull()
  })

  it('sin XML avisa que falta y no sigue; con dos XML tampoco', async () => {
    render(<SubirFactura escritorio onClose={() => {}} onGuardada={() => {}} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.multiple).toBe(true)
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'solo.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('Falta el XML de la factura.')).toBeTruthy()
    fireEvent.change(input, { target: { files: [new File(['<xml/>'], 'a.xml', { type: 'text/xml' }), new File(['<xml/>'], 'b.xml', { type: 'text/xml' })] } })
    expect(await screen.findByText('Adjunta un XML y, si lo tienes, su PDF.')).toBeTruthy()
    expect(llamadas.filter((l) => l.url.startsWith('/api/cuentas/facturas/preview'))).toHaveLength(0)
  })
})
