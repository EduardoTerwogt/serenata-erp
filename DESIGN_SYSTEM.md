# Serenata ERP — Design System
## UI/UX Profesional para Audiovisual

---

## 📋 Visión General

Este design system implementa principios de **UI UX Pro Max** adaptados para la industria audiovisual/filmográfica. Proporciona componentes reutilizables, patrones UX coherentes y una paleta de colores profesional.

**Stack:** Next.js 16 + React 19 + Tailwind CSS v4 + TypeScript

---

## 🎨 Paleta de Colores

### Colores Primarios
- **Naranja Serenata** (`#f97316`): Acento principal, energía y creatividad
- **Azul Profesional** (`#0ea5e9`): Confianza y estabilidad
- **Gris Cinematográfico** (`#0a0a0a` → `#fafafa`): Base tema oscuro

### Uso en Componentes
```
Primary Button → Naranja Serenata (CTA principal)
Secondary Button → Azul Profesional (Acciones secundarias)
States → Verde (éxito), Rojo (error), Amarillo (warning)
Backgrounds → Grises oscuros cinematográficos
```

---

## 📝 Tipografía

### Fuentes
- **Inter** (Regular): Interfaz, body text, data
- **Poppins** (Display): Títulos, headings, logos
- **Source Code Pro** (Mono): Código, moneda, números

### Escala Tipográfica
- `text-xs`: 0.75rem (etiquetas, helper text)
- `text-sm`: 0.875rem (descripción, metadata)
- `text-base`: 1rem (body text)
- `text-lg`: 1.125rem (subtítulos)
- `text-xl`: 1.25rem (headings nivel 3)
- `text-2xl`: 1.5rem (headings nivel 2)
- `text-3xl`: 1.875rem (headings nivel 1)

---

## 🧩 Componentes

### Button
Componente versátil con múltiples variantes.

```tsx
import { Button } from '@/components/ui/Button'

<Button variant="primary" size="md">Acción</Button>
<Button variant="secondary" size="sm">Cancelar</Button>
<Button variant="ghost" isLoading>Guardando...</Button>
<Button variant="destructive">Eliminar</Button>
```

**Variantes:**
- `primary`: Acción principal (naranja)
- `secondary`: Acción secundaria
- `accent`: Acción destacada (naranja oscuro)
- `success`: Acción exitosa (verde)
- `destructive`: Acción destructiva (rojo)
- `ghost`: Sin borde, mínimo
- `glass`: Glassmorphism (frosted glass)
- `outline`: Borde solo

**Tamaños:** `xs`, `sm`, `md`, `lg`, `xl`, `icon`, `icon-sm`, `icon-lg`

### Input
Campo de entrada con validación visual y ayuda.

```tsx
import { Input } from '@/components/ui/Input'

<Input 
  label="Nombre del proyecto"
  placeholder="Ej: Cortometraje 2026"
  error={errors?.name}
  required
/>
```

**Props:**
- `label`: Etiqueta del campo
- `description`: Texto descriptivo
- `error`: Mensaje de error (activa estilo rojo)
- `helper`: Texto de ayuda
- `icon`: Ícono a la izquierda
- `required`: Marca campo requerido

### Badge
Etiqueta para estados, categorías y tags.

```tsx
import { Badge } from '@/components/ui/Badge'

<Badge variant="success">En Producción</Badge>
<Badge variant="warning" removable onRemove={() => {}}>4K</Badge>
```

**Variantes:** `default`, `primary`, `success`, `warning`, `error`, `info`, `accent`, `outline`

### Alert
Mensaje de estado o notificación.

```tsx
import { Alert } from '@/components/ui/Alert'

<Alert variant="success" title="¡Guardado!" closeable>
  Los cambios se guardaron correctamente.
</Alert>
```

**Variantes:** `default`, `success`, `warning`, `error`, `info`, `primary`

### SectionCard
Contenedor de sección con encabezado opcional.

```tsx
import { SectionCard } from '@/components/ui/SectionCard'

<SectionCard 
  title="Información General" 
  description="Detalles del proyecto"
  actions={<Button>Editar</Button>}
>
  {/* contenido */}
</SectionCard>
```

---

## ✨ Efectos Visuales

### Glassmorphism
Efecto de cristal esmerilado para profundidad.

```tsx
className="bg-white/10 backdrop-blur-lg border border-white/20"
```

### Elevación (Sombras)
Jerarquía visual mediante sombras.

```
--shadow-elevation-1: 0 1px 3px
--shadow-elevation-2: 0 4px 6px
--shadow-elevation-3: 0 10px 15px
--shadow-elevation-4: 0 20px 25px
```

### Transiciones
Animaciones ágiles y suaves.

```
--transition-fast: 150ms
--transition-base: 200ms
--transition-smooth: 300ms
```

---

## 🎯 Patrones UX para ERP

### 1. Estados Visuales Claros
- **Activo**: Fondo + color de acento + sombra glow
- **Hover**: Cambio de fondo + cursor pointer
- **Focus**: Ring de 2px + offset
- **Disabled**: Opacity 50% + cursor not-allowed

### 2. Validación en Tiempo Real
- Borde rojo para errores
- Ring rojo en focus
- Ícono de error + mensaje debajo del campo

### 3. Feedback Visual
- Loading spinner en botones
- Badges para estados
- Alerts para confirmaciones

### 4. Accesibilidad
- Contraste ≥ 4.5:1
- Focus indicators visibles
- Labels semánticos
- ARIA donde sea necesario

---

## 🔧 Utilities

### `cn()` — Merge de clases Tailwind
```tsx
import { cn } from '@/lib/utils'

className={cn(
  'base-classes',
  condition && 'conditional-classes',
  customClassName
)}
```

---

## 🌙 Modo Oscuro
El sistema está optimizado para **tema oscuro cinematográfico**. Las CSS variables se definen en `app/globals.css`:

```css
:root {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --color-primary-500: #f97316;
  --color-secondary-500: #0ea5e9;
}
```

---

## 📱 Responsivo
Todos los componentes son mobile-first con breakpoints:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

---

## 🚀 Buenas Prácticas

1. **Usa componentes**, no clases inline
2. **Respeta la escala tipográfica**
3. **Mantén coherencia en espaciados** (scale de 4px)
4. **Evita colores arbitrarios** — usa la paleta
5. **Asegura accesibilidad** — contrast + focus states
6. **Test en mobile y desktop**
7. **Documenta cambios** en este archivo

---

## 📚 Referencias

- [Tailwind CSS v4](https://tailwindcss.com/)
- [Class Variance Authority](https://cva.style/)
- [Lucide React Icons](https://lucide.dev/)
- UI UX Pro Max Principles: Glassmorphism, Claymorphism, Design Systems

---

**Última actualización:** April 9, 2026
**Principios:** UI UX Pro Max, ERP best practices, Professional Cinematography aesthetic
