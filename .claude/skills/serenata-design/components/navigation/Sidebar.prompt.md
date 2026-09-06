The product's fixed 320px left rail: brand mark, label-only nav list, brand-texture glow bleeding through a blurred scrim.

```jsx
<Sidebar items={[{ id: 'inicio', label: 'Inicio' }, { id: 'cotizaciones', label: 'Cotizaciones' }]}
  activeId="cotizaciones" onSelect={setView} />
```

Nav items carry no icons. The bottom of the rail stays empty (a settings action may live there later) — the old tagline/version lockup was removed.
