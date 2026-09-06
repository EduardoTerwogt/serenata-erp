interface AvatarProps {
  initials: string
  size?: number
  tone?: 'accent' | 'neutral'
  className?: string
}

export function Avatar({ initials, size = 32, tone = 'accent', className = '' }: AvatarProps) {
  return (
    <div
      className={`flex flex-none items-center justify-center rounded-full font-bold tracking-wide ${
        tone === 'accent' ? 'bg-accent text-accent-ink' : 'bg-row-alt text-body'
      } ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  )
}
