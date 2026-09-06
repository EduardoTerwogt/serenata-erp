/* 5 · Dashboard Ejecutivo (Fase 5.6). Cada gráfica y tarjeta navega a su
   sección de detalle. El manejo de error es por fuente: si una falla, el resto
   del dashboard sigue funcionando. */
const { Card, Button, Icon, Select, DataTable, StatusBadge } = window.SerenataDesignSystem_993393;
const { SectionHero } = window.SerenataDesignSystem_993393;

function FuenteError({ nombre, onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--sn-status-cancelled-bg)', color: 'var(--sn-status-cancelled-fg)' }}>
      <Icon name="alert-triangle" size={17} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)' }}>No se pudo cargar {nombre}. El resto del dashboard sigue disponible.</div>
      <Button variant="secondary" size="md" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

function CoberturaMes({ gastos, facturado }) {
  const total = gastos.reduce((a, g) => a + g.monto, 0);
  const cobertura = Math.min(100, facturado / total * 100);
  const excedente = facturado - total;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 11 }}>
          <div className="sn-display" style={{ fontSize: 'var(--text-h2)', color: excedente >= 0 ? 'var(--sn-status-approved-fg)' : 'var(--accent)' }}>
            {excedente >= 0 ? '+' : '−'}{window.SN5_MXN(Math.abs(excedente))}
          </div>
          <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{Math.round(cobertura)}% cubierto</div>
        </div>
        <window.ProgressBar value={cobertura} height={7} tone={excedente >= 0 ? 'var(--sn-status-approved-bg)' : 'var(--accent)'} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {gastos.map((g) => (
          <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', fontSize: 'var(--text-base)' }}>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)' }}>{g.label}</span>
            <span style={{ color: 'var(--text-body)' }}>{window.SN5_MXN(g.monto)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--text-base)' }}>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--text-body)', fontWeight: 'var(--weight-semibold)' }}>Gastos fijos del mes</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(total)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', fontSize: 'var(--text-base)' }}>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--text-body)', fontWeight: 'var(--weight-semibold)' }}>Facturado al cliente</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(facturado)}</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
        Considera el desfase: un proyecto puede facturarse al cliente en un mes distinto al que sus proveedores facturan.
      </p>
    </div>
  );
}

function DashboardScreen({ onGo }) {
  const d = window.SN5.dashboard;
  const [periodo, setPeriodo] = React.useState('mes');
  const [errFuente, setErrFuente] = React.useState(false);

  const kpiTarget = { cobrar: 'cuentas', pagar: 'cuentas', aprobadas: 'cotizaciones', borrador: 'cotizaciones' };

  const recientes = window.SN5.cotizaciones.slice(0, 6);
  const columns = [
    { key: 'folio', label: 'Folio', width: '90px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
    { key: 'proyecto', label: 'Proyecto', width: '1.4fr', strong: true },
    { key: 'cliente', label: 'Cliente', width: '1fr' },
    { key: 'total', label: 'Total', width: '1fr', align: 'right', render: (r) => window.SN5_MXN(r.total) },
    { key: 'estatus', label: 'Estatus', width: '120px', align: 'right', render: (r) => <StatusBadge status={r.estatus} /> },
  ];

  return (
    <React.Fragment>
      <SectionHero
        title="Inicio"
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap', minWidth: 0 }}>
            <Select size="md" value={periodo} onChange={(e) => setPeriodo(e.target.value)} options={[{ value: 'mes', label: 'Abril 2025' }, { value: 'trim', label: 'Q2 2025' }, { value: 'anio', label: 'Año 2025' }]} />
            <Button variant="secondary" size="lg" iconLeft="download">Exportar balance</Button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 'var(--space-lg)' }}>
        {d.kpis.map((k) => (
          <window.Metric
            key={k.id} label={k.label} nota={k.nota} accent={k.id === 'cobrar'}
            value={k.moneda === false ? k.valor : window.SN5_MXN(k.valor)}
            onClick={() => onGo(kpiTarget[k.id])}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 'var(--space-lg)' }}>
        <window.Panel
          title={'Balance por periodo · ' + d.periodo}
          eyebrow="Miles de pesos"
          action={<window.Legend series={window.SN5_SERIES} />}
        >
          <window.BarChart
            data={d.balance} series={window.SN5_SERIES} height={186}
            onBarClick={() => onGo('cuentas')}
            format={(v) => '$ ' + v.toLocaleString('es-MX') + 'k'}
          />
          <p style={{ margin: '15px 0 0', fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>Da clic en cualquier mes para abrir Cuentas filtrado por ese periodo.</p>
        </window.Panel>

        <window.Panel title="Cruce del periodo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {[
              { label: 'Ingresos', v: d.fiscal.ingresos, tone: 'var(--text-primary)' },
              { label: 'Egresos', v: d.fiscal.egresos, tone: 'var(--text-body)' },
              { label: 'Impuestos', v: d.fiscal.impuestos, tone: 'var(--text-body)' },
              { label: 'Deudas', v: d.fiscal.deudas, tone: 'var(--accent)' },
            ].map((r) => (
              <div key={r.label}>
                <div className="sn-label" style={{ marginBottom: 5 }}>{r.label}</div>
                <div className="sn-display" style={{ fontSize: 'var(--text-h3)', color: r.tone }}>{window.SN5_MXN(r.v)}</div>
              </div>
            ))}
            <div style={{ paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
              <div className="sn-label" style={{ marginBottom: 5 }}>Utilidad antes de ISR</div>
              <div className="sn-display" style={{ fontSize: 'var(--text-h2)', color: 'var(--sn-status-approved-fg)' }}>{window.SN5_MXN(d.fiscal.ingresos - d.fiscal.egresos - d.fiscal.impuestos)}</div>
              <div style={{ marginTop: 6, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>ISR 30% sobre utilidad · persona moral</div>
            </div>
          </div>
        </window.Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 'var(--space-lg)' }}>
        <window.Panel title="Gastos fijos vs. facturación" action={<Button variant="ghost" size="md" onClick={() => onGo('cuentas')} iconRight="arrow-right">Cuentas</Button>}>
          <CoberturaMes gastos={d.gastosFijos} facturado={d.facturadoMes} />
        </window.Panel>

        <window.Panel title="Actividad del periodo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {d.actividad.map((a) => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-md)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>{a.label}</span>
                <span className="sn-display" style={{ fontSize: 'var(--text-h3)', color: 'var(--text-primary)' }}>{a.valor}</span>
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
              Los proyectos que cruzan de un mes a otro se cuentan aparte para no perderlos en el corte mensual.
            </p>
          </div>
        </window.Panel>

        <window.Panel
          title="Cotizaciones recientes" padding="0"
          action={(
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', minWidth: 0 }}>
              <Button variant="ghost" size="md" onClick={() => setErrFuente(!errFuente)}>{errFuente ? 'Restaurar fuente' : 'Simular error'}</Button>
              <Button variant="ghost" size="md" onClick={() => onGo('cotizaciones')} iconRight="arrow-right">Ver todas</Button>
            </div>
          )}
        >
          {errFuente
            ? <div style={{ padding: 'var(--space-lg)' }}><FuenteError nombre="Cotizaciones" onRetry={() => setErrFuente(false)} /></div>
            : <DataTable columns={columns} rows={recientes} minWidth={620} onRowClick={() => onGo('cotizaciones')} />}
        </window.Panel>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { DashboardScreen });
