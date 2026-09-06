Detalle, editor o confirmación sobre la vista actual.

```jsx
<Modal
  title="Cancelar cotización" eyebrow="SH014" width={520} onClose={close}
  footer={<><div style={{ flex: 1 }} /><Button variant="ghost" size="lg" onClick={close}>Mantener</Button><Button variant="primary" size="lg">Sí, cancelar</Button></>}
>
  <p>Se borra el proyecto y todas las cuentas ligadas a él.</p>
</Modal>
```

- Anchos: 480–520 confirmaciones, 720–880 detalle, 980–1000 editores con tabla.
- Clic en el scrim cierra. Toda acción destructiva nombra lo que se borra.
- Dentro, usa `FilterTabs` para las pestañas del modal.
