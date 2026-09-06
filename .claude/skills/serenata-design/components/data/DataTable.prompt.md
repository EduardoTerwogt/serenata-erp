List table for quotes, clients and any other record list.

```jsx
<DataTable
  columns={[
    { key: 'folio', label: 'Folio', width: '140px', strong: true },
    { key: 'cliente', label: 'Cliente', width: '1.6fr' },
    { key: 'estatus', label: 'Estatus', width: '150px', render: (r) => <StatusBadge status={r.estatus} /> },
    { key: 'total', label: 'Total', width: '140px', align: 'right' },
  ]}
  rows={rows} onRowClick={openQuote}
/>
```

Non-fixed `width` tracks become `minmax(0, …)` and cells truncate with an ellipsis; below `minWidth` (1000px default) the table scrolls horizontally instead of collapsing. No zebra striping and no rules between rows — 6px of gap plus a one-step tone lift on hover does the separating. Pair with `TableFooter`.
