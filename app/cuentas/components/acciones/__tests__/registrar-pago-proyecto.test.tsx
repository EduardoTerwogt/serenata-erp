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

const selector = {
  modo: 'pago',
  total: 3,
  page: 1,
  page_size: 25,
  proyectos: [
    { proyecto_id: 'SH061', proyecto: 'Lanzamiento', cliente: 'Altavista', fecha_entrega: null, contrapartes: [{ id: 'prov1', nombre: 'Distrito Sonoro', facturas: 1, saldo: 28000 }] },
    { proyecto_id: 'SH062', proyecto: 'Spot', cliente: 'Cervecería', fecha_entrega: null, contrapartes: [{ id: 'prov1', nombre: 'Distrito Sonoro', facturas: 1, saldo: 5800 }] },
    { proyecto_id: 'SH070', proyecto: 'Festival', cliente: 'Fonoteca', fecha_entrega: null, contrapartes: [{ id: 'prov2', nombre: 'Fonoteca MX', facturas: 1, saldo: 9000 }] },
  ],
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
      if (url.startsWith('/api/cuentas/proyectos-selector')) return Promise.resolve(json(selector))
      if (url.startsWith('/api/cuentas/estado-cuenta')) {
        const proyectos = new URL(url, 'http://x').searchParams.get('proyectos')?.split(',') ?? []
        return Promise.resolve(json(estado(proyectos)))
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

function Ventana() {
  const [lado, setLado] = useState<LadoCuentas>('proveedor')
  return <RegistrarPago escritorio lado={lado} contraparteId={null} proyecto={null} hoy="2026-10-07" onCambio={(c) => setLado(c.lado)} onClose={() => {}} onRegistrado={() => {}} />
}

const caja = (nombre: string | RegExp) => screen.findByRole('checkbox', { name: nombre })

describe('Registrar pago · por proyecto (#130)', () => {
  it('marcar un proyecto fija la contraparte, deshabilita las demás y carga solo esos proyectos', async () => {
    render(<Ventana />)
    fireEvent.click(screen.getByRole('button', { name: 'Por proyecto' }))
    const sh061 = await caja('Incluir SH061 · Distrito Sonoro')
    expect(((await caja('Incluir SH070 · Fonoteca MX')) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(sh061)
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('/estado-cuenta') && l.url.includes('id=prov1') && l.url.includes('proyectos=SH061'))).toBe(true))
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Incluir SH070 · Fonoteca MX' }) as HTMLButtonElement).disabled).toBe(true))
    expect(await screen.findByText('otra contraparte')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir SH062 · Distrito Sonoro' }))
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('proyectos=SH061%2CSH062'))).toBe(true))
  })

  it('registra el pago repartido entre los proyectos marcados, una sola contraparte', async () => {
    render(<Ventana />)
    fireEvent.click(screen.getByRole('button', { name: 'Por proyecto' }))
    fireEvent.click(await caja('Incluir SH061 · Distrito Sonoro'))
    fireEvent.click(await caja('Incluir SH062 · Distrito Sonoro'))
    const monto = await screen.findByLabelText(/Monto transferido/)
    fireEvent.change(monto, { target: { value: '33,800.00' } })
    const registrar = screen.getByRole('button', { name: 'Registrar pago' }) as HTMLButtonElement
    await waitFor(() => expect(registrar.disabled).toBe(false))
    fireEvent.click(registrar)
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
