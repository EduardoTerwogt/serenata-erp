/* 1.1 · Lista de Cotizaciones. Filtro por estado con conteo, buscador por
   folio/cliente/proyecto, etiqueta de complementaria y alerta "Sin items". */
const { Button, SearchInput, FilterButton, FilterTabs, Card, Icon, DataTable, TableFooter, StatusBadge, SectionHero } = window.SerenataDesignSystem_993393;

function CotizacionesScreen({ onOpen, onNueva }) {
  const all = window.SN5.cotizaciones;
  const [tab, setTab] = React.useState('todas');
  const [q, setQ] = React.useState('');

  const count = (id) => all.filter((c) => c.estatus === id).length;
  const tabs = [
    { id: 'todas', label: 'Todas', count: all.length },
    { id: 'borrador', label: 'Borrador', count: count('borrador') },
    { id: 'emitida', label: 'Emitida', count: count('emitida') },
    { id: 'aprobada', label: 'Aprobada', count: count('aprobada') },
    { id: 'cancelada', label: 'Cancelada', count: count('cancelada') },
  ];

  const rows = all.filter((c) => {
    if (tab !== 'todas' && c.estatus !== tab) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (c.folio + ' ' + c.cliente + ' ' + c.proyecto).toLowerCase().includes(t);
  });

  const columns = [
    { key: 'folio', label: 'Folio', width: '150px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
    { key: 'proyecto', label: 'Proyecto', width: '1.5fr', render: (r) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.proyecto}</div>
        {r.complementariaDe ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', letterSpacing: '0.02em', marginTop: 2 }}>Complementaria de {r.complementariaDe}</div>
        ) : null}
      </div>
    ) },
    { key: 'cliente', label: 'Cliente', width: '1fr' },
    { key: 'total', label: 'Total', width: '1fr', align: 'right', render: (r) => (
      r.sinItems
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--sn-status-cancelled-fg)', fontSize: 'var(--text-md)' }}><Icon name="alert-triangle" size={14} />Sin items</span>
        : <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>{window.SN5_MXN(r.total)}</span>
    ) },
    { key: 'entrega', label: 'Entrega', width: '1fr' },
    { key: 'estatus', label: 'Estatus', width: '124px', align: 'right', render: (r) => <StatusBadge status={r.estatus} /> },
  ];

  return (
    <React.Fragment>
      <SectionHero
        title="Cotizaciones"
        action={<Button variant="primary" size="lg" iconLeft="plus" onClick={onNueva}>Nueva cotización</Button>}
      />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <SearchInput
          size="lg" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por folio, cliente o proyecto…"
          style={{ flex: '0 1 420px', minWidth: 240 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
        <FilterTabs tabs={tabs} value={tab} onChange={setTab} style={{ flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 12 }} />
        <FilterButton style={{ flex: 'none' }} />
      </div>

      <Card padding="0">
        <DataTable columns={columns} rows={rows} onRowClick={onOpen} emptyLabel="Ninguna cotización coincide con el filtro" />
        <TableFooter shown={rows.length} total={all.length} unit="cotizaciones" />
      </Card>
    </React.Fragment>
  );
}

Object.assign(window, { CotizacionesScreen });
