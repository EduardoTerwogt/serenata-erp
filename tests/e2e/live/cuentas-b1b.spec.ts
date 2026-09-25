import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Rediseño de Cuentas, B1b (docs/PLAN.md): pruebas reales contra
 * serenata-erp-test de las RPCs corregidas, llamadas directo con
 * supabase-js (mismo patrón que cuentas-pagar-concurrency.spec.ts).
 *
 * - generar_orden_pago: dos generaciones simultáneas con el mismo grupo
 *   dejan una sola orden (H1) con su desglose (S1).
 * - registrar_pago_cuenta_pagar: un pago parcial de una suelta dentro de
 *   una orden conserva EN_PROCESO_PAGO (H3).
 * - cancel_cotizacion: principal, complementaria y principal con
 *   complementarias (APROBADA, EMITIDA, BORRADOR), más los casos
 *   bloqueados (R1, D22, A4, D28, D31).
 *
 * Cada prueba crea sus propias filas con un prefijo único y las borra al
 * final, aunque falle.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>

function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  return result.data as NonNullable<T>
}

/** Para escrituras sin `.select()`: solo importa que no haya error. */
function ok(result: { error: unknown }) {
  if (result.error) throw result.error
}

interface Fixture {
  prefix: string
  proveedorId: string
  cotizaciones: string[]
  ordenes: string[]
}

async function nuevoFixture(supabase: Supabase): Promise<Fixture> {
  const prefix = `LB1B${randomUUID().slice(0, 6).toUpperCase()}`
  const proveedorId = randomUUID()
  ok(await supabase.from('proveedores').insert({ id: proveedorId, nombre: `${prefix} Proveedor`, activo: true }))
  return { prefix, proveedorId, cotizaciones: [], ordenes: [] }
}

async function crearCotizacion(
  supabase: Supabase,
  fx: Fixture,
  opts: { id: string; estado: string; complementariaDe?: string; conProyecto?: boolean }
) {
  ok(await supabase.from('cotizaciones').insert({
    id: opts.id,
    cliente: `${fx.prefix} Cliente`,
    proyecto: `${fx.prefix} Proyecto`,
    fecha_entrega: '2026-01-10',
    tipo: opts.complementariaDe ? 'COMPLEMENTARIA' : 'PRINCIPAL',
    es_complementaria_de: opts.complementariaDe ?? null,
    estado: opts.estado,
  }))
  fx.cotizaciones.push(opts.id)
  if (opts.conProyecto) {
    ok(await supabase.from('proyectos').insert({ id: opts.id, cliente: `${fx.prefix} Cliente`, proyecto: `${fx.prefix} Proyecto` }))
  }
}

/** Cuentas de una cotización aprobada: un cobro y un renglón por pagar dentro de un grupo. */
async function crearCuentas(
  supabase: Supabase,
  fx: Fixture,
  opts: { cotizacionId: string; proyectoId: string; grupoId: string; xPagar: number; grupoEstado?: string }
) {
  ok(await supabase.from('cuentas_cobrar').insert({
    cotizacion_id: opts.cotizacionId,
    proyecto_id: opts.proyectoId,
    cliente: `${fx.prefix} Cliente`,
    proyecto: `${fx.prefix} Proyecto`,
    monto_total: opts.xPagar * 2,
  }))
  const { data: grupo } = await supabase.from('cuentas_pagar_grupos').select('id').eq('id', opts.grupoId).maybeSingle()
  if (!grupo) {
    ok(await supabase.from('cuentas_pagar_grupos').insert({
      id: opts.grupoId,
      proyecto_id: opts.proyectoId,
      responsable_id: fx.proveedorId,
      estado: opts.grupoEstado ?? 'ABIERTO',
    }))
  }
  ok(await supabase.from('cuentas_pagar').insert({
    cotizacion_id: opts.cotizacionId,
    proyecto_id: opts.proyectoId,
    responsable_id: fx.proveedorId,
    responsable_nombre: `${fx.prefix} Proveedor`,
    item_descripcion: `Renglón ${opts.cotizacionId}`,
    x_pagar: opts.xPagar,
    grupo_id: opts.grupoId,
  }))
  const { data: hijas } = await supabase.from('cuentas_pagar').select('x_pagar').eq('grupo_id', opts.grupoId)
  const total = (hijas ?? []).reduce((sum, h) => sum + Number(h.x_pagar), 0)
  ok(await supabase.from('cuentas_pagar_grupos').update({ monto_total: total }).eq('id', opts.grupoId))
}

async function limpiar(supabase: Supabase, fx: Fixture) {
  const ids = fx.cotizaciones
  const { data: grupos } = await supabase.from('cuentas_pagar_grupos').select('id').eq('responsable_id', fx.proveedorId)
  const grupoIds = (grupos ?? []).map((g) => g.id)
  const { data: cuentas } = await supabase.from('cuentas_pagar').select('id, orden_pago_id').eq('responsable_id', fx.proveedorId)
  const ordenIds = Array.from(new Set([...(fx.ordenes), ...(cuentas ?? []).map((c) => c.orden_pago_id).filter(Boolean)]))

  const cuentaIds = (cuentas ?? []).map((c) => c.id)
  if (ordenIds.length) await supabase.from('ordenes_pago_conceptos').delete().in('orden_pago_id', ordenIds)
  // B2: pagos_cuentas_pagar referencia grupos, cuentas y órdenes.
  if (grupoIds.length) await supabase.from('pagos_cuentas_pagar').delete().in('grupo_id', grupoIds)
  if (cuentaIds.length) await supabase.from('pagos_cuentas_pagar').delete().in('cuenta_pagar_id', cuentaIds)
  if (grupoIds.length) await supabase.from('documentos_cuentas_pagar').delete().in('grupo_id', grupoIds)
  if (cuentaIds.length) await supabase.from('documentos_cuentas_pagar').delete().in('cuentas_pagar_id', cuentaIds)
  await supabase.from('cuentas_pagar').delete().eq('responsable_id', fx.proveedorId)
  if (grupoIds.length) await supabase.from('cuentas_pagar_grupos').delete().in('id', grupoIds)
  if (ordenIds.length) await supabase.from('ordenes_pago').delete().in('id', ordenIds)
  if (ids.length) {
    await supabase.from('cuentas_cobrar').delete().in('cotizacion_id', ids)
    await supabase.from('proyectos').delete().in('id', ids)
    await supabase.from('cotizaciones').delete().in('id', ids)
  }
  await supabase.from('proveedores').delete().eq('id', fx.proveedorId)
}

test.describe('live: B1b — órdenes de pago atómicas y cancelación en cascada', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('dos generar_orden_pago simultáneos con el mismo grupo: una sola orden, con desglose', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 1000, grupoEstado: 'FACTURADO' })
      ok(await supabase.from('documentos_cuentas_pagar').insert({
        grupo_id: grupoId,
        tipo: 'FACTURA_PROVEEDOR_XML',
        archivo_url: 'https://example.com/live.xml',
        archivo_nombre: 'live.xml',
        estado_validacion: 'validado',
      }))

      const candidatos = [{ tipo: 'grupo', id: grupoId, monto_esperado: 1000 }]
      const [r1, r2] = await Promise.all([
        supabase.rpc('generar_orden_pago', { p_candidatos: candidatos, p_pdf_url: null, p_pdf_nombre: `${fx.prefix} 1.pdf`, p_usuario: 'live' }),
        supabase.rpc('generar_orden_pago', { p_candidatos: candidatos, p_pdf_url: null, p_pdf_nombre: `${fx.prefix} 2.pdf`, p_usuario: 'live' }),
      ])
      const exitosos = [r1, r2].filter((r) => !r.error)
      const fallidos = [r1, r2].filter((r) => r.error)
      for (const r of exitosos) fx.ordenes.push((r.data as { orden_pago_id: string }).orden_pago_id)

      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/^candidato_no_elegible: .*ya está en otra orden/)

      const ordenId = fx.ordenes[0]
      const grupo = must(await supabase.from('cuentas_pagar_grupos').select('estado, orden_pago_id').eq('id', grupoId).single())
      expect(grupo).toEqual({ estado: 'EN_PROCESO_PAGO', orden_pago_id: ordenId })
      const hijas = must(await supabase.from('cuentas_pagar').select('estado, orden_pago_id').eq('grupo_id', grupoId))
      expect(hijas).toEqual([{ estado: 'EN_PROCESO_PAGO', orden_pago_id: ordenId }])
      const conceptos = must(await supabase.from('ordenes_pago_conceptos').select('grupo_id, neto_cubierto').eq('orden_pago_id', ordenId))
      expect(conceptos).toEqual([{ grupo_id: grupoId, neto_cubierto: 1000 }])
      const orden = must(await supabase.from('ordenes_pago').select('total_monto, estado').eq('id', ordenId).single())
      expect(Number(orden.total_monto)).toBe(1000)
      expect(orden.estado).toBe('GENERADA')
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('B6: candidatos → orden → cancelar libera el grupo y conserva el desglose (D7, R6, S1)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 1000, grupoEstado: 'FACTURADO' })
      ok(await supabase.from('documentos_cuentas_pagar').insert({
        grupo_id: grupoId,
        tipo: 'FACTURA_PROVEEDOR_XML',
        archivo_url: 'https://example.com/live.xml',
        archivo_nombre: 'live.xml',
        estado_validacion: 'validado',
      }))

      type Candidatos = { elegibles: { id: string; saldo: number; items: unknown[] }[] }
      const antes = must(await supabase.rpc('cuentas_orden_candidatos', { p_limite_no_incluidas: 0 })) as Candidatos
      const elegible = antes.elegibles.find((e) => e.id === grupoId)
      expect(elegible?.saldo).toBe(1000)
      expect(elegible?.items).toHaveLength(1)

      const generada = must(await supabase.rpc('generar_orden_pago', {
        p_candidatos: [{ tipo: 'grupo', id: grupoId, monto_esperado: 1000 }],
        p_pdf_url: null,
        p_pdf_nombre: `${fx.prefix} B6.pdf`,
        p_usuario: 'live',
      })) as { orden_pago_id: string }
      fx.ordenes.push(generada.orden_pago_id)
      const enOrden = must(await supabase.rpc('cuentas_orden_candidatos', { p_limite_no_incluidas: 0 })) as Candidatos
      expect(enOrden.elegibles.some((e) => e.id === grupoId)).toBe(false)

      ok(await supabase.rpc('cancelar_orden_pago', { p_orden_id: generada.orden_pago_id, p_motivo: 'prueba live', p_usuario: 'live' }))
      const grupo = must(await supabase.from('cuentas_pagar_grupos').select('estado, orden_pago_id').eq('id', grupoId).single())
      expect(grupo).toEqual({ estado: 'FACTURADO', orden_pago_id: null })
      const hijas = must(await supabase.from('cuentas_pagar').select('estado, orden_pago_id').eq('grupo_id', grupoId))
      expect(hijas).toEqual([{ estado: 'PENDIENTE', orden_pago_id: null }])
      const orden = must(await supabase.from('ordenes_pago').select('estado, cancelada_motivo').eq('id', generada.orden_pago_id).single())
      expect(orden).toEqual({ estado: 'CANCELADA', cancelada_motivo: 'prueba live' })
      const conceptos = must(await supabase.from('ordenes_pago_conceptos').select('grupo_id').eq('orden_pago_id', generada.orden_pago_id))
      expect(conceptos).toEqual([{ grupo_id: grupoId }])

      const otraVez = await supabase.rpc('cancelar_orden_pago', { p_orden_id: generada.orden_pago_id, p_motivo: 'otra', p_usuario: 'live' })
      expect(otraVez.error?.message ?? '').toMatch(/^orden_cancelada/)
      const despues = must(await supabase.rpc('cuentas_orden_candidatos', { p_limite_no_incluidas: 0 })) as Candidatos
      expect(despues.elegibles.some((e) => e.id === grupoId)).toBe(true)

      type Historial = { rows: { id: string; estado: string; cuentas: number }[] }
      const hist = must(await supabase.rpc('buscar_ordenes_pago', { p_filtros: { q: fx.prefix }, p_page: 1, p_page_size: 5 })) as Historial
      expect(hist.rows).toEqual([expect.objectContaining({ id: generada.orden_pago_id, estado: 'CANCELADA', cuentas: 1 })])
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('pago parcial de una suelta dentro de una orden conserva EN_PROCESO_PAGO (H3)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const orden = must(await supabase.from('ordenes_pago')
        .insert({ fecha_generacion: '2026-01-15', estado: 'GENERADA', total_monto: 1000 })
        .select('id').single())
      fx.ordenes.push(orden.id)
      const cuenta = must(await supabase.from('cuentas_pagar').insert({
        responsable_id: fx.proveedorId,
        responsable_nombre: `${fx.prefix} Proveedor`,
        x_pagar: 1000,
        total_a_transferir: 1160,
        orden_pago_id: orden.id,
        estado: 'EN_PROCESO_PAGO',
      }).select('id').single())
      // B2 (D25): sin factura validada no se paga.
      ok(await supabase.from('documentos_cuentas_pagar').insert({
        cuentas_pagar_id: cuenta.id,
        tipo: 'FACTURA_PROVEEDOR_XML',
        archivo_url: 'https://example.com/live.xml',
        archivo_nombre: 'live.xml',
        estado_validacion: 'validado',
        total_cfdi: 1160,
      }))

      // B2 (D3): se captura el transferido; el neto aplicado es proporcional.
      const res = must(await supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuenta.id, p_monto: 400 }))
      expect((res as { estado_nuevo: string }).estado_nuevo).toBe('EN_PROCESO_PAGO')
      const fila = must(await supabase.from('cuentas_pagar').select('estado, monto_pagado, monto_transferido').eq('id', cuenta.id).single())
      expect(fila.estado).toBe('EN_PROCESO_PAGO')
      expect(Number(fila.monto_transferido)).toBe(400)
      expect(Number(fila.monto_pagado)).toBe(344.83) // 400 × 1000 / 1160
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('cancelar una principal aprobada borra sus cuentas, grupos y proyecto (R1)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 500 })

      must(await supabase.rpc('cancel_cotizacion', { p_id: principal }))

      const cot = must(await supabase.from('cotizaciones').select('estado').eq('id', principal).single())
      expect(cot.estado).toBe('CANCELADA')
      expect(must(await supabase.from('proyectos').select('id').eq('id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar').select('id').eq('cotizacion_id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_cobrar').select('id').eq('cotizacion_id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar_grupos').select('id').eq('id', grupoId))).toHaveLength(0)
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('cancelar una complementaria solo borra sus cuentas y recalcula el grupo compartido', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const compl = `${fx.prefix}-P-A`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCotizacion(supabase, fx, { id: compl, estado: 'APROBADA', complementariaDe: principal })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 500 })
      await crearCuentas(supabase, fx, { cotizacionId: compl, proyectoId: principal, grupoId, xPagar: 300 })

      must(await supabase.rpc('cancel_cotizacion', { p_id: compl }))

      expect(must(await supabase.from('cotizaciones').select('estado').eq('id', compl).single()).estado).toBe('CANCELADA')
      expect(must(await supabase.from('cotizaciones').select('estado').eq('id', principal).single()).estado).toBe('APROBADA')
      expect(must(await supabase.from('proyectos').select('id').eq('id', principal))).toHaveLength(1)
      expect(must(await supabase.from('cuentas_pagar').select('id').eq('cotizacion_id', compl))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_cobrar').select('id').eq('cotizacion_id', compl))).toHaveLength(0)
      const grupo = must(await supabase.from('cuentas_pagar_grupos').select('monto_total').eq('id', grupoId).single())
      expect(Number(grupo.monto_total)).toBe(500)
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('cancelar una principal cancela en cascada sus complementarias (APROBADA, EMITIDA y BORRADOR) (D28, D31)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const aprobada = `${principal}-A`
      const emitida = `${principal}-B`
      const borrador = `${principal}-C`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCotizacion(supabase, fx, { id: aprobada, estado: 'APROBADA', complementariaDe: principal })
      await crearCotizacion(supabase, fx, { id: emitida, estado: 'EMITIDA', complementariaDe: principal })
      await crearCotizacion(supabase, fx, { id: borrador, estado: 'BORRADOR', complementariaDe: principal })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 500 })
      await crearCuentas(supabase, fx, { cotizacionId: aprobada, proyectoId: principal, grupoId, xPagar: 300 })

      must(await supabase.rpc('cancel_cotizacion', { p_id: principal }))

      const estados = must(await supabase.from('cotizaciones').select('id, estado').in('id', [principal, aprobada, emitida, borrador]))
      const porId = Object.fromEntries(estados.map((c) => [c.id, c.estado]))
      expect(porId).toEqual({ [principal]: 'CANCELADA', [aprobada]: 'CANCELADA', [emitida]: 'CANCELADA' })
      expect(must(await supabase.from('proyectos').select('id').eq('id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar').select('id').eq('proyecto_id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_cobrar').select('id').eq('proyecto_id', principal))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar_grupos').select('id').eq('id', grupoId))).toHaveLength(0)
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('bloqueos: una complementaria con pago a proveedor frena la cascada de la principal y no toca nada (D22, D28)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const principal = `${fx.prefix}-P`
      const aprobada = `${principal}-A`
      const grupoId = randomUUID()
      await crearCotizacion(supabase, fx, { id: principal, estado: 'APROBADA', conProyecto: true })
      await crearCotizacion(supabase, fx, { id: aprobada, estado: 'APROBADA', complementariaDe: principal })
      await crearCuentas(supabase, fx, { cotizacionId: principal, proyectoId: principal, grupoId, xPagar: 500 })
      // Mismo proveedor y proyecto: comparte el grupo ABIERTO (índice único parcial).
      await crearCuentas(supabase, fx, { cotizacionId: aprobada, proyectoId: principal, grupoId, xPagar: 300 })
      ok(await supabase.from('cuentas_pagar').update({ monto_pagado: 100 }).eq('cotizacion_id', aprobada))

      const { error } = await supabase.rpc('cancel_cotizacion', { p_id: principal })
      expect(error?.code).toBe('P1413')
      expect(error?.message).toBe(`cancelacion_bloqueada: la cotización ${aprobada} ya tiene pagos a proveedor registrados`)

      const estados = must(await supabase.from('cotizaciones').select('id, estado').in('id', [principal, aprobada]))
      expect(estados.every((c) => c.estado === 'APROBADA')).toBe(true)
      expect(must(await supabase.from('proyectos').select('id').eq('id', principal))).toHaveLength(1)
      expect(must(await supabase.from('cuentas_pagar').select('id').eq('proyecto_id', principal))).toHaveLength(2)
    } finally {
      await limpiar(supabase, fx)
    }
  })

  test('bloqueos: cobro registrado, cuenta en orden y grupo ya facturado (D22, A4)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const fx = await nuevoFixture(supabase)
    try {
      const conCobro = `${fx.prefix}-C`
      const enOrden = `${fx.prefix}-O`
      const facturado = `${fx.prefix}-F`
      for (const id of [conCobro, enOrden, facturado]) {
        await crearCotizacion(supabase, fx, { id, estado: 'APROBADA', conProyecto: true })
      }
      await crearCuentas(supabase, fx, { cotizacionId: conCobro, proyectoId: conCobro, grupoId: randomUUID(), xPagar: 100 })
      await crearCuentas(supabase, fx, { cotizacionId: enOrden, proyectoId: enOrden, grupoId: randomUUID(), xPagar: 100 })
      await crearCuentas(supabase, fx, { cotizacionId: facturado, proyectoId: facturado, grupoId: randomUUID(), xPagar: 100, grupoEstado: 'FACTURADO' })

      ok(await supabase.from('cuentas_cobrar').update({ monto_pagado: 50 }).eq('cotizacion_id', conCobro))
      const orden = must(await supabase.from('ordenes_pago')
        .insert({ fecha_generacion: '2026-01-15', estado: 'GENERADA', total_monto: 100 })
        .select('id').single())
      fx.ordenes.push(orden.id)
      ok(await supabase.from('cuentas_pagar').update({ orden_pago_id: orden.id }).eq('cotizacion_id', enOrden))

      const casos: Array<[string, string]> = [
        [conCobro, 'ya tiene cobros registrados'],
        [enOrden, 'tiene cuentas en una orden de pago'],
        [facturado, 'tiene cuentas en un grupo ya facturado o en pago'],
      ]
      for (const [id, motivo] of casos) {
        const { error } = await supabase.rpc('cancel_cotizacion', { p_id: id })
        expect(error?.code).toBe('P1413')
        expect(error?.message).toBe(`cancelacion_bloqueada: la cotización ${id} ${motivo}`)
        expect(must(await supabase.from('cotizaciones').select('estado').eq('id', id).single()).estado).toBe('APROBADA')
        expect(must(await supabase.from('proyectos').select('id').eq('id', id))).toHaveLength(1)
      }
    } finally {
      await limpiar(supabase, fx)
    }
  })
})
