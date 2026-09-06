Pill tabs above a table. The active pill is solid brand orange; inactive pills are plain muted text with no track.

```jsx
<FilterTabs value={tab} onChange={setTab}
  tabs={[{ id: 'all', label: 'Todas', count: 128 }, { id: 'draft', label: 'Borrador' }]} />
```

No underline, no border, no background container — spacing alone separates the pills.
