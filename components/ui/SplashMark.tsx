interface SplashMarkProps {
  size?: number
  className?: string
}

// Puerto de patterns/SplashMark.jsx del kit: el isotipo real enmascara dos
// capas -- una sólida (color de texto) y un degradado con los colores de la
// textura de marca que la recorre en diagonal en loop. Loader para esperas
// largas (login, cambio de sección), nunca para micro-interacciones inline.
export function SplashMark({ size = 176, className = '' }: SplashMarkProps) {
  const maskStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    WebkitMaskImage: 'url(/brand/logo-mark-alpha.png)',
    maskImage: 'url(/brand/logo-mark-alpha.png)',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  }

  return (
    <div className={`relative flex-none ${className}`} style={{ width: size, height: size }}>
      <style>{'@keyframes sn-splash-snake{0%,8%{background-position:50% 210%}92%,100%{background-position:50% -210%}}'}</style>
      <div style={{ ...maskStyle, background: 'var(--text-primary)' }} />
      <div
        style={{
          ...maskStyle,
          backgroundImage:
            'linear-gradient(165deg,transparent 12%,var(--sn-texture-orange) 28%,var(--sn-texture-red) 42%,var(--sn-texture-teal) 56%,var(--sn-texture-blue) 70%,transparent 88%)',
          backgroundSize: '100% 260%',
          backgroundPosition: '50% 210%',
          animation: 'sn-splash-snake 2.2s ease-in-out infinite',
        }}
      />
    </div>
  )
}
