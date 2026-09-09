import { Inter } from 'next/font/google'

// Rediseño Apple-style: una sola familia neutral en toda la app -- el kit pide
// la fuente de sistema (-apple-system/SF Pro) con Inter como fallback
// multiplataforma (ver tokens/fonts.css del kit). Sin fuente display aparte,
// sin tratamiento en mayúsculas. Auto-hospedada vía next/font (sin CDN, sin
// FOUC). Se mantienen las variables --font-display/--font-ui apuntando ambas
// a Inter porque tailwind.config.ts y el resto del código ya las usan
// (font-sans/font-display) -- así el cambio tipográfico aplica a toda la app
// sin tocar cada consumidor.
export const archivo = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const manrope = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
})
