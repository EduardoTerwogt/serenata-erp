The brand action button — orange primary CTA, quiet secondary for toolbars, ghost for tertiary text actions.

```jsx
<Button variant="primary" size="lg" iconLeft="plus">Nueva cotización</Button>
<Button variant="secondary" size="md" iconRight="chevron-down">Exportar</Button>
```

One primary per view. The primary label is semibold; secondary and ghost stay medium. Hover darkens orange to `--accent-pressed`; there is no scale or shadow on press. Labels are sentence case in Spanish.
