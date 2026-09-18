import { test, expect, BrowserContext, Locator, Page, Response } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupLiveProducto, cleanupOrphanedFolioReservations, cleanupOrphanedTestProductos } from '../utils/live-cleanup'
import { esperarCanalColaborativo, faltantesDelEntornoLive, leerCotizacionDelServidor, leerProyectoYCuentasDelServidor, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'
import { fmtCurrency } from '@/lib/quotations/format'

/**
 * Colaboración REAL: dos usuarios distintos, dos navegadores, la misma cotización,
 * contra Supabase de prueba real (base + canal de tiempo real). Los tests de
 * `tests/e2e/critical` cubren lo mismo con el canal simulado y las APIs mockeadas:
 * son rápidos y corren en cada PR, pero un mock que siempre responde 200 no puede
 * decir si el servidor y la base se comportan como se espera. Estos sí.
 *
 * Cada caso corresponde a un mal funcionamiento reportado y arreglado:
 * montos y descripciones que se borraban, el cursor robado por la fila de otro,
 * el subtotal mal sumado tras importar y las secciones que bloqueaban la escritura.
 */

const PREFIJO = 'E2E-LIVE-COLAB-'

const USUARIO_B = {
  email: 'e2e-live-colab-b@serenata.test',
  password: 'ColabB-live-2026',
  name: 'Colab Bravo',
}
// `getShortName` en la pantalla de detalle recorta a las dos primeras palabras.
const NOMBRE_CORTO_B = 'Colab Bravo'

const COL = { categoria: 0, descripcion: 1, cantidad: 2, precio: 3, xPagar: 6 } as const

// Fase 8: producto real sembrado en `productos` para probar el conflicto entre
// el autofill de "seleccionar producto" y una edición manual concurrente de
// precio (punto B de la auditoría de colaboración).
const PRODUCTO_AUTOFILL = {
  descripcion: 'Grúa E2E Fase8 Autofill',
  categoria: 'Grip',
  precio_unitario: 55555,
  x_pagar_sugerido: 20000,
}

function filas(page: Page) {
  return page.locator('table tbody tr')
}

function celda(page: Page, fila: number, columna: number): Locator {
  return filas(page).nth(fila).locator('td').nth(columna).locator('input')
}

function subtotal(page: Page): Locator {
  return page.getByText('Subtotal', { exact: true }).locator('xpath=following-sibling::*[1]')
}

/**
 * Un error de JS en la pantalla no rompe ninguna aserción por sí solo, pero explica
 * fallos que si no parecen magia (p. ej. que el efecto que inserta la fila de otro
 * colaborador lance y esa pantalla deje de reaccionar). Va al log de CI.
 */
function vigilarErrores(page: Page, etiqueta: string) {
  page.on('pageerror', (error) => console.log(`[live colab][${etiqueta}] pageerror: ${error.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[live colab][${etiqueta}] console.error: ${msg.text()}`)
  })
}

async function crearCotizacion(page: Page, cliente: string, proyecto: string, descripciones: Array<{ descripcion: string; precio: number }>) {
  const response = await page.request.post('/api/cotizaciones', {
    data: {
      cliente,
      proyecto,
      estado: 'BORRADOR',
      items: descripciones.map((item, index) => ({
        categoria: 'Equipo',
        descripcion: item.descripcion,
        cantidad: 1,
        precio_unitario: item.precio,
        x_pagar: 0,
        orden: index,
      })),
    },
  })
  expect(response.status(), `no se pudo crear la cotización de prueba: ${await response.text()}`).toBe(201)
  const body = await response.json() as { id: string }
  return body.id
}

/**
 * Guard contra el modo de falla más peligroso de este archivo: si faltan las
 * credenciales, Playwright marca todo como "skipped" y el job queda VERDE sin haber
 * probado nada -- justo lo que estas pruebas existen para evitar. En CI
 * (`PLAYWRIGHT_LIVE_REQUIRED=true`) eso pasa a ser un fallo explícito; en local se
 * salta, como el resto del nivel live.
 */
test.describe('live: guard del entorno', () => {
  test('el entorno live está configurado cuando CI lo exige', () => {
    test.skip(process.env.PLAYWRIGHT_LIVE_REQUIRED !== 'true', 'Solo aplica en el job live de CI')
    expect(
      faltantesDelEntornoLive(),
      'PLAYWRIGHT_LIVE_REQUIRED=true pero el entorno live no está completo: los tests reales se saltarían y el job quedaría en verde sin haber probado nada'
    ).toEqual([])
  })
})

test.describe('live: colaboración real entre dos usuarios', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  let contextA: BrowserContext
  let contextB: BrowserContext
  let pageA: Page
  let pageB: Page
  let cotizacionId = ''
  let origenId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)

    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live colab] barrido inicial:', e))
    await cleanupOrphanedFolioReservations().catch((e) => console.error('[live colab] reservas huérfanas:', e))
    await cleanupOrphanedTestProductos().catch((e) => console.error('[live colab] productos huérfanos:', e))
    await ensureLiveUser(USUARIO_B)

    const suffix = Date.now()

    contextA = await browser.newContext()
    pageA = await contextA.newPage()
    vigilarErrores(pageA, 'A')
    await login(pageA, '/cotizaciones')

    // Fase 8: producto real para el conflicto autofill-vs-edición-manual (punto
    // B de la auditoría) -- necesita un producto de verdad en la tabla, no
    // mockeado. Se crea vía el POST real (no un upsert directo a Supabase) por
    // el mismo motivo que cualquier alta real: pasa por la validación de la
    // ruta. (Histórico: hasta EF-2 1D-3,
    // GET /api/productos cacheaba 5 min en el servidor -- un insert directo
    // podía servir una lista vieja el resto del job si un test anterior ya
    // había calentado esa caché. El caché se retiró; ya no aplica, pero el
    // POST real sigue siendo el camino correcto.)
    const productoResponse = await pageA.request.post('/api/productos', { data: PRODUCTO_AUTOFILL })
    expect(productoResponse.ok(), `no se pudo crear el producto de prueba: ${await productoResponse.text()}`).toBeTruthy()

    origenId = await crearCotizacion(pageA, `${PREFIJO}ORIGEN-${suffix}`, `Origen colab ${suffix}`, [
      { descripcion: 'Grúa importada', precio: 4000 },
      { descripcion: 'Dolly importado', precio: 2500 },
    ])
    cotizacionId = await crearCotizacion(pageA, `${PREFIJO}${suffix}`, `Colaboración ${suffix}`, [
      { descripcion: 'Partida uno', precio: 1000 },
      { descripcion: 'Partida dos', precio: 2000 },
      { descripcion: 'Partida tres', precio: 3000 },
    ])

    contextB = await browser.newContext()
    pageB = await contextB.newPage()
    vigilarErrores(pageB, 'B')
    await login(pageB, '/cotizaciones', { email: USUARIO_B.email, password: USUARIO_B.password })

    await pageA.goto(`/cotizaciones/${cotizacionId}`)
    await pageB.goto(`/cotizaciones/${cotizacionId}`)
    await expect(filas(pageA)).toHaveCount(3, { timeout: 30_000 })
    await expect(filas(pageB)).toHaveCount(3, { timeout: 30_000 })

    // Sin presencia mutua no hay colaboración que probar: mejor fallar aquí, con un
    // mensaje que nombre la causa, que en una aserción de más abajo.
    await esperarCanalColaborativo([
      { page: pageA, veA: NOMBRE_CORTO_B },
      { page: pageB },
    ])
  })

  test.afterAll(async () => {
    await contextA?.close()
    await contextB?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live colab] cleanup destino:', e))
    if (origenId) await cleanupLiveCotizacion(origenId).catch((e) => console.error('[live colab] cleanup origen:', e))
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live colab] barrido final:', e))
    await cleanupLiveUser(USUARIO_B.email).catch((e) => console.error('[live colab] cleanup usuario B:', e))
    await cleanupLiveProducto(PRODUCTO_AUTOFILL.descripcion).catch((e) => console.error('[live colab] cleanup producto:', e))
  })

  test('editar celdas distintas de la misma fila a la vez no borra lo del otro', async () => {
    test.setTimeout(120_000)

    const descripcionA = celda(pageA, 0, COL.descripcion)
    const precioB = celda(pageB, 0, COL.precio)

    await descripcionA.click()
    await descripcionA.fill('Cámara escrita por A')
    await precioB.click()
    await precioB.fill('7777')
    await descripcionA.blur()
    await precioB.blur()

    // La verdad es la base, no la pantalla: lo reportado era justamente que al
    // recargar aparecía bien lo que en pantalla se veía borrado.
    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return { descripcion: cotizacion.items[0].descripcion, precio: cotizacion.items[0].precio_unitario }
    }, { timeout: 30_000 }).toEqual({ descripcion: 'Cámara escrita por A', precio: 7777 })

    // Y cada quien termina viendo lo del otro sin recargar.
    await expect(celda(pageA, 0, COL.precio)).toHaveValue('7777', { timeout: 30_000 })
    await expect(celda(pageB, 0, COL.descripcion)).toHaveValue('Cámara escrita por A', { timeout: 30_000 })
  })

  test('un guardado ajeno no revierte lo que acabas de capturar', async () => {
    test.setTimeout(120_000)

    // Reproduce la carrera del reporte: A captura un monto y, mientras su guardado
    // viaja, B guarda otra cosa. La señal de B disparaba en A una relectura con la
    // foto vieja del servidor, que al volver borraba el monto de A.
    const xPagarA = celda(pageA, 1, COL.xPagar)
    await xPagarA.click()
    await xPagarA.fill('9000')
    await xPagarA.blur()

    const cantidadB = celda(pageB, 2, COL.cantidad)
    await cantidadB.click()
    await cantidadB.fill('4')
    await cantidadB.blur()

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return { xPagar: cotizacion.items[1].x_pagar, cantidad: cotizacion.items[2].cantidad }
    }, { timeout: 30_000 }).toEqual({ xPagar: 9000, cantidad: 4 })

    await expect(xPagarA).toHaveValue('9000', { timeout: 30_000 })
    await expect(celda(pageA, 2, COL.cantidad)).toHaveValue('4', { timeout: 30_000 })
  })

  test('la fila que agrega el otro no te roba el cursor ni lo que estás escribiendo', async () => {
    test.setTimeout(120_000)

    const antes = await filas(pageA).count()

    const descripcionB = celda(pageB, 1, COL.descripcion)
    await descripcionB.click()
    await descripcionB.fill('B sigue escribiendo aquí')

    await pageA.getByRole('button', { name: /Agregar fila/ }).click()

    await expect(filas(pageA), 'A no llegó a ver la fila que acaba de agregar').toHaveCount(antes + 1, { timeout: 30_000 })
    await expect
      .poll(async () => (await leerCotizacionDelServidor(cotizacionId)).items.length, { timeout: 30_000 })
      .toBe(antes + 1)

    // B ve la fila nueva...
    await expect(filas(pageB), 'el mensaje de la fila nueva llegó al canal de B pero la tabla no la insertó').toHaveCount(antes + 1, { timeout: 30_000 })
    // ...sin perder el foco ni el texto a medio escribir.
    await expect(descripcionB).toHaveValue('B sigue escribiendo aquí')
    expect(
      await descripcionB.evaluate((el) => el === document.activeElement),
      'la fila agregada por el otro colaborador movió el cursor de quien estaba escribiendo'
    ).toBe(true)

    await descripcionB.blur()
    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items.map((item) => item.descripcion)
    }, { timeout: 30_000 }).toContain('B sigue escribiendo aquí')
  })

  test('borrar una fila se refleja en la otra pantalla y deja el subtotal correcto', async () => {
    test.setTimeout(120_000)

    const antes = await filas(pageA).count()

    // Regresión real reportada (Fase 8.7.2): la RPC delete_item_cotizacion
    // faltaba en producción y el DELETE moría con 500 -- el borrado de la UI
    // es optimista, así que `toHaveCount(antes - 1)` por sí solo puede
    // aprobar de inmediato aunque el servidor haya rechazado el borrado.
    // Orden correcto: (1) el DELETE real responde 200; (2) el servidor
    // confirma la ausencia (puede tardar en converger, por eso el poll);
    // (3) recién con eso confirmado, la fila sigue ausente en ambas
    // pantallas y el subtotal quedó correcto -- nunca antes ni en paralelo.
    const [deleteResponse] = await Promise.all([
      pageA.waitForResponse(
        (response) => response.url().includes('/items/') && response.request().method() === 'DELETE'
      ),
      filas(pageA).last().locator('td').last().locator('button').click(),
    ])
    expect(deleteResponse.status()).toBe(200)

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items.length
    }, { timeout: 30_000 }).toBe(antes - 1)

    await expect(filas(pageA)).toHaveCount(antes - 1, { timeout: 30_000 })
    await expect(filas(pageB)).toHaveCount(antes - 1, { timeout: 30_000 })

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    expect(cotizacion.items).toHaveLength(antes - 1)

    // Mismo formateador que la pantalla, para no adivinar separadores ni decimales.
    const esperado = `$${fmtCurrency(cotizacion.subtotal)}`
    await expect(subtotal(pageA)).toHaveText(esperado, { timeout: 30_000 })
    await expect(subtotal(pageB)).toHaveText(esperado, { timeout: 30_000 })
  })

  test('importar partidas desde otra cotización llega completo al otro colaborador', async () => {
    test.setTimeout(180_000)

    const antes = await filas(pageA).count()

    await pageA.getByRole('button', { name: 'Copiar desde otra cotización' }).click()
    await pageA.getByPlaceholder('Buscar por folio, cliente o proyecto...').fill(origenId)
    await pageA.getByRole('button').filter({ hasText: origenId }).first().click()
    await pageA.getByText(/Seleccionar todo \(\d+\)/).click()
    await pageA.getByRole('button', { name: /Traer a cotización actual/ }).click()

    await expect(filas(pageA)).toHaveCount(antes + 2, { timeout: 60_000 })
    await expect(filas(pageB)).toHaveCount(antes + 2, { timeout: 60_000 })

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    const descripciones = cotizacion.items.map((item) => item.descripcion)
    expect(descripciones).toContain('Grúa importada')
    expect(descripciones).toContain('Dolly importado')

    // El bug reportado: el subtotal omitía una fila hasta salir y volver a entrar.
    // Mismo formateador que la pantalla, para no adivinar separadores ni decimales.
    const esperado = `$${fmtCurrency(cotizacion.subtotal)}`
    await expect(subtotal(pageA)).toHaveText(esperado, { timeout: 30_000 })
    await expect(subtotal(pageB)).toHaveText(esperado, { timeout: 30_000 })
  })

  test('estar en una sección la señala pero no impide que el otro escriba en ella', async () => {
    test.setTimeout(120_000)

    // A se queda dentro de "Datos generales" (el foco NO se suelta en toda la prueba).
    const proyectoA = pageA.locator('input[placeholder="Nombre del proyecto"]')
    const nuevoProyecto = `Proyecto renombrado por A ${Date.now()}`
    await proyectoA.click()
    await proyectoA.fill(nuevoProyecto)

    // B ve el aviso de que alguien más está en la sección...
    await expect(pageB.getByText(/está editando esta sección/).first()).toBeVisible({ timeout: 30_000 })

    // ...y recibe el cambio de A sin recargar.
    await expect(pageB.locator('input[placeholder="Nombre del proyecto"]')).toHaveValue(nuevoProyecto, { timeout: 30_000 })

    // Antes esto no se guardaba: si otro tenía la sección, B no tomaba el lock y su
    // autoguardado -que lo exigía- nunca se disparaba.
    const locacionB = pageB.locator('input[placeholder="Lugar del evento"]')
    await locacionB.click()
    await locacionB.fill('Foro 3 escrito por B')
    await locacionB.blur()

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return { proyecto: cotizacion.proyecto, locacion: cotizacion.locacion }
    }, { timeout: 30_000 }).toEqual({ proyecto: nuevoProyecto, locacion: 'Foro 3 escrito por B' })
  })

  test('cambiar el fee en una pantalla actualiza los totales de la otra', async () => {
    test.setTimeout(120_000)

    const feeA = pageA.locator('input[type="number"][max="100"]')
    await feeA.click()
    await feeA.fill('20')
    await feeA.blur()

    await expect(pageB.locator('input[type="number"][max="100"]')).toHaveValue('20.0', { timeout: 30_000 })

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.porcentaje_fee
    }, { timeout: 30_000 }).toBeCloseTo(0.2, 5)
  })

  /**
   * La prueba del diseño, no de un síntoma: con el canal en tiempo real CAÍDO -ningún
   * aviso llega ni sale- la pantalla tiene que terminar viendo lo mismo igual.
   *
   * Es lo que antes no se cumplía: el estado ajeno viajaba solo empujado por el otro
   * navegador, con el error tragado, así que un aviso perdido dejaba las dos pantallas
   * distintas hasta recargar. Si este test pasa, esa clase entera de fallos -incluida
   * la fila que no aparecía- deja de poder ocurrir en silencio.
   */
  test('con el canal en tiempo real caído, la otra pantalla converge igual', async ({ browser }) => {
    test.setTimeout(180_000)

    const contextC = await browser.newContext()
    const pageC = await contextC.newPage()
    // Se intercepta el WebSocket y no se conecta a nadie: esta pantalla nunca va a
    // recibir un solo aviso.
    await pageC.routeWebSocket(/realtime/, () => {})

    try {
      await login(pageC, `/cotizaciones/${cotizacionId}`, { email: USUARIO_B.email, password: USUARIO_B.password })
      await expect(filas(pageC)).toHaveCount(await filas(pageA).count(), { timeout: 30_000 })

      const marcaUnica = `Sin canal ${Date.now()}`
      const descripcionA = celda(pageA, 0, COL.descripcion)
      await descripcionA.click()
      await descripcionA.fill(marcaUnica)
      await descripcionA.blur()

      await expect
        .poll(async () => (await leerCotizacionDelServidor(cotizacionId)).items[0].descripcion, { timeout: 30_000 })
        .toBe(marcaUnica)

      // Sin avisos, la única vía posible es la reconciliación contra el servidor.
      await expect(
        celda(pageC, 0, COL.descripcion),
        'la pantalla sin canal nunca se puso al día: la convergencia sigue dependiendo de que llegue el aviso'
      ).toHaveValue(marcaUnica, { timeout: 60_000 })
    } finally {
      await contextC.close()
    }
  })

  test('las notas del evento se sincronizan entre los dos colaboradores', async () => {
    test.setTimeout(120_000)

    const notaA = `Nota escrita por A ${Date.now()}`
    // Bloque 2 sub-tarea 8: "Nota de evento" ahora vive en un pop-up -- abrirlo
    // antes de tocar el textarea, en ambas páginas.
    await pageA.getByRole('button', { name: 'Nota de evento' }).click()
    const notasA = pageA.locator('textarea[placeholder="Sin notas..."]')
    await notasA.click()
    await notasA.fill(notaA)
    await notasA.blur()

    await pageB.getByRole('button', { name: 'Nota de evento' }).click()
    await expect(pageB.locator('textarea[placeholder="Sin notas..."]')).toHaveValue(notaA, { timeout: 30_000 })

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.notas_internas
    }, { timeout: 30_000 }).toBe(notaA)
  })

  // Fase 8 (hardening pre-Proyectos): las 3 pruebas que siguen son las que la
  // auditoría de colaboración marcó como faltantes -- hasta ahora esta suite
  // solo probaba campos DISTINTOS editados a la vez, nunca un conflicto real
  // por el MISMO campo, ni el camino de Generar/Aprobar bajo edición ajena
  // concurrente.

  test('mismo campo editado por A y B a la vez: el segundo ve el conflicto real, no un overwrite silencioso', async () => {
    test.setTimeout(60_000)

    const precioA = celda(pageA, 0, COL.precio)
    const precioB = celda(pageB, 0, COL.precio)

    // Ambos enfocan el MISMO campo antes de que nadie lo haya tocado -- capturan
    // el mismo "base" (1000, el precio con el que se creó la partida).
    await precioA.click()
    await precioB.click()

    const valorA = '4321'
    const valorB = '8765'

    await precioA.fill(valorA)
    await precioA.blur()

    // A debe quedar confirmado en el servidor antes de que B intente guardar con
    // su base ya vieja -- así el conflicto es determinista, no una carrera real.
    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items[0].precio_unitario
    }, { timeout: 20_000 }).toBe(Number(valorA))

    await precioB.fill(valorB)
    await precioB.blur()

    // Acotado a la fila 0: el banner de conflicto es por-celda (ver
    // ItemFieldConflictBanner), así que un `getByText` de página completa
    // también matchearía el banner de OTRA fila si quedó uno sin resolver de
    // un test anterior -- "strict mode violation" real visto en CI.
    const banner = filas(pageB).nth(0).getByText(/Alguien más lo cambió a/)
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(banner).toContainText(valorA)

    // El valor de A sigue mandando -- B no lo pisó en silencio con su 409.
    const cotizacionTrasConflicto = await leerCotizacionDelServidor(cotizacionId)
    expect(cotizacionTrasConflicto.items[0].precio_unitario).toBe(Number(valorA))

    await pageB.getByRole('button', { name: new RegExp(`Usar\\s+"${valorA}"`) }).click()
    await expect(banner).toBeHidden()
    await expect(precioB).toHaveValue(valorA)
  })

  test('seleccionar producto (autofill) mientras otro edita precio a mano: nunca queda un estado parcial', async () => {
    test.setTimeout(60_000)

    const descripcionB = celda(pageB, 1, COL.descripcion)
    const precioA = celda(pageA, 1, COL.precio)

    // El dropdown de sugerencias es position:fixed, con su posición calculada
    // en `onFocus` (updateDropdownPos) y NUNCA recalculada en `onChange`. Un
    // `.click()` antes de scrollear enfoca el input en la posición VIEJA
    // (pre-scroll); el `scrollIntoView` posterior mueve la fila pero nada
    // vuelve a pedir la posición nueva (el listener de scroll solo actualiza
    // dropdowns que ya están abiertos), así que el `.fill()` de después abre
    // el dropdown en coordenadas obsoletas -- nunca aparece donde Playwright
    // lo busca ("element(s) not found" real visto en CI, dos rondas). Mismo
    // patrón ya probado en cotizaciones-editar.spec.ts (critical): scrollear
    // ANTES de cualquier foco, y dejar que `.fill()` enfoque una sola vez, ya
    // en la posición final.
    await descripcionB.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await descripcionB.fill('Grúa E2E Fase8')

    // Diagnóstico (Fase 8.7.2): este test ya falló en runs previos de CI con
    // el mismo síntoma (la sugerencia nunca aparece) pese a que la creación
    // del producto ya pasa por el POST real (para que su propia invalidación
    // de caché corra) -- ver el comentario en el `beforeAll`. Antes de asumir
    // que es un problema de timing/UI, consultar el mismo endpoint desde la
    // sesión real de B distingue si el producto ya llegó al servidor/caché
    // que ve B (problema de UI si SÍ aparece acá) o si nunca llegó (problema
    // de caché/datos si NO aparece).
    const diagProductos = await pageB.request.get('/api/productos?q=')
    const diagBody = await diagProductos.json().catch(() => null)
    const diagIncluyeProducto = Array.isArray(diagBody) && diagBody.some(
      (p: { descripcion?: string }) => p.descripcion === PRODUCTO_AUTOFILL.descripcion
    )
    console.log(
      `[live colab][diag] GET /api/productos?q= (sesión de B) status=${diagProductos.status()} ` +
      `total=${Array.isArray(diagBody) ? diagBody.length : 'n/a'} incluyeProductoAutofill=${diagIncluyeProducto}`
    )

    // El filtrado de sugerencias es 100% client-side contra un catálogo que
    // `useQuotationForm` carga en un `requestIdleCallback` (hasta 1.5s de
    // demora) -- nada que ver con la carrera que este test quiere probar.
    // Esperar a que la sugerencia esté visible antes de arrancar el
    // Promise.all deja la carrera real acotada a la única parte que importa:
    // la confirmación del servidor de precioA vs. el click del autofill, con
    // el dropdown de B ya listo (queda abierto, sin clickear todavía).
    const sugerencia = pageB.getByText(PRODUCTO_AUTOFILL.descripcion, { exact: true })
    await expect(sugerencia).toBeVisible({ timeout: 15_000 })

    const nuevoPrecioA = '9999'
    await Promise.all([
      (async () => { await precioA.click(); await precioA.fill(nuevoPrecioA); await precioA.blur() })(),
      sugerencia.click(),
    ])

    // Esperar a que ambas operaciones asienten (éxito o conflicto, cualquiera).
    await pageA.waitForTimeout(2_000)

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    const item = cotizacion.items[1]
    const productoAplicado = item.descripcion === PRODUCTO_AUTOFILL.descripcion

    if (productoAplicado) {
      // El autofill de B ganó la carrera y se aplicó -- atómico: los 4 campos
      // deben ser consistentes entre sí (todos del producto), nunca una mezcla.
      expect(item.precio_unitario).toBe(PRODUCTO_AUTOFILL.precio_unitario)
    } else {
      // El autofill de B fue rechazado por conflicto (precio ya no coincidía
      // con su "base") -- el precio de A manda, y NINGÚN campo del producto se
      // aplicó a medias.
      expect(item.precio_unitario).toBe(Number(nuevoPrecioA))
      expect(item.descripcion).not.toBe(PRODUCTO_AUTOFILL.descripcion)
    }

    // Fase 8.7 (Bloque 1): un conflicto sin resolver ahora bloquea cualquier
    // transición posterior (Generar/Aprobar) -- flushPendingSaves fuerza y
    // reintenta cualquier celda todavía marcada dirty, incluida una con un
    // conflicto abandonado (nunca se limpia de itemDirtyCellsRef mientras no
    // se resuelva). Como este describe.serial reutiliza las mismas dos
    // páginas para todos los tests, el lado que perdió la carrera (A o B,
    // cualquiera de los 4 campos del producto) puede quedar con un banner sin
    // resolver que arrastraría el bloqueo hasta el siguiente test ("generar
    // cotización..."). Se resuelve aquí, igual que ya hace el test anterior
    // con su propio conflicto -- sin esto, un test que no tiene nada que ver
    // fallaría por un timeout sin relación aparente.
    for (const page of [pageA, pageB]) {
      for (let intentos = 0; intentos < 6; intentos += 1) {
        const usarBoton = page.getByRole('button', { name: /^Usar\s+"/ }).first()
        if (!(await usarBoton.isVisible().catch(() => false))) break
        await usarBoton.click()
        await page.waitForTimeout(200)
      }
    }
  })

  test('generar cotización mientras otro colaborador edita una partida no revierte su cambio', async () => {
    test.setTimeout(90_000)

    // B empieza a editar una partida (sin soltar el foco todavía) justo antes de
    // que A pulse "Generar Cotización" -- el PATCH de B puede seguir en vuelo,
    // o recién confirmado, cuando A dispara la transición de estado.
    const descripcionB = celda(pageB, 2, COL.descripcion)
    const nuevaDescripcion = `Descripción B Fase8 ${Date.now()}`
    await descripcionB.click()
    await descripcionB.fill(nuevaDescripcion)

    await Promise.all([
      descripcionB.blur(),
      pageA.getByRole('button', { name: 'Generar Cotización' }).click(),
    ])

    // La transición de estado confirma que "Generar" sí corrió de punta a punta
    // (PDF generado, botones cambian a Aprobar/Cancelar).
    await expect(pageA.getByRole('button', { name: 'Aprobar Cotización' })).toBeVisible({ timeout: 60_000 })

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    expect(cotizacion.estado).toBe('EMITIDA')
    // El punto central de la Fase 8: el cambio de B NO se revirtió. Antes de este
    // fix, "Generar Cotización" mandaba un PUT completo con el snapshot que A
    // tenía en memoria, y podía pisar justo esta edición.
    expect(cotizacion.items[2].descripcion).toBe(nuevaDescripcion)
  })

  test('aprobar mientras otro colaborador edita una partida no revierte su cambio ni deja proyecto/cuentas a medias', async () => {
    test.setTimeout(90_000)

    // Mismo patrón que el test de Generar de arriba (Fase 8.7 Bloque 3): B sigue
    // escribiendo (sin soltar el foco) justo cuando A pulsa "Aprobar Cotización" --
    // el PATCH de B puede seguir en vuelo, o recién confirmado, cuando A dispara
    // approve_cotizacion. Se usa la fila 1 ("Partida dos"), no la 2 que ya usó y
    // verificó el test de Generar, para no pisar esa aserción.
    const descripcionB = celda(pageB, 1, COL.descripcion)
    const nuevaDescripcion = `Descripción B Aprobar Fase8 ${Date.now()}`
    await descripcionB.click()
    await descripcionB.fill(nuevaDescripcion)

    await Promise.all([
      descripcionB.blur(),
      pageA.getByRole('button', { name: 'Aprobar Cotización' }).click(),
    ])

    // Misma señal de "corrió de punta a punta" que usa el test crítico mockeado de
    // Aprobar (tests/e2e/critical/cotizaciones-aprobar.spec.ts).
    await expect(pageA.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible({ timeout: 60_000 })

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    expect(cotizacion.estado).toBe('APROBADA')
    expect(cotizacion.items[1].descripcion).toBe(nuevaDescripcion)

    const { proyecto, cuentasPagar, cuentaCobrar } = await leerProyectoYCuentasDelServidor(cotizacionId)
    expect(proyecto).toBeTruthy()
    expect(cuentaCobrar).toBeTruthy()
    // Invariante real, no un conteo fijo: el estado acumulado de x_pagar por item
    // varía según los tests anteriores de este describe.serial -- lo que importa es
    // que cada partida con x_pagar > 0 tenga su fila en cuentas_pagar, ni de más ni
    // de menos.
    const itemsConXPagar = cotizacion.items.filter((item) => item.x_pagar > 0).length
    expect(cuentasPagar).toHaveLength(itemsConXPagar)
  })

  // Fase 8.7.1: la auditoría sobre 8.7 encontró que ninguna escritura de
  // partidas revisaba el `estado` de la cotización dueña -- se podía seguir
  // modificando, creando, borrando o importando partidas de una cotización ya
  // APROBADA, sin ningún rechazo. El test anterior deja `cotizacionId` en
  // APROBADA; este reusa ese mismo estado (nada que preparar) para probar el
  // guard directo contra la API real, no contra un mock.
  test('editar una partida de una cotización ya APROBADA se rechaza, sin tocar nada', async () => {
    test.setTimeout(30_000)

    const antes = await leerCotizacionDelServidor(cotizacionId)
    expect(antes.estado).toBe('APROBADA')
    const item = antes.items[0]

    const response = await pageB.request.patch(`/api/cotizaciones/${cotizacionId}/items/${item.id}`, {
      data: { descripcion: `Intento tardío post-aprobación ${Date.now()}` },
    })

    expect(response.status()).toBe(409)
    const body = await response.json() as { error?: string; estado_actual?: string }
    expect(body.error).toBe('estado_invalido')
    expect(body.estado_actual).toBe('APROBADA')

    // Nada cambió: ni la partida ni el estado.
    const despues = await leerCotizacionDelServidor(cotizacionId)
    expect(despues.estado).toBe('APROBADA')
    expect(despues.items[0].descripcion).toBe(item.descripcion)
  })

  // El test de arriba ("aprobar mientras otro colaborador edita...") prueba UN
  // orden -- el favorable, donde la edición de B gana. La auditoría señaló
  // exactamente este punto: "una prueba live verde con un orden favorable no
  // demuestra que todos los órdenes concurrentes sean seguros". Este test
  // dispara Aprobar y un PATCH concurrente de verdad (sin forzar quién gana,
  // vía `Promise.all` contra la API real) y verifica la invariante que debe
  // sostenerse sea cual sea el ganador: la cotización queda APROBADA con
  // exactamente un snapshot -- o el de B si su PATCH se confirmó antes de que
  // `approve_cotizacion` leyera `items_cotizacion`, o el previo si Aprobar
  // ganó y el PATCH tardío se rechazó -- nunca una mezcla, y `cuentas_pagar`
  // siempre corresponde al snapshot final. Usa su propia cotización (no la
  // compartida del describe.serial) porque ya se aprobó arriba y no se puede
  // volver a correr la carrera sobre la misma.
  test('aprobar y editar una partida al mismo tiempo: cualquier orden deja cotización, proyecto y cuentas consistentes entre sí', async () => {
    test.setTimeout(60_000)

    const suffix = Date.now()
    const raceId = await crearCotizacion(pageA, `${PREFIJO}RACE-${suffix}`, `Race ${suffix}`, [
      { descripcion: 'Partida race', precio: 8000 },
    ])

    try {
      const inicial = await leerCotizacionDelServidor(raceId)
      const itemId = inicial.items[0].id
      // x_pagar > 0 para que approve_cotizacion también cree una cuenta por
      // pagar -- si no, la invariante de abajo (cuentasPagar.length ===
      // itemsConXPagar) sería trivialmente 0 = 0 y no probaría nada.
      const setXPagar = await pageA.request.patch(`/api/cotizaciones/${raceId}/items/${itemId}`, { data: { x_pagar: 3000 } })
      expect(setXPagar.ok(), await setXPagar.text()).toBeTruthy()

      const emitirResponse = await pageA.request.post(`/api/cotizaciones/${raceId}/emitir`)
      expect(emitirResponse.ok(), await emitirResponse.text()).toBeTruthy()

      const nuevaDescripcion = `Descripción tardía race ${suffix}`
      const [aprobarResponse, patchResponse] = await Promise.all([
        pageA.request.post(`/api/cotizaciones/${raceId}/aprobar`),
        pageB.request.patch(`/api/cotizaciones/${raceId}/items/${itemId}`, { data: { descripcion: nuevaDescripcion } }),
      ])

      expect(aprobarResponse.ok(), await aprobarResponse.text()).toBeTruthy()

      const final = await leerCotizacionDelServidor(raceId)
      expect(final.estado).toBe('APROBADA')

      const { proyecto, cuentasPagar, cuentaCobrar } = await leerProyectoYCuentasDelServidor(raceId)
      expect(proyecto).toBeTruthy()
      expect(cuentaCobrar).toBeTruthy()

      if (patchResponse.ok()) {
        // B ganó: su PATCH se confirmó antes de que approve_cotizacion leyera
        // items_cotizacion, así que el snapshot aprobado ya lo incluye.
        expect(final.items[0].descripcion).toBe(nuevaDescripcion)
      } else {
        // Aprobar ganó: el PATCH tardío de B se rechazó explícito (409,
        // estado_invalido) en vez de aplicarse a una cotización ya no editable.
        expect(patchResponse.status()).toBe(409)
        const body = await patchResponse.json() as { error?: string }
        expect(body.error).toBe('estado_invalido')
        expect(final.items[0].descripcion).not.toBe(nuevaDescripcion)
      }

      // Invariante real sea cual sea el ganador: cuentas_pagar corresponde
      // exactamente al snapshot de items_cotizacion que quedó vigente --
      // nunca calculado de una versión distinta a la que terminó aprobada.
      const itemsConXPagar = final.items.filter((item) => item.x_pagar > 0).length
      expect(cuentasPagar).toHaveLength(itemsConXPagar)
    } finally {
      await cleanupLiveCotizacion(raceId).catch((e) => console.error('[live colab] cleanup race:', e))
    }
  })
})

/**
 * Fase 8.7.2: valida el drenado real por celda, el refresco de `base` tras
 * cada PATCH exitoso, y que Totales se recalcule sin recargar -- contra el
 * servidor real, no mockeado. Cotización propia, para no interferir con el
 * describe de arriba.
 */
test.describe('live: colaboración real -- causas E-I (Fase 8.7.2)', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  let contextA: BrowserContext
  let contextB: BrowserContext
  let pageA: Page
  let pageB: Page
  let cotizacionId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000)

    await cleanupLiveCotizacionesByPrefix(`${PREFIJO}872-`).catch((e) => console.error('[live 8.7.2] barrido inicial:', e))
    await ensureLiveUser(USUARIO_B)

    const suffix = Date.now()

    contextA = await browser.newContext()
    pageA = await contextA.newPage()
    vigilarErrores(pageA, 'A')
    await login(pageA, '/cotizaciones')

    cotizacionId = await crearCotizacion(pageA, `${PREFIJO}872-${suffix}`, `Fase872 ${suffix}`, [
      { descripcion: 'Partida E-I uno', precio: 1000 },
      { descripcion: 'Partida E-I dos', precio: 2000 },
      { descripcion: 'Partida E-I tres', precio: 3000 },
    ])

    contextB = await browser.newContext()
    pageB = await contextB.newPage()
    vigilarErrores(pageB, 'B')
    await login(pageB, '/cotizaciones', { email: USUARIO_B.email, password: USUARIO_B.password })

    await pageA.goto(`/cotizaciones/${cotizacionId}`)
    await pageB.goto(`/cotizaciones/${cotizacionId}`)
    await expect(filas(pageA)).toHaveCount(3, { timeout: 30_000 })
    await expect(filas(pageB)).toHaveCount(3, { timeout: 30_000 })

    await esperarCanalColaborativo([
      { page: pageA, veA: NOMBRE_CORTO_B },
      { page: pageB },
    ])
  })

  test.afterAll(async () => {
    await contextA?.close()
    await contextB?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live 8.7.2] cleanup:', e))
    await cleanupLiveCotizacionesByPrefix(`${PREFIJO}872-`).catch((e) => console.error('[live 8.7.2] barrido final:', e))
    await cleanupLiveUser(USUARIO_B.email).catch((e) => console.error('[live 8.7.2] cleanup usuario B:', e))
  })

  test('causa E: editar la misma celda dos veces seguidas sin blur, con pausa larga entre ambas, no produce un conflicto contra uno mismo', async () => {
    test.setTimeout(60_000)
    const precioA = celda(pageA, 0, COL.precio)

    await precioA.click()
    await precioA.fill('1500')
    // Deja pasar el debounce (800ms) + tiempo de sobra para que el primer
    // autoguardado confirme en el servidor ANTES de seguir editando -- el
    // escenario exacto de causa E: `itemCellBaseRef` debía refrescarse al
    // valor recién confirmado; si no, la SEGUNDA edición manda un `base` ya
    // viejo y el servidor la rechaza con un 409 contra el propio usuario.
    await pageA.waitForTimeout(2_000)
    await precioA.fill('1750')
    await precioA.blur()

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items[0].precio_unitario
    }, { timeout: 20_000 }).toBe(1750)

    await expect(pageA.getByText(/Alguien más lo cambió a/)).toBeHidden()
  })

  test('causa F: escribir de nuevo en la misma celda mientras el PATCH anterior sigue en vuelo manda un segundo PATCH con el valor final, sin 409', async () => {
    test.setTimeout(60_000)
    const precioA = celda(pageA, 0, COL.precio)
    const patronRuta = '**/api/cotizaciones/*/items/*'

    // Respuestas de PATCH observadas, identificadas por el precio que llevaba
    // su propio body -- nunca por orden de llegada. Con la ruta retrasando el
    // primer PATCH 1.5s, un `waitForResponse` genérico registrado antes de
    // que salga el segundo PATCH puede resolverse contra la respuesta del
    // PRIMERO -- ambos matchean el mismo patrón de URL/método.
    const respuestas: { precio: number; status: number }[] = []
    const onResponse = async (response: Response) => {
      const request = response.request()
      if (request.method() !== 'PATCH' || !response.url().includes('/items/')) return
      let body: { precio_unitario?: number } | null = null
      try {
        body = request.postDataJSON() as { precio_unitario?: number } | null
      } catch (e) {
        console.log(`[live colab][diag causa F] postDataJSON() falló: ${e instanceof Error ? e.message : e} -- raw: ${request.postData()}`)
      }
      // Diagnóstico: loguear CADA PATCH visto a esta celda, tenga o no
      // precio_unitario reconocible -- si el segundo PATCH nunca aparece acá
      // tampoco, no llegó a salir del navegador; si aparece con otra forma,
      // el bug es de forma/parseo, no de que nunca se mandó.
      console.log(`[live colab][diag causa F] PATCH ${response.url()} status=${response.status()} body=${request.postData()}`)
      const precio = body?.precio_unitario
      if (typeof precio === 'number') {
        respuestas.push({ precio, status: response.status() })
      }
    }
    pageA.on('response', onResponse)

    // Diagnóstico adicional: loguear cuando el navegador DISPARA el PATCH,
    // no solo cuando llega su respuesta -- si el segundo PATCH nunca sale
    // del cliente (el bug estaría en el drenado de React, no en la red),
    // esto lo muestra aunque nunca llegue a `onResponse`.
    const onRequest = (request: import('@playwright/test').Request) => {
      if (request.method() !== 'PATCH' || !request.url().includes('/items/')) return
      console.log(`[live colab][diag causa F] PATCH disparado -> ${request.url()} body=${request.postData()}`)
    }
    pageA.on('request', onRequest)

    let firstPatchDelayed = false
    const delayedPatchHandler: Parameters<typeof pageA.route>[1] = async (route) => {
      if (!firstPatchDelayed && route.request().method() === 'PATCH') {
        firstPatchDelayed = true
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
      await route.continue()
    }
    await pageA.route(patronRuta, delayedPatchHandler)

    try {
      await precioA.click()
      await precioA.fill('2100')
      await precioA.blur() // dispara el primer PATCH -- el handler de arriba lo mantiene en vuelo 1.5s
      await pageA.waitForTimeout(300) // asegura que el primer PATCH ya salió antes de seguir
      await precioA.click()
      await precioA.fill('2200')
      await precioA.blur() // segunda edición mientras el primer PATCH sigue en vuelo

      // Esperar y validar AMBAS respuestas por su contenido, no solo su
      // llegada -- las dos deben resolver en 200, nunca en 409.
      await expect.poll(() => respuestas.find((r) => r.precio === 2100)?.status, { timeout: 20_000 }).toBe(200)
      await expect.poll(() => respuestas.find((r) => r.precio === 2200)?.status, { timeout: 20_000 }).toBe(200)
    } finally {
      // El handler retrasado ya llamó route.continue() en ambas peticiones
      // para este punto (las dos respuestas ya llegaron) -- retirar la ruta
      // y el listener acá, nunca antes, evita el "Route is already handled!"
      // de desregistrar mientras una petición seguía en vuelo. unroute con
      // la función exacta, no el patrón a secas, para no arrastrar handlers
      // de otros tests/beforeEach sobre el mismo patrón.
      await pageA.unroute(patronRuta, delayedPatchHandler)
      pageA.off('response', onResponse)
      pageA.off('request', onRequest)
    }

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items[0].precio_unitario
    }, { timeout: 20_000 }).toBe(2200)

    await expect(pageA.getByText(/Alguien más lo cambió a/)).toBeHidden()
  })

  test('causa I: agregar una fila y escribir en ella antes de que el alta confirme no dispara un 409 contra uno mismo', async () => {
    test.setTimeout(60_000)
    const descripcionNueva = `Partida creada y editada de inmediato ${Date.now()}`

    await pageA.getByRole('button', { name: 'Agregar fila' }).click()
    const filaNueva = filas(pageA).last()
    const descripcionInput = filaNueva.locator('td').nth(COL.descripcion).locator('input')
    await descripcionInput.click()
    await descripcionInput.fill(descripcionNueva)
    await descripcionInput.blur()

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.items.some((item) => item.descripcion === descripcionNueva)
    }, { timeout: 20_000 }).toBe(true)

    await expect(pageA.getByText(/Alguien más lo cambió a/)).toBeHidden()

    // Diagnóstico de CI (2026-09-12): esta prueba solo confirmaba la fila en
    // el servidor y en A -- nunca esperaba a que B (la otra pestaña) también
    // convergiera vía Realtime antes de terminar. El siguiente test (causa H)
    // captura su "antes" contando filas en B; si B todavía no había recibido
    // esta fila nueva, ese "antes" quedaba desactualizado por una fila y el
    // conteo final del siguiente test aparecía uno de más (flake
    // intermitente, no una regresión de producto).
    await expect(filas(pageB)).toHaveCount(await filas(pageA).count(), { timeout: 20_000 })
  })

  test('causa H: agregar una fila y llenar su precio actualiza Subtotal en ambas pantallas sin recargar', async () => {
    test.setTimeout(60_000)
    const antes = await filas(pageB).count()
    const cotizacionAntes = await leerCotizacionDelServidor(cotizacionId)

    await pageB.getByRole('button', { name: 'Agregar fila' }).click()
    await expect(filas(pageB)).toHaveCount(antes + 1, { timeout: 30_000 })
    const precioNuevo = celda(pageB, antes, COL.precio)
    await precioNuevo.click()
    await precioNuevo.fill('999')
    await precioNuevo.blur()

    await expect.poll(async () => {
      const cotizacion = await leerCotizacionDelServidor(cotizacionId)
      return cotizacion.subtotal
    }, { timeout: 20_000 }).toBe(cotizacionAntes.subtotal + 999)

    const cotizacionFinal = await leerCotizacionDelServidor(cotizacionId)
    const esperado = `$${fmtCurrency(cotizacionFinal.subtotal)}`
    // Causa H: antes de este fix, `itemsParaTotales` unía por `fields[i].id`
    // -- la key interna de react-hook-form, no el id de negocio -- así que
    // una fila agregada vía `append()` (el botón de arriba) nunca entraba al
    // cálculo hasta recargar la página completa. Se verifica SIN reload en
    // ninguna de las dos pantallas.
    await expect(subtotal(pageA)).toHaveText(esperado, { timeout: 30_000 })
    await expect(subtotal(pageB)).toHaveText(esperado, { timeout: 30_000 })
  })

  test('alta concurrente de fila por A y B no mezcla campos entre filas ni deja Totales mal', async () => {
    test.setTimeout(60_000)
    const antes = await filas(pageA).count()

    await Promise.all([
      pageA.getByRole('button', { name: 'Agregar fila' }).click(),
      pageB.getByRole('button', { name: 'Agregar fila' }).click(),
    ])

    await expect(filas(pageA)).toHaveCount(antes + 2, { timeout: 30_000 })
    await expect(filas(pageB)).toHaveCount(antes + 2, { timeout: 30_000 })

    const cotizacion = await leerCotizacionDelServidor(cotizacionId)
    expect(cotizacion.items).toHaveLength(antes + 2)
    const ids = new Set(cotizacion.items.map((item) => item.id))
    expect(ids.size).toBe(cotizacion.items.length)

    const esperado = `$${fmtCurrency(cotizacion.subtotal)}`
    await expect(subtotal(pageA)).toHaveText(esperado, { timeout: 30_000 })
    await expect(subtotal(pageB)).toHaveText(esperado, { timeout: 30_000 })
  })
})

/**
 * Reporte manual en TEST-EF1-VERIFY (2026-09-12): alternar el switch de IVA
 * en Totales disparaba un falso "Alguien más lo cambió a..." sin que nadie
 * más editara la cotización -- la misma causa F que Fase 8.7.2 ya había
 * resuelto para partidas (`itemCellDrainRef`/`itemCellRetryNeededRef`), pero
 * nunca portada a Totales/General: `sendTotalsFieldPatchRound`/
 * `sendGeneralFieldPatchRound` limpiaban su dirty en cuanto SU ronda
 * resolvía, sin ver que ya había un reintento encolado con un valor más
 * nuevo -- ese reintento entonces mandaba un PATCH con un "base" ya viejo y
 * chocaba contra sí mismo. El fix agrega el mismo drenado real
 * (`generalFieldDrainRef`/`totalsFieldDrainRef` + sus `RetryNeeded`) y
 * refresca el "base" en cada ronda exitosa (causa E, también portada).
 */
test.describe('live: colaboración real -- drenado real en Totales y General (fix conflicto falso de IVA)', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')

  let context: BrowserContext
  let page: Page
  let cotizacionId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000)
    await cleanupLiveCotizacionesByPrefix(`${PREFIJO}DRAIN-`).catch((e) => console.error('[live drain] barrido inicial:', e))

    context = await browser.newContext()
    page = await context.newPage()
    vigilarErrores(page, 'drain')
    await login(page, '/cotizaciones')

    const suffix = Date.now()
    cotizacionId = await crearCotizacion(page, `${PREFIJO}DRAIN-${suffix}`, `Drain ${suffix}`, [
      { descripcion: 'Partida drenado uno', precio: 1000 },
    ])

    await page.goto(`/cotizaciones/${cotizacionId}`)
    await expect(filas(page)).toHaveCount(1, { timeout: 30_000 })
  })

  test.afterAll(async () => {
    await context?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live drain] cleanup:', e))
    await cleanupLiveCotizacionesByPrefix(`${PREFIJO}DRAIN-`).catch((e) => console.error('[live drain] barrido final:', e))
  })

  test('Totales: alternar el switch de IVA mientras el PATCH anterior sigue en vuelo no produce un conflicto contra uno mismo', async () => {
    test.setTimeout(30_000)
    const rutaTotales = `**/api/cotizaciones/${cotizacionId}/totales`
    const ivaToggle = page.locator('span', { hasText: 'IVA (16%)' }).locator('button')

    // Identificadas por el valor que lleva el propio body del PATCH, no por
    // orden de llegada -- mismo motivo que "causa F" de partidas: con el
    // primer PATCH retrasado, un `waitForResponse` genérico podría resolver
    // contra la respuesta equivocada.
    const respuestas: { ivaActivo: boolean; status: number }[] = []
    const onResponse = async (response: Response) => {
      const request = response.request()
      if (request.method() !== 'PATCH' || !response.url().includes('/totales')) return
      let body: { iva_activo?: boolean } | null = null
      try {
        body = request.postDataJSON() as { iva_activo?: boolean } | null
      } catch {
        // Diagnóstico solo -- si el body no es JSON parseable no hay nada que
        // registrar para este PATCH en particular.
      }
      if (typeof body?.iva_activo === 'boolean') respuestas.push({ ivaActivo: body.iva_activo, status: response.status() })
    }
    page.on('response', onResponse)

    let firstPatchDelayed = false
    const delayedHandler: Parameters<typeof page.route>[1] = async (route) => {
      if (!firstPatchDelayed && route.request().method() === 'PATCH') {
        firstPatchDelayed = true
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
      await route.continue()
    }
    await page.route(rutaTotales, delayedHandler)

    const ivaAntes = (await leerCotizacionDelServidor(cotizacionId)).iva_activo

    try {
      await ivaToggle.click() // marca dirty -> debounce de 800ms -> PATCH #1 (retrasado 1.5s)
      // Deja que el debounce dispare el primer PATCH y salga del navegador
      // antes de seguir -- el segundo click debe caer mientras ESE PATCH
      // sigue en vuelo, el escenario exacto que producía el conflicto falso.
      await page.waitForTimeout(900)
      await ivaToggle.click() // segundo toggle mientras el primer PATCH sigue en vuelo

      await expect.poll(() => respuestas.find((r) => r.ivaActivo === !ivaAntes)?.status, { timeout: 15_000 }).toBe(200)
      await expect.poll(() => respuestas.find((r) => r.ivaActivo === ivaAntes)?.status, { timeout: 15_000 }).toBe(200)
    } finally {
      await page.unroute(rutaTotales, delayedHandler)
      page.off('response', onResponse)
    }

    await expect.poll(async () => (await leerCotizacionDelServidor(cotizacionId)).iva_activo, { timeout: 15_000 }).toBe(ivaAntes)
    await expect(page.getByText(/Alguien más lo cambió a/)).toBeHidden()
  })

  test('General: editar Locación mientras el PATCH anterior sigue en vuelo no produce un conflicto contra uno mismo', async () => {
    test.setTimeout(30_000)
    const rutaGeneral = `**/api/cotizaciones/${cotizacionId}/general`
    const locacionInput = page.getByPlaceholder('Lugar del evento')

    const respuestas: { locacion: string; status: number }[] = []
    const onResponse = async (response: Response) => {
      const request = response.request()
      if (request.method() !== 'PATCH' || !response.url().includes('/general')) return
      let body: { locacion?: string } | null = null
      try {
        body = request.postDataJSON() as { locacion?: string } | null
      } catch {
        // Diagnóstico solo.
      }
      if (typeof body?.locacion === 'string') respuestas.push({ locacion: body.locacion, status: response.status() })
    }
    page.on('response', onResponse)

    let firstPatchDelayed = false
    const delayedHandler: Parameters<typeof page.route>[1] = async (route) => {
      if (!firstPatchDelayed && route.request().method() === 'PATCH') {
        firstPatchDelayed = true
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
      await route.continue()
    }
    await page.route(rutaGeneral, delayedHandler)

    try {
      await locacionInput.click()
      await locacionInput.fill('Foro A')
      await page.waitForTimeout(900) // deja salir el primer PATCH (retrasado 1.5s)
      await locacionInput.fill('Foro A y B')

      await expect.poll(() => respuestas.find((r) => r.locacion === 'Foro A')?.status, { timeout: 15_000 }).toBe(200)
      await expect.poll(() => respuestas.find((r) => r.locacion === 'Foro A y B')?.status, { timeout: 15_000 }).toBe(200)
    } finally {
      await page.unroute(rutaGeneral, delayedHandler)
      page.off('response', onResponse)
    }

    await expect.poll(async () => (await leerCotizacionDelServidor(cotizacionId)).locacion, { timeout: 15_000 }).toBe('Foro A y B')
    await expect(page.getByText(/Alguien más lo cambió a/)).toBeHidden()
  })
})

/**
 * Fase 8.7.2: el fix más importante de la auditoría externa -- un conflicto
 * "idéntico" (mismo valor final) se resolvía solo en el cliente, pero
 * `flushPendingSaves` seguía viendo la promesa CRUDA del PATCH (que rechaza
 * en cualquier 409) en vez de la semántica ya resuelta, y abortaba
 * Generar/Aprobar sin motivo real. Cotización dedicada porque este test SÍ
 * transiciona el estado.
 */
test.describe('live: conflicto idéntico no bloquea Generar Cotización', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')

  test('conflicto idéntico (mismo valor final) se resuelve solo y no bloquea Generar Cotización', async ({ browser }) => {
    test.setTimeout(120_000)

    await ensureLiveUser(USUARIO_B)
    const suffix = Date.now()

    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    vigilarErrores(pageA, 'A')
    await login(pageA, '/cotizaciones')

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    vigilarErrores(pageB, 'B')
    await login(pageB, '/cotizaciones', { email: USUARIO_B.email, password: USUARIO_B.password })

    const cotizacionId = await crearCotizacion(pageA, `${PREFIJO}872IDEM-${suffix}`, `Fase872Idem ${suffix}`, [
      { descripcion: 'Partida idéntica', precio: 4000 },
    ])

    try {
      await pageA.goto(`/cotizaciones/${cotizacionId}`)
      await pageB.goto(`/cotizaciones/${cotizacionId}`)
      await expect(filas(pageA)).toHaveCount(1, { timeout: 30_000 })
      await expect(filas(pageB)).toHaveCount(1, { timeout: 30_000 })
      await esperarCanalColaborativo([
        { page: pageA, veA: NOMBRE_CORTO_B },
        { page: pageB },
      ])

      const precioA = celda(pageA, 0, COL.precio)
      const precioB = celda(pageB, 0, COL.precio)
      const valorFinal = '9500'

      // Ambos enfocan el MISMO campo antes de que nadie lo haya tocado --
      // capturan el mismo "base" (4000, el precio original de esta fila).
      await precioA.click()
      await precioB.click()

      // B guarda primero y confirma en el servidor.
      await precioB.fill(valorFinal)
      await precioB.blur()
      await expect.poll(async () => {
        const cotizacion = await leerCotizacionDelServidor(cotizacionId)
        return cotizacion.items[0].precio_unitario
      }, { timeout: 20_000 }).toBe(Number(valorFinal))

      // A, con la base ya vieja (4000), intenta guardar EXACTAMENTE el mismo
      // valor final que B ya confirmó -- causa G: se resuelve solo, sin
      // banner.
      await precioA.fill(valorFinal)
      await precioA.blur()
      await pageA.waitForTimeout(1_500)
      await expect(pageA.getByText(/Alguien más lo cambió a/)).toBeHidden()

      // El punto central del fix: un conflicto ya auto-resuelto NO debe
      // bloquear Generar/Aprobar -- antes, `trackMutation` registraba la
      // promesa cruda del PATCH (rechazada) en vez de la semántica.
      await pageA.getByRole('button', { name: 'Generar Cotización' }).click()
      await expect(pageA.getByRole('button', { name: 'Aprobar Cotización' })).toBeVisible({ timeout: 60_000 })

      const cotizacionFinal = await leerCotizacionDelServidor(cotizacionId)
      expect(cotizacionFinal.estado).toBe('EMITIDA')
      expect(cotizacionFinal.items[0].precio_unitario).toBe(Number(valorFinal))
    } finally {
      await contextA.close()
      await contextB.close()
      await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live 8.7.2 idem] cleanup:', e))
      await cleanupLiveUser(USUARIO_B.email).catch((e) => console.error('[live 8.7.2 idem] cleanup usuario B:', e))
    }
  })
})
