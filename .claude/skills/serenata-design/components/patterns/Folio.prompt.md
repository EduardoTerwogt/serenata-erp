Identificador tipo código. Úsalo en toda columna de folio y en los encabezados de detalle.

```jsx
{ key: 'folio', label: 'Folio', width: '90px', render: (r) => <Folio>{r.folio}</Folio> }
```

- El sistema no tiene familia monoespaciada: el efecto de "código" lo dan la display face y el tracking, no una fuente mono.
- `size={12} color="var(--text-faint)"` cuando el folio es secundario dentro de una tarjeta.
