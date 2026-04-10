type JsonLike = Record<string, unknown>

async function safeParseJson(response: Response): Promise<JsonLike | null> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function getApiErrorMessage(response: Response, fallbackMessage: string) {
  const data = await safeParseJson(response)
  const errorMessage = typeof data?.error === 'string' ? data.error : null
  return errorMessage || fallbackMessage
}

export async function getJson<T>(url: string, fallbackMessage: string, init?: RequestInit): Promise<T> {
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
