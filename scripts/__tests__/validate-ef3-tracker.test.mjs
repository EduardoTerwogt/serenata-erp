import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BASE_BLOCK_IDS,
  DOC_ONLY_BLOCK_IDS,
  parseTrackerTable,
  validateStructural,
  validateRequireFinal,
  findTrackerFile,
} from '../validate-ef3-tracker.mjs'

const HEADER = '| ID | Estado | Dependencias | Rama | PR | Commit SHA | Commit de merge | Nota | Próxima acción |'
const SEP = '|---|---|---|---|---|---|---|---|---|'

function rowLine({
  id,
  estado = 'Pendiente',
  dependencias = 'ninguna',
  rama = '—',
  pr = '—',
  commitSha = '—',
  commitMerge = '—',
  nota = '',
  proximaAccion = '—',
}) {
  return `| ${id} | ${estado} | ${dependencias} | ${rama} | ${pr} | ${commitSha} | ${commitMerge} | ${nota} | ${proximaAccion} |`
}

/**
 * Construye una tabla de tracker mínima y válida: las 40 filas base en
 * Pendiente, salvo 3A-0 (Cerrado, doc-only, con Commit SHA). `overrides` es
 * un mapa id -> props parciales para pisar filas específicas. `extraRows`
 * son filas adicionales (ej. condicionales) a agregar al final. `omitIds`
 * son IDs base a excluir (para simular una fila faltante).
 */
function buildTrackerContent({ overrides = {}, extraRows = [], omitIds = [] } = {}) {
  const lines = ['## 11. Tracker de los 40 bloques', '', HEADER, SEP]
  for (const id of BASE_BLOCK_IDS) {
    if (omitIds.includes(id)) continue
    const isDocOnly = DOC_ONLY_BLOCK_IDS.includes(id)
    const base = {
      id,
      estado: id === '3A-0' ? 'Cerrado' : 'Pendiente',
      rama: isDocOnly ? 'N/A' : '—',
      pr: isDocOnly ? 'N/A' : '—',
      commitSha: id === '3A-0' ? '`09ad7fc`' : '—',
      commitMerge: isDocOnly ? 'N/A' : '—',
    }
    lines.push(rowLine({ ...base, ...(overrides[id] ?? {}) }))
  }
  for (const extra of extraRows) {
    lines.push(rowLine(extra))
  }
  lines.push('')
  return lines.join('\n')
}

describe('parseTrackerTable', () => {
  it('parsea las 40 filas base de una tabla válida', () => {
    const rows = parseTrackerTable(buildTrackerContent())
    expect(rows).toHaveLength(40)
    expect(rows.map((r) => r.id)).toEqual(BASE_BLOCK_IDS)
  })
})

describe('validateStructural', () => {
  it('pasa limpio sobre una tabla mínima válida (caso base)', () => {
    const rows = parseTrackerTable(buildTrackerContent())
    const result = validateStructural(rows)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('caso 1: fila faltante falla', () => {
    const rows = parseTrackerTable(buildTrackerContent({ omitIds: ['3B-5'] }))
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('Falta la fila base obligatoria: 3B-5'))).toBe(true)
  })

  it('caso 2: dependencia inexistente falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({ overrides: { '3B-2': { dependencias: '3B-99' } } })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3B-2') && e.includes('3B-99'))).toBe(true)
  })

  it('caso 3: bloque con rama Cerrado sin PR/Commit de merge falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({ overrides: { '3B-1': { estado: 'Cerrado' } } })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3B-1') && e.includes('PR'))).toBe(true)
  })

  it('caso 3b: bloque con rama Cerrado con PR y Commit de merge llenos pasa', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        overrides: {
          '3B-1': { estado: 'Cerrado', rama: 'ef3-3b1', pr: 'https://github.com/x/pull/1', commitMerge: '`abc1234`' },
        },
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(true)
  })

  it('caso 4: bloque doc-only Cerrado sin Commit SHA falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({ overrides: { '3A-6': { estado: 'Cerrado' } } })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3A-6') && e.includes('Commit SHA'))).toBe(true)
  })

  it('caso 5: bloque doc-only Cerrado con PR lleno (mezcla inconsistente) falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        overrides: { '3A-6': { estado: 'Cerrado', commitSha: '`deadbee`', pr: 'https://github.com/x/pull/9' } },
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3A-6') && e.includes('mezcla'))).toBe(true)
  })

  it('caso 6: "En curso" con dependencia abierta falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({ overrides: { '3B-2': { estado: 'En curso', dependencias: '3B-1' } } })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3B-2') && e.includes('3B-1'))).toBe(true)
  })

  it('caso 6b: "En curso" con dependencia ya Cerrado pasa', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        overrides: {
          '3B-1': { estado: 'Cerrado', rama: 'x', pr: 'y', commitMerge: 'z' },
          '3B-2': { estado: 'En curso', dependencias: '3B-1' },
        },
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(true)
  })

  it('condicional (a): fila 3B-7b válida (Cerrado con PR+merge) pasa limpio', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        extraRows: [{ id: '3B-7b', estado: 'Cerrado', dependencias: '3B-7', rama: 'x', pr: 'y', commitMerge: 'z' }],
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(true)
  })

  it('condicional (b): ID inventado (3B-99) falla aunque esté bien formado', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        extraRows: [{ id: '3B-99', estado: 'Cerrado', rama: 'x', pr: 'y', commitMerge: 'z' }],
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('ID desconocido') && e.includes('3B-99'))).toBe(true)
  })

  it('condicional (c): dependencia hacia una condicional ausente falla', () => {
    const rows = parseTrackerTable(
      buildTrackerContent({
        extraRows: [{ id: '3D-0b', estado: 'Cerrado', dependencias: '3B-7b', rama: 'x', pr: 'y', commitMerge: 'z' }],
      })
    )
    const result = validateStructural(rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('3D-0b') && e.includes('3B-7b'))).toBe(true)
  })
})

describe('validateRequireFinal', () => {
  function allFinalRows(overrideFor3B1 = {}) {
    const overrides = {}
    for (const id of BASE_BLOCK_IDS) {
      if (id === '3A-0') continue
      overrides[id] = DOC_ONLY_BLOCK_IDS.includes(id)
        ? { estado: 'Cerrado', commitSha: '`abc0000`' }
        : { estado: 'Cerrado', rama: 'x', pr: 'y', commitMerge: 'z' }
    }
    overrides['3B-1'] = { ...overrides['3B-1'], ...overrideFor3B1 }
    return parseTrackerTable(buildTrackerContent({ overrides }))
  }

  it('caso (d): una fila en Bloqueado hace fallar --require-final, pero el modo estructural (sin flag) pasa limpio', () => {
    const rows = allFinalRows({ estado: 'Bloqueado', rama: '—', pr: '—', commitMerge: '—' })
    expect(validateStructural(rows).ok).toBe(true)
    const final = validateRequireFinal(rows, [])
    expect(final.ok).toBe(false)
    expect(final.errors.some((e) => e.includes('3B-1'))).toBe(true)
  })

  it('caso (e): esa fila en Diferido con aprobación con nota no vacía pasa --require-final', () => {
    const rows = allFinalRows({ estado: 'Diferido con aprobación', nota: 'Aprobado por el usuario 2026-09-14', rama: '—', pr: '—', commitMerge: '—' })
    const final = validateRequireFinal(rows, [])
    expect(final.ok).toBe(true)
  })

  it('caso (f): esa fila en Diferido con aprobación con nota vacía falla --require-final', () => {
    const rows = allFinalRows({ estado: 'Diferido con aprobación', nota: '', rama: '—', pr: '—', commitMerge: '—' })
    const final = validateRequireFinal(rows, [])
    expect(final.ok).toBe(false)
    expect(final.errors.some((e) => e.includes('3B-1'))).toBe(true)
  })

  it('--except excluye la fila indicada de la validación (e)', () => {
    const rows = allFinalRows({ estado: 'Pendiente' })
    expect(validateRequireFinal(rows, ['3B-1']).ok).toBe(true)
    expect(validateRequireFinal(rows, []).ok).toBe(false)
  })
})

describe('findTrackerFile', () => {
  it('usa la ruta activa cuando existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ef3-tracker-'))
    try {
      mkdirSync(join(dir, 'docs'), { recursive: true })
      writeFileSync(join(dir, 'docs', 'EF-3_ENGINEERING_HARDENING.md'), buildTrackerContent())
      const found = findTrackerFile(dir)
      expect(found.path).toBe('docs/EF-3_ENGINEERING_HARDENING.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cae a la ruta archivada cuando la activa no existe (confirma el fallback de ruta)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ef3-tracker-'))
    try {
      mkdirSync(join(dir, 'docs', 'archive'), { recursive: true })
      writeFileSync(join(dir, 'docs', 'archive', 'ef-3-engineering-hardening.md'), buildTrackerContent())
      const found = findTrackerFile(dir)
      expect(found.path).toBe('docs/archive/ef-3-engineering-hardening.md')
      const rows = parseTrackerTable(found.content)
      expect(rows).toHaveLength(40)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falla explícito si ninguna de las 2 rutas existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ef3-tracker-'))
    try {
      expect(() => findTrackerFile(dir)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
