// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoCuentaRespuesta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { sections: ['cuentas'] } } }) }))

import { RegistrarPago } from '../RegistrarPago'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const concepto = (id: string, proyecto: string, saldo: number) => ({
  key: `g:${id}`,
  objetivo: 'grupo' as const,
  id,
  proyecto_id: proyecto,
  proyecto_nombre: `Proyecto ${proyecto}`,
  cotizacion_id: proyecto,
  folio: proyecto,
  concepto: `Proyecto ${proyecto}`,
  total: saldo,
  pagado: 0,
  saldo,
  estado: 'facturado' as const,
  paso: null,
  venc_dias: null,
  fecha_vencimiento: null,
  resuelto: false,
})
const factura = (id: string, c: ReturnType<typeof concepto>) => ({
  id,
  uuid_cfdi: `${id}-uuid`,
  total_cfdi: c.total,
  metodo_pago: 'PUE' as const,
  estado_validacion: 'validado',
  detalle_validacion: null,
  archivo_url: null,
  archivo_nombre: `${id}.xml`,
  fecha_carga: null,
  fecha_factura: '2026-09-12',
  fecha_vencimiento: null,
  total: c.total,
  pagado: 0,
  saldo: c.saldo,
  conceptos: [c],
})
const estado = (proyectos: string[]): EstadoCuentaRespuesta => {
  const todas = [concepto('g61', 'SH061', 28000), concepto('g62', 'SH062', 5800)].filter((c) => proyectos.includes(c.proyecto_id))
  return {
    lado: 'proveedor',
    hoy: '2026-10-07',
    contraparte: { id: 'prov1', nombre: 'Distrito Sonoro', rfc: null },
    resumen: { total: 0, pagado: 0, saldo: 0, vencido: 0, facturas: todas.length, sin_factura: 0, sin_factura_saldo: 0 },
    facturas: todas.map((c) => factura(`f-${c.id}`, c)),
    sin_factura: [],
    pagos: [],
  } as unknown as EstadoCuentaRespuesta
}

const proyectosSelector = [
  { proyecto_id: 'SH061', proyecto: 'Lanzamiento', cliente: 'Altavista', fecha_entrega: null, contrapartes: [{ id: 'prov1', nombre: 'Distrito Sonoro', facturas: 1, saldo: 28000 }] },
  { proyecto_id: 'SH062', proyecto: 'Spot', cliente: 'Cervecería', fecha_entrega: null, contrapartes: [{ id: 'prov1', nombre: 'Distrito Sonoro', facturas: 1, saldo: 5800 }] },
  { proyecto_id: 'SH070', proyecto: 'Festival', cliente: 'Fonoteca', fecha_entrega: null, contrapartes: [{ id: 'prov2', nombre: 'Fonoteca MX', facturas: 1, saldo: 9000 }] },
]
/** Como SQL: con `contraparte` solo salen los proyectos con saldo de esa contraparte. */
const selector = (contraparte: string | null) => {
  const proyectos = contraparte ? proyectosSelector.filter((p) => p.contrapartes.some((c) => c.id === contraparte)) : proyectosSelector
  return { modo: 'pago', total: proyectos.length, page: 1, page_size: 25, proyectos }
}

let llamadas: { url: string; method: string; datos: Record<string, unknown> | null }[]

beforeEach(() => {
  llamadas = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const fd = init?.body instanceof FormData ? init.body : null
      llamadas.push({ url, method: init?.method ?? 'GET', datos: fd?.get('datos') ? JSON.parse(String(fd.get('datos'))) : null })
      if (url.startsWith('/api/cuentas/proyectos-selector')) return Promise.resolve(json(selector(new URL(url, 'http://x').searchParams.get('contraparte'))))
      if (url.startsWith('/api/cuentas/contrapartes')) return Promise.resolve(json({ total: 1, contrapartes: [{ id: 'prov1', nombre: 'Distrito Sonoro', pendientes: 2 }] }))
      if (url.startsWith('/api/cuentas/estado-cuenta')) {
        const filtro = new URL(url, 'http://x').searchParams.get('proyectos')
        return Promise.resolve(json(estado(filtro ? filtro.split(',') : ['SH061', 'SH062'])))
      }
      if (url === '/api/cuentas/pagos') return Promise.resolve(json({ success: true, resumen: {}, pago: { pago_id: 'p1', comprobante_url: null } }))
      return Promise.resolve(json({}))
    })
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Con la contraparte en el estado, como la usa Cuentas (el desplegable llama a `onCambio`). */
function Ventana() {
  const [c, setC] = useState<{ lado: LadoCuentas; contraparteId: string | null }>({ lado: 'proveedor', contraparteId: null })
  return <RegistrarPago escritorio lado={c.lado} contraparteId={c.contraparteId} proyecto={null} hoy="2026-10-07" onCambio={setC} onClose={() => {}} onRegistrado={() => {}} />
}

async function elegirProveedor() {
  fireEvent.click(screen.getByRole('button', { name: /Elegir proveedor/ }))
  fireEvent.click(await screen.findByRole('option', { name: /Distrito Sonoro/ }))
  await screen.findByLabelText(/Monto transferido/)
}

const caja = (nombre: string | RegExp) => screen.findByRole('checkbox', { name: nombre })

describe('Registrar pago · por proyecto (#130, #131)', () => {
  it('el modo «Elegir proyectos» solo sale con contraparte y lista solo sus proyectos', async () => {
    render(<Ventana />)
    expect(screen.queryByRole('button', { name: 'Elegir proyectos' })).toBeNull()
    await elegirProveedor()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proyectos' }))

    expect(await caja('Incluir SH061 · Lanzamiento')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Incluir SH062 · Spot' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /SH070/ })).toBeNull()
    expect(llamadas.some((l) => l.url.includes('/proyectos-selector') && l.url.includes('modo=pago') && l.url.includes('contraparte=prov1'))).toBe(true)
  })

  it('marcar proyectos limita el estado de cuenta a ellos', async () => {
    render(<Ventana />)
    await elegirProveedor()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proyectos' }))
    fireEvent.click(await caja('Incluir SH061 · Lanzamiento'))
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('/estado-cuenta') && l.url.includes('id=prov1') && l.url.includes('proyectos=SH061'))).toBe(true))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir SH062 · Spot' }))
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('proyectos=SH061%2CSH062'))).toBe(true))
  })

  it('registra el pago repartido entre los proyectos marcados, una sola contraparte', async () => {
    render(<Ventana />)
    await elegirProveedor()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proyectos' }))
    fireEvent.click(await caja('Incluir SH061 · Lanzamiento'))
    fireEvent.click(await caja('Incluir SH062 · Spot'))
    const monto = await screen.findByLabelText(/Monto transferido/)
    fireEvent.change(monto, { target: { value: '33,800.00' } })
    const registrar = () => screen.getByRole('button', { name: 'Registrar pago' }) as HTMLButtonElement
    await waitFor(() => expect(registrar().disabled).toBe(false))
    fireEvent.click(registrar())
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/cuentas/pagos')).toBe(true))
    const post = llamadas.find((l) => l.url === '/api/cuentas/pagos')!
    expect(post.datos).toMatchObject({
      lado: 'proveedor',
      lineas: [
        { id: 'g61', monto: 28000, saldo_esperado: 28000 },
        { id: 'g62', monto: 5800, saldo_esperado: 5800 },
      ],
    })
  })
})

describe('Registrar pago · una contraparte, varias facturas (#131)', () => {
  it('el desplegable ocupa el lugar del aviso, sin pestañas por contraparte/proyecto, y un solo pago cubre varias facturas', async () => {
    render(<Ventana />)
    expect(screen.queryByRole('button', { name: 'Por contraparte' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Por proyecto' })).toBeNull()
    expect(screen.queryByText(/Elige el proveedor al que se le transfirió/)).toBeNull()
    expect(screen.queryByText(/Elige el cliente que depositó/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Elegir proveedor/ }))
    expect(await screen.findByText('Solo proveedores con saldo por pagar')).toBeTruthy()
    expect(llamadas.some((l) => l.url.includes('/api/cuentas/contrapartes') && l.url.includes('lado=proveedor') && l.url.includes('pendiente=saldo'))).toBe(true)
    fireEvent.click(await screen.findByRole('option', { name: /Distrito Sonoro/ }))

    // Sus dos facturas (una por proyecto) se piden sin limitar proyectos y el pago se reparte entre ellas.
    const monto = await screen.findByLabelText(/Monto transferido/)
    expect(llamadas.some((l) => l.url.includes('/estado-cuenta') && l.url.includes('id=prov1') && !l.url.includes('proyectos='))).toBe(true)
    fireEvent.change(monto, { target: { value: '33,800.00' } })
    const registrar = () => screen.getByRole('button', { name: 'Registrar pago' }) as HTMLButtonElement
    await waitFor(() => expect(registrar().disabled).toBe(false))
    fireEvent.click(registrar())
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/cuentas/pagos')).toBe(true))
    expect(llamadas.find((l) => l.url === '/api/cuentas/pagos')!.datos).toMatchObject({
      lado: 'proveedor',
      lineas: [
        { id: 'g61', monto: 28000, saldo_esperado: 28000 },
        { id: 'g62', monto: 5800, saldo_esperado: 5800 },
      ],
    })
  })

  it('«Todas sus facturas» regresa a las facturas de la contraparte elegida', async () => {
    render(<Ventana />)
    await elegirProveedor()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proyectos' }))
    expect(await caja('Incluir SH061 · Lanzamiento')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Todas sus facturas' }))
    expect(await screen.findByLabelText(/Monto transferido/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /SH061/ })).toBeNull()
  })
})

describe('Registrar pago · pasos, reparto legible y pulido (#131)', () => {
  it('«Marcar todos» marca los proyectos de la contraparte y la barra dice cuántos y cuánto', async () => {
    render(<Ventana />)
    await elegirProveedor()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir proyectos' }))
    expect(await screen.findByText('0 de 2 marcados · $0.00 por pagar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos' }))
    expect(await screen.findByText('2 de 2 marcados · $33,800.00 por pagar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todos' }))
    expect(await screen.findByText('0 de 2 marcados · $0.00 por pagar')).toBeTruthy()
  })

  it('tres pasos con el nombre de quién se paga; el pie dice «Cuadra» cuando lo aplicado es igual al monto', async () => {
    render(<Ventana />)
    expect(screen.getByRole('region', { name: '¿A quién se le paga?' })).toBeTruthy()
    await elegirProveedor()
    expect(screen.getByRole('region', { name: '¿Cuánto y cuándo?' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Se reparte así' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Monto transferido/), { target: { value: '33800' } })
    expect(await screen.findByText('Cuadra · 2 facturas')).toBeTruthy()
  })

  it('las facturas con monto aplicado se abren solas y muestran lo que queda; las de $0 quedan cerradas', async () => {
    render(<Ventana />)
    await elegirProveedor()
    fireEvent.change(screen.getByLabelText(/Monto transferido/), { target: { value: '28000' } })
    expect(await screen.findByText('de saldo $28,000.00 · queda $0.00')).toBeTruthy()
    // La primera factura (SH061) recibe todo el monto y se abre; la segunda queda en $0 y cerrada.
    expect(screen.getByLabelText('Aplicar a SH061')).toBeTruthy()
    expect(screen.queryByLabelText('Aplicar a SH062')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /SH062|f-g62/ }))
    expect(await screen.findByLabelText('Aplicar a SH062')).toBeTruthy()
  })

  it('el monto queda con formato al salir del campo y «Repartir automáticamente» lo reparte otra vez', async () => {
    render(<Ventana />)
    await elegirProveedor()
    const monto = screen.getByLabelText(/Monto transferido/) as HTMLInputElement
    fireEvent.change(monto, { target: { value: '33800' } })
    fireEvent.blur(monto)
    expect(monto.value).toBe('33,800.00')
    fireEvent.click(screen.getByRole('button', { name: 'Repartir automáticamente' }))
    expect(await screen.findByText('Cuadra · 2 facturas')).toBeTruthy()
  })

  it('la nota va detrás de «+ Agregar nota» y el comprobante se llama «Adjuntar archivo» en escritorio', async () => {
    render(<Ventana />)
    await elegirProveedor()
    expect(screen.queryByPlaceholderText('Notas sobre el pago')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar nota' }))
    expect(await screen.findByPlaceholderText('Notas sobre el pago')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adjuntar archivo' })).toBeTruthy()
  })
})
