/* 9 · Admin · Usuarios y 10 · Admin · Sincronización con Google Sheets.
   Fase 5 no cambia el fondo de ninguna de las dos. */
const { Button, Card, Icon, TextField, FilterTabs, StatusBadge, DataTable, SectionHero } = window.SerenataDesignSystem_993393;

function UsuarioModal({ u, onClose, nuevo }) {
  const [nombre, setNombre] = React.useState(u ? u.nombre : '');
  const [correo, setCorreo] = React.useState(u ? u.correo : '');
  const [pass, setPass] = React.useState('');
  const [secciones, setSecciones] = React.useState(u ? u.secciones : ['Dashboard']);
  const [errores, setErrores] = React.useState({});

  const toggle = (s) => setSecciones(secciones.includes(s) ? secciones.filter((x) => x !== s) : [...secciones, s]);

  const guardar = () => {
    const e = {};
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!/.+@.+\..+/.test(correo)) e.correo = 'Escribe un correo válido.';
    if (nuevo && pass.length < 8) e.pass = 'Mínimo 8 caracteres.';
    if (!secciones.length) e.secciones = 'Asigna al menos una sección.';
    setErrores(e);
    if (!Object.keys(e).length) onClose();
  };

  return (
    <window.Modal
      title={nuevo ? 'Nuevo usuario' : u.nombre} eyebrow="Admin · Usuarios" width={620} onClose={onClose}
      footer={(
        <React.Fragment>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="lg" onClick={guardar}>{nuevo ? 'Crear usuario' : 'Guardar cambios'}</Button>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" hint={errores.nombre} />
        <TextField label="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@serenata.mx" hint={errores.correo} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <span className="sn-label">Contraseña</span>
          <input
            type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder={nuevo ? 'Mínimo 8 caracteres' : 'Dejar vacío para no cambiar'}
            style={{ height: 'var(--control-height)', padding: '0 14px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}
          />
          {errores.pass ? <span style={{ fontSize: 'var(--text-sm)', color: 'var(--sn-status-cancelled-fg)' }}>{errores.pass}</span> : null}
        </label>

        <div>
          <div className="sn-label" style={{ marginBottom: 11 }}>Secciones habilitadas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 11 }}>
            {window.SN5.secciones.map((s) => (
              <window.Checkbox key={s} checked={secciones.includes(s)} onChange={() => toggle(s)} label={s} />
            ))}
          </div>
          {errores.secciones ? <div style={{ marginTop: 9, fontSize: 'var(--text-sm)', color: 'var(--sn-status-cancelled-fg)' }}>{errores.secciones}</div> : null}
        </div>
      </div>
    </window.Modal>
  );
}

function Usuarios() {
  const [usuarios, setUsuarios] = React.useState(window.SN5.usuarios);
  const [editar, setEditar] = React.useState(null);
  const [nuevo, setNuevo] = React.useState(false);

  const toggleActivo = (u) => setUsuarios(usuarios.map((x) => (x === u ? { ...x, activo: !x.activo } : x)));

  const columns = [
    { key: 'nombre', label: 'Nombre', width: '1.2fr', render: (u) => (
      <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-primary)' }}>
        {u.nombre}{u.yo ? <span style={{ color: 'var(--text-faint)', fontWeight: 'var(--weight-regular)' }}> (tú)</span> : null}
      </span>
    ) },
    { key: 'correo', label: 'Correo', width: '1.3fr' },
    { key: 'secciones', label: 'Secciones asignadas', width: '2.2fr', render: (u) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
        {u.secciones.map((s) => (
          <span key={s} style={{ padding: '3px 9px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-row-alt)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</span>
        ))}
      </div>
    ) },
    { key: 'activo', label: 'Estado', width: '110px', render: (u) => <StatusBadge status={u.activo ? 'aprobada' : 'borrador'}>{u.activo ? 'Activo' : 'Inactivo'}</StatusBadge> },
    { key: 'acciones', label: 'Acciones', width: '210px', align: 'right', render: (u) => (
      <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="md" onClick={() => setEditar(u)}>Editar</Button>
        <Button variant="secondary" size="md" disabled={u.yo} onClick={() => toggleActivo(u)}>{u.activo ? 'Desactivar' : 'Activar'}</Button>
      </div>
    ) },
  ];

  return (
    <React.Fragment>
      <window.Panel
        title="Usuarios" padding="0"
        action={<Button variant="primary" size="md" iconLeft="plus" onClick={() => setNuevo(true)}>Nuevo usuario</Button>}
      >
        <DataTable columns={columns} rows={usuarios} minWidth={980} />
      </window.Panel>
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>
        No puedes desactivar tu propio usuario. No hay registro público: las cuentas se crean aquí.
      </p>
      {editar ? <UsuarioModal u={editar} onClose={() => setEditar(null)} /> : null}
      {nuevo ? <UsuarioModal nuevo onClose={() => setNuevo(false)} /> : null}
    </React.Fragment>
  );
}

const SN5_PASOS_SHEETS = [
  'Reautoriza la cuenta de Google con permisos de Drive y Sheets.',
  'Actualiza las variables de entorno del servidor con el token nuevo.',
  'Crea el Sheet con el botón "Crear Sheet" de abajo.',
  'Copia el spreadsheetId que aparece y pégalo en la configuración.',
];

function Sincronizacion() {
  const s = window.SN5.sheets;
  const [corriendo, setCorriendo] = React.useState(null);
  const [resultado, setResultado] = React.useState(null);
  const [error, setError] = React.useState('');

  const correr = (accion) => {
    setError(''); setResultado(null); setCorriendo(accion);
    setTimeout(() => {
      setCorriendo(null);
      if (accion === 'crear') { setError('No se pudo crear el Sheet: el token de Google expiró. Reautoriza la cuenta y vuelve a intentar.'); return; }
      setResultado({ accion, pestanas: s.pestanas });
    }, 1100);
  };

  const totales = resultado
    ? resultado.pestanas.reduce((a, p) => ({ insertadas: a.insertadas + p.insertadas, actualizadas: a.actualizadas + p.actualizadas, borradas: a.borradas + p.borradas, errores: a.errores + p.errores }), { insertadas: 0, actualizadas: 0, borradas: 0, errores: 0 })
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
      <window.Panel title="Configuración inicial">
        <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {SN5_PASOS_SHEETS.map((p, i) => (
            <li key={i} style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 'var(--lh-body)' }}>{p}</li>
          ))}
        </ol>
        <div style={{ marginTop: 'var(--space-lg)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
          <div className="sn-label" style={{ marginBottom: 7 }}>spreadsheetId actual</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '10px 13px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.spreadsheetId}</span>
            <button type="button" aria-label="Copiar" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}><Icon name="copy" size={15} /></button>
          </div>
        </div>
      </window.Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', minWidth: 0 }}>
        <window.Panel title="Acciones">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[
              { id: 'crear', label: 'Crear Sheet', nota: 'Inicializa el spreadsheet con una pestaña por tabla.', icon: 'plus' },
              { id: 'export', label: 'Supabase → Sheets', nota: 'Exporta la base de datos al Sheet.', icon: 'upload' },
              { id: 'import', label: 'Sheets → Supabase', nota: 'Importa al sistema los cambios hechos en el Sheet.', icon: 'download' },
            ].map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-lg)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 160, flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>{a.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>{a.nota}</div>
                </div>
                <Button
                  variant={a.id === 'crear' ? 'secondary' : 'primary'} size="md"
                  iconLeft={corriendo === a.id ? 'loader' : a.icon}
                  disabled={!!corriendo} onClick={() => correr(a.id)}
                >
                  {corriendo === a.id ? 'Corriendo…' : 'Ejecutar'}
                </Button>
              </div>
            ))}
          </div>
        </window.Panel>

        {error ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--sn-status-cancelled-bg)', color: 'var(--sn-status-cancelled-fg)' }}>
            <Icon name="alert-triangle" size={17} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', lineHeight: 'var(--lh-body)' }}>{error}</span>
          </div>
        ) : null}

        {resultado ? (
          <window.Panel
            title="Resultado" padding="0"
            action={<Button variant="ghost" size="md" iconRight="external-link">Abrir el Sheet</Button>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 'var(--space-lg)', padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
              {[
                ['Insertadas', totales.insertadas, 'var(--sn-status-approved-fg)'],
                ['Actualizadas', totales.actualizadas, 'var(--text-primary)'],
                ['Borradas', totales.borradas, 'var(--text-muted)'],
                ['Errores', totales.errores, totales.errores ? 'var(--sn-status-cancelled-fg)' : 'var(--text-muted)'],
              ].map(([l, v, c]) => (
                <div key={l}>
                  <div className="sn-label" style={{ marginBottom: 5 }}>{l}</div>
                  <div className="sn-display" style={{ fontSize: 'var(--text-h3)', color: c }}>{v}</div>
                </div>
              ))}
            </div>
            {resultado.pestanas.map((p, i) => (
              <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '11px var(--space-lg)', borderBottom: i === resultado.pestanas.length - 1 ? 0 : '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                <Icon name={p.ok ? 'check' : 'x'} size={15} strokeWidth={2.5} color={p.ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)'} />
                <span style={{ minWidth: 120, flex: 1, fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{p.nombre}</span>
                <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
                  {p.ok ? p.insertadas + ' ins · ' + p.actualizadas + ' act · ' + p.borradas + ' bor' : p.errores + ' errores'}
                </span>
              </div>
            ))}
          </window.Panel>
        ) : null}
      </div>
    </div>
  );
}

function AdminScreen() {
  const [tab, setTab] = React.useState('usuarios');
  return (
    <React.Fragment>
      <SectionHero title="Admin" />
      <FilterTabs
        tabs={[{ id: 'usuarios', label: 'Usuarios' }, { id: 'sync', label: 'Google Sheets' }]}
        value={tab} onChange={setTab} style={{ alignSelf: 'flex-start' }}
      />
      {tab === 'usuarios' ? <Usuarios /> : <Sincronizacion />}
    </React.Fragment>
  );
}

Object.assign(window, { AdminScreen });
