import { describe, expect, it } from 'vitest'
import { computeDeltas } from '../telemetry-deltas.mjs'

// EF-3A 3A-5: los 4 casos de emparejamiento del punto 10 de la spec --
// mean_exec_time del snapshot "después" nunca sirve solo, porque es el
// promedio acumulado desde el último reset, no el de la ventana de carga.

describe('computeDeltas', () => {
  it('queryid emparejado con calls_delta>0 -- window_mean_ms = total_exec_time_delta_ms/calls_delta', () => {
    const before = [{ queryid: 'q1', calls: 10, total_exec_time: 100 }]
    const after = [{ queryid: 'q1', calls: 20, total_exec_time: 300 }]

    const deltas = computeDeltas(before, after)

    expect(deltas).toEqual([
      { queryid: 'q1', calls_delta: 10, total_exec_time_delta_ms: 200, window_mean_ms: 20, flag: 'matched' },
    ])
  })

  it('calls_delta===0 -- window_mean_ms: null, nunca división por cero', () => {
    const before = [{ queryid: 'q1', calls: 10, total_exec_time: 100 }]
    const after = [{ queryid: 'q1', calls: 10, total_exec_time: 100 }]

    const [delta] = computeDeltas(before, after)

    expect(delta.calls_delta).toBe(0)
    expect(delta.window_mean_ms).toBeNull()
    expect(delta.flag).toBe('matched')
  })

  it('queryid nuevo en "después" -- flag: new_or_reset, nunca "nuevo" sin calificar', () => {
    const before = []
    const after = [{ queryid: 'q2', calls: 5, total_exec_time: 50 }]

    const [delta] = computeDeltas(before, after)

    expect(delta.flag).toBe('new_or_reset')
    expect(delta.calls_delta).toBe(5)
    expect(delta.total_exec_time_delta_ms).toBe(50)
    expect(delta.window_mean_ms).toBe(10)
  })

  it('queryid que desaparece de "antes" a "después" -- se omite de la salida', () => {
    const before = [{ queryid: 'q3', calls: 1, total_exec_time: 1 }]
    const after = []

    const deltas = computeDeltas(before, after)

    expect(deltas).toEqual([])
  })

  it('ordena por total_exec_time_delta_ms descendente', () => {
    const before = [{ queryid: 'low', calls: 1, total_exec_time: 1 }, { queryid: 'high', calls: 1, total_exec_time: 1 }]
    const after = [{ queryid: 'low', calls: 2, total_exec_time: 6 }, { queryid: 'high', calls: 2, total_exec_time: 101 }]

    const deltas = computeDeltas(before, after)

    expect(deltas.map((d) => d.queryid)).toEqual(['high', 'low'])
  })
})
