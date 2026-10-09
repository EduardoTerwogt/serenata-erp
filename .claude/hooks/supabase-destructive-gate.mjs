#!/usr/bin/env node
// PreToolUse hook (matcher: mcp__*__execute_sql | mcp__*__apply_migration) — fuerza
// confirmación manual cuando el SQL es destructivo (DROP, TRUNCATE, DELETE FROM).
// Todo lo demás pasa sin tocar: la aprobación automática la dan `permissions.allow` y
// los tool permissions del conector (claude.ai/customize/connectors). Este hook solo
// AGREGA una pausa, nunca concede permisos. Ver docs/decisions/012.
//
// Detección deliberadamente conservadora: se quitan comentarios y literales '...'
// (para no disparar por texto), pero NO cuerpos $$...$$ — un DELETE dentro de una
// función también pregunta. Falso positivo = un clic; falso negativo = datos perdidos.
// Si el input no se puede leer, también pregunta (fallar explícito).
import { readFileSync } from 'fs'

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    })
  )
  process.exit(0)
}

function stripNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

const DESTRUCTIVE = [
  [/\bDROP\b/i, 'DROP'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
]

let sql
try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const ti = input.tool_input ?? {}
  sql = typeof ti.query === 'string' ? ti.query : JSON.stringify(ti)
} catch {
  ask('No se pudo leer el SQL del hook; confirmar manualmente.')
}

const clean = stripNoise(sql)
const hit = DESTRUCTIVE.find(([re]) => re.test(clean))
if (hit) ask(`SQL destructivo (${hit[1]}): confirmar antes de ejecutar.`)
