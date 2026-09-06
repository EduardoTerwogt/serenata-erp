import { Archivo, Manrope } from 'next/font/google'

// Fase 5.7 (rediseño): tipografía del Serenata Design System.
// Archivo (display, condensada/uppercase) + Manrope (UI/cuerpo) — sustitutos de
// Google Fonts hasta que exista la tipografía real de marca (ver tokens/fonts.css
// del kit). Auto-hospedadas vía next/font (sin CDN, sin FOUC).
export const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

export const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-ui',
  display: 'swap',
})
