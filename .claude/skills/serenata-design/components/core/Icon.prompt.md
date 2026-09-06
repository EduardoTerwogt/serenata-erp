Renders a Lucide outline icon inline; use it anywhere the UI needs a glyph (search, chevrons, nav, row actions).

```jsx
<Icon name="search" size={18} />
<Icon name="chevron-down" size={16} color="var(--text-muted)" />
```

Requires the Lucide UMD script on the page:
`<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>`.
The icon paints as soon as the global resolves, so it is safe to render before the script finishes loading.
Sizes in use: 16 (table rows), 18 (buttons, inputs), 20 (sidebar nav).
