Loader de marca para esperas largas: inicio de sesión y cambio de sección con mucha información. No lo uses para botones ni estados inline cortos — para eso ya existe el icono "loader" de `Icon`.

```jsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
  <SplashMark size={200} />
  <div className="sn-eyebrow">Cargando sección…</div>
</div>
```

- El glifo es el mismo placeholder tipográfico que `Wordmark` variant="mark". Cuando llegue el isotipo real, sustituye el carácter "S" por el SVG y conserva la capa de degradado sobre el glifo — es agnóstica a la forma.
- La animación: la "S" está en blanco y una franja con los colores de la textura de marca (naranja, rojo, teal, azul) la recorre de punta a punta, dejándola en blanco otra vez entre cada pasada. Es un loop continuo — móntalo solo mientras dura la espera real y desmóntalo al terminar.
- Tamaño grande (200) para pantalla completa (login); 120–140 dentro de un panel o sección.
