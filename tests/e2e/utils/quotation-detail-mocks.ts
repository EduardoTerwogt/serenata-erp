import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export interface CotizacionDetailMockOptions {
  id: string
  estado: 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
  cliente?: string
  proyecto?: string
  /** Partidas iniciales; por defecto una partida ya capturada. */
  items?: CotizacionMockItem[]
  /** Plantillas de servicios que devuelve /api/service-templates. */
  templates?: ServiceTemplateMock[]
  /** Latencia artificial (ms) en POST/PATCH/DELETE de partidas. */
  itemLatencyMs?: number
  /** Fuerza que el DELETE de partidas responda 500. */
  failItemDelete?: boolean
  /** Latencia (ms) del GET de la cotización, para provocar respuestas obsoletas. */
  detailLatencyMs?: number
  /** Catálogo de productos que devuelve /api/productos (combobox de Descripción). */
  productos?: ProductoMock[]
  /** Catálogo de proveedores/responsables que devuelve /api/proveedores. */
  responsables?: ResponsableMock[]
}

interface ProductoMock {
  id: string
  descripcion: string
  categoria: string | null
  precio_unitario: number
  x_pagar_sugerido: number
  activo: boolean
  created_at: string
}

interface ResponsableMock {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  banco: string | null
  clabe: string | null
  roles: string[]
  notas: string | null
  activo: boolean
  created_at: string
}

interface CotizacionMockItem {
  id: string
  cotizacion_id: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  responsable_nombre: string | null
  responsable_id: string | null
  x_pagar: number
  margen: number
  orden: number
  notas: string | null
}

interface ServiceTemplateMock {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  items: Array<{
    categoria: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    x_pagar: number
    responsable_nombre?: string | null
    responsable_id?: string | null
  }>
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
    items: options.items ?? ([
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
    ] as CotizacionMockItem[]),
  }

  let getsDeCotizacion = 0
  await page.route(`**/api/cotizaciones/${options.id}`, async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      getsDeCotizacion += 1
      if (options.detailLatencyMs) await new Promise((r) => setTimeout(r, options.detailLatencyMs))
    }
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

  const round2 = (value: number) => Math.round(value * 100) / 100
  const recalcularEncabezado = () => {
    const subtotal = round2(cotizacion.items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0))
    const fee = round2(subtotal * cotizacion.porcentaje_fee)
    const general = round2(subtotal + fee)
    const iva = cotizacion.iva_activo ? round2(general * 0.16) : 0
    Object.assign(cotizacion, {
      subtotal,
      fee_agencia: fee,
      general,
      iva,
      total: round2(general + iva),
      margen_total: round2(cotizacion.items.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario - item.x_pagar), 0)),
    })
  }

  const itemLatency = () => options.itemLatencyMs ? new Promise((r) => setTimeout(r, options.itemLatencyMs)) : Promise.resolve()

  // POST /items -> crea una partida vacía, igual que el endpoint real. Fase 6B:
  // el cliente manda su propio id (crypto.randomUUID(), ya pintado en pantalla
  // antes de que esto responda) -- el mock lo respeta, igual que la ruta real,
  // para que el id nunca cambie entre lo optimista y lo confirmado.
  await page.route(`**/api/cotizaciones/${options.id}/items`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    const body = (route.request().postDataJSON() || {}) as { id?: string }
    await itemLatency()
    const created = {
      id: body.id || `item-detail-${cotizacion.items.length + 1}`,
      cotizacion_id: options.id,
      categoria: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      importe: 0,
      responsable_nombre: null,
      responsable_id: null,
      x_pagar: 0,
      margen: 0,
      orden: cotizacion.items.length + 1,
      notas: null,
    } satisfies CotizacionMockItem
    cotizacion.items.push(created)
    await fulfillJson(route, { item: created })
  })

  // POST /items/bulk -> alta masiva en una sola petición (plantillas y copiar de otra
  // cotización). Se registra DESPUÉS de /items/* porque en Playwright gana la última
  // ruta registrada y el comodín también casaría con "bulk".
  const bulkRoute = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    // Engineering Hardening EF-1 (1C-2b): `reemplazar_ids` es `{id, revision}[]`
    // desde que la ruta real pasó a llamar a `bulk_replace_items_cotizacion`
    // -- antes era `string[]` (el `upsertItems()` viejo). El mock quedó
    // comparando un objeto contra un string y `reusables` siempre daba vacío,
    // así que nunca "reusaba" la fila en blanco: la dejaba viva y encima
    // insertaba las partidas nuevas, dejando una fila de más.
    const body = (route.request().postDataJSON() || {}) as { items?: Record<string, unknown>[]; reemplazar_ids?: Array<{ id: string; revision?: number }> }
    await itemLatency()
    const reusables = (body.reemplazar_ids || [])
      .map((r) => r.id)
      .filter((rowId) => cotizacion.items.some((item) => item.id === rowId))

    ;(body.items || []).forEach((source, index) => {
      const cantidad = Number(source.cantidad) || 1
      const precio = Number(source.precio_unitario) || 0
      const xPagar = Number(source.x_pagar) || 0
      const campos = {
        categoria: String(source.categoria || ''),
        descripcion: String(source.descripcion || ''),
        cantidad,
        precio_unitario: precio,
        x_pagar: xPagar,
        importe: cantidad * precio,
        margen: cantidad * precio - xPagar,
      }
      const reusarId = reusables[index]
      const existente = reusarId ? cotizacion.items.findIndex((item) => item.id === reusarId) : -1
      if (existente >= 0) {
        cotizacion.items[existente] = { ...cotizacion.items[existente], ...campos }
        return
      }
      cotizacion.items.push({
        id: `item-bulk-${cotizacion.items.length + 1}`,
        cotizacion_id: options.id,
        responsable_nombre: null,
        responsable_id: null,
        orden: cotizacion.items.length + 1,
        notas: null,
        ...campos,
      })
    })

    for (const sobrante of reusables.slice((body.items || []).length)) {
      const index = cotizacion.items.findIndex((item) => item.id === sobrante)
      if (index >= 0) cotizacion.items.splice(index, 1)
    }

    recalcularEncabezado()
    await fulfillJson(route, { cotizacion })
  }

  // PATCH/DELETE /items/:itemId -> fusiona o elimina, para que las aserciones vean
  // el mismo estado que devolvería el servidor real.
  await page.route(`**/api/cotizaciones/${options.id}/items/*`, async (route) => {
    const method = route.request().method()
    const itemId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() || '')
    await itemLatency()
    const index = cotizacion.items.findIndex((item) => item.id === itemId)

    if (method === 'DELETE') {
      if (options.failItemDelete) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Error eliminando partida' }) })
        return
      }
      if (index >= 0) cotizacion.items.splice(index, 1)
      await fulfillJson(route, { ok: true })
      return
    }

    // base/mutation_id son protocolo de conflicto (Fase 2/6C), nunca campos de la
    // partida: si se fusionaran tal cual, ensuciarían el objeto que este mock reusa
    // como "la cotización" real.
    const { base: _base, mutation_id: _mutationId, ...body } = (route.request().postDataJSON() || {}) as Record<string, unknown>
    if (index >= 0) {
      const merged = { ...cotizacion.items[index], ...body }
      merged.importe = Number(merged.cantidad || 0) * Number(merged.precio_unitario || 0)
      merged.margen = merged.importe - Number(merged.x_pagar || 0)
      cotizacion.items[index] = merged
      await fulfillJson(route, { item: merged })
      return
    }
    await fulfillJson(route, { item: cotizacion.items[0] })
  })

  await page.route(`**/api/cotizaciones/${options.id}/items/bulk`, bulkRoute)

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
    await fulfillJson(route, options.responsables ?? [
      { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
    ])
  })

  await page.route('**/api/clientes**', async (route) => {
    await fulfillJson(route, [])
  })

  await page.route('**/api/productos**', async (route) => {
    await fulfillJson(route, options.productos ?? [])
  })

  await page.route('**/api/service-templates**', async (route) => {
    await fulfillJson(route, options.templates ?? [])
  })

  return Object.assign(cotizacion, { get __getsDeCotizacion() { return getsDeCotizacion } })
}
