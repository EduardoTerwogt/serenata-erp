import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { getLiveSupabaseAdmin, insertarCuentaPagarConRenglon, aprobarFixture } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'

/**
 * #110 B2 (decisión 025): un proyecto histórico es de solo consulta. Contra serenata-erp-test:
 * - cada escritura de Cuentas sobre él (tablas guardadas y RPC) se rechaza; las tablas con `P1420` (`proyecto_historico`);
 * - `cuentas_periodo` trae la bandera `historico` (tarjeta y proyecto seleccionado);
 * - `archivar_cuentas_historicas` en seco responde con su contrato y NO archiva un proyecto con cambios de hoy (corte de 190 días).
 * Nunca corre el archivado real: lo haría sobre todo el dataset compartido. El fixture se marca a mano y se desmarca al limpiar.
 */

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>
const USUARIO = 'live-historico@serenata.test'
const ok = (r: { error: unknown }) => {
  if (r.error) throw r.error
}
const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
  if (r.error) throw r.error
  return r.data as NonNullable<T>
}

interface Fixture { id: string; proveedorId: string; cobroId: string; grupoId: string; cuentaId: string }

async function crearFixture(supabase: Supabase): Promise<Fixture> {
  const id = `LHI${randomUUID().slice(0, 6).toUpperCase()}`
  const proveedorId = randomUUID()
  const grupoId = randomUUID()
  ok(await supabase.from('proveedores').insert({ id: proveedorId, nombre: `${id} Proveedor`, activo: true }))
  ok(await supabase.from('cotizaciones').insert({ id, cliente: `${id} Cliente`, proyecto: `${id} Proyecto`, fecha_entrega: '2026-09-10', tipo: 'PRINCIPAL', estado: 'EMITIDA' }))
  ok(await supabase.from('proyectos').insert({ id, proyecto: `${id} Proyecto`, fecha_entrega: '2026-09-10' }))
  const cobro = must(await supabase.from('cuentas_cobrar').insert({ cotizacion_id: id, proyecto_id: id, monto_total: 1000 }).select('id').single())
  ok(await supabase.from('cuentas_pagar_grupos').insert({ id: grupoId, proyecto_id: id, responsable_id: proveedorId, estado: 'FACTURADO', monto_total: 600, total_a_transferir: 696 }))
  const cuenta = await insertarCuentaPagarConRenglon(supabase, { cotizacionId: id, proyectoId: id, responsableId: proveedorId, grupoId, xPagar: 600, descripcion: 'Renglón' })
  await aprobarFixture(supabase, id)
  // Pagar a un proveedor exige factura XML validada (D25); el total a transferir es el neto × 1.16 (persona moral).
  ok(await supabase.from('cuentas_pagar_grupos').update({ monto_total: 600, total_a_transferir: 696 }).eq('id', grupoId))
  ok(await supabase.from('documentos_cuentas_pagar').insert({
    grupo_id: grupoId, tipo: 'FACTURA_PROVEEDOR_XML', archivo_url: 'https://example.com/live.xml', archivo_nombre: 'live.xml',
    estado_validacion: 'validado', total_cfdi: 696,
  }))
  return { id, proveedorId, cobroId: cobro.id as string, grupoId, cuentaId: (cuenta as { id: string }).id }
}

async function limpiar(supabase: Supabase, fx: Fixture) {
  // Un histórico no admite DELETE: se desmarca primero.
  await supabase.from('proyectos').update({ cuentas_historico_at: null }).eq('id', fx.id)
  const { data: lc } = await supabase.from('pagos_comprobantes').select('pago_id').eq('cuentas_cobrar_id', fx.cobroId)
  const { data: lp } = await supabase.from('pagos_cuentas_pagar').select('pago_id').eq('grupo_id', fx.grupoId)
  const pagoIds = Array.from(new Set([...(lc ?? []), ...(lp ?? [])].map((l) => l.pago_id as string)))
  await supabase.from('cuentas_reaperturas').delete().eq('proyecto_id', fx.id)
  await supabase.from('cuentas_correcciones').delete().eq('proyecto_id', fx.id)
  await supabase.from('pagos_cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('documentos_cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('cuentas_pagar').delete().eq('grupo_id', fx.grupoId)
  await supabase.from('cuentas_pagar_grupos').delete().eq('id', fx.grupoId)
  await supabase.from('pagos_comprobantes').delete().eq('cuentas_cobrar_id', fx.cobroId)
  await supabase.from('cuentas_cobrar').delete().eq('id', fx.cobroId)
  for (const pagoId of pagoIds) await supabase.from('pagos').delete().eq('id', pagoId)
  await supabase.from('proyectos').delete().eq('id', fx.id)
  await supabase.from('cotizaciones').delete().eq('id', fx.id)
  await supabase.from('proveedores').delete().eq('id', fx.proveedorId)
}

test.describe('live: proyecto histórico de Cuentas (#110 B2)', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')
  test.setTimeout(120_000)

  test('un histórico rechaza toda escritura de Cuentas y trae la bandera en cuentas_periodo', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await crearFixture(supabase)
    try {
      // Antes de marcarlo: un pago de cobro y uno de proveedor para tener qué anular.
      const pagoC = must(await supabase.rpc('registrar_pago_cobro', { p_lineas: [{ cuenta_id: fx.cobroId, monto: 100 }], p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-12', p_usuario: USUARIO })) as { pago_id: string }
      const pagoP = must(await supabase.rpc('registrar_pago_proveedor', { p_lineas: [{ grupo_id: fx.grupoId, monto: 100 }], p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-12', p_usuario: USUARIO })) as { pago_id: string }

      ok(await supabase.from('proyectos').update({ cuentas_historico_at: new Date().toISOString() }).eq('id', fx.id))

      // Tablas guardadas: siempre `proyecto_historico`.
      const directas = await Promise.all([
        supabase.from('cuentas_cobrar').update({ notas: 'x' }).eq('id', fx.cobroId),
        supabase.from('cuentas_pagar').update({ notas: 'x' }).eq('id', fx.cuentaId),
        supabase.from('cuentas_pagar_grupos').update({ updated_at: new Date().toISOString() }).eq('id', fx.grupoId),
        supabase.from('documentos_cuentas_cobrar').insert({ cuentas_cobrar_id: fx.cobroId, tipo: 'OTRO', archivo_url: 'https://example.com/x', archivo_nombre: 'x' }),
        supabase.from('documentos_cuentas_pagar').insert({ grupo_id: fx.grupoId, tipo: 'OTRO', archivo_url: 'https://example.com/x', archivo_nombre: 'x' }),
        supabase.from('cuentas_reaperturas').insert({ proyecto_id: fx.id, motivo: 'm', abierta_por: USUARIO }),
        supabase.from('pagos').update({ notas: 'x' }).eq('id', pagoP.pago_id),
      ])
      for (const r of directas) expect(r.error?.code).toBe('P1420')

      // RPC: ninguna escritura prospera (la guarda, o una regla previa como "no está reabierto").
      const rpcs = await Promise.all([
        supabase.rpc('registrar_pago_cobro', { p_lineas: [{ cuenta_id: fx.cobroId, monto: 1 }], p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-13', p_usuario: USUARIO }),
        supabase.rpc('registrar_pago_proveedor', { p_lineas: [{ grupo_id: fx.grupoId, monto: 1 }], p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-13', p_usuario: USUARIO }),
        supabase.rpc('anular_pago_cobro', { p_pago_id: pagoC.pago_id, p_motivo: 'prueba', p_usuario: USUARIO }),
        supabase.rpc('anular_pago_proveedor', { p_pago_id: pagoP.pago_id, p_motivo: 'prueba', p_usuario: USUARIO }),
        supabase.rpc('reabrir_cuentas_proyecto', { p_proyecto_id: fx.id, p_motivo: 'prueba', p_usuario: USUARIO }),
        supabase.rpc('reasignar_responsable_cuenta_pagar', { p_cuenta_pagar_id: fx.cuentaId, p_responsable_id: fx.proveedorId }),
      ])
      for (const r of rpcs) expect(r.error, 'una escritura de Cuentas prosperó sobre un histórico').not.toBeNull()
      expect(rpcs[4].error?.code).toBe('P1420')

      // Las lecturas siguen: la tarjeta y el proyecto seleccionado traen la bandera.
      const periodo = must(await supabase.rpc('cuentas_periodo', { p: { anio: 2026, mes: 'todo', hoy: '2026-10-01', vista: 'proyectos', proyecto: fx.id, page_size: 200 } })) as {
        proyectos: { items: { id: string; historico: boolean }[] }
        seleccionado: { id: string; historico: boolean } | null
      }
      expect(periodo.proyectos.items.find((t) => t.id === fx.id)?.historico).toBe(true)
      expect(periodo.seleccionado?.historico).toBe(true)
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('archivar_cuentas_historicas en seco responde su contrato y no archiva un proyecto con cambios de hoy', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await crearFixture(supabase)
    try {
      const hoy = new Date().toISOString().slice(0, 10)
      const r = must(await supabase.rpc('archivar_cuentas_historicas', { p_year: 2026, p_hoy: hoy, p_dry_run: true })) as {
        dry_run: boolean; corte: string; elegibles: number; archivados: number; proyectos: string[]; diferidos: unknown[]
      }
      expect(r.dry_run).toBe(true)
      expect(typeof r.elegibles).toBe('number')
      expect(Array.isArray(r.proyectos)).toBe(true)
      expect(Array.isArray(r.diferidos)).toBe(true)
      // Corte = hoy − 190 días; el fixture se creó hoy.
      const dias = (new Date(hoy).getTime() - new Date(r.corte).getTime()) / 86_400_000
      expect(dias).toBe(190)
      expect(r.proyectos).not.toContain(fx.id)
      const { data } = await supabase.from('proyectos').select('cuentas_historico_at').eq('id', fx.id).single()
      expect(data?.cuentas_historico_at).toBeNull()
    } finally {
      await limpiar(supabase, fx)
    }
  })
})
