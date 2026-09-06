Tarjeta de KPI para encabezar una vista con cifras: dashboard, tabs de Cuentas, resúmenes de periodo.

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 'var(--space-lg)' }}>
  <Metric label="Por cobrar" value="$ 1,966,500" nota="4 cuentas abiertas" accent onClick={() => go('cuentas')} />
  <Metric label="Por pagar" value="$ 252,000" nota="4 responsables" />
</div>
```

- Ponlas en un grid `auto-fit` con mínimo de 180px; no les pongas `min-width` propio.
- `accent` solo en la métrica principal de la fila.
