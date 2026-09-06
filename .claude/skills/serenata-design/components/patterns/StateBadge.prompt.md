Badge de estado para todo lo que no sea una cotización (para cotizaciones usa StatusBadge directo).

```jsx
<StateBadge state="RODAJE" />
<StateBadge state="VENCIDO" />
<StateBadge state="validado" />
```

- Para agregar un estado, súmalo a `STATE_MAP` mapeándolo a uno de los cuatro tonos existentes. No inventes colores nuevos.
- RODAJE y POSTPRODUCCIÓN comparten el tono azul a propósito: la distinción la carga el encabezado de columna del tablero.
