/* 2 · Proyectos (Fase 5.2). Tablero / Lista / Calendario sobre los mismos
   datos, y un panel de detalle que conserva todos los campos actuales y agrega
   plantillas auto-llenables, documentos, reporte de cierre y el asistente
   sobre historial de proyectos. */
const { Button, Card, Icon, Avatar, Select, SearchInput, FilterButton, DataTable, TableFooter, FilterTabs, SectionHero } = window.SerenataDesignSystem_993393;

function ProyectoCard({ p, onOpen }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Card
      onClick={() => onOpen(p)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      padding="var(--space-md)" radius="var(--radius-lg)"
      style={{ cursor: 'pointer', background: hover ? 'var(--surface-row-alt)' : 'var(--surface-row)', transition: 'var(--transition-control)', display: 'flex', flexDirection: 'column', gap: 11 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <window.Folio size={12} color="var(--text-faint)">{p.folio}</window.Folio>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.entrega}</span>
      </div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', lineHeight: 'var(--lh-snug)' }}>{p.nombre}</div>
      <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{p.cliente}</div>
      <window.ProgressBar value={p.progreso} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex' }}>
          {p.equipo.map((e, i) => <Avatar key={e} initials={e} size={24} style={{ marginLeft: i ? -7 : 0, border: '2px solid var(--surface-row)' }} />)}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{p.progreso}%</span>
      </div>
    </Card>
  );
}

function Tablero({ proyectos, onOpen }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
      {window.SN5.estadosProyecto.map((estado) => {
        const col = proyectos.filter((p) => p.estado === estado);
        return (
          <div key={estado} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px' }}>
              <span className="sn-label">{estado}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{col.length}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>
            {col.map((p) => <ProyectoCard key={p.folio} p={p} onOpen={onOpen} />)}
            {!col.length ? <div style={{ padding: 'var(--space-lg)', textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--text-faint)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>Sin proyectos</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function Calendario({ proyectos, onOpen }) {
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const start = 1; /* 01 abr 2025 cae en martes: un hueco al inicio */
  const cells = Array.from({ length: 35 }, (_, i) => i - start + 1);
  const porDia = {};
  proyectos.forEach((p) => {
    const d = parseInt(p.entrega.slice(0, 2), 10);
    porDia[d] = porDia[d] || []; porDia[d].push(p);
  });
  return (
    <Card padding="0">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: '1px solid var(--border-subtle)' }}>
        {dias.map((d) => <div key={d} className="sn-label" style={{ padding: '13px var(--space-md)' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
        {cells.map((n, i) => (
          <div key={i} style={{ minHeight: 108, padding: 'var(--space-md)', borderRight: (i % 7 === 6) ? 0 : '1px solid var(--border-subtle)', borderBottom: i < 28 ? '1px solid var(--border-subtle)' : 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 'var(--text-md)', color: n >= 1 && n <= 30 ? 'var(--text-muted)' : 'var(--text-faint)', opacity: n >= 1 && n <= 30 ? 1 : 0.35 }}>{n >= 1 && n <= 30 ? String(n).padStart(2, '0') : ''}</span>
            {(porDia[n] || []).map((p) => (
              <button
                key={p.folio} type="button" onClick={() => onOpen(p)}
                style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 'var(--radius-sm)', border: 0, cursor: 'pointer', background: p.estado === 'FINALIZADO' ? 'var(--surface-row-alt)' : 'var(--accent)', color: p.estado === 'FINALIZADO' ? 'var(--text-body)' : 'var(--sn-orange-ink)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.3 }}
              >
                {p.folio} · {p.nombre}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

const SN5_PLANTILLAS_PROY = [
  { id: 'brief', label: 'Brief', icon: 'file-text', estado: 'Precargado', nota: 'Cliente, fechas y locación ya llenos. Falta objetivo y mensaje clave.' },
  { id: 'stakeholders', label: 'Stakeholders', icon: 'users', estado: 'Precargado', nota: 'Responsables asignados del proyecto. Falta contraparte del cliente.' },
  { id: 'ruta', label: 'Ruta crítica', icon: 'git-branch', estado: 'Vacío', nota: 'Hitos por definir a partir de la fecha de entrega.' },
  { id: 'roadmap', label: 'Roadmap', icon: 'calendar', estado: 'Vacío', nota: 'Vista panorámica por semanas, no documento extenso.' },
];

function Asistente() {
  const [msgs, setMsgs] = React.useState([
    { de: 'ia', txt: 'Puedo cruzar datos de proyectos anteriores. Pregúntame por equipos, proveedores o riesgos que ya vivimos.' },
  ]);
  const [q, setQ] = React.useState('');
  const send = () => {
    if (!q.trim()) return;
    const pregunta = q.trim();
    setMsgs((m) => [...m, { de: 'yo', txt: pregunta }, { de: 'ia', txt: 'Buscando en 6 proyectos cerrados…' }]);
    setQ('');
    setTimeout(() => setMsgs((m) => [...m.slice(0, -1), {
      de: 'ia',
      txt: 'En proyectos similares (Spot TV 30" y Campaña Lanzamiento) el riesgo repetido fue el permiso de locación: en ambos llegó 48 h antes del llamado. Marta Quiroz lo gestionó las dos veces. Sugiero abrir el trámite al pasar a PREPRODUCCIÓN.',
      fuentes: ['SH007 · Spot TV 30"', 'SH009 · Campaña Lanzamiento'],
    }]), 900);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxHeight: 260, overflowY: 'auto' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, justifyContent: m.de === 'yo' ? 'flex-end' : 'flex-start' }}>
            {m.de === 'ia' ? <Avatar initials="S" size={26} /> : null}
            <div style={{ maxWidth: '78%', padding: '11px 14px', borderRadius: 'var(--radius-input)', background: m.de === 'yo' ? 'var(--accent)' : 'var(--surface-row)', color: m.de === 'yo' ? 'var(--sn-orange-ink)' : 'var(--text-body)', fontSize: 'var(--text-base)', lineHeight: 'var(--lh-body)' }}>
              {m.txt}
              {m.fuentes ? (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
                  {m.fuentes.map((f) => (
                    <span key={f} style={{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{f}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        <SearchInput
          size="lg" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="¿Qué deberíamos prevenir en este proyecto?" style={{ flex: 1 }}
        />
        <Button variant="primary" size="lg" iconLeft="send" onClick={send}>Preguntar</Button>
      </div>
    </div>
  );
}

function DetallePanel({ p, onClose }) {
  const [tab, setTab] = React.useState('general');
  const [estado, setEstado] = React.useState(p.estado);
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'plantillas', label: 'Plantillas' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'asistente', label: 'Asistente' },
  ];
  const partidas = window.SN5.cuentasPagar.filter((c) => c.folio === p.folio);

  return (
    <window.Modal
      title={p.nombre} eyebrow={p.folio + ' · ' + p.cliente} width={980} onClose={onClose}
      footer={(
        <React.Fragment>
          <Button variant="secondary" size="lg" iconLeft="printer">Hoja de llamado (PDF)</Button>
          <Button variant="secondary" size="lg" iconLeft="calendar">Agregar a Google Calendar</Button>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="lg" iconLeft="git-branch">Crear complementaria</Button>
        </React.Fragment>
      )}
    >
      <FilterTabs tabs={tabs} value={tab} onChange={setTab} style={{ marginBottom: 'var(--space-lg)' }} />

      {tab === 'general' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 'var(--space-lg)' }}>
              <window.Field label="Estado">
              <Select size="md" value={estado} onChange={(e) => setEstado(e.target.value)} options={window.SN5.estadosProyecto} style={{ width: '100%' }} />
            </window.Field>
            <window.Field label="Fecha de entrega" value={p.entrega} />
            <window.Field label="Avance">
              <div style={{ paddingTop: 8 }}><window.ProgressBar value={p.progreso} /></div>
            </window.Field>
            <window.Field label="Locación" value={p.locacion} />
            <window.Field label="Horarios" value={p.horarios} />
            <window.Field label="Punto de encuentro" value={p.punto} />
          </div>

          {estado === 'FINALIZADO' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--sn-status-approved-bg)', color: 'var(--sn-status-approved-fg)' }}>
              <Icon name="check-circle" size={18} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)' }}>Proyecto cerrado el día siguiente a la entrega. El reporte de cierre y la ficha de órdenes de pago ya se generaron.</div>
              <Button variant="secondary" size="md">Ver reporte de cierre</Button>
            </div>
          ) : null}

          <div>
            <div className="sn-label" style={{ marginBottom: 11 }}>Partidas heredadas de la cotización aprobada</div>
            <Card padding="0" tone="row">
              <DataTable
                minWidth={620}
                columns={[
                  { key: 'descripcion', label: 'Concepto', width: '1.6fr', strong: true },
                  { key: 'responsable', label: 'Responsable', width: '1fr' },
                  { key: 'total', label: 'X pagar', width: '120px', align: 'right', render: (r) => window.SN5_MXN(r.total) },
                  { key: 'estado', label: 'Cuenta', width: '120px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
                ]}
                rows={partidas}
                emptyLabel="Este proyecto no tiene partidas ligadas"
              />
            </Card>
            <p style={{ margin: '11px 0 0', fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
              Si cambias el responsable de una partida, la cuenta por pagar correspondiente se actualiza con el mismo responsable y monto.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'plantillas' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-lg)' }}>
          {SN5_PLANTILLAS_PROY.map((t) => (
            <Card key={t.id} padding="var(--space-lg)" tone="row" style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <Icon name={t.icon} size={18} color="var(--accent)" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{t.label}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 'var(--text-xs)', color: t.estado === 'Precargado' ? 'var(--sn-status-approved-fg)' : 'var(--text-faint)' }}>{t.estado}</span>
                </div>
                <p style={{ margin: '7px 0 13px', fontSize: 'var(--text-md)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{t.nota}</p>
                <Button variant="secondary" size="md">Abrir</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'documentos' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {[
            { n: 'Hoja de llamado · 25 abr', e: 'validado' },
            { n: 'Cotización aprobada ' + p.folio + '.pdf', e: 'validado' },
            { n: 'Permiso de locación', e: 'pendiente' },
            { n: 'Reporte de cierre', e: p.estado === 'FINALIZADO' ? 'validado' : 'pendiente' },
          ].map((d) => (
            <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <Icon name="file-text" size={16} color="var(--text-muted)" />
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{d.n}</span>
              <window.SNBadge state={d.e} />
              <Button variant="ghost" size="md" iconLeft="download">Descargar</Button>
            </div>
          ))}
          <Button variant="secondary" size="lg" iconLeft="plus" style={{ alignSelf: 'flex-start' }}>Subir documento</Button>
        </div>
      ) : null}

      {tab === 'asistente' ? <Asistente /> : null}
    </window.Modal>
  );
}

function ProyectosScreen() {
  const all = window.SN5.proyectos;
  const [vista, setVista] = React.useState('tablero');
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(null);

  const proyectos = all.filter((p) => {
    const t = q.trim().toLowerCase();
    return !t || (p.folio + ' ' + p.nombre + ' ' + p.cliente).toLowerCase().includes(t);
  });

  const columns = [
    { key: 'folio', label: 'Folio', width: '90px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
    { key: 'nombre', label: 'Proyecto', width: '1.5fr', strong: true },
    { key: 'cliente', label: 'Cliente', width: '1fr' },
    { key: 'entrega', label: 'Entrega', width: '1fr' },
    { key: 'locacion', label: 'Locación', width: '1.2fr' },
    { key: 'equipo', label: 'Equipo', width: '120px', render: (r) => (
      <div style={{ display: 'flex' }}>{r.equipo.map((e, i) => <Avatar key={e} initials={e} size={22} style={{ marginLeft: i ? -7 : 0, border: '2px solid var(--surface-card)' }} />)}</div>
    ) },
    { key: 'estado', label: 'Estado', width: '140px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
  ];

  return (
    <React.Fragment>
      <SectionHero
        title="Proyectos"
        action={<Button variant="primary" size="lg" iconLeft="plus">Nuevo proyecto</Button>}
      />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <SearchInput size="lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por proyecto, cliente o folio…" style={{ flex: '0 1 420px', minWidth: 240 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
        <FilterTabs
          tabs={[{ id: 'tablero', label: 'Tablero' }, { id: 'lista', label: 'Lista' }, { id: 'calendario', label: 'Calendario' }]}
          value={vista} onChange={setVista} style={{ flex: 'none' }}
        />
        <div style={{ flex: 1, minWidth: 12 }} />
        <FilterButton style={{ flex: 'none' }} />
      </div>

      {vista === 'tablero' ? <Tablero proyectos={proyectos} onOpen={setOpen} /> : null}
      {vista === 'lista' ? (
        <Card padding="0">
          <DataTable columns={columns} rows={proyectos} onRowClick={setOpen} emptyLabel="Ningún proyecto coincide" />
          <TableFooter shown={proyectos.length} total={all.length} unit="proyectos" />
        </Card>
      ) : null}
      {vista === 'calendario' ? <Calendario proyectos={proyectos} onOpen={setOpen} /> : null}

      {open ? <DetallePanel p={open} onClose={() => setOpen(null)} /> : null}
    </React.Fragment>
  );
}

Object.assign(window, { ProyectosScreen });
