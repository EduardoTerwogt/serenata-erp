Contenedor de sección con encabezado y acciones: envuelve tablas, formularios y cualquier bloque que necesite título dentro de una vista.

```jsx
<Panel title="Partidas" action={<Button variant="secondary" size="md">Agregar</Button>}>
  <DataTable columns={columns} rows={rows} />
</Panel>
```

- `padding="0"` cuando el contenido es una tabla: las filas traen su propio padding horizontal.
- `eyebrow` para la unidad o el contexto del dato ("Miles de pesos").
- El grupo de `action` envuelve a una segunda línea en anchos chicos; no le pongas ancho fijo.
