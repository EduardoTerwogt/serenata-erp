import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { proxyHandler } from '@/lib/proxy-handler'

/**
 * Contrato de las rutas de `app/api`: cada método de cada `route.ts` se protege a sí mismo.
 *
 * El proxy solo hace un chequeo optimista del JWT (sin consultar la base): la revocación real de un usuario
 * y la sección exacta las resuelve la guardia de la ruta. Por eso toda ruta no pública debe llamar
 * `await requireSection/requireAnySection(...)` en cada método y ANTES de leer el body o tocar la base.
 * Las públicas (las que el proxy deja pasar sin sesión) se detectan con `proxyHandler`, sin duplicar su lista,
 * y deben traer su guardia propia. Una ruta nueva que no encaje aquí falla: declararla es una decisión consciente.
 */

const SECCION = /await\s+require(?:Any)?Section\(/
// Públicas en el proxy → guardia propia obligatoria en cada método. `null` = anónima por diseño.
const PUBLICAS: [RegExp, RegExp | null][] = [
  [/^\/api\/auth\//, null], // NextAuth
  [/^\/api\/portal\/(?:login|logout|signup)$/, null], // portal: entrada anónima (con rate limit propio)
  [/^\/api\/portal\//, /requirePortalSession\(/],
  [/^\/api\/keep-alive$/, /CRON_SECRET/],
  [/^\/api\/internal\//, /x-loadtest-secret|guardOrNull\(/],
  [/^\/api\/integrations\/drive\/(?:authorize|callback)$/, SECCION],
]
// Solo exigen sesión de staff, sin sección (la autorización fina la resuelve RLS).
const SOLO_SESION: Record<string, RegExp> = { '/api/realtime/token': /await\s+requireAuthenticated\(/ }
// Trabajo que no puede ocurrir antes de la guardia.
const ANTES_DE_GUARDIA = /request\.(?:json|formData|text)\(|supabaseAdmin|\.from\(|\.rpc\(/

const EXPORT_HANDLER = /export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g

function sinComentarios(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

function esPublica(url: string) {
  const req = { nextUrl: new URL(`http://x${url}`), url: `http://x${url}`, cookies: { get: () => undefined } } as unknown as NextRequest
  return proxyHandler(req, null).status === 200 // NextResponse.next() sin sesión = ruta pública
}

/** Problemas de un `route.ts` (vacío = cumple). `url` ya con los segmentos dinámicos como `x`. */
function violaciones(url: string, fuente: string, publica: boolean): string[] {
  const src = sinComentarios(fuente)
  const inicios = Array.from(src.matchAll(EXPORT_HANDLER))
  const reglaPublica = publica ? PUBLICAS.find(([re]) => re.test(url)) : undefined
  if (publica && !reglaPublica) return [`${url}: ruta pública sin declarar en PUBLICAS (el proxy la deja pasar sin sesión)`]
  const guardia = publica ? reglaPublica![1] : (SOLO_SESION[url] ?? SECCION)
  if (!guardia) return []
  if (inicios.length === 0) return [`${url}: no se reconoce ningún handler exportado (GET/POST/PUT/PATCH/DELETE)`]

  const fallos: string[] = []
  inicios.forEach((m, i) => {
    const cuerpo = src.slice(m.index, inicios[i + 1]?.index ?? src.length)
    const g = guardia.exec(cuerpo)
    if (!g) return void fallos.push(`${url} ${m[1]}: sin su guardia (${guardia})`)
    if (!publica && ANTES_DE_GUARDIA.test(cuerpo.slice(0, g.index))) fallos.push(`${url} ${m[1]}: lee el body o la base antes de la guardia`)
  })
  return fallos
}

describe('guardias de las rutas de la API', () => {
  it('toda ruta de app/api cumple el contrato', () => {
    const rutas = readdirSync('app/api', { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('route.ts'))
      .map((f) => `app/api/${f}`)
      .sort()
    expect(rutas.length).toBeGreaterThan(50)
    const fallos = rutas.flatMap((f) => {
      const url = '/' + f.replace(/^app\//, '').replace(/\/route\.ts$/, '').replace(/\[\.\.\.\w+\]|\[\w+\]/g, 'x')
      return violaciones(url, readFileSync(f, 'utf8'), esPublica(url))
    })
    expect(fallos).toEqual([])
  })

  describe('el verificador detecta lo que debe', () => {
    const ok = `export async function GET() {\n  const { response } = await requireSection('cuentas')\n  if (response) return response\n  const x = await supabaseAdmin.from('t')\n}`
    it('cumple', () => expect(violaciones('/api/cuentas/x', ok, false)).toEqual([]))
    it('método sin guardia', () => {
      expect(violaciones('/api/nueva', `${ok}\nexport async function POST(request: Request) {\n  const b = await request.json()\n}`, false)).toEqual([
        expect.stringContaining('POST: sin su guardia'),
      ])
    })
    it('guardia después de leer el body', () => {
      const tarde = `export async function POST(request: Request) {\n  const b = await request.json()\n  await requireSection('cuentas')\n}`
      expect(violaciones('/api/nueva', tarde, false)).toEqual([expect.stringContaining('antes de la guardia')])
    })
    it('la guardia solo en un comentario no cuenta', () => {
      expect(violaciones('/api/nueva', `export async function GET() {\n  // await requireSection('cuentas')\n  return Response.json({})\n}`, false)).toHaveLength(1)
    })
    it('ruta pública sin declarar', () => expect(violaciones('/api/otra-publica', ok, true)).toEqual([expect.stringContaining('sin declarar')]))
    it('ruta del portal sin su guardia', () => {
      expect(violaciones('/api/portal/nueva', `export async function GET() {\n  return Response.json({})\n}`, true)).toEqual([expect.stringContaining('sin su guardia')])
    })
    it('archivo sin handler reconocible', () => {
      expect(violaciones('/api/nueva', `export const { GET, POST } = handlers`, false)).toEqual([expect.stringContaining('no se reconoce')])
    })
  })
})
