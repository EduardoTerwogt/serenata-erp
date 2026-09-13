import { describe, expect, it, vi } from 'vitest'
import { logStructured, newRequestId } from '../log'

describe('newRequestId', () => {
  it('genera un id no vacío y distinto en cada llamada', () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })
})

describe('logStructured', () => {
  it('emite JSON con requestId, route, level y message', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    logStructured({ requestId: 'req-1', route: 'GET /api/x', level: 'error', message: 'unhandled_error', detail: 'boom' })

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [line] = errorSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      requestId: 'req-1',
      route: 'GET /api/x',
      level: 'error',
      message: 'unhandled_error',
      detail: 'boom',
    })
    expect(typeof parsed.timestamp).toBe('string')

    errorSpy.mockRestore()
  })

  it('level "warn" usa console.warn, no console.error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    logStructured({ requestId: 'req-2', route: 'r', level: 'warn', message: 'algo' })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('level "info" usa console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    logStructured({ requestId: 'req-3', route: 'r', level: 'info', message: 'algo' })

    expect(logSpy).toHaveBeenCalledTimes(1)
    logSpy.mockRestore()
  })
})
