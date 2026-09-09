interface WordmarkProps {
  variant?: 'mark' | 'wordmark' | 'lockup'
  tone?: 'orange' | 'white'
  size?: number
  className?: string
}

// Puerto de core/Wordmark.jsx del kit: el isotipo es la imagen real
// (public/brand/logo-mark.png, un cuadrado naranja con una "S" blanca),
// no un placeholder dibujado. El wordmark sigue en tipografía porque el
// kit tampoco tiene ese archivo por separado.
export function Wordmark({ variant = 'wordmark', tone = 'orange', size = 22, className = '' }: WordmarkProps) {
  const showMark = variant !== 'wordmark'
  const showWord = variant !== 'mark'

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {showMark && (
        // eslint-disable-next-line @next/next/no-img-element -- tamaño variable en px, se usa fuera del flujo normal de next/image (sidebar/login)
        <img
          src="/brand/logo-mark.png"
          alt="Serenata"
          className="block flex-none object-cover"
          style={{ width: size * 1.5, height: size * 1.5, borderRadius: Math.round(size * 0.36) }}
        />
      )}
      {showWord && (
        <span
          className={`sn-display leading-none ${tone === 'orange' ? 'text-accent' : 'text-ink'}`}
          style={{ fontSize: size }}
        >
          Serenata
        </span>
      )}
    </div>
  )
}
