/* 7 · Planeación. Wizard de 4 pasos que convierte mensajes informales de email
   o WhatsApp en cotizaciones usando IA para extraer los datos. Fase 5 no
   cambia el fondo de esta pantalla. El descarte de un evento pendiente es
   soft-delete: no se borra, se marca como eliminado y deja de listarse. */
const { Button, Card, Icon, Select, TextField, SearchInput, DataTable, SectionHero } = window.SerenataDesignSystem_993393;

const SN5_PASOS = ['Proyecto', 'Mensaje', 'Validación', 'Confirmación'];

function Pasos({ paso }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
      {SN5_PASOS.map((label, i) => {
        const n = i + 1;
        const hecho = n < paso;
        const activo = n === paso;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <span style={{
                width: 26, height: 26, flex: 'none', borderRadius: 'var(--radius-circle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: activo ? 'var(--accent)' : hecho ? 'var(--sn-status-approved-bg)' : 'var(--surface-input)',
                border: '1px solid ' + (activo || hecho ? 'transparent' : 'var(--border-subtle)'),
                color: activo ? 'var(--sn-orange-ink)' : hecho ? 'var(--sn-status-approved-fg)' : 'var(--text-faint)',
                fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)',
                transition: 'var(--transition-control)',
              }}>
                {hecho ? <Icon name="check" size={13} strokeWidth={3} /> : n}
              </span>
              <span style={{ fontSize: 'var(--text-md)', fontWeight: activo ? 'var(--weight-semibold)' : 'var(--weight-medium)', color: activo ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {n < SN5_PASOS.length ? <div style={{ flex: 1, minWidth: 16, height: 1, background: 'var(--border-subtle)' }} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Pendientes({ pendientes, onDescartar, onProcesar, onBack }) {
  return (
    <React.Fragment>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <Button variant="ghost" size="md" iconLeft="arrow-left" onClick={onBack}>Planeación</Button>
        <h1 className="sn-display" style={{ margin: 0, fontSize: 'var(--text-h2)' }}>Eventos pendientes</h1>
      </div>
      <window.Panel title="Sin completar" padding="0" action={<span style={{ fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>Descartar no borra el registro, sólo lo saca de la lista</span>}>
        {pendientes.length ? pendientes.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '15px var(--space-lg)', borderBottom: i === pendientes.length - 1 ? 0 : '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
            <window.Folio size={12} color="var(--text-faint)">{p.id}</window.Folio>
            <div style={{ minWidth: 180, flex: 1 }}>
              <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>{p.asunto}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>{p.origen} · recibido {p.recibido}</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-md)', color: 'var(--sn-status-cancelled-fg)' }}>
              <Icon name="alert-triangle" size={14} />{p.falta}
            </span>
            <Button variant="secondary" size="md" onClick={onProcesar}>Procesar</Button>
            <Button variant="ghost" size="md" onClick={() => onDescartar(p.id)}>Descartar</Button>
          </div>
        )) : (
          <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-muted)' }}>No queda ningún evento pendiente.</div>
        )}
      </window.Panel>
    </React.Fragment>
  );
}

function PlaneacionScreen() {
  const p = window.SN5.planeacion;
  const [vista, setVista] = React.useState('wizard');
  const [pendientes, setPendientes] = React.useState(p.pendientes);
  const [paso, setPaso] = React.useState(1);
  const [modo, setModo] = React.useState('nuevo');
  const [proyecto, setProyecto] = React.useState('');
  const [mensaje, setMensaje] = React.useState('');
  const [analizando, setAnalizando] = React.useState(false);
  const [eventos, setEventos] = React.useState([]);
  const [toast, setToast] = React.useState(null);

  const analizar = () => {
    setAnalizando(true);
    setTimeout(() => { setEventos(p.extraidos.map((e) => ({ ...e }))); setAnalizando(false); setPaso(3); }, 900);
  };
  const setEv = (i, k, v) => setEventos((es) => es.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  if (vista === 'pendientes') {
    return (
      <Pendientes
        pendientes={pendientes}
        onBack={() => setVista('wizard')}
        onDescartar={(id) => setPendientes(pendientes.filter((x) => x.id !== id))}
        onProcesar={() => { setVista('wizard'); setPaso(2); setMensaje(p.mensaje); }}
      />
    );
  }

  return (
    <React.Fragment>
      <SectionHero
        title="Planeación"
        action={<Button variant="secondary" size="lg" iconRight="arrow-right" onClick={() => setVista('pendientes')}>Eventos pendientes · {pendientes.length}</Button>}
      />

      {pendientes.length ? (
        <button
          type="button" onClick={() => setVista('pendientes')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%', padding: '13px var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left' }}
        >
          <Icon name="inbox" size={16} color="var(--accent)" />
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>
            Tienes {pendientes.length} eventos sin completar o confirmar.
          </span>
          <Icon name="chevron-right" size={16} color="var(--text-muted)" />
        </button>
      ) : null}

      <window.Panel title="Convertir un mensaje en cotización" action={<Pasos paso={paso} />} bodyStyle={{ paddingTop: 'var(--space-xl)' }}>
        {paso === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', maxWidth: 520 }}>
            <window.Field label="¿Es un proyecto que ya existe?">
              <Select
                size="md" value={modo} onChange={(e) => setModo(e.target.value)} style={{ width: '100%' }}
                options={[{ value: 'nuevo', label: 'Es un proyecto nuevo' }, { value: 'existente', label: 'Ya existe en el sistema' }]}
              />
            </window.Field>
            {modo === 'existente' ? (
              <window.Field label="Proyecto">
                <Select size="md" value={proyecto} onChange={(e) => setProyecto(e.target.value)} style={{ width: '100%' }} options={[{ value: '', label: 'Selecciona un proyecto…' }, ...window.SN5.proyectos.map((x) => ({ value: x.folio, label: x.folio + ' · ' + x.nombre }))]} />
              </window.Field>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
                La IA propondrá el nombre del proyecto a partir del mensaje. Podrás corregirlo en el paso de validación.
              </p>
            )}
            <Button variant="primary" size="lg" style={{ alignSelf: 'flex-start' }} onClick={() => setPaso(2)}>Continuar</Button>
          </div>
        ) : null}

        {paso === 2 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <window.Field label="Pega aquí el mensaje de email o WhatsApp">
              <textarea
                value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={7}
                placeholder="Pega el texto tal como lo recibiste. No hace falta limpiarlo."
                style={{ width: '100%', padding: '13px 15px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)' }}
              />
            </window.Field>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              <Button variant="ghost" size="lg" onClick={() => setPaso(1)}>Atrás</Button>
              <Button variant="secondary" size="lg" onClick={() => setMensaje(p.mensaje)}>Usar mensaje de ejemplo</Button>
              <div style={{ flex: 1, minWidth: 12 }} />
              <Button variant="primary" size="lg" iconLeft={analizando ? 'loader' : 'sparkles'} disabled={!mensaje.trim() || analizando} onClick={analizar}>
                {analizando ? 'Extrayendo datos…' : 'Extraer datos'}
              </Button>
            </div>
          </div>
        ) : null}

        {paso === 3 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              Revisa y corrige lo que extrajo la IA antes de continuar.
            </p>
            {eventos.map((e, i) => (
              <Card key={i} padding="var(--space-lg)" tone="row" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 'var(--space-lg)' }}>
                  <TextField label="Proyecto" value={e.proyecto} onChange={(v) => setEv(i, 'proyecto', v.target.value)} />
                  <TextField label="Cliente" value={e.cliente} onChange={(v) => setEv(i, 'cliente', v.target.value)} />
                  <TextField label="Fecha de inicio" value={e.fecha} onChange={(v) => setEv(i, 'fecha', v.target.value)} />
                  <TextField label="Fecha de fin" value={e.fin} onChange={(v) => setEv(i, 'fin', v.target.value)} />
                  <TextField label="Locación" value={e.locacion} onChange={(v) => setEv(i, 'locacion', v.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 11, padding: 'var(--space-md) var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)' }}>
                  <Icon name="sparkles" size={15} color="var(--accent)" />
                  <div style={{ minWidth: 0 }}>
                    <div className="sn-eyebrow" style={{ marginBottom: 4 }}>Nota de la IA</div>
                    <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{e.notaIA}</p>
                  </div>
                </div>
              </Card>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <Button variant="ghost" size="lg" onClick={() => setPaso(2)}>Atrás</Button>
              <div style={{ flex: 1 }} />
              <Button variant="primary" size="lg" onClick={() => setPaso(4)}>Continuar</Button>
            </div>
          </div>
        ) : null}

        {paso === 4 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <Card padding="0" tone="row">
              <DataTable
                minWidth={0}
                columns={[
                  { key: 'proyecto', label: 'Proyecto', width: '1.4fr', strong: true },
                  { key: 'cliente', label: 'Cliente', width: '1fr' },
                  { key: 'fecha', label: 'Evento', width: '1.2fr', render: (e) => e.fecha + ' — ' + e.fin },
                  { key: 'locacion', label: 'Locación', width: '1.4fr' },
                ]}
                rows={eventos}
              />
            </Card>
            <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
              Se creará {eventos.length === 1 ? 'una cotización en borrador' : eventos.length + ' cotizaciones en borrador'} con estos datos. Las partidas se capturan después, en el Cotizador.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <Button variant="ghost" size="lg" onClick={() => setPaso(3)}>Atrás</Button>
              <div style={{ flex: 1 }} />
              <Button variant="primary" size="lg" iconLeft="check" onClick={() => { setToast({ msg: 'Se creó la cotización SH016 en borrador.', link: 'Abrir SH016' }); setPaso(1); setMensaje(''); setEventos([]); }}>
                Convertir en cotización
              </Button>
            </div>
          </div>
        ) : null}
      </window.Panel>

      <window.Toast onClose={() => setToast(null)} link={toast && toast.link}>{toast && toast.msg}</window.Toast>
    </React.Fragment>
  );
}

Object.assign(window, { PlaneacionScreen });
