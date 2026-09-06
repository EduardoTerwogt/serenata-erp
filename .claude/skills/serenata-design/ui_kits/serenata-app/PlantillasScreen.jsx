/* 8 · Plantillas de Servicios. Grilla con preview de los primeros items y un
   editor con la misma tabla editable que usan las partidas de una cotización.
   Fase 5 no cambia el fondo de esta pantalla.

   Pendiente confirmar con el dueño del producto: hoy la integración de
   plantillas con cotizaciones complementarias es parcial. */
const { Button, Card, Icon, Select, SearchInput, TextField, SectionHero } = window.SerenataDesignSystem_993393;

const SN5_GRID_ITEMS = '112px minmax(0,1.7fr) 62px 118px minmax(0,1fr) 118px 34px';

function ItemsEditor({ items, onChange }) {
  const II = window.InlineInput;
  const set = (i, k, v) => onChange(items.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 880 }}>
        <div style={{ display: 'grid', gridTemplateColumns: SN5_GRID_ITEMS, gap: 'var(--space-md)', padding: '13px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-table-head)', fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          <div>Categoría</div><div>Descripción</div><div style={{ textAlign: 'right' }}>Cant.</div>
          <div style={{ textAlign: 'right' }}>P. unitario</div><div>Responsable</div><div style={{ textAlign: 'right' }}>X pagar</div><div />
        </div>
        {items.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: SN5_GRID_ITEMS, gap: 'var(--space-md)', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <Select size="sm" value={p.categoria} onChange={(e) => set(i, 'categoria', e.target.value)} options={window.SN5_CATEGORIAS} style={{ width: '100%' }} />
            <II value={p.descripcion} onChange={(v) => set(i, 'descripcion', v)} suggestions={window.SN5_CATALOGO} placeholder="Buscar en catálogo…" />
            <II value={p.cantidad} onChange={(v) => set(i, 'cantidad', v)} align="right" />
            <II value={p.precio} onChange={(v) => set(i, 'precio', v)} align="right" />
            <II value={p.responsable} onChange={(v) => set(i, 'responsable', v)} suggestions={window.SN5_RESPONSABLES} placeholder="Asignar…" />
            <II value={p.xPagar} onChange={(v) => set(i, 'xPagar', v)} align="right" />
            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar item" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-faint)', padding: 5 }}><Icon name="trash-2" size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlantillaEditor({ t, onClose, nueva }) {
  const [nombre, setNombre] = React.useState(t ? t.nombre : '');
  const [descripcion, setDescripcion] = React.useState(t ? t.descripcion : '');
  const [items, setItems] = React.useState(t ? t.items.map((x) => ({ ...x })) : []);
  const [error, setError] = React.useState('');
  const subtotal = items.reduce((a, x) => a + (parseFloat(x.cantidad) || 0) * (parseFloat(x.precio) || 0), 0);

  const guardar = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    onClose();
  };

  return (
    <window.Modal
      title={nueva ? 'Nueva plantilla' : nombre} eyebrow="Plantillas de servicios" width={1000} onClose={onClose}
      footer={(
        <React.Fragment>
          <div style={{ minWidth: 0 }}>
            <div className="sn-label">Subtotal de la plantilla</div>
            <div className="sn-display" style={{ fontSize: 'var(--text-h3)' }}>{window.SN5_MXN(subtotal)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="lg" onClick={guardar}>Guardar</Button>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 'var(--space-lg)' }}>
          <TextField label="Nombre · requerido" value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }} placeholder="Ej. Rodaje 2 días · foro" hint={error} />
          <TextField label="Descripción · opcional" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Cuándo conviene usar esta plantilla" />
        </div>

        <div>
          <div className="sn-label" style={{ marginBottom: 'var(--space-sm)' }}>Items</div>
          <ItemsEditor items={items} onChange={setItems} />
          <Button variant="ghost" size="md" iconLeft="plus" style={{ marginTop: 'var(--space-md)' }} onClick={() => setItems([...items, { categoria: 'Producción', descripcion: '', cantidad: 1, precio: 0, responsable: '', xPagar: 0 }])}>
            Agregar item
          </Button>
        </div>
      </div>
    </window.Modal>
  );
}

function PlantillasScreen() {
  const [plantillas, setPlantillas] = React.useState(window.SN5.plantillas);
  const [q, setQ] = React.useState('');
  const [editar, setEditar] = React.useState(null);
  const [nueva, setNueva] = React.useState(false);
  const [borrar, setBorrar] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const rows = plantillas.filter((t) => !q.trim() || t.nombre.toLowerCase().includes(q.trim().toLowerCase()));

  const duplicar = (t) => {
    setPlantillas([...plantillas, { ...t, nombre: t.nombre + ' (copia)' }]);
    setToast({ msg: 'Se duplicó "' + t.nombre + '".' });
  };

  return (
    <React.Fragment>
      <SectionHero
        title="Plantillas"
        action={<Button variant="primary" size="lg" iconLeft="plus" onClick={() => setNueva(true)}>Nueva plantilla</Button>}
      />

      <SearchInput size="lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" style={{ alignSelf: 'flex-start', width: '100%', maxWidth: 420 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 'var(--space-lg)' }}>
        {rows.map((t, idx) => (
          <Card key={t.nombre + idx} padding="0" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', lineHeight: 'var(--lh-snug)' }}>{t.nombre}</div>
              {t.descripcion ? <p style={{ margin: '7px 0 0', fontSize: 'var(--text-md)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{t.descripcion}</p> : null}
            </div>

            <div style={{ flex: 1, padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 11 }}>
              {t.items.slice(0, 3).map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-md)', fontSize: 'var(--text-base)', minWidth: 0 }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descripcion}</span>
                  <span style={{ color: 'var(--text-muted)', flex: 'none' }}>{window.SN5_MXN(it.precio)}</span>
                </div>
              ))}
              {t.items.length > 3 ? (
                <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>+{t.items.length - 3} más</div>
              ) : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <Button variant="secondary" size="md" onClick={() => setEditar(t)}>Editar</Button>
              <Button variant="ghost" size="md" iconLeft="copy" onClick={() => duplicar(t)}>Duplicar</Button>
              <div style={{ flex: 1, minWidth: 8 }} />
              <button type="button" onClick={() => setBorrar(t)} aria-label={'Eliminar ' + t.nombre} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-faint)', padding: 6, display: 'flex' }}>
                <Icon name="trash-2" size={16} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {editar ? <PlantillaEditor t={editar} onClose={() => setEditar(null)} /> : null}
      {nueva ? <PlantillaEditor nueva onClose={() => setNueva(false)} /> : null}

      {borrar ? (
        <window.Modal
          title="Eliminar plantilla" eyebrow={borrar.nombre} width={480} onClose={() => setBorrar(null)}
          footer={(
            <React.Fragment>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" size="lg" onClick={() => setBorrar(null)}>Mantener</Button>
              <Button variant="primary" size="lg" onClick={() => { setPlantillas(plantillas.filter((x) => x !== borrar)); setBorrar(null); setToast({ msg: 'Plantilla eliminada.' }); }}>Sí, eliminar</Button>
            </React.Fragment>
          )}
        >
          <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)' }}>
            Se eliminan los {borrar.items.length} items de esta plantilla. Las cotizaciones que ya la usaron conservan sus partidas.
          </p>
        </window.Modal>
      ) : null}

      <window.Toast onClose={() => setToast(null)}>{toast && toast.msg}</window.Toast>
    </React.Fragment>
  );
}

Object.assign(window, { PlantillasScreen, ItemsEditor });
