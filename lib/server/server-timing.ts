/**
 * Server-Timing de una ruta (O1b): cuánto se fue en auth, RPC, derivación y
 * serialización. El navegador lo muestra en DevTools y el e2e live de
 * rendimiento lo registra junto al p95, para decidir con datos dónde está el
 * tiempo. Solo nombres de fase y milisegundos: no expone datos.
 */
export function crearTiempos() {
  const fases: [string, number][] = []
  let desde = performance.now()
  const marcar = (fase: string) => {
    const ahora = performance.now()
    fases.push([fase, ahora - desde])
    desde = ahora
  }
  return {
    marcar,
    /** Serializa el cuerpo (medido como fase `json`) y responde con el encabezado. */
    responder(body: unknown, init?: ResponseInit) {
      const texto = JSON.stringify(body)
      marcar('json')
      const headers = new Headers(init?.headers)
      headers.set('Content-Type', 'application/json')
      headers.set('Server-Timing', fases.map(([f, ms]) => `${f};dur=${ms.toFixed(1)}`).join(', '))
      return new Response(texto, { ...init, headers })
    },
  }
}
