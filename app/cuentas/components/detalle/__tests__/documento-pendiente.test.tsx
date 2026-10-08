// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DetalleConcepto } from '@/lib/shared/cuentas/detalle-tipos'

import { TabDocumentos } from '../TabDocumentos'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const doc = (id: string, tipo: string, url: string, nombre: string) => ({ id, tipo, archivo_url: url, archivo_nombre: nombre, fecha_carga: '2026-10-01T10:00:00', estado_validacion: null, detalle_validacion: null })
const detalle = (xmlUrl: string) =>
  ({
    tipo: 'cobro',
    id: 'cc1',
    metodo: 'PUE',
    concepto: { metodo_desconocido: false },
    factura_xml: doc('xml1', 'FACTURA_XML', xmlUrl, 'f.xml'),
    factura_pdf: null,
    pagos: [],
    correcciones: { reabierta: false, bajas: [], pagos_anulados: [] },
  }) as unknown as DetalleConcepto

const objetivo = { tipo: 'cobro', id: 'cc1' } as never

describe('Documentos · archivo pendiente de Drive (#131)', () => {
  it('un archivo pendiente no se muestra como enlace: sale "Archivo pendiente" y se puede subir solo ese archivo', async () => {
    const ejecutar = vi.fn(async (accion: () => Promise<unknown>) => void (await accion()))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, pendiente: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { baseElement } = render(<TabDocumentos d={detalle('pendiente:xml')} objetivo={objetivo} ejecutar={ejecutar} avisarError={() => {}} corrige={false} onAbrirFactura={() => {}} />)
    expect(screen.getByText('Archivo pendiente')).toBeTruthy()
    expect(baseElement.querySelector('a[href^="pendiente:"]')).toBeNull()

    const inputs = Array.from(baseElement.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
    const xml = inputs.find((i) => i.accept.includes('xml'))!
    fireEvent.change(xml, { target: { files: [new File(['<xml/>'], 'f.xml', { type: 'text/xml' })] } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuentas/documentos/xml1/reintentar-subida', expect.objectContaining({ method: 'POST' })))
  })

  it('un archivo ya en Drive conserva su enlace "Ver"', () => {
    render(<TabDocumentos d={detalle('https://drive.google.com/x')} objetivo={objetivo} ejecutar={vi.fn()} avisarError={() => {}} corrige={false} onAbrirFactura={() => {}} />)
    expect(screen.queryByText('Archivo pendiente')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver' }).getAttribute('href')).toBe('https://drive.google.com/x')
  })
})
