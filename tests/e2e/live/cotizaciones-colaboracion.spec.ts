import { test, expect, BrowserContext, Locator, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupLiveProducto, cleanupOrphanedFolioReservations } from '../utils/live-cleanup'
import { esperarCanalColaborativo, faltantesDelEntornoLive, leerCotizacionDelServidor, liveEnabled } from '../utils/live-helpers'
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
    await ensureLiveUser(USUARIO_B)

    const suffix = Date.now()

    contextA = await browser.newContext()
    pageA = await contextA.newPage()
    vigilarErrores(pageA, 'A')
    await login(pageA, '/cotizaciones')

    // Fase 8: producto real para el conflicto autofill-vs-edición-manual (punto
    // B de la auditoría) -- necesita un producto de verdad en la tabla, no
    // mockeado. Se crea vía el POST real (no un upsert directo a Supabase):
    // GET /api/productos cachea 5 min en el servidor (CacheManager) y solo el
    // propio POST la invalida (`cache.invalidate('productos:')`); un insert
    // directo deja esa caché sirviendo la lista vieja el resto del job entero
    // si algún test anterior (basic.spec.ts, etc.) ya la calentó -- exactamente
    // lo que pasó en CI: el dropdown nunca aparecía, no por un problema de
    // timing sino porque el producto nunca llegaba al cliente.
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
    await filas(pageA).last().locator('td').last().locator('button').click()

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
    const notasA = pageA.locator('textarea[placeholder="Sin notas..."]')
    await notasA.click()
    await notasA.fill(notaA)
    await notasA.blur()

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
})
