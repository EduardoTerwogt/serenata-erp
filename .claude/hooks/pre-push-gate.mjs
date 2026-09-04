#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) — blocks the FIRST `git push` attempt of each
// session so an unattended/auto-resumed session (e.g. one that starts with
// queued/pending tasks) can never silently push to origin without at least one
// forced stop. See CLAUDE.md "Ejecución entre sesiones" — this is the technical
// half of that rule; the second attempt in the same session is allowed through
// so the normal "commit + push after every functional change" workflow isn't
// disrupted once the session has demonstrably paused once.
//
// Non-fatal by design: any unexpected error here falls open (exit 0) rather
// than blocking legitimate work because of a hook bug.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
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

  process.stderr.write(
    'Freno de seguridad (primer `git push` de esta sesión): antes de continuar, ' +
    'confirma explícitamente con el usuario qué cambios se van a pushear a main — ' +
    'especialmente si esta sesión retomó tareas en cola de una sesión anterior. ' +
    'Ver CLAUDE.md "Ejecución entre sesiones". Si ya lo confirmaste o el usuario ' +
    'ya aprobó este cambio en la conversación, reintenta el push — este freno solo ' +
    'aplica una vez por sesión.\n'
  )
  process.exit(2)
}

main()
