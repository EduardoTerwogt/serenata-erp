'use client'
import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { SplashMark } from '@/components/ui/SplashMark'

// Rediseño Apple-style (11 · Login del kit): abre con el lockup real
// (wordmark + textura + grano de film) a sangre completa, se difumina en
// ~2.4s para revelar la tarjeta -- ver LoginScreen.jsx del skill. Mientras
// autentica de verdad (signIn), la pantalla cambia al estado "Bienvenido"
// con el isotipo animado, igual que el estado `loading` del kit. Sin
// registro público -- las cuentas se crean desde Admin · Usuarios.
const INTRO_STYLES = `
@keyframes sn-grain-flicker{0%,100%{opacity:.22}50%{opacity:.34}}
@keyframes sn-wordmark-wipe{0%{clip-path:inset(0 50% 0 50%)}100%{clip-path:inset(0 0 0 0)}}
@keyframes sn-intro-out{0%{opacity:1;filter:blur(0px)}62%{opacity:1;filter:blur(0px)}100%{opacity:0;filter:blur(32px)}}
@keyframes sn-card-in{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}
.sn-login-intro{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;animation:sn-intro-out 2400ms cubic-bezier(.2,.8,.2,1) both}
.sn-intro-texture-bg{position:absolute;inset:-9%;background-image:url(/brand/login-bg.jpg);background-size:cover;background-position:center;filter:url(#sn-warp)}
.sn-intro-grain{position:absolute;inset:0;background-image:url(/brand/grain.png);background-size:180px 180px;mix-blend-mode:overlay;animation:sn-grain-flicker 900ms ease-in-out infinite}
.sn-intro-wordmark-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.sn-intro-wordmark-img{width:200px;display:block;animation:sn-wordmark-wipe 1100ms cubic-bezier(.2,.8,.2,1) both;animation-delay:280ms}
.sn-login-card-in{animation:sn-card-in 700ms cubic-bezier(.2,.8,.2,1) both;animation-delay:1500ms}
`

const LOADING_STYLES = `
@keyframes sn-loading-grain-flicker{0%,100%{opacity:.22}50%{opacity:.34}}
.sn-loading-bg{position:absolute;inset:-9%;background-image:url(/brand/login-bg.jpg);background-size:cover;background-position:center;filter:url(#sn-warp)}
.sn-loading-grain{position:absolute;inset:0;background-image:url(/brand/grain.png);background-size:180px 180px;mix-blend-mode:overlay;animation:sn-loading-grain-flicker 900ms ease-in-out infinite}
`

function WarpFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="sn-warp" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="sn-noise">
          <animate attributeName="baseFrequency" values="0.008 0.012;0.013 0.007;0.008 0.012" dur="6s" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="sn-noise" scale={70} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

function nicknameFromCorreo(correo: string) {
  const local = (correo.split('@')[0] || 'usuario').replace(/[._]/g, ' ').trim()
  if (!local) return 'Usuario'
  return local.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setLoading(false)
      setError('Correo o contraseña incorrectos')
    } else {
      const callbackUrl = searchParams.get('callbackUrl') ?? '/'
      window.location.assign(callbackUrl)
    }
  }

  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-app p-8">
        <style>{LOADING_STYLES}</style>
        <WarpFilter />
        <div className="sn-loading-bg" />
        <div className="sn-loading-grain" />
        <div className="relative flex flex-col items-center gap-[19px]">
          <SplashMark size={100} />
          <div className="text-center">
            <div className="sn-display text-h2 text-white">Bienvenido, {nicknameFromCorreo(email)}</div>
            <div className="mt-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/70">Entrando a Serenata…</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app p-8">
      <style>{INTRO_STYLES}</style>
      <div className="sn-login-intro">
        <WarpFilter />
        <div className="sn-intro-texture-bg" />
        <div className="sn-intro-grain" />
        <div className="sn-intro-wordmark-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element -- lockup fijo del intro, no necesita optimización de next/image */}
          <img className="sn-intro-wordmark-img" src="/brand/wordmark-white.png" alt="Serenata" />
        </div>
      </div>

      <div className="sn-login-card-in relative flex w-full max-w-[392px] flex-col gap-[26px]">
        <div className="flex flex-col items-center gap-[13px]">
          <div
            className="h-[88px] w-[88px]"
            style={{
              WebkitMaskImage: 'url(/brand/logo-mark-alpha.png)',
              maskImage: 'url(/brand/logo-mark-alpha.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              background: 'var(--accent)',
            }}
          />
          <div className="sn-eyebrow">Gestión Serenata</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[19px] rounded-panel border border-hairline bg-card p-[26px] shadow-[var(--shadow-card)]">
          <TextField
            label="Correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="tu@serenata.mx"
          />
          <TextField
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          {error && (
            <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-cancelled-bg px-3.5 py-2.5 text-[length:var(--text-md)] text-cancelled-fg">
              <Icon name="warning" size={15} className="mt-0.5 flex-none" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" fullWidth>
            Entrar
          </Button>
        </form>

        <p className="m-0 text-center text-[length:var(--text-md)] text-faint">
          Las cuentas se crean desde Admin · Usuarios.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
