type JsonLike = Record<string, unknown>

// Fase 1: Deduplicación de GET requests en vuelo — evita llamadas duplicadas simultáneas
const _inFlight = new Map<string, Promise<unknown>>()

// Fase 0: Logging de performance (solo en desarrollo, no impacta producción)
const _devLog = typeof window !== 'undefined' && process.env.NODE_ENV === 'development'

// EF-2 1B-2b: un 401 de staff (sesión invalidada por revocación, o nunca
// autenticado) dispara signOut() + redirect a /login desde un solo lugar,
// en vez de que cada página lo maneje distinto. El Portal de proveedores
// tiene su propia sesión y su propio manejo de 401 (ver lib/portal-auth.ts)
// -- sus rutas quedan explícitamente excluidas, un 401 de sesión de
// Portal vencida no debe desloguear al staff ni redirigir a su login.
let _sessionExpiredHandled = false

function _isStaffRoute(url: string): boolean {
  return !url.startsWith('/api/portal') && !url.startsWith('/api/auth')
}

async function handleUnauthorizedResponse(url: string): Promise<void> {
  if (typeof window === 'undefined') return
  if (!_isStaffRoute(url)) return
  if (_sessionExpiredHandled) return
  _sessionExpiredHandled = true

  try {
    const { signOut } = await import('next-auth/react')
    await signOut({ redirect: false })
  } catch (e) {
    console.error('[api] No se pudo cerrar la sesión tras un 401:', e)
  }

  const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `/login?callbackUrl=${callbackUrl}`
}

/**
 * Error de una respuesta no-OK. Extiende `Error` (el `message` es el mismo
 * de siempre) y agrega el status y el código de negocio (`{ error: 'codigo',
 * message }`), para las pantallas que reaccionan distinto a cada caso
 * (p. ej. `candidatos_cambiaron` recarga el preview de la orden, S2).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function apiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const data = await safeParseJson(response.clone())
  const code = typeof data?.error === 'string' && /^[a-z0-9_]+$/.test(data.error) ? data.error : null
  return new ApiError(await getApiErrorMessage(response, fallbackMessage), response.status, code)
}

async function safeParseJson(response: Response): Promise<JsonLike | null> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function getApiErrorMessage(response: Response, fallbackMessage: string) {
  if (response.status === 413) {
    return 'El archivo es demasiado pesado. Intenta con un comprobante menor a 4 MB.'
  }

  const data = await safeParseJson(response)
  const errorMessage = typeof data?.error === 'string' ? data.error : null
  // Rediseño de Cuentas B2: los errores esperados de negocio responden un
  // código ({ error: 'sin_proveedor', message: '…' }); al usuario se le
  // muestra el mensaje, no el código.
  if (errorMessage && /^[a-z0-9_]+$/.test(errorMessage) && typeof data?.message === 'string') return data.message
  return errorMessage || fallbackMessage
}

export async function getJson<T>(url: string, fallbackMessage: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method.toUpperCase() === 'GET'

  // La dedupe por URL asume que todos los callers de un mismo GET en vuelo
  // comparten el mismo ciclo de vida -- eso deja de ser cierto en cuanto
  // uno de ellos trae su propio AbortSignal (EF-3 3B-2: debounce +
  // cancelación de useCuentasCobrar): si dos llamadas al mismo URL
  // compartieran el fetch en vuelo, abortar la primera abortaría también
  // la segunda aunque su propio signal siga sin abortar. Un GET con
  // `signal` propio se excluye de la dedupe -- nunca comparte in-flight
  // con otro caller.
  if (isGet && !init?.signal) {
    // Reutilizar promise en vuelo si ya hay un GET idéntico en curso
    const existing = _inFlight.get(url)
    if (existing) return existing as Promise<T>

    const t0 = _devLog ? performance.now() : 0
    const promise = fetch(url, init)
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) await handleUnauthorizedResponse(url)
          throw await apiError(response, fallbackMessage)
        }
        return response.json() as T
      })
      .finally(() => {
        _inFlight.delete(url)
        if (_devLog) {
          console.log(`[perf] GET ${url} → ${Math.round(performance.now() - t0)}ms`)
        }
      })

    _inFlight.set(url, promise)
    return promise
  }

  // POST/PUT/DELETE (mutaciones únicas) o GET con su propio AbortSignal:
  // sin deduplicación.
  const response = await fetch(url, init)
  if (!response.ok) {
    if (response.status === 401) await handleUnauthorizedResponse(url)
    throw await apiError(response, fallbackMessage)
  }
  return response.json() as Promise<T>
}

export async function sendJson<T>(
  url: string,
  body: unknown,
  fallbackMessage: string,
  init?: Omit<RequestInit, 'body' | 'headers'> & { headers?: HeadersInit }
): Promise<T> {
  return getJson<T>(url, fallbackMessage, {
    method: init?.method ?? 'POST',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  })
}

export async function sendFormData<T>(
  url: string,
  formData: FormData,
  fallbackMessage: string,
  init?: Omit<RequestInit, 'body'>
): Promise<T> {
  return getJson<T>(url, fallbackMessage, {
    method: init?.method ?? 'POST',
    ...init,
    body: formData,
  })
}

export async function getArrayBuffer(url: string, fallbackMessage: string, init?: RequestInit): Promise<ArrayBuffer> {
  const response = await fetch(url, init)
  if (!response.ok) {
    if (response.status === 401) await handleUnauthorizedResponse(url)
    throw await apiError(response, fallbackMessage)
  }
  return response.arrayBuffer()
}
