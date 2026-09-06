/* Shell que une las pantallas del kit Fase 5. Login → app shell con rail fijo,
   topbar y la vista activa. Las secciones que Fase 5 no rediseña se muestran
   con su nota de alcance en lugar de un mock inventado. */
const { AppShell, Sidebar, Topbar, SectionHero } = window.SerenataDesignSystem_993393;

function App({ initial, detalle }) {
  const [logged, setLogged] = React.useState(true);
  const [view, setView] = React.useState(initial || 'inicio');
  const [cotizacion, setCotizacion] = React.useState(detalle ? window.SN5.cotizaciones[0] : null);

  const go = (id) => { setCotizacion(null); setView(id); };

  if (!logged) return <window.LoginScreen onEnter={() => setLogged(true)} />;

  let content;
  if (cotizacion) content = <window.CotizacionDetalleScreen cotizacion={cotizacion} onBack={() => setCotizacion(null)} onGo={go} />;
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
        <SectionHero title={label} />
        <window.Placeholder text={window.SN5.pendientes[view] || 'Pantalla pendiente de diseño.'} />
      </React.Fragment>
    );
  }

  return (
    <AppShell
      sidebar={<Sidebar items={window.SN5.nav} activeId={cotizacion ? 'cotizaciones' : view} onSelect={go} />}
      topbar={<Topbar user={window.SN5.user} />}
    >
      {content}
    </AppShell>
  );
}

Object.assign(window, { App });
