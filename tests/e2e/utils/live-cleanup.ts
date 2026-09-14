import { createClient } from '@supabase/supabase-js'

export function getLiveSupabaseAdmin() {
  const url = process.env.TEST_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY son requeridas para limpiar datos de tests/e2e/live')
  }
  return createClient(url, key)
}

/**
 * Borra en orden seguro (respetando FKs) todo lo generado por una cotización
 * de prueba real: cuentas_pagar -> cuentas_cobrar (documentos/pagos van en
 * cascada) -> proyectos -> cotizaciones (items van en cascada) ->
 * cotizacion_folio_reservations (folio = cotizaciones.id). Este último paso
 * es crítico: esa tabla tiene un unique global en `folio` sin importar si la
 * reserva ya fue consumida, así que borrar solo `cotizaciones` deja el folio
 * bloqueado para siempre -- reserve_next_cotizacion_folio() lo vuelve a
 * proponer como "siguiente" (ya no ve la cotización borrada) y el insert de
 * la nueva reserva choca contra la vieja. Esto nunca pasa en producción real
 * porque ninguna RPC hace DELETE de `cotizaciones` -- es un hueco exclusivo
 * de este cleanup de test, que sí borra filas de verdad.
 */
export async function cleanupLiveCotizacion(cotizacionId: string) {
  const supabase = getLiveSupabaseAdmin()

  await supabase.from('cuentas_pagar').delete().eq('cotizacion_id', cotizacionId)
  await supabase.from('cuentas_cobrar').delete().eq('cotizacion_id', cotizacionId)
  await supabase.from('proyectos').delete().eq('id', cotizacionId)
  await supabase.from('cotizaciones').delete().eq('id', cotizacionId)
  await supabase.from('cotizacion_folio_reservations').delete().eq('folio', cotizacionId)
}

/**
 * Barre TODA la tabla cotizacion_folio_reservations y borra las reservas que
 * ya no tienen una cotización real asociada (huérfanas) -- ya sea porque
 * cleanupLiveCotizacion las limpió antes de que este código existiera, o por
 * cualquier otra corrida fallida que dejó una reserva consumida sin su
 * cotización. Se corre en beforeAll para auto-sanar el estado antes de que
 * las pruebas intenten reservar folios nuevos.
 */
export async function cleanupOrphanedFolioReservations() {
  const supabase = getLiveSupabaseAdmin()

  const [{ data: reservations, error: resError }, { data: cotizaciones, error: cotError }] = await Promise.all([
    supabase.from('cotizacion_folio_reservations').select('token, folio'),
    supabase.from('cotizaciones').select('id'),
  ])
  if (resError) throw resError
  if (cotError) throw cotError

  const existingIds = new Set((cotizaciones ?? []).map((c) => c.id))
  const orphanTokens = (reservations ?? [])
    .filter((r) => !existingIds.has(r.folio))
    .map((r) => r.token)

  if (orphanTokens.length > 0) {
    await supabase.from('cotizacion_folio_reservations').delete().in('token', orphanTokens)
  }
}

/**
 * Barre y limpia TODAS las cotizaciones cuyo cliente empiece con el prefijo
 * dado. Más robusto que limpiar por un id capturado en el test: si el test
 * falla antes de poder leer el id de la URL (timeout, error real, etc.) la
 * cotización ya quedó creada en Supabase real y quedaría huérfana para
 * siempre. Se usa antes y después de cada corrida para no acumular basura
 * entre intentos fallidos de CI.
 */
export async function cleanupLiveCotizacionesByPrefix(clientePrefix: string) {
  const supabase = getLiveSupabaseAdmin()
  const { data: rows, error } = await supabase
    .from('cotizaciones')
    .select('id')
    .ilike('cliente', `${clientePrefix}%`)

  if (error) throw error

  for (const row of rows ?? []) {
    await cleanupLiveCotizacion(row.id)
  }
}

/**
 * Siembra un producto real en `productos` para probar el autofill de la
 * sugerencia de descripción contra Supabase real (Fase 8: el conflicto entre
 * seleccionar un producto -que autocompleta categoría/precio/x_pagar- y que
 * otro colaborador edite precio a mano en la misma partida). `descripcion`
 * es `unique`, así que esto es idempotente: un reintento con la misma
 * descripción actualiza la fila existente en vez de fallar.
 */
export async function ensureLiveProducto(producto: {
  descripcion: string
  categoria: string
  precio_unitario: number
  x_pagar_sugerido: number
}) {
  const supabase = getLiveSupabaseAdmin()
  const { data, error } = await supabase
    .from('productos')
    .upsert({ ...producto, activo: true }, { onConflict: 'descripcion' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function cleanupLiveProducto(descripcion: string) {
  const supabase = getLiveSupabaseAdmin()
  const { error } = await supabase.from('productos').delete().eq('descripcion', descripcion)
  if (error) throw error
}

/**
 * Fase 8.7.2: cada partida con `descripcion` nueva se auto-aprende como
 * producto (`runQuotationNonCriticalAutosaves` -> upsert en `productos`,
 * `onConflict: 'descripcion'`) -- deliberado en producción, para que el
 * catálogo de autofill crezca solo. Pero decenas de specs live escriben
 * descripciones únicas por corrida (sufijo `Date.now()`, contadores de
 * escala, etc.) precisamente para no chocar entre sí -- cada una nunca
 * colisiona con `onConflict`, así que nunca se actualiza una fila existente:
 * siempre crea una nueva, permanente, que ningún cleanup por descripción
 * exacta cubre.
 *
 * Este cleanup filtraba originalmente por `created_at` < 24h, pero
 * `workers: 1`/`fullyParallel: false` (`playwright.config.ts`) garantiza que
 * ningún spec corre en paralelo con otro -- así que nada creado por una
 * corrida de CI anterior sigue "vivo" cuando el siguiente `beforeAll`
 * arranca, y el filtro de 24h solo servía para dejar sobrevivir la basura de
 * corridas *del mismo día*. Con varios reruns de `live` en un solo día (o
 * varios PRs el mismo día) eso bastó para volver a superar el tope por
 * defecto de PostgREST (1000 filas) en `GET /api/productos?q=` -- el mismo
 * síntoma de Fase 8.7.2, repetido en PR #48. Este proyecto (`serenata-erp-test`)
 * es exclusivamente de CI: nada en `productos` necesita sobrevivir a un
 * `beforeAll` posterior, así que se borra todo, sin filtro de antigüedad.
 */
export async function cleanupOrphanedTestProductos() {
  const supabase = getLiveSupabaseAdmin()
  const { error } = await supabase.from('productos').delete().not('id', 'is', null)
  if (error) throw error
}
