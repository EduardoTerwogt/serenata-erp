import { describe, expect, it } from 'vitest'
import { canonicalizeJson, computeClientPayloadHash } from '../canonicalPayload'

describe('canonicalizeJson', () => {
  it('ordena claves de objeto recursivamente en todos los niveles', () => {
    const a = canonicalizeJson({ b: 2, a: 1, nested: { y: 2, x: 1 } })
    expect(JSON.stringify(a)).toBe(JSON.stringify({ a: 1, b: 2, nested: { x: 1, y: 2 } }))
  })

  it('no reordena arrays', () => {
    const a = canonicalizeJson({ items: [3, 1, 2] })
    expect(a).toEqual({ items: [3, 1, 2] })
  })
})

describe('computeClientPayloadHash (Web Crypto)', () => {
  it('mismo payload con claves en distinto orden produce el mismo hash', async () => {
    const a = await computeClientPayloadHash({ b: 2, a: 1, nested: { y: 2, x: 1 } })
    const b = await computeClientPayloadHash({ a: 1, b: 2, nested: { x: 1, y: 2 } })
    expect(a).toBe(b)
  })

  it('no reordena arrays -- un cambio de orden cambia el hash', async () => {
    const a = await computeClientPayloadHash({ items: [1, 2, 3] })
    const b = await computeClientPayloadHash({ items: [3, 2, 1] })
    expect(a).not.toBe(b)
  })

  it('produce un hash hex de 64 caracteres (SHA-256)', async () => {
    const hash = await computeClientPayloadHash({ x: 1 })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
