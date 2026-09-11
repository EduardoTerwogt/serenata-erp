---
paths:
  - "app/**/*.tsx"
  - "components/**"
  - "hooks/**"
---

- Usar los tokens de `app/globals.css`: `bg-app`, `bg-surface`, `bg-row`,
  `text-content`, `text-body`, `border-hairline`, `rounded-panel`, `sn-label`,
  acento `#FF5A1A`.
- **No usar `gray-*`, `#f97316` ni el azul secundario** — son del estilo anterior.
- Pantallas que siguen en estilo viejo a propósito (no romperlas al pasar cerca):
  `app/login/page.tsx`, `app/admin/sheets/page.tsx`, los primitivos
  `components/ui/*` y `app/components/ui/Skeleton*`. Ver `DESIGN_SYSTEM.md`.
- Formularios: react-hook-form + resolvers de Zod. `useQuotationForm` cachea
  catálogos a nivel módulo (TTL 5 min).
- Las llamadas al servidor pasan por `lib/client/api.ts` — no duplicar el manejo de
  errores, JSON, FormData o binario en cada hook.
- No meter lógica de datos en páginas si cabe en un hook, servicio o repositorio.
- Extraer primitivos de UI solo ante repetición real, no por anticipación.
- La especificación visual completa vive en el skill `.claude/skills/serenata-design/`:
  se copian los valores, no los componentes.
