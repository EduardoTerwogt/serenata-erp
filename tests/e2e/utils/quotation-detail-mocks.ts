import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export interface CotizacionDetailMockOptions {
  id: string
  estado: 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
  cliente?: string
  proyecto?: string
}

function buildFakePdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF', 'utf-8')
}

export async function mockCotizacionDetailApis(page: Page, options: CotizacionDetailMockOptions) {
  const cotizacion = {
    id: options.id,
    cliente: options.cliente ?? 'Cervezas del Bravo',
    proyecto: options.proyecto ?? 'Spot Verano E2E',
    fecha_entrega: '2026-06-15',
    locacion: 'CDMX',
    fecha_cotizacion: '2026-05-01',
    tipo: 'PRINCIPAL' as const,
    es_complementaria_de: null as string | null,
    estado: options.estado,
    subtotal: 15000,
    fee_agencia: 0,
    general: 0,
    iva: 2400,
    total: 17400,
    margen_total: 9000,
    utilidad_total: 9000,
    created_at: '2026-05-01T00:00:00Z',
    fecha_aprobacion: null as string | null,
    porcentaje_fee: 0.15,
    iva_activo: true,
    descuento_tipo: 'monto' as const,
    descuento_valor: 0,
    drive_file_id: null as string | null,
    calendar_event_id: null as string | null,
    notas_internas: null as string | null,
    items: [
      {
        id: 'item-detail-1',
        cotizacion_id: options.id,
        categoria: 'Producción',
        descripcion: 'Renta de cámara',
        cantidad: 1,
        precio_unitario: 15000,
        importe: 15000,
        responsable_nombre: 'Sofía Ramírez',
        responsable_id: 'resp-1',
        x_pagar: 6000,
        margen: 9000,
        orden: 1,
        notas: null,
      },
    ],
  }

  await page.route(`**/api/cotizaciones/${options.id}`, async (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      Object.assign(cotizacion, {
        cliente: body.cliente ?? cotizacion.cliente,
        proyecto: body.proyecto ?? cotizacion.proyecto,
        fecha_entrega: body.fecha_entrega ?? cotizacion.fecha_entrega,
        locacion: body.locacion ?? cotizacion.locacion,
        estado: (body.estado as typeof cotizacion.estado) ?? cotizacion.estado,
        notas_internas: body.notas_internas !== undefined ? (body.notas_internas as string | null) : cotizacion.notas_internas,
      })
      await fulfillJson(route, cotizacion)
      return
    }
    await fulfillJson(route, cotizacion)
  })

  await page.route(`**/api/cotizaciones/${options.id}/general`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    Object.assign(cotizacion, {
      cliente: body.cliente ?? cotizacion.cliente,
      proyecto: body.proyecto ?? cotizacion.proyecto,
      fecha_entrega: body.fecha_entrega ?? cotizacion.fecha_entrega,
      locacion: body.locacion ?? cotizacion.locacion,
    })
    await fulfillJson(route, cotizacion)
  })

  await page.route(`**/api/cotizaciones/${options.id}/notas`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    cotizacion.notas_internas = (body.notas_internas as string | null) ?? null
    await fulfillJson(route, cotizacion)
  })

  await page.route(`**/api/cotizaciones/${options.id}/totales`, async (route) => {
    await fulfillJson(route, cotizacion)
  })

  await page.route(`**/api/cotizaciones/${options.id}/items/*`, async (route) => {
    await fulfillJson(route, { item: cotizacion.items[0] })
  })

  await page.route(`**/api/cotizaciones/${options.id}/aprobar`, async (route) => {
    cotizacion.estado = 'APROBADA'
    cotizacion.fecha_aprobacion = '2026-05-10T00:00:00Z'
    await fulfillJson(route, { already_approved: false, cotizacion_id: options.id })
  })

  await page.route(`**/api/cotizaciones/${options.id}/cancelar`, async (route) => {
    cotizacion.estado = 'CANCELADA'
    await fulfillJson(route, cotizacion)
  })

  await page.route(`**/api/cotizaciones/${options.id}/generar-pdf`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
      body: buildFakePdfBuffer(),
    })
  })

  await page.route('**/api/integrations/drive/upload', async (route) => {
    await fulfillJson(route, { fileId: 'drive-e2e-1', webViewLink: 'https://drive.google.com/file/d/drive-e2e-1/view' })
  })

  await page.route('**/api/proveedores', async (route) => {
    await fulfillJson(route, [
      { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
    ])
  })

  await page.route('**/api/clientes**', async (route) => {
    await fulfillJson(route, [])
  })

  await page.route('**/api/productos**', async (route) => {
    await fulfillJson(route, [])
  })

  return cotizacion
}
