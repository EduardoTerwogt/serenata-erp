type JsonLike = Record<string, unknown>

// Fase 1: Deduplicación de GET requests en vuelo — evita llamadas duplicadas simultáneas
const _inFlight = new Map<string, Promise<unknown>>()

// Fase 0: Logging de performance (solo en desarrollo, no impacta producción)
const _devLog = typeof window !== 'undefined' && process.env.NODE_ENV === 'development'

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
  return errorMessage || fallbackMessage
}

export async function getJson<T>(url: string, fallbackMessage: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method.toUpperCase() === 'GET'

  if (isGet) {
    // Reutilizar promise en vuelo si ya hay un GET idéntico en curso
    const existing = _inFlight.get(url)
    if (existing) return existing as Promise<T>

    const t0 = _devLog ? performance.now() : 0
    const promise = fetch(url, init)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, fallbackMessage))
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

  // POST/PUT/DELETE: sin deduplicación (son mutaciones únicas)
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, fallbackMessage))
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
    throw new Error(await getApiErrorMessage(response, fallbackMessage))
  }
  return response.arrayBuffer()
}
