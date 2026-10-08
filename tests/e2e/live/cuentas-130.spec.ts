import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { login } from '../utils/auth'
import { aprobarFixture, cleanupLiveCuentasByPrefix, getLiveSupabaseAdmin, insertarCuentaPagarConRenglon } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'

/**
 * #130 (C5): pruebas reales contra serenata-erp-test de lo que agrega "alta de contraparte y pago por proyecto":
 * `preparar_grupo_factura_proveedor` (alta + renglones o gasto extra, atómica e idempotente), el selector y el estado de
 * cuenta por proyecto, la cancelación con un gasto extra y los permisos de las rutas nuevas con un usuario que solo tiene
 * la sección `cuentas`. Cada prueba crea sus filas con un prefijo único y las borra al final, aunque falle.
 */

const PREFIJO = 'LC130'
const REGEX_RFC = (n: number) => `LVA${String(n).padStart(6, '0')}AB1`

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>

function ok(result: { error: unknown }) {
  if (result.error) throw result.error
}
function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  return result.data as NonNullable<T>
}

interface Fixture {
  prefix: string
  proyectoId: string
  /** Renglones sin proveedor del proyecto. */
  libres: string[]
}

/** Proveedor ya existente con ficha mínima (los de prueba se borran por prefijo de nombre). */
async function crearProveedor(supabase: Supabase, prefix: string, sufijo: string) {
  const id = randomUUID()
  ok(await supabase.from('proveedores').insert({ id, nombre: `${prefix} ${sufijo}`, activo: true }))
  return id
}

/** Proyecto aprobado con `libres` renglones por asignar (costo 1000, 2000, ...) y los dados a un proveedor en un grupo. */
async function nuevoProyecto(
  supabase: Supabase,
  prefix: string,
  opts: { libres?: number; deProveedor?: { proveedorId: string; costo: number; estado?: string }[] } = {}
): Promise<Fixture & { grupos: string[] }> {
  const proyectoId = `${prefix}-P`
  ok(await supabase.from('cotizaciones').insert({ id: proyectoId, cliente: `${prefix} Cliente`, proyecto: `${prefix} Proyecto`, fecha_entrega: '2026-01-10', tipo: 'PRINCIPAL', estado: 'EMITIDA' }))
  ok(await supabase.from('proyectos').insert({ id: proyectoId, proyecto: `${prefix} Proyecto` }))
  ok(await supabase.from('cuentas_cobrar').insert({ cotizacion_id: proyectoId, proyecto_id: proyectoId, monto_total: 20000 }))
  const libres: string[] = []
  for (let i = 1; i <= (opts.libres ?? 0); i++) {
    const c = await insertarCuentaPagarConRenglon(supabase, { cotizacionId: proyectoId, proyectoId, responsableId: null, grupoId: null, xPagar: i * 1000, descripcion: `Libre ${i}` })
    libres.push(c.id)
  }
  const grupos: string[] = []
  for (const g of opts.deProveedor ?? []) {
    const grupoId = randomUUID()
    ok(await supabase.from('cuentas_pagar_grupos').insert({ id: grupoId, proyecto_id: proyectoId, responsable_id: g.proveedorId, estado: 'ABIERTO' }))
    await insertarCuentaPagarConRenglon(supabase, { cotizacionId: proyectoId, proyectoId, responsableId: g.proveedorId, grupoId, xPagar: g.costo, descripcion: `De ${g.proveedorId.slice(0, 4)}` })
    ok(await supabase.from('cuentas_pagar_grupos').update({ monto_total: g.costo }).eq('id', grupoId))
    grupos.push(grupoId)
  }
  await aprobarFixture(supabase, proyectoId)
  return { prefix, proyectoId, libres, grupos }
}

const alta = (prefix: string, rfc: string) => ({ nombre: `${prefix} Nuevo`, rfc, regimen_fiscal: 'moral', telefono: '5512345678', correo: 'pagos@live.test', banco: 'BBVA', clabe: '012345678901234567' })

function preparar(supabase: Supabase, p: { proveedorId?: string; proveedor?: object; renglones?: string[]; gasto?: object; operationId?: string }) {
  return supabase.rpc('preparar_grupo_factura_proveedor', {
    p_proveedor_id: p.proveedorId ?? null,
    p_proveedor: p.proveedor ?? null,
    p_renglones: p.renglones ?? null,
    p_gasto: p.gasto ?? null,
    p_usuario: 'live',
    p_operation_id: p.operationId ?? randomUUID(),
  })
}

async function violaciones(supabase: Supabase, claves: string[]) {
  const r = must(await supabase.rpc('auditar_consistencia')) as { guardas: { clave: string; violaciones: number }[] }
  return Object.fromEntries(claves.map((k) => [k, r.guardas.find((g) => g.clave === k)?.violaciones ?? -1]))
}

test.describe('live: #130 alta de contraparte, gasto extra y pago por proyecto', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  // Restos de corridas anteriores (timeout, proceso matado): rompen las guardas de consistencia.
  test.beforeAll(async () => {
    await cleanupLiveCuentasByPrefix(PREFIJO)
  })

  test('dos altas simultáneas con el mismo RFC crean un solo proveedor y el grupo queda con sus renglones', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}A${randomUUID().slice(0, 5).toUpperCase()}`
    const rfc = REGEX_RFC(Math.floor(Math.random() * 1_000_000))
    try {
      const otro = await crearProveedor(supabase, prefix, 'Otro')
      const fx = await nuevoProyecto(supabase, prefix, { libres: 2, deProveedor: [{ proveedorId: otro, costo: 500 }] })
      const { data: deOtro } = await supabase.from('cuentas_pagar').select('id').eq('responsable_id', otro)
      const renglones = [...fx.libres, ...(deOtro ?? []).map((c) => c.id as string)]

      const [r1, r2] = await Promise.all([
        preparar(supabase, { proveedor: alta(prefix, rfc), renglones }),
        preparar(supabase, { proveedor: alta(prefix, rfc), renglones }),
      ])
      const exitosos = [r1, r2].filter((r) => !r.error)
      const fallidos = [r1, r2].filter((r) => r.error)
      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/^proveedor_existente: /)

      const creado = exitosos[0].data as { proveedor_id: string; grupo_id: string; reasignados: number; proveedor_creado: boolean; monto_total: number }
      expect(creado.proveedor_creado).toBe(true)
      expect(creado.reasignados).toBe(3)
      expect(Number(creado.monto_total)).toBe(3500)
      expect(must(await supabase.from('proveedores').select('id').eq('rfc', rfc))).toHaveLength(1)
      const cuentas = must(await supabase.from('cuentas_pagar').select('responsable_id, grupo_id').eq('proyecto_id', fx.proyectoId))
      expect(cuentas.every((c) => c.responsable_id === creado.proveedor_id && c.grupo_id === creado.grupo_id)).toBe(true)
      expect(must(await supabase.from('cuentas_pagar_grupos').select('estado').eq('id', creado.grupo_id).single()).estado).toBe('ABIERTO')
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('un grupo facturado no se reasigna: falla explícito y no queda ni el proveedor nuevo (todo o nada)', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}B${randomUUID().slice(0, 5).toUpperCase()}`
    const rfc = REGEX_RFC(Math.floor(Math.random() * 1_000_000))
    try {
      const otro = await crearProveedor(supabase, prefix, 'Otro')
      const fx = await nuevoProyecto(supabase, prefix, { libres: 1, deProveedor: [{ proveedorId: otro, costo: 500 }] })
      ok(await supabase.from('cuentas_pagar_grupos').update({ estado: 'FACTURADO' }).eq('id', fx.grupos[0]))
      const { data: deOtro } = await supabase.from('cuentas_pagar').select('id').eq('responsable_id', otro)

      const r = await preparar(supabase, { proveedor: alta(prefix, rfc), renglones: [...fx.libres, ...(deOtro ?? []).map((c) => c.id as string)] })
      expect(r.error?.message ?? '').toMatch(/^grupo_no_abierto: /)
      expect(must(await supabase.from('proveedores').select('id').eq('rfc', rfc))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar').select('responsable_id').in('id', fx.libres))).toEqual([{ responsable_id: null }])
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('gasto extra: el doble envío con el mismo operation_id no duplica, las guardas siguen en 0 y cancelar la cotización lo borra', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}C${randomUUID().slice(0, 5).toUpperCase()}`
    try {
      const proveedorId = await crearProveedor(supabase, prefix, 'Proveedor')
      const fx = await nuevoProyecto(supabase, prefix, { libres: 1 })
      const antes = await violaciones(supabase, ['gasto_extra_proyecto', 'k4_cuenta_sin_item'])
      const operationId = randomUUID()
      const gasto = { proyecto_id: fx.proyectoId, concepto: 'Renta de grúa', costo_total: 5000 }

      const [r1, r2] = await Promise.all([preparar(supabase, { proveedorId, gasto, operationId }), preparar(supabase, { proveedorId, gasto, operationId })])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()
      const resultados = [r1.data, r2.data] as { repetido: boolean; cuenta_extra_id: string; grupo_id: string }[]
      expect(resultados.filter((x) => x.repetido)).toHaveLength(1)
      expect(resultados[0].cuenta_extra_id).toBe(resultados[1].cuenta_extra_id)

      const extras = must(await supabase.from('cuentas_pagar').select('id, item_id, concepto, costo_total, cotizacion_id, grupo_id').eq('operation_id', operationId))
      expect(extras).toHaveLength(1)
      expect(extras[0]).toMatchObject({ item_id: null, concepto: 'Renta de grúa', cotizacion_id: fx.proyectoId })
      expect(Number(extras[0].costo_total)).toBe(5000)
      expect(await violaciones(supabase, ['gasto_extra_proyecto', 'k4_cuenta_sin_item'])).toEqual(antes)

      // El gasto extra aparece en el selector de renglones con su concepto y marcado como gasto extra.
      const selector = must(await supabase.rpc('cuentas_proyectos_selector', { p_modo: 'renglones', p_q: fx.proyectoId, p_solo_pendientes: true, p_page: 1, p_page_size: 5 })) as {
        proyectos: { proyecto_id: string; renglones: { descripcion: string; gasto_extra: boolean }[] }[]
      }
      const delProyecto = selector.proyectos.find((p) => p.proyecto_id === fx.proyectoId)
      expect(delProyecto?.renglones.find((r) => r.gasto_extra)?.descripcion).toBe('Renta de grúa')

      // Con el grupo ABIERTO cancelar la cotización se lleva el gasto extra y su grupo.
      must(await supabase.rpc('cancel_cotizacion', { p_id: fx.proyectoId }))
      expect(must(await supabase.from('cuentas_pagar').select('id').eq('operation_id', operationId))).toHaveLength(0)
      expect(must(await supabase.from('cuentas_pagar_grupos').select('id').eq('proyecto_id', fx.proyectoId))).toHaveLength(0)
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('cancelar la cotización se bloquea si el grupo del gasto extra ya está facturado', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}D${randomUUID().slice(0, 5).toUpperCase()}`
    try {
      const proveedorId = await crearProveedor(supabase, prefix, 'Proveedor')
      const fx = await nuevoProyecto(supabase, prefix, { libres: 1 })
      const r = must(await preparar(supabase, { proveedorId, gasto: { proyecto_id: fx.proyectoId, concepto: 'Viáticos', costo_total: 800 } })) as { grupo_id: string }
      ok(await supabase.from('cuentas_pagar_grupos').update({ estado: 'FACTURADO' }).eq('id', r.grupo_id))

      const cancelar = await supabase.rpc('cancel_cotizacion', { p_id: fx.proyectoId })
      expect(cancelar.error?.message ?? '').toMatch(/^cancelacion_bloqueada: /)
      expect(must(await supabase.from('cotizaciones').select('estado').eq('id', fx.proyectoId).single()).estado).toBe('APROBADA')
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('pago por proyecto: el selector separa contrapartes, el estado se limita al proyecto y un pago de dos proveedores se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}E${randomUUID().slice(0, 5).toUpperCase()}`
    try {
      const a = await crearProveedor(supabase, prefix, 'Prov A')
      const b = await crearProveedor(supabase, prefix, 'Prov B')
      const fx = await nuevoProyecto(supabase, prefix, { deProveedor: [{ proveedorId: a, costo: 1000 }, { proveedorId: b, costo: 500 }] })
      for (let i = 0; i < fx.grupos.length; i++) {
        const grupoId = fx.grupos[i]
        const neto = i === 0 ? 1000 : 500
        ok(await supabase.from('cuentas_pagar_grupos').update({ estado: 'FACTURADO', total_a_transferir: neto * 1.16 }).eq('id', grupoId))
        ok(await supabase.from('documentos_cuentas_pagar').insert({ grupo_id: grupoId, tipo: 'FACTURA_PROVEEDOR_XML', archivo_url: 'https://example.com/live.xml', archivo_nombre: 'live.xml', estado_validacion: 'validado', total_cfdi: neto * 1.16 }))
      }

      const selector = must(await supabase.rpc('cuentas_proyectos_selector', { p_modo: 'pago', p_lado: 'proveedor', p_q: fx.proyectoId, p_page: 1, p_page_size: 5 })) as {
        proyectos: { proyecto_id: string; contrapartes: { id: string; saldo: number }[] }[]
      }
      const contrapartes = selector.proyectos.find((p) => p.proyecto_id === fx.proyectoId)?.contrapartes ?? []
      expect(contrapartes.map((c) => c.id).sort()).toEqual([a, b].sort())
      expect(Object.fromEntries(contrapartes.map((c) => [c.id, Number(c.saldo)]))).toEqual({ [a]: 1160, [b]: 580 })
      // Filtrado por contraparte: solo la suya.
      const soloA = must(await supabase.rpc('cuentas_proyectos_selector', { p_modo: 'pago', p_lado: 'proveedor', p_q: fx.proyectoId, p_contraparte: a, p_page: 1, p_page_size: 5 })) as { proyectos: { contrapartes: { id: string }[] }[] }
      expect(soloA.proyectos.flatMap((p) => p.contrapartes.map((c) => c.id))).toEqual([a])

      const estadoA = must(await supabase.rpc('estado_cuenta', { p_lado: 'proveedor', p_contraparte: a, p_proyectos: [fx.proyectoId], p_hoy: null })) as { facturas: { saldo: number; conceptos: { proyecto_id: string }[] }[] }
      expect(estadoA.facturas).toHaveLength(1)
      expect(estadoA.facturas[0].conceptos.every((c) => c.proyecto_id === fx.proyectoId)).toBe(true)
      const estadoOtroProyecto = must(await supabase.rpc('estado_cuenta', { p_lado: 'proveedor', p_contraparte: a, p_proyectos: [`${prefix}-NOEXISTE`], p_hoy: null })) as { facturas: unknown[] }
      expect(estadoOtroProyecto.facturas).toHaveLength(0)

      // Un pago cubre grupos de un solo proveedor.
      const mezclado = await supabase.rpc('registrar_pago_proveedor', {
        p_lineas: fx.grupos.map((grupo_id) => ({ grupo_id, monto: 100 })),
        p_tipo_pago: 'TRANSFERENCIA',
        p_fecha_pago: '2026-09-05',
        p_operation_id: randomUUID(),
      })
      expect(mezclado.error?.message ?? '').toMatch(/^contrapartes_distintas: /)
      expect(must(await supabase.from('pagos_cuentas_pagar').select('id').in('grupo_id', fx.grupos))).toHaveLength(0)

      const solo = await supabase.rpc('registrar_pago_proveedor', { p_lineas: [{ grupo_id: fx.grupos[0], monto: 1160 }], p_tipo_pago: 'TRANSFERENCIA', p_fecha_pago: '2026-09-05', p_operation_id: randomUUID() })
      expect(solo.error).toBeNull()
      expect(must(await supabase.from('cuentas_pagar_grupos').select('estado').eq('id', fx.grupos[0]).single()).estado).toBe('PAGADO')
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('permisos: con solo la sección cuentas se usan las rutas nuevas; sin ella, 403', async ({ browser }) => {
    const supabase = getLiveSupabaseAdmin()
    const sufijo = randomUUID().slice(0, 6)
    const conCuentas = { email: `live-130-cuentas-${sufijo}@serenata.test`, password: 'playwright123', name: 'Live 130 cuentas', sections: ['cuentas'] }
    const sinCuentas = { email: `live-130-otra-${sufijo}@serenata.test`, password: 'playwright123', name: 'Live 130 otra', sections: ['proyectos'] }
    const prefix = `${PREFIJO}F${sufijo.toUpperCase()}`
    const clienteId = randomUUID()
    await ensureLiveUser(conCuentas)
    await ensureLiveUser(sinCuentas)
    ok(await supabase.from('clientes').insert({ id: clienteId, nombre: `${prefix} Cliente`, constancia_url: 'https://example.com/constancia.pdf', constancia_nombre: 'constancia.pdf' }))
    const contextos = [await browser.newContext(), await browser.newContext()]
    try {
      const [pCuentas, pOtra] = await Promise.all(contextos.map((c) => c.newPage()))
      await login(pCuentas, '/cuentas', { email: conCuentas.email, password: conCuentas.password })
      await login(pOtra, '/proyectos', { email: sinCuentas.email, password: sinCuentas.password })

      // Lecturas del selector y del estado de cuenta por proyecto.
      expect((await pCuentas.request.get('/api/cuentas/proyectos-selector?modo=renglones')).status()).toBe(200)
      expect((await pCuentas.request.get('/api/cuentas/proyectos-selector?modo=pago&lado=proveedor')).status()).toBe(200)
      expect((await pOtra.request.get('/api/cuentas/proyectos-selector?modo=renglones')).status()).toBe(403)
      expect((await pOtra.request.get(`/api/cuentas/estado-cuenta?lado=cobro&id=${clienteId}&proyectos=X`)).status()).toBe(403)

      // #131: desplegable de contrapartes (forma, búsqueda por nombre y permiso).
      const lista = await pCuentas.request.get(`/api/cuentas/contrapartes?lado=cobro&pendiente=todos&q=${encodeURIComponent(prefix)}`)
      expect(lista.status()).toBe(200)
      const cuerpo = (await lista.json()) as { total: number; contrapartes: { nombre: string }[] }
      expect(cuerpo.contrapartes.map((c) => c.nombre)).toContain(`${prefix} Cliente`)
      expect((await pCuentas.request.get('/api/cuentas/contrapartes?lado=cobro&pendiente=nada')).status()).toBe(400)
      expect((await pOtra.request.get('/api/cuentas/contrapartes?lado=cobro&pendiente=saldo')).status()).toBe(403)

      // Completar la ficha del cliente: solo cuentas; el cliente ya tiene constancia, así que no se pide otra.
      const completar = (p: typeof pCuentas) =>
        p.request.patch(`/api/cuentas/clientes/${clienteId}`, { multipart: { datos: JSON.stringify({ rfc: 'AAA010101AAA', contacto: 'Rosa Díaz', correo: 'rosa@live.test' }) } })
      expect((await completar(pOtra)).status()).toBe(403)
      const r = await completar(pCuentas)
      expect(r.status()).toBe(200)
      expect(must(await supabase.from('clientes').select('rfc, contacto, correo').eq('id', clienteId).single())).toEqual({ rfc: 'AAA010101AAA', contacto: 'Rosa Díaz', correo: 'rosa@live.test' })
      // Un RFC distinto al ya guardado no se cambia desde aquí.
      const distinto = await pCuentas.request.patch(`/api/cuentas/clientes/${clienteId}`, { multipart: { datos: JSON.stringify({ rfc: 'BBB020202BBB' }) } })
      expect(distinto.status()).toBe(409)

      // Quien tiene cuentas no puede dar de alta proveedores por la ruta general (exige responsables).
      const proveedor = await pCuentas.request.post('/api/proveedores', { data: { nombre: `${prefix} X`, rfc: REGEX_RFC(1), regimen_fiscal: 'moral' } })
      expect(proveedor.status()).toBe(403)
    } finally {
      await Promise.all(contextos.map((c) => c.close()))
      await supabase.from('clientes').delete().eq('id', clienteId)
      await cleanupLiveUser(conCuentas.email)
      await cleanupLiveUser(sinCuentas.email)
    }
  })
})
