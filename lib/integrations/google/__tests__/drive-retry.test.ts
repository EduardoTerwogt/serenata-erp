import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { withDriveRetry } from '../drive'

// La subida de factura de proveedor hace 3-4 llamadas seguidas a Drive
// (list+create de carpeta, create de archivo) sin ningún retry -- un solo
// 429/503 pasajero de Google tiraba el flujo completo (visto en un run real
// de tests/e2e/live). Estas pruebas blindan que withDriveRetry reintenta
// solo lo transitorio y deja pasar de inmediato los errores reales.

describe('withDriveRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no reintenta si la primera llamada tiene éxito', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withDriveRetry('test', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta un 429 (rate limit) y tiene éxito en el segundo intento', async () => {
    const err429 = Object.assign(new Error('rate limited'), { code: 429 })
    const fn = vi.fn().mockRejectedValueOnce(err429).mockResolvedValueOnce('ok')

    const promise = withDriveRetry('test', fn)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('reintenta un 503 anidado en response.status', async () => {
    const err503 = Object.assign(new Error('backend error'), { response: { status: 503 } })
    const fn = vi.fn().mockRejectedValueOnce(err503).mockResolvedValueOnce('ok')

    const promise = withDriveRetry('test', fn)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('NO reintenta un 404 -- lo relanza de inmediato', async () => {
    const err404 = Object.assign(new Error('not found'), { code: 404 })
    const fn = vi.fn().mockRejectedValue(err404)

    await expect(withDriveRetry('test', fn)).rejects.toBe(err404)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('NO reintenta invalid_grant (401/403 de auth) -- lo relanza de inmediato', async () => {
    const errAuth = Object.assign(new Error('invalid_grant'), { code: 401 })
    const fn = vi.fn().mockRejectedValue(errAuth)

    await expect(withDriveRetry('test', fn)).rejects.toBe(errAuth)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('agota los intentos y relanza el último error si el fallo transitorio persiste', async () => {
    const err429 = Object.assign(new Error('rate limited'), { code: 429 })
    const fn = vi.fn().mockRejectedValue(err429)

    const promise = withDriveRetry('test', fn, 3)
    promise.catch(() => {})
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toBe(err429)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
