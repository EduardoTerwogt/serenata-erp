import { test, expect, BrowserContext, Locator, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupOrphanedFolioReservations } from '../utils/live-cleanup'
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
function grabarFramesRealtime(page: Page, destino: string[]) {
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') destino.push(frame.payload)
    })
  })
}

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
  // Frames del canal de tiempo real que RECIBE B. Sirven para distinguir "el mensaje
  // nunca llegó" de "llegó y la pantalla no reaccionó", que se ven igual desde el DOM.
  const framesRecibidosPorB: string[] = []

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
    grabarFramesRealtime(pageB, framesRecibidosPorB)
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
    const idsAntes = new Set((await leerCotizacionDelServidor(cotizacionId)).items.map((item) => item.id))

    const descripcionB = celda(pageB, 1, COL.descripcion)
    await descripcionB.click()
    await descripcionB.fill('B sigue escribiendo aquí')

    await pageA.getByRole('button', { name: /Agregar fila/ }).click()

    // Los tres eslabones por separado: sin esto, un fallo aquí no distingue "A no
    // creó la fila" de "el servidor no la tiene" de "B no la recibió".
    await expect(filas(pageA), 'A no llegó a ver la fila que acaba de agregar').toHaveCount(antes + 1, { timeout: 30_000 })
    await expect
      .poll(async () => (await leerCotizacionDelServidor(cotizacionId)).items.length, { timeout: 30_000 })
      .toBe(antes + 1)

    const idNuevo = (await leerCotizacionDelServidor(cotizacionId)).items.find((item) => !idsAntes.has(item.id))?.id
    expect(idNuevo, 'el servidor no tiene ninguna partida nueva').toBeTruthy()

    // Primero el canal, luego la pantalla: si el mensaje no llega, el problema es la
    // difusión; si llega y la tabla no cambia, el problema es cómo se aplica.
    if (idNuevo) {
      try {
        await expect
          .poll(() => framesRecibidosPorB.filter((frame) => frame.includes(idNuevo)).length, { timeout: 20_000 })
          .toBeGreaterThan(0)
      } catch (error) {
        // Si el alta de A cayó en su catch, A repinta la fila desde el servidor y por
        // fuera se ve idéntico a un alta correcta -- salvo por este banner, que es la
        // única señal de que el aviso nunca se llegó a emitir.
        const banner = await pageA.locator('.text-cancelled-fg').first().textContent().catch(() => null)
        const mutaciones = framesRecibidosPorB.filter((frame) => frame.includes('item_mutation'))
        console.log(`[live colab] banner de error en A: ${banner?.trim() || '(ninguno)'}`)
        console.log(`[live colab] frames item_mutation recibidos por B: ${mutaciones.length}`)
        console.log(`[live colab] último item_mutation: ${mutaciones.at(-1)?.slice(0, 800) || '(ninguno)'}`)
        throw error
      }
    }

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
})
