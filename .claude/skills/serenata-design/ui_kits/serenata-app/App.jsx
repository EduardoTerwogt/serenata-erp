/* Shell que une las pantallas del kit de UI. Login → app shell con rail fijo,
   topbar y la vista activa. */
const { AppShell, Sidebar, Topbar, Icon } = window.SerenataDesignSystem_993393;

function ThemeToggle() {
  const [theme, setTheme] = React.useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('sn5-theme')) || 'light');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sn5-theme', theme); } catch (e) {}
  }, [theme]);
  const light = theme === 'light';
  const btnStyle = (on) => ({
    width: 24, height: 24, borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 0, cursor: 'pointer', background: on ? 'var(--surface-card)' : 'transparent',
    color: on ? 'var(--accent)' : 'var(--text-faint)', boxShadow: on ? 'var(--shadow-segment)' : 'none',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--sn-toggle-track)', borderRadius: 'var(--radius-pill)', padding: 3 }}>
      <button type="button" onClick={() => setTheme('light')} style={btnStyle(light)} title="Claro"><Icon name="sun" size={13} /></button>
      <button type="button" onClick={() => setTheme('dark')} style={btnStyle(!light)} title="Oscuro"><Icon name="moon" size={13} /></button>
    </div>
  );
}

function App({ initial, detalle }) {
  const [logged, setLogged] = React.useState(true);
  const [view, setView] = React.useState(initial || 'inicio');
  const [cotizacion, setCotizacion] = React.useState(detalle ? window.SN5.cotizaciones[0] : null);
  const [loadingSection, setLoadingSection] = React.useState(false);
  const [pendingView, setPendingView] = React.useState(null);

  const go = (id) => {
    if (id === view && !cotizacion) return;
    setPendingView(id);
    setLoadingSection(true);
  };

  React.useEffect(() => {
    if (!loadingSection) return undefined;
    const t = setTimeout(() => {
      setCotizacion(null);
      setView(pendingView);
      setLoadingSection(false);
    }, 620);
    return () => clearTimeout(t);
  }, [loadingSection, pendingView]);

  if (!logged) return <window.LoginScreen onEnter={() => setLogged(true)} />;

  let content;
  if (loadingSection) {
    content = (
      <div style={{ flex: 1, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <window.SplashMark size={200} />
      </div>
    );
  } else if (cotizacion) content = <window.CotizacionDetalleScreen cotizacion={cotizacion} onBack={() => setCotizacion(null)} onGo={go} />;
  else if (view === 'inicio') content = <window.DashboardScreen onGo={go} />;
  else if (view === 'cotizaciones') content = <window.CotizacionesScreen onOpen={setCotizacion} onNueva={() => setCotizacion({ folio: 'SH015', estatus: 'borrador' })} />;
  else if (view === 'proyectos') content = <window.ProyectosScreen />;
  else if (view === 'cuentas') content = <window.CuentasScreen />;
  else if (view === 'portal') content = <window.PortalScreen />;
  else if (view === 'responsables') content = <window.ResponsablesScreen />;
  else if (view === 'planeacion') content = <window.PlaneacionScreen />;
  else if (view === 'plantillas') content = <window.PlantillasScreen />;
  else if (view === 'admin') content = <window.AdminScreen />;
  else {
    const label = (window.SN5.nav.find((n) => n.id === view) || {}).label || view;
    content = (
      <React.Fragment>
        <div className="sn-display" style={{ fontSize: 22 }}>{label}</div>
        <window.Placeholder text={window.SN5.pendientes[view] || 'Pantalla pendiente de diseño.'} />
      </React.Fragment>
    );
  }

  const crumbLabel = cotizacion ? 'Cotizaciones' : (window.SN5.nav.find((n) => n.id === view) || {}).label;

  return (
    <AppShell
      sidebar={<Sidebar items={window.SN5.nav} activeId={cotizacion ? 'cotizaciones' : view} onSelect={go} />}
      topbar={<Topbar user={window.SN5.user} left={<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{crumbLabel}</span>} right={<ThemeToggle />} />}
    >
      {content}
    </AppShell>
  );
}

Object.assign(window, { App });
