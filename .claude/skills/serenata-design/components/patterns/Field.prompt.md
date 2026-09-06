Par etiqueta + valor para los bloques de datos generales de cualquier detalle.

```jsx
<Field label="Cliente" nowrapLabel>
  <input value={cliente} onChange={onChange} />
</Field>
<Field label="Fecha de cotización" value="02 abr 2025" nowrapLabel />
```

- Usa `nowrapLabel` cuando varios Field van en una fila: si una etiqueta se parte, su valor baja una línea y rompe la alineación.
- En una fila, dale a cada Field un ancho mínimo de 130px; es lo que mide la etiqueta más larga del producto.
