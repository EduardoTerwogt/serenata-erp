#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) — blocks the FIRST `git push` **to main** of each
// session so an unattended/auto-resumed session (e.g. one that starts with
// queued/pending tasks) can never silently land work on the deployable branch
// without at least one forced stop. See CLAUDE.md "Rama + PR, merge al final".
//
// Pushes to a working branch pass through untouched: they deploy nothing and
// merge nothing, so the normal "commit + push after every functional change"
// workflow is never interrupted. Only the merge point is guarded, which is the
// only moment where an unsupervised push is actually destructive.
//
// The second attempt at main in the same session is allowed through — the point
// is to force one pause, not to verify approval, which a hook cannot do.
//
// Non-fatal by design: any unexpected error here falls open (exit 0) rather
// than blocking legitimate work because of a hook bug.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Detects an actual `git push` invocation, not the literal text "git push"
 * appearing inside a quoted string or heredoc body (e.g. a commit message
 * that documents this very hook). Strips heredoc bodies (<<'EOF' ... EOF)
 * before matching, then only matches `git push` at a command boundary
 * (start of line/string, or after &&, ||, ;, |, or a newline).
 */
function looksLikeGitPush(command) {
  const withoutHeredocs = command.replace(/<<[-~]?\s*['"]?(\w+)['"]?[\s\S]*?^\1$/gm, '')
  return /(^|&&|\|\||;|\||\n)\s*git\s+push\b/.test(withoutHeredocs)
}

/**
 * True only when the push targets main. Covers the explicit forms
 * (`git push origin main`, `git push … HEAD:main`, `git push … main:main`) and
 * a bare `git push` while main is the checked-out branch. A push to any working
 * branch returns false and is never gated.
 */
function targetsMain(command) {
  const push = command.slice(command.search(/git\s+push\b/))
  if (/\b(HEAD|[\w./-]+):(refs\/heads\/)?main\b/.test(push)) return true
  if (/\bgit\s+push\b[^\n;&|]*\bmain\b/.test(push)) return true

  const hasExplicitRef = /\bgit\s+push\b\s+(-[\w-]+\s+)*[\w./-]+\s+[\w./:-]+/.test(push)
  if (hasExplicitRef) return false

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return branch === 'main'
  } catch {
    return false
  }
}

/**
 * Returns true when the commits about to be pushed touch app/lib/db code but
 * leave docs/ACTIVE_WORK.md untouched. That combination means the session is
 * shipping real changes without persisting its state in the repo, which breaks
 * the "Git recuerda, la sesión no" loop (see CLAUDE.md "Cierre de sesión").
 * Advisory only: this never blocks on its own, it just adds a line to the
 * stderr message of the once-per-session gate.
 */
function shipsCodeWithoutActiveWork() {
  try {
    const range = 'origin/main..HEAD'
    const changed = execSync(`git diff --name-only ${range}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (!changed.trim()) return false
    const files = changed.split('\n').filter(Boolean)
    const touchesCode = files.some((f) => /^(app|lib|db|components|hooks)\//.test(f))
    const touchesActiveWork = files.some((f) => f === 'docs/ACTIVE_WORK.md')
    return touchesCode && !touchesActiveWork
  } catch {
    return false
  }
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0)
  }

  const command = input?.tool_input?.command
  if (typeof command !== 'string' || !looksLikeGitPush(command)) {
    process.exit(0)
  }
  if (!targetsMain(command)) {
    process.exit(0)
  }

  const sessionId = input?.session_id || 'unknown-session'
  const markerDir = join(tmpdir(), 'serenata-push-gate')
  const markerPath = join(markerDir, sessionId)

  if (existsSync(markerPath)) {
    process.exit(0)
  }

  try {
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(markerPath, new Date().toISOString())
  } catch {
    process.exit(0)
  }

  let message =
    'Freno de seguridad (primer push a `main` de esta sesión): main es la rama ' +
    'desplegable, así que antes de continuar confirma con el usuario que la ' +
    'iniciativa está terminada, que todas las suites pasaron en el PR y que el ' +
    'Preview de Vercel desplegó bien — especialmente si esta sesión retomó tareas ' +
    'en cola de una sesión anterior. Ver CLAUDE.md "Rama + PR, merge al final". ' +
    'Si el trabajo sigue abierto, pushea a la rama en vez de a main. Si ya lo ' +
    'confirmaste, reintenta — este freno solo aplica una vez por sesión.'

  if (shipsCodeWithoutActiveWork()) {
    message +=
      '\n\nAviso adicional: estos commits tocan código pero no actualizan ' +
      'docs/ACTIVE_WORK.md. Si esta iniciativa avanzó trabajo real, aplica el ' +
      'procedimiento de .claude/skills/serenata-cerrar-sesion antes del merge para ' +
      'que el estado quede en el repo y no solo en la conversación. Si el cambio no ' +
      'lo amerita, ignora este aviso y reintenta.'
  }

  process.stderr.write(message + '\n')
  process.exit(2)
}

main()
