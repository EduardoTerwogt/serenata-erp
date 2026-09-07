/**
 * Falla si app/globals.css define una clase CSS custom (`.algo`) a nivel
 * top (fuera de @layer) que toca una propiedad de layout (position,
 * display, top/right/bottom/left, flex, grid, float, width, height).
 *
 * Motivo: en Tailwind v4 (cascade layers), una regla así gana por encima
 * de cualquier utilidad (`fixed`, `flex`, etc.) sin importar el orden en
 * el archivo. Esto ya rompió el layout en producción dos veces (sidebar
 * perdiendo `position: fixed`, `.sn-display` chocando con `text-*`) antes
 * de que existiera este check — ver auditoria-independiente-009ea58.md
 * sección 2 y serenata-erp-documento-maestro.md sección 7.
 *
 * Alcance deliberado: solo clases custom (`.foo`), no selectores de
 * elemento/atributo nativos (`html`, `body`, `input[type="date"]`) —
 * esos son resets base que ya existían antes de Tailwind v4, nunca se
 * combinan con utilidades Tailwind conflictivas en el mismo elemento, y
 * moverlos de capa cambiaría su prioridad en la cascada sin necesidad.
 * El patrón real de riesgo es una clase custom pensada para usarse junto
 * a una utilidad Tailwind (como pasó con `.sn-rail-texture` + `fixed`).
 *
 * Usage: node scripts/check-css-layers.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSS_FILE = join(__dirname, '..', 'app', 'globals.css')

const LAYOUT_PROPS = [
  'position',
  'display',
  'top',
  'right',
  'bottom',
  'left',
  'flex',
  'grid',
  'float',
  'width',
  'height',
]
const LAYOUT_PROP_PATTERN = new RegExp(`(^|[;{\\s])(${LAYOUT_PROPS.join('|')})\\s*:`, 'i')
const AT_RULE_NO_LAYER = /^@(media|theme|keyframes|supports|font-face|import|charset)\b/i

// Solo selectores que son puramente clases custom (`.foo`, `.foo::before`,
// separadas por coma) — ver nota de "alcance deliberado" arriba.
const CUSTOM_CLASS_SELECTOR_LIST = /^(\s*\.[a-zA-Z0-9_-]+(::[a-zA-Z-]+)?\s*,?)+$/

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Recorre el CSS a nivel top, sin usar un parser completo: solo necesita
// saber, para cada bloque `selector { ... }` o `@regla { ... }`, si vive
// dentro de un @layer o no. Es intencionalmente simple (ver check-migrations.mjs
// para el mismo criterio de "script chico y directo" en este repo).
function findUnlayeredLayoutRules(css) {
  const findings = []
  let depth = 0 // profundidad de llaves general
  let layerDepth = null // profundidad de llaves en la que abrió el @layer más externo
  let i = 0

  while (i < css.length) {
    const ch = css[i]

    if (ch === '{') {
      // ¿Qué encabezado abrió esta llave? Busca hacia atrás hasta el
      // separador de bloque anterior (}, ; o inicio de archivo).
      let start = i - 1
      while (start >= 0 && css[start] !== '}' && css[start] !== ';' && css[start] !== '{') start--
      const header = css.slice(start + 1, i).trim()

      const isLayer = /^@layer\b/i.test(header)
      const isOtherAtRuleWithoutOwnLayerSemantics = AT_RULE_NO_LAYER.test(header)

      if (isLayer && layerDepth === null) {
        layerDepth = depth
      } else if (
        layerDepth === null &&
        depth === 0 &&
        !isOtherAtRuleWithoutOwnLayerSemantics &&
        header &&
        CUSTOM_CLASS_SELECTOR_LIST.test(header)
      ) {
        // Bloque top-level fuera de cualquier @layer, con un selector que
        // es puramente clase(s) custom -- el patrón real de riesgo.
        const bodyEnd = matchClosingBrace(css, i)
        const body = css.slice(i + 1, bodyEnd)
        if (LAYOUT_PROP_PATTERN.test(body)) {
          const line = css.slice(0, i).split('\n').length
          findings.push({ line, header })
        }
      }

      depth++
    } else if (ch === '}') {
      depth--
      if (layerDepth !== null && depth === layerDepth) layerDepth = null
    }
    i++
  }

  return findings
}

function matchClosingBrace(css, openIndex) {
  let depth = 1
  let i = openIndex + 1
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') depth--
    i++
  }
  return i - 1
}

function main() {
  const raw = readFileSync(CSS_FILE, 'utf-8')
  const css = stripComments(raw)
  const findings = findUnlayeredLayoutRules(css)

  if (findings.length > 0) {
    console.error('app/globals.css tiene reglas de layout fuera de @layer (rompen utilidades de Tailwind en producción):\n')
    findings.forEach(({ line, header }) => {
      console.error(`  - línea ${line}: "${header}"`)
    })
    console.error('\nMové la regla dentro de `@layer components { ... }` (ver .sn-rail-texture como ejemplo).')
    process.exit(1)
  }

  console.log('app/globals.css: sin reglas de layout fuera de @layer. OK.')
}

main()
