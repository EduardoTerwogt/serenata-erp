import { describe, expect, it } from 'vitest'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

describe('hoyCdmx', () => {
  it('usa la fecha de la Ciudad de México, no la UTC', () => {
    // 2026-09-25 03:00 UTC = 2026-09-24 21:00 en CDMX (UTC-6)
    expect(hoyCdmx(new Date('2026-09-25T03:00:00Z'))).toBe('2026-09-24')
    expect(hoyCdmx(new Date('2026-09-25T18:00:00Z'))).toBe('2026-09-25')
  })
})
