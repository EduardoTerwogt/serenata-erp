Gráfica de barras para balances por periodo. Toda gráfica del sistema navega a su sección de detalle.

```jsx
<Panel title="Balance por periodo" eyebrow="Miles de pesos" action={<ChartLegend />}>
  <BarChart data={balance} onBarClick={() => go('cuentas')} format={(v) => '$ ' + v + 'k'} />
</Panel>
```

- Máximo dos series. Con una sola, usa `var(--accent)`.
- Sin eje Y, sin cuadrícula, sin etiquetas sobre las barras: el detalle vive en el tooltip.
