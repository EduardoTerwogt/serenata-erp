import { Page, Route } from '@playwright/test'

export const E2E_IDS = {
  cobrarId: 'cc-1',
  pagarId: 'cp-1',
  pdfPath: '/downloads/orden_pago_e2e.pdf',
}

function buildFakePdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF', 'utf-8')
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })
}

export async function mockCuentasApis(page: Page) {
  const cobrarCuenta = {
    id: E2E_IDS.cobrarId,
    cotizacion_id: 'SH054',
    folio: 'CC-2026-00015',
    cliente: 'Walmart México',
    proyecto: 'Show Monterrey',
    monto_total: 9500,
    monto_pagado: 4750,
    estado: 'PARCIALMENTE_PAGADO',
    fecha_factura: '2026-04-09',
    fecha_vencimiento: '2026-05-09',
    fecha_pago: null as string | null,
    notas: null,
  }

  const pagarCuenta = {
    id: E2E_IDS.pagarId,
    cotizacion_id: 'SH054',
    folio: 'CP-2026-00008',
    proyecto_id: 'SH054',
    proyecto_nombre: 'Show Monterrey',
    item_id: 'item-1',
    responsable_id: 'resp-1',
    responsable_nombre: 'José García',
    item_descripcion: 'Backline',
    cantidad: 1,
    x_pagar: 7500,
    monto_pagado: 0,
    margen: 0,
    estado: 'PENDIENTE',
    correo: 'jose@serenata.test',
    telefono: '5555555555',
    banco: 'BBVA',
    clabe: '012345678901234567',
    fecha_pago: null as string | null,
    metodo_pago: null,
    notas: null,
    orden_pago_id: null as string | null,
  }

  const cuentasCobrar = [cobrarCuenta]
  const cuentasPagar = [pagarCuenta]

  const cobrarDocumentos = [
    {
      id: 'dcc-1',
      cuentas_cobrar_id: E2E_IDS.cobrarId,
      tipo: 'FACTURA_PDF',
      archivo_url: 'https://example.com/factura.pdf',
      archivo_nombre: 'factura.pdf',
      fecha_carga: '2026-04-09',
      created_at: '2026-04-09',
    },
  ]

  const cobrarPagos = [
    {
      id: 'pc-1',
      cuentas_cobrar_id: E2E_IDS.cobrarId,
      monto: 4750,
      tipo_pago: 'TRANSFERENCIA',
      fecha_pago: '2026-04-15',
      comprobante_url: 'https://example.com/comprobante_inicial.pdf',
      archivo_nombre: 'comprobante_inicial.pdf',
      notas: 'Pago parcial inicial',
    },
  ]

  const pagarDocumentos = [
    {
      id: 'dcp-1',
      cuentas_pagar_id: E2E_IDS.pagarId,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: 'https://example.com/factura_proveedor.pdf',
      archivo_nombre: 'factura_proveedor.pdf',
      fecha_carga: '2026-04-08',
      created_at: '2026-04-08',
    },
  ]

  const ordenesHistorial: Array<{
    id: string
    fecha_generacion: string
    pdf_url: string
    pdf_nombre: string
    estado: 'GENERADA' | 'PARCIALMENTE_PAGADA' | 'COMPLETADA'
    total_monto: number
    created_by?: string
    created_at?: string
  }> = []

  await page.route(`**${E2E_IDS.pdfPath}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="orden_pago_e2e.pdf"',
      },
      body: buildFakePdfBuffer(),
    })
  })

  await page.route('**/api/cuentas-cobrar/alertas', async (route) => {
    const saldoPendiente = cobrarCuenta.monto_total - cobrarCuenta.monto_pagado
    const alertas = saldoPendiente > 0
      ? [{
          id: cobrarCuenta.id,
          folio: cobrarCuenta.folio,
          cliente: cobrarCuenta.cliente,
          proyecto: cobrarCuenta.proyecto,
          monto_total: cobrarCuenta.monto_total,
          monto_pagado: cobrarCuenta.monto_pagado,
          saldo_pendiente: saldoPendiente,
          fecha_vencimiento: cobrarCuenta.fecha_vencimiento,
          dias_faltantes: 1,
          estado: cobrarCuenta.estado,
          alerta: 'POR_VENCER',
          mensaje: 'Vence en 1 día(s)',
        }]
      : []

    await fulfillJson(route, {
      total_alertas: alertas.length,
      vencidas: 0,
      por_vencer: alertas.length,
      alertas,
    })
  })

  await page.route(`**/api/cuentas-cobrar/${E2E_IDS.cobrarId}/documentos`, async (route) => {
    await fulfillJson(route, {
      cuenta: cobrarCuenta,
      documentos: cobrarDocumentos,
      pagos: cobrarPagos,
      resumen: {
        total_pagado: cobrarCuenta.monto_pagado,
        saldo_pendiente: cobrarCuenta.monto_total - cobrarCuenta.monto_pagado,
      },
    })
  })

  await page.route(`**/api/cuentas-cobrar/${E2E_IDS.cobrarId}/subir-factura`, async (route) => {
    cobrarDocumentos.unshift(
      {
        id: `dcc-${Date.now()}-xml`,
        cuentas_cobrar_id: E2E_IDS.cobrarId,
        tipo: 'FACTURA_XML',
        archivo_url: 'https://example.com/factura.xml',
        archivo_nombre: 'factura.xml',
        fecha_carga: '2026-04-18',
        created_at: '2026-04-18',
      },
      {
        id: `dcc-${Date.now()}-pdf`,
        cuentas_cobrar_id: E2E_IDS.cobrarId,
        tipo: 'FACTURA_PDF',
        archivo_url: 'https://example.com/factura-e2e.pdf',
        archivo_nombre: 'factura-e2e.pdf',
        fecha_carga: '2026-04-18',
        created_at: '2026-04-18',
      }
    )

    await fulfillJson(route, {
      success: true,
      cuenta: cobrarCuenta,
      documentos_creados: 2,
    })
  })

  await page.route(`**/api/cuentas-cobrar/${E2E_IDS.cobrarId}/subir-complemento`, async (route) => {
    cobrarDocumentos.unshift({
      id: `dcc-${Date.now()}-complemento`,
      cuentas_cobrar_id: E2E_IDS.cobrarId,
      tipo: 'COMPLEMENTO_PAGO',
      archivo_url: 'https://example.com/complemento.xml',
      archivo_nombre: 'complemento.xml',
      fecha_carga: '2026-04-18',
      created_at: '2026-04-18',
    })

    await fulfillJson(route, {
      success: true,
      parsed: {
        uuid: 'ABC-123',
        fecha_pago: '2026-04-18',
        monto_total_pagos: 4750,
        moneda: 'MXN',
      },
    })
  })

  await page.route(`**/api/cuentas-cobrar/${E2E_IDS.cobrarId}/registrar-pago`, async (route) => {
    cobrarCuenta.monto_pagado = cobrarCuenta.monto_total
    cobrarCuenta.estado = 'PAGADO'
    cobrarCuenta.fecha_pago = '2026-04-18'

    cobrarPagos.unshift({
      id: `pc-${Date.now()}`,
      cuentas_cobrar_id: E2E_IDS.cobrarId,
      monto: 4750,
      tipo_pago: 'TRANSFERENCIA',
      fecha_pago: '2026-04-18',
      comprobante_url: 'https://example.com/comprobante_final.pdf',
      archivo_nombre: 'comprobante_final.pdf',
      notas: 'Pago final E2E',
    })

    await fulfillJson(route, {
      success: true,
      cuenta: cobrarCuenta,
      resumen: {
        monto_pagado_total: cobrarCuenta.monto_pagado,
        monto_pendiente: 0,
        estado_nuevo: cobrarCuenta.estado,
      },
    })
  })

  await page.route(`**/api/cuentas-pagar/${E2E_IDS.pagarId}/documentos`, async (route) => {
    const orden = ordenesHistorial[0]
    await fulfillJson(route, {
      cuenta: pagarCuenta,
      documentos: pagarDocumentos,
      orden_pago: orden
        ? {
            id: orden.id,
            fecha_generacion: orden.fecha_generacion,
            pdf_url: orden.pdf_url,
            pdf_nombre: orden.pdf_nombre,
            estado: orden.estado,
            total_monto: orden.total_monto,
          }
        : null,
      resumen: {
        monto_pagado: pagarCuenta.monto_pagado,
        saldo_pendiente: pagarCuenta.x_pagar - pagarCuenta.monto_pagado,
      },
    })
  })

  await page.route(`**/api/cuentas-pagar/${E2E_IDS.pagarId}/subir-factura`, async (route) => {
    pagarDocumentos.unshift({
      id: `dcp-${Date.now()}`,
      cuentas_pagar_id: E2E_IDS.pagarId,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: 'https://example.com/factura_proveedor_e2e.pdf',
      archivo_nombre: 'factura_proveedor_e2e.pdf',
      fecha_carga: '2026-04-18',
      created_at: '2026-04-18',
    })

    await fulfillJson(route, { success: true })
  })

  await page.route(`**/api/cuentas-pagar/${E2E_IDS.pagarId}/registrar-pago`, async (route) => {
    pagarCuenta.monto_pagado = pagarCuenta.x_pagar
    pagarCuenta.estado = 'PAGADO'
    pagarCuenta.fecha_pago = '2026-04-18'

    if (ordenesHistorial[0]) {
      ordenesHistorial[0].estado = 'COMPLETADA'
    }

    await fulfillJson(route, {
      success: true,
      cuenta: pagarCuenta,
      orden_pago: ordenesHistorial[0] || null,
      resumen: {
        monto_pagado_total: pagarCuenta.monto_pagado,
        saldo_pendiente: 0,
        estado_nuevo: pagarCuenta.estado,
      },
    })
  })

  await page.route('**/api/cuentas-pagar/generar-orden-pago', async (route) => {
    if (route.request().method() === 'GET') {
      const previewResponsable = {
        responsable: {
          id: 'resp-1',
          nombre: 'José García',
          correo: pagarCuenta.correo,
          telefono: pagarCuenta.telefono,
          banco: pagarCuenta.banco,
          clabe: pagarCuenta.clabe,
        },
        eventos: [
          {
            cotizacion_folio: pagarCuenta.cotizacion_id,
            proyecto: pagarCuenta.proyecto_nombre,
            items: [
              {
                descripcion: pagarCuenta.item_descripcion,
                cantidad: pagarCuenta.cantidad,
                monto: pagarCuenta.x_pagar,
                cuenta_id: pagarCuenta.id,
              },
            ],
            subtotal: pagarCuenta.x_pagar,
          },
        ],
        total_responsable: pagarCuenta.x_pagar,
      }

      await fulfillJson(route, {
        responsables: pagarCuenta.estado === 'PAGADO' ? [] : [previewResponsable],
        resumen: {
          responsables: pagarCuenta.estado === 'PAGADO' ? 0 : 1,
          eventos: pagarCuenta.estado === 'PAGADO' ? 0 : 1,
          items_totales: pagarCuenta.estado === 'PAGADO' ? 0 : 1,
          total_general: pagarCuenta.estado === 'PAGADO' ? 0 : pagarCuenta.x_pagar,
        },
        cuentas_ids: pagarCuenta.estado === 'PAGADO' ? [] : [pagarCuenta.id],
      })
      return
    }

    pagarCuenta.estado = 'EN_PROCESO_PAGO'
    pagarCuenta.orden_pago_id = 'op-1'
    ordenesHistorial.unshift({
      id: 'op-1',
      fecha_generacion: '2026-04-18',
      pdf_url: E2E_IDS.pdfPath,
      pdf_nombre: 'Orden_Pago_2026_04_18.pdf',
      estado: 'GENERADA',
      total_monto: pagarCuenta.x_pagar,
      created_by: 'e2e@serenata.test',
      created_at: '2026-04-18T12:00:00Z',
    })

    await fulfillJson(route, {
      success: true,
      orden_pago: {
        id: 'op-1',
        fecha_generacion: '2026-04-18',
        pdf_url: E2E_IDS.pdfPath,
        pdf_nombre: 'Orden_Pago_2026_04_18.pdf',
        total_monto: pagarCuenta.x_pagar,
        cantidad_cuentas: 1,
      },
      resumen: {
        responsables: 1,
        eventos: 1,
        items_totales: 1,
        total_general: pagarCuenta.x_pagar,
      },
    })
  })

  await page.route('**/api/cuentas-pagar/ordenes-historial', async (route) => {
    await fulfillJson(route, {
      total: ordenesHistorial.length,
      ordenes: ordenesHistorial,
    })
  })

  await page.route('**/api/cuentas-cobrar', async (route) => {
    await fulfillJson(route, cuentasCobrar)
  })

  await page.route('**/api/cuentas-pagar', async (route) => {
    await fulfillJson(route, cuentasPagar)
  })
}
