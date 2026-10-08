import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Concurrencia real contra serenata-erp-test para las RPC de cobro de #123: `registrar_pago_cobro` (una cabecera
 * `pagos` con N líneas, T3/T16), `ligar_factura` (una cuenta en una sola factura vigente, T9) y la idempotencia de
 * `pagos.operation_id` (T2). No pasa por el navegador ni por la ruta HTTP: llama la RPC directo con supabase-js para
 * poder disparar requests realmente simultáneos con Promise.all.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

type Admin = ReturnType<typeof getLiveSupabaseAdmin>

async function crearCuenta(supabase: Admin, montoTotal: number) {
  const { data, error } = await supabase.from('cuentas_cobrar').insert({ monto_total: montoTotal }).select().single()
  if (error) throw error
  return data.id as string
}

/** Borra todo lo que un test dejó: líneas, cabeceras, facturas y cuentas (el orden respeta las llaves). */
async function limpiar(supabase: Admin, cuentaIds: string[]) {
  const { data: lineas } = await supabase.from('pagos_comprobantes').select('pago_id').in('cuentas_cobrar_id', cuentaIds)
  const pagoIds = Array.from(new Set((lineas ?? []).map((l) => l.pago_id as string)))
  const { data: cuentas } = await supabase.from('cuentas_cobrar').select('factura_documento_id').in('id', cuentaIds)
  const facturaIds = Array.from(new Set((cuentas ?? []).map((c) => c.factura_documento_id as string | null).filter((f): f is string => !!f)))

  if (facturaIds.length) await supabase.from('documentos_cuentas_cobrar').delete().in('factura_documento_id', facturaIds)
  await supabase.from('pagos_comprobantes').delete().in('cuentas_cobrar_id', cuentaIds)
  await supabase.from('cuentas_cobrar').update({ factura_documento_id: null }).in('id', cuentaIds)
  if (facturaIds.length) await supabase.from('documentos_cuentas_cobrar').delete().in('id', facturaIds)
  await supabase.from('cuentas_cobrar').delete().in('id', cuentaIds)
  if (pagoIds.length) await supabase.from('pagos').delete().in('id', pagoIds)
}

const lineas = (...items: [string, number][]) => items.map(([cuenta_id, monto]) => ({ cuenta_id, monto }))
const pagar = (supabase: Admin, items: [string, number][], operationId?: string) =>
  supabase.rpc('registrar_pago_cobro', {
    p_lineas: lineas(...items),
    p_tipo_pago: 'TRANSFERENCIA',
    p_fecha_pago: '2026-09-05',
    p_operation_id: operationId ?? null,
  })

const facturar = (supabase: Admin, cuentaId: string, total: number, uuid: string) =>
  supabase.rpc('ligar_factura', {
    p_cuentas: [{ cuenta_id: cuentaId }],
    p_xml: { archivo_url: 'https://drive.test/f.xml', archivo_nombre: 'f.xml', uuid_cfdi: uuid, total_cfdi: total, metodo_pago_cfdi: 'PUE' },
    p_pdf: null,
    p_fecha_emision: '2026-09-01',
    p_fecha_vencimiento: '2026-10-01',
    p_usuario: 'live',
    p_operation_id: randomUUID(),
  })

test.describe('live: concurrencia en las RPC de cobro (#123)', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('dos pagos simultáneos que juntos completan el total no pierden ninguno', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuenta(supabase, 1000)
    try {
      const [r1, r2] = await Promise.all([pagar(supabase, [[cuentaId, 500]]), pagar(supabase, [[cuentaId, 500]])])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: cuenta, error } = await supabase.from('cuentas_cobrar').select('monto_pagado, estado').eq('id', cuentaId).single()
      if (error) throw error
      expect(Number(cuenta.monto_pagado)).toBe(1000)
      expect(cuenta.estado).toBe('PAGADO')

      const { data: pagos } = await supabase.from('pagos_comprobantes').select('id').eq('cuentas_cobrar_id', cuentaId)
      expect(pagos).toHaveLength(2)
    } finally {
      await limpiar(supabase, [cuentaId])
    }
  })

  test('dos pagos simultáneos que juntos exceden el total: exactamente uno se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuenta(supabase, 1000)
    try {
      const resultados = await Promise.all([pagar(supabase, [[cuentaId, 700]]), pagar(supabase, [[cuentaId, 700]])])
      const fallidos = resultados.filter((r) => r.error)
      expect(resultados.filter((r) => !r.error)).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/excede el total/i)

      const { data: cuenta } = await supabase.from('cuentas_cobrar').select('monto_pagado').eq('id', cuentaId).single()
      expect(Number(cuenta?.monto_pagado)).toBe(700)
    } finally {
      await limpiar(supabase, [cuentaId])
    }
  })

  test('doble clic: el mismo operation_id registra un solo pago y el reintento devuelve el mismo', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuenta(supabase, 1000)
    const operationId = randomUUID()
    try {
      const [r1, r2] = await Promise.all([pagar(supabase, [[cuentaId, 400]], operationId), pagar(supabase, [[cuentaId, 400]], operationId)])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()
      expect((r1.data as { pago_id: string }).pago_id).toBe((r2.data as { pago_id: string }).pago_id)

      const { data: lineasPago } = await supabase.from('pagos_comprobantes').select('id').eq('cuentas_cobrar_id', cuentaId)
      expect(lineasPago).toHaveLength(1)
      const { data: cuenta } = await supabase.from('cuentas_cobrar').select('monto_pagado').eq('id', cuentaId).single()
      expect(Number(cuenta?.monto_pagado)).toBe(400)
    } finally {
      await limpiar(supabase, [cuentaId])
    }
  })

  test('un pago a dos cuentas es atómico: si una línea excede el saldo no se aplica ninguna', async () => {
    const supabase = getLiveSupabaseAdmin()
    const a = await crearCuenta(supabase, 1000)
    const b = await crearCuenta(supabase, 200)
    try {
      const malo = await pagar(supabase, [[a, 500], [b, 300]])
      expect(malo.error?.message ?? '').toMatch(/excede el total/i)
      const { data: ninguno } = await supabase.from('pagos_comprobantes').select('id').in('cuentas_cobrar_id', [a, b])
      expect(ninguno).toHaveLength(0)

      const bueno = await pagar(supabase, [[a, 500], [b, 200]])
      expect(bueno.error).toBeNull()
      const { data: cuentas } = await supabase.from('cuentas_cobrar').select('id, monto_pagado, estado').in('id', [a, b])
      const porId = Object.fromEntries((cuentas ?? []).map((c) => [c.id as string, c]))
      expect(Number(porId[a].monto_pagado)).toBe(500)
      expect(Number(porId[b].monto_pagado)).toBe(200)
      expect(porId[b].estado).toBe('PAGADO')

      // Una sola cabecera para las dos líneas.
      const { data: l } = await supabase.from('pagos_comprobantes').select('pago_id').in('cuentas_cobrar_id', [a, b])
      expect(new Set((l ?? []).map((x) => x.pago_id)).size).toBe(1)
    } finally {
      await limpiar(supabase, [a, b])
    }
  })

  test('pagos cruzados en orden inverso sobre las mismas dos cuentas no se bloquean entre sí (T16)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const a = await crearCuenta(supabase, 1000)
    const b = await crearCuenta(supabase, 1000)
    try {
      const [r1, r2] = await Promise.all([pagar(supabase, [[a, 100], [b, 100]]), pagar(supabase, [[b, 100], [a, 100]])])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()
      const { data: cuentas } = await supabase.from('cuentas_cobrar').select('monto_pagado').in('id', [a, b])
      expect((cuentas ?? []).map((c) => Number(c.monto_pagado))).toEqual([200, 200])
    } finally {
      await limpiar(supabase, [a, b])
    }
  })

  test('la misma cuenta en dos facturas simultáneas: solo una la liga', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuenta(supabase, 1000)
    try {
      const resultados = await Promise.all([
        facturar(supabase, cuentaId, 1000, `LIVE-${randomUUID()}`),
        facturar(supabase, cuentaId, 1000, `LIVE-${randomUUID()}`),
      ])
      const fallidos = resultados.filter((r) => r.error)
      expect(resultados.filter((r) => !r.error)).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/cuenta_ya_ligada/)

      const { data: facturas } = await supabase.from('cuentas_cobrar').select('factura_documento_id').eq('id', cuentaId).single()
      expect(facturas?.factura_documento_id).toBeTruthy()
    } finally {
      await limpiar(supabase, [cuentaId])
    }
  })

  test('pagar una cuenta mientras se factura: ambas operaciones terminan y las guardas quedan en cero', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuenta(supabase, 1000)
    try {
      const [pago, factura] = await Promise.all([
        pagar(supabase, [[cuentaId, 1000]]),
        facturar(supabase, cuentaId, 1000, `LIVE-${randomUUID()}`),
      ])
      expect(pago.error).toBeNull()
      expect(factura.error).toBeNull()
      const { data: cuenta } = await supabase.from('cuentas_cobrar').select('monto_pagado, estado, factura_documento_id, fecha_factura').eq('id', cuentaId).single()
      expect(Number(cuenta?.monto_pagado)).toBe(1000)
      expect(cuenta?.factura_documento_id).toBeTruthy()
      expect(cuenta?.fecha_factura).toBeTruthy()
    } finally {
      await limpiar(supabase, [cuentaId])
    }
  })
})
