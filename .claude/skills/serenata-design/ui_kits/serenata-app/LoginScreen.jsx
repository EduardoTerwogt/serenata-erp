/* 11 · Login — abre con el lockup real (wordmark + textura + grano de film) a
   sangre completa; se difumina a blanco en ~2s para revelar la tarjeta. Sin
   registro público. Mientras autentica, la pantalla cambia a un estado de
   bienvenida con el isotipo "S" llenándose del degradado y el nombre del
   usuario, antes de entrar al shell. */
const { Card, Button, Icon, TextField } = window.SerenataDesignSystem_993393;
const SN5_GRAIN_TILE = '../../assets/grain.png';
const SN5_LOGO_ALPHA = '../../assets/logo-mark-alpha.png';
const SN5_LOGIN_BG = '../../assets/login-bg.jpg';
const SN5_WORDMARK_WHITE = '../../assets/wordmark-white.png';

function ThemeToggle() {
  const [theme, setTheme] = React.useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('sn5-theme')) || 'light');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sn5-theme', theme); } catch (e) {}
  }, [theme]);
  const light = theme === 'light';
  return (
    <button
      type="button" onClick={() => setTheme(light ? 'dark' : 'light')}
      title={light ? 'Cambiar a oscuro' : 'Cambiar a claro'}
      style={{ position: 'absolute', top: 'var(--space-lg)', right: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flex: 'none', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-subtle)', background: 'var(--surface-input)', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2 }}
    >
      <Icon name={light ? 'moon' : 'sun'} size={16} />
    </button>
  );
}

function nicknameFromCorreo(correo) {
  const local = (correo.split('@')[0] || 'usuario').replace(/[._]/g, ' ').trim();
  if (!local) return 'Usuario';
  return local.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const SN_INTRO_CSS = `
@keyframes sn-grain-flicker{0%,100%{opacity:.22}50%{opacity:.34}}
@keyframes sn-wordmark-wipe{0%{clip-path:inset(0 50% 0 50%)}100%{clip-path:inset(0 0 0 0)}}
@keyframes sn-intro-out{0%{opacity:1;filter:blur(0px)}62%{opacity:1;filter:blur(0px)}100%{opacity:0;filter:blur(32px)}}
@keyframes sn-card-in{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}
.sn-login-intro{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;animation:sn-intro-out 2400ms cubic-bezier(.2,.8,.2,1) both}
.sn-intro-texture-bg{position:absolute;inset:-9%;background-image:url(${SN5_LOGIN_BG});background-size:cover;background-position:center;filter:url(#sn-warp)}
.sn-intro-grain{position:absolute;inset:0;background-size:180px 180px;mix-blend-mode:overlay;animation:sn-grain-flicker 900ms ease-in-out infinite}
.sn-intro-wordmark-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.sn-intro-wordmark-img{width:200px;display:block;animation:sn-wordmark-wipe 1100ms cubic-bezier(.2,.8,.2,1) both;animation-delay:280ms}
.sn-login-card-in{animation:sn-card-in 700ms cubic-bezier(.2,.8,.2,1) both;animation-delay:1500ms}
`;

const SN_LOADING_CSS = `
@keyframes sn-loading-grain-flicker{0%,100%{opacity:.22}50%{opacity:.34}}
.sn-loading-bg{position:absolute;inset:-9%;background-size:cover;background-position:center;filter:url(#sn-warp)}
.sn-loading-grain{position:absolute;inset:0;background-size:180px 180px;mix-blend-mode:overlay;animation:sn-loading-grain-flicker 900ms ease-in-out infinite}
`;

function LoginScreen({ onEnter }) {
  const [correo, setCorreo] = React.useState('carla@serenata.mx');
  const [pass, setPass] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const nickname = correo === 'carla@serenata.mx' ? (window.SN5.user.name.split(' ')[0]) : nicknameFromCorreo(correo);

  const submit = () => {
    if (!pass) { setError('Credenciales incorrectas. Verifica tu correo y contraseña.'); return; }
    setError(''); setLoading(true);
    setTimeout(() => { onEnter && onEnter(); }, 1400);
  };

  if (loading) {
    return (
      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-xl)', padding: 'var(--space-2xl)', background: 'var(--bg-app)', overflow: 'hidden' }}>
        <style>{SN_LOADING_CSS}</style>
        <div className="sn-loading-bg" style={{ backgroundImage: 'url(' + SN5_LOGIN_BG + ')' }} />
        <div className="sn-loading-grain" style={{ backgroundImage: 'url(' + SN5_GRAIN_TILE + ')' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <window.SplashMark size={100} />
          <div style={{ textAlign: 'center' }}>
            <div className="sn-display" style={{ fontSize: 'var(--text-h2)', color: '#fff' }}>Bienvenido, {nickname}</div>
            <div style={{ marginTop: 9, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>Entrando a Serenata…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <style>{SN_INTRO_CSS}</style>
      <div className="sn-login-intro">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id="sn-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="sn-noise">
              <animate attributeName="baseFrequency" values="0.008 0.012;0.013 0.007;0.008 0.012" dur="6s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="sn-noise" scale="70" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <div className="sn-intro-texture-bg" />
        <div className="sn-intro-grain" style={{ backgroundImage: 'url(' + SN5_GRAIN_TILE + ')' }} />
        <div className="sn-intro-wordmark-wrap">
          <img className="sn-intro-wordmark-img" src={SN5_WORDMARK_WHITE} alt="Serenata" />
        </div>
      </div>
      <ThemeToggle />
      <div className="sn-login-card-in" style={{ position: 'relative', width: '100%', maxWidth: 392, display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={{ width: 88, height: 88, WebkitMaskImage: 'url(' + SN5_LOGO_ALPHA + ')', maskImage: 'url(' + SN5_LOGO_ALPHA + ')', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', background: 'var(--accent)' }} />
          <div className="sn-eyebrow">Gestión Serenata</div>
        </div>

        <Card padding="var(--space-xl)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <TextField label="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@serenata.mx" />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <span className="sn-label">Contraseña</span>
            <input
              type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              style={{ height: 'var(--control-height)', padding: '0 14px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}
            />
          </label>

          {error ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 'var(--radius-sm)', background: 'var(--sn-status-cancelled-bg)', color: 'var(--sn-status-cancelled-fg)', fontSize: 'var(--text-md)' }}>
              <Icon name="alert-triangle" size={15} />
              <span>{error}</span>
            </div>
          ) : null}

          <Button variant="primary" size="lg" fullWidth onClick={submit}>Entrar</Button>
        </Card>

        <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>
          Las cuentas se crean desde Admin · Usuarios.
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen });
