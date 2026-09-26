import localFont from 'next/font/local'

// Rediseño Apple-style: una sola familia neutral en toda la app -- el kit pide
// la fuente de sistema (-apple-system/SF Pro) con Inter como fallback
// multiplataforma (ver tokens/fonts.css del kit). Sin fuente display aparte,
// sin tratamiento en mayúsculas. Auto-hospedada vía next/font/local (sin CDN,
// sin llamada de red en build ni en runtime) -- ver docs/ACTIVE_WORK.md,
// deuda técnica resuelta el 2026-09-26: next/font/google dependía de
// descargar Inter de Google Fonts durante el build y falló de forma
// intermitente más de una vez. Los .woff2 en app/fonts/ vienen de
// @expo-google-fonts/inter@0.4.2 (misma fuente/licencia SIL OFL 1.1 ya usada
// en lib/server/pdf/fonts/inter.ts), subseteados a latin con pyftsubset.
// Se mantienen las variables --font-display/--font-ui apuntando ambas a
// Inter porque tailwind.config.ts y el resto del código ya las usan
// (font-sans/font-display) -- así el cambio tipográfico aplica a toda la app
// sin tocar cada consumidor.
//
// `src` va repetido (no como una constante compartida): next/font/local lo
// analiza estáticamente en build y exige un arreglo literal en cada llamada.
export const archivo = localFont({
  src: [
    { path: './fonts/Inter-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Inter-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Inter-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
})

export const manrope = localFont({
  src: [
    { path: './fonts/Inter-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Inter-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Inter-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-ui',
  display: 'swap',
})
