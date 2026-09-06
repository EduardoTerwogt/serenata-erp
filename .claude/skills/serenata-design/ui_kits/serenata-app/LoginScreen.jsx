/* 11 · Login — tarjeta centrada, sin registro público. La textura de marca
   aparece detrás del wordmark, que es uno de los usos que el brief describe
   ("wordmark blanco sobre textura degradada"). */
const { Card, Button, Icon, Wordmark, TextField } = window.SerenataDesignSystem_993393;

function LoginScreen({ onEnter }) {
  const [correo, setCorreo] = React.useState('carla@serenata.mx');
  const [pass, setPass] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = () => {
    if (!pass) { setError('Credenciales incorrectas. Verifica tu correo y contraseña.'); return; }
    setError(''); setLoading(true);
    setTimeout(() => { setLoading(false); onEnter && onEnter(); }, 700);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)', background: 'var(--sn-texture)', backgroundSize: 'cover', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,19,24,.88) 0%,rgba(15,19,24,.94) 100%)', backdropFilter: 'blur(64px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 392, display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Wordmark variant="wordmark" tone="white" size={27} />
          <div className="sn-eyebrow">ERP de producción</div>
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

          <Button variant="primary" size="lg" fullWidth onClick={submit} disabled={loading} iconLeft={loading ? 'loader' : undefined}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </Card>

        <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>
          Las cuentas se crean desde Admin · Usuarios.
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen });
