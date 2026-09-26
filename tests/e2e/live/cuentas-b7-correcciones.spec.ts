import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Rediseño de Cuentas B7 (D5, R8): pruebas reales contra serenata-erp-test de
 * las correcciones, llamando las RPCs directo con supabase-js (mismo patrón
 * que cuentas-b1b.spec.ts).
 *
 * - Sin reapertura activa ninguna corrección procede (P1416).
 * - Anular un pago mientras otro se registra a la vez deja el saldo igual a
 *   la suma de los pagos vigentes, en cobro y en grupo de proveedor (los dos
 *   toman el mismo candado del concepto).
 * - En un grupo, anular re-prorratea los renglones y el estado; anular dos
 *   veces es idempotente y todo queda en cuentas_correcciones.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>
const USUARIO = 'live-b7@serenata.test'

function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  return result.data as NonNullable<T>
}
function ok(result: { error: unknown }) {
  if (result.error) throw result.error
}

interface Fixture {
  id: string
  proveedorId: string
  cobroId: string
  grupoId: string
}

/** Proyecto con un cobro de 1,000 y un grupo facturado de dos renglones (600 + 400 neto, total 1,160). */
async function crearFixture(supabase: Supabase): Promise<Fixture> {
  const id = `LB7${randomUUID().slice(0, 6).toUpperCase()}`
  const proveedorId = randomUUID()
  const grupoId = randomUUID()
  ok(await supabase.from('proveedores').insert({ id: proveedorId, nombre: `${id} Proveedor`, activo: true }))
  ok(await supabase.from('cotizaciones').insert({ id, cliente: `${id} Cliente`, proyecto: `${id} Proyecto`, fecha_entrega: '2026-09-10', tipo: 'PRINCIPAL', estado: 'APROBADA' }))
  ok(await supabase.from('proyectos').insert({ id, cliente: `${id} Cliente`, proyecto: `${id} Proyecto` }))
  const cobro = must(
    await supabase
      .from('cuentas_cobrar')
      .insert({ cotizacion_id: id, proyecto_id: id, cliente: `${id} Cliente`, proyecto: `${id} Proyecto`, monto_total: 1000 })
      .select('id')
      .single()
  )
  ok(await supabase.from('cuentas_pagar_grupos').insert({ id: grupoId, proyecto_id: id, responsable_id: proveedorId, estado: 'FACTURADO', monto_total: 1000, total_a_transferir: 1160 }))
  for (const x of [600, 400]) {
    ok(await supabase.from('cuentas_pagar').insert({
      cotizacion_id: id,
      proyecto_id: id,
      responsable_id: proveedorId,
      responsable_nombre: `${id} Proveedor`,
      item_descripcion: `Renglón ${x}`,
      x_pagar: x,
      grupo_id: grupoId,
    }))
  }
  ok(await supabase.from('documentos_cuentas_pagar').insert({
    grupo_id: grupoId,
    tipo: 'FACTURA_PROVEEDOR_XML',
    archivo_url: 'https://example.com/live-b7.xml',
    archivo_nombre: 'live-b7.xml',
    estado_validacion: 'validado',
    total_cfdi: 1160,
  }))
  return { id, proveedorId, cobroId: cobro.id as string, grupoId }
}

async function limpiar(supabase: Supabase, fx: Fixture) {
  await supabase.from('cuentas_reaperturas').delete().eq('proyecto_id', fx.id)
  await supabase.from('cuentas_correcciones').delete().eq('proyecto_id', fx.id)
  await supabase.from('pagos_cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('documentos_cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('cuentas_pagar_grupos').delete().eq('id', fx.grupoId)
  await supabase.from('pagos_comprobantes').delete().eq('cuentas_cobrar_id', fx.cobroId)
  await supabase.from('cuentas_cobrar').delete().eq('id', fx.cobroId)
  await supabase.from('proyectos').delete().eq('id', fx.id)
  await supabase.from('cotizaciones').delete().eq('id', fx.id)
  await supabase.from('proveedores').delete().eq('id', fx.proveedorId)
}

const pagarCobro = (supabase: Supabase, fx: Fixture, monto: number) =>
  supabase.rpc('registrar_pago_cuenta_cobrar', { p_cuenta_id: fx.cobroId, p_monto: monto, p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-12' })
const pagarGrupo = (supabase: Supabase, fx: Fixture, monto: number) =>
  supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: fx.grupoId, p_monto: monto, p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-12', p_usuario: USUARIO })

test.describe('live: B7 reabrir y anular pagos', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('sin reapertura no se anula; reabrir es idempotente', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await crearFixture(supabase)
    try {
      ok(await pagarCobro(supabase, fx, 300))
      const pago = must(await supabase.from('pagos_comprobantes').select('id').eq('cuentas_cobrar_id', fx.cobroId).single())

      const sin = await supabase.rpc('anular_pago_cobro', { p_pago_id: pago.id, p_motivo: 'duplicado', p_usuario: USUARIO })
      expect(sin.error?.code).toBe('P1416')

      const r1 = must(await supabase.rpc('reabrir_cuentas_proyecto', { p_proyecto_id: fx.id, p_motivo: 'prueba live', p_usuario: USUARIO }))
      const r2 = must(await supabase.rpc('reabrir_cuentas_proyecto', { p_proyecto_id: fx.id, p_motivo: 'otra vez', p_usuario: USUARIO }))
      expect(r2).toMatchObject({ reapertura_id: (r1 as { reapertura_id: string }).reapertura_id, ya_reabierta: true })

      ok(await supabase.rpc('cerrar_cuentas_proyecto', { p_proyecto_id: fx.id, p_usuario: USUARIO }))
      const otra = await supabase.rpc('anular_pago_cobro', { p_pago_id: pago.id, p_motivo: 'duplicado', p_usuario: USUARIO })
      expect(otra.error?.code).toBe('P1416')
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('cobro: anular mientras se registra otro pago deja el saldo en la suma de los vigentes', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await crearFixture(supabase)
    try {
      ok(await pagarCobro(supabase, fx, 600))
      const p1 = must(await supabase.from('pagos_comprobantes').select('id').eq('cuentas_cobrar_id', fx.cobroId).single())
      ok(await supabase.rpc('reabrir_cuentas_proyecto', { p_proyecto_id: fx.id, p_motivo: 'pago duplicado', p_usuario: USUARIO }))

      // 600 + 400 = 1000 cabe en cualquier orden: con o sin p1 anulado.
      const [anulado, nuevo] = await Promise.all([
        supabase.rpc('anular_pago_cobro', { p_pago_id: p1.id, p_motivo: 'pago duplicado', p_usuario: USUARIO }),
        pagarCobro(supabase, fx, 400),
      ])
      expect(anulado.error).toBeNull()
      expect(nuevo.error).toBeNull()

      const cuenta = must(await supabase.from('cuentas_cobrar').select('monto_pagado, estado').eq('id', fx.cobroId).single())
      expect(Number(cuenta.monto_pagado)).toBe(400)
      expect(cuenta.estado).not.toBe('PAGADO')

      const otra = must(await supabase.rpc('anular_pago_cobro', { p_pago_id: p1.id, p_motivo: 'pago duplicado', p_usuario: USUARIO }))
      expect(otra).toMatchObject({ ya_anulado: true })

      // R8: el saldo libre vuelve a aceptar pagos hasta el total.
      ok(await pagarCobro(supabase, fx, 600))
      const final = must(await supabase.from('cuentas_cobrar').select('monto_pagado, estado').eq('id', fx.cobroId).single())
      expect(Number(final.monto_pagado)).toBe(1000)
      expect(final.estado).toBe('PAGADO')

      const log = must(await supabase.from('cuentas_correcciones').select('tipo, motivo, usuario').eq('proyecto_id', fx.id))
      expect(log).toEqual([{ tipo: 'anular_pago', motivo: 'pago duplicado', usuario: USUARIO }])
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('grupo: anular re-prorratea los renglones, también con un pago simultáneo', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await crearFixture(supabase)
    try {
      ok(await pagarGrupo(supabase, fx, 580))
      ok(await pagarGrupo(supabase, fx, 580))
      const pagado = must(await supabase.from('cuentas_pagar_grupos').select('estado, monto_transferido, monto_pagado').eq('id', fx.grupoId).single())
      expect(pagado).toMatchObject({ estado: 'PAGADO' })
      expect(Number(pagado.monto_transferido)).toBe(1160)

      ok(await supabase.rpc('reabrir_cuentas_proyecto', { p_proyecto_id: fx.id, p_motivo: 'transferencia rebotada', p_usuario: USUARIO }))
      const pagos = must(await supabase.from('pagos_cuentas_pagar').select('id').eq('grupo_id', fx.grupoId).order('created_at'))
      ok(await supabase.rpc('anular_pago_proveedor', { p_pago_id: pagos[0].id, p_motivo: 'transferencia rebotada', p_usuario: USUARIO }))

      const parcial = must(await supabase.from('cuentas_pagar_grupos').select('estado, monto_transferido, monto_pagado').eq('id', fx.grupoId).single())
      expect(parcial.estado).toBe('EN_PROCESO_PAGO')
      expect(Number(parcial.monto_transferido)).toBe(580)
      expect(Number(parcial.monto_pagado)).toBe(500)
      const renglones = must(await supabase.from('cuentas_pagar').select('x_pagar, monto_pagado, estado').eq('grupo_id', fx.grupoId))
      expect(renglones.reduce((s, r) => s + Number(r.monto_pagado), 0)).toBeCloseTo(500, 2)
      for (const r of renglones) {
        expect(Number(r.monto_pagado)).toBeCloseTo(Number(r.x_pagar) / 2, 2)
        expect(r.estado).toBe('EN_PROCESO_PAGO')
      }

      // Anular el segundo mientras se registra el reemplazo: queda solo el nuevo.
      const [anulado, nuevo] = await Promise.all([
        supabase.rpc('anular_pago_proveedor', { p_pago_id: pagos[1].id, p_motivo: 'monto equivocado', p_usuario: USUARIO }),
        pagarGrupo(supabase, fx, 580),
      ])
      expect(anulado.error).toBeNull()
      expect(nuevo.error).toBeNull()
      const final = must(await supabase.from('cuentas_pagar_grupos').select('estado, monto_transferido').eq('id', fx.grupoId).single())
      const vigentes = must(await supabase.from('pagos_cuentas_pagar').select('monto_transferido').eq('grupo_id', fx.grupoId).is('anulado_at', null))
      expect(vigentes).toHaveLength(1)
      expect(Number(final.monto_transferido)).toBe(580)
      expect(final.estado).toBe('EN_PROCESO_PAGO')

      const log = must(await supabase.from('cuentas_correcciones').select('tipo').eq('proyecto_id', fx.id))
      expect(log).toHaveLength(2)
    } finally {
      await limpiar(supabase, fx)
    }
  })
})
