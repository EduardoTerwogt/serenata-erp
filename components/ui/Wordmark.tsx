interface WordmarkProps {
  variant?: 'mark' | 'wordmark' | 'lockup'
  tone?: 'orange' | 'white'
  size?: number
  className?: string
}

// PLACEHOLDER de marca -- no se proporcionó logo real (ver reference/design.md
// del kit). Reemplazar cuando exista el isotipo/wordmark oficial de Serenata.
export function Wordmark({ variant = 'wordmark', tone = 'orange', size = 22, className = '' }: WordmarkProps) {
  const showMark = variant !== 'wordmark'
  const showWord = variant !== 'mark'

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {showMark && (
        <div
          className="flex flex-none items-center justify-center rounded-md bg-accent font-black text-accent-ink"
          style={{ width: size * 1.5, height: size * 1.5, fontSize: size }}
        >
          S
        </div>
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
