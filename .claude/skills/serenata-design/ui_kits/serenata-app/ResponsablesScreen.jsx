/* 6 · Responsables (colaboradores / freelancers). Lista en grilla, alta y
   detalle con historial de proyectos y total acumulado. Fase 5 no cambia el
   fondo de esta pantalla: se conserva tal cual está hoy. */
const { Button, Card, Icon, Avatar, SearchInput, TextField, FilterTabs, StatusBadge, DataTable, SectionHero } = window.SerenataDesignSystem_993393;

function ContactoRow({ icon, children }) {
  if (!children) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--text-md)', color: 'var(--text-muted)', minWidth: 0 }}>
      <Icon name={icon} size={14} color="var(--text-faint)" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

function RolTag({ children, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: onRemove ? '5px 7px 5px 12px' : '5px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-row-alt)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
      {children}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={'Quitar ' + children} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-faint)', padding: 0, display: 'flex' }}><Icon name="x" size={13} /></button>
      ) : null}
    </span>
  );
}

function ColaboradorForm({ r, onClose, nuevo }) {
  const [activo, setActivo] = React.useState(r ? r.activo : true);
  const [roles, setRoles] = React.useState(r ? r.roles : []);
  const [nuevoRol, setNuevoRol] = React.useState('');
  const [nombre, setNombre] = React.useState(r ? r.nombre : '');
  const [error, setError] = React.useState('');
  const total = r ? r.historial.reduce((a, h) => a + h.monto, 0) : 0;

  const guardar = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    onClose();
  };

  return (
    <window.Modal
      title={nuevo ? 'Nuevo colaborador' : r.nombre}
      eyebrow={nuevo ? 'Responsables' : roles.join(' · ')}
      width={900} onClose={onClose}
      footer={(
        <React.Fragment>
          {!nuevo ? (
            <FilterTabs
              tabs={[{ id: true, label: 'Activo' }, { id: false, label: 'Inactivo' }]}
              value={activo} onChange={setActivo}
            />
          ) : null}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="lg" onClick={guardar}>{nuevo ? 'Crear colaborador' : 'Guardar cambios'}</Button>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 'var(--space-lg)' }}>
          <TextField label="Nombre · requerido" value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }} placeholder="Nombre y apellido" hint={error} />
          <TextField label="Teléfono" defaultValue={r ? r.telefono : ''} placeholder="33 0000 0000" />
          <TextField label="Correo" defaultValue={r ? r.correo : ''} placeholder="nombre@dominio.mx" />
        </div>

        <div>
          <div className="sn-label" style={{ marginBottom: 11 }}>Roles</div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: roles.length ? 'var(--space-md)' : 0 }}>
            {roles.map((x) => <RolTag key={x} onRemove={() => setRoles(roles.filter((y) => y !== x))}>{x}</RolTag>)}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', maxWidth: 420 }}>
            <TextField label="Agregar rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} placeholder="Ej. Director de Fotografía" />
            <Button variant="secondary" size="md" onClick={() => { if (nuevoRol.trim()) { setRoles([...roles, nuevoRol.trim()]); setNuevoRol(''); } }}>Agregar</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 'var(--space-lg)' }}>
          <TextField label="Banco" defaultValue={r ? r.banco : ''} placeholder="BBVA" />
          <TextField label="CLABE · 18 dígitos" defaultValue={r ? r.clabe : ''} placeholder="000000000000000000" maxLength={18} />
        </div>

        <window.Field label="Notas">
          <textarea
            defaultValue={r ? r.notas : ''} rows={2} placeholder="Acuerdos, condiciones, equipo propio…"
            style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)' }}
          />
        </window.Field>

        {!nuevo ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-md)', marginBottom: 11 }}>
              <span className="sn-label">Historial de proyectos</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Total acumulado</span>
              <span className="sn-display" style={{ fontSize: 'var(--text-h3)', color: 'var(--accent)' }}>{window.SN5_MXN(total)}</span>
            </div>
            <Card padding="0" tone="row">
              <DataTable
                minWidth={0}
                columns={[
                  { key: 'proyecto', label: 'Proyecto', width: '1.4fr', strong: true },
                  { key: 'cliente', label: 'Cliente', width: '1fr' },
                  { key: 'fecha', label: 'Fecha del evento', width: '1fr' },
                  { key: 'rol', label: 'Rol', width: '1.2fr' },
                  { key: 'monto', label: 'X pagar', width: '110px', align: 'right', render: (h) => window.SN5_MXN(h.monto) },
                ]}
                rows={r.historial}
                emptyLabel="Todavía no participa en ningún proyecto"
              />
            </Card>
          </div>
        ) : null}
      </div>
    </window.Modal>
  );
}

function ResponsablesScreen() {
  const all = window.SN5.responsables;
  const [q, setQ] = React.useState('');
  const [abierto, setAbierto] = React.useState(null);
  const [nuevo, setNuevo] = React.useState(false);

  const rows = all.filter((r) => !q.trim() || r.nombre.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <React.Fragment>
      <SectionHero
        title="Responsables"
        action={<Button variant="primary" size="lg" iconLeft="plus" onClick={() => setNuevo(true)}>Nuevo colaborador</Button>}
      />

      <SearchInput size="lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" style={{ alignSelf: 'flex-start', width: '100%', maxWidth: 420 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-lg)' }}>
        {rows.map((r) => (
          <Card
            key={r.nombre} onClick={() => setAbierto(r)} padding="var(--space-lg)"
            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minWidth: 0, opacity: r.activo ? 1 : 0.55 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', minWidth: 0 }}>
              <Avatar initials={r.initials} size={38} tone={r.activo ? 'accent' : 'neutral'} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{r.historial.length} proyecto{r.historial.length === 1 ? '' : 's'}</div>
              </div>
              <StatusBadge status={r.activo ? 'aprobada' : 'borrador'}>{r.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {r.roles.map((x) => <RolTag key={x}>{x}</RolTag>)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
              <ContactoRow icon="phone">{r.telefono}</ContactoRow>
              <ContactoRow icon="mail">{r.correo}</ContactoRow>
              <ContactoRow icon="landmark">{r.banco}</ContactoRow>
            </div>
          </Card>
        ))}
      </div>

      {abierto ? <ColaboradorForm r={abierto} onClose={() => setAbierto(null)} /> : null}
      {nuevo ? <ColaboradorForm nuevo onClose={() => setNuevo(false)} /> : null}
    </React.Fragment>
  );
}

Object.assign(window, { ResponsablesScreen, RolTag });
