/**
 * Mapa manual `--sn-*` (app/globals.css) → RGB para jsPDF.
 *
 * Node no puede leer custom properties de CSS en runtime, así que este mapa
 * se codifica a mano y se sincroniza a ojo contra app/globals.css — deuda de
 * sincronización documentada y aceptada (ver docs/PLAN.md, sección "Riesgos"
 * → "Paleta de color").
 *
 * Cubre exactamente los swatches del editor de PDFs (docs/PLAN.md, "El
 * editor: alcance según el usuario" → "Color:"): ink, naranja y variantes,
 * superficies, y los 7 tonos de chip que existen hoy en app/globals.css.
 * Usa siempre los valores del tema claro (`:root`) — es el único tema activo
 * hoy, no hay control de UI para `[data-theme='dark']` todavía.
 *
 * Claves: nombre del token sin el prefijo `--sn-` (p. ej. `--sn-orange` →
 * `orange`) — así un panel de swatches puede mostrarlas directo como label.
 */
export const COLOR_TOKENS: Record<string, [number, number, number]> = {
  // Tinta / texto principal
  ink: [29, 29, 31], // --sn-ink #1D1D1F
  'ink-body': [58, 58, 60], // --sn-ink-body #3A3A3C
  'ink-muted': [110, 110, 115], // --sn-ink-muted #6E6E73
  'ink-faint': [152, 152, 157], // --sn-ink-faint #98989D

  // Naranja de marca y variantes
  orange: [254, 123, 1], // --sn-orange #FE7B01
  'orange-strong': [224, 109, 0], // --sn-orange-strong #E06D00
  'orange-soft': [184, 88, 0], // --sn-orange-soft #B85800
  'orange-ink': [255, 255, 255], // --sn-orange-ink #FFFFFF

  // Superficies / fondos
  app: [245, 245, 247], // --sn-app #F5F5F7
  surface: [255, 255, 255], // --sn-surface #FFFFFF
  'surface-alt': [250, 250, 251], // --sn-surface-alt #FAFAFB
  'surface-alt-2': [240, 240, 242], // --sn-surface-alt-2 #F0F0F2

  // Chips de icono del sidebar (7 tonos vigentes en app/globals.css)
  'chip-gray': [142, 142, 147], // --sn-chip-gray #8E8E93
  'chip-blue': [46, 127, 224], // --sn-chip-blue #2E7FE0
  'chip-purple': [142, 95, 224], // --sn-chip-purple #8E5FE0
  'chip-red': [224, 71, 46], // --sn-chip-red #E0472E
  'chip-teal': [47, 168, 140], // --sn-chip-teal #2FA88C
  'chip-green': [47, 168, 79], // --sn-chip-green #2FA84F
  'chip-indigo': [91, 107, 214], // --sn-chip-indigo #5B6BD6
}

/**
 * Resuelve un nombre de token de color a su RGB para jsPDF. Falla explícito
 * (nunca un valor por defecto silencioso) si el token no existe en el mapa.
 */
export function resolveColorToken(token: string): [number, number, number] {
  const rgb = COLOR_TOKENS[token]
  if (!rgb) {
    throw new Error(`Token de color desconocido: "${token}"`)
  }
  return rgb
}
